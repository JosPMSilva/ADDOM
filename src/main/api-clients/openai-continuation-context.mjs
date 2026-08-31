function normalizeId(value = '') {
  return String(value || '').trim()
}

export function updateOpenAIContinuationContext(currentContext = null, responseMeta = null) {
  const current = currentContext && typeof currentContext === 'object'
    ? currentContext
    : {}
  const response = responseMeta && typeof responseMeta === 'object'
    ? responseMeta
    : {}
  const responseId = normalizeId(response.responseId)
  const conversationId = normalizeId(response.conversationId)

  if (!responseId && !conversationId) {
    return { ...current }
  }

  return {
    ...current,
    ...(conversationId
      ? {
          conversationId,
          previousResponseId: '',
        }
      : {}),
    ...(responseId
      ? { previousResponseId: responseId }
      : {}),
  }
}

export function resolveOpenAIContinuationPersistence({
  responseMeta = null,
  toolCalls = [],
  stopReason = '',
} = {}) {
  const response = responseMeta && typeof responseMeta === 'object'
    ? responseMeta
    : {}
  const responseId = normalizeId(response.responseId)
  const normalizedStopReason = normalizeId(stopReason).toLowerCase()
  const hasPendingToolCalls = Array.isArray(toolCalls)
    && toolCalls.length > 0
    && normalizedStopReason !== 'stop'
    && normalizedStopReason !== 'end_turn'

  if (!responseId) {
    return {
      chainValid: false,
      chainInvalidReason: 'missing_response_id',
    }
  }

  if (hasPendingToolCalls) {
    return {
      chainValid: false,
      chainInvalidReason: 'tool_outputs_pending',
    }
  }

  return {
    chainValid: true,
    chainInvalidReason: '',
  }
}
