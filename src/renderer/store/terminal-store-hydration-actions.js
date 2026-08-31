import {
  asTrimmedString,
  connectionPromiseBySessionId,
  DEFAULT_MODEL_SESSION_ACTIVITY,
  DEFAULT_RUNTIME_HEALTH,
  disconnectAllSessionSubscriptions,
  filterOutputStateByVisibleSessions,
  getHydrateSequence,
  getTerminalApi,
  incrementHydrateSequence,
  isSessionVisibleForProject,
  lastRequestedResizeBySessionId,
  normalizeExpandedArchiveSessionIds,
  normalizeRuntimeHealth,
  normalizeTerminalSession,
  replaceArchivedSessions,
  resetTerminalConnectionState,
  selectNextActiveSessionId,
} from './terminal-store-shared.js'

export function createTerminalHydrationActions({ set, get }) {
  return {
    hydratePanel: async ({ projectFolder = '', permissionMode = '' } = {}) => {
      const normalizedProjectFolder = asTrimmedString(projectFolder)
      const normalizedPermissionMode = asTrimmedString(permissionMode)
      const terminalApi = getTerminalApi()
      const currentHydrateId = incrementHydrateSequence()
      const currentState = get()
      const shouldPreserveVisibleState = (
        currentState.hydratedProjectFolder === normalizedProjectFolder
        && currentState.hydratedPermissionMode === normalizedPermissionMode
      )

      resetTerminalConnectionState()
      await disconnectAllSessionSubscriptions()

      if (!terminalApi) {
        set({
          runtimeHealth: normalizeRuntimeHealth({
            status: 'failed',
            reason: 'renderer_api_unavailable',
            error: 'Terminal preload API is unavailable.',
          }),
          runtimeHealthPending: false,
          sessionsPending: false,
          archivedSessionsPending: false,
          sessions: [],
          archivedSessions: [],
          activeSessionId: '',
          activeArchivedSessionId: '',
          expandedArchivedSessionIds: [],
          rawOutputBySessionId: {},
          hydratedPermissionMode: normalizedPermissionMode,
          hydratedProjectFolder: normalizedProjectFolder,
        })
        return
      }

      set({
        runtimeHealthPending: true,
        sessionsPending: true,
        archivedSessionsPending: true,
        actionError: '',
        hydratedPermissionMode: normalizedPermissionMode,
        hydratedProjectFolder: normalizedProjectFolder,
        ...(shouldPreserveVisibleState
          ? {}
          : {
              sessions: [],
              archivedSessions: [],
              activeSessionId: '',
              activeArchivedSessionId: '',
              expandedArchivedSessionIds: [],
              rawOutputBySessionId: {},
            }),
      })

      let runtimeHealth = DEFAULT_RUNTIME_HEALTH
      let runtimeHealthError = ''
      try {
        runtimeHealth = normalizeRuntimeHealth(await terminalApi.getRuntimeHealth())
      } catch (error) {
        runtimeHealthError = asTrimmedString(error?.message || error || 'Failed to probe terminal runtime.')
        runtimeHealth = normalizeRuntimeHealth({
          status: 'failed',
          reason: 'chat_terminal_hydration_failed',
          error: runtimeHealthError,
        })
      }

      if (currentHydrateId !== getHydrateSequence()) return

      try {
        const archiveResultPromise = terminalApi.listArchivedSessions
          ? terminalApi.listArchivedSessions({
              projectFolder: normalizedProjectFolder,
            })
          : Promise.resolve({ ok: true, archives: [] })

        if (runtimeHealth.status !== 'supported') {
          const archiveResult = await archiveResultPromise
          if (currentHydrateId !== getHydrateSequence()) return
          const archivedSessions = Array.isArray(archiveResult?.archives)
            ? replaceArchivedSessions(archiveResult.archives)
            : []
          set((state) => ({
            runtimeHealth,
            runtimeHealthPending: false,
            sessionsPending: false,
            archivedSessionsPending: false,
            sessions: [],
            archivedSessions,
            activeSessionId: '',
            activeArchivedSessionId: archivedSessions.some((entry) => entry.sessionId === state.activeArchivedSessionId)
              ? state.activeArchivedSessionId
              : '',
            expandedArchivedSessionIds: normalizeExpandedArchiveSessionIds(state.expandedArchivedSessionIds)
              .filter((sessionId) => archivedSessions.some((entry) => entry.sessionId === sessionId)),
            rawOutputBySessionId: {},
            modelSessionActivity: DEFAULT_MODEL_SESSION_ACTIVITY,
            actionError: runtimeHealthError,
          }))
          return
        }

        const [listResult, archiveResult] = await Promise.all([
          terminalApi.listSessions({
            projectFolder: normalizedProjectFolder,
            permissionMode: normalizedPermissionMode,
          }),
          archiveResultPromise,
        ])
        if (currentHydrateId !== getHydrateSequence()) return
        const comparisonPlatform = runtimeHealth.platform
        const visibleSessions = Array.isArray(listResult?.sessions)
          ? listResult.sessions
            .map((session) => normalizeTerminalSession(session))
            .filter((session) => session.id && isSessionVisibleForProject(session, normalizedProjectFolder, comparisonPlatform))
          : []
        const archivedSessions = Array.isArray(archiveResult?.archives)
          ? replaceArchivedSessions(archiveResult.archives)
          : []
        const activeSessionId = selectNextActiveSessionId(visibleSessions, get().activeSessionId)
        const rawOutputBySessionId = filterOutputStateByVisibleSessions(
          get().rawOutputBySessionId,
          visibleSessions,
        )

        set((state) => ({
          runtimeHealth,
          runtimeHealthPending: false,
          sessionsPending: false,
          archivedSessionsPending: false,
          sessions: visibleSessions,
          archivedSessions,
          activeSessionId,
          activeArchivedSessionId: archivedSessions.some((entry) => entry.sessionId === state.activeArchivedSessionId)
            ? state.activeArchivedSessionId
            : '',
          expandedArchivedSessionIds: normalizeExpandedArchiveSessionIds(state.expandedArchivedSessionIds)
            .filter((sessionId) => archivedSessions.some((entry) => entry.sessionId === sessionId)),
          rawOutputBySessionId,
          modelSessionActivity: visibleSessions.some((session) => session.id === state.modelSessionActivity?.sessionId)
            ? state.modelSessionActivity
            : DEFAULT_MODEL_SESSION_ACTIVITY,
          actionError: runtimeHealthError,
        }))

        await Promise.allSettled(visibleSessions.map((session) => get().ensureSessionConnected(session.id)))
      } catch (error) {
        if (currentHydrateId !== getHydrateSequence()) return
        set({
          runtimeHealth,
          runtimeHealthPending: false,
          sessionsPending: false,
          archivedSessionsPending: false,
          sessions: [],
          archivedSessions: [],
          activeSessionId: '',
          activeArchivedSessionId: '',
          expandedArchivedSessionIds: [],
          rawOutputBySessionId: {},
          modelSessionActivity: DEFAULT_MODEL_SESSION_ACTIVITY,
          actionError: asTrimmedString(error?.message || error || 'Failed to load chat terminal.'),
        })
      }
    },

    disposeSubscriptions: async () => {
      incrementHydrateSequence()
      connectionPromiseBySessionId.clear()
      lastRequestedResizeBySessionId.clear()
      await disconnectAllSessionSubscriptions()
    },
  }
}
