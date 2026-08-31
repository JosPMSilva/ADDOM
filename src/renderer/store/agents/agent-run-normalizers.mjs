const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function text(value) {
  return String(value || '').trim()
}

function scopeKey(projectId, threadId) {
  return `${text(projectId)}:${text(threadId)}`
}

function nodeKey(runId, nodeId) {
  return `${text(runId)}:${text(nodeId)}`
}

function presentationKey(threadId, runId) {
  return `${text(threadId)}:${text(runId)}`
}

function indexById(rows = []) {
  return Object.fromEntries(
    rows.filter((row) => text(row?.id)).map((row) => [text(row.id), { ...row }]),
  )
}

function childIndex(nodes = []) {
  const result = {}
  for (const node of nodes) {
    if (!node?.parentNodeId) continue
    const key = nodeKey(node.runId, node.parentNodeId)
    result[key] = [...(result[key] || []), node.id]
  }
  for (const ids of Object.values(result)) {
    ids.sort((left, right) => {
      const leftNode = nodes.find((node) => node.id === left)
      const rightNode = nodes.find((node) => node.id === right)
      return Number(leftNode?.createdAt || 0) - Number(rightNode?.createdAt || 0)
        || String(left).localeCompare(String(right))
    })
  }
  return result
}

function groupIds(rows, keyFactory) {
  const result = {}
  for (const row of rows) {
    const key = keyFactory(row)
    if (!key) continue
    result[key] = [...(result[key] || []), row.id]
  }
  return result
}

export function normalizeAgentRunSnapshot(snapshot = {}) {
  const run = snapshot.run && typeof snapshot.run === 'object'
    ? { ...snapshot.run, lastRunSequence: Number(snapshot.lastRunSequence || 0) }
    : null
  if (!run?.id) throw new TypeError('Agent run snapshot requires run.id')
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes.map((row) => ({ ...row })) : []
  const attempts = Array.isArray(snapshot.attempts)
    ? snapshot.attempts.map((row) => ({ ...row }))
    : []
  const approvals = Array.isArray(snapshot.approvals)
    ? snapshot.approvals.map((row) => ({ ...row }))
    : []
  const artifacts = Array.isArray(snapshot.artifacts)
    ? snapshot.artifacts.map((row) => ({ ...row }))
    : []
  return {
    run,
    runsById: { [run.id]: run },
    nodesById: indexById(nodes),
    attemptsById: indexById(attempts),
    approvalsById: indexById(approvals),
    artifactsById: indexById(artifacts),
    childIdsByParent: childIndex(nodes),
    attemptIdsByNode: groupIds(attempts, (row) => nodeKey(row.runId, row.nodeId)),
    approvalIdsByRun: groupIds(approvals, (row) => text(row.runId)),
    artifactIdsByRun: groupIds(artifacts, (row) => text(row.runId)),
    scopeKey: scopeKey(run.projectId, run.threadId),
    presentationKey: presentationKey(run.threadId, run.id),
    terminal: TERMINAL_STATUSES.has(run.status),
    lastRunSequence: Number(snapshot.lastRunSequence || 0),
    nodeSequences: { ...(snapshot.nodeSequences || {}) },
    workspaces: Array.isArray(snapshot.workspaces) ? snapshot.workspaces.map((row) => ({ ...row })) : [],
    mergeQueue: Array.isArray(snapshot.mergeQueue) ? snapshot.mergeQueue.map((row) => ({ ...row })) : [],
  }
}

export { nodeKey, presentationKey, scopeKey, TERMINAL_STATUSES }
