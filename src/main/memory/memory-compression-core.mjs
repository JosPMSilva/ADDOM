import { resolveModelContextLimit } from '../api-clients/model-context-limits.mjs'
import { estimateTextTokens } from '../chat/token-utils.mjs'

export const MAX_LOG_CONTENT = 800
export const DEFAULT_SUMMARY_WORD_LIMIT = 500

function truncate(str, maxLen) {
  const s = String(str ?? '')
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s
}

function estimateTokensFromText(text) {
  return estimateTextTokens(text)
}

function formatLogForPrompt(n) {
  const body = truncate(String(n.content || '').replace(/\s+/g, ' ').trim(), MAX_LOG_CONTENT)
  return `[#${n.sortId}] topic: ${n.topic}\nsource: ${n.source}\ncontent: ${body}`
}

function buildLogsForPrompt(nodes) {
  return nodes.map(formatLogForPrompt).join('\n\n')
}

export function buildCompressionMessages(nodes, { summaryWordLimit = DEFAULT_SUMMARY_WORD_LIMIT } = {}) {
  const safeWordLimit = Math.max(120, Math.min(1000, Math.round(Number(summaryWordLimit || DEFAULT_SUMMARY_WORD_LIMIT))))
  return [
    {
      role: 'system',
      content: [
        'You summarize project memory logs for later retrieval.',
        'Return concise markdown with sections: Summary, Key Decisions, File Changes, Errors, Follow-ups.',
        'Reference individual items by their [#ID] markers when useful.',
        'Do not invent facts.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Summarize these ${nodes.length} memory logs into a compact project memory snapshot.`,
        `Keep it under ${safeWordLimit} words.`,
        '',
        buildLogsForPrompt(nodes),
      ].join('\n'),
    },
  ]
}

function estimateCompressionPromptTokens(nodes, options = {}) {
  const messages = buildCompressionMessages(nodes, options)
  return messages.reduce((sum, m) => sum + estimateTokensFromText(m.content), 0)
}

export function planCompressionBatch({
  providerId = '',
  model = '',
  nodes = [],
  resolveContextLimit = resolveModelContextLimit,
} = {}) {
  const rows = Array.isArray(nodes) ? nodes : []
  const modelContext = typeof resolveContextLimit === 'function'
    ? resolveContextLimit(providerId, model || '')
    : resolveModelContextLimit(providerId, model || '')
  const contextLimitTokens = Math.max(8_000, Number(modelContext?.limitTokens || 0) || 128_000)
  const maxOutputTokens = Number.isFinite(Number(modelContext?.maxOutputTokens))
    ? Math.max(1, Math.round(Number(modelContext.maxOutputTokens)))
    : null
  const ratioOutputReserve = Math.max(512, Math.floor(contextLimitTokens * 0.2))
  const outputReserveTokens = maxOutputTokens != null
    ? Math.max(256, Math.min(ratioOutputReserve, maxOutputTokens))
    : ratioOutputReserve
  const safetyReserveTokens = Math.max(256, Math.floor(contextLimitTokens * 0.03))
  const promptBudgetTokens = Math.max(
    768,
    Math.min(
      Math.floor(contextLimitTokens * 0.8),
      contextLimitTokens - outputReserveTokens - safetyReserveTokens,
    ),
  )
  const summaryWordLimit = Math.max(
    120,
    Math.min(
      DEFAULT_SUMMARY_WORD_LIMIT,
      Math.floor(outputReserveTokens * 0.65),
    ),
  )

  if (!rows.length) {
    return {
      selectedNodes: [],
      batches: [],
      telemetry: {
        contextLimitTokens,
        maxOutputTokens,
        modelContextSource: String(modelContext?.source || 'estimated'),
        promptBudgetTokens,
        outputReserveTokens,
        safetyReserveTokens,
        summaryWordLimit,
        estimatedPromptTokens: 0,
        selectedBatchSize: 0,
        plannedBatchCount: 0,
        batchSplitApplied: false,
      },
    }
  }

  const batches = []
  let current = []
  for (const node of rows) {
    const next = [...current, node]
    const nextEstimate = estimateCompressionPromptTokens(next, { summaryWordLimit })
    if (current.length > 0 && nextEstimate > promptBudgetTokens) {
      batches.push(current)
      current = [node]
      continue
    }
    current = next
  }
  if (current.length > 0) batches.push(current)
  if (!batches.length && rows.length > 0) batches.push([rows[0]])

  const selectedNodes = batches[0] || []
  const estimatedPromptTokens = estimateCompressionPromptTokens(selectedNodes, { summaryWordLimit })
  return {
    selectedNodes,
    batches,
    telemetry: {
      contextLimitTokens,
      maxOutputTokens,
      modelContextSource: String(modelContext?.source || 'estimated'),
      promptBudgetTokens,
      outputReserveTokens,
      safetyReserveTokens,
      summaryWordLimit,
      estimatedPromptTokens,
      selectedBatchSize: selectedNodes.length,
      plannedBatchCount: batches.length,
      batchSplitApplied: batches.length > 1,
    },
  }
}

export function buildFallbackSummary(nodes) {
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const decisionLines = []
  const errorLines = []
  const writeLines = []

  for (const n of nodes) {
    const text = `${n.topic} ${n.content}`.toLowerCase()
    const line = `- [#${n.sortId}] ${truncate(n.topic, 120)}`

    if (text.includes('error') || n.tags?.includes('error')) {
      errorLines.push(line)
      continue
    }
    if (text.includes('wrote:') || text.includes('file written')) {
      writeLines.push(line)
      continue
    }
    decisionLines.push(line)
  }

  const sections = [
    `Compressed logs #${first.sortId} to #${last.sortId} (${nodes.length} entries).`,
    '',
    'Key decisions:',
    ...(decisionLines.slice(0, 8).length ? decisionLines.slice(0, 8) : ['- No clear decisions detected.']),
    '',
    'File changes:',
    ...(writeLines.slice(0, 8).length ? writeLines.slice(0, 8) : ['- No file writes captured in this batch.']),
    '',
    'Errors:',
    ...(errorLines.slice(0, 8).length ? errorLines.slice(0, 8) : ['- No errors recorded in this batch.']),
  ]
  return sections.join('\n')
}

export async function executeCompressionArchiveBatch({
  project,
  scope = 'project',
  threadId = '',
  providerId,
  apiKey,
  model,
  candidates = [],
  candidateCount = 0,
  batchSize = 0,
  abortSignal = null,
  summarize = null,
  addNode,
  markNodesCompressed,
  resolveContextLimit = resolveModelContextLimit,
  isAbortError = null,
} = {}) {
  const plannedBatch = planCompressionBatch({
    providerId,
    model,
    nodes: candidates,
    resolveContextLimit,
  })
  const selectedCandidates = Array.isArray(plannedBatch.selectedNodes) && plannedBatch.selectedNodes.length > 0
    ? plannedBatch.selectedNodes
    : (Array.isArray(candidates) ? candidates : [])
  const telemetry = plannedBatch.telemetry || {}

  const first = selectedCandidates[0]
  const last = selectedCandidates[selectedCandidates.length - 1]
  if (!first || !last) {
    return {
      status: 'skipped',
      reason: 'threshold_not_reached',
      batchSize,
      candidateCount,
    }
  }

  let summary = ''
  if (typeof summarize === 'function') {
    try {
      summary = await summarize({
        providerId,
        apiKey,
        model,
        nodes: selectedCandidates,
        abortSignal,
        summaryWordLimit: Number(telemetry.summaryWordLimit || DEFAULT_SUMMARY_WORD_LIMIT),
      })
    } catch (err) {
      if (typeof isAbortError === 'function' && isAbortError(err)) {
        throw err
      }
      summary = ''
    }
  }
  if (!summary) {
    summary = buildFallbackSummary(selectedCandidates)
  }

  const summaryNodeId = await addNode({
    project,
    topic: `Auto Summary #${first.sortId}-#${last.sortId}`,
    content: truncate(summary, 12000),
    tags: ['auto_summary', 'compressed_batch', `range:${first.sortId}-${last.sortId}`],
    source: 'auto_summary',
    dataPolicy: 'standard',
    scope,
    threadId: scope === 'thread' ? String(threadId || '').trim() || null : null,
    originThreadId: scope === 'thread' ? String(threadId || '').trim() || null : null,
  })
  const archivedCount = markNodesCompressed(selectedCandidates.map((n) => n.id), summaryNodeId)

  return {
    status: 'completed',
    summaryNodeId,
    archivedCount,
    rangeStart: first.sortId,
    rangeEnd: last.sortId,
    batchSize,
    candidateCount,
    plannedBatchCount: Number(telemetry.plannedBatchCount || 1),
    selectedBatchSize: Number(telemetry.selectedBatchSize || selectedCandidates.length || 0),
    estimatedPromptTokens: Number(telemetry.estimatedPromptTokens || 0),
    promptBudgetTokens: Number(telemetry.promptBudgetTokens || 0),
    outputReserveTokens: Number(telemetry.outputReserveTokens || 0),
    contextLimitTokens: Number(telemetry.contextLimitTokens || 0),
    maxOutputTokens: Number.isFinite(Number(telemetry.maxOutputTokens))
      ? Number(telemetry.maxOutputTokens)
      : null,
    modelContextSource: String(telemetry.modelContextSource || 'estimated'),
    batchSplitApplied: !!telemetry.batchSplitApplied,
    summaryWordLimit: Number(telemetry.summaryWordLimit || DEFAULT_SUMMARY_WORD_LIMIT),
    scope,
    threadId: scope === 'thread' ? String(threadId || '').trim() : '',
  }
}
