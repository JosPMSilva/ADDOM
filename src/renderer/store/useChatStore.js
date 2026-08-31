import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { now, resolveStreamingIndexes, withActivityTimestamp, toTimelineMessage, toTimelineTool, upsertTimelineMessage } from './chat/activity-builders.mjs'
import { createEmptyContextUsage, createEmptyCostEstimate, createEmptyContinuityStatus } from './chat/usage-normalizers.mjs'
import { mapTimelineFromPersistedEvents } from './chat/timeline-hydration.mjs'
import {
  appendCappedItem,
  appendTrimmedTimelineRow,
  primeModelCapabilities,
  canonicalizeSelectedModel,
  normalizePendingContextPrefixPayload,
  buildProviderSwitchHint,
  normalizeStreamMetaPatch,
  computeDerivedStreamMeta,
  updateMessageAndTimelineById,
  createUsageContinuityActions,
} from './chat/use-chat-store-helpers.mjs'
import { sanitizeLegacyPlanState } from './chat/legacy-plan-state-migration.mjs'
import { dedupeWriteConflicts, normalizeWriteConflict } from './chat/write-conflict-utils.mjs'
import {
  createEmptyLiveExecutionState,
  upsertLiveExecutionActivity,
  appendLiveExecutionToolOutput,
} from './chat/live-execution-store.mjs'
import {
  buildChatRouteRestoreState,
  buildThreadSelectionState,
  buildThreadProjectionPatch,
  createEmptyThreadSession,
  getThreadSessionSnapshot,
  normalizeThreadSessionId,
  resolveAppActiveThreadId,
  resolveTargetThreadIdForMessage,
  resolveThreadSessionId,
  removeThreadSessionState,
  threadSessionHasLiveState,
  updateThreadSessionState,
} from './chat/thread-session-store-utils.mjs'
import { createChatStorePersistConfig } from './chat/use-chat-store-persist-config.mjs'
import { createNoticeActions } from './chat/use-chat-store-notice-actions.mjs'
import { createReasoningActions } from './chat/use-chat-store-reasoning-actions.mjs'
import { createMessageLifecycleActions } from './chat/use-chat-store-message-lifecycle-actions.mjs'
import { normalizeAssistantPhase } from '../../common/chat/assistant-phase.mjs'
import useAppStore from './useAppStore.js'
import { normalizeQuestionUserRequest } from '../../common/chat/question-user-request.mjs'
import { createProcessingModeStoreActions, INITIAL_CHAT_PROCESSING_MODE_STATE } from './chat/chat-processing-mode-store.mjs'
import { providersEqual, terminalDockStatesEqual, toolActivityRenderFieldsEqual } from './chat/store-render-equality.mjs'

const CHAT_STORAGE_KEY = 'addom-chat-store-v1'

let _threadDebugEnabled = false
let lastSyncedThreadSessionId = ''
/** Call once after settings hydration; checked at mutation time. */
export function setThreadSessionDebug(enabled) { _threadDebugEnabled = !!enabled }
function getThreadSessionDebugEnabled() { return _threadDebugEnabled }

const MAX_TOOL_ACTIVITY_ITEMS = 500
const MAX_NOTICES = 8
const MAX_SUPPRESSED_NOTICE_KEYS = 64

/**
 * useChatStore - chat UI state.
 */
const useChatStore = create(persist((set, get) => ({
  providers: [],
  selectedProvider: null,
  selectedModel: null,
  chatMode: 'execute', // 'execute' | 'plan' | 'thinking'
  ...INITIAL_CHAT_PROCESSING_MODE_STATE,

  providerSwitchHint: null, // { fromProvider, toProvider, fromModel, toModel, createdAt }
  pendingContextPrefix: '',

  setProviders: (providers) => {
    const normalizedProviders = Array.isArray(providers) ? providers : []
    set((state) => (
      providersEqual(state.providers, normalizedProviders)
        ? state
        : { providers: normalizedProviders }
    ))
  },

  setSelectedProvider: (id, options = {}) => {
    const state = get()
    const { providers } = state
    const targetSession = getThreadSessionSnapshot(state, String(options?.threadId || '').trim())
    const activeThreadId = targetSession.threadId
    const selectedProvider = String(targetSession.selectedProvider || '')
    const selectedModel = String(targetSession.selectedModel || '')
    const timeline = Array.isArray(targetSession.timeline) ? targetSession.timeline : []
    const provider = providers.find((p) => p.id === id)
    const nextModel = provider?.defaultModel ?? null
    const hasConversation = timeline.length > 0

    set((s) => updateThreadSessionState(s, activeThreadId, (thread) => ({
      selectedProvider: id,
      selectedModel: nextModel,
      providerSwitchHint: buildProviderSwitchHint({
        existingHint: thread.providerSwitchHint,
        hasConversation,
        currentProvider: selectedProvider,
        currentModel: selectedModel,
        nextProvider: id,
        nextModel,
      }),
    })))
    primeModelCapabilities(id, nextModel)
  },

  setSelectedModel: (model, options = {}) => {
    const state = get()
    const targetSession = getThreadSessionSnapshot(state, String(options?.threadId || '').trim())
    const prev = String(targetSession.selectedModel || '')
    const selectedProvider = String(targetSession.selectedProvider || '')
    const normalized = canonicalizeSelectedModel(selectedProvider, model)
    const next = String(normalized.modelId || model || '')
    const hasConversation = Array.isArray(targetSession.timeline) && targetSession.timeline.length > 0
    set((s) => updateThreadSessionState(s, targetSession.threadId, (thread) => ({
      selectedModel: next || null,
      providerSwitchHint: buildProviderSwitchHint({
        existingHint: thread.providerSwitchHint,
        hasConversation,
        currentProvider: selectedProvider,
        currentModel: prev,
        nextProvider: selectedProvider,
        nextModel: next,
      }),
    })))
    if (normalized.changed && String(normalized.reason || '').startsWith('curated_remap')) {
      const fromModel = String(model || '').trim()
      const toModel = String(next || '').trim()
      if (fromModel && toModel && fromModel.toLowerCase() !== toModel.toLowerCase()) {
        get().pushNotice({
          type: 'info',
          text: `Model "${fromModel}" was migrated to curated OpenAI model "${toModel}".`,
          meta: {
            sessionSuppressKey: `model-remap:${selectedProvider}:${fromModel.toLowerCase()}`,
            providerId: selectedProvider,
            requestedModel: fromModel,
            replacementModel: toModel,
            reason: String(normalized.reason || 'curated_remap'),
          },
        })
      }
    }
    primeModelCapabilities(selectedProvider, next)
  },

  dismissProviderSwitchHint: (options = {}) => set((s) => updateThreadSessionState(
    s,
    String(options?.threadId || '').trim() || s.activeThreadId,
    () => ({
    providerSwitchHint: null,
    }),
  )),
  setPendingContextPrefix: (value, options = {}) => set((s) => updateThreadSessionState(
    s,
    String(options?.threadId || '').trim() || s.activeThreadId,
    () => ({
    pendingContextPrefix: normalizePendingContextPrefixPayload(value),
    }),
  )),
  consumePendingContextPrefix: (options = {}) => {
    const state = get()
    const targetThreadId = String(options?.threadId || '').trim() || state.activeThreadId
    const targetSession = getThreadSessionSnapshot(state, targetThreadId)
    const payload = normalizePendingContextPrefixPayload(targetSession.pendingContextPrefix)
    set((s) => updateThreadSessionState(s, targetThreadId, () => ({
      pendingContextPrefix: '',
    })))
    return payload || null
  },

  setActiveThread: (threadId) => {
    const state = get()
    const nextState = buildThreadSelectionState(state, threadId)
    if (_threadDebugEnabled) {
      console.debug('[thread-session] setActiveThread', { from: state.activeThreadId, to: nextState.activeThreadId })
    }
    set(nextState)
    useAppStore.getState().setPermissionMode(nextState.permissionMode)
  },

  removeThread: (threadId, { successorThreadId = '' } = {}) => {
    set((state) => removeThreadSessionState(state, threadId, successorThreadId))
  },

  restoreChatRoute: (snapshot) => {
    const nextState = buildChatRouteRestoreState(get(), snapshot)
    set(nextState)
    useAppStore.getState().setPermissionMode(nextState.permissionMode)
    lastSyncedThreadSessionId = resolveThreadSessionId(nextState, nextState.activeThreadId)
  },

  setChatMode: (mode) => {
    const nextChatMode = mode === 'plan' || mode === 'thinking' ? mode : 'execute'
    set((state) => (
      state.chatMode === nextChatMode
        ? state
        : { chatMode: nextChatMode }
    ))
  },

  ...createProcessingModeStoreActions({ get, set }),

  activeThreadId: resolveThreadSessionId({}, resolveAppActiveThreadId()),
  threadStateById: (() => {
    const initialThreadId = resolveThreadSessionId({}, resolveAppActiveThreadId())
    return {
      [initialThreadId]: createEmptyThreadSession(),
    }
  })(),
  messages: [],
  timeline: [],
  streamingId: null,
  streamingMessageIndex: null,
  streamingTimelineIndex: null,
  legacyPlanStateMigrationCandidate: null,
  toolActivity: [],
  liveExecution: createEmptyLiveExecutionState(),
  contextUsage: createEmptyContextUsage(),
  costEstimate: createEmptyCostEstimate(),
  continuityStatus: createEmptyContinuityStatus(),
  threadUsageTotals: {},
  notices: [],
  suppressedNoticeKeys: [],
  pendingQuestionUser: null,
  pendingPlanDirection: null,
  planDocumentReady: null,
  agentFanoutConfirmRequest: null,
  writeConflicts: [],

  pushWriteConflict: (conflict = {}, options = {}) => {
    const targetThreadId = String(options?.threadId || conflict.threadId || '').trim()
    const entry = normalizeWriteConflict(conflict, { threadId: targetThreadId })
    if (!entry) return
    set((s) => updateThreadSessionState(s, targetThreadId, (thread) => ({
      writeConflicts: dedupeWriteConflicts([
        ...(Array.isArray(thread.writeConflicts) ? thread.writeConflicts : []),
        entry,
      ]),
    })))
  },

  resolveWriteConflict: (conflictId, options = {}) => {
    const id = String(conflictId || '').trim()
    if (!id) return
    const targetThreadId = String(options?.threadId || '').trim()
    set((s) => updateThreadSessionState(s, targetThreadId || s.activeThreadId, (thread) => ({
      writeConflicts: (Array.isArray(thread.writeConflicts) ? thread.writeConflicts : []).map((c) => (
        c.id === id ? { ...c, resolved: true } : c
      )),
    })))
  },

  dismissWriteConflict: (conflictId, options = {}) => {
    const id = String(conflictId || '').trim()
    if (!id) return
    const targetThreadId = String(options?.threadId || '').trim()
    set((s) => updateThreadSessionState(s, targetThreadId || s.activeThreadId, (thread) => ({
      writeConflicts: (Array.isArray(thread.writeConflicts) ? thread.writeConflicts : []).filter((c) => c.id !== id),
    })))
  },

  setConflictMergeProposal: (conflictId, proposal = null, options = {}) => {
    const id = String(conflictId || '').trim()
    if (!id) return
    const targetThreadId = String(options?.threadId || '').trim()
    set((s) => updateThreadSessionState(s, targetThreadId || s.activeThreadId, (thread) => ({
      writeConflicts: (Array.isArray(thread.writeConflicts) ? thread.writeConflicts : []).map((c) => {
        if (c.id !== id) return c
        return {
          ...c,
          mergeProposal: proposal && typeof proposal === 'object'
            ? {
              content: typeof proposal.content === 'string' ? proposal.content : '',
              explanation: String(proposal.explanation || '').trim(),
              error: String(proposal.error || '').trim(),
              errorKind: String(proposal.errorKind || '').trim(),
              status: String(proposal.status || 'ready').trim(),
              generatedAt: Number(proposal.generatedAt || Date.now()) || Date.now(),
            }
            : null,
        }
      }),
    })))
  },

  hydrateFromTimeline: (events = [], options = {}) => {
    const mapped = mapTimelineFromPersistedEvents(events)
    const threadId = typeof options === 'string'
      ? options
      : String(options?.threadId || '')
    if (_threadDebugEnabled) {
      console.debug('[thread-session] hydrateFromTimeline', { threadId, eventCount: events.length, messageCount: mapped.messages.length })
    }
    set((s) => {
      const resolvedThreadId = resolveThreadSessionId(s, threadId)
      const existingThread = getThreadSessionSnapshot(s, resolvedThreadId)
      const existingPendingQuestionUser = normalizeQuestionUserRequest(existingThread.pendingQuestionUser)
      const shouldPreserveBridgePendingQuestionUser = (
        !mapped.pendingQuestionUser
        && String(existingPendingQuestionUser?.source || '').trim().toLowerCase() === 'openai_account_bridge'
      )
      const nextContextUsage = mapped.contextUsage || createEmptyContextUsage()
      const nextThreadUsageTotals = {
        inputTokens: Number(nextContextUsage.rollingInputTokens || 0) || 0,
        outputTokens: Number(nextContextUsage.rollingOutputTokens || 0) || 0,
        reasoningTokens: Number(nextContextUsage.rollingReasoningTokens || 0) || 0,
        totalTokens: Number(nextContextUsage.rollingTotalTokens || 0) || 0,
      }
      const nextState = updateThreadSessionState(s, resolvedThreadId, () => ({
        messages: mapped.messages,
        toolActivity: mapped.toolActivity,
        liveExecution: mapped.liveExecution || createEmptyLiveExecutionState(),
        timeline: mapped.timeline,
        contextUsage: nextContextUsage,
        costEstimate: mapped.costEstimate || createEmptyCostEstimate(),
        continuityStatus: mapped.continuityStatus || createEmptyContinuityStatus(),
        streamingId: null,
        streamingMessageIndex: null,
        streamingTimelineIndex: null,
        pendingQuestionUser: mapped.pendingQuestionUser ?? (
          shouldPreserveBridgePendingQuestionUser
            ? existingPendingQuestionUser
            : null
        ),
        planDocumentReady: mapped.planDocumentReady || null,
        pendingPlanDirection: mapped.pendingPlanDirection || null,
        providerSwitchHint: null,
        notices: [],
        suppressedNoticeKeys: [],
        agentFanoutConfirmRequest: null,
        writeConflicts: dedupeWriteConflicts(mapped.writeConflicts),
      }))
      return {
        ...nextState,
        threadUsageTotals: {
          ...(s.threadUsageTotals && typeof s.threadUsageTotals === 'object' ? s.threadUsageTotals : {}),
          [resolvedThreadId]: nextThreadUsageTotals,
        },
      }
    })
  },

  pushToolActivity: (entry) => {
    if (!entry || typeof entry !== 'object') return
    const normalized = withActivityTimestamp({
      id: String(entry.id || crypto.randomUUID()),
      ...entry,
    })
    const targetThreadId = String(normalized.threadId || '').trim()
    set((s) => updateThreadSessionState(s, targetThreadId, (thread) => {
      const shouldCoalesce = normalized.coalesce === true
      const normalizedId = String(normalized.id || '').trim()
      if (shouldCoalesce && normalizedId) {
        const existingIdx = thread.toolActivity.findIndex((activity) => String(activity?.id || '').trim() === normalizedId)
        if (existingIdx >= 0) {
          const existing = thread.toolActivity[existingIdx]
          if (toolActivityRenderFieldsEqual(existing, normalized)) {
            return null
          }
          const updated = {
            ...existing,
            ...normalized,
            id: existing.id,
            createdAt: existing.createdAt,
          }
          const nextTools = [...thread.toolActivity]
          nextTools[existingIdx] = updated

          const timelineIdx = thread.timeline.findIndex(
            (row) => row?.kind === 'tool' && String(row?.activity?.id || '').trim() === normalizedId,
          )
          let nextTimeline = thread.timeline
          if (timelineIdx >= 0) {
            nextTimeline = [...thread.timeline]
            nextTimeline[timelineIdx] = {
              ...nextTimeline[timelineIdx],
              activity: updated,
            }
          }

          return ({
            toolActivity: nextTools,
            liveExecution: upsertLiveExecutionActivity(thread.liveExecution || createEmptyLiveExecutionState(), updated),
            timeline: nextTimeline,
          })
        }
      }

      const nextTools = appendCappedItem(thread.toolActivity, normalized, MAX_TOOL_ACTIVITY_ITEMS)
      const nextTimeline = appendTrimmedTimelineRow(thread.timeline, toTimelineTool(normalized))
      return ({
        toolActivity: nextTools,
        liveExecution: upsertLiveExecutionActivity(thread.liveExecution || createEmptyLiveExecutionState(), normalized),
        timeline: nextTimeline,
      })
    }))
  },

  // Legacy reasoning activity support for older timeline consumers.
  // This must never mutate liveExecution reasoning, which is append-only and sourced
  // from assistant message reasoning state.
  upsertReasoningActivity: (entry) => {
    if (!entry || typeof entry !== 'object') return
    const turnId = String(entry.turnId || '').trim()
    const targetThreadId = String(entry.threadId || '').trim()
    set((s) => updateThreadSessionState(s, targetThreadId, (thread) => {
      const existingIdx = turnId
        ? thread.toolActivity.findIndex((a) => a.type === 'reasoning' && String(a.turnId || '').trim() === turnId)
        : -1

      if (existingIdx >= 0) {
        const existing = thread.toolActivity[existingIdx]
        const updated = {
          ...existing,
          ...withActivityTimestamp({
            ...entry,
            id: existing.id,
          }),
          id: existing.id,
          createdAt: existing.createdAt,
        }
        const nextTools = [...thread.toolActivity]
        nextTools[existingIdx] = updated

        const timelineIdx = thread.timeline.findIndex(
          (row) => row?.kind === 'tool' && row?.activity?.id === existing.id,
        )
        let nextTimeline = thread.timeline
        if (timelineIdx >= 0) {
          nextTimeline = [...thread.timeline]
          nextTimeline[timelineIdx] = { ...nextTimeline[timelineIdx], activity: updated }
        }

        return {
          toolActivity: nextTools,
          timeline: nextTimeline,
        }
      }

      const normalized = withActivityTimestamp({
        id: String(entry.id || crypto.randomUUID()),
        ...entry,
      })
      const nextTools = appendCappedItem(thread.toolActivity, normalized, MAX_TOOL_ACTIVITY_ITEMS)
      const nextTimeline = appendTrimmedTimelineRow(thread.timeline, toTimelineTool(normalized))
      return {
        toolActivity: nextTools,
        timeline: nextTimeline,
      }
    }))
  },

  clearToolActivity: (threadId = '') => set((s) => updateThreadSessionState(s, threadId, () => ({
    toolActivity: [],
    liveExecution: createEmptyLiveExecutionState(),
  }))),
  getThreadState: (threadId = '') => {
    const state = get()
    return getThreadSessionSnapshot(state, threadId)
  },
  hasLiveThreadSession: (threadId = '') => {
    const state = get()
    const session = getThreadSessionSnapshot(state, threadId)
    return threadSessionHasLiveState(session)
  },
  appendLiveExecutionToolOutput: (payload = {}) => set((s) => updateThreadSessionState(
    s,
    String(payload.threadId || '').trim(),
    (thread) => ({
      liveExecution: appendLiveExecutionToolOutput(thread.liveExecution || createEmptyLiveExecutionState(), payload),
    }),
  )),

  ...createNoticeActions({
    set,
    get,
    now,
    appendCappedItem,
    maxNotices: MAX_NOTICES,
    maxSuppressedNoticeKeys: MAX_SUPPRESSED_NOTICE_KEYS,
    resolveThreadSessionId,
    updateThreadSessionState,
  }),

  setAgentFanoutConfirmRequest: (payload = null) => {
    if (!payload || typeof payload !== 'object') {
      set((s) => updateThreadSessionState(s, s.activeThreadId, () => ({
        agentFanoutConfirmRequest: null,
      })))
      return
    }
    set((s) => updateThreadSessionState(
      s,
      String(payload.threadId || '').trim(),
      () => ({
        agentFanoutConfirmRequest: {
          ...payload,
          requestId: String(payload.requestId || ''),
          decisionOptions: ['launch_all', 'limit', 'stop_turn'],
        },
      }),
    ))
  },

  clearAgentFanoutConfirmRequest: (threadId = '') => set((s) => updateThreadSessionState(s, threadId, () => ({
    agentFanoutConfirmRequest: null,
  }))),
  ...createUsageContinuityActions({
    set,
    get,
    resolveThreadSessionId,
    updateThreadSessionState,
  }),

  clearLegacyPlanStateMigrationCandidate: () => set({ legacyPlanStateMigrationCandidate: null }),
  setPendingQuestionUser: (questionUser = null, options = {}) => set((s) => updateThreadSessionState(
    s,
    String(options?.threadId || '').trim() || s.activeThreadId,
    () => ({
      pendingQuestionUser: normalizeQuestionUserRequest(questionUser),
    }),
  )),
  clearPendingQuestionUser: (options = {}) => set((s) => updateThreadSessionState(
    s,
    String(options?.threadId || '').trim() || s.activeThreadId,
    () => ({
      pendingQuestionUser: null,
    }),
  )),
  setPendingPlanDirection: (plan = null, options = {}) => set((s) => updateThreadSessionState(
    s,
    String(options?.threadId || '').trim() || s.activeThreadId,
    () => ({ pendingPlanDirection: plan && typeof plan === 'object' ? plan : null }),
  )),
  setPlanDocumentReady: (projection = null, options = {}) => set((s) => updateThreadSessionState(
    s,
    String(options?.threadId || projection?.threadId || '').trim() || s.activeThreadId,
    () => ({ planDocumentReady: projection && typeof projection === 'object' ? projection : null }),
  )),
  setTerminalDockState: (patch = {}, options = {}) => set((s) => updateThreadSessionState(
    s,
    String(options?.threadId || '').trim() || s.activeThreadId,
    (thread) => {
      const currentTerminalDock = thread.terminalDock && typeof thread.terminalDock === 'object'
        ? thread.terminalDock
        : {}
      const nextTerminalDock = {
        ...currentTerminalDock,
        ...(patch && typeof patch === 'object' ? patch : {}),
      }
      if (terminalDockStatesEqual(currentTerminalDock, nextTerminalDock)) return null
      return {
        terminalDock: nextTerminalDock,
      }
    },
  )),
  setTerminalDockSelectedTab: (selectedTabId = '', options = {}) => set((s) => updateThreadSessionState(
    s,
    String(options?.threadId || '').trim() || s.activeThreadId,
    (thread) => {
      const nextSelectedTabId = String(selectedTabId || '').trim()
      const currentTerminalDock = thread.terminalDock && typeof thread.terminalDock === 'object'
        ? thread.terminalDock
        : {}
      if (String(currentTerminalDock.selectedTabId || '').trim() === nextSelectedTabId) return null
      return {
        terminalDock: {
          ...currentTerminalDock,
          selectedTabId: nextSelectedTabId,
        },
      }
    },
  )),

  addUserMessage: (content, options = {}) => {
    const id = crypto.randomUUID()
    // content may be a string or an array of content parts (text + attachments)
    const message = { id, role: 'user', content, status: 'done' }
    set((s) => updateThreadSessionState(
      s,
      String(options?.threadId || '').trim() || s.activeThreadId,
      (thread) => ({
        messages: appendCappedItem(thread.messages, message),
        timeline: appendTrimmedTimelineRow(thread.timeline, toTimelineMessage(message, now())),
        pendingQuestionUser: null,
      }),
    ))
    return id
  },

  addAssistantPlaceholder: (options = {}) => {
    const id = crypto.randomUUID()
    if (_threadDebugEnabled) {
      console.debug('[thread-session] stream:start', { threadId: String(options?.threadId || '').trim(), messageId: id })
    }
    const message = {
      id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      phase: '',
      reasoning: '',
      reasoningDone: false,
      reasoningMeta: {
        mode: 'none',
        chunkCount: 0,
        charsStreamed: 0,
      },
      streamMeta: {},
    }
    set((s) => updateThreadSessionState(
      s,
      String(options?.threadId || '').trim() || s.activeThreadId,
      (thread) => {
        const nextMessages = appendCappedItem(thread.messages, message)
        const nextTimeline = appendTrimmedTimelineRow(thread.timeline, toTimelineMessage(message, now()))
        const msgIndex = nextMessages.length - 1
        const timelineIndex = nextTimeline.length - 1
        return {
          messages: nextMessages,
          timeline: nextTimeline,
          streamingId: id,
          streamingMessageIndex: msgIndex >= 0 ? msgIndex : null,
          streamingTimelineIndex: timelineIndex >= 0 ? timelineIndex : null,
          costEstimate: createEmptyCostEstimate(),
        }
      },
    ))
    return id
  },

  ensureAssistantPlaceholder: ({ messageId = '', threadId = '' } = {}) => {
    const id = String(messageId || '').trim()
    if (!id) return null
    set((s) => updateThreadSessionState(
      s,
      String(threadId || '').trim() || s.activeThreadId,
      (thread) => {
        const existingIndex = thread.messages.findIndex((m) => m && m.id === id)
        if (existingIndex >= 0) {
          const existingTimelineIndex = thread.timeline.findIndex((row) => (
            row?.kind === 'message' && row?.message?.id === id
          ))
          return {
            streamingId: id,
            streamingMessageIndex: existingIndex,
            streamingTimelineIndex: existingTimelineIndex >= 0 ? existingTimelineIndex : null,
          }
        }
        const message = {
          id,
          role: 'assistant',
          content: '',
          status: 'streaming',
          phase: null,
          reasoning: '',
          reasoningDone: false,
          reasoningMeta: {
            mode: 'none',
            chunkCount: 0,
            charsStreamed: 0,
          },
          streamMeta: {},
        }
        const nextMessages = appendCappedItem(thread.messages, message)
        const nextTimeline = appendTrimmedTimelineRow(thread.timeline, toTimelineMessage(message, now()))
        const msgIndex = nextMessages.length - 1
        const timelineIndex = nextTimeline.length - 1
        return {
          messages: nextMessages,
          timeline: nextTimeline,
          streamingId: id,
          streamingMessageIndex: msgIndex >= 0 ? msgIndex : null,
          streamingTimelineIndex: timelineIndex >= 0 ? timelineIndex : null,
        }
      },
    ))
    return id
  },

  appendChunk: (id, chunk, options = {}) => {
    const delta = String(chunk ?? '')
    if (!delta) return
    const requestedThreadId = String(options?.threadId || '').trim()
    set((s) => updateThreadSessionState(
      s,
      resolveTargetThreadIdForMessage(s, requestedThreadId, id),
      (thread) => updateMessageAndTimelineById(thread, id, (target) => ({
        ...target,
        content: String(target?.content || '') + delta,
      })),
    ))
  },

  ...createReasoningActions({
    set,
    now,
    updateMessageAndTimelineById,
    updateThreadSessionState,
    resolveThreadSessionId,
    normalizeStreamMetaPatch,
    computeDerivedStreamMeta,
  }),
  ...createMessageLifecycleActions({
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
    getThreadDebugEnabled: getThreadSessionDebugEnabled,
    normalizeQuestionUserRequest,
  }),

  clearTranscriptPersistence: () => {
    set((s) => {
      const activeThreadId = resolveThreadSessionId(s, s.activeThreadId)
      const emptyThread = createEmptyThreadSession({
        selectedProvider: s.selectedProvider || null,
        selectedModel: s.selectedModel || null,
        permissionMode: useAppStore.getState().permissionMode,
      })
      return {
        activeThreadId,
        threadStateById: { [activeThreadId]: emptyThread },
        ...buildThreadProjectionPatch(emptyThread),
        threadUsageTotals: {},
      }
    })
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(CHAT_STORAGE_KEY)
    }
  },
}), createChatStorePersistConfig({
  chatStorageKey: CHAT_STORAGE_KEY,
  sanitizePlanState: sanitizeLegacyPlanState,
  canonicalizeSelectedModel,
})))

lastSyncedThreadSessionId = resolveThreadSessionId(
  useChatStore.getState(),
  resolveAppActiveThreadId(),
)

useAppStore.subscribe((nextState) => {
  const targetThreadId = resolveThreadSessionId(
    useChatStore.getState(),
    normalizeThreadSessionId(nextState?.activeThreadId),
  )
  if (targetThreadId === lastSyncedThreadSessionId) return
  lastSyncedThreadSessionId = targetThreadId
  useChatStore.getState().setActiveThread(targetThreadId)
})

export default useChatStore
