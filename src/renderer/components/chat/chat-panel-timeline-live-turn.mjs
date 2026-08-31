function normalizeTimelineId(value = '') {
  return String(value || '').trim()
}

export function resolveStreamingLiveTurn({
  resolvedLiveExecutionTurns = {},
  streamingMessage = null,
  streamingTurnId = '',
} = {}) {
  const normalizedTurnId = normalizeTimelineId(streamingTurnId)
  if (normalizedTurnId && resolvedLiveExecutionTurns[normalizedTurnId]) {
    return resolvedLiveExecutionTurns[normalizedTurnId]
  }
  if (normalizedTurnId) return null
  if (!streamingMessage || typeof streamingMessage !== 'object') return null
  const streamingThreadId = normalizeTimelineId(
    streamingMessage?.streamMeta?.threadId
    || streamingMessage?.threadId,
  )
  let activeTurn = null
  for (const turn of Object.values(resolvedLiveExecutionTurns)) {
    if (normalizeTimelineId(turn?.status).toLowerCase() !== 'active') continue
    const turnId = normalizeTimelineId(turn?.turnId)
    if (!turnId) continue
    const turnThreadId = normalizeTimelineId(turn?.threadId)
    if (streamingThreadId && turnThreadId && turnThreadId !== streamingThreadId) continue
    if (activeTurn) return null
    activeTurn = turn
  }
  return activeTurn
}

export function resolveStreamingTurnId(turn = null, fallbackTurnId = '') {
  return normalizeTimelineId(turn?.turnId || fallbackTurnId)
}
