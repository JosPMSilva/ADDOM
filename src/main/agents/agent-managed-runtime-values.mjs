export function clipAgentText(value, maxLength = 4_000) {
  return (typeof value === 'string' ? value.trim() : '').slice(0, maxLength)
}

export function clipAgentError(value, fallback = 'Agent execution failed.', maxLength = 4_000) {
  const source = typeof value === 'string'
    ? value
    : typeof value?.message === 'string'
      ? value.message
      : ''
  return clipAgentText(source, maxLength) || fallback
}

/** One-line Cc-safe label for identity/evidence fields (LF/TAB stripped). */
export function clipAgentLabel(value, maxLength = 4_000) {
  const firstLine = String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) || ''
  const cleaned = firstLine
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, maxLength) || 'Delegated context'
}

export function permissionForManagedRole(role = {}) {
  return role.canWriteFiles
    ? { level: 'read_write', toolClasses: ['read', 'write'] }
    : { level: 'read_only', toolClasses: ['read'] }
}

export function canonicalManagedUsage(value) {
  if (!value || typeof value !== 'object') return null
  const inputTokens = Math.max(0, Math.floor(Number(value.inputTokens || 0)))
  const outputTokens = Math.max(0, Math.floor(Number(value.outputTokens || 0)))
  const reasoningTokens = Math.min(
    outputTokens,
    Math.max(0, Math.floor(Number(value.reasoningTokens || 0))),
  )
  return {
    scope: 'exclusive',
    inputTokens,
    outputTokens,
    cachedInputTokens: Math.min(
      inputTokens,
      Math.max(0, Math.floor(Number(value.cachedInputTokens || 0))),
    ),
    reasoningTokens,
    totalTokens: Math.max(
      inputTokens + outputTokens,
      Math.max(0, Math.floor(Number(value.totalTokens || 0))),
    ),
    costUsd: Math.max(0, Number(value.costUsd || 0)),
    rawProviderUsage: value.rawProviderUsage ?? value,
  }
}

export function isManagedDescendant(node, ownerNodeId) {
  return node.id !== ownerNodeId && node.branchPath.includes(ownerNodeId)
}

export function managedRootOwner(graph) {
  const root = graph.nodes.find((node) => node.id === graph.run.rootNodeId)
  return {
    runId: graph.run.id,
    nodeId: root.id,
    attemptId: `coordinator_${graph.run.id}`,
    depth: 0,
    capabilitySnapshot: root.capabilitySnapshot,
    permissionSnapshot: root.permissionSnapshot,
    policyLimits: graph.run.budgetSnapshot,
  }
}

const PROVIDER_EVENT_KIND_MAP = Object.freeze({
  commentary: 'agent_commentary_delta',
  assistant_delta: 'agent_assistant_delta',
  reasoning: 'agent_reasoning_delta',
  reasoning_boundary: 'agent_reasoning_boundary',
  tool_started: 'agent_tool_started',
  tool_output: 'agent_tool_output',
  tool_completed: 'agent_tool_completed',
})

export function managedProviderEventKind(kind) {
  return PROVIDER_EVENT_KIND_MAP[kind] || null
}
