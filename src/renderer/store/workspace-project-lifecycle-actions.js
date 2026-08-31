import useAppStore from './useAppStore.js'
import useChatStore from './useChatStore.js'
import useTerminalStore from './useTerminalStore.js'

function normalizeId(value) {
  const id = String(value ?? '').trim()
  return id || null
}

function withoutKey(source = {}, key = '') {
  return Object.fromEntries(Object.entries(source || {}).filter(([id]) => id !== key))
}

export function createWorkspaceProjectLifecycleActions({
  get,
  set,
  workspaceApi = null,
  now = Date.now,
} = {}) {
  const resolveWorkspaceApi = () => workspaceApi || globalThis.window?.addom?.workspace

  return {
    restoreProjectToRecent: (projectId) => {
      const id = normalizeId(projectId)
      if (!id) return false
      set((state) => ({
        projectEntryArchivedAtById: withoutKey(state.projectEntryArchivedAtById, id),
        projectEntryRestoredAtById: {
          ...state.projectEntryRestoredAtById,
          [id]: now(),
        },
      }))
      return true
    },

    archiveProjectById: async (projectId, { stopActive = false } = {}) => {
      const id = normalizeId(projectId)
      if (!id) return { ok: false }
      const api = resolveWorkspaceApi()
      const settlement = await api.stopActiveWork({
        scope: 'project',
        projectId: id,
        stopActive: stopActive === true,
      })
      if (!settlement?.ok) return settlement || { ok: false }

      const wasActive = id === normalizeId(get().activeProjectId)
      if (wasActive) {
        await api.clearActiveProject({ notifyRenderer: false })
      }
      set((state) => ({
        projectEntryArchivedAtById: {
          ...state.projectEntryArchivedAtById,
          [id]: now(),
        },
        projectEntryRestoredAtById: withoutKey(state.projectEntryRestoredAtById, id),
      }))
      if (wasActive) get().leaveToProjectEntry()
      return { ok: true, projectId: id, wasActive }
    },

    removeProjectById: async (projectId, { stopActive = false } = {}) => {
      const id = normalizeId(projectId)
      if (!id) return { ok: false }
      const result = await resolveWorkspaceApi().removeProject(id, { stopActive })
      if (!result?.ok) return result || { ok: false }

      const state = get()
      const wasActive = id === normalizeId(state.activeProjectId)
      const nextPreferred = id === normalizeId(state.preferredProjectId) ? null : state.preferredProjectId
      const lifecycleState = {
        preferredProjectId: nextPreferred,
        projectEntryArchivedAtById: withoutKey(state.projectEntryArchivedAtById, id),
        projectEntryRestoredAtById: withoutKey(state.projectEntryRestoredAtById, id),
      }

      if (wasActive) {
        set({
          ...lifecycleState,
          activeProjectId: null,
          activeThreadId: null,
          threads: [],
          restoreWorkspaceViewMode: 'project-entry',
        })
        const app = useAppStore.getState()
        app.setProjectFolder(null)
        app.setActiveProjectId(null)
        app.setActiveThreadId(null)
        app.setWorkspaceViewMode('project-entry')
        useChatStore.getState().hydrateFromTimeline([])
        useTerminalStore.getState().resetState?.()
      } else {
        set(lifecycleState)
      }

      await get().loadProjects()
      return result
    },
  }
}
