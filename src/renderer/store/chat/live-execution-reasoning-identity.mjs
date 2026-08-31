import {
  readExecutionReasoningSegment,
  resolveExecutionReasoningMessageId,
} from '../../../common/chat/reasoning-segment.mjs'

function adoptLateInitialSegmentIdentity(turn = null, fromMessageId = '', toMessageId = '') {
  const from = String(fromMessageId || '').trim()
  const to = String(toMessageId || '').trim()
  if (!turn || !from || !to || from === to || turn.reasoningById?.[to]) return
  const matchingEventIds = (turn.eventOrder || []).filter((eventId) => {
    const event = turn.eventsById?.[eventId]
    const role = String(event?.reasoningRole || '').trim().toLowerCase()
    return event?.kind === 'reasoning' && event?.archived !== true
      && String(event?.messageId || '').trim() === from
      && role !== 'commentary' && role !== 'stage'
  })
  if (matchingEventIds.length !== 1) return
  const eventId = matchingEventIds[0]
  turn.eventsById[eventId] = { ...turn.eventsById[eventId], messageId: to }
  const existing = turn.reasoningById?.[from]
  if (existing) {
    turn.reasoningById = { ...turn.reasoningById, [to]: { ...existing, id: to } }
    delete turn.reasoningById[from]
  }
  const oldItemId = `reasoning:${from}`
  const newItemId = `reasoning:${to}`
  turn.itemOrder = [...new Set((turn.itemOrder || []).map((itemId) => (
    itemId === oldItemId ? newItemId : itemId
  )))]
}

export function resolveLiveExecutionReasoningIdentity({
  turn,
  turnId = '',
  messageId = '',
  reasoningRole = '',
  reasoningMeta = null,
  streamMeta = null,
} = {}) {
  const providerId = String(
    streamMeta?.providerId || reasoningMeta?.providerId || turn?.providerId || '',
  ).trim().toLowerCase()
  const persistedSegment = reasoningMeta?.reasoningSegment ?? streamMeta?.reasoningSegment
  const segment = persistedSegment == null
    ? readExecutionReasoningSegment(turn)
    : Math.max(0, Number(persistedSegment) || 0)
  const normalizedRole = String(reasoningRole || '').trim().toLowerCase()
  const normalizedMessageId = String(messageId || '').trim()
  const isCommentaryIdentity = normalizedRole === 'commentary'
    && normalizedMessageId.startsWith('execution_commentary:')
  if (isCommentaryIdentity) {
    return {
      providerId,
      persistedSegment,
      segment,
      messageId: (
        persistedSegment != null
        && segment > 0
        && !/:segment:\d+$/.test(normalizedMessageId)
      )
        ? `${normalizedMessageId}:segment:${segment}`
        : normalizedMessageId,
    }
  }
  const resolvedMessageId = resolveExecutionReasoningMessageId({
    turnId,
    segment,
    providerId,
    reasoningRole,
    explicitMessageId: persistedSegment == null ? String(messageId || '').trim() : '',
  })
  if (persistedSegment != null && segment === 0) {
    adoptLateInitialSegmentIdentity(turn, normalizedMessageId, resolvedMessageId)
  }
  return {
    providerId,
    persistedSegment,
    segment,
    messageId: resolvedMessageId,
  }
}
