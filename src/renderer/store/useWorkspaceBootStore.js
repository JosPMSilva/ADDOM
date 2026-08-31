import { create } from 'zustand'
import {
  preloadCriticalWorkspacePanelChunks,
  preloadSecondaryWorkspacePanelChunks,
} from '../workspace-panel-loaders.mjs'
import useArtifactsStore from './useArtifactsStore.js'
import useEditorStore from './useEditorStore.js'
import useMemoryStore from './useMemoryStore.js'
import useSettingsStore from './useSettingsStore.js'

let workspaceBootSequence = 0

const useWorkspaceBootStore = create((set, get) => ({
  bootProjectFolder: '',
  bootProjectId: '',
  status: 'idle',
  backgroundStatus: 'idle',
  startedAt: 0,
  readyAt: 0,
  error: '',

  resetBoot: () => {
    workspaceBootSequence += 1
    useArtifactsStore.getState().resetFiles?.()
    useEditorStore.getState().resetTree?.()
    useMemoryStore.getState().resetProjectState?.()
    useSettingsStore.getState().resetProjectSettingsCaches?.()
    set({
      bootProjectFolder: '',
      bootProjectId: '',
      status: 'idle',
      backgroundStatus: 'idle',
      startedAt: 0,
      readyAt: 0,
      error: '',
    })
  },

  startWorkspaceBoot: async ({ projectFolder, activeProjectId } = {}) => {
    const normalizedProjectFolder = String(projectFolder || '').trim()
    const normalizedProjectId = String(activeProjectId || '').trim()
    if (!normalizedProjectFolder) {
      get().resetBoot()
      return
    }

    const state = get()
    if (
      state.bootProjectFolder === normalizedProjectFolder
      && state.bootProjectId === normalizedProjectId
      && (
        state.status === 'loading'
        || (state.status === 'ready' && state.backgroundStatus !== 'error')
      )
    ) {
      return
    }

    const bootId = ++workspaceBootSequence
    set({
      bootProjectFolder: normalizedProjectFolder,
      bootProjectId: normalizedProjectId,
      status: 'loading',
      backgroundStatus: 'idle',
      startedAt: Date.now(),
      readyAt: 0,
      error: '',
    })

    const criticalPanelChunksPromise = preloadCriticalWorkspacePanelChunks()

    const criticalResults = await Promise.allSettled([
      useEditorStore.getState().loadTree(normalizedProjectFolder, { throwOnError: true }),
      useArtifactsStore.getState().loadFiles(normalizedProjectFolder, { throwOnError: true }),
      useMemoryStore.getState().loadNodes(normalizedProjectFolder, { throwOnError: true }),
      useSettingsStore.getState().ensureCoreSettingsHydrated({ throwOnError: true }),
    ])

    if (bootId !== workspaceBootSequence) return

    const criticalFailure = criticalResults.find((result) => result.status === 'rejected')
    if (criticalFailure) {
      set({
        status: 'error',
        backgroundStatus: 'idle',
        readyAt: 0,
        error: String(criticalFailure.reason?.message || criticalFailure.reason || 'Workspace boot failed.'),
      })
      return
    }

    set({
      status: 'ready',
      backgroundStatus: 'loading',
      readyAt: Date.now(),
      error: '',
    })

    void Promise.allSettled([
      criticalPanelChunksPromise,
      preloadSecondaryWorkspacePanelChunks(),
      useSettingsStore.getState().hydrateProjectSettingsCaches({
        activeProjectId: normalizedProjectId,
        includeRemoteOpenAIAssets: false,
      }),
    ]).then((results) => {
      if (bootId !== workspaceBootSequence) return
      const backgroundFailure = results.find((result) => result.status === 'rejected')
      if (!backgroundFailure) {
        set({ backgroundStatus: 'ready' })
        return
      }
      set({
        backgroundStatus: 'error',
        error: String(backgroundFailure.reason?.message || backgroundFailure.reason || 'Workspace secondary boot hydration failed.'),
      })
    })
  },
}))

export default useWorkspaceBootStore
