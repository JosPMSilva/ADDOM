function normalizeId(value = '') {
  return String(value || '').trim()
}

function isTerminalLiveTurnEvent(event = null) {
  const eventKind = normalizeId(event?.activity?.eventKind).toLowerCase()
  return eventKind === 'turn_completed'
    || eventKind === 'turn_cancelled'
    || eventKind === 'moa_delegation_done'
}

export function resolveCancelableTurnId({ streamingMessage = null, liveExecutionTurns = {} } = {}) {
  const streamingTurnId = normalizeId(streamingMessage?.streamMeta?.turnId)
  if (streamingTurnId) return streamingTurnId

  for (const turn of Object.values(liveExecutionTurns || {})) {
    const turnId = normalizeId(turn?.turnId)
    if (!turnId) continue
    const status = normalizeId(turn?.status).toLowerCase()
    if (!['active', 'started', 'running', 'warning'].includes(status)) continue
    const eventIds = Array.isArray(turn?.eventOrder) ? turn.eventOrder : []
    const eventsById = turn?.eventsById && typeof turn.eventsById === 'object'
      ? turn.eventsById
      : {}
    if (eventIds.some((eventId) => isTerminalLiveTurnEvent(eventsById[eventId]))) continue
    return turnId
  }

  return ''
}

export function stopCurrentTurnOptimistically({
  activeThreadId = '',
  streamingMessage = null,
  liveExecutionTurns = {},
  finalizeMessage = () => {},
  pushToolActivity = () => {},
  cancel = () => {},
} = {}) {
  const targetThreadId = normalizeId(activeThreadId)
  const targetTurnId = resolveCancelableTurnId({ streamingMessage, liveExecutionTurns })
  const targetMessageId = normalizeId(streamingMessage?.id)
  const stopNote = 'Stop requested. Stopping after current action.'

  cancel(targetThreadId, targetTurnId)

  if (targetThreadId && targetMessageId) {
    const currentContent = String(streamingMessage?.content || '')
    const nextContent = currentContent.trim().length > 0
      ? `${currentContent}\n\n[${stopNote}]`
      : `[${stopNote}]`
    finalizeMessage(targetMessageId, nextContent, { threadId: targetThreadId })
  }

  pushToolActivity({
    id: targetTurnId ? `turn_cancelled:${targetTurnId}` : undefined,
    type: 'result',
    isError: false,
    decision: 'approved',
    threadId: targetThreadId,
    turnId: targetTurnId,
    eventKind: targetTurnId ? 'turn_cancelled' : undefined,
    turnState: targetTurnId ? 'cancelled' : undefined,
    turnStatus: targetTurnId ? 'cancelled' : undefined,
    coalesce: Boolean(targetTurnId),
    label: stopNote,
  })
}
