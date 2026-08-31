function resolveThreadMessagesFromState(state, threadId = '') {
  const targetThreadId = String(threadId || '').trim()
  if (!state || !targetThreadId) return []
  const activeThreadId = String(state?.activeThreadId || '').trim()
  if (targetThreadId === activeThreadId) {
    return Array.isArray(state?.messages) ? state.messages : []
  }
  const threadStateById = state?.threadStateById && typeof state.threadStateById === 'object'
    ? state.threadStateById
    : {}
  const threadState = threadStateById[targetThreadId] && typeof threadStateById[targetThreadId] === 'object'
    ? threadStateById[targetThreadId]
    : null
  return Array.isArray(threadState?.messages) ? threadState.messages : []
}

function resolveAssistantMessageContextFromState(state, {
  threadId = '',
  messageId = '',
} = {}) {
  const targetMessageId = String(messageId || '').trim()
  if (!state || !targetMessageId) return null
  const normalizedThreadId = String(threadId || '').trim()
  if (normalizedThreadId) {
    const threadMessages = resolveThreadMessagesFromState(state, normalizedThreadId)
    const exactThreadMatch = threadMessages.find((entry) => String(entry?.id || '').trim() === targetMessageId)
    if (exactThreadMatch) {
      return {
        message: exactThreadMatch,
        threadId: normalizedThreadId,
      }
    }
  }
  const activeMessages = Array.isArray(state?.messages) ? state.messages : []
  const activeMatch = activeMessages.find((entry) => String(entry?.id || '').trim() === targetMessageId)
  if (activeMatch) {
    return {
      message: activeMatch,
      threadId: String(state?.activeThreadId || '').trim(),
    }
  }
  const threadStateById = state?.threadStateById && typeof state.threadStateById === 'object'
    ? state.threadStateById
    : {}
  for (const [candidateThreadId, threadState] of Object.entries(threadStateById)) {
    const messages = Array.isArray(threadState?.messages) ? threadState.messages : []
    const match = messages.find((entry) => String(entry?.id || '').trim() === targetMessageId)
    if (match) {
      return {
        message: match,
        threadId: String(candidateThreadId || '').trim(),
      }
    }
  }
  return null
}

function resolveThreadLiveExecutionFromState(state, threadId = '') {
  const targetThreadId = String(threadId || '').trim()
  if (!state) return null
  if (targetThreadId) {
    const activeThreadId = String(state?.activeThreadId || '').trim()
    if (targetThreadId === activeThreadId) {
      return state?.liveExecution && typeof state.liveExecution === 'object'
        ? state.liveExecution
        : null
    }
    const threadStateById = state?.threadStateById && typeof state.threadStateById === 'object'
      ? state.threadStateById
      : {}
    const threadState = threadStateById[targetThreadId] && typeof threadStateById[targetThreadId] === 'object'
      ? threadStateById[targetThreadId]
      : null
    return threadState?.liveExecution && typeof threadState.liveExecution === 'object'
      ? threadState.liveExecution
      : null
  }
  return state?.liveExecution && typeof state.liveExecution === 'object'
    ? state.liveExecution
    : null
}

function resolveTurnLiveExecutionReasoning(state, {
  threadId = '',
  turnId = '',
} = {}) {
  const resolvedTurnId = String(turnId || '').trim()
  if (!state || !resolvedTurnId) return ''

  const collectTurnReasoning = (liveExecution = null) => {
    const turn = liveExecution?.turnsById?.[resolvedTurnId]
    const eventOrder = Array.isArray(turn?.eventOrder) ? turn.eventOrder : []
    return eventOrder
      .map((eventId) => turn?.eventsById?.[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
      .map((event) => String(event?.detail || '').trim())
      .filter(Boolean)
      .join('\n\n---\n\n')
      .trim()
  }

  const requestedThreadId = String(threadId || '').trim()
  if (requestedThreadId) {
    const direct = collectTurnReasoning(resolveThreadLiveExecutionFromState(state, requestedThreadId))
    if (direct) return direct
  }

  const active = collectTurnReasoning(resolveThreadLiveExecutionFromState(state, String(state?.activeThreadId || '').trim()))
  if (active) return active

  const threadStateById = state?.threadStateById && typeof state.threadStateById === 'object'
    ? state.threadStateById
    : {}
  for (const [candidateThreadId, threadState] of Object.entries(threadStateById)) {
    if (requestedThreadId && candidateThreadId === requestedThreadId) continue
    const candidate = collectTurnReasoning(threadState?.liveExecution && typeof threadState.liveExecution === 'object'
      ? threadState.liveExecution
      : null)
    if (candidate) return candidate
  }

  return ''
}

export function resolvePersistedReasoningDetailFromState(state, {
  threadId = '',
  messageId = '',
  turnId = '',
  fullText = '',
} = {}) {
  const explicitFullText = String(fullText || '').trim()
  if (explicitFullText) return explicitFullText
  const messageContext = resolveAssistantMessageContextFromState(state, { threadId, messageId })
  const message = messageContext?.message || null
  const resolvedThreadId = String(threadId || messageContext?.threadId || '').trim()
  const streamedReasoning = (() => {
    if (typeof message?.reasoning === 'string') return String(message.reasoning || '').trim()
    if (message?.reasoning && typeof message.reasoning === 'object') {
      return String(message.reasoning.text ?? message.reasoning.value ?? '').trim()
    }
    return ''
  })()
  if (streamedReasoning) return streamedReasoning
  const resolvedTurnId = String(turnId || message?.streamMeta?.turnId || '').trim()
  if (resolvedTurnId) {
    const liveReasoning = resolveTurnLiveExecutionReasoning(state, {
      threadId: resolvedThreadId,
      turnId: resolvedTurnId,
    })
    if (liveReasoning) return liveReasoning
  }
  return ''
}
