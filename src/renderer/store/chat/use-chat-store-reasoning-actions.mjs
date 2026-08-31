import {
  createEmptyLiveExecutionState,
  patchLiveExecutionReasoningMetadata,
  markLiveExecutionReasoningDone,
  resolveLiveExecutionCommentaryMessageId,
} from './live-execution-store.mjs'
import { collectDisplayReadyReasoningSegments } from './reasoning-stream-segmentation.mjs'
import {
  appendExecutionCommentaryToLiveExecution,
  applyAuthoritativeReasoningSnapshot,
  appendReasoningPhaseBoundaryLiveExecution,
  appendReasoningPhaseBoundaryUpdate,
  appendReasoningSegmentsToLiveExecution,
  applyExplicitReasoningSegment,
  getAssistantMessageById,
  markLiveReasoningDoneFromMessage,
  normalizeComparableReasoning,
  normalizeReasoningText,
  patchLiveReasoningMetadataFromMessage,
} from './use-chat-store-reasoning-live.mjs'
import { isReasoningPhaseBoundary } from '../../../common/chat/reasoning-phase-boundary.mjs'

function promoteFormattingContinuationSplit(split = {}, delta = '', existingReasoning = '') {
  const segments = Array.isArray(split?.segments) ? split.segments : []
  if (segments.length > 0) return split
  if (!String(existingReasoning || '').trim()) return split

  const normalizedDelta = String(delta ?? '').replace(/\r\n?/g, '\n')
  if (!normalizedDelta.trim()) return split
  if (/^(?:\s|-)+$/.test(normalizedDelta)) return split

  return {
    segments: [{
      text: normalizedDelta,
      startsNewBlock: false,
    }],
    rest: '',
    restStartsNewBlock: false,
  }
}

export function createReasoningActions({
  set,
  now,
  updateMessageAndTimelineById,
  updateThreadSessionState,
  resolveThreadSessionId,
  normalizeStreamMetaPatch,
  computeDerivedStreamMeta,
} = {}) {
  const hasThreadRouting = (
    typeof updateThreadSessionState === 'function'
    && typeof resolveThreadSessionId === 'function'
  )
  const normalizeThreadId = (value) => String(value || '').trim()
  const hasOwnPatch = (patch) => !!patch && typeof patch === 'object' && Object.keys(patch).length > 0
  const findThreadIdByMessageId = (state, messageId) => {
    const targetId = String(messageId || '').trim()
    if (!targetId || !hasThreadRouting) return ''
    const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
    const activeMessages = Array.isArray(state?.messages) ? state.messages : []
    if (activeMessages.some((entry) => String(entry?.id || '').trim() === targetId)) {
      return activeThreadId
    }
    const map = state?.threadStateById && typeof state.threadStateById === 'object'
      ? state.threadStateById
      : {}
    for (const [threadId, threadState] of Object.entries(map)) {
      const messages = Array.isArray(threadState?.messages) ? threadState.messages : []
      if (messages.some((entry) => String(entry?.id || '').trim() === targetId)) {
        return resolveThreadSessionId(state, threadId)
      }
    }
    return activeThreadId
  }
  const resolveTargetThreadId = (state, {
    explicitThreadId = '',
    messageId = '',
  } = {}) => {
    if (!hasThreadRouting) return ''
    const explicit = normalizeThreadId(explicitThreadId)
    if (explicit) {
      const resolvedExplicit = resolveThreadSessionId(state, explicit)
      const targetId = String(messageId || '').trim()
      if (!targetId) return resolvedExplicit

      const messageExistsInExplicitThread = (() => {
        const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
        if (resolvedExplicit === activeThreadId) {
          const activeRows = Array.isArray(state?.messages) ? state.messages : []
          return activeRows.some((entry) => String(entry?.id || '').trim() === targetId)
        }
        const map = state?.threadStateById && typeof state.threadStateById === 'object'
          ? state.threadStateById
          : {}
        const rows = Array.isArray(map?.[resolvedExplicit]?.messages) ? map[resolvedExplicit].messages : []
        return rows.some((entry) => String(entry?.id || '').trim() === targetId)
      })()
      if (messageExistsInExplicitThread) return resolvedExplicit
    }
    const byMessage = findThreadIdByMessageId(state, messageId)
    if (byMessage) return byMessage
    return explicit ? resolveThreadSessionId(state, explicit) : resolveThreadSessionId(state, state?.activeThreadId)
  }

  return {
    appendExecutionCommentary: (payload = {}) => {
      const turnId = String(payload?.turnId || payload?.streamMeta?.turnId || '').trim()
      const chunk = String(payload?.chunk ?? payload?.text ?? '')
      if (!turnId || !chunk) return
      const requestedThreadId = normalizeThreadId(payload?.threadId || payload?.streamMeta?.threadId)
      const eventAt = Number(payload?.emittedAt || payload?.streamMeta?.lastChunkAt || payload?.streamMeta?.startedAt || 0) || now()
      const streamMeta = payload?.streamMeta && typeof payload.streamMeta === 'object'
        ? payload.streamMeta
        : {
            threadId: requestedThreadId,
            turnId,
          }
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId }),
          (thread) => ({
            liveExecution: appendExecutionCommentaryToLiveExecution(thread.liveExecution, {
              threadId: requestedThreadId,
              turnId,
              round: payload?.round,
              chunk,
              emittedAt: eventAt,
              forceNewBlock: payload?.forceNewBlock === true,
              reasoningMeta: payload?.reasoningMeta || null,
              streamMeta,
            }),
          }),
        ))
        return
      }
      set((s) => ({
        liveExecution: appendExecutionCommentaryToLiveExecution(s.liveExecution, {
          threadId: requestedThreadId,
          turnId,
          round: payload?.round,
          chunk,
          emittedAt: eventAt,
          forceNewBlock: payload?.forceNewBlock === true,
          reasoningMeta: payload?.reasoningMeta || null,
          streamMeta,
        }),
      }))
    },

    patchExecutionCommentaryMetadata: ({
      threadId = '',
      turnId = '',
      round = null,
      reasoningMeta = null,
      streamMeta = null,
    } = {}) => {
      const normalizedTurnId = String(turnId || streamMeta?.turnId || '').trim()
      if (!normalizedTurnId) return
      const requestedThreadId = normalizeThreadId(threadId || streamMeta?.threadId)
      const applyPatch = (liveExecution) => patchLiveExecutionReasoningMetadata(
        liveExecution || createEmptyLiveExecutionState(),
        {
          threadId: requestedThreadId,
          turnId: normalizedTurnId,
          messageId: round == null ? '' : resolveLiveExecutionCommentaryMessageId(normalizedTurnId, round),
          reasoningRole: 'commentary',
          reasoningMeta,
          streamMeta,
        },
      )
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId }),
          (thread) => ({
            liveExecution: applyPatch(thread.liveExecution),
          }),
        ))
        return
      }
      set((s) => ({
        liveExecution: applyPatch(s.liveExecution),
      }))
    },

    markExecutionCommentaryDone: ({
      threadId = '',
      turnId = '',
      round = null,
      reasoningMeta = null,
      streamMeta = null,
    } = {}) => {
      const normalizedTurnId = String(turnId || streamMeta?.turnId || '').trim()
      if (!normalizedTurnId) return
      const requestedThreadId = normalizeThreadId(threadId || streamMeta?.threadId)
      const applyPatch = (liveExecution) => markLiveExecutionReasoningDone(
        liveExecution || createEmptyLiveExecutionState(),
        {
          threadId: requestedThreadId,
          turnId: normalizedTurnId,
          messageId: round == null ? '' : resolveLiveExecutionCommentaryMessageId(normalizedTurnId, round),
          reasoningRole: 'commentary',
          reasoningMeta,
          streamMeta,
        },
      )
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId }),
          (thread) => ({
            liveExecution: applyPatch(thread.liveExecution),
          }),
        ))
        return
      }
      set((s) => ({
        liveExecution: applyPatch(s.liveExecution),
      }))
    },

    appendReasoning: (id, chunk, options = {}) => {
      const delta = String(chunk ?? '')
      if (!delta) return
      const requestedThreadId = normalizeThreadId(options?.threadId)
      if (isReasoningPhaseBoundary(delta)) {
        if (hasThreadRouting) {
          set((s) => updateThreadSessionState(
            s,
            resolveTargetThreadId(s, { explicitThreadId: requestedThreadId, messageId: id }),
            (thread) => {
              const next = updateMessageAndTimelineById(thread, id, appendReasoningPhaseBoundaryUpdate)
              if (!hasOwnPatch(next)) return null
              const merged = { ...thread, ...next }
              const message = getAssistantMessageById(merged, id)
              return {
                ...next,
                liveExecution: message
                  ? appendReasoningPhaseBoundaryLiveExecution(merged.liveExecution, message, now)
                  : (merged.liveExecution || createEmptyLiveExecutionState()),
              }
            },
          ))
          return
        }
        set((s) => {
          const next = updateMessageAndTimelineById(s, id, appendReasoningPhaseBoundaryUpdate)
          const merged = { ...s, ...next }
          const message = getAssistantMessageById(merged, id)
          return {
            ...next,
            liveExecution: message
              ? appendReasoningPhaseBoundaryLiveExecution(merged.liveExecution, message, now)
              : (merged.liveExecution || createEmptyLiveExecutionState()),
          }
        })
        return
      }
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId, messageId: id }),
          (thread) => {
            let segments = []
            let startsNewBlock = false
            const next = updateMessageAndTimelineById(thread, id, (target) => {
              const segmentedTarget = applyExplicitReasoningSegment(target, options)
              const combined = String(segmentedTarget?.reasoningLiveBuffer || '') + delta
              const split = promoteFormattingContinuationSplit(
                collectDisplayReadyReasoningSegments(combined),
                delta,
                normalizeReasoningText(segmentedTarget?.reasoning),
              )
              segments = split.segments
              startsNewBlock = segmentedTarget?.reasoningLiveStartsNewBlock === true
              return {
                ...segmentedTarget,
                reasoning: normalizeReasoningText(segmentedTarget?.reasoning) + delta,
                reasoningLiveBuffer: split.rest,
                reasoningLiveStartsNewBlock: split.restStartsNewBlock === true,
              }
            })
            if (!hasOwnPatch(next)) return null
            const merged = { ...thread, ...next }
            const message = getAssistantMessageById(merged, id)
            return {
              ...next,
              liveExecution: message
                ? appendReasoningSegmentsToLiveExecution(merged.liveExecution, message, segments, now, { startsNewBlock, emittedAt: options?.emittedAt })
                : (merged.liveExecution || createEmptyLiveExecutionState()),
            }
          },
        ))
        return
      }
      set((s) => {
        let segments = []
        let startsNewBlock = false
        const next = updateMessageAndTimelineById(s, id, (target) => {
          const segmentedTarget = applyExplicitReasoningSegment(target, options)
          const combined = String(segmentedTarget?.reasoningLiveBuffer || '') + delta
          const split = promoteFormattingContinuationSplit(
            collectDisplayReadyReasoningSegments(combined),
            delta,
            normalizeReasoningText(segmentedTarget?.reasoning),
          )
          segments = split.segments
          startsNewBlock = segmentedTarget?.reasoningLiveStartsNewBlock === true
          return {
            ...segmentedTarget,
            reasoning: normalizeReasoningText(segmentedTarget?.reasoning) + delta,
            reasoningLiveBuffer: split.rest,
            reasoningLiveStartsNewBlock: split.restStartsNewBlock === true,
          }
        })
        const merged = { ...s, ...next }
        const message = getAssistantMessageById(merged, id)
        return {
          ...next,
          liveExecution: message
            ? appendReasoningSegmentsToLiveExecution(merged.liveExecution, message, segments, now, { startsNewBlock, emittedAt: options?.emittedAt })
            : (merged.liveExecution || createEmptyLiveExecutionState()),
        }
      })
    },

    setStreamMeta: (id, patch = {}, options = {}) => {
      const targetId = String(id ?? '').trim()
      if (!targetId) return
      const requestedThreadId = normalizeThreadId(options?.threadId || patch?.threadId)
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId, messageId: targetId }),
          (thread) => {
            const next = updateMessageAndTimelineById(thread, targetId, (target) => ({
              ...target,
              streamMeta: computeDerivedStreamMeta(normalizeStreamMetaPatch(target?.streamMeta, patch)),
            }))
            if (!hasOwnPatch(next)) return null
            const merged = { ...thread, ...next }
            return {
              ...next,
              liveExecution: patchLiveReasoningMetadataFromMessage(merged, targetId),
            }
          },
        ))
        return
      }
      set((s) => {
        const next = updateMessageAndTimelineById(s, targetId, (target) => ({
          ...target,
          streamMeta: computeDerivedStreamMeta(normalizeStreamMetaPatch(target?.streamMeta, patch)),
        }))
        const merged = { ...s, ...next }
        return {
          ...next,
          liveExecution: patchLiveReasoningMetadataFromMessage(merged, targetId),
        }
      })
    },

    markStreamStarted: (id, meta = {}, options = {}) => {
      const targetId = String(id ?? '').trim()
      if (!targetId) return
      const startedAt = Number(meta?.startedAt || 0) || now()
      const requestedThreadId = normalizeThreadId(options?.threadId || meta?.threadId)
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId, messageId: targetId }),
          (thread) => {
            const next = updateMessageAndTimelineById(thread, targetId, (target) => ({
              ...target,
              streamMeta: computeDerivedStreamMeta(normalizeStreamMetaPatch(target?.streamMeta, {
                ...meta,
                startedAt,
                cancelled: false,
                error: false,
              })),
            }))
            if (!hasOwnPatch(next)) return null
            const merged = { ...thread, ...next }
            return {
              ...next,
              liveExecution: patchLiveReasoningMetadataFromMessage(merged, targetId),
            }
          },
        ))
        return
      }
      set((s) => {
        const next = updateMessageAndTimelineById(s, targetId, (target) => ({
          ...target,
          streamMeta: computeDerivedStreamMeta(normalizeStreamMetaPatch(target?.streamMeta, {
            ...meta,
            startedAt,
            cancelled: false,
            error: false,
          })),
        }))
        const merged = { ...s, ...next }
        return {
          ...next,
          liveExecution: patchLiveReasoningMetadataFromMessage(merged, targetId),
        }
      })
    },

    recordStreamFlush: (id, { channel = 'text', chars = 0, countIncrement = 1, at = 0, threadId = '' } = {}) => {
      const targetId = String(id ?? '').trim()
      if (!targetId) return
      const flushAt = Number(at || 0) || now()
      const safeChars = Math.max(0, Number(chars || 0) || 0)
      const safeInc = Math.max(0, Number(countIncrement || 0) || 0)
      const isReasoning = String(channel || '').trim().toLowerCase() === 'reasoning'
      const requestedThreadId = normalizeThreadId(threadId)
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId, messageId: targetId }),
          (thread) => {
            const next = updateMessageAndTimelineById(thread, targetId, (target) => {
              const prev = target?.streamMeta && typeof target.streamMeta === 'object' ? target.streamMeta : {}
              const patch = isReasoning
                ? {
                  reasoningFlushCount: (Number(prev.reasoningFlushCount || 0) || 0) + safeInc,
                  reasoningCharsStreamed: prev.reasoningCharsStreamed,
                  lastFlushAt: flushAt,
                }
                : {
                  textFlushCount: (Number(prev.textFlushCount || 0) || 0) + safeInc,
                  textCharsStreamed: prev.textCharsStreamed,
                  lastFlushAt: flushAt,
                }
              if (safeChars > 0 && isReasoning && !patch.reasoningCharsStreamed) patch.reasoningCharsStreamed = Number(prev.reasoningCharsStreamed || 0) || 0
              if (safeChars > 0 && !isReasoning && !patch.textCharsStreamed) patch.textCharsStreamed = Number(prev.textCharsStreamed || 0) || 0
              return {
                ...target,
                streamMeta: computeDerivedStreamMeta(normalizeStreamMetaPatch(prev, patch)),
              }
            })
            return hasOwnPatch(next) ? next : null
          },
        ))
        return
      }
      set((s) => updateMessageAndTimelineById(s, targetId, (target) => {
        const prev = target?.streamMeta && typeof target.streamMeta === 'object' ? target.streamMeta : {}
        const patch = isReasoning
          ? {
            reasoningFlushCount: (Number(prev.reasoningFlushCount || 0) || 0) + safeInc,
            reasoningCharsStreamed: prev.reasoningCharsStreamed,
            lastFlushAt: flushAt,
          }
          : {
            textFlushCount: (Number(prev.textFlushCount || 0) || 0) + safeInc,
            textCharsStreamed: prev.textCharsStreamed,
            lastFlushAt: flushAt,
          }
        if (safeChars > 0 && isReasoning && !patch.reasoningCharsStreamed) patch.reasoningCharsStreamed = Number(prev.reasoningCharsStreamed || 0) || 0
        if (safeChars > 0 && !isReasoning && !patch.textCharsStreamed) patch.textCharsStreamed = Number(prev.textCharsStreamed || 0) || 0
        return {
          ...target,
          streamMeta: computeDerivedStreamMeta(normalizeStreamMetaPatch(prev, patch)),
        }
      }))
    },

    finalizeStreamMeta: (id, meta = {}, options = {}) => {
      const targetId = String(id ?? '').trim()
      if (!targetId) return
      const patch = meta && typeof meta === 'object' ? { ...meta } : {}
      if (!patch.completedAt) patch.completedAt = now()
      const requestedThreadId = normalizeThreadId(options?.threadId || patch?.threadId)
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId, messageId: targetId }),
          (thread) => {
            const next = updateMessageAndTimelineById(thread, targetId, (target) => ({
              ...target,
              streamMeta: computeDerivedStreamMeta(normalizeStreamMetaPatch(target?.streamMeta, patch)),
            }), false)
            if (!hasOwnPatch(next)) return null
            const merged = { ...thread, ...next }
            return {
              ...next,
              liveExecution: patchLiveReasoningMetadataFromMessage(merged, targetId),
            }
          },
        ))
        return
      }
      set((s) => {
        const next = updateMessageAndTimelineById(s, targetId, (target) => ({
          ...target,
          streamMeta: computeDerivedStreamMeta(normalizeStreamMetaPatch(target?.streamMeta, patch)),
        }), false)
        const merged = { ...s, ...next }
        return {
          ...next,
          liveExecution: patchLiveReasoningMetadataFromMessage(merged, targetId),
        }
      })
    },

    setReasoningMeta: (id, patch = {}, options = {}) => {
      const targetId = String(id ?? '').trim()
      if (!targetId) return
      const patchObj = patch && typeof patch === 'object' ? patch : {}
      const requestedThreadId = normalizeThreadId(options?.threadId || patchObj?.threadId)
      if (hasThreadRouting) {
        set((s) => {
          const normalizeMeta = (prev) => {
            const current = prev && typeof prev === 'object' ? prev : {}
            const next = { ...current, ...patchObj }
            if (!next.mode) next.mode = current.mode || 'none'
            next.chunkCount = Number(next.chunkCount || 0) || 0
            next.charsStreamed = Number(next.charsStreamed || 0) || 0
            if (next.firstChunkAt != null) {
              const n = Number(next.firstChunkAt || 0) || 0
              if (n > 0) next.firstChunkAt = n
              else delete next.firstChunkAt
            }
            if (next.lastChunkAt != null) {
              const n = Number(next.lastChunkAt || 0) || 0
              if (n > 0) next.lastChunkAt = n
              else delete next.lastChunkAt
            }
            if (next.reasoningTokens != null) {
              const n = Number(next.reasoningTokens || 0) || 0
              if (n > 0) next.reasoningTokens = n
              else delete next.reasoningTokens
            }
            return next
          }
          return updateThreadSessionState(
            s,
            resolveTargetThreadId(s, { explicitThreadId: requestedThreadId, messageId: targetId }),
            (thread) => {
              const next = updateMessageAndTimelineById(thread, targetId, (target) => ({
                ...target,
                reasoningMeta: normalizeMeta(target?.reasoningMeta),
              }))
              if (!hasOwnPatch(next)) return null
              const merged = { ...thread, ...next }
              return {
                ...next,
                liveExecution: patchLiveReasoningMetadataFromMessage(merged, targetId),
              }
            },
          )
        })
        return
      }
      set((s) => {
        const normalizeMeta = (prev) => {
          const current = prev && typeof prev === 'object' ? prev : {}
          const next = { ...current, ...patchObj }
          if (!next.mode) next.mode = current.mode || 'none'
          next.chunkCount = Number(next.chunkCount || 0) || 0
          next.charsStreamed = Number(next.charsStreamed || 0) || 0
          if (next.firstChunkAt != null) {
            const n = Number(next.firstChunkAt || 0) || 0
            if (n > 0) next.firstChunkAt = n
            else delete next.firstChunkAt
          }
          if (next.lastChunkAt != null) {
            const n = Number(next.lastChunkAt || 0) || 0
            if (n > 0) next.lastChunkAt = n
            else delete next.lastChunkAt
          }
          if (next.reasoningTokens != null) {
            const n = Number(next.reasoningTokens || 0) || 0
            if (n > 0) next.reasoningTokens = n
            else delete next.reasoningTokens
          }
          return next
        }

        const next = updateMessageAndTimelineById(s, targetId, (target) => ({
          ...target,
          reasoningMeta: normalizeMeta(target?.reasoningMeta),
        }))
        const merged = { ...s, ...next }
        return {
          ...next,
          liveExecution: patchLiveReasoningMetadataFromMessage(merged, targetId),
        }
      })
    },

    finalizeReasoning: (id, stepText, options = {}) => {
      const text = String(stepText ?? '').trim()
      const authoritative = options?.authoritative === true
      const currentText = String(options?.currentText ?? text).trim()
      const requestedThreadId = normalizeThreadId(options?.threadId)
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId, messageId: id }),
          (thread) => {
            let flushedSegments = []
            let startsNewBlock = false
            let shouldAppendFallback = false
            const next = updateMessageAndTimelineById(thread, id, (target) => {
              const segmentedTarget = applyExplicitReasoningSegment(target, options)
              if (authoritative) {
                return {
                  ...segmentedTarget,
                  reasoning: text,
                  reasoningDone: false,
                  reasoningLiveBuffer: '',
                  reasoningLiveStartsNewBlock: false,
                }
              }
              const existing = normalizeReasoningText(segmentedTarget?.reasoning).trimEnd()
              const buffered = String(segmentedTarget?.reasoningLiveBuffer || '')
              const split = collectDisplayReadyReasoningSegments(buffered, { forceFlush: true })
              flushedSegments = split.segments
              startsNewBlock = segmentedTarget?.reasoningLiveStartsNewBlock === true
              const mergedComparable = normalizeComparableReasoning([existing, buffered].filter(Boolean).join('\n'))
              const textComparable = normalizeComparableReasoning(text)
              const contentComparable = normalizeComparableReasoning(segmentedTarget?.content)
              shouldAppendFallback = !!(
                textComparable
                && textComparable !== contentComparable
                && !mergedComparable.includes(textComparable)
              )
              const merged = shouldAppendFallback
                ? (existing ? `${existing}\n\n---\n\n${text}` : text)
                : existing
              return {
                ...segmentedTarget,
                reasoning: merged,
                reasoningDone: false,
                reasoningLiveBuffer: split.rest,
                reasoningLiveStartsNewBlock: split.restStartsNewBlock === true,
              }
            })
            if (!hasOwnPatch(next)) return null
            const mergedState = { ...thread, ...next }
            const message = getAssistantMessageById(mergedState, id)
            if (!message) {
              return {
                ...next,
                liveExecution: mergedState.liveExecution || createEmptyLiveExecutionState(),
              }
            }
            if (authoritative) {
              return applyAuthoritativeReasoningSnapshot(next, mergedState, message, currentText, now)
            }
            const liveExecution = appendReasoningSegmentsToLiveExecution(
              mergedState.liveExecution,
              message,
              flushedSegments,
              now,
              { startsNewBlock },
            )
            return {
              ...next,
              liveExecution: shouldAppendFallback
                ? appendReasoningSegmentsToLiveExecution(liveExecution, message, [text], now)
                : patchLiveReasoningMetadataFromMessage({ ...mergedState, liveExecution }, id),
            }
          },
        ))
        return
      }
      set((s) => {
        let flushedSegments = []
        let startsNewBlock = false
        let shouldAppendFallback = false
        const next = updateMessageAndTimelineById(s, id, (target) => {
          const segmentedTarget = applyExplicitReasoningSegment(target, options)
          if (authoritative) {
            return {
              ...segmentedTarget,
              reasoning: text,
              reasoningDone: false,
              reasoningLiveBuffer: '',
              reasoningLiveStartsNewBlock: false,
            }
          }
          const existing = normalizeReasoningText(segmentedTarget?.reasoning).trimEnd()
          const buffered = String(segmentedTarget?.reasoningLiveBuffer || '')
          const split = collectDisplayReadyReasoningSegments(buffered, { forceFlush: true })
          flushedSegments = split.segments
          startsNewBlock = segmentedTarget?.reasoningLiveStartsNewBlock === true
          const mergedComparable = normalizeComparableReasoning([existing, buffered].filter(Boolean).join('\n'))
          const textComparable = normalizeComparableReasoning(text)
          const contentComparable = normalizeComparableReasoning(segmentedTarget?.content)
          shouldAppendFallback = !!(
            textComparable
            && textComparable !== contentComparable
            && !mergedComparable.includes(textComparable)
          )
          const merged = shouldAppendFallback
            ? (existing ? `${existing}\n\n---\n\n${text}` : text)
            : existing
          return {
            ...segmentedTarget,
            reasoning: merged,
            reasoningDone: false,
            reasoningLiveBuffer: split.rest,
            reasoningLiveStartsNewBlock: split.restStartsNewBlock === true,
          }
        })
        const mergedState = { ...s, ...next }
        const message = getAssistantMessageById(mergedState, id)
        if (!message) {
          return {
            ...next,
            liveExecution: mergedState.liveExecution || createEmptyLiveExecutionState(),
          }
        }
        if (authoritative) {
          return applyAuthoritativeReasoningSnapshot(next, mergedState, message, currentText, now)
        }
        let liveExecution = appendReasoningSegmentsToLiveExecution(
          mergedState.liveExecution,
          message,
          flushedSegments,
          now,
          { startsNewBlock },
        )
        return {
          ...next,
          liveExecution: shouldAppendFallback
            ? appendReasoningSegmentsToLiveExecution(liveExecution, message, [text], now)
            : patchLiveReasoningMetadataFromMessage({ ...mergedState, liveExecution }, id),
        }
      })
    },

    markReasoningDone: (id, options = {}) => {
      const requestedThreadId = normalizeThreadId(options?.threadId)
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(
          s,
          resolveTargetThreadId(s, { explicitThreadId: requestedThreadId, messageId: id }),
          (thread) => {
            let flushedSegments = []
            let startsNewBlock = false
            const next = updateMessageAndTimelineById(thread, id, (target) => ({
              ...target,
              reasoningDone: true,
              reasoningLiveBuffer: (() => {
                const split = collectDisplayReadyReasoningSegments(String(target?.reasoningLiveBuffer || ''), { forceFlush: true })
                flushedSegments = split.segments
                startsNewBlock = target?.reasoningLiveStartsNewBlock === true
                return split.rest
              })(),
              reasoningLiveStartsNewBlock: false,
            }))
            if (!hasOwnPatch(next)) return null
            const merged = { ...thread, ...next }
            const message = getAssistantMessageById(merged, id)
            const liveExecution = message
              ? appendReasoningSegmentsToLiveExecution(merged.liveExecution, message, flushedSegments, now, { startsNewBlock })
              : (merged.liveExecution || createEmptyLiveExecutionState())
            return {
              ...next,
              liveExecution: markLiveReasoningDoneFromMessage({ ...merged, liveExecution }, id),
            }
          },
        ))
        return
      }
      set((s) => {
        let flushedSegments = []
        let startsNewBlock = false
        const next = updateMessageAndTimelineById(s, id, (target) => ({
          ...target,
          reasoningDone: true,
          reasoningLiveBuffer: (() => {
            const split = collectDisplayReadyReasoningSegments(String(target?.reasoningLiveBuffer || ''), { forceFlush: true })
            flushedSegments = split.segments
            startsNewBlock = target?.reasoningLiveStartsNewBlock === true
            return split.rest
          })(),
          reasoningLiveStartsNewBlock: false,
        }))
        const merged = { ...s, ...next }
        const message = getAssistantMessageById(merged, id)
        const liveExecution = message
          ? appendReasoningSegmentsToLiveExecution(merged.liveExecution, message, flushedSegments, now, { startsNewBlock })
          : (merged.liveExecution || createEmptyLiveExecutionState())
        return {
          ...next,
          liveExecution: markLiveReasoningDoneFromMessage({ ...merged, liveExecution }, id),
        }
      })
    },
  }
}
