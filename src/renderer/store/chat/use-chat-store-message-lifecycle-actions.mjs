import { pruneDuplicatedFinalReasoningFromLiveExecution } from './live-execution-store.mjs'
import { buildCanonicalFinalDocument } from '../../../common/chat/final-document-contract.mjs'

const OPENAI_ACCOUNT_TRANSPORT_MODES = new Set([
  'codex_app_server_chatgpt',
  'codex_app_server_chatgpt_background',
])

function normalizeLifecycleString(value = '') {
  return String(value || '').trim()
}

function normalizeLifecycleLower(value = '') {
  return normalizeLifecycleString(value).toLowerCase()
}

function buildStreamingStateResetPatch(thread = {}, messageId = '') {
  const targetId = normalizeLifecycleString(messageId)
  const activeStreamingId = normalizeLifecycleString(thread?.streamingId)
  if (!activeStreamingId || activeStreamingId === targetId) {
    return {
      streamingId: null,
      streamingMessageIndex: null,
      streamingTimelineIndex: null,
    }
  }
  return {}
}

function resolveFinalizedAssistantContent({
  incomingContent = '',
  existingContent = '',
  target = null,
  meta = {},
} = {}) {
  const normalizedIncoming = String(incomingContent ?? '')
  if (normalizedIncoming.trim().length > 0) return normalizedIncoming

  const normalizedExisting = String(existingContent ?? '')
  if (normalizedExisting.trim().length > 0) return normalizedExisting

  const streamMeta = target?.streamMeta && typeof target.streamMeta === 'object'
    ? target.streamMeta
    : {}
  const transportMode = normalizeLifecycleLower(meta?.transportMode || streamMeta?.transportMode)
  const isOpenAIAccountTurn = OPENAI_ACCOUNT_TRANSPORT_MODES.has(transportMode)
  if (!isOpenAIAccountTurn) return ''

  // Keep this transport-local: account turns can complete successfully with an
  // empty final payload, but we still need a non-blank assistant bubble.
  return 'Completed, but no final answer text was returned.'
}

function buildFinalizedMessageDocument(message = null, meta = {}) {
  const messageId = String(message?.id || '').trim()
  if (!messageId) return null
  const streamMeta = message?.streamMeta && typeof message.streamMeta === 'object'
    ? message.streamMeta
    : {}
  return buildCanonicalFinalDocument({
    threadId: String(meta?.threadId || streamMeta?.threadId || '').trim(),
    turnId: String(meta?.turnId || streamMeta?.turnId || '').trim(),
    messageId,
    text: String(message?.content ?? ''),
    finalDocument: meta?.finalDocument || message?.finalDocument,
    hasAuthoritativeMessageBinding: true,
  })
}

export function createMessageLifecycleActions({
  set,
  now,
  createEmptyLiveExecutionState,
  createEmptyContextUsage,
  createEmptyCostEstimate,
  createEmptyContinuityStatus,
  resolveStreamingIndexes,
  resolveThreadSessionId,
  resolveTargetThreadIdForMessage,
  updateMessageAndTimelineById,
  updateThreadSessionState,
  upsertTimelineMessage,
  normalizeAssistantPhase,
  normalizeStreamMetaPatch,
  computeDerivedStreamMeta,
  getThreadDebugEnabled = () => false,
  normalizeQuestionUserRequest = (value) => value ?? null,
} = {}) {
  return {
    markBackgroundPending: (id, note = '', meta = {}) => {
      const targetId = String(id ?? '').trim()
      if (!targetId) return
      const queuedAt = Number(meta?.queuedAt || 0) || now()
      const patch = {
        threadId: String(meta?.threadId || '').trim(),
        turnId: String(meta?.turnId || '').trim(),
        startedAt: queuedAt,
        backgroundJobId: String(meta?.jobId || '').trim(),
        backgroundResponseId: String(meta?.responseId || '').trim(),
        queuedAt,
      }
      const requestedThreadId = String(meta?.threadId || '').trim()
      set((s) => updateThreadSessionState(
        s,
        resolveTargetThreadIdForMessage(s, requestedThreadId, targetId),
        (thread) => updateMessageAndTimelineById(thread, targetId, (target) => ({
          ...target,
          content: String(note ?? '').trim(),
          status: 'background_pending',
          streamMeta: computeDerivedStreamMeta(normalizeStreamMetaPatch(target?.streamMeta, patch)),
        })),
      ))
    },

    finalizeMessage: (id, fullContent, meta = {}) => {
      const phase = normalizeAssistantPhase(meta?.phase)
      const requestedThreadId = String(meta?.threadId || '').trim()
      const normalizedQuestionUser = normalizeQuestionUserRequest(meta?.questionUser)
      if (getThreadDebugEnabled()) {
        console.debug('[thread-session] stream:finalize', { threadId: requestedThreadId, messageId: id })
      }
      set((s) => updateThreadSessionState(
        s,
        resolveTargetThreadIdForMessage(s, requestedThreadId, id),
        (thread) => {
          const { messageIndex } = resolveStreamingIndexes(thread, id)
          let messages = thread.messages
          let fallbackMessage = null
          if (messageIndex >= 0) {
            messages = [...thread.messages]
            const target = messages[messageIndex]
            const incomingContent = String(fullContent ?? '')
            const existingContent = String(target?.content ?? '')
            const resolvedContent = resolveFinalizedAssistantContent({
              incomingContent,
              existingContent,
              target,
              meta,
            })
            const updated = {
              ...target,
              content: resolvedContent,
              status: 'done',
              ...(phase ? { phase } : {}),
              ...(Array.isArray(meta?.providerHistoryParts) ? { providerHistoryParts: meta.providerHistoryParts } : {}),
              ...(Array.isArray(meta?.generatedArtifacts) ? { generatedArtifacts: meta.generatedArtifacts } : {}),
            }
            const canonicalFinalDocument = buildFinalizedMessageDocument(updated, meta)
            if (canonicalFinalDocument) updated.finalDocument = canonicalFinalDocument
            messages[messageIndex] = updated
            fallbackMessage = updated
          }
          if (!fallbackMessage) {
            const existingMessage = messages.find((m) => m.id === id) || null
            fallbackMessage = existingMessage || {
              id,
              role: 'assistant',
              content: fullContent,
              status: 'done',
              ...(phase ? { phase } : {}),
              reasoning: '',
              reasoningDone: true,
              ...(Array.isArray(meta?.providerHistoryParts) ? { providerHistoryParts: meta.providerHistoryParts } : {}),
              ...(Array.isArray(meta?.generatedArtifacts) ? { generatedArtifacts: meta.generatedArtifacts } : {}),
            }
            if (existingMessage && (
              phase
              || Array.isArray(meta?.providerHistoryParts)
              || Array.isArray(meta?.generatedArtifacts)
            )) {
              fallbackMessage = {
                ...existingMessage,
                ...(phase ? { phase } : {}),
                ...(Array.isArray(meta?.providerHistoryParts) ? { providerHistoryParts: meta.providerHistoryParts } : {}),
                ...(Array.isArray(meta?.generatedArtifacts) ? { generatedArtifacts: meta.generatedArtifacts } : {}),
              }
            }
            const canonicalFinalDocument = buildFinalizedMessageDocument(fallbackMessage, meta)
            if (canonicalFinalDocument) fallbackMessage = {
              ...fallbackMessage,
              finalDocument: canonicalFinalDocument,
            }
          }
          const finalizedMessage = fallbackMessage
          const timeline = upsertTimelineMessage(
            thread.timeline,
            id,
            () => finalizedMessage,
          )
          const liveExecution = pruneDuplicatedFinalReasoningFromLiveExecution(
            thread.liveExecution || createEmptyLiveExecutionState(),
            {
              turnId: String(finalizedMessage?.streamMeta?.turnId || meta?.turnId || '').trim(),
              messageId: String(id || '').trim(),
              assistantText: String(finalizedMessage?.content || '').trim(),
            },
          )
          return {
            messages,
            timeline,
            liveExecution,
            ...buildStreamingStateResetPatch(thread, id),
            pendingQuestionUser: normalizedQuestionUser ?? thread.pendingQuestionUser ?? null,
          }
        },
      ))
    },

    markError: (id, errorText, options = {}) => {
      const requestedThreadId = String(options?.threadId || '').trim()
      if (getThreadDebugEnabled()) {
        console.debug('[thread-session] stream:error', { threadId: requestedThreadId, messageId: id, error: String(errorText || '').slice(0, 120) })
      }
      set((s) => updateThreadSessionState(
        s,
        resolveTargetThreadIdForMessage(s, requestedThreadId, id),
        (thread) => {
          const { messageIndex } = resolveStreamingIndexes(thread, id)
          let messages = thread.messages
          let fallbackMessage = null
          if (messageIndex >= 0) {
            messages = [...thread.messages]
            const target = messages[messageIndex]
            const updated = { ...target, content: errorText, status: 'error' }
            messages[messageIndex] = updated
            fallbackMessage = updated
          }
          if (!fallbackMessage) {
            fallbackMessage = messages.find((m) => m.id === id) || {
              id,
              role: 'assistant',
              content: errorText,
              status: 'error',
            }
          }
          const timeline = upsertTimelineMessage(
            thread.timeline,
            id,
            () => fallbackMessage,
          )
          return {
            messages,
            timeline,
            ...buildStreamingStateResetPatch(thread, id),
          }
        },
      ))
    },

    cancelStreaming: (note = '', options = {}) => {
      const requestedThreadId = String(options?.threadId || '').trim()
      if (getThreadDebugEnabled()) {
        console.debug('[thread-session] stream:cancel', { threadId: requestedThreadId, note: note.slice(0, 80) })
      }
      set((s) => updateThreadSessionState(
        s,
        requestedThreadId || s.activeThreadId,
        (thread) => {
          const text = String(note ?? '').trim()
          const hasStreaming = thread.messages.some((m) => m.status === 'streaming')
          if (!hasStreaming && !thread.streamingId) return null

          const messages = thread.messages.map((m) => {
            if (m.status !== 'streaming') return m
            if (!text) return { ...m, status: 'done', reasoningDone: true }
            const content = String(m.content ?? '')
            const withNote = content.trim().length > 0
              ? `${content}\n\n[${text}]`
              : `[${text}]`
            return { ...m, content: withNote, status: 'done', reasoningDone: true }
          })
          const movedIds = messages
            .filter((m) => m.status === 'done' && thread.messages.some((old) => old.id === m.id && old.status === 'streaming'))
            .map((m) => m.id)
          let timeline = [...thread.timeline]
          for (const messageId of movedIds) {
            const resolved = messages.find((m) => m.id === messageId)
            timeline = upsertTimelineMessage(
              timeline,
              messageId,
              () => resolved || null,
            )
          }

          return {
            messages,
            timeline,
            streamingId: null,
            streamingMessageIndex: null,
            streamingTimelineIndex: null,
          }
        },
      ))
    },

    clearMessages: () => set((s) => {
      const activeThreadId = resolveThreadSessionId(s, s.activeThreadId)
      const nextTotals = { ...(s.threadUsageTotals || {}) }
      delete nextTotals[activeThreadId]
      return {
        threadUsageTotals: nextTotals,
        ...updateThreadSessionState(s, activeThreadId, () => ({
          messages: [],
          timeline: [],
          streamingId: null,
          streamingMessageIndex: null,
          streamingTimelineIndex: null,
          toolActivity: [],
          liveExecution: createEmptyLiveExecutionState(),
          contextUsage: createEmptyContextUsage(),
          costEstimate: createEmptyCostEstimate(),
          continuityStatus: createEmptyContinuityStatus(),
          notices: [],
          suppressedNoticeKeys: [],
          pendingQuestionUser: null,
          providerSwitchHint: null,
          pendingContextPrefix: '',
          agentFanoutConfirmRequest: null,
          writeConflicts: [],
        })),
      }
    }),
  }
}
