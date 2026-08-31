import { create } from 'zustand'
import {
  buildCanonicalFileUri,
  getModelRegistryEntry,
  getModelRegistryModel,
  getModelRegistrySnapshot,
  isModelRegistryDirty,
  normalizeEditorFilePath,
  normalizeEditorProjectFolder,
  readModelRegistryContent,
  clearModelRegistry,
  ensureModelRegistryEntry,
  removeModelRegistryEntry,
  resolveWorkspaceRelativeFilePath,
  setModelRegistryContent,
  setModelRegistryModel,
  setModelRegistrySavedContent,
  syncModelRegistryLanguage,
} from './editor-model-registry.js'
import {
  createEditorGitDiffActions,
  createInitialEditorGitDiffState,
} from './editor-git-diff-store.js'
import { resolveAbsoluteEvidenceFileReference } from '../components/chat/evidence-file-navigation.mjs'
import {
  normalizeEditorLocation,
  sameEditorFilePath,
  serviceStateFingerprint,
  syncEditorServiceDocument,
} from './editor-store-helpers.mjs'

/**
 * useEditorStore - state for the Editor panel.
 *
 * Tabs: array of { id, filePath, label, modelUri, language }
 *   dirty state is derived from the URI-keyed model registry
 *
 * Tree: set of expanded dir paths
 */

let nextTabSequence = 1
function nextTabId() { return `tab_${nextTabSequence++}` }
let treeRequestSequence = 0

function bumpModelRegistryVersion(set) {
  set((state) => ({ modelRegistryVersion: state.modelRegistryVersion + 1 }))
}

function buildTabSnapshot(tab, {
  includeContent = true,
  includeSavedContent = true,
} = {}) {
  if (!tab) return null
  const snapshot = {
    ...tab,
    dirty: typeof tab.dirty === 'boolean'
      ? tab.dirty
      : (tab.modelUri ? isModelRegistryDirty(tab.modelUri) : false),
  }
  if (includeSavedContent) {
    snapshot.savedContent = tab.modelUri ? getTabSavedContentByUri(tab.modelUri) : ''
  }
  if (includeContent) {
    snapshot.content = tab.modelUri ? readModelRegistryContent(tab.modelUri) : ''
  }
  return snapshot
}

function getTabSavedContentByUri(modelUri = '') {
  const entry = getModelRegistryEntry(modelUri)
  return String(entry?.savedContent || '')
}

const useEditorStore = create((set, get) => ({

  // Tabs
  tabs: [], // { id, filePath, label, modelUri, language, fileEncoding, loading, error, dirty, externalChanged, externalChangedAt, externalChangedSource }
  activeTab: null, // id string
  pendingReveal: null, // { filePath, line, column, requestId }
  modelRegistryVersion: 0,
  serviceStateByTab: {},
  ...createInitialEditorGitDiffState(),

  getTabSnapshot: (tabId) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return null
    const tab = get().tabs.find((candidate) => candidate.id === normalizedId)
    return buildTabSnapshot(tab)
  },

  getTabsSnapshot: () => get().tabs.map((tab) => buildTabSnapshot(tab, {
    includeContent: false,
    includeSavedContent: false,
  })),

  getTabServiceState: (tabId) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return null
    return get().serviceStateByTab[normalizedId] ?? null
  },

  ...createEditorGitDiffActions({ set, get }),

  setTabServiceState: (tabId, serviceState) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return
    set((state) => {
      if (serviceStateFingerprint(state.serviceStateByTab[normalizedId]) === serviceStateFingerprint(serviceState)) {
        return state
      }
      return {
      serviceStateByTab: {
        ...state.serviceStateByTab,
        [normalizedId]: serviceState ?? null,
      },
      }
    })
  },

  clearTabServiceState: (tabId) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return
    set((state) => {
      if (!Object.prototype.hasOwnProperty.call(state.serviceStateByTab, normalizedId)) return state
      const nextServiceStateByTab = { ...state.serviceStateByTab }
      delete nextServiceStateByTab[normalizedId]
      return { serviceStateByTab: nextServiceStateByTab }
    })
  },

  getDirtyTabs: () => get().tabs
    .filter((tab) => !tab.loading && !tab.error && tab.modelUri && isModelRegistryDirty(tab.modelUri))
    .map((tab) => buildTabSnapshot(tab))
    .filter(Boolean),

  getTabContent: (tabId) => {
    const tab = get().tabs.find((candidate) => candidate.id === String(tabId || '').trim())
    if (!tab?.modelUri) return ''
    return readModelRegistryContent(tab.modelUri)
  },

  getTabSavedContent: (tabId) => {
    const tab = get().tabs.find((candidate) => candidate.id === String(tabId || '').trim())
    if (!tab?.modelUri) return ''
    return getTabSavedContentByUri(tab.modelUri)
  },

  isTabDirty: (tabId) => {
    const tab = get().tabs.find((candidate) => candidate.id === String(tabId || '').trim())
    if (!tab?.modelUri) return false
    return isModelRegistryDirty(tab.modelUri)
  },

  getTabModel: (tabId) => {
    const tab = get().tabs.find((candidate) => candidate.id === String(tabId || '').trim())
    if (!tab?.modelUri) return null
    return getModelRegistryModel(tab.modelUri)
  },

  attachTabModel: (tabId, model) => {
    const tab = get().tabs.find((candidate) => candidate.id === String(tabId || '').trim())
    if (!tab?.modelUri) return null
    const entry = setModelRegistryModel(tab.modelUri, model)
    if (entry) {
      syncModelRegistryLanguage(tab.modelUri, tab.language)
      bumpModelRegistryVersion(set)
    }
    return entry?.model || null
  },

  attachGitPreviewModel: (payload = {}, model) => {
    const modelUri = String(payload?.modelUri || '').trim()
    if (!modelUri) return null
    ensureModelRegistryEntry({
      projectFolder: payload?.projectFolder || '',
      filePath: payload?.filePath || '',
      uri: modelUri,
      language: payload?.language || 'plaintext',
    })
    const entry = setModelRegistryModel(modelUri, model)
    setModelRegistrySavedContent(modelUri, payload?.previewContent || '')
    setModelRegistryContent(modelUri, payload?.previewContent || '')
    if (entry) {
      syncModelRegistryLanguage(modelUri, payload?.language || 'plaintext')
      bumpModelRegistryVersion(set)
    }
    return entry?.model || null
  },

  syncGitPreviewModelContent: (payload = {}) => {
    const modelUri = String(payload?.modelUri || '').trim()
    if (!modelUri) return
    ensureModelRegistryEntry({
      projectFolder: payload?.projectFolder || '',
      filePath: payload?.filePath || '',
      uri: modelUri,
      language: payload?.language || 'plaintext',
    })
    setModelRegistrySavedContent(modelUri, payload?.previewContent || '')
    setModelRegistryContent(modelUri, payload?.previewContent || '')
  },

  disposeGitPreviewModel: (modelUri = '') => {
    const normalizedUri = String(modelUri || '').trim()
    if (!normalizedUri) return false
    const activeTab = get().tabs.find((tab) => tab.modelUri === normalizedUri)
    if (activeTab) return false
    const removed = removeModelRegistryEntry(normalizedUri)
    if (removed) bumpModelRegistryVersion(set)
    return removed
  },

  openFile: async (projectFolder, filePath, metadata = {}) => {
    const readOnly = metadata?.readOnly === true
    const normalizedProjectFolder = normalizeEditorProjectFolder(projectFolder)
    const normalizedPath = resolveWorkspaceRelativeFilePath(normalizedProjectFolder, filePath)
    const modelUri = buildCanonicalFileUri(normalizedProjectFolder, normalizedPath)
    if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_folder' }
    if (!normalizedPath) return { ok: false, reason: 'missing_file_path' }
    if (!modelUri) return { ok: false, reason: 'invalid_file_uri' }

    const { tabs } = get()
    const existing = tabs.find((tab) => tab.modelUri === modelUri)
    if (existing && !existing.error) {
      set({ activeTab: existing.id })
      return { ok: true, existing: true, tabId: existing.id, modelUri: existing.modelUri }
    }

    const id = existing?.id || nextTabId()
    const label = normalizedPath.split('/').pop()
    const language = detectLanguage(normalizedPath)
    ensureModelRegistryEntry({
      projectFolder: normalizedProjectFolder,
      filePath: normalizedPath,
      uri: modelUri,
      language,
    })

    if (existing) {
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.id !== id ? tab : {
          ...tab,
          filePath: normalizedPath,
          label,
          modelUri,
          language,
          readOnly,
          fileEncoding: tab.fileEncoding || 'utf8',
          loading: true,
          error: null,
          dirty: false,
          externalChanged: false,
          externalChangedAt: 0,
          externalChangedSource: '',
        }),
        activeTab: id,
      }))
    } else {
      set((state) => ({
        tabs: [...state.tabs, {
          id,
          filePath: normalizedPath,
          label,
          modelUri,
          language,
          readOnly,
          fileEncoding: 'utf8',
          loading: true,
          error: null,
          dirty: false,
          externalChanged: false,
          externalChangedAt: 0,
          externalChangedSource: '',
        }],
        activeTab: id,
      }))
    }

    let result
    try {
      result = await window.addom.file.readFile(normalizedProjectFolder, normalizedPath)
    } catch (error) {
      const errorMessage = String(error?.message || 'Failed to read file.')
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.id !== id ? tab : { ...tab, loading: false, error: errorMessage }),
      }))
      return { ok: false, reason: errorMessage, tabId: id, modelUri }
    }

    if (result?.ok) {
      setModelRegistrySavedContent(modelUri, result.content)
      setModelRegistryContent(modelUri, result.content)
      if (!readOnly) {
        syncEditorServiceDocument('open', {
          projectFolder: normalizedProjectFolder,
          filePath: normalizedPath,
          uri: modelUri,
          language,
          content: result.content,
        })
      }
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.id !== id ? tab : {
          ...tab,
          fileEncoding: String(result.encoding || 'utf8'),
          loading: false,
          error: null,
          dirty: false,
          externalChanged: false,
          externalChangedAt: 0,
          externalChangedSource: '',
        }),
      }))
      bumpModelRegistryVersion(set)
      if (!readOnly) void get().refreshTabGitDiff(normalizedProjectFolder, id)
      return { ok: true, tabId: id, modelUri }
    }

    const errorMessage = String(result?.error || 'Failed to read file.')
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id !== id ? tab : { ...tab, loading: false, error: errorMessage }),
    }))
    get().clearTabGitDiff(id)
    return { ok: false, reason: errorMessage, tabId: id, modelUri }
  },

  openFileAtLocation: async (projectFolder, filePath, line, column, metadata = {}) => {
    const normalizedPath = resolveWorkspaceRelativeFilePath(projectFolder, filePath)
    if (!projectFolder) return { ok: false, reason: 'missing_project_folder' }
    if (!normalizedPath) return { ok: false, reason: 'missing_file_path' }

    const location = normalizeEditorLocation(line, column)
    if (!location) {
      return get().openFile(projectFolder, normalizedPath, metadata)
    }

    const requestId = `reveal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    set({
      pendingReveal: {
        filePath: normalizedPath,
        line: location.line,
        column: location.column,
        requestId,
      },
    })

    const openResult = await get().openFile(projectFolder, normalizedPath, {
      ...metadata,
      line: location.line,
      column: location.column,
    })
    if (openResult?.ok === false) {
      const currentPendingReveal = get().pendingReveal
      if (currentPendingReveal?.requestId === requestId) {
        set({ pendingReveal: null })
      }
    }
    return openResult
  },

  openEvidenceFileAtLocation: async (absolutePath, line, column) => {
    const resolved = resolveAbsoluteEvidenceFileReference(absolutePath)
    if (!resolved.ok) return resolved
    return get().openFileAtLocation(
      resolved.directoryPath,
      resolved.filePath,
      line ?? resolved.line,
      column ?? resolved.column,
      { source: 'tool_evidence', readOnly: true },
    )
  },

  consumePendingReveal: (filePath) => {
    const normalizedPath = normalizeEditorFilePath(filePath)
    const pendingReveal = get().pendingReveal
    if (!normalizedPath || !pendingReveal || !sameEditorFilePath(pendingReveal.filePath, normalizedPath)) {
      return null
    }
    set({ pendingReveal: null })
    return pendingReveal
  },

  clearPendingReveal: () => {
    set({ pendingReveal: null })
  },

  closeTab: (id, options = {}) => {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) return
    const closingTab = get().tabs.find((tab) => tab.id === normalizedId)
    if (!closingTab) return
    const forceClose = options?.force === true
    if (!forceClose && closingTab.modelUri && isModelRegistryDirty(closingTab.modelUri)) {
      return {
        ok: false,
        reason: 'dirty_tab',
        tabId: normalizedId,
      }
    }

    syncEditorServiceDocument('close', {
      projectFolder: getModelRegistryEntry(closingTab.modelUri)?.projectFolder || '',
      filePath: closingTab.filePath,
      uri: closingTab.modelUri,
      language: closingTab.language,
    })

    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== normalizedId)
      const activeTab = state.activeTab === normalizedId
        ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null)
        : state.activeTab
      const nextServiceStateByTab = { ...state.serviceStateByTab }
      delete nextServiceStateByTab[normalizedId]
      return { tabs, activeTab, serviceStateByTab: nextServiceStateByTab }
    })

    if (!get().tabs.some((tab) => tab.modelUri === closingTab.modelUri)) {
      removeModelRegistryEntry(closingTab.modelUri)
      bumpModelRegistryVersion(set)
    }
    get().clearTabGitDiff(normalizedId)
    return {
      ok: true,
      tabId: normalizedId,
    }
  },

  setActiveTab: (id) => set({ activeTab: id }),

  moveTab: (tabId, targetIndex) => {
    const normalizedId = String(tabId || '').trim()
    const requestedIndex = Number(targetIndex)
    if (!normalizedId || !Number.isFinite(requestedIndex)) return { ok: false, reason: 'invalid_move' }

    let moved = false
    let finalIndex = -1
    set((state) => {
      const currentIndex = state.tabs.findIndex((tab) => tab.id === normalizedId)
      if (currentIndex < 0) return state
      const clampedIndex = Math.max(0, Math.min(state.tabs.length - 1, Math.round(requestedIndex)))
      finalIndex = clampedIndex
      if (clampedIndex === currentIndex) return state

      const nextTabs = [...state.tabs]
      const [movedTab] = nextTabs.splice(currentIndex, 1)
      nextTabs.splice(clampedIndex, 0, movedTab)
      moved = true
      return { tabs: nextTabs }
    })

    return moved
      ? { ok: true, tabId: normalizedId, index: finalIndex }
      : { ok: false, reason: 'no_change', tabId: normalizedId, index: finalIndex }
  },

  updateContent: (id, content) => {
    const tab = get().tabs.find((candidate) => candidate.id === String(id || '').trim())
    if (!tab?.modelUri || tab.readOnly) return
    const nextContent = String(content ?? '')
    setModelRegistryContent(tab.modelUri, nextContent)
    const nextDirty = nextContent !== getTabSavedContentByUri(tab.modelUri)
    syncEditorServiceDocument('change', {
      projectFolder: getModelRegistryEntry(tab.modelUri)?.projectFolder || '',
      filePath: tab.filePath,
      uri: tab.modelUri,
      language: tab.language,
      content: nextContent,
    })
    if (!!tab.dirty !== nextDirty) {
      set((state) => ({
        tabs: state.tabs.map((candidate) => candidate.id !== tab.id ? candidate : {
          ...candidate,
          dirty: nextDirty,
        }),
      }))
      const projectFolder = getModelRegistryEntry(tab.modelUri)?.projectFolder || ''
      if (projectFolder) {
        void get().refreshTabGitDiff(projectFolder, tab.id)
      }
    }
  },

  saveTab: async (projectFolder, id) => {
    const tab = get().tabs.find((candidate) => candidate.id === String(id || '').trim())
    if (!tab || tab.loading) return { ok: false, error: 'Tab not ready.' }
    if (tab.readOnly) return { ok: false, reason: 'read_only' }
    const content = tab.modelUri ? readModelRegistryContent(tab.modelUri) : ''
    const result = await window.addom.file.saveFile(projectFolder, tab.filePath, content, tab.fileEncoding || 'utf8')
    if (result?.ok && tab.modelUri) {
      setModelRegistrySavedContent(tab.modelUri, content)
      syncEditorServiceDocument('save', {
        projectFolder,
        filePath: tab.filePath,
        uri: tab.modelUri,
        language: tab.language,
        content,
      })
      set((state) => ({
        tabs: state.tabs.map((candidate) => candidate.id !== tab.id ? candidate : {
          ...candidate,
          dirty: false,
          externalChanged: false,
          externalChangedAt: 0,
          externalChangedSource: '',
        }),
      }))
      void get().refreshTabGitDiff(projectFolder, tab.id)
    }
    return result
  },

  saveAllDirtyTabs: async (projectFolder) => {
    const dirtyTabs = get().getDirtyTabs()
    const results = []
    for (const tab of dirtyTabs) {
      let result
      try { result = await get().saveTab(projectFolder, tab.id) }
      catch (error) { result = { ok: false, error: String(error?.message || error || 'Save failed.') } }
      results.push({ tabId: tab.id, filePath: tab.filePath, ...result })
    }
    return results
  },

  discardAllDirtyTabs: () => {
    const dirtyTabs = get().getDirtyTabs()
    if (dirtyTabs.length === 0) return
    for (const tab of dirtyTabs) {
      if (!tab.modelUri) continue
      setModelRegistryContent(tab.modelUri, tab.savedContent)
      set((state) => ({
        tabs: state.tabs.map((candidate) => candidate.id !== tab.id ? candidate : {
          ...candidate,
          dirty: false,
          externalChanged: false,
          externalChangedAt: 0,
          externalChangedSource: '',
        }),
      }))
    }
  },

  clearAllTabs: () => {
    const tabs = get().tabs
    for (const tab of tabs) {
      if (!tab?.modelUri) continue
      syncEditorServiceDocument('close', {
        projectFolder: getModelRegistryEntry(tab.modelUri)?.projectFolder || '',
        filePath: tab.filePath,
        uri: tab.modelUri,
        language: tab.language,
      })
    }
    clearModelRegistry()
    set({
      tabs: [],
      activeTab: null,
      pendingReveal: null,
      modelRegistryVersion: 0,
      serviceStateByTab: {},
      gitDiffByTab: {},
      gitDiffLoadingByTab: {},
      gitDiffErrorByTab: {},
      gitDiffScopeByTab: {},
      gitDiffUiByTab: {},
      gitDiffRequestByTab: {},
    })
  },

  // Reload a tab from disk (e.g. after AI writes the file).
  // By default, dirty tabs are not overwritten unless force=true.
  reloadTab: async (projectFolder, filePath, options = {}) => {
    const normalizedProjectFolder = normalizeEditorProjectFolder(projectFolder)
    const normalizedPath = resolveWorkspaceRelativeFilePath(normalizedProjectFolder, filePath)
    if (!normalizedProjectFolder || !normalizedPath) return { ok: false, skipped: true, reason: 'invalid_file_path' }
    const modelUri = buildCanonicalFileUri(normalizedProjectFolder, normalizedPath)
    const tab = get().tabs.find((candidate) => candidate.modelUri === modelUri)
    if (!tab?.modelUri) return { ok: false, skipped: true, reason: 'tab_not_open' }

    const force = !!options?.force
    const markExternalOnDirty = !!options?.markExternalOnDirty
    const initialContent = readModelRegistryContent(tab.modelUri)
    const initialSavedContent = getTabSavedContentByUri(tab.modelUri)
    const dirty = initialContent !== initialSavedContent

    if (!force && dirty) {
      if (markExternalOnDirty) {
        const changedAt = Number(options?.changedAt || Date.now()) || Date.now()
        const source = String(options?.source || 'watcher').trim().toLowerCase()
        set((state) => ({
          tabs: state.tabs.map((candidate) => candidate.id !== tab.id
            ? candidate
            : {
              ...candidate,
              externalChanged: true,
              externalChangedAt: changedAt,
              externalChangedSource: source || 'watcher',
            }),
        }))
      }
      return { ok: false, skipped: true, reason: 'dirty_tab' }
    }

    const result = await window.addom.file.readFile(normalizedProjectFolder, normalizedPath)
    if (!result?.ok) return result

    const currentTab = get().tabs.find((candidate) => candidate.id === tab.id)
    if (!currentTab?.modelUri) {
      return { ok: false, skipped: true, reason: 'tab_closed' }
    }
    const currentContent = readModelRegistryContent(currentTab.modelUri)
    const currentSavedContent = getTabSavedContentByUri(currentTab.modelUri)
    if (currentContent !== initialContent || currentSavedContent !== initialSavedContent) {
      return { ok: false, skipped: true, reason: 'tab_changed_during_reload' }
    }

    setModelRegistrySavedContent(currentTab.modelUri, result.content)
    setModelRegistryContent(currentTab.modelUri, result.content)
    syncEditorServiceDocument('change', {
      projectFolder: normalizedProjectFolder,
      filePath: normalizedPath,
      uri: currentTab.modelUri,
      language: currentTab.language,
      content: result.content,
    })
    set((state) => ({
      tabs: state.tabs.map((candidate) => candidate.id !== currentTab.id ? candidate : {
        ...candidate,
        fileEncoding: String(result.encoding || currentTab.fileEncoding || 'utf8'),
        error: null,
        dirty: false,
        externalChanged: false,
        externalChangedAt: 0,
        externalChangedSource: '',
      }),
    }))
    void get().refreshTabGitDiff(normalizedProjectFolder, currentTab.id)
    return result
  },

  // Handle watcher-driven file changes: reload clean tabs, flag dirty tabs.
  handleExternalFileChange: async (projectFolder, filePath, payload = {}) => {
    const normalizedProjectFolder = normalizeEditorProjectFolder(projectFolder)
    const normalizedPath = resolveWorkspaceRelativeFilePath(normalizedProjectFolder, filePath)
    if (!normalizedProjectFolder || !normalizedPath) {
      return { handled: false, reloaded: false, reason: 'invalid_input' }
    }

    const modelUri = buildCanonicalFileUri(normalizedProjectFolder, normalizedPath)
    const hasOpenTab = get().tabs.some((tab) => tab.modelUri === modelUri)
    if (!hasOpenTab) return { handled: false, reloaded: false, reason: 'tab_not_open' }

    const changedAt = Number(payload?.changedAt || Date.now()) || Date.now()
    const source = String(payload?.source || payload?.eventType || 'watcher').trim().toLowerCase()
    const reloadResult = await get().reloadTab(normalizedProjectFolder, normalizedPath, {
      force: false,
      markExternalOnDirty: true,
      changedAt,
      source,
    })

    return {
      handled: true,
      reloaded: !!reloadResult?.ok,
      dirty: reloadResult?.reason === 'dirty_tab',
      reason: String(reloadResult?.reason || ''),
    }
  },

  dismissExternalChangeFlag: (tabId) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id !== normalizedId
        ? tab
        : {
          ...tab,
          externalChanged: false,
          externalChangedAt: 0,
          externalChangedSource: '',
        }),
    }))
  },

  getModelRegistrySnapshot: () => getModelRegistrySnapshot(),

  // File tree
  tree: [],
  expandedDirs: new Set(),
  treeLoading: false,
  treeProjectFolder: '',
  treeError: '',

  resetTree: () => {
    treeRequestSequence += 1
    set({
      tree: [],
      treeLoading: false,
      treeProjectFolder: '',
      treeError: '',
    })
  },

  loadTree: async (projectFolder, options = {}) => {
    const project = String(projectFolder || '').trim()
    if (!project) {
      get().resetTree()
      return []
    }
    const throwOnError = options?.throwOnError === true
    const currentProject = String(get().treeProjectFolder || '').trim()
    const isProjectSwitch = currentProject !== project
    const requestId = ++treeRequestSequence
    set({
      ...(isProjectSwitch ? { tree: [] } : {}),
      treeLoading: true,
      treeProjectFolder: project,
      treeError: '',
    })
    try {
      const tree = await window.addom.file.listTree(project)
      if (requestId !== treeRequestSequence) return Array.isArray(tree) ? tree : []
      const nextTree = Array.isArray(tree) ? tree : []
      set({
        tree: nextTree,
        treeLoading: false,
        treeProjectFolder: project,
        treeError: '',
      })
      return nextTree
    } catch (error) {
      if (requestId === treeRequestSequence) {
        set({
          ...(isProjectSwitch ? { tree: [] } : {}),
          treeLoading: false,
          treeProjectFolder: project,
          treeError: String(error?.message || error || 'Failed to load file tree.'),
        })
      }
      if (throwOnError) throw error
      return []
    }
  },

  toggleDir: (dirPath) => {
    set((state) => {
      const next = new Set(state.expandedDirs)
      if (next.has(dirPath)) next.delete(dirPath)
      else next.add(dirPath)
      return { expandedDirs: next }
    })
  },

  expandDir: (dirPath) => {
    set((state) => {
      const next = new Set(state.expandedDirs)
      next.add(dirPath)
      return { expandedDirs: next }
    })
  },
}))

const EXT_LANG = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', pyw: 'python',
  rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', c: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', h: 'cpp', hh: 'cpp', hpp: 'cpp', hxx: 'cpp', cs: 'csharp',
  php: 'php', swift: 'swift', kt: 'kotlin', scala: 'scala',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  json: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini', ini: 'ini', env: 'ini',
  md: 'markdown', mdx: 'markdown', txt: 'plaintext', rst: 'plaintext',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell',
  bat: 'bat', cmd: 'bat',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  xml: 'xml', svg: 'xml',
  dockerfile: 'dockerfile',
  csv: 'plaintext', log: 'plaintext',
}

export function detectLanguage(filePath) {
  const name = filePath.split('/').pop().split('\\').pop()
  const lower = name.toLowerCase()
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile'
  if (lower === 'makefile') return 'plaintext'
  const ext = lower.includes('.') ? lower.split('.').pop() : null
  return (ext && EXT_LANG[ext]) || 'plaintext'
}

export default useEditorStore
