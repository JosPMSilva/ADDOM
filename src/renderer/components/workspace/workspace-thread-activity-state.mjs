export const WORKSPACE_THREAD_ACTIVITY_PRIORITY = [
  'needs_input',
  'blocked',
  'failed',
  'active',
  'completed',
  'idle',
]

function normalizedStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  return WORKSPACE_THREAD_ACTIVITY_PRIORITY.includes(status) ? status : 'idle'
}

export function resolveWorkspaceThreadActivity({
  live = null,
  persisted = null,
  foreground = false,
} = {}) {
  const state = live && typeof live === 'object' ? live : {}
  if (state.hasPendingApproval || state.hasPendingQuestion) return 'needs_input'
  if (state.hasBlockedConflict) return 'blocked'
  if (state.isRunning) {
    return 'active'
  }
  if (state.hasError) return foreground ? 'idle' : 'failed'
  if (state.completedUnread) return foreground || state.acknowledged ? 'idle' : 'completed'

  const durable = persisted && typeof persisted === 'object' ? persisted : {}
  const status = normalizedStatus(durable.status)
  if ((status === 'completed' || status === 'failed') && (foreground || durable.unread !== true)) {
    return 'idle'
  }
  return status
}

export function highestWorkspaceThreadActivity(activities = []) {
  const values = new Set((Array.isArray(activities) ? activities : []).map(normalizedStatus))
  return WORKSPACE_THREAD_ACTIVITY_PRIORITY.find((status) => values.has(status)) || 'idle'
}
