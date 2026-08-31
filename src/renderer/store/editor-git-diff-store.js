import {
  buildCanonicalFileUri,
  getModelRegistryEntry,
  isModelRegistryDirty,
  normalizeEditorProjectFolder,
} from './editor-model-registry.js'
import useSourceControlStore from './useSourceControlStore.js'

function getRendererGitApi() {
  if (typeof window === 'undefined') return null
  const api = window?.addom?.git
  if (!api || typeof api.getFileDiff !== 'function') return null
  return api
}

function removeObjectKey(source = {}, key = '') {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return source
  const next = { ...source }
  delete next[key]
  return next
}

const GIT_DIFF_SCOPES = Object.freeze(['unstaged', 'staged'])

function normalizeGitScope(scope = 'unstaged') {
  return String(scope || '').trim().toLowerCase() === 'staged' ? 'staged' : 'unstaged'
}

function buildGitPreviewUri(projectFolder = '', filePath = '', scope = 'staged', contentSource = 'index') {
  const canonicalFileUri = buildCanonicalFileUri(projectFolder, filePath)
  if (!canonicalFileUri) return ''
  const params = new URLSearchParams({
    addomGitPreview: '1',
    scope: normalizeGitScope(scope),
    source: String(contentSource || 'index').trim() || 'index',
  })
  return `${canonicalFileUri}?${params.toString()}`
}

function createEmptyGitUiScopeState() {
  return {
    selectedHunkId: '',
    actionHunkId: '',
    actionType: '',
    actionError: '',
  }
}

function createEmptyGitUiState() {
  return {
    unstaged: createEmptyGitUiScopeState(),
    staged: createEmptyGitUiScopeState(),
  }
}

function createEmptyScopedGitState(defaultValue) {
  return {
    unstaged: defaultValue,
    staged: defaultValue,
  }
}

function createDirtyBlockedGitDiff(tab = null, scope = 'unstaged') {
  return {
    ok: true,
    status: 'blocked_dirty',
    scope: normalizeGitScope(scope),
    insideWorkTree: false,
    repoRoot: '',
    relativePath: '',
    projectRelativePath: String(tab?.filePath || '').trim(),
    absolutePath: '',
    hasDiff: false,
    dirtyBufferBlocked: true,
    unsupportedReason: 'dirty_buffer',
    hunks: [],
    hunkCount: 0,
    addedLineCount: 0,
    deletedLineCount: 0,
  }
}

function getTabGitScopeValue(scopeByTab = {}, tabId = '') {
  return normalizeGitScope(scopeByTab[String(tabId || '').trim()])
}

function getTabScopedValue(mapByTab = {}, tabId = '') {
  return mapByTab[String(tabId || '').trim()] ?? null
}

function getTabScopedGitValue(mapByTab = {}, scopeByTab = {}, tabId = '', requestedScope) {
  const normalizedId = String(tabId || '').trim()
  if (!normalizedId) return null
  const scope = normalizeGitScope(requestedScope || getTabGitScopeValue(scopeByTab, normalizedId))
  return getTabScopedValue(mapByTab, normalizedId)?.[scope] ?? null
}

function getTabScopedGitUiValue(uiByTab = {}, scopeByTab = {}, tabId = '', requestedScope) {
  const normalizedId = String(tabId || '').trim()
  if (!normalizedId) return createEmptyGitUiScopeState()
  const scope = normalizeGitScope(requestedScope || getTabGitScopeValue(scopeByTab, normalizedId))
  return uiByTab[normalizedId]?.[scope] ?? createEmptyGitUiScopeState()
}

function syncSourceControlStatus(projectFolder = '') {
  const normalizedProjectFolder = normalizeEditorProjectFolder(projectFolder)
  if (!normalizedProjectFolder) return
  const sourceControlState = useSourceControlStore.getState()
  if (String(sourceControlState?.projectFolder || '').trim() !== normalizedProjectFolder) return
  void sourceControlState.refreshStatus(normalizedProjectFolder)
}

export function createInitialEditorGitDiffState() {
  return {
    gitDiffByTab: {},
    gitDiffLoadingByTab: {},
    gitDiffErrorByTab: {},
    gitDiffScopeByTab: {},
    gitDiffUiByTab: {},
    gitDiffRequestByTab: {},
  }
}

export function createEditorGitDiffActions({ set, get }) {
  return {
    getTabGitDiff: (tabId) => getTabScopedGitValue(get().gitDiffByTab, get().gitDiffScopeByTab, tabId),

    getTabGitDiffForScope: (tabId, scope) => (
      getTabScopedGitValue(get().gitDiffByTab, get().gitDiffScopeByTab, tabId, scope)
    ),

    getTabGitScope: (tabId) => getTabGitScopeValue(get().gitDiffScopeByTab, tabId),

    getTabGitUi: (tabId, scope) => (
      getTabScopedGitUiValue(get().gitDiffUiByTab, get().gitDiffScopeByTab, tabId, scope)
    ),

    getTabGitPreviewState: (tabId, scope) => {
      const normalizedId = String(tabId || '').trim()
      if (!normalizedId) return null
      const tab = get().tabs.find((candidate) => candidate.id === normalizedId)
      if (!tab?.filePath) return null
      const gitDiff = get().getTabGitDiffForScope(normalizedId, scope)
      const normalizedScope = normalizeGitScope(scope || get().getTabGitScope(normalizedId))
      const contentSource = String(gitDiff?.contentSource || '').trim().toLowerCase()
      const previewContent = String(gitDiff?.previewContent || '')
      const previewReadOnly = gitDiff?.previewReadOnly === true
      if (!previewReadOnly || contentSource !== 'index') return null
      const projectFolder = getModelRegistryEntry(tab.modelUri)?.projectFolder || ''
      const modelUri = buildGitPreviewUri(projectFolder, tab.filePath, normalizedScope, contentSource)
      if (!modelUri) return null
      return {
        modelUri,
        previewContent,
        contentSource,
        previewReadOnly: true,
        filePath: tab.filePath,
        language: tab.language,
        projectFolder,
      }
    },

    setTabGitScope: (tabId, scope = 'unstaged') => {
      const normalizedId = String(tabId || '').trim()
      if (!normalizedId) return
      const normalizedScope = normalizeGitScope(scope)
      set((state) => (
        getTabGitScopeValue(state.gitDiffScopeByTab, normalizedId) === normalizedScope
          ? state
          : {
              gitDiffScopeByTab: {
                ...state.gitDiffScopeByTab,
                [normalizedId]: normalizedScope,
              },
            }
      ))
    },

    clearTabGitDiff: (tabId) => {
      const normalizedId = String(tabId || '').trim()
      if (!normalizedId) return
      set((state) => ({
        gitDiffByTab: removeObjectKey(state.gitDiffByTab, normalizedId),
        gitDiffLoadingByTab: removeObjectKey(state.gitDiffLoadingByTab, normalizedId),
        gitDiffErrorByTab: removeObjectKey(state.gitDiffErrorByTab, normalizedId),
        gitDiffScopeByTab: removeObjectKey(state.gitDiffScopeByTab, normalizedId),
        gitDiffUiByTab: removeObjectKey(state.gitDiffUiByTab, normalizedId),
        gitDiffRequestByTab: removeObjectKey(state.gitDiffRequestByTab, normalizedId),
      }))
    },

    toggleTabGitHunkSelection: (tabId, hunkId, scope) => {
      const normalizedId = String(tabId || '').trim()
      const normalizedHunkId = String(hunkId || '').trim()
      if (!normalizedId || !normalizedHunkId) return
      set((state) => {
        const activeScope = normalizeGitScope(scope || getTabGitScopeValue(state.gitDiffScopeByTab, normalizedId))
        const currentUiByScope = state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()
        const currentUi = currentUiByScope[activeScope] ?? createEmptyGitUiScopeState()
        return {
          gitDiffScopeByTab: {
            ...state.gitDiffScopeByTab,
            [normalizedId]: activeScope,
          },
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...currentUiByScope,
              [activeScope]: {
                ...currentUi,
                selectedHunkId: currentUi.selectedHunkId === normalizedHunkId ? '' : normalizedHunkId,
                actionError: '',
              },
            },
          },
        }
      })
    },

    closeTabGitWidget: (tabId, scope) => {
      const normalizedId = String(tabId || '').trim()
      if (!normalizedId) return
      set((state) => {
        const activeScope = normalizeGitScope(scope || getTabGitScopeValue(state.gitDiffScopeByTab, normalizedId))
        const currentUiByScope = state.gitDiffUiByTab[normalizedId]
        const currentUi = currentUiByScope?.[activeScope]
        if (!currentUiByScope || !currentUi) return state
        return {
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...currentUiByScope,
              [activeScope]: {
                ...currentUi,
                selectedHunkId: '',
                actionHunkId: '',
                actionType: '',
                actionError: '',
              },
            },
          },
        }
      })
    },

    refreshTabGitDiff: async (projectFolder, tabId, options = {}) => {
      const normalizedId = String(tabId || '').trim()
      if (!normalizedId) return { ok: false, reason: 'missing_tab_id' }
      const tab = get().tabs.find((candidate) => candidate.id === normalizedId)
      if (!tab || tab.loading || tab.error) {
        get().clearTabGitDiff(normalizedId)
        return { ok: false, reason: 'tab_not_ready' }
      }

      const normalizedProjectFolder = normalizeEditorProjectFolder(
        projectFolder || getModelRegistryEntry(tab.modelUri)?.projectFolder || '',
      )
      if (!normalizedProjectFolder) {
        get().clearTabGitDiff(normalizedId)
        return { ok: false, reason: 'missing_project_folder' }
      }

      const requestedScopes = Array.isArray(options?.scopes) && options.scopes.length > 0
        ? options.scopes.map((scope) => normalizeGitScope(scope))
        : [normalizeGitScope(options?.scope || '' || 'unstaged')]
      const scopes = options?.scope || (Array.isArray(options?.scopes) && options.scopes.length > 0)
        ? Array.from(new Set(requestedScopes))
        : [...GIT_DIFF_SCOPES]

      if (tab.modelUri && isModelRegistryDirty(tab.modelUri)) {
        set((state) => ({
          gitDiffByTab: {
            ...state.gitDiffByTab,
            [normalizedId]: GIT_DIFF_SCOPES.reduce((acc, scope) => {
              acc[scope] = createDirtyBlockedGitDiff(tab, scope)
              return acc
            }, {}),
          },
          gitDiffLoadingByTab: {
            ...state.gitDiffLoadingByTab,
            [normalizedId]: createEmptyScopedGitState(false),
          },
          gitDiffErrorByTab: {
            ...state.gitDiffErrorByTab,
            [normalizedId]: createEmptyScopedGitState(''),
          },
          gitDiffScopeByTab: {
            ...state.gitDiffScopeByTab,
            [normalizedId]: getTabGitScopeValue(state.gitDiffScopeByTab, normalizedId),
          },
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: createEmptyGitUiState(),
          },
          gitDiffRequestByTab: removeObjectKey(state.gitDiffRequestByTab, normalizedId),
        }))
        return { ok: false, blocked: true, reason: 'dirty_tab' }
      }

      const gitApi = getRendererGitApi()
      if (!gitApi) {
        get().clearTabGitDiff(normalizedId)
        return { ok: false, reason: 'git_api_unavailable' }
      }

      const requestIds = scopes.reduce((acc, scope) => {
        acc[scope] = `git_${scope}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        return acc
      }, {})
      set((state) => ({
        gitDiffLoadingByTab: {
          ...state.gitDiffLoadingByTab,
          [normalizedId]: {
            ...(state.gitDiffLoadingByTab[normalizedId] ?? createEmptyScopedGitState(false)),
            ...scopes.reduce((acc, scope) => {
              acc[scope] = true
              return acc
            }, {}),
          },
        },
        gitDiffErrorByTab: {
          ...state.gitDiffErrorByTab,
          [normalizedId]: {
            ...(state.gitDiffErrorByTab[normalizedId] ?? createEmptyScopedGitState('')),
            ...scopes.reduce((acc, scope) => {
              acc[scope] = ''
              return acc
            }, {}),
          },
        },
        gitDiffScopeByTab: {
          ...state.gitDiffScopeByTab,
          [normalizedId]: getTabGitScopeValue(state.gitDiffScopeByTab, normalizedId),
        },
        gitDiffRequestByTab: {
          ...state.gitDiffRequestByTab,
          [normalizedId]: {
            ...(state.gitDiffRequestByTab[normalizedId] ?? createEmptyScopedGitState('')),
            ...requestIds,
          },
        },
      }))

      try {
        const results = await Promise.all(scopes.map(async (scope) => {
          try {
            const result = await gitApi.getFileDiff(normalizedProjectFolder, tab.filePath, { scope })
            return { scope, result }
          } catch (error) {
            return {
              scope,
              result: {
                ok: false,
                error: 'git_diff_failed',
                message: String(error?.message || error || 'git_diff_failed'),
              },
            }
          }
        }))
        const currentState = get()
        const currentTab = currentState.tabs.find((candidate) => candidate.id === normalizedId)
        if (!currentTab) {
          return { ok: false, reason: 'tab_closed' }
        }

        set((state) => {
          const nextDiffByScope = {
            ...(state.gitDiffByTab[normalizedId] ?? createEmptyScopedGitState(null)),
          }
          const nextLoadingByScope = {
            ...(state.gitDiffLoadingByTab[normalizedId] ?? createEmptyScopedGitState(false)),
          }
          const nextErrorByScope = {
            ...(state.gitDiffErrorByTab[normalizedId] ?? createEmptyScopedGitState('')),
          }
          const nextUiByScope = {
            ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
          }
          const nextRequestByScope = {
            ...(state.gitDiffRequestByTab[normalizedId] ?? createEmptyScopedGitState('')),
          }

          for (const { scope, result } of results) {
            if (nextRequestByScope[scope] !== requestIds[scope]) continue
            nextLoadingByScope[scope] = false
            nextRequestByScope[scope] = ''

            if (!result?.ok) {
              nextDiffByScope[scope] = null
              nextErrorByScope[scope] = String(result?.message || result?.error || 'git_diff_failed')
              nextUiByScope[scope] = createEmptyGitUiScopeState()
              continue
            }

            const currentUi = nextUiByScope[scope] ?? createEmptyGitUiScopeState()
            const nextHunks = Array.isArray(result?.hunks) ? result.hunks : []
            const hasSelectedHunk = currentUi.selectedHunkId
              && nextHunks.some((hunk) => hunk?.id === currentUi.selectedHunkId)
            nextDiffByScope[scope] = result
            nextErrorByScope[scope] = ''
            nextUiByScope[scope] = {
              ...currentUi,
              selectedHunkId: hasSelectedHunk ? currentUi.selectedHunkId : '',
              actionHunkId: '',
              actionType: '',
              actionError: '',
            }
          }

          return {
            gitDiffByTab: {
              ...state.gitDiffByTab,
              [normalizedId]: nextDiffByScope,
            },
            gitDiffLoadingByTab: {
              ...state.gitDiffLoadingByTab,
              [normalizedId]: nextLoadingByScope,
            },
            gitDiffErrorByTab: {
              ...state.gitDiffErrorByTab,
              [normalizedId]: nextErrorByScope,
            },
            gitDiffScopeByTab: {
              ...state.gitDiffScopeByTab,
              [normalizedId]: getTabGitScopeValue(state.gitDiffScopeByTab, normalizedId),
            },
            gitDiffUiByTab: {
              ...state.gitDiffUiByTab,
              [normalizedId]: nextUiByScope,
            },
            gitDiffRequestByTab: {
              ...state.gitDiffRequestByTab,
              [normalizedId]: nextRequestByScope,
            },
          }
        })
        const requestedScope = scopes.length === 1 ? scopes[0] : get().getTabGitScope(normalizedId)
        const requestedResult = get().getTabGitDiffForScope(normalizedId, requestedScope)
        const requestedError = getTabScopedGitValue(
          get().gitDiffErrorByTab,
          get().gitDiffScopeByTab,
          normalizedId,
          requestedScope,
        )
        if (requestedResult) return requestedResult
        if (requestedError) return { ok: false, error: 'git_diff_failed', message: requestedError }
        return { ok: false, reason: 'stale_request' }
      } catch (error) {
        const message = String(error?.message || error || 'git_diff_failed')
        set((state) => ({
          gitDiffLoadingByTab: {
            ...state.gitDiffLoadingByTab,
            [normalizedId]: {
              ...(state.gitDiffLoadingByTab[normalizedId] ?? createEmptyScopedGitState(false)),
              ...scopes.reduce((acc, scope) => {
                acc[scope] = false
                return acc
              }, {}),
            },
          },
          gitDiffErrorByTab: {
            ...state.gitDiffErrorByTab,
            [normalizedId]: {
              ...(state.gitDiffErrorByTab[normalizedId] ?? createEmptyScopedGitState('')),
              ...scopes.reduce((acc, scope) => {
                acc[scope] = message
                return acc
              }, {}),
            },
          },
          gitDiffRequestByTab: {
            ...state.gitDiffRequestByTab,
            [normalizedId]: {
              ...(state.gitDiffRequestByTab[normalizedId] ?? createEmptyScopedGitState('')),
              ...scopes.reduce((acc, scope) => {
                acc[scope] = ''
                return acc
              }, {}),
            },
          },
        }))
        return { ok: false, error: 'git_diff_failed', message }
      }
    },

    stageTabGitHunk: async (projectFolder, tabId, hunkId) => {
      const normalizedId = String(tabId || '').trim()
      const normalizedHunkId = String(hunkId || '').trim()
      if (!normalizedId || !normalizedHunkId) return { ok: false, reason: 'missing_hunk_id' }
      const tab = get().tabs.find((candidate) => candidate.id === normalizedId)
      if (!tab || tab.loading || tab.error) return { ok: false, reason: 'tab_not_ready' }

      const normalizedProjectFolder = normalizeEditorProjectFolder(
        projectFolder || getModelRegistryEntry(tab.modelUri)?.projectFolder || '',
      )
      if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
      if (tab.modelUri && isModelRegistryDirty(tab.modelUri)) {
        await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        return { ok: false, blocked: true, reason: 'dirty_tab' }
      }

      const gitApi = getRendererGitApi()
      if (!gitApi || typeof gitApi.stageHunk !== 'function') {
        return { ok: false, reason: 'git_api_unavailable' }
      }

      set((state) => ({
        gitDiffScopeByTab: {
          ...state.gitDiffScopeByTab,
          [normalizedId]: 'unstaged',
        },
        gitDiffUiByTab: {
          ...state.gitDiffUiByTab,
          [normalizedId]: {
            ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
            unstaged: {
              ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
              selectedHunkId: normalizedHunkId,
              actionHunkId: normalizedHunkId,
              actionType: 'stage',
              actionError: '',
            },
          },
        },
      }))

      try {
        const result = await gitApi.stageHunk(normalizedProjectFolder, tab.filePath, normalizedHunkId)
        if (result?.ok) {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
          syncSourceControlStatus(normalizedProjectFolder)
          return result
        }
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              unstaged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: String(result?.message || result?.error || 'stage_hunk_failed'),
              },
            },
          },
        }))
        if (result?.error === 'stale_hunk') {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        }
        return result
      } catch (error) {
        const message = String(error?.message || error || 'stage_hunk_failed')
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              unstaged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: message,
              },
            },
          },
        }))
        return { ok: false, error: 'stage_hunk_failed', message }
      }
    },

    discardTabGitHunk: async (projectFolder, tabId, hunkId) => {
      const normalizedId = String(tabId || '').trim()
      const normalizedHunkId = String(hunkId || '').trim()
      if (!normalizedId || !normalizedHunkId) return { ok: false, reason: 'missing_hunk_id' }
      const tab = get().tabs.find((candidate) => candidate.id === normalizedId)
      if (!tab || tab.loading || tab.error) return { ok: false, reason: 'tab_not_ready' }

      const normalizedProjectFolder = normalizeEditorProjectFolder(
        projectFolder || getModelRegistryEntry(tab.modelUri)?.projectFolder || '',
      )
      if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
      if (tab.modelUri && isModelRegistryDirty(tab.modelUri)) {
        await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        return { ok: false, blocked: true, reason: 'dirty_tab' }
      }

      const gitApi = getRendererGitApi()
      if (!gitApi || typeof gitApi.discardHunk !== 'function') {
        return { ok: false, reason: 'git_api_unavailable' }
      }

      set((state) => ({
        gitDiffScopeByTab: {
          ...state.gitDiffScopeByTab,
          [normalizedId]: 'unstaged',
        },
        gitDiffUiByTab: {
          ...state.gitDiffUiByTab,
          [normalizedId]: {
            ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
            unstaged: {
              ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
              selectedHunkId: normalizedHunkId,
              actionHunkId: normalizedHunkId,
              actionType: 'discard',
              actionError: '',
            },
          },
        },
      }))

      try {
        const result = await gitApi.discardHunk(normalizedProjectFolder, tab.filePath, normalizedHunkId)
        if (result?.ok) {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
          syncSourceControlStatus(normalizedProjectFolder)
          return result
        }
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              unstaged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: String(result?.message || result?.error || 'discard_hunk_failed'),
              },
            },
          },
        }))
        if (result?.error === 'stale_hunk') {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        }
        return result
      } catch (error) {
        const message = String(error?.message || error || 'discard_hunk_failed')
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              unstaged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: message,
              },
            },
          },
        }))
        return { ok: false, error: 'discard_hunk_failed', message }
      }
    },

    unstageTabGitHunk: async (projectFolder, tabId, hunkId) => {
      const normalizedId = String(tabId || '').trim()
      const normalizedHunkId = String(hunkId || '').trim()
      if (!normalizedId || !normalizedHunkId) return { ok: false, reason: 'missing_hunk_id' }
      const tab = get().tabs.find((candidate) => candidate.id === normalizedId)
      if (!tab || tab.loading || tab.error) return { ok: false, reason: 'tab_not_ready' }

      const normalizedProjectFolder = normalizeEditorProjectFolder(
        projectFolder || getModelRegistryEntry(tab.modelUri)?.projectFolder || '',
      )
      if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }

      const gitApi = getRendererGitApi()
      if (!gitApi || typeof gitApi.unstageHunk !== 'function') {
        return { ok: false, reason: 'git_api_unavailable' }
      }

      set((state) => ({
        gitDiffScopeByTab: {
          ...state.gitDiffScopeByTab,
          [normalizedId]: 'staged',
        },
        gitDiffUiByTab: {
          ...state.gitDiffUiByTab,
          [normalizedId]: {
            ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
            staged: {
              ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).staged),
              selectedHunkId: normalizedHunkId,
              actionHunkId: normalizedHunkId,
              actionType: 'unstage',
              actionError: '',
            },
          },
        },
      }))

      try {
        const result = await gitApi.unstageHunk(normalizedProjectFolder, tab.filePath, normalizedHunkId)
        if (result?.ok) {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
          syncSourceControlStatus(normalizedProjectFolder)
          return result
        }
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              staged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).staged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: String(result?.message || result?.error || 'unstage_hunk_failed'),
              },
            },
          },
        }))
        if (result?.error === 'stale_hunk') {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        }
        return result
      } catch (error) {
        const message = String(error?.message || error || 'unstage_hunk_failed')
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              staged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).staged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: message,
              },
            },
          },
        }))
        return { ok: false, error: 'unstage_hunk_failed', message }
      }
    },

    stageTabGitLines: async (projectFolder, tabId, input = {}) => {
      const normalizedId = String(tabId || '').trim()
      if (!normalizedId) return { ok: false, reason: 'missing_tab_id' }
      const normalizedHunkId = String(input?.hunkId || '').trim()
      const startLine = Number(input?.startLine || 0)
      const endLine = Number(input?.endLine || 0)
      if (!normalizedHunkId || !startLine || !endLine) return { ok: false, reason: 'missing_line_selection' }
      const tab = get().tabs.find((candidate) => candidate.id === normalizedId)
      if (!tab || tab.loading || tab.error) return { ok: false, reason: 'tab_not_ready' }

      const normalizedProjectFolder = normalizeEditorProjectFolder(
        projectFolder || getModelRegistryEntry(tab.modelUri)?.projectFolder || '',
      )
      if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
      if (tab.modelUri && isModelRegistryDirty(tab.modelUri)) {
        await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        return { ok: false, blocked: true, reason: 'dirty_tab' }
      }

      const gitApi = getRendererGitApi()
      if (!gitApi || typeof gitApi.stageLines !== 'function') {
        return { ok: false, reason: 'git_api_unavailable' }
      }

      set((state) => ({
        gitDiffScopeByTab: {
          ...state.gitDiffScopeByTab,
          [normalizedId]: 'unstaged',
        },
        gitDiffUiByTab: {
          ...state.gitDiffUiByTab,
          [normalizedId]: {
            ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
            unstaged: {
              ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
              selectedHunkId: normalizedHunkId,
              actionHunkId: normalizedHunkId,
              actionType: 'stage_lines',
              actionError: '',
            },
          },
        },
      }))

      try {
        const result = await gitApi.stageLines(normalizedProjectFolder, tab.filePath, {
          hunkId: normalizedHunkId,
          startLine,
          endLine,
        })
        if (result?.ok) {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
          syncSourceControlStatus(normalizedProjectFolder)
          return result
        }
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              unstaged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: String(result?.message || result?.error || 'stage_lines_failed'),
              },
            },
          },
        }))
        if (result?.error === 'stale_hunk') {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        }
        return result
      } catch (error) {
        const message = String(error?.message || error || 'stage_lines_failed')
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              unstaged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: message,
              },
            },
          },
        }))
        return { ok: false, error: 'stage_lines_failed', message }
      }
    },

    discardTabGitLines: async (projectFolder, tabId, input = {}) => {
      const normalizedId = String(tabId || '').trim()
      if (!normalizedId) return { ok: false, reason: 'missing_tab_id' }
      const normalizedHunkId = String(input?.hunkId || '').trim()
      const startLine = Number(input?.startLine || 0)
      const endLine = Number(input?.endLine || 0)
      if (!normalizedHunkId || !startLine || !endLine) return { ok: false, reason: 'missing_line_selection' }
      const tab = get().tabs.find((candidate) => candidate.id === normalizedId)
      if (!tab || tab.loading || tab.error) return { ok: false, reason: 'tab_not_ready' }

      const normalizedProjectFolder = normalizeEditorProjectFolder(
        projectFolder || getModelRegistryEntry(tab.modelUri)?.projectFolder || '',
      )
      if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
      if (tab.modelUri && isModelRegistryDirty(tab.modelUri)) {
        await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        return { ok: false, blocked: true, reason: 'dirty_tab' }
      }

      const gitApi = getRendererGitApi()
      if (!gitApi || typeof gitApi.discardLines !== 'function') {
        return { ok: false, reason: 'git_api_unavailable' }
      }

      set((state) => ({
        gitDiffScopeByTab: {
          ...state.gitDiffScopeByTab,
          [normalizedId]: 'unstaged',
        },
        gitDiffUiByTab: {
          ...state.gitDiffUiByTab,
          [normalizedId]: {
            ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
            unstaged: {
              ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
              selectedHunkId: normalizedHunkId,
              actionHunkId: normalizedHunkId,
              actionType: 'discard_lines',
              actionError: '',
            },
          },
        },
      }))

      try {
        const result = await gitApi.discardLines(normalizedProjectFolder, tab.filePath, {
          hunkId: normalizedHunkId,
          startLine,
          endLine,
        })
        if (result?.ok) {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
          syncSourceControlStatus(normalizedProjectFolder)
          return result
        }
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              unstaged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: String(result?.message || result?.error || 'discard_lines_failed'),
              },
            },
          },
        }))
        if (result?.error === 'stale_hunk') {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        }
        return result
      } catch (error) {
        const message = String(error?.message || error || 'discard_lines_failed')
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              unstaged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).unstaged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: message,
              },
            },
          },
        }))
        return { ok: false, error: 'discard_lines_failed', message }
      }
    },

    unstageTabGitLines: async (projectFolder, tabId, input = {}) => {
      const normalizedId = String(tabId || '').trim()
      if (!normalizedId) return { ok: false, reason: 'missing_tab_id' }
      const normalizedHunkId = String(input?.hunkId || '').trim()
      const startLine = Number(input?.startLine || 0)
      const endLine = Number(input?.endLine || 0)
      if (!normalizedHunkId || !startLine || !endLine) return { ok: false, reason: 'missing_line_selection' }
      const tab = get().tabs.find((candidate) => candidate.id === normalizedId)
      if (!tab || tab.loading || tab.error) return { ok: false, reason: 'tab_not_ready' }

      const normalizedProjectFolder = normalizeEditorProjectFolder(
        projectFolder || getModelRegistryEntry(tab.modelUri)?.projectFolder || '',
      )
      if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }

      const gitApi = getRendererGitApi()
      if (!gitApi || typeof gitApi.unstageLines !== 'function') {
        return { ok: false, reason: 'git_api_unavailable' }
      }

      set((state) => ({
        gitDiffScopeByTab: {
          ...state.gitDiffScopeByTab,
          [normalizedId]: 'staged',
        },
        gitDiffUiByTab: {
          ...state.gitDiffUiByTab,
          [normalizedId]: {
            ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
            staged: {
              ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).staged),
              selectedHunkId: normalizedHunkId,
              actionHunkId: normalizedHunkId,
              actionType: 'unstage_lines',
              actionError: '',
            },
          },
        },
      }))

      try {
        const result = await gitApi.unstageLines(normalizedProjectFolder, tab.filePath, {
          hunkId: normalizedHunkId,
          startLine,
          endLine,
        })
        if (result?.ok) {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
          syncSourceControlStatus(normalizedProjectFolder)
          return result
        }
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              staged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).staged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: String(result?.message || result?.error || 'unstage_lines_failed'),
              },
            },
          },
        }))
        if (result?.error === 'stale_hunk') {
          await get().refreshTabGitDiff(normalizedProjectFolder, normalizedId)
        }
        return result
      } catch (error) {
        const message = String(error?.message || error || 'unstage_lines_failed')
        set((state) => ({
          gitDiffUiByTab: {
            ...state.gitDiffUiByTab,
            [normalizedId]: {
              ...(state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()),
              staged: {
                ...((state.gitDiffUiByTab[normalizedId] ?? createEmptyGitUiState()).staged),
                selectedHunkId: normalizedHunkId,
                actionHunkId: '',
                actionType: '',
                actionError: message,
              },
            },
          },
        }))
        return { ok: false, error: 'unstage_lines_failed', message }
      }
    },

    refreshProjectGitDiffs: async (projectFolder, options = {}) => {
      const normalizedProjectFolder = normalizeEditorProjectFolder(projectFolder)
      if (!normalizedProjectFolder) return []
      const tabs = get().tabs.filter((tab) => {
        if (!tab?.modelUri) return false
        const entry = getModelRegistryEntry(tab.modelUri)
        return normalizeEditorProjectFolder(entry?.projectFolder || '') === normalizedProjectFolder
      })
      const results = []
      for (const tab of tabs) {
        results.push(await get().refreshTabGitDiff(normalizedProjectFolder, tab.id, options))
      }
      return results
    },
  }
}
