import {
  CHAT_STORE_SCHEMA_VERSION,
  migrateChatStorePersistedState,
} from './use-chat-store-migrations.mjs'

function sanitizeProcessingModeMap(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([threadId, mode]) => [
        String(threadId || '').trim(),
        String(mode || '').trim().toLowerCase() === 'fast' ? 'fast' : 'standard',
      ])
      .filter(([threadId]) => Boolean(threadId)),
  )
}

function hasLegacyPlanStateContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.canonicalPlan && typeof value.canonicalPlan === 'object') return true
  if (typeof value.summary === 'string' && value.summary.trim()) return true
  return [
    value.decisions,
    value.questionsResolved,
    value.questionsOpen,
    value.steps,
    value.dismissedPlanMessageIds,
    value.pendingRequestIds,
    value.linkedMessageIds,
  ].some((entry) => Array.isArray(entry) && entry.length > 0)
}

export function createChatStorePersistConfig({
  chatStorageKey,
  sanitizePlanState,
  canonicalizeSelectedModel,
} = {}) {
  return {
    name: chatStorageKey,
    version: CHAT_STORE_SCHEMA_VERSION,
    partialize: (state) => ({
      _storeVersion: CHAT_STORE_SCHEMA_VERSION,
      selectedProvider: state.selectedProvider,
      selectedModel: state.selectedModel,
      chatMode: state.chatMode === 'plan' || state.chatMode === 'thinking'
        ? state.chatMode
        : 'execute',
      processingModeByThreadId: sanitizeProcessingModeMap(state.processingModeByThreadId),
      legacyPlanStateMigrationCandidate: hasLegacyPlanStateContent(state.legacyPlanStateMigrationCandidate)
        ? sanitizePlanState(state.legacyPlanStateMigrationCandidate)
        : null,
    }),
    migrate: (persistedState, version) => migrateChatStorePersistedState(
      persistedState,
      version,
      { sanitizePlanState },
    ),
    merge: (persistedState, currentState) => {
      const p = persistedState && typeof persistedState === 'object' ? persistedState : {}
      const selectedProvider = typeof p.selectedProvider === 'string'
        ? p.selectedProvider
        : currentState.selectedProvider
      const rawSelectedModel = typeof p.selectedModel === 'string'
        ? p.selectedModel
        : currentState.selectedModel
      const migratedSelection = canonicalizeSelectedModel(selectedProvider, rawSelectedModel)
      const processingModeByThreadId = sanitizeProcessingModeMap(p.processingModeByThreadId)
      const activeThreadId = String(currentState.activeThreadId || '').trim()
      return {
        ...currentState,
        selectedProvider: migratedSelection.providerId || selectedProvider,
        selectedModel: migratedSelection.modelId || rawSelectedModel,
        chatMode: p.chatMode === 'plan' || p.chatMode === 'thinking'
          ? p.chatMode
          : currentState.chatMode,
        processingModeByThreadId,
        processingMode: processingModeByThreadId[activeThreadId] || 'standard',
        legacyPlanStateMigrationCandidate: hasLegacyPlanStateContent(
          p.legacyPlanStateMigrationCandidate || p.planState,
        )
          ? sanitizePlanState(p.legacyPlanStateMigrationCandidate || p.planState)
          : null,
        streamingId: null,
        streamingMessageIndex: null,
        streamingTimelineIndex: null,
      }
    },
  }
}
