function executionProgressiveKey(kind, round, reasoningSegment = null) {
  const prefix = kind === 'execution_reasoning_chunk' ? 'execution_reasoning' : 'execution_commentary'
  const suffix = reasoningSegment != null
    ? `:${Math.max(0, Number(reasoningSegment) || 0)}`
    : ''
  return `${prefix}:${round}${suffix}`
}

export function createProgressiveExecutionChunkWriter({
  persistTimelineEvent,
  threadId = '',
  turnId = '',
  assistantMessageId = '',
  round = 0,
  providerId = '',
  model = '',
  now = Date.now,
} = {}) {
  const write = (kind, {
    content = '', phase = '', sequence = 0, emittedAt = 0, lifecycle = 'active', reasoningSegment = null,
  } = {}) => {
    const normalizedContent = String(content ?? '')
    if (!normalizedContent) return
    persistTimelineEvent(kind, {
      role: 'assistant',
      content: normalizedContent,
      lifecycle,
      progressiveKey: executionProgressiveKey(kind, round, reasoningSegment),
      meta: {
        threadId,
        turnId,
        round,
        ...((reasoningSegment != null || (kind === 'execution_reasoning_chunk' && Number(round || 0) > 0))
          ? { reasoningSegment: reasoningSegment == null
            ? Math.max(0, Number(round) - 1)
            : Math.max(0, Number(reasoningSegment) || 0) }
          : {}),
        providerId: String(providerId || ''),
        model: String(model ?? ''),
        assistantMessageId: String(assistantMessageId || ''),
        ...(phase ? { phase } : {}),
        ...(Number(sequence || 0) > 0 ? { sequence: Number(sequence || 0) || 0 } : {}),
        emittedAt: Number(emittedAt || 0) || now(),
      },
    })
  }

  const settle = ({
    reasoningContent = '', reasoningSequence = 0,
    reasoningSegment = null,
    commentaryContent = '', commentarySequence = 0,
    commentarySegment = null,
    lifecycle = 'completed',
  } = {}) => {
    const emittedAt = now()
    if (reasoningSequence > 0) {
      write('execution_reasoning_chunk', {
        content: reasoningContent, sequence: reasoningSequence, emittedAt, lifecycle, reasoningSegment,
      })
    }
    if (commentarySequence > 0) {
      write('execution_commentary_chunk', {
        content: commentaryContent, phase: 'commentary', sequence: commentarySequence, emittedAt, lifecycle,
        reasoningSegment: commentarySegment,
      })
    }
  }

  return { write, settle }
}
