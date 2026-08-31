export function createTurnLifecycle({
  send,
  persistTimelineEvent,
  commitTurnState = null,
  commitCancellationTurn = null,
  loop,
  threadId = '',
  turnId = '',
  mode = 'execute',
}) {
  let turnStartedAt = 0
  const softStopReason = 'Stop requested. Stopping after current action.'

  const timelineKindForState = (normalizedState) => {
    if (normalizedState === 'started') return 'turn_started'
    if (normalizedState === 'cancelled') return 'turn_cancelled'
    if (normalizedState === 'completed') return 'turn_completed'
    return 'turn_phase'
  }

  const contentForState = (normalizedState, data = {}) => {
    if (normalizedState === 'started') return 'Turn started.'
    if (normalizedState === 'cancelled') return `Stop requested: ${String(data?.reason || softStopReason)}`
    if (normalizedState === 'completed') return `Turn completed (${String(data?.status || 'ok')}).`
    const label = String(data?.label || data?.status || normalizedState).trim()
    return `Turn phase: ${label}.`
  }

  const buildTurnStatePayload = (normalizedState, data = {}) => {
    const isFinal = normalizedState === 'completed' || normalizedState === 'cancelled'
    const baseData = data && typeof data === 'object' ? data : {}
    if (!turnStartedAt) turnStartedAt = Number(baseData.startedAt || 0) || Date.now()
    const startedAt = Number(baseData.startedAt || 0) || turnStartedAt
    const finishedAt = isFinal ? (Number(baseData.finishedAt || 0) || Date.now()) : undefined
    return {
      threadId,
      turnId,
      state: normalizedState,
      mode,
      ...baseData,
      startedAt,
      ...(finishedAt ? { finishedAt } : {}),
    }
  }

  const sendTurnState = (state = 'started', data = {}) => {
    const normalizedState = String(state ?? '').trim().toLowerCase()
    if (!normalizedState) return
    const isFinal = normalizedState === 'completed' || normalizedState === 'cancelled'
    if (isFinal && loop.turnStateFinalized) return

    const baseData = data && typeof data === 'object' ? data : {}
    const payload = buildTurnStatePayload(normalizedState, baseData)
    if (typeof commitTurnState === 'function') {
      commitTurnState(normalizedState, payload)
    } else {
      persistTimelineEvent(timelineKindForState(normalizedState), {
        role: 'system',
        content: contentForState(normalizedState, baseData),
        meta: payload,
      })
    }
    if (isFinal) loop.turnStateFinalized = true
    if (typeof commitTurnState !== 'function') send('chat:turn-state', payload)
  }

  const sendCancelled = (reason = softStopReason) => {
    if (loop.cancellationSent) return
    const normalizedReason = String(reason ?? softStopReason)
    const turnStatePayload = buildTurnStatePayload('cancelled', {
      reason: normalizedReason,
      status: 'cancelled',
    })
    if (typeof commitCancellationTurn === 'function') {
      commitCancellationTurn({ reason: normalizedReason, turnStatePayload })
    } else {
      persistTimelineEvent('chat_cancelled', {
        role: 'system',
        content: normalizedReason,
        meta: { reason: normalizedReason },
      })
      persistTimelineEvent('turn_cancelled', {
        role: 'system',
        content: contentForState('cancelled', turnStatePayload),
        meta: turnStatePayload,
      })
      send('chat:cancelled', { reason: normalizedReason, threadId, turnId })
      send('chat:turn-state', turnStatePayload)
    }
    loop.cancellationSent = true
    loop.turnStateFinalized = true
  }

  return { sendTurnState, sendCancelled }
}
