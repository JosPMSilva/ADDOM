import { create } from 'zustand'
import { requestAppConfirm } from './useAppStore.js'

let memoryLoadRequestSequence = 0
let memorySearchRequestSequence = 0
let embedderStatusRequestPromise = null

const DEFAULT_SCOPE_FILTER = 'current_thread'
const MEMORY_SCOPE_FILTERS = new Set(['current_thread', 'project', 'global', 'all'])

function normalizeScopeFilter(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return MEMORY_SCOPE_FILTERS.has(normalized) ? normalized : DEFAULT_SCOPE_FILTER
}

function buildScopeRequestOptions({
  activeScopeFilter = DEFAULT_SCOPE_FILTER,
  threadId = '',
} = {}) {
  const normalizedScopeFilter = normalizeScopeFilter(activeScopeFilter)
  const normalizedThreadId = String(threadId || '').trim()

  if (normalizedScopeFilter === 'current_thread') {
    return {
      scope: 'thread',
      threadId: normalizedThreadId,
      includeGlobal: false,
      includeProject: false,
    }
  }

  if (normalizedScopeFilter === 'project') {
    return {
      scope: 'project',
      threadId: '',
      includeGlobal: false,
      includeProject: true,
    }
  }

  if (normalizedScopeFilter === 'global') {
    return {
      scope: 'global',
      threadId: '',
      includeGlobal: true,
      includeProject: false,
    }
  }

  return {
    scope: '',
    threadId: normalizedThreadId,
    includeGlobal: true,
    includeProject: true,
  }
}

function buildLoadRequestPayload(state, opts = {}) {
  const includeCompressed = opts.includeCompressed ?? state.includeCompressed
  const includeDeletedThreads = opts.includeDeletedThreads ?? state.includeDeletedThreads
  const activeScopeFilter = normalizeScopeFilter(opts.scopeFilter ?? state.activeScopeFilter)
  const threadId = String(opts.threadId ?? state.activeThreadId ?? '').trim()
  return {
    includeCompressed,
    includeDeletedThreads,
    activeScopeFilter,
    ...buildScopeRequestOptions({ activeScopeFilter, threadId }),
  }
}

function buildSearchRequestPayload(state, opts = {}) {
  const activeScopeFilter = normalizeScopeFilter(opts.scopeFilter ?? state.activeScopeFilter)
  const threadId = String(opts.threadId ?? state.activeThreadId ?? '').trim()
  return {
    topK: 20,
    includeCompressed: state.includeCompressed,
    includeDeletedThreads: state.includeDeletedThreads,
    activeScopeFilter,
    ...buildScopeRequestOptions({ activeScopeFilter, threadId }),
  }
}

/**
 * useMemoryStore - renderer-side mirror of SQLite memory nodes.
 */
const useMemoryStore = create((set, get) => ({
  nodes: [],
  loading: false,
  nodesProjectFolder: '',
  activeThreadId: '',
  activeScopeFilter: DEFAULT_SCOPE_FILTER,
  loadError: '',
  includeCompressed: false,
  includeDeletedThreads: false,
  includeGlobal: false,
  lastCompressionEvent: null,

  resetProjectState: () => {
    memoryLoadRequestSequence += 1
    memorySearchRequestSequence += 1
    set({
      nodes: [],
      loading: false,
      nodesProjectFolder: '',
      activeThreadId: '',
      activeScopeFilter: DEFAULT_SCOPE_FILTER,
      loadError: '',
      lastCompressionEvent: null,
      searchQuery: '',
      searchResults: null,
      searching: false,
      editingNode: null,
    })
  },

  setActiveScopeFilter: (value) => {
    const activeScopeFilter = normalizeScopeFilter(value)
    set({ activeScopeFilter })
  },

  setIncludeCompressed: (value) => {
    const includeCompressed = !!value
    set({ includeCompressed, includeDeletedThreads: includeCompressed })
  },

  setIncludeGlobal: (value) => {
    const includeGlobal = !!value
    set({ includeGlobal })
  },

  setCompressionEvent: (event = null) => set({
    lastCompressionEvent: event && typeof event === 'object' ? { ...event } : null,
  }),

  clearCompressionEvent: () => set({ lastCompressionEvent: null }),

  loadNodes: async (project, opts = {}) => {
    if (!project) {
      get().resetProjectState()
      return []
    }
    const state = get()
    const {
      includeCompressed,
      includeDeletedThreads,
      includeGlobal,
      includeProject,
      scope,
      threadId,
      activeScopeFilter,
    } = buildLoadRequestPayload(state, opts)
    const throwOnError = opts.throwOnError === true
    const normalizedProject = String(project || '').trim()
    const currentProject = String(get().nodesProjectFolder || '').trim()
    const isProjectSwitch = currentProject !== normalizedProject
    const requestId = ++memoryLoadRequestSequence
    set({
      ...(isProjectSwitch
        ? {
            nodes: [],
            searchQuery: '',
            searchResults: null,
            editingNode: null,
          }
        : {}),
      loading: true,
      nodesProjectFolder: normalizedProject,
      activeThreadId: threadId,
      activeScopeFilter,
      loadError: '',
    })
    try {
      const nodes = await window.addom.memory.list(project, {
        includeCompressed,
        includeDeletedThreads,
        includeGlobal,
        includeProject,
        scope,
        threadId,
      })
      if (requestId !== memoryLoadRequestSequence) return Array.isArray(nodes) ? nodes : []
      const normalizedNodes = Array.isArray(nodes) ? nodes : []
      set({
        nodes: normalizedNodes,
        loading: false,
        nodesProjectFolder: normalizedProject,
        activeThreadId: threadId,
        activeScopeFilter,
        loadError: '',
      })
      return normalizedNodes
    } catch (error) {
      if (requestId === memoryLoadRequestSequence) {
        set({
          ...(isProjectSwitch ? { nodes: [] } : {}),
          loading: false,
          nodesProjectFolder: normalizedProject,
          activeThreadId: threadId,
          activeScopeFilter,
          loadError: String(error?.message || error || 'Failed to load memory nodes.'),
        })
      }
      if (throwOnError) throw error
      return []
    }
  },

  refreshNodes: (project, opts = {}) => get().loadNodes(project, opts),

  // Search
  searchQuery: '',
  searchResults: null,
  searching: false,

  setSearchQuery: (q) => set({ searchQuery: q }),

  search: async (project, query, opts = {}) => {
    const normalizedQuery = String(query || '').trim()
    if (!normalizedQuery) {
      memorySearchRequestSequence += 1
      set({ searchResults: null, searchQuery: '' })
      return
    }

    const requestId = ++memorySearchRequestSequence
    set({ searching: true, searchQuery: normalizedQuery })
    try {
      const state = get()
      const {
        topK,
        includeCompressed,
        includeDeletedThreads,
        includeGlobal,
        includeProject,
        scope,
        threadId,
      } = buildSearchRequestPayload(state, opts)
      const results = await window.addom.memory.search(project, normalizedQuery, {
        topK,
        includeCompressed,
        includeDeletedThreads,
        includeGlobal,
        includeProject,
        scope,
        threadId,
      })
      if (requestId !== memorySearchRequestSequence) return
      set({
        searchResults: results,
        searching: false,
        activeThreadId: threadId,
      })
    } catch {
      if (requestId !== memorySearchRequestSequence) return
      set({ searching: false })
    }
  },

  clearSearch: () => {
    memorySearchRequestSequence += 1
    set({ searchResults: null, searchQuery: '', searching: false })
  },

  refreshVisibleNodes: async (project, opts = {}) => {
    const normalizedProject = String(project || '').trim()
    if (!normalizedProject) return []
    const state = get()
    const searchQuery = String(state.searchQuery || '').trim()
    const requestOpts = {
      scopeFilter: opts.scopeFilter ?? state.activeScopeFilter,
      threadId: opts.threadId ?? state.activeThreadId,
    }
    if (searchQuery) {
      await get().search(normalizedProject, searchQuery, requestOpts)
      return Array.isArray(get().searchResults) ? get().searchResults : []
    }
    return get().loadNodes(normalizedProject, requestOpts)
  },

  // CRUD
  addNode: async (project, {
    topic,
    content,
    tags = [],
    isGlobal = false,
    scope,
    threadId,
    originThreadId,
  }) => {
    const state = get()
    const normalizedScope = isGlobal === true
      ? 'global'
      : String(scope || '').trim().toLowerCase()
    const nextThreadId = String(threadId ?? state.activeThreadId ?? '').trim()
    const { id } = await window.addom.memory.add({
      project,
      topic,
      content,
      tags,
      isGlobal: !!isGlobal,
      ...(normalizedScope ? { scope: normalizedScope } : {}),
      ...(nextThreadId ? { threadId: nextThreadId } : {}),
      ...(originThreadId ? { originThreadId } : {}),
      source: 'user_memory',
    })
    await get().refreshVisibleNodes(project)
    return id
  },

  updateNode: async (project, id, fields) => {
    await window.addom.memory.update(id, fields)
    await get().refreshVisibleNodes(project)
  },

  deleteNode: async (project, id, force = false) => {
    try {
      await window.addom.memory.delete(id, force)
    } catch (err) {
      if (!force && err.message?.includes('protected')) {
        const ok = await requestAppConfirm({
          title: 'Protected Memory Node',
          message: 'This is a protected node. Delete anyway?',
          confirmLabel: 'Delete Anyway',
          cancelLabel: 'Cancel',
          tone: 'danger',
        })
        if (ok) {
          await window.addom.memory.delete(id, true)
        } else {
          return
        }
      } else {
        throw err
      }
    }
    await get().refreshVisibleNodes(project)
  },

  togglePin: async (project, id, currentPinned) => {
    await window.addom.memory.pin(id, !currentPinned)
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, pinned: !currentPinned } : n)),
      searchResults: Array.isArray(s.searchResults)
        ? s.searchResults.map((n) => (n.id === id ? { ...n, pinned: !currentPinned } : n))
        : s.searchResults,
    }))
  },

  promoteNode: async (project, id, options = {}) => {
    const state = get()
    await window.addom.memory.promote({
      id,
      targetScope: String(options.targetScope || 'project').trim().toLowerCase() || 'project',
      project,
      threadId: String(options.threadId ?? state.activeThreadId ?? '').trim(),
      originThreadId: String(options.originThreadId || '').trim() || undefined,
    })
    await get().refreshVisibleNodes(project)
  },

  keepNodeInThread: async (project, id, options = {}) => {
    const state = get()
    const threadId = String(options.threadId ?? state.activeThreadId ?? '').trim()
    if (!threadId) throw new Error('Active thread is required')
    await window.addom.memory.demote({
      id,
      targetScope: 'thread',
      project,
      threadId,
      originThreadId: String(options.originThreadId || threadId).trim(),
    })
    await get().refreshVisibleNodes(project, { threadId })
  },

  makeNodeGlobal: async (project, id, options = {}) => {
    const state = get()
    await window.addom.memory.promote({
      id,
      targetScope: 'global',
      project,
      threadId: String(options.threadId ?? state.activeThreadId ?? '').trim(),
      originThreadId: String(options.originThreadId || '').trim() || undefined,
    })
    await get().refreshVisibleNodes(project)
  },

  invalidateNode: async (project, id, options = {}) => {
    await window.addom.memory.invalidate({
      id,
      supersededBy: String(options.supersededBy || '').trim() || undefined,
    })
    await get().refreshVisibleNodes(project)
  },

  // Embedder status
  embedderReady: false,
  embedderProgress: 0,
  embedderState: 'idle', // 'idle' | 'downloading' | 'loading' | 'ready' | 'error'

  setEmbedderStatus: ({ state, progress = 0 }) => set({
    embedderState: state,
    embedderProgress: progress,
    embedderReady: state === 'ready',
  }),

  refreshEmbedderStatus: async () => {
    if (embedderStatusRequestPromise) return embedderStatusRequestPromise
    const memoryApi = window?.addom?.memory
    if (!memoryApi || typeof memoryApi.embedderStatus !== 'function') return null
    embedderStatusRequestPromise = memoryApi.embedderStatus()
      .then((status) => {
        if (status?.ready) {
          const readyStatus = { state: 'ready', progress: 100 }
          get().setEmbedderStatus(readyStatus)
          return readyStatus
        }
        const normalizedStatus = status && typeof status === 'object'
          ? {
              state: String(status.state || 'idle').trim() || 'idle',
              progress: Number(status.progress || 0) || 0,
            }
          : { state: 'idle', progress: 0 }
        get().setEmbedderStatus(normalizedStatus)
        return normalizedStatus
      })
      .catch(() => null)
      .finally(() => {
        embedderStatusRequestPromise = null
      })
    return embedderStatusRequestPromise
  },

  // Edit modal
  editingNode: null,
  setEditingNode: (node) => set({ editingNode: node }),
  clearEditingNode: () => set({ editingNode: null }),
}))

export default useMemoryStore
