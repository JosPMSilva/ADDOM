import { estimateTextTokens } from '../chat/token-utils.mjs'
import {
  SCOPED_CONTEXT_DEFAULT_QUOTAS,
  normalizeMemoryScope,
  normalizeNullableText,
  normalizePositiveInteger,
} from './memory-store-helpers.mjs'
import { searchNodes } from './memory-store-search.mjs'

function buildContextHeaderLines({
  includeGlobal = false,
  includeThread = false,
} = {}) {
  const scopeLabel = includeThread
    ? (includeGlobal ? 'the current thread, this project, and global memory.' : 'the current thread and this project.')
    : (includeGlobal ? 'this project and global memory.' : 'this project.')
  return [
    `The following is relevant durable context from ${scopeLabel}`,
    'Use it silently to inform your responses. Do not repeat or quote it back to the user.',
  ]
}

function buildContextNodeLine(node = null) {
  const scope = normalizeMemoryScope(node?.scope, { isGlobal: node?.isGlobal === true })
  const scopeLabel = scope === 'thread'
    ? `Thread #${Number(node?.sortId || 0) || 0}`
    : scope === 'global'
      ? `Global #${Number(node?.sortId || 0) || 0}`
      : `#${Number(node?.sortId || 0) || 0}`
  return `- [${scopeLabel}] ${String(node?.topic || '').trim()}: ${String(node?.content || '').replace(/\n/g, ' ').slice(0, 600)}`
}

function buildContextText(rows = [], {
  includeGlobal = false,
  includeThread = false,
} = {}) {
  const lines = [...buildContextHeaderLines({ includeGlobal, includeThread }), '']
  for (const node of Array.isArray(rows) ? rows : []) {
    lines.push(buildContextNodeLine(node))
  }
  return lines.join('\n')
}

function buildMemoryDedupKey(node = null) {
  const topic = String(node?.topic || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const content = String(node?.content || '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (topic || content) return `${topic}::${content}`
  return String(node?.id || '').trim()
}

function createEmptyLaneNumberMap() {
  return { thread: 0, project: 0, global: 0 }
}

function countNodesByScope(rows = []) {
  const counts = createEmptyLaneNumberMap()
  for (const node of Array.isArray(rows) ? rows : []) {
    const scope = normalizeMemoryScope(node?.scope, { isGlobal: node?.isGlobal === true })
    if (Object.prototype.hasOwnProperty.call(counts, scope)) counts[scope] += 1
  }
  return counts
}

function estimateLaneTokensByScope(rows = []) {
  const totals = createEmptyLaneNumberMap()
  for (const node of Array.isArray(rows) ? rows : []) {
    const scope = normalizeMemoryScope(node?.scope, { isGlobal: node?.isGlobal === true })
    if (!Object.prototype.hasOwnProperty.call(totals, scope)) continue
    totals[scope] += estimateTextTokens(buildContextNodeLine(node))
  }
  return totals
}

function countPromotedNodesByScope(rows = []) {
  const counts = createEmptyLaneNumberMap()
  for (const node of Array.isArray(rows) ? rows : []) {
    if (!Number.isFinite(Number(node?.promotedAt)) || Number(node?.promotedAt) <= 0) continue
    const scope = normalizeMemoryScope(node?.scope, { isGlobal: node?.isGlobal === true })
    if (!Object.prototype.hasOwnProperty.call(counts, scope)) continue
    counts[scope] += 1
  }
  return counts
}

function normalizeScopedContextQuotas(quotas = {}) {
  const source = quotas && typeof quotas === 'object' ? quotas : {}
  return {
    thread: normalizePositiveInteger(source.thread, SCOPED_CONTEXT_DEFAULT_QUOTAS.thread),
    project: normalizePositiveInteger(source.project, SCOPED_CONTEXT_DEFAULT_QUOTAS.project),
    global: normalizePositiveInteger(source.global, SCOPED_CONTEXT_DEFAULT_QUOTAS.global),
  }
}

export async function buildContextBlock(project, queryText, topK = 8, { includeGlobal = false } = {}) {
  const payload = await buildContextPayload(project, queryText, topK, { includeGlobal })
  return payload.text
}

export async function buildScopedContextPayload({
  project = '',
  threadId = '',
  queryText = '',
  quotas = null,
  maxTokens = 0,
  includeGlobal = false,
} = {}) {
  const normalizedThreadId = normalizeNullableText(threadId)
  const normalizedQuotas = normalizeScopedContextQuotas(quotas)
  const threshold = 0.35
  const laneResults = {
    thread: [],
    project: [],
    global: [],
  }

  if (normalizedThreadId && normalizedQuotas.thread > 0) {
    laneResults.thread = await searchNodes(project, queryText, {
      topK: normalizedQuotas.thread,
      threshold,
      includeCompressed: false,
      includeDeletedThreads: false,
      scopeFilter: 'thread',
      threadId: normalizedThreadId,
    })
  }
  if (normalizedQuotas.project > 0) {
    laneResults.project = await searchNodes(project, queryText, {
      topK: normalizedQuotas.project,
      threshold,
      includeCompressed: false,
      includeDeletedThreads: false,
      scopeFilter: 'project',
    })
  }
  if (includeGlobal && normalizedQuotas.global > 0) {
    laneResults.global = await searchNodes(project, queryText, {
      topK: normalizedQuotas.global,
      threshold,
      includeCompressed: false,
      includeDeletedThreads: false,
      scopeFilter: 'global',
    })
  }

  const seen = new Set()
  const mergedNodes = []
  for (const laneName of ['thread', 'project', 'global']) {
    for (const node of laneResults[laneName]) {
      const dedupeKey = buildMemoryDedupKey(node)
      if (!dedupeKey || seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      mergedNodes.push(node)
    }
  }

  const includeThread = !!normalizedThreadId
  const estimatedTokensBeforeBudget = mergedNodes.length > 0
    ? estimateTextTokens(buildContextText(mergedNodes, { includeGlobal: !!includeGlobal, includeThread }))
    : 0
  const normalizedMaxTokens = normalizePositiveInteger(maxTokens, 0)
  let selectedNodes = [...mergedNodes]
  let text = selectedNodes.length > 0
    ? buildContextText(selectedNodes, { includeGlobal: !!includeGlobal, includeThread })
    : ''
  while (
    normalizedMaxTokens > 0
    && selectedNodes.length > 1
    && estimateTextTokens(text) > normalizedMaxTokens
  ) {
    selectedNodes.pop()
    text = buildContextText(selectedNodes, { includeGlobal: !!includeGlobal, includeThread })
  }

  const laneNodeCountsBeforeBudget = countNodesByScope(mergedNodes)
  const laneEstimatedTokensBeforeBudget = estimateLaneTokensByScope(mergedNodes)
  const laneNodeCounts = countNodesByScope(selectedNodes)
  const laneEstimatedTokens = estimateLaneTokensByScope(selectedNodes)
  const promotionCounts = countPromotedNodesByScope(selectedNodes)
  const estimatedTokens = text ? estimateTextTokens(text) : 0

  return {
    text,
    nodes: selectedNodes,
    diagnostics: {
      requestedTopK: normalizedQuotas.thread + normalizedQuotas.project + (includeGlobal ? normalizedQuotas.global : 0),
      includeGlobal: !!includeGlobal,
      includeThread,
      quotas: { ...normalizedQuotas },
      laneNodeCountsBeforeBudget,
      laneEstimatedTokensBeforeBudget,
      laneNodeCounts,
      laneEstimatedTokens,
      promotionCounts,
      nodeCountBeforeBudget: mergedNodes.length,
      nodeCount: selectedNodes.length,
      estimatedTokensBeforeBudget,
      estimatedTokens,
      maxTokens: normalizedMaxTokens,
      budgetReductionApplied: selectedNodes.length < mergedNodes.length || estimatedTokens < estimatedTokensBeforeBudget,
    },
  }
}

export async function buildContextPayload(project, queryText, topK = 8, {
  includeGlobal = false,
  maxTokens = 0,
} = {}) {
  const nodes = await searchNodes(project, queryText, {
    topK,
    threshold: 0.35,
    includeCompressed: false,
    includeDeletedThreads: false,
    includeGlobal: !!includeGlobal,
  })
  if (nodes.length === 0) {
    return {
      text: '',
      nodes: [],
      diagnostics: {
        requestedTopK: Number(topK || 0) || 0,
        includeGlobal: !!includeGlobal,
        includeThread: false,
        quotas: { thread: 0, project: Number(topK || 0) || 0, global: includeGlobal ? Number(topK || 0) || 0 : 0 },
        laneNodeCountsBeforeBudget: createEmptyLaneNumberMap(),
        laneEstimatedTokensBeforeBudget: createEmptyLaneNumberMap(),
        laneNodeCounts: createEmptyLaneNumberMap(),
        laneEstimatedTokens: createEmptyLaneNumberMap(),
        promotionCounts: createEmptyLaneNumberMap(),
        nodeCountBeforeBudget: 0,
        nodeCount: 0,
        estimatedTokensBeforeBudget: 0,
        estimatedTokens: 0,
        maxTokens: Number(maxTokens || 0) || 0,
        budgetReductionApplied: false,
      },
    }
  }

  const estimatedTokensBeforeBudget = estimateTextTokens(buildContextText(nodes, { includeGlobal: !!includeGlobal }))
  const normalizedMaxTokens = Number.isFinite(Number(maxTokens)) ? Math.max(0, Math.round(Number(maxTokens))) : 0
  let selectedNodes = [...nodes]
  let text = buildContextText(selectedNodes, { includeGlobal: !!includeGlobal })
  while (
    normalizedMaxTokens > 0
    && selectedNodes.length > 1
    && estimateTextTokens(text) > normalizedMaxTokens
  ) {
    selectedNodes.pop()
    text = buildContextText(selectedNodes, { includeGlobal: !!includeGlobal })
  }
  const estimatedTokens = estimateTextTokens(text)
  const laneNodeCountsBeforeBudget = countNodesByScope(nodes)
  const laneEstimatedTokensBeforeBudget = estimateLaneTokensByScope(nodes)
  const laneNodeCounts = countNodesByScope(selectedNodes)
  const laneEstimatedTokens = estimateLaneTokensByScope(selectedNodes)
  const promotionCounts = countPromotedNodesByScope(selectedNodes)

  return {
    text,
    nodes: selectedNodes,
    diagnostics: {
      requestedTopK: Number(topK || 0) || 0,
      includeGlobal: !!includeGlobal,
      includeThread: false,
      quotas: { thread: 0, project: Number(topK || 0) || 0, global: includeGlobal ? Number(topK || 0) || 0 : 0 },
      laneNodeCountsBeforeBudget,
      laneEstimatedTokensBeforeBudget,
      laneNodeCounts,
      laneEstimatedTokens,
      promotionCounts,
      nodeCountBeforeBudget: nodes.length,
      nodeCount: selectedNodes.length,
      estimatedTokensBeforeBudget,
      estimatedTokens,
      maxTokens: normalizedMaxTokens,
      budgetReductionApplied: selectedNodes.length < nodes.length || estimatedTokens < estimatedTokensBeforeBudget,
    },
  }
}
