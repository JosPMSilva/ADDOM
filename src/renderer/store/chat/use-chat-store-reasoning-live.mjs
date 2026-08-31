import {
  createEmptyLiveExecutionState,
  appendLiveExecutionReasoningEvent,
  replaceLatestLiveExecutionReasoningSnapshot,
  patchLiveExecutionReasoningMetadata,
  markLiveExecutionReasoningDone,
  resolveLiveExecutionCommentaryMessageId,
} from './live-execution-store.mjs'
import {
  REASONING_PHASE_BOUNDARY,
  allowsReasoningChunk,
} from '../../../common/chat/reasoning-phase-boundary.mjs'
import { hasLiveReasoningHistory } from './live-execution-store-reasoning.mjs'

export function applyExplicitReasoningSegment(target = {}, options = {}) {
  if (options?.reasoningSegment == null) return target
  const reasoningSegment = Math.max(0, Number(options.reasoningSegment) || 0)
  return {
    ...target,
    streamMeta: { ...(target?.streamMeta || {}), reasoningSegment },
    reasoningMeta: { ...(target?.reasoningMeta || {}), reasoningSegment },
  }
}

export function getAssistantMessageById(state, messageId) {
  const targetId = String(messageId || '').trim()
  if (!targetId) return null
  const messages = Array.isArray(state?.messages) ? state.messages : []
  return messages.find((entry) => entry?.id === targetId && entry?.role === 'assistant') || null
}

export function patchLiveReasoningMetadataFromMessage(state, messageId) {
  const message = getAssistantMessageById(state, messageId)
  if (!message) return state?.liveExecution || createEmptyLiveExecutionState()
  const liveExecution = hydratePersistedReasoningIntoLiveExecution(state?.liveExecution, message)
  return patchLiveExecutionReasoningMetadata(liveExecution, {
    threadId: String(message?.streamMeta?.threadId || '').trim(),
    turnId: String(message?.streamMeta?.turnId || '').trim(),
    // One assistant message can own several chronological reasoning segments.
    // Patch every segment in the turn instead of only the initial message id.
    messageId: '',
    reasoningMeta: message?.reasoningMeta || null,
    streamMeta: message?.streamMeta || null,
  })
}

export function markLiveReasoningDoneFromMessage(state, messageId) {
  const message = getAssistantMessageById(state, messageId)
  if (!message) return state?.liveExecution || createEmptyLiveExecutionState()
  const liveExecution = hydratePersistedReasoningIntoLiveExecution(state?.liveExecution, message)
  return markLiveExecutionReasoningDone(liveExecution, {
    threadId: String(message?.streamMeta?.threadId || '').trim(),
    turnId: String(message?.streamMeta?.turnId || '').trim(),
    // Tool boundaries split reasoning into distinct execution-stream items.
    // They all become terminal with the owning assistant message.
    messageId: '',
    reasoningMeta: message?.reasoningMeta || null,
    streamMeta: message?.streamMeta || null,
  })
}

export function appendReasoningPhaseBoundaryUpdate(message = {}) {
  return {
    ...message,
    reasoning: `${String(normalizeReasoningText(message?.reasoning || ''))}${REASONING_PHASE_BOUNDARY}`,
    reasoningLiveStartsNewBlock: true,
  }
}

export function appendReasoningPhaseBoundaryLiveExecution(liveExecution, message, now = () => Date.now()) {
  return appendLiveExecutionReasoningEvent(liveExecution || createEmptyLiveExecutionState(), {
    threadId: String(message?.streamMeta?.threadId || '').trim(),
    turnId: String(message?.streamMeta?.turnId || '').trim(),
    messageId: String(message?.id || '').trim(),
    reasoningRole: 'reasoning',
    chunk: REASONING_PHASE_BOUNDARY,
    emittedAt: Number(
      message?.reasoningMeta?.lastChunkAt
      || message?.streamMeta?.lastChunkAt
      || message?.streamMeta?.completedAt
      || 0,
    ) || now(),
    reasoningMeta: message?.reasoningMeta || null,
    streamMeta: message?.streamMeta || null,
  })
}

export function appendReasoningSegmentsToLiveExecution(liveExecution, message, segments = [], now, {
  startsNewBlock = false,
  emittedAt = 0,
} = {}) {
  let nextLiveExecution = liveExecution || createEmptyLiveExecutionState()
  let nextStartsNewBlock = startsNewBlock
  for (const segment of Array.isArray(segments) ? segments : []) {
    const chunk = String(segment?.text || segment || '')
    if (!allowsReasoningChunk(chunk)) continue
    nextLiveExecution = appendLiveExecutionReasoningEvent(nextLiveExecution, {
      threadId: String(message?.streamMeta?.threadId || '').trim(),
      turnId: String(message?.streamMeta?.turnId || '').trim(),
      messageId: String(message?.id || '').trim(),
      reasoningRole: 'reasoning',
      chunk,
      forceNewBlock: nextStartsNewBlock || segment?.startsNewBlock === true,
      emittedAt: Number(emittedAt || message?.reasoningMeta?.lastChunkAt || message?.streamMeta?.lastChunkAt || message?.streamMeta?.completedAt || 0) || now(),
      reasoningMeta: message?.reasoningMeta || null,
      streamMeta: message?.streamMeta || null,
    })
    nextStartsNewBlock = false
  }
  return nextLiveExecution
}

export function replaceReasoningSnapshotInLiveExecution(liveExecution, message, text = '', now) {
  return replaceLatestLiveExecutionReasoningSnapshot(liveExecution || createEmptyLiveExecutionState(), {
    threadId: String(message?.streamMeta?.threadId || '').trim(),
    turnId: String(message?.streamMeta?.turnId || '').trim(),
    messageId: String(message?.id || '').trim(),
    reasoningRole: 'reasoning',
    detail: String(text || ''),
    emittedAt: Number(message?.reasoningMeta?.lastChunkAt || message?.streamMeta?.lastChunkAt || 0) || now(),
    reasoningMeta: message?.reasoningMeta || null,
    streamMeta: message?.streamMeta || null,
  })
}

export function applyAuthoritativeReasoningSnapshot(next, mergedState, message, currentText, now) {
  return {
    ...next,
    liveExecution: replaceReasoningSnapshotInLiveExecution(
      mergedState.liveExecution,
      message,
      currentText,
      now,
    ),
  }
}

function hydratePersistedReasoningIntoLiveExecution(liveExecution, message) {
  const nextLiveExecution = liveExecution || createEmptyLiveExecutionState()
  const turnId = String(message?.streamMeta?.turnId || '').trim()
  const messageId = String(message?.id || '').trim()
  if (!turnId || !messageId) return nextLiveExecution
  if (hasLiveReasoningHistory(nextLiveExecution, { turnId, messageId })) return nextLiveExecution

  const reasoningText = normalizeReasoningText(message?.reasoning)
  if (!reasoningText.trim()) return nextLiveExecution
  if (reasoningDuplicatesAssistantContent(message, reasoningText)) return nextLiveExecution

  const threadId = String(message?.streamMeta?.threadId || '').trim()
  const emittedAt = Number(
    message?.reasoningMeta?.lastChunkAt
    || message?.streamMeta?.completedAt
    || message?.streamMeta?.lastChunkAt
    || message?.streamMeta?.startedAt
    || 0
  ) || Date.now()

  let hydratedLiveExecution = nextLiveExecution
  const segments = reasoningText.includes('\n\n---\n\n')
    ? reasoningText.split('\n\n---\n\n')
    : [reasoningText]
  for (const [index, segment] of segments.entries()) {
    const chunk = String(segment || '')
    if (!chunk.trim()) continue
    hydratedLiveExecution = appendLiveExecutionReasoningEvent(hydratedLiveExecution, {
      threadId,
      turnId,
      messageId,
      reasoningRole: 'reasoning',
      chunk,
      forceNewBlock: index > 0,
      emittedAt,
      reasoningMeta: message?.reasoningMeta || null,
      streamMeta: message?.streamMeta || null,
    })
  }
  return hydratedLiveExecution
}

export function normalizeComparableReasoning(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}---\n{2,}/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function reasoningDuplicatesAssistantContent(message = null, reasoningText = '') {
  const normalizedReasoning = normalizeComparableReasoning(reasoningText)
  if (!normalizedReasoning) return false
  const normalizedContent = normalizeComparableReasoning(message?.content)
  return !!normalizedContent && normalizedReasoning === normalizedContent
}

export function normalizeReasoningText(value = '') {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    return String(value.text ?? value.value ?? '')
  }
  return ''
}

export function appendExecutionCommentaryToLiveExecution(liveExecution, {
  threadId = '',
  turnId = '',
  round = 0,
  chunk = '',
  emittedAt = 0,
  forceNewBlock = false,
  reasoningMeta = null,
  streamMeta = null,
} = {}) {
  const normalizedTurnId = String(turnId || streamMeta?.turnId || '').trim()
  const detail = String(chunk ?? '')
  if (!normalizedTurnId || !detail) return liveExecution || createEmptyLiveExecutionState()
  return appendLiveExecutionReasoningEvent(liveExecution || createEmptyLiveExecutionState(), {
    threadId: String(threadId || streamMeta?.threadId || '').trim(),
    turnId: normalizedTurnId,
    messageId: resolveLiveExecutionCommentaryMessageId(
      normalizedTurnId,
      streamMeta?.round ?? round,
    ),
    reasoningRole: 'commentary',
    chunk: detail,
    forceNewBlock,
    emittedAt: Number(emittedAt || streamMeta?.lastChunkAt || streamMeta?.startedAt || 0) || Date.now(),
    reasoningMeta,
    streamMeta,
  })
}
