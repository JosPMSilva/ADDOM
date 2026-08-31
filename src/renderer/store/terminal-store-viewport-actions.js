import {
  appendTelemetryEvent,
  asTrimmedString,
  CHAT_TERMINAL_COMPACT_MODE,
  createInitialTerminalStoreState,
  DEFAULT_FOCUS_REQUEST_KEY_BY_MODE,
  disconnectAllSessionSubscriptions,
  incrementHydrateSequence,
  normalizeExpandedArchiveSessionIds,
  normalizeViewportMetrics,
  normalizeViewportMetricsByMode,
  normalizeViewportMode,
  resetTerminalConnectionState,
  selectNextActiveSessionId,
} from './terminal-store-shared.js'

export function createTerminalViewportActions({ set, get }) {
  return {
    resetState: () => {
      incrementHydrateSequence()
      resetTerminalConnectionState()
      void disconnectAllSessionSubscriptions()
      set(createInitialTerminalStoreState())
    },

    getSessions: () => get().sessions,

    getArchivedSessions: () => get().archivedSessions,

    getSessionById: (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      if (!normalizedSessionId) return null
      return (Array.isArray(get().sessions) ? get().sessions : [])
        .find((session) => asTrimmedString(session?.id) === normalizedSessionId) || null
    },

    getArchivedSessionById: (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      if (!normalizedSessionId) return null
      return (Array.isArray(get().archivedSessions) ? get().archivedSessions : [])
        .find((session) => asTrimmedString(session?.sessionId) === normalizedSessionId) || null
    },

    setViewportMetrics: (metrics = {}) => {
      const nextMetrics = normalizeViewportMetrics(metrics)
      const nextByMode = normalizeViewportMetricsByMode({
        ...get().viewportMetricsByMode,
        [CHAT_TERMINAL_COMPACT_MODE]: nextMetrics,
      })
      set((state) => (
        state.viewportMetrics.cols === nextMetrics.cols
        && state.viewportMetrics.rows === nextMetrics.rows
        && state.viewportMetricsByMode?.[CHAT_TERMINAL_COMPACT_MODE]?.cols === nextMetrics.cols
        && state.viewportMetricsByMode?.[CHAT_TERMINAL_COMPACT_MODE]?.rows === nextMetrics.rows
          ? state
          : {
              viewportMetrics: nextMetrics,
              viewportMetricsByMode: nextByMode,
            }
      ))
    },

    setViewportMetricsForMode: (mode = CHAT_TERMINAL_COMPACT_MODE, metrics = {}) => {
      const nextMetrics = normalizeViewportMetrics(metrics)
      const normalizedMode = normalizeViewportMode(mode)
      set((state) => (
        state.viewportMetricsByMode?.[normalizedMode]?.cols === nextMetrics.cols
        && state.viewportMetricsByMode?.[normalizedMode]?.rows === nextMetrics.rows
          ? state
          : {
              viewportMetrics: normalizedMode === CHAT_TERMINAL_COMPACT_MODE
                ? nextMetrics
                : state.viewportMetrics,
              viewportMetricsByMode: normalizeViewportMetricsByMode({
                ...state.viewportMetricsByMode,
                [normalizedMode]: nextMetrics,
              }),
            }
      ))
    },

    requestViewportFocus: (mode = CHAT_TERMINAL_COMPACT_MODE) => {
      const normalizedMode = normalizeViewportMode(mode)
      set((state) => ({
        focusRequestKeyByMode: {
          ...(state.focusRequestKeyByMode && typeof state.focusRequestKeyByMode === 'object'
            ? state.focusRequestKeyByMode
            : DEFAULT_FOCUS_REQUEST_KEY_BY_MODE),
          [normalizedMode]: Number(state.focusRequestKeyByMode?.[normalizedMode] || 0) + 1,
        },
      }))
    },

    setActiveSessionId: (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      set((state) => {
        const nextActiveSessionId = selectNextActiveSessionId(state.sessions, normalizedSessionId)
        return {
          sessions: state.sessions.map((session) => (
            asTrimmedString(session?.id) === nextActiveSessionId && session?.hasUnreadOutput === true
              ? { ...session, hasUnreadOutput: false }
              : session
          )),
          activeSessionId: nextActiveSessionId,
          activeArchivedSessionId: '',
          actionError: '',
        }
      })
    },

    toggleArchivedSessionExpanded: (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      if (!normalizedSessionId) return
      set((state) => {
        const expandedSessionIds = normalizeExpandedArchiveSessionIds(state.expandedArchivedSessionIds)
        const expanded = expandedSessionIds.includes(normalizedSessionId)
        return {
          expandedArchivedSessionIds: expanded
            ? expandedSessionIds.filter((entry) => entry !== normalizedSessionId)
            : [...expandedSessionIds, normalizedSessionId],
        }
      })
    },

    clearActionError: () => set({ actionError: '' }),

    recordTelemetryEvent: (type = '', detail = {}) => set((state) => ({
      telemetryEvents: appendTelemetryEvent(state.telemetryEvents, type, detail),
    })),
  }
}
