/**
 * Capability-gated overflow actions for an opened agent conversation.
 * Opaque / missing snapshots expose no controls.
 */

const ACTIVE_STATUSES = new Set(['queued', 'starting', 'running', 'waiting', 'approval_required', 'paused', 'cancelling'])
const RETRY_STATUSES = new Set(['failed', 'cancelled'])

function caps(node) {
  const snapshot = node?.capabilitySnapshot
  return snapshot && typeof snapshot === 'object' ? snapshot : null
}

export function isOpaqueAgentNode(node) {
  return String(caps(node)?.mode || '') === 'provider_opaque'
}

export function listAgentConversationActions(node, { hasCompletedTurn = false } = {}) {
  if (!node || isOpaqueAgentNode(node)) return []
  const snapshot = caps(node)
  if (!snapshot) return []
  const status = String(node.status || '')
  const actions = []
  if (snapshot.childCancellation === true && ACTIVE_STATUSES.has(status)) {
    actions.push({ id: 'interrupt', kind: 'control', action: 'interrupt' })
  }
  if (snapshot.childRetry === true && RETRY_STATUSES.has(status)) {
    actions.push({ id: 'retry', kind: 'retry' })
  }
  if (hasCompletedTurn) {
    actions.push({ id: 'promote', kind: 'promote' })
  }
  return actions
}

export async function runAgentConversationAction({
  agentRunsApi,
  scope,
  action,
} = {}) {
  if (!agentRunsApi || !scope?.projectId || !scope?.threadId || !scope?.runId || !scope?.nodeId) {
    throw new TypeError('agent conversation action scope is incomplete')
  }
  if (!action) throw new TypeError('action is required')
  if (action.kind === 'control') {
    if (typeof agentRunsApi.control !== 'function') throw new TypeError('control is unavailable')
    return agentRunsApi.control({ ...scope, action: action.action, reason: 'user' })
  }
  if (action.kind === 'retry') {
    if (typeof agentRunsApi.retry !== 'function') throw new TypeError('retry is unavailable')
    return agentRunsApi.retry(scope)
  }
  if (action.kind === 'promote') {
    if (typeof agentRunsApi.promoteConversation !== 'function') throw new TypeError('promotion is unavailable')
    return agentRunsApi.promoteConversation(scope)
  }
  throw new TypeError(`unsupported agent conversation action: ${action.id}`)
}
