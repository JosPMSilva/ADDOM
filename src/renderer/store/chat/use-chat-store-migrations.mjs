export const CHAT_STORE_SCHEMA_VERSION = 5

function sanitizeOptionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePersistedChatMode(value) {
  const mode = String(value || '').trim()
  if (mode === 'plan' || mode === 'thinking') return mode
  return 'execute'
}

function detectPersistedVersion(state, explicitVersion) {
  const stateVersion = Number(state?._storeVersion || 0) || 0
  const persistedVersion = Number(explicitVersion || 0) || 0
  return Math.max(0, stateVersion, persistedVersion)
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

function sanitizeLegacyPlanStateCandidate(value, sanitizePlanState) {
  if (!hasLegacyPlanStateContent(value)) return null
  return sanitizePlanState(value)
}

function createMigrationSteps({ sanitizePlanState } = {}) {
  return new Map([
    [
      0,
      (state) => ({
        ...state,
        _storeVersion: 1,
      }),
    ],
    [
      1,
      (state) => ({
        ...state,
        _storeVersion: 2,
        chatMode: normalizePersistedChatMode(state?.chatMode),
        planState: sanitizePlanState(state?.planState),
      }),
    ],
    [
      2,
      (state) => ({
        ...state,
        _storeVersion: 3,
        selectedProvider: sanitizeOptionalString(state?.selectedProvider),
        selectedModel: sanitizeOptionalString(state?.selectedModel),
        chatMode: normalizePersistedChatMode(state?.chatMode),
        planState: sanitizePlanState(state?.planState),
      }),
    ],
    [
      3,
      (state) => ({
        ...state,
        _storeVersion: 4,
        chatMode: normalizePersistedChatMode(state?.chatMode),
        planState: sanitizePlanState(state?.planState),
        selectedProvider: sanitizeOptionalString(state?.selectedProvider),
        selectedModel: sanitizeOptionalString(state?.selectedModel),
      }),
    ],
    [
      4,
      (state) => {
        const legacyPlanStateMigrationCandidate = sanitizeLegacyPlanStateCandidate(
          state?.legacyPlanStateMigrationCandidate || state?.planState,
          sanitizePlanState,
        )
        const { planState: _obsoletePlanState, ...rest } = state
        void _obsoletePlanState
        return {
          ...rest,
          _storeVersion: 5,
          legacyPlanStateMigrationCandidate,
        }
      },
    ],
  ])
}

export function migrateChatStorePersistedState(
  persistedState,
  persistedVersion,
  { sanitizePlanState } = {},
) {
  const safeSanitizePlanState = typeof sanitizePlanState === 'function'
    ? sanitizePlanState
    : (value) => value

  let state = persistedState && typeof persistedState === 'object'
    ? { ...persistedState }
    : {}
  let currentVersion = detectPersistedVersion(state, persistedVersion)

  if (currentVersion >= CHAT_STORE_SCHEMA_VERSION) {
    const { planState: _obsoletePlanState, ...rest } = state
    void _obsoletePlanState
    return {
      ...rest,
      _storeVersion: currentVersion,
      chatMode: normalizePersistedChatMode(state?.chatMode),
      legacyPlanStateMigrationCandidate: sanitizeLegacyPlanStateCandidate(
        state?.legacyPlanStateMigrationCandidate || state?.planState,
        safeSanitizePlanState,
      ),
      selectedProvider: sanitizeOptionalString(state?.selectedProvider),
      selectedModel: sanitizeOptionalString(state?.selectedModel),
    }
  }

  const migrationSteps = createMigrationSteps({ sanitizePlanState: safeSanitizePlanState })
  while (currentVersion < CHAT_STORE_SCHEMA_VERSION) {
    const migrate = migrationSteps.get(currentVersion)
    if (typeof migrate !== 'function') {
      break
    }
    try {
      state = migrate(state)
      currentVersion = detectPersistedVersion(state, currentVersion + 1)
    } catch {
      break
    }
  }

  const { planState: _obsoletePlanState, ...rest } = state
  void _obsoletePlanState
  return {
    ...rest,
    _storeVersion: currentVersion >= CHAT_STORE_SCHEMA_VERSION
      ? currentVersion
      : CHAT_STORE_SCHEMA_VERSION,
    chatMode: normalizePersistedChatMode(state?.chatMode),
    legacyPlanStateMigrationCandidate: sanitizeLegacyPlanStateCandidate(
      state?.legacyPlanStateMigrationCandidate || state?.planState,
      safeSanitizePlanState,
    ),
    selectedProvider: sanitizeOptionalString(state?.selectedProvider),
    selectedModel: sanitizeOptionalString(state?.selectedModel),
  }
}
