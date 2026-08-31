/** Status dot colors shared by every agent surface so one status never reads two ways. */
export const AGENT_STATUS_TONE = Object.freeze({
  completed: 'bg-success',
  failed: 'bg-danger',
  cancelled: 'bg-text-tertiary',
  approval_required: 'bg-warning',
  waiting: 'bg-warning',
  paused: 'bg-warning',
  cancelling: 'bg-text-tertiary',
})
