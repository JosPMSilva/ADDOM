import {
  asTrimmedString,
  findArchivedSessionBySessionId,
  getTerminalApi,
  normalizeExpandedArchiveSessionIds,
  normalizeTerminalArchiveSession,
  removeArchivedSession,
  removeBooleanMapEntry,
  removeThreadSuggestionArchiveBySessionId,
  replaceArchivedSessions,
  upsertArchivedSession,
  upsertBooleanMapEntry,
  upsertThreadSuggestionArchives,
} from './terminal-store-shared.js'

export function createTerminalArchiveActions({ set, get }) {
  return {
    refreshArchivedSessions: async ({
      projectFolder = '',
      threadId = '',
      preserveSelection = true,
    } = {}) => {
      const terminalApi = getTerminalApi()
      if (!terminalApi?.listArchivedSessions) {
        set({
          archivedSessionsPending: false,
          archivedSessions: [],
          activeArchivedSessionId: '',
          expandedArchivedSessionIds: [],
        })
        return []
      }

      const resolvedProjectFolder = asTrimmedString(projectFolder || get().hydratedProjectFolder)
      if (!resolvedProjectFolder) {
        set({
          archivedSessionsPending: false,
          archivedSessions: [],
          activeArchivedSessionId: '',
          expandedArchivedSessionIds: [],
        })
        return []
      }

      set({ archivedSessionsPending: true })
      try {
        const result = await terminalApi.listArchivedSessions({
          projectFolder: resolvedProjectFolder,
          threadId: asTrimmedString(threadId),
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_archive_list_failed'))
        }
        const archivedSessions = replaceArchivedSessions(result.archives)
        set((state) => {
          const activeArchivedSessionId = preserveSelection
            && archivedSessions.some((entry) => entry.sessionId === state.activeArchivedSessionId)
            ? state.activeArchivedSessionId
            : ''
          const expandedArchivedSessionIds = normalizeExpandedArchiveSessionIds(state.expandedArchivedSessionIds)
            .filter((sessionId) => archivedSessions.some((entry) => entry.sessionId === sessionId))
          return {
            archivedSessionsPending: false,
            archivedSessions,
            activeArchivedSessionId,
            expandedArchivedSessionIds,
            actionError: state.actionError,
          }
        })
        return archivedSessions
      } catch (error) {
        set({
          archivedSessionsPending: false,
          actionError: asTrimmedString(error?.message || error || 'Failed to load archived terminal sessions.'),
        })
        return []
      }
    },

    refreshThreadSuggestionArchives: async ({
      projectFolder = '',
      threadId = '',
    } = {}) => {
      const normalizedThreadId = asTrimmedString(threadId)
      const terminalApi = getTerminalApi()
      if (!terminalApi?.listArchivedSessions || !normalizedThreadId) return []

      const resolvedProjectFolder = asTrimmedString(projectFolder || get().hydratedProjectFolder)
      if (!resolvedProjectFolder) return []

      set((state) => ({
        threadSuggestionArchivesPendingByThreadId: {
          ...(state.threadSuggestionArchivesPendingByThreadId && typeof state.threadSuggestionArchivesPendingByThreadId === 'object'
            ? state.threadSuggestionArchivesPendingByThreadId
            : {}),
          [normalizedThreadId]: true,
        },
      }))
      try {
        const result = await terminalApi.listArchivedSessions({
          projectFolder: resolvedProjectFolder,
          threadId: normalizedThreadId,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_archive_list_failed'))
        }
        const archives = replaceArchivedSessions(result.archives)
        set((state) => ({
          threadSuggestionArchivesByThreadId: {
            ...(state.threadSuggestionArchivesByThreadId && typeof state.threadSuggestionArchivesByThreadId === 'object'
              ? state.threadSuggestionArchivesByThreadId
              : {}),
            [normalizedThreadId]: archives,
          },
          threadSuggestionArchivesPendingByThreadId: {
            ...(state.threadSuggestionArchivesPendingByThreadId && typeof state.threadSuggestionArchivesPendingByThreadId === 'object'
              ? state.threadSuggestionArchivesPendingByThreadId
              : {}),
            [normalizedThreadId]: false,
          },
        }))
        return archives
      } catch (error) {
        set((state) => ({
          threadSuggestionArchivesPendingByThreadId: {
            ...(state.threadSuggestionArchivesPendingByThreadId && typeof state.threadSuggestionArchivesPendingByThreadId === 'object'
              ? state.threadSuggestionArchivesPendingByThreadId
              : {}),
            [normalizedThreadId]: false,
          },
          actionError: asTrimmedString(error?.message || error || 'Failed to load terminal suggestion archives.'),
        }))
        return []
      }
    },

    selectArchivedSession: async (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      if (!normalizedSessionId) {
        set({ activeArchivedSessionId: '' })
        return null
      }
      const terminalApi = getTerminalApi()
      const existingArchive = findArchivedSessionBySessionId({
        archivedSessions: get().archivedSessions,
        threadSuggestionArchivesByThreadId: get().threadSuggestionArchivesByThreadId,
        sessionId: normalizedSessionId,
      })
      const existingArchiveHasHydratedDetail = existingArchive
        && (
          asTrimmedString(existingArchive.memoryCandidateStatus).toLowerCase() !== 'none'
          || Boolean(asTrimmedString(existingArchive.memoryCandidateSummary))
          || Boolean(asTrimmedString(existingArchive.memoryCandidateReason))
          || Boolean(asTrimmedString(existingArchive.memoryNodeId))
        )
      if (existingArchive && (!terminalApi?.getArchivedSession || existingArchiveHasHydratedDetail)) {
        set((state) => ({
          archivedSessions: upsertArchivedSession(state.archivedSessions, existingArchive),
          threadSuggestionArchivesByThreadId: upsertThreadSuggestionArchives(
            state.threadSuggestionArchivesByThreadId,
            existingArchive,
          ),
          activeArchivedSessionId: existingArchive.sessionId,
          actionError: '',
        }))
        return existingArchive
      }
      if (!terminalApi?.getArchivedSession) {
        set({ actionError: 'Archived terminal session detail is unavailable.' })
        return null
      }

      set({ archivedSessionsPending: true, actionError: '' })
      try {
        const result = await terminalApi.getArchivedSession(normalizedSessionId, {
          projectFolder: get().hydratedProjectFolder,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_archive_get_failed'))
        }
        const archive = normalizeTerminalArchiveSession(result.archive)
        set((state) => ({
          archivedSessionsPending: false,
          archivedSessions: upsertArchivedSession(state.archivedSessions, archive),
          threadSuggestionArchivesByThreadId: upsertThreadSuggestionArchives(state.threadSuggestionArchivesByThreadId, archive),
          activeArchivedSessionId: archive.sessionId,
          actionError: '',
        }))
        return archive
      } catch (error) {
        set({
          archivedSessionsPending: false,
          actionError: asTrimmedString(error?.message || error || 'Failed to load archived terminal session.'),
        })
        return null
      }
    },

    deleteArchivedSession: async (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      if (!normalizedSessionId) return false
      const terminalApi = getTerminalApi()
      if (!terminalApi?.deleteArchivedSession) return false
      const existingArchive = findArchivedSessionBySessionId({
        archivedSessions: get().archivedSessions,
        threadSuggestionArchivesByThreadId: get().threadSuggestionArchivesByThreadId,
        sessionId: normalizedSessionId,
      })
      const archiveThreadId = asTrimmedString(existingArchive?.threadId)
      set((state) => ({
        archiveDeletePendingBySessionId: upsertBooleanMapEntry(
          state.archiveDeletePendingBySessionId,
          normalizedSessionId,
          true,
        ),
        threadSuggestionArchivesPendingByThreadId: archiveThreadId
          ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, true)
          : state.threadSuggestionArchivesPendingByThreadId,
      }))
      try {
        const result = await terminalApi.deleteArchivedSession(normalizedSessionId, {
          projectFolder: get().hydratedProjectFolder,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_archive_delete_failed'))
        }
        set((state) => ({
          archivedSessions: removeArchivedSession(state.archivedSessions, normalizedSessionId),
          threadSuggestionArchivesByThreadId: removeThreadSuggestionArchiveBySessionId(
            state.threadSuggestionArchivesByThreadId,
            normalizedSessionId,
          ),
          activeArchivedSessionId: state.activeArchivedSessionId === normalizedSessionId
            ? ''
            : state.activeArchivedSessionId,
          expandedArchivedSessionIds: normalizeExpandedArchiveSessionIds(state.expandedArchivedSessionIds)
            .filter((entry) => entry !== normalizedSessionId),
          archiveMemoryActionPendingBySessionId: removeBooleanMapEntry(
            state.archiveMemoryActionPendingBySessionId,
            normalizedSessionId,
          ),
          archiveDeletePendingBySessionId: removeBooleanMapEntry(
            state.archiveDeletePendingBySessionId,
            normalizedSessionId,
          ),
          threadSuggestionArchivesPendingByThreadId: archiveThreadId
            ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, false)
            : state.threadSuggestionArchivesPendingByThreadId,
          actionError: '',
        }))
        return true
      } catch (error) {
        set((state) => ({
          archiveDeletePendingBySessionId: removeBooleanMapEntry(
            state.archiveDeletePendingBySessionId,
            normalizedSessionId,
          ),
          threadSuggestionArchivesPendingByThreadId: archiveThreadId
            ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, false)
            : state.threadSuggestionArchivesPendingByThreadId,
          actionError: asTrimmedString(error?.message || error || 'Failed to delete archived terminal session.'),
        }))
        return false
      }
    },

    dismissArchivedSessionSuggestion: async (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      if (!normalizedSessionId) return null
      const terminalApi = getTerminalApi()
      if (!terminalApi?.dismissArchivedSessionSuggestion) return null
      const existingArchive = findArchivedSessionBySessionId({
        archivedSessions: get().archivedSessions,
        threadSuggestionArchivesByThreadId: get().threadSuggestionArchivesByThreadId,
        sessionId: normalizedSessionId,
      })
      const archiveThreadId = asTrimmedString(existingArchive?.threadId)
      set((state) => ({
        threadSuggestionArchivesPendingByThreadId: archiveThreadId
          ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, true)
          : state.threadSuggestionArchivesPendingByThreadId,
        archiveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
          state.archiveMemoryActionPendingBySessionId,
          normalizedSessionId,
          true,
        ),
      }))
      try {
        const result = await terminalApi.dismissArchivedSessionSuggestion(normalizedSessionId, {
          projectFolder: get().hydratedProjectFolder,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_archive_dismiss_failed'))
        }
        const archive = normalizeTerminalArchiveSession(result.archive)
        set((state) => ({
          archivedSessions: upsertArchivedSession(state.archivedSessions, archive),
          threadSuggestionArchivesByThreadId: upsertThreadSuggestionArchives(state.threadSuggestionArchivesByThreadId, archive),
          threadSuggestionArchivesPendingByThreadId: archiveThreadId
            ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, false)
            : state.threadSuggestionArchivesPendingByThreadId,
          archiveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
            state.archiveMemoryActionPendingBySessionId,
            normalizedSessionId,
            false,
          ),
          actionError: '',
        }))
        return archive
      } catch (error) {
        set((state) => ({
          threadSuggestionArchivesPendingByThreadId: archiveThreadId
            ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, false)
            : state.threadSuggestionArchivesPendingByThreadId,
          archiveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
            state.archiveMemoryActionPendingBySessionId,
            normalizedSessionId,
            false,
          ),
          actionError: asTrimmedString(error?.message || error || 'Failed to dismiss archived terminal suggestion.'),
        }))
        return null
      }
    },

    acceptArchivedSessionSuggestion: async (sessionId = '', options = {}) => {
      const normalizedSessionId = asTrimmedString(sessionId)
      if (!normalizedSessionId) return null
      const terminalApi = getTerminalApi()
      if (!terminalApi?.acceptArchivedSessionSuggestion) return null
      const existingArchive = findArchivedSessionBySessionId({
        archivedSessions: get().archivedSessions,
        threadSuggestionArchivesByThreadId: get().threadSuggestionArchivesByThreadId,
        sessionId: normalizedSessionId,
      })
      const archiveThreadId = asTrimmedString(existingArchive?.threadId)
      set((state) => ({
        threadSuggestionArchivesPendingByThreadId: archiveThreadId
          ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, true)
          : state.threadSuggestionArchivesPendingByThreadId,
        archiveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
          state.archiveMemoryActionPendingBySessionId,
          normalizedSessionId,
          true,
        ),
      }))
      try {
        const result = await terminalApi.acceptArchivedSessionSuggestion(normalizedSessionId, {
          projectFolder: get().hydratedProjectFolder,
          targetScope: asTrimmedString(options?.targetScope || 'thread').toLowerCase(),
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_archive_accept_failed'))
        }
        const archive = normalizeTerminalArchiveSession(result.archive)
        set((state) => ({
          archivedSessions: upsertArchivedSession(state.archivedSessions, archive),
          threadSuggestionArchivesByThreadId: upsertThreadSuggestionArchives(state.threadSuggestionArchivesByThreadId, archive),
          threadSuggestionArchivesPendingByThreadId: archiveThreadId
            ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, false)
            : state.threadSuggestionArchivesPendingByThreadId,
          archiveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
            state.archiveMemoryActionPendingBySessionId,
            normalizedSessionId,
            false,
          ),
          actionError: '',
        }))
        return archive
      } catch (error) {
        set((state) => ({
          threadSuggestionArchivesPendingByThreadId: archiveThreadId
            ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, false)
            : state.threadSuggestionArchivesPendingByThreadId,
          archiveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
            state.archiveMemoryActionPendingBySessionId,
            normalizedSessionId,
            false,
          ),
          actionError: asTrimmedString(error?.message || error || 'Failed to accept archived terminal suggestion.'),
        }))
        return null
      }
    },

    saveArchivedSessionToMemory: async (sessionId = '', options = {}) => {
      const normalizedSessionId = asTrimmedString(sessionId)
      if (!normalizedSessionId) return null
      const terminalApi = getTerminalApi()
      if (!terminalApi?.saveArchivedSessionToMemory) return null
      const existingArchive = findArchivedSessionBySessionId({
        archivedSessions: get().archivedSessions,
        threadSuggestionArchivesByThreadId: get().threadSuggestionArchivesByThreadId,
        sessionId: normalizedSessionId,
      })
      const archiveThreadId = asTrimmedString(existingArchive?.threadId)
      set((state) => ({
        archiveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
          state.archiveMemoryActionPendingBySessionId,
          normalizedSessionId,
          true,
        ),
        threadSuggestionArchivesPendingByThreadId: archiveThreadId
          ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, true)
          : state.threadSuggestionArchivesPendingByThreadId,
      }))
      try {
        const result = await terminalApi.saveArchivedSessionToMemory(normalizedSessionId, {
          projectFolder: get().hydratedProjectFolder,
          targetScope: asTrimmedString(options?.targetScope || 'thread').toLowerCase(),
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_archive_save_to_memory_failed'))
        }
        const archive = normalizeTerminalArchiveSession(result.archive)
        set((state) => ({
          archivedSessions: upsertArchivedSession(state.archivedSessions, archive),
          threadSuggestionArchivesByThreadId: upsertThreadSuggestionArchives(state.threadSuggestionArchivesByThreadId, archive),
          archiveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
            state.archiveMemoryActionPendingBySessionId,
            normalizedSessionId,
            false,
          ),
          threadSuggestionArchivesPendingByThreadId: archiveThreadId
            ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, false)
            : state.threadSuggestionArchivesPendingByThreadId,
          actionError: '',
        }))
        return archive
      } catch (error) {
        set((state) => ({
          archiveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
            state.archiveMemoryActionPendingBySessionId,
            normalizedSessionId,
            false,
          ),
          threadSuggestionArchivesPendingByThreadId: archiveThreadId
            ? upsertBooleanMapEntry(state.threadSuggestionArchivesPendingByThreadId, archiveThreadId, false)
            : state.threadSuggestionArchivesPendingByThreadId,
          actionError: asTrimmedString(error?.message || error || 'Failed to save archived terminal session to Memory.'),
        }))
        return null
      }
    },
  }
}
