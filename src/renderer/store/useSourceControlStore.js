import { create } from 'zustand'
import useAppStore from './useAppStore.js'
import useEditorStore from './useEditorStore.js'

function getRendererGitApi() {
  if (typeof window === 'undefined') return null
  const api = window?.addom?.git
  if (!api || typeof api.getRepositoryStatus !== 'function') return null
  return api
}

function normalizeScope(scope = 'unstaged') {
  return String(scope || '').trim().toLowerCase() === 'staged' ? 'staged' : 'unstaged'
}

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function readScopeStatusKind(entry = {}, scope = 'unstaged') {
  return normalizeScope(scope) === 'staged'
    ? String(entry?.stagedKind || '').trim().toLowerCase()
    : String(entry?.unstagedKind || '').trim().toLowerCase()
}

function readScopeLineStats(entry = {}, scope = 'unstaged') {
  const normalizedScope = normalizeScope(scope)
  const addedLines = normalizedScope === 'staged'
    ? Math.max(0, Number(entry?.stagedAddedLines || 0) || 0)
    : Math.max(0, Number(entry?.unstagedAddedLines || 0) || 0)
  const deletedLines = normalizedScope === 'staged'
    ? Math.max(0, Number(entry?.stagedDeletedLines || 0) || 0)
    : Math.max(0, Number(entry?.unstagedDeletedLines || 0) || 0)
  return {
    addedLines,
    deletedLines,
    changedLines: addedLines + deletedLines,
  }
}

function getEntrySortRank(entry = {}, scope = 'unstaged') {
  const scopedKind = readScopeStatusKind(entry, scope)
  if (entry?.isConflicted) return 0
  if (entry?.isDeleted || scopedKind === 'deleted') return 1
  if (entry?.isRenamed || entry?.isCopied) return 2
  if (entry?.isUntracked || scopedKind === 'untracked') return 3
  if (scopedKind === 'added') return 4
  if (scopedKind === 'modified') return 5
  return 6
}

function sortEntries(entries = [], scope = 'unstaged') {
  return [...entries].sort((left, right) => (
    getEntrySortRank(left, scope) - getEntrySortRank(right, scope)
    || readScopeLineStats(right, scope).changedLines - readScopeLineStats(left, scope).changedLines
    || String(left?.projectRelativePath || '').localeCompare(String(right?.projectRelativePath || ''))
  ))
}

function buildDetailKey(projectRelativePath = '', scope = 'unstaged') {
  const pathPart = String(projectRelativePath || '').trim()
  if (!pathPart) return ''
  return `${normalizeScope(scope)}::${pathPart}`
}

function isEntryDetailOnly(entry = {}) {
  return Boolean(
    entry?.isBinary
    || entry?.isSubmodule
    || entry?.isConflicted
    || entry?.isDeleted
    || entry?.isRenamed
    || entry?.isCopied
  )
}

function buildFallbackDetail(entry = {}, scope = 'unstaged', message = '') {
  const projectRelativePath = String(entry?.projectRelativePath || '').trim()
  const previousProjectRelativePath = String(entry?.previousProjectRelativePath || '').trim()
  const detailKind = entry?.isConflicted
    ? 'merge_conflict'
    : entry?.isSubmodule
      ? 'submodule'
      : entry?.isBinary
        ? 'binary_file'
        : entry?.isDeleted
          ? 'deleted_file'
          : 'rename'
  return {
    ok: true,
    scope: normalizeScope(scope),
    status: 'detail',
    detailKind,
    fileStatus: entry,
    projectRelativePath,
    detail: {
      title: describeSourceControlEntry(entry),
      summary: String(message || 'Source Control detail is available for this entry.'),
      projectRelativePath,
      previousProjectRelativePath,
      previewContent: '',
      previewSource: 'none',
      unmergedStages: [],
    },
  }
}

async function runIndexMutation({ set, get, projectFolder, actionKey, method, args = [] }) {
  const normalizedProjectFolder = String(projectFolder || '').trim()
  if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
  const gitApi = getRendererGitApi()
  if (!gitApi || typeof gitApi[method] !== 'function') {
    const message = 'Git staging API unavailable.'
    set({ indexActionPending: '', indexActionError: message })
    return { ok: false, reason: 'git_api_unavailable', message }
  }

  set({ indexActionPending: actionKey, indexActionError: '' })
  try {
    const result = await gitApi[method](normalizedProjectFolder, ...args)
    if (!result?.ok) {
      const message = String(result?.message || result?.error || `git_${method}_failed`)
      set({ indexActionPending: '', indexActionError: message })
      return result
    }
    await Promise.all([
      get().refreshStatus(normalizedProjectFolder),
      useEditorStore.getState().refreshProjectGitDiffs(normalizedProjectFolder),
    ])
    set({ indexActionPending: '', indexActionError: '' })
    return result
  } catch (error) {
    const message = String(error?.message || error || `git_${method}_failed`)
    set({ indexActionPending: '', indexActionError: message })
    return { ok: false, error: `git_${method}_failed`, message }
  }
}

export function groupSourceControlEntries(entries = []) {
  const staged = []
  const unstaged = []
  const conflicted = []
  const untracked = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.isConflicted) {
      conflicted.push(entry)
      continue
    }
    if (entry?.hasStagedChanges) staged.push(entry)
    if (entry?.hasUnstagedChanges) unstaged.push(entry)
    if (entry?.isUntracked) untracked.push(entry)
  }
  return {
    staged: sortEntries(staged, 'staged'),
    unstaged: sortEntries(unstaged, 'unstaged'),
    conflicted: sortEntries(conflicted, 'unstaged'),
    untracked: sortEntries(untracked, 'unstaged'),
  }
}

export function getSourceControlEntryLineStats(entry = {}, scope = 'unstaged') {
  return readScopeLineStats(entry, scope)
}

export function describeSourceControlEntryForScope(entry = {}, scope = 'unstaged') {
  if (entry?.isConflicted) return 'Conflicted'
  if (entry?.isSubmodule) return 'Submodule'
  if (entry?.isBinary) return 'Binary'
  if (entry?.isRenamed) return 'Renamed'
  if (entry?.isCopied) return 'Copied'
  if (entry?.isDeleted) return 'Deleted'
  if (entry?.isUntracked) return 'Untracked'
  const scopedKind = readScopeStatusKind(entry, scope)
  if (scopedKind === 'added') return 'Added'
  if (scopedKind === 'deleted') return 'Deleted'
  if (scopedKind === 'modified') return 'Modified'
  return describeSourceControlEntry(entry)
}

export function describeSourceControlEntry(entry = {}) {
  if (entry?.isConflicted) return 'Conflicted'
  if (entry?.isSubmodule) return 'Submodule'
  if (entry?.isBinary) return 'Binary'
  if (entry?.isRenamed) return 'Renamed'
  if (entry?.isCopied) return 'Copied'
  if (entry?.isDeleted) return 'Deleted'
  if (entry?.isUntracked) return 'Untracked'
  if (entry?.stagedKind === 'added' || entry?.unstagedKind === 'added') return 'Added'
  if (entry?.stagedKind === 'modified' || entry?.unstagedKind === 'modified') return 'Modified'
  return 'Changed'
}

export function resolveSourceControlNavigation(entry = {}, scope = 'unstaged') {
  const normalizedScope = normalizeScope(scope)
  const projectRelativePath = String(entry?.projectRelativePath || '').trim()
  const previousProjectRelativePath = String(entry?.previousProjectRelativePath || '').trim()
  const preferredPath = projectRelativePath || previousProjectRelativePath

  if (!preferredPath) {
    return {
      ok: false,
      reason: 'missing_file_path',
      message: 'Source Control entry does not resolve to a project file path.',
    }
  }

  if (isEntryDetailOnly(entry)) {
    return {
      ok: true,
      mode: 'detail',
      filePath: preferredPath,
      scope: normalizedScope,
    }
  }

  return {
    ok: true,
    filePath: preferredPath,
    scope: normalizedScope,
    mode: 'editor',
  }
}

const EMPTY_TOTALS = Object.freeze({
  staged: 0,
  unstaged: 0,
  conflicted: 0,
  unsupported: 0,
})
const SOURCE_CONTROL_FILTERS = new Set(['all', 'staged', 'unstaged', 'conflicted', 'untracked'])

const useSourceControlStore = create((set, get) => ({
  projectFolder: '',
  status: 'idle',
  repoRoot: '',
  branch: '',
  entries: [],
  totals: { ...EMPTY_TOTALS },
  loading: false,
  error: '',
  selectedKey: '',
  selectedScope: 'unstaged',
  selectionMessage: '',
  selectedDetail: null,
  selectedDetailKey: '',
  detailLoading: false,
  detailError: '',
  detailActionPending: '',
  detailActionError: '',
  indexActionPending: '',
  indexActionError: '',
  commitMessage: '',
  commitPending: false,
  commitError: '',
  lastCommitSummary: '',
  activeFilter: 'all',
  searchValue: '',

  clear: () => set({
    projectFolder: '',
    status: 'idle',
    repoRoot: '',
    branch: '',
    entries: [],
    totals: { ...EMPTY_TOTALS },
    loading: false,
    error: '',
    selectedKey: '',
    selectedScope: 'unstaged',
    selectionMessage: '',
    selectedDetail: null,
    selectedDetailKey: '',
    detailLoading: false,
    detailError: '',
    detailActionPending: '',
    detailActionError: '',
    indexActionPending: '',
    indexActionError: '',
    commitMessage: '',
    commitPending: false,
    commitError: '',
    lastCommitSummary: '',
    activeFilter: 'all',
    searchValue: '',
  }),

  refreshStatus: async (projectFolder) => {
    const normalizedProjectFolder = String(projectFolder || '').trim()
    if (!normalizedProjectFolder) {
      get().clear()
      return { ok: false, reason: 'missing_project_folder' }
    }
    const previousProjectFolder = String(get().projectFolder || '').trim()
    const projectChanged = previousProjectFolder !== normalizedProjectFolder

    const gitApi = getRendererGitApi()
    if (!gitApi) {
      set({
        projectFolder: normalizedProjectFolder,
        status: 'error',
        loading: false,
        error: 'git_api_unavailable',
      })
      return { ok: false, reason: 'git_api_unavailable' }
    }

    set((state) => ({
      projectFolder: normalizedProjectFolder,
      loading: true,
      error: '',
      selectionMessage: state.selectionMessage,
    }))

    try {
      const result = await gitApi.getRepositoryStatus(normalizedProjectFolder)
      if (!result?.ok) {
        set((state) => {
          return {
            projectFolder: normalizedProjectFolder,
            status: 'error',
            repoRoot: '',
            branch: '',
            entries: [],
            totals: { ...EMPTY_TOTALS },
            loading: false,
            error: String(result?.message || result?.error || 'git_repository_status_failed'),
            selectedKey: projectChanged ? '' : state.selectedKey,
            selectedDetail: projectChanged ? null : state.selectedDetail,
            selectedDetailKey: projectChanged ? '' : state.selectedDetailKey,
            detailLoading: projectChanged ? false : state.detailLoading,
            detailError: projectChanged ? '' : state.detailError,
            detailActionPending: projectChanged ? '' : state.detailActionPending,
            detailActionError: projectChanged ? '' : state.detailActionError,
            indexActionPending: projectChanged ? '' : state.indexActionPending,
            indexActionError: projectChanged ? '' : state.indexActionError,
          }
        })
        return result
      }

      set((state) => {
        const entries = Array.isArray(result.entries) ? result.entries : []
        const keepSelectedKey = state.selectedKey && entries.some((entry) => normalizeKey(entry?.key) === state.selectedKey)
        const keepDetail = !projectChanged && state.selectedDetailKey && entries.some((entry) => (
          buildDetailKey(entry?.projectRelativePath || entry?.previousProjectRelativePath || '', state.selectedScope) === state.selectedDetailKey
        ))
        return {
          projectFolder: normalizedProjectFolder,
          status: String(result.status || 'ok'),
          repoRoot: String(result.repoRoot || ''),
          branch: String(result.branch || ''),
          entries,
          totals: result.totals && typeof result.totals === 'object'
            ? result.totals
            : { ...EMPTY_TOTALS },
          loading: false,
          error: '',
          selectedKey: !projectChanged && keepSelectedKey ? state.selectedKey : '',
          selectedDetail: keepDetail ? state.selectedDetail : null,
          selectedDetailKey: keepDetail ? state.selectedDetailKey : '',
          detailLoading: keepDetail ? state.detailLoading : false,
          detailError: keepDetail ? state.detailError : '',
          detailActionPending: keepDetail ? state.detailActionPending : '',
          detailActionError: keepDetail ? state.detailActionError : '',
          indexActionPending: projectChanged ? '' : state.indexActionPending,
          indexActionError: projectChanged ? '' : state.indexActionError,
        }
      })
      return result
    } catch (error) {
      const message = String(error?.message || error || 'git_repository_status_failed')
      set((state) => {
        return {
          projectFolder: normalizedProjectFolder,
          status: 'error',
          repoRoot: '',
          branch: '',
          entries: [],
          totals: { ...EMPTY_TOTALS },
          loading: false,
          error: message,
          selectedKey: projectChanged ? '' : state.selectedKey,
          selectedDetail: projectChanged ? null : state.selectedDetail,
          selectedDetailKey: projectChanged ? '' : state.selectedDetailKey,
          detailLoading: projectChanged ? false : state.detailLoading,
          detailError: projectChanged ? '' : state.detailError,
          detailActionPending: projectChanged ? '' : state.detailActionPending,
          detailActionError: projectChanged ? '' : state.detailActionError,
          indexActionPending: projectChanged ? '' : state.indexActionPending,
          indexActionError: projectChanged ? '' : state.indexActionError,
        }
      })
      return { ok: false, error: 'git_repository_status_failed', message }
    }
  },

  selectEntry: (entryKey, scope = 'unstaged', selectionMessage = '') => {
    set({
      selectedKey: normalizeKey(entryKey),
      selectedScope: normalizeScope(scope),
      selectionMessage: String(selectionMessage || ''),
    })
  },

  setCommitMessage: (value = '') => {
    set({
      commitMessage: String(value || ''),
      commitError: '',
    })
  },

  setActiveFilter: (value = '') => {
    const normalized = String(value || '').trim().toLowerCase()
    set({ activeFilter: SOURCE_CONTROL_FILTERS.has(normalized) ? normalized : 'all' })
  },

  setSearchValue: (value = '') => {
    set({ searchValue: String(value || '') })
  },

  clearSelectedDetail: () => {
    set({
      selectedDetail: null,
      selectedDetailKey: '',
      detailLoading: false,
      detailError: '',
      detailActionPending: '',
      detailActionError: '',
    })
  },

  setEntryStaged: async (projectFolder, entry = {}, staged = true) => {
    if (entry?.isConflicted) {
      return { ok: false, reason: 'merge_conflict', message: 'Resolve the merge conflict before changing its staged state.' }
    }
    const filePath = String(entry?.projectRelativePath || entry?.previousProjectRelativePath || '').trim()
    if (!filePath) return { ok: false, reason: 'missing_file_path' }
    const previousFilePath = String(entry?.previousProjectRelativePath || '').trim()
    const shouldStage = staged === true
    return runIndexMutation({
      set,
      get,
      projectFolder,
      actionKey: `${shouldStage ? 'stage' : 'unstage'}:${normalizeKey(entry?.key) || filePath}`,
      method: shouldStage ? 'stageFile' : 'unstageFile',
      args: [filePath, { previousFilePath }],
    })
  },

  setAllStaged: async (projectFolder, staged = true) => {
    const shouldStage = staged === true
    return runIndexMutation({
      set,
      get,
      projectFolder,
      actionKey: shouldStage ? 'stage-all' : 'unstage-all',
      method: shouldStage ? 'stageAll' : 'unstageAll',
    })
  },

  loadEntryDetail: async (projectFolder, entry, scope = 'unstaged') => {
    const normalizedProjectFolder = String(projectFolder || '').trim()
    const target = resolveSourceControlNavigation(entry, scope)
    if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
    if (!target.ok) return target

    const detailKey = buildDetailKey(target.filePath, target.scope)
    set({
      selectedDetail: null,
      selectedDetailKey: detailKey,
      detailLoading: true,
      detailError: '',
      detailActionPending: '',
      detailActionError: '',
      selectionMessage: '',
    })

    const gitApi = getRendererGitApi()
    if (!gitApi || typeof gitApi.getFileDiff !== 'function') {
      const fallback = buildFallbackDetail(entry, scope, 'Git detail API unavailable.')
      set({
        selectedDetail: fallback,
        selectedDetailKey: detailKey,
        detailLoading: false,
        detailError: 'git_api_unavailable',
      })
      return fallback
    }

    try {
      const result = await gitApi.getFileDiff(normalizedProjectFolder, target.filePath, { scope: target.scope })
      if (result?.ok && result?.status === 'detail') {
        set({
          selectedDetail: result,
          selectedDetailKey: detailKey,
          detailLoading: false,
          detailError: '',
        })
        return result
      }

      const fallbackMessage = String(result?.message || result?.error || 'SCM detail preview is unavailable for this entry.')
      const fallback = buildFallbackDetail(entry, scope, fallbackMessage)
      set({
        selectedDetail: fallback,
        selectedDetailKey: detailKey,
        detailLoading: false,
        detailError: result?.ok ? '' : fallbackMessage,
      })
      return fallback
    } catch (error) {
      const message = String(error?.message || error || 'source_control_detail_failed')
      const fallback = buildFallbackDetail(entry, scope, message)
      set({
        selectedDetail: fallback,
        selectedDetailKey: detailKey,
        detailLoading: false,
        detailError: message,
      })
      return fallback
    }
  },

  restoreSelectedDetailFile: async (projectFolder) => {
    const normalizedProjectFolder = String(projectFolder || '').trim()
    const detail = get().selectedDetail?.detail
    const filePath = String(detail?.projectRelativePath || '').trim()
    if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
    if (!filePath || detail?.canRestore !== true) {
      return { ok: false, reason: 'restore_file_not_available', message: 'Restore file is not available for this Source Control detail.' }
    }

    const gitApi = getRendererGitApi()
    if (!gitApi || typeof gitApi.restoreFile !== 'function') {
      set({ detailActionError: 'Restore file API unavailable.' })
      return { ok: false, reason: 'git_api_unavailable', message: 'Restore file API unavailable.' }
    }

    set({ detailActionPending: 'restore_file', detailActionError: '' })
    try {
      const result = await gitApi.restoreFile(normalizedProjectFolder, filePath)
      if (!result?.ok) {
        const message = String(result?.message || result?.error || 'git_restore_file_failed')
        set({ detailActionPending: '', detailActionError: message })
        return result
      }

      await Promise.all([
        get().refreshStatus(normalizedProjectFolder),
        useEditorStore.getState().refreshProjectGitDiffs(normalizedProjectFolder),
      ])
      set({
        selectedDetail: null,
        selectedDetailKey: '',
        detailActionPending: '',
        detailActionError: '',
      })
      return result
    } catch (error) {
      const message = String(error?.message || error || 'git_restore_file_failed')
      set({ detailActionPending: '', detailActionError: message })
      return { ok: false, error: 'git_restore_file_failed', message }
    }
  },

  unstageSelectedDetailFile: async (projectFolder) => {
    const normalizedProjectFolder = String(projectFolder || '').trim()
    const detail = get().selectedDetail?.detail
    const filePath = String(detail?.projectRelativePath || '').trim()
    const previousFilePath = String(detail?.previousProjectRelativePath || '').trim()
    if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
    if (!filePath || detail?.canUnstage !== true) {
      return { ok: false, reason: 'unstage_file_not_available', message: 'Unstage file is not available for this Source Control detail.' }
    }

    const gitApi = getRendererGitApi()
    if (!gitApi || typeof gitApi.unstageFile !== 'function') {
      set({ detailActionError: 'Unstage file API unavailable.' })
      return { ok: false, reason: 'git_api_unavailable', message: 'Unstage file API unavailable.' }
    }

    set({ detailActionPending: 'unstage_file', detailActionError: '' })
    try {
      const result = await gitApi.unstageFile(normalizedProjectFolder, filePath, { previousFilePath })
      if (!result?.ok) {
        const message = String(result?.message || result?.error || 'git_unstage_file_failed')
        set({ detailActionPending: '', detailActionError: message })
        return result
      }

      await Promise.all([
        get().refreshStatus(normalizedProjectFolder),
        useEditorStore.getState().refreshProjectGitDiffs(normalizedProjectFolder),
      ])
      set({
        selectedDetail: null,
        selectedDetailKey: '',
        detailActionPending: '',
        detailActionError: '',
      })
      return result
    } catch (error) {
      const message = String(error?.message || error || 'git_unstage_file_failed')
      set({ detailActionPending: '', detailActionError: message })
      return { ok: false, error: 'git_unstage_file_failed', message }
    }
  },

  navigateEntry: async (projectFolder, entry, scope = 'unstaged') => {
    const normalizedProjectFolder = String(projectFolder || '').trim()
    const target = resolveSourceControlNavigation(entry, scope)
    get().selectEntry(entry?.key, scope, target?.message || '')
    if (!target.ok) return target

    if (target.mode === 'detail') {
      const detailResult = await get().loadEntryDetail(normalizedProjectFolder, entry, scope)
      return {
        ok: detailResult?.ok === true,
        mode: 'detail',
        detailKind: String(detailResult?.detailKind || ''),
      }
    }

    const openResult = await useEditorStore.getState().openFile(normalizedProjectFolder, target.filePath, {
      source: 'changes_panel',
      scope: target.scope,
    })
    if (!openResult?.ok) {
      return {
        ok: false,
        reason: String(openResult?.reason || 'open_file_failed'),
        message: String(openResult?.reason || 'Failed to open the selected Source Control entry.'),
      }
    }

    useEditorStore.getState().setTabGitScope(openResult.tabId, target.scope)
    get().clearSelectedDetail()
    useAppStore.getState().setActivePanel('editor')
    get().selectEntry(entry?.key, scope, '')
    return {
      ok: true,
      tabId: openResult.tabId,
      scope: target.scope,
      mode: target.mode,
    }
  },

  commitStaged: async (projectFolder) => {
    const normalizedProjectFolder = String(projectFolder || '').trim()
    const message = String(get().commitMessage || '').trim()
    if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
    if (!message) {
      set({ commitError: 'Commit message is required.' })
      return { ok: false, reason: 'missing_commit_message', message: 'Commit message is required.' }
    }

    const gitApi = getRendererGitApi()
    if (!gitApi || typeof gitApi.commitStaged !== 'function') {
      set({ commitError: 'Commit API unavailable.' })
      return { ok: false, reason: 'git_api_unavailable', message: 'Commit API unavailable.' }
    }

    set({
      commitPending: true,
      commitError: '',
      lastCommitSummary: '',
    })

    try {
      const result = await gitApi.commitStaged(normalizedProjectFolder, message)
      if (!result?.ok) {
        const errorMessage = String(result?.message || result?.error || 'git_commit_staged_failed')
        set({
          commitPending: false,
          commitError: errorMessage,
        })
        return result
      }

      await Promise.all([
        get().refreshStatus(normalizedProjectFolder),
        useEditorStore.getState().refreshProjectGitDiffs(normalizedProjectFolder),
      ])

      set({
        commitPending: false,
        commitMessage: '',
        commitError: '',
        lastCommitSummary: String(result?.summary || ''),
      })
      return result
    } catch (error) {
      const messageText = String(error?.message || error || 'git_commit_staged_failed')
      set({
        commitPending: false,
        commitError: messageText,
      })
      return { ok: false, error: 'git_commit_staged_failed', message: messageText }
    }
  },
}))

export default useSourceControlStore
