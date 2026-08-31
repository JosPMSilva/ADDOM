import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import useAppStore from './useAppStore.js'
import useChatStore from './useChatStore.js'
import useTerminalStore from './useTerminalStore.js'
import { clearDeletedThreadRendererState } from './workspace-thread-renderer-state.mjs'
import { captureChatRouteState } from './chat/thread-session-store-utils.mjs'
import { MAX_TIMELINE_ITEMS } from './chat/activity-builders.mjs'
import {
  normalizeProjectArchiveOverrides,
  normalizeProjectRestorePriorities,
  pruneProjectArchiveOverrides,
  pruneProjectRestorePriorities,
} from '../components/workspace-project-entry-state.mjs'
import { createWorkspaceProjectLifecycleActions } from './workspace-project-lifecycle-actions.js'
import {
  clampWorkspaceRailWidth,
  WORKSPACE_RAIL_DEFAULT_WIDTH,
} from '../components/workspace/workspace-rail-state.mjs'
import {
  captureWorkspaceTargetRoute,
  resolveWorkspaceTargetIntent,
} from './workspace-target-activation.mjs'

const WORKSPACE_STORAGE_KEY = 'addom-workspace-ui-v1'
const EMPTY_TIMELINE_REQUEST_KEY = '__empty__'
const TIMELINE_PAGE_SIZE = 1000
const MAX_TIMELINE_PAGE_LOADS = 50

let timelineRequestSequence = 0
let timelineRequestsInFlight = 0
const latestTimelineRequestByThread = new Map()
let workspaceSelectionRequestSequence = 0
let projectsLoadPromise = null

function normalizeId(value) {
  const id = String(value ?? '').trim()
  return id || null
}

function normalizeWorkspaceViewMode(value) {
  const mode = String(value ?? '').trim().toLowerCase()
  if (mode === 'workspace') return mode
  return 'project-entry'
}

function normalizeThreadTerminalNavigationOptions(options = {}) {
  const source = options && typeof options === 'object' ? options : {}
  const terminal = source.terminal && typeof source.terminal === 'object' ? source.terminal : {}
  const focusMode = String(terminal.focusMode || '').trim().toLowerCase()
  return {
    terminal: {
      selectedTabId: String(terminal.selectedTabId || '').trim(),
      activeSessionId: String(terminal.activeSessionId || '').trim(),
      archivedSessionId: String(terminal.archivedSessionId || '').trim(),
      browserOpen: terminal.browserOpen === true,
      browserSection: String(terminal.browserSection || '').trim(),
      browserSelectionSessionId: String(terminal.browserSelectionSessionId || '').trim(),
      focusMode: focusMode === 'compact' || focusMode === 'browser' ? focusMode : '',
    },
  }
}

function beginTimelineRequest(threadId) {
  const key = normalizeId(threadId) || EMPTY_TIMELINE_REQUEST_KEY
  const token = ++timelineRequestSequence
  latestTimelineRequestByThread.set(key, token)
  timelineRequestsInFlight += 1
  return { key, token }
}

function isCurrentTimelineRequest(request) {
  return latestTimelineRequestByThread.get(request?.key) === request?.token
}

function finishTimelineRequest() {
  timelineRequestsInFlight = Math.max(0, timelineRequestsInFlight - 1)
  return timelineRequestsInFlight > 0
}

function beginWorkspaceSelectionRequest() {
  workspaceSelectionRequestSequence += 1
  return workspaceSelectionRequestSequence
}

async function loadWholeTimeline(threadId, request = null) {
  const tid = normalizeId(threadId)
  if (!tid) return []
  const workspaceApi = window?.addom?.workspace
  if (!workspaceApi || typeof workspaceApi.listTimeline !== 'function') return []

  let allEvents = []
  let afterEventId = 0
  for (let pageIndex = 0; pageIndex < MAX_TIMELINE_PAGE_LOADS; pageIndex += 1) {
    if (request && !isCurrentTimelineRequest(request)) return allEvents
    const page = await workspaceApi.listTimeline(tid, {
      limit: TIMELINE_PAGE_SIZE,
      ...(afterEventId > 0 ? { afterEventId } : {}),
    })
    const safePage = Array.isArray(page) ? page : []
    if (safePage.length === 0) break
    allEvents = [...allEvents, ...safePage]
    if (allEvents.length > MAX_TIMELINE_ITEMS) {
      allEvents = allEvents.slice(allEvents.length - MAX_TIMELINE_ITEMS)
    }
    const lastEventId = Number(safePage[safePage.length - 1]?.eventId || 0)
    if (safePage.length < TIMELINE_PAGE_SIZE || lastEventId <= afterEventId) break
    afterEventId = lastEventId
  }
  return allEvents
}

function isCurrentWorkspaceSelectionRequest(token) {
  return token === workspaceSelectionRequestSequence
}

function applyThreadSessionSelection(thread) {
  const source = thread && typeof thread === 'object' ? thread : {}
  const threadId = normalizeId(source.id)
  const provider = String(source.lastProvider || '').trim()
  const model = String(source.lastModel || '').trim()
  if (!provider && !model) return
  const chat = useChatStore.getState()
  const options = threadId ? { threadId } : undefined
  if (provider) chat.setSelectedProvider(provider, options)
  if (model) chat.setSelectedModel(model, options)
  chat.dismissProviderSwitchHint?.(options)
}

function resolveProjectActivationThreadId(activeThread, projectInfo, threads = []) {
  const explicitThreadId = normalizeId(activeThread?.id)
  if (explicitThreadId) return explicitThreadId
  const projectThreadId = normalizeId(projectInfo?.activeThreadId)
  if (projectThreadId && threads.some((thread) => normalizeId(thread?.id) === projectThreadId)) {
    return projectThreadId
  }
  return normalizeId(threads[0]?.id)
}

const useWorkspaceStore = create(persist((set, get) => ({
  projects: [],
  projectEntryArchivedAtById: {},
  projectEntryRestoredAtById: {},
  threads: [],
  loadingProjects: true,
  loadingThreads: false,
  loadingTimeline: false,
  initialized: false,
  error: '',

  activeProjectId: null,
  activeThreadId: null,
  preferredProjectId: null,
  restoreWorkspaceViewMode: 'project-entry',
  workspaceRailOpen: true,
  workspaceRailWidth: WORKSPACE_RAIL_DEFAULT_WIDTH,

  setPreferredProjectId: (projectId) => set({ preferredProjectId: normalizeId(projectId) }),
  setWorkspaceRailOpen: (open) => set({ workspaceRailOpen: open === true }),
  toggleWorkspaceRail: () => set((state) => ({ workspaceRailOpen: !state.workspaceRailOpen })),
  setWorkspaceRailWidth: (width) => set({
    workspaceRailWidth: clampWorkspaceRailWidth(width),
  }),

  ...createWorkspaceProjectLifecycleActions({ get, set }),

  applyProjectActivation: async (projectInfo, activeThread = null, { selectionToken = null } = {}) => {
    const normalizedProject = projectInfo && typeof projectInfo === 'object' ? projectInfo : null
    const projectId = normalizeId(normalizedProject?.id)
    if (!projectId) return null
    if (selectionToken !== null && !isCurrentWorkspaceSelectionRequest(selectionToken)) {
      return { project: normalizedProject, activeThread }
    }

    set({
      activeProjectId: projectId,
      activeThreadId: normalizeId(activeThread?.id) || normalizeId(normalizedProject?.activeThreadId),
      preferredProjectId: projectId,
      restoreWorkspaceViewMode: 'workspace',
      error: '',
    })

    const app = useAppStore.getState()
    app.setProjectFolder(normalizedProject?.path || null)
    app.setActiveProjectId(projectId)
    app.setActiveThreadId(normalizeId(activeThread?.id) || normalizeId(normalizedProject?.activeThreadId))
    app.setWorkspaceViewMode('workspace')
    applyThreadSessionSelection(activeThread)

    const provisionalThreadId = normalizeId(activeThread?.id) || normalizeId(normalizedProject?.activeThreadId)
    const provisionalTimelineLoad = provisionalThreadId
      ? get().loadTimeline(provisionalThreadId)
      : Promise.resolve([])

    await get().loadProjects()
    if (selectionToken !== null && !isCurrentWorkspaceSelectionRequest(selectionToken)) {
      return { project: normalizedProject, activeThread }
    }

    const threads = await get().loadThreads(projectId)
    if (selectionToken !== null && !isCurrentWorkspaceSelectionRequest(selectionToken)) {
      return { project: normalizedProject, activeThread }
    }

    const resolvedThreadId = resolveProjectActivationThreadId(activeThread, normalizedProject, threads)
    if (resolvedThreadId !== normalizeId(get().activeThreadId)) {
      set({ activeThreadId: resolvedThreadId })
      app.setActiveThreadId(resolvedThreadId)
    }
    if (!normalizeId(activeThread?.id) && resolvedThreadId) {
      const resolvedThread = threads.find((thread) => normalizeId(thread?.id) === resolvedThreadId) || null
      applyThreadSessionSelection(resolvedThread)
    }
    if (resolvedThreadId === provisionalThreadId) {
      await provisionalTimelineLoad
    } else {
      await get().loadTimeline(resolvedThreadId)
    }
    return {
      project: normalizedProject,
      activeThread: activeThread && typeof activeThread === 'object'
        ? activeThread
        : (threads.find((thread) => normalizeId(thread?.id) === resolvedThreadId) || null),
    }
  },

  loadProjects: async (options = {}) => {
    const quiet = options?.quiet === true
    if (projectsLoadPromise) return projectsLoadPromise
    if (!quiet) set({ loadingProjects: true, error: '' })
    projectsLoadPromise = Promise.resolve()
      .then(async () => {
        const rows = await window.addom.workspace.listProjects()
        const safeRows = Array.isArray(rows) ? rows : []
        set((state) => ({
          projects: safeRows,
          loadingProjects: false,
          projectEntryRestoredAtById: pruneProjectRestorePriorities(
            safeRows,
            state.projectEntryRestoredAtById,
          ),
          projectEntryArchivedAtById: pruneProjectArchiveOverrides(
            safeRows,
            state.projectEntryArchivedAtById,
          ),
        }))
        return safeRows
      })
      .catch((err) => {
        set({ loadingProjects: false, error: String(err?.message ?? 'Failed to load projects.') })
        return []
      })
      .finally(() => {
        projectsLoadPromise = null
      })
    return projectsLoadPromise
  },

  loadThreads: async (projectId) => {
    const pid = normalizeId(projectId)
    if (!pid) {
      set({ threads: [] })
      return []
    }
    set({ loadingThreads: true, error: '' })
    try {
      const rows = await window.addom.workspace.listThreads(pid)
      set({ threads: Array.isArray(rows) ? rows : [], loadingThreads: false })
      return Array.isArray(rows) ? rows : []
    } catch (err) {
      set({ loadingThreads: false, error: String(err?.message ?? 'Failed to load threads.') })
      return []
    }
  },

  loadTimeline: async (threadId) => {
    const tid = normalizeId(threadId)
    const chat = useChatStore.getState()
    chat.setActiveThread(tid)
    if (!tid) {
      chat.hydrateFromTimeline([], { threadId: tid })
      return []
    }

    const request = beginTimelineRequest(tid)
    set({ loadingTimeline: true, error: '' })
    try {
      const events = await loadWholeTimeline(tid, request)
      const safeEvents = Array.isArray(events) ? events : []
      let finalEvents = safeEvents
      if (!isCurrentTimelineRequest(request)) return finalEvents

      const preserveLiveThreadSession = chat.hasLiveThreadSession?.(tid) === true
      if (safeEvents.length > 0) {
        if (!preserveLiveThreadSession) {
          chat.hydrateFromTimeline(safeEvents, { threadId: tid })
        }
      } else if (!preserveLiveThreadSession) {
        chat.hydrateFromTimeline([], { threadId: tid })
      }
      return finalEvents
    } catch (err) {
      if (isCurrentTimelineRequest(request)) {
        set({ error: String(err?.message ?? 'Failed to load transcript timeline.') })
      }
      if (isCurrentTimelineRequest(request) && chat.hasLiveThreadSession?.(tid) !== true) {
        chat.hydrateFromTimeline([], { threadId: tid })
      }
      return []
    } finally {
      const loadingTimeline = finishTimelineRequest()
      if (isCurrentTimelineRequest(request)) {
        set({ loadingTimeline })
      } else {
        set((state) => (state.loadingTimeline === loadingTimeline ? {} : { loadingTimeline }))
      }
    }
  },
  openProjectPath: async (projectPath) => {
    const project = String(projectPath ?? '').trim()
    if (!project) return null
    const selectionToken = beginWorkspaceSelectionRequest()
    try {
      const opened = await window.addom.workspace.openProject(project, { notifyRenderer: false })
      const projectInfo = opened?.project || null
      const activeThread = opened?.activeThread || null
      if (!projectInfo?.id) return null
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return null
      await get().applyProjectActivation(projectInfo, activeThread, { selectionToken })
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return null
      return opened
    } catch (err) {
      if (isCurrentWorkspaceSelectionRequest(selectionToken)) {
        set({ error: String(err?.message ?? 'Failed to open project.') })
      }
      return null
    }
  },

  openProjectById: async (projectId) => {
    const pid = normalizeId(projectId)
    if (!pid) return null
    const selectionToken = beginWorkspaceSelectionRequest()
    try {
      const opened = await window.addom.workspace.setActiveProject(pid, { notifyRenderer: false })
      const projectInfo = opened?.project || null
      const activeThread = opened?.activeThread || null
      if (!projectInfo?.id) return null
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return null
      await get().applyProjectActivation(projectInfo, activeThread, { selectionToken })
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return null
      return opened
    } catch (err) {
      if (isCurrentWorkspaceSelectionRequest(selectionToken)) {
        set({ error: String(err?.message ?? 'Failed to activate project.') })
      }
      return null
    }
  },

  syncExternalProjectActivation: async (payload = {}) => {
    const source = payload && typeof payload === 'object' ? payload : {}
    const projectInfo = source.project && typeof source.project === 'object' ? source.project : null
    const activeThread = source.activeThread && typeof source.activeThread === 'object' ? source.activeThread : null
    if (String(source.action || '').trim() === 'clear-active-project') return get().leaveToProjectEntry()
    if (!projectInfo?.id) return null
    const selectionToken = beginWorkspaceSelectionRequest()
    try {
      return await get().applyProjectActivation(projectInfo, activeThread, { selectionToken })
    } catch (err) {
      if (isCurrentWorkspaceSelectionRequest(selectionToken)) {
        set({ error: String(err?.message ?? 'Failed to synchronize workspace selection.') })
      }
      return null
    }
  },

  createThread: async (title = 'New Thread') => {
    const { activeProjectId } = get()
    if (!activeProjectId) return null
    const selectionToken = beginWorkspaceSelectionRequest()
    try {
      const created = await window.addom.workspace.createThread(activeProjectId, title, { notifyRenderer: false })
      const thread = created?.thread || null
      if (!thread?.id) return null
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return thread

      set({ activeThreadId: thread.id })
      useAppStore.getState().setActiveThreadId(thread.id)
      applyThreadSessionSelection(thread)
      await get().loadProjects({ quiet: true })
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return thread
      await get().loadThreads(activeProjectId)
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return thread
      await get().loadTimeline(thread.id)
      return thread
    } catch (err) {
      if (isCurrentWorkspaceSelectionRequest(selectionToken)) {
        set({ error: String(err?.message ?? 'Failed to create thread.') })
      }
      return null
    }
  },

  autoTitleThread: async ({ projectId, threadId, prompt } = {}) => {
    const [pid, tid] = [normalizeId(projectId), normalizeId(threadId)]
    const text = String(prompt ?? '').trim()
    if (!pid || !tid || !text) return null
    try {
      const result = await window.addom.workspace.autoTitleThread(pid, tid, text)
      const thread = result?.thread || null
      if (!result?.updated || !thread || normalizeId(get().activeProjectId) !== pid) return thread
      set((state) => ({
        threads: state.threads.map((row) => (
          normalizeId(row?.id) === tid ? { ...row, ...thread } : row
        )),
      }))
      return thread
    } catch {
      return null
    }
  },

  setActiveThread: async (threadId) => {
    const tid = normalizeId(threadId)
    const { activeProjectId } = get()
    if (!activeProjectId || !tid) return null
    const selectionToken = beginWorkspaceSelectionRequest()
    try {
      const result = await window.addom.workspace.setActiveThread(activeProjectId, tid, { notifyRenderer: false })
      const thread = result?.thread || null
      if (!thread?.id) return null
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return thread

      set({ activeThreadId: thread.id })
      useAppStore.getState().setActiveThreadId(thread.id)
      applyThreadSessionSelection(thread)
      // Same-project selection must not flip loadingProjects — the rail treats that as a
      // full-tree skeleton refresh. Quiet refresh still updates project metadata.
      await get().loadProjects({ quiet: true })
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return thread
      await get().loadThreads(activeProjectId)
      if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return thread
      await get().loadTimeline(thread.id)
      return thread
    } catch (err) {
      if (isCurrentWorkspaceSelectionRequest(selectionToken)) {
        set({ error: String(err?.message ?? 'Failed to switch thread.') })
      }
      return null
    }
  },

  activateWorkspaceTarget: async ({ projectId, threadId = '', createThread = false } = {}) => {
    const intent = resolveWorkspaceTargetIntent({
      activeProjectId: get().activeProjectId,
      projectId,
      threadId,
      createThread,
    })
    if (!intent) return null

    const sourceRoute = captureWorkspaceTargetRoute(get(), useAppStore.getState())
    const sourceChatRoute = captureChatRouteState(useChatStore.getState())
    let project = get().projects.find((row) => normalizeId(row?.id) === intent.projectId) || null
    let thread = null
    let activatedDestination = false
    if (intent.kind === 'project_thread') {
      const opened = await get().openProjectById(intent.projectId)
      if (!opened?.project) return null
      activatedDestination = true
      project = opened.project
      thread = opened.activeThread || null
    }

    if (intent.createThread) {
      thread = await get().createThread()
    } else if (intent.threadId) {
      thread = await get().setActiveThread(intent.threadId)
    }

    if (!thread && activatedDestination) {
      const activationError = get().error || (intent.createThread
        ? 'Failed to create thread.'
        : 'Failed to switch thread.')
      const sourceProjectId = normalizeId(sourceRoute.workspace.activeProjectId)
      const sourceThreadId = normalizeId(sourceRoute.workspace.activeThreadId)
      try {
        if (sourceProjectId) {
          await window.addom.workspace.setActiveProject(sourceProjectId, { notifyRenderer: false })
          if (sourceThreadId) {
            await window.addom.workspace.setActiveThread(sourceProjectId, sourceThreadId, { notifyRenderer: false })
          }
        } else {
          await window.addom.workspace.clearActiveProject({ notifyRenderer: false })
        }
      } catch {
        // Preserve the original target activation error and restore renderer selection below.
      }
      set({ ...sourceRoute.workspace, error: activationError })
      useAppStore.setState(sourceRoute.app)
      useChatStore.getState().restoreChatRoute(sourceChatRoute)
      return null
    }

    return project && thread
      ? { project, thread, created: intent.createThread }
      : null
  },

  openThreadInChat: async (threadId, options = {}) => {
    const thread = await get().setActiveThread(threadId)
    if (thread?.id) {
      useAppStore.getState().setActivePanel('chat')
      const normalizedOptions = normalizeThreadTerminalNavigationOptions(options)
      const terminalOptions = normalizedOptions.terminal
      if (
        terminalOptions.selectedTabId
        || terminalOptions.browserOpen
        || terminalOptions.browserSection
        || terminalOptions.browserSelectionSessionId
      ) {
        useChatStore.getState().setTerminalDockState?.({
          collapsed: false,
          ...(terminalOptions.selectedTabId ? { selectedTabId: terminalOptions.selectedTabId } : {}),
          ...(terminalOptions.browserOpen ? { browserOpen: true } : {}),
          ...(terminalOptions.browserSection ? { browserSection: terminalOptions.browserSection } : {}),
          ...(terminalOptions.browserSelectionSessionId
            ? { browserSelectionSessionId: terminalOptions.browserSelectionSessionId }
            : {}),
        }, { threadId: thread.id })
      }
      if (terminalOptions.activeSessionId) {
        useTerminalStore.getState().setActiveSessionId?.(terminalOptions.activeSessionId)
      }
      if (terminalOptions.archivedSessionId) {
        await useTerminalStore.getState().selectArchivedSession?.(terminalOptions.archivedSessionId)
      }
      if (terminalOptions.focusMode === 'compact') {
        await useTerminalStore.getState().focusChatDock?.({ threadId: thread.id })
      } else if (terminalOptions.focusMode === 'browser') {
        useTerminalStore.getState().requestViewportFocus?.('chat_terminal_expanded')
      }
    }
    return thread
  },

  renameThread: async ({ projectId, threadId, title, reportError = true, throwOnError = false } = {}) => {
    const [pid, tid] = [normalizeId(projectId), normalizeId(threadId)]
    const cleanTitle = String(title ?? '').trim()
    if (!pid || !tid || !cleanTitle) return null
    try {
      const result = await window.addom.workspace.renameThread(pid, tid, cleanTitle)
      const thread = result?.thread || null
      if (!thread) return null
      if (normalizeId(get().activeProjectId) === pid) {
        set((state) => ({
          threads: state.threads.map((row) => (
            normalizeId(row?.id) === tid ? { ...row, ...thread } : row
          )),
        }))
      }
      return thread
    } catch (err) { const error = err instanceof Error ? err : new Error(String(err || 'Failed to rename thread.')); if (reportError) set({ error: error.message }); if (throwOnError) throw error; return null }
  },
  renameCurrentThread: async (title) => {
    const { activeProjectId: pid, activeThreadId: tid } = get()
    const thread = await get().renameThread({ projectId: pid, threadId: tid, title })
    if (!thread) return null
    await get().loadProjects()
    if (normalizeId(get().activeProjectId) === pid) await get().loadThreads(pid)
    return thread
  },

  exportCurrentThread: async (options = {}) => {
    const tid = normalizeId(get().activeThreadId)
    if (!tid) throw new Error('No active thread selected.')
    return window.addom.workspace.exportThread(tid, options || {})
  },

  importThreadPayload: async (payload = {}) => {
    const pid = normalizeId(get().activeProjectId)
    if (!pid) throw new Error('No active project selected.')
    const selectionToken = beginWorkspaceSelectionRequest()
    const result = await window.addom.workspace.importThread(pid, payload || {})
    const threadId = normalizeId(result?.thread?.id)
    if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return result
    if (threadId) {
      set({ activeThreadId: threadId })
      useAppStore.getState().setActiveThreadId(threadId)
      applyThreadSessionSelection(result?.thread || null)
    }
    await get().loadProjects()
    if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return result
    await get().loadThreads(pid)
    if (!isCurrentWorkspaceSelectionRequest(selectionToken)) return result
    await get().loadTimeline(threadId)
    return result
  },

  deleteThread: async ({ projectId, threadId, stopActive = false, reportError = true, throwOnError = false } = {}) => {
    const [pid, tid] = [normalizeId(projectId), normalizeId(threadId)]
    if (!pid || !tid) return { ok: false }
    let result
    try {
      result = await window.addom.workspace.deleteThread(tid, { stopActive })
    } catch (err) { const error = err instanceof Error ? err : new Error(String(err || 'Failed to delete thread.')); if (reportError) set({ error: error.message }); if (throwOnError) throw error; return { ok: false } }
    if (!result?.ok) { const error = new Error(String(result?.error || 'Failed to delete thread.')); if (reportError) set({ error: error.message }); if (throwOnError) throw error; return result || { ok: false } }
    const resultProjectId = normalizeId(result?.projectId)
    if (resultProjectId && resultProjectId !== pid) { const error = new Error('Deleted thread did not belong to the requested project.'); if (reportError) set({ error: error.message }); if (throwOnError) throw error; return { ok: false } }
    const nextThreadId = result?.activeThread?.id || null
    clearDeletedThreadRendererState(tid, { successorThreadId: nextThreadId, timelineRequestIndex: latestTimelineRequestByThread })
    if (normalizeId(get().activeProjectId) !== pid || normalizeId(get().activeThreadId) !== tid) return result
    set({ activeThreadId: nextThreadId })
    useAppStore.getState().setActiveThreadId(nextThreadId)
    applyThreadSessionSelection(result?.activeThread || null)
    await get().loadThreads(pid)
    if (normalizeId(get().activeProjectId) !== pid || normalizeId(get().activeThreadId) !== normalizeId(nextThreadId)) return result
    await get().loadTimeline(nextThreadId)
    if (normalizeId(get().activeProjectId) !== pid || normalizeId(get().activeThreadId) !== normalizeId(nextThreadId)) return result
    await get().loadProjects()
    return result
  },
  deleteCurrentThread: async ({ stopActive = false } = {}) => get().deleteThread({ projectId: get().activeProjectId, threadId: get().activeThreadId, stopActive }),
  leaveToProjectEntry: () => {
    beginWorkspaceSelectionRequest()
    set({
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
    app.setActivePanel('chat')
    const chat = useChatStore.getState()
    chat.restoreChatRoute({ activeThreadId: '' })
    chat.hydrateFromTimeline([], { threadId: '' })
    useTerminalStore.getState().resetState?.()
    return { project: null, activeThread: null }
  },
  bootstrap: async () => {
    if (get().initialized) return
    await get().loadProjects()
    const state = get()
    const app = useAppStore.getState()
    const requestedViewMode = normalizeWorkspaceViewMode(state.restoreWorkspaceViewMode)
    const projectRows = Array.isArray(state.projects) ? state.projects : []
    const restoreProjectId = normalizeId(state.activeProjectId) || normalizeId(state.preferredProjectId)
    const preferredProjectId = normalizeId(state.preferredProjectId)
    const restoredProject = restoreProjectId
      ? projectRows.find((project) => normalizeId(project?.id) === restoreProjectId) || null
      : null
    const validPreferredProjectId = preferredProjectId
      && projectRows.some((project) => normalizeId(project?.id) === preferredProjectId)
      ? preferredProjectId
      : null

    if (requestedViewMode === 'workspace' && restoredProject?.id) {
      const threads = await get().loadThreads(restoredProject.id)
      const persistedThreadId = normalizeId(state.activeThreadId)
      const projectThreadId = normalizeId(restoredProject.activeThreadId)
      const resolvedThread = (
        (persistedThreadId && threads.find((thread) => normalizeId(thread?.id) === persistedThreadId))
        || (projectThreadId && threads.find((thread) => normalizeId(thread?.id) === projectThreadId))
        || threads[0]
        || null
      )
      const resolvedThreadId = normalizeId(resolvedThread?.id)

      set({
        activeProjectId: restoredProject.id,
        activeThreadId: resolvedThreadId,
        preferredProjectId: restoredProject.id,
        restoreWorkspaceViewMode: 'workspace',
        initialized: true,
        error: '',
      })
      app.setProjectFolder(restoredProject.path || null)
      app.setActiveProjectId(restoredProject.id)
      app.setActiveThreadId(resolvedThreadId)
      app.setWorkspaceViewMode('workspace')
      applyThreadSessionSelection(resolvedThread)
      await get().loadTimeline(resolvedThreadId)
      return
    }

    set({
      activeProjectId: null,
      activeThreadId: null,
      preferredProjectId: validPreferredProjectId,
      restoreWorkspaceViewMode: 'project-entry',
      threads: [],
      initialized: true,
    })
    app.setProjectFolder(null)
    app.setActiveProjectId(null)
    app.setActiveThreadId(null)
    app.setWorkspaceViewMode('project-entry')
  },
}), {
  name: WORKSPACE_STORAGE_KEY,
  partialize: (state) => ({
    activeProjectId: state.activeProjectId,
    activeThreadId: state.activeThreadId,
    preferredProjectId: state.preferredProjectId,
    projectEntryArchivedAtById: state.projectEntryArchivedAtById,
    projectEntryRestoredAtById: state.projectEntryRestoredAtById,
    restoreWorkspaceViewMode: normalizeWorkspaceViewMode(state.restoreWorkspaceViewMode),
    workspaceRailOpen: state.workspaceRailOpen,
    workspaceRailWidth: clampWorkspaceRailWidth(state.workspaceRailWidth),
  }),
  merge: (persisted, current) => {
    const p = persisted && typeof persisted === 'object' ? persisted : {}
    return {
      ...current,
      activeProjectId: normalizeId(p.activeProjectId),
      activeThreadId: normalizeId(p.activeThreadId),
      preferredProjectId: normalizeId(p.preferredProjectId),
      projectEntryArchivedAtById: normalizeProjectArchiveOverrides(p.projectEntryArchivedAtById),
      projectEntryRestoredAtById: normalizeProjectRestorePriorities(p.projectEntryRestoredAtById),
      restoreWorkspaceViewMode: normalizeWorkspaceViewMode(p.restoreWorkspaceViewMode),
      workspaceRailOpen: p.workspaceRailOpen === false ? false : true,
      workspaceRailWidth: clampWorkspaceRailWidth(p.workspaceRailWidth),
    }
  },
}))

export default useWorkspaceStore
