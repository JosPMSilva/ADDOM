import { nodeKey, presentationKey, scopeKey, TERMINAL_STATUSES } from './agent-run-normalizers.mjs'

export const ATTENTION_PRIORITY = Object.freeze({
  approval_required: 5,
  failed: 4,
  waiting: 3,
  paused: 2,
  cancelling: 1,
})

function children(state, runId, nodeId) {
  return (state.childIdsByParent[nodeKey(runId, nodeId)] || [])
    .map((id) => state.nodesById[id])
    .filter(Boolean)
}

function descendants(state, runId, nodeId) {
  const result = []
  const stack = [...children(state, runId, nodeId)].reverse()
  while (stack.length > 0) {
    const node = stack.pop()
    result.push(node)
    stack.push(...children(state, runId, node.id).reverse())
  }
  return result
}

export function selectAgentDescendantSummary(state, runId, nodeId) {
  const rows = descendants(state, runId, nodeId)
  const result = {
    total: rows.length,
    active: 0,
    completed: 0,
    failed: 0,
    attentionStatus: null,
  }
  let highest = 0
  for (const row of rows) {
    if (row.status === 'completed') result.completed += 1
    if (row.status === 'failed') result.failed += 1
    if (!TERMINAL_STATUSES.has(row.status)) result.active += 1
    const priority = ATTENTION_PRIORITY[row.status] || 0
    if (priority > highest) {
      highest = priority
      result.attentionStatus = row.status
    }
  }
  return result
}

/**
 * Header-trigger state taken from the canonical agent graph rather than the legacy delegation
 * projection, so the trigger tells the truth for every run in the thread including nested agents.
 */
export function selectAgentCompanionStatus(state, { projectId, threadId } = {}) {
  const runIds = state.runIdsByScope?.[scopeKey(projectId, threadId)] || []
  let total = 0
  let activeCount = 0
  let failedCount = 0
  let attentionStatus = null
  let highest = 0
  for (const runId of runIds) {
    const run = state.runsById[runId]
    if (!run) continue
    for (const node of descendants(state, runId, run.rootNodeId)) {
      total += 1
      if (!TERMINAL_STATUSES.has(node.status)) activeCount += 1
      if (node.status === 'failed') failedCount += 1
      const priority = ATTENTION_PRIORITY[node.status] || 0
      if (priority > highest) {
        highest = priority
        attentionStatus = node.status
      }
    }
  }
  return {
    visible: total > 0,
    total,
    activeCount,
    failedCount,
    attentionStatus,
  }
}

export function selectVisibleAgentRows(state, { threadId, runId }) {
  const run = state.runsById[runId]
  if (!run || run.threadId !== threadId) return []
  const presentation = state.presentationByScope[presentationKey(threadId, runId)] || {}
  const expanded = new Set(presentation.expandedNodeIds || [])
  const result = []
  const visit = (nodeId) => {
    const node = state.nodesById[nodeId]
    if (!node || node.runId !== runId) return
    result.push({
      nodeId: node.id,
      runId,
      depth: node.depth,
      status: node.status,
      roleLabel: node.roleLabel,
      taskSummary: node.taskSummary,
      childCount: children(state, runId, node.id).length,
      selected: presentation.selectedNodeId === node.id,
    })
    if (!expanded.has(node.id)) return
    for (const child of children(state, runId, node.id)) visit(child.id)
  }
  visit(run.rootNodeId)
  return result
}

export function selectParentStreamAgentReferences(state, runId, parentNodeId) {
  return children(state, runId, parentNodeId).map((node) => ({
    id: node.id,
    runId,
    parentNodeId,
    roleLabel: node.roleLabel,
    taskSummary: node.taskSummary,
    status: node.status,
    resultSummary: node.resultSummary,
    errorSummary: node.errorSummary,
    descendantSummary: selectAgentDescendantSummary(state, runId, node.id),
  }))
}

export function selectSelectedAgentConversation(state, threadId, runId) {
  const presentation = state.presentationByScope[presentationKey(threadId, runId)] || {}
  const node = state.nodesById[presentation.selectedNodeId] || null
  if (!node || node.runId !== runId) return null
  return {
    node,
    transcript: state.transcriptByNode[nodeKey(runId, node.id)] || {
      summaryHydrated: false,
      itemIds: [],
      itemsById: {},
    },
  }
}

/**
 * Resolves the thread's selected agent without guessing a run. A selection whose node is gone after
 * reload reports `missing` so the surface can say so instead of silently substituting a sibling.
 */
export function selectThreadSelectedAgentRoute(state, threadId) {
  const thread = String(threadId || '')
  const prefix = `${thread}:`
  for (const [key, presentation] of Object.entries(state.presentationByScope)) {
    if (!key.startsWith(prefix)) continue
    const nodeId = String(presentation?.selectedNodeId || '')
    if (!nodeId) continue
    const runId = key.slice(prefix.length)
    const node = state.nodesById[nodeId] || null
    const run = state.runsById[runId] || null
    if (node && run && run.threadId === thread && node.runId === runId) {
      return { runId, nodeId, node, run, missing: false }
    }
    return { runId, nodeId, node: null, run, missing: true }
  }
  return null
}

/** Ancestor labels between the run root and the node, nearest-last, for a short breadcrumb. */
export function selectAgentAncestry(state, runId, nodeId) {
  const chain = []
  const start = state.nodesById[nodeId]
  let current = state.nodesById[start?.parentNodeId]
  while (current && current.runId === runId && current.id !== start?.rootNodeId) {
    chain.unshift({
      nodeId: current.id,
      label: current.roleLabel || current.taskSummary || current.id,
    })
    current = state.nodesById[current.parentNodeId]
  }
  return chain
}

export function selectAgentApprovals(state, runId) {
  return (state.approvalIdsByRun[runId] || [])
    .map((id) => state.approvalsById[id])
    .filter(Boolean)
}

export function selectAgentArtifacts(state, runId) {
  return (state.artifactIdsByRun[runId] || [])
    .map((id) => state.artifactsById[id])
    .filter(Boolean)
}

export function selectActiveAgentRunIds(state, projectId, threadId) {
  return state.activeRunIdsByScope[scopeKey(projectId, threadId)] || []
}
