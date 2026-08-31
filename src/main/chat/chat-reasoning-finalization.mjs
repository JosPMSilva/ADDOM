import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'
import { recordReasoningDoneSegment } from './chat-reasoning-done.mjs'

export function emitReasoningDone({
  send = () => {},
  persistTimelineEvent = () => {},
  reasoningBuffer = '',
  currentReasoningBuffer = '',
  usageReasoningTokens = 0,
  threadId = '',
  turnId = '',
  round = 0,
  reasoningSegment = null,
  providerId = '',
  model = '',
  assistantMessageId = '',
  turnReasoningSegments = [],
  persistExecutionChunk = false,
} = {}) {
  const emittedAt = Date.now()
  const { current: recordedReasoning, full: fullReasoning } = recordReasoningDoneSegment(
    turnReasoningSegments,
    reasoningBuffer,
  )
  const normalizedReasoning = String(currentReasoningBuffer || recordedReasoning || '').trim()
  const resolvedReasoningSegment = reasoningSegment == null
    ? Math.max(0, Number(round || 0) - 1)
    : Math.max(0, Number(reasoningSegment) || 0)
  const reasoningPayload = {
    full: fullReasoning, current: normalizedReasoning, threadId, turnId, round,
    reasoningSegment: resolvedReasoningSegment, emittedAt,
    reasoningTokens: Number(usageReasoningTokens || 0),
    providerId: String(providerId || ''), model: String(model || ''),
    assistantMessageId: String(assistantMessageId || ''),
  }
  const normalizedReasoningTokens = Number(usageReasoningTokens || 0) || 0
  if (persistExecutionChunk && normalizedReasoning) {
    persistTimelineEvent('execution_reasoning_chunk', {
      role: 'assistant', content: normalizedReasoning,
      meta: {
        threadId, turnId, round, reasoningSegment: resolvedReasoningSegment,
        providerId: String(providerId || ''), model: String(model || ''),
        assistantMessageId: String(assistantMessageId || ''), emittedAt,
      },
    })
  }
  commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind: 'reasoning_done',
    options: {
      role: 'assistant', content: normalizedReasoning,
      meta: {
        threadId, turnId, round, reasoningSegment: resolvedReasoningSegment,
        providerId: String(providerId || ''), model: String(model || ''),
        full: fullReasoning, current: normalizedReasoning,
        assistantMessageId: String(assistantMessageId || ''),
        reasoningTokens: normalizedReasoningTokens,
      },
    },
    channel: 'chat:reasoning-done', payload: reasoningPayload,
  })
}
