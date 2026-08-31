export const FANOUT_CONFIRM_DECISIONS = Object.freeze({
  launchAll: 'launch_all',
  limit: 'limit',
  stopTurn: 'stop_turn',
})

function count(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback
}

export function buildFanoutConfirmViewModel(request) {
  if (!request || typeof request !== 'object' || !request.requestId) return null
  const requestedCount = count(request.requestedCount)
  const threshold = Math.max(1, count(request.threshold, 5))
  if (requestedCount <= threshold) return null
  return {
    requestId: String(request.requestId),
    requestedCount,
    threshold,
  }
}
