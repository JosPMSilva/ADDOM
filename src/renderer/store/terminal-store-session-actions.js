import useAppStore from './useAppStore.js'
import useChatStore from './useChatStore.js'
import useSettingsStore from './useSettingsStore.js'
import useToolStore from './useToolStore.js'
import { resolveTerminalLaunchSettings } from '../../common/terminal/terminal-settings.mjs'
import { createTerminalActionNoticeSetter } from './terminal-store-action-notice.js'
import {
  appendOutputState,
  appendTelemetryEvent,
  asTrimmedString,
  CHAT_TERMINAL_COMPACT_MODE,
  clearUnreadFlagOnSession,
  connectionPromiseBySessionId,
  DEFAULT_OUTPUT_STATE,
  DEFAULT_VIEWPORT_METRICS,
  disconnectSessionSubscription,
  getSessionUnreadContext,
  getTerminalApi,
  lastRequestedResizeBySessionId,
  mergeAttachOutput,
  normalizeRuntimeSurfaceKey,
  normalizeTerminalSession,
  normalizeViewportMetrics,
  removeSession,
  selectNextActiveSessionId,
  shouldMarkSessionUnread,
  subscriptionCleanupBySessionId,
  upsertSession,
} from './terminal-store-shared.js'

export function createTerminalSessionActions({ set, get }) {
  const setActionNotice = createTerminalActionNoticeSetter(set)

  return {
    focusChatDock: async ({ threadId = '' } = {}) => {
      const normalizedThreadId = asTrimmedString(threadId || useAppStore.getState?.().activeThreadId)
      if (normalizedThreadId) {
        useChatStore.getState?.().setTerminalDockState?.({
          collapsed: false,
          browserOpen: false,
        }, { threadId: normalizedThreadId })
      }

      const threadState = useChatStore.getState?.().getThreadState?.(normalizedThreadId)
      const selectedTabId = asTrimmedString(threadState?.terminalDock?.selectedTabId)
      const threadSessions = (Array.isArray(get().sessions) ? get().sessions : [])
        .filter((session) => asTrimmedString(session?.threadId) === normalizedThreadId)
      const preferredSessionId = selectNextActiveSessionId(threadSessions, selectedTabId || get().activeSessionId)

      if (preferredSessionId) {
        if (normalizedThreadId) {
          useChatStore.getState?.().setTerminalDockSelectedTab?.(preferredSessionId, { threadId: normalizedThreadId })
        }
        get().setActiveSessionId(preferredSessionId)
        await get().requestSessionSurfaceFocus(preferredSessionId, 'chat_dock')
      }

      get().requestViewportFocus(CHAT_TERMINAL_COMPACT_MODE)
      return preferredSessionId
    },

    noteModelSessionActivity: (activity = {}) => {
      const sessionId = asTrimmedString(activity.sessionId)
      if (!sessionId) return
      const action = asTrimmedString(activity.action).toLowerCase()
      const activityStatus = asTrimmedString(activity.status).toLowerCase()
      set((state) => ({
        sessions: (() => {
          if (activityStatus === 'closed') {
            lastRequestedResizeBySessionId.delete(sessionId)
            return removeSession(state.sessions, sessionId)
          }

          const existingSession = state.sessions.find((entry) => entry.id === sessionId) || null
          const nextStatus = activityStatus || (action === 'close' ? 'closing' : asTrimmedString(existingSession?.status || 'running'))
          const nextSession = {
            ...(existingSession || {}),
            id: sessionId,
            cwd: asTrimmedString(activity.cwd) || asTrimmedString(existingSession?.cwd),
            shell: asTrimmedString(activity.shell) || asTrimmedString(existingSession?.shell || 'default') || 'default',
            shellKind: asTrimmedString(activity.shellKind) || asTrimmedString(existingSession?.shellKind || activity.shell || 'shell') || 'shell',
            cols: Number(activity.cols || existingSession?.cols || 0) || DEFAULT_VIEWPORT_METRICS.cols,
            rows: Number(activity.rows || existingSession?.rows || 0) || DEFAULT_VIEWPORT_METRICS.rows,
            status: nextStatus || 'running',
            closeRequested: activity.closeRequested === true || nextStatus === 'closing',
            exitCode: activity.exitCode ?? existingSession?.exitCode ?? null,
            exitSignal: activity.exitSignal ?? existingSession?.exitSignal ?? null,
            outputSequence: Number(activity.outputSequence || existingSession?.outputSequence || 0) || 0,
            updatedAt: Number(activity.updatedAt || Date.now()) || Date.now(),
          }
          return upsertSession(state.sessions, nextSession)
        })(),
        activeSessionId: (() => {
          if (activityStatus === 'closed') {
            return selectNextActiveSessionId(
              removeSession(state.sessions, sessionId),
              state.activeSessionId === sessionId ? '' : state.activeSessionId,
            )
          }
          return state.activeArchivedSessionId
            ? state.activeSessionId
            : (sessionId || state.activeSessionId)
        })(),
        rawOutputBySessionId: (() => {
          if (activityStatus !== 'closed') return state.rawOutputBySessionId
          const nextOutputBySessionId = { ...state.rawOutputBySessionId }
          delete nextOutputBySessionId[sessionId]
          return nextOutputBySessionId
        })(),
        modelSessionActivity: {
          sessionId,
          action,
          displayName: asTrimmedString(activity.displayName) || sessionId,
          attentionMessage: asTrimmedString(activity.attentionMessage),
          panelIntent: asTrimmedString(activity.panelIntent).toLowerCase() || 'none',
          liveSurface: asTrimmedString(activity.liveSurface) || 'chat_dock',
          userTakeoverAvailable: activity.userTakeoverAvailable === true,
          threadId: asTrimmedString(activity.threadId),
          updatedAt: Number(activity.updatedAt || Date.now()) || Date.now(),
        },
        telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'session_activity', {
          sessionId,
          action,
          threadId: asTrimmedString(activity.threadId),
        }),
      }))
      if (activityStatus === 'closed') {
        void disconnectSessionSubscription(sessionId)
        void get().refreshArchivedSessions()
      }
    },

    applySessionSnapshot: (snapshot = {}) => {
      const normalizedSession = normalizeTerminalSession(snapshot.session)
      if (!normalizedSession.id) return
      const nextSession = {
        ...normalizedSession,
        hasUnreadOutput: false,
      }
      set((state) => {
        const nextSessions = upsertSession(state.sessions, nextSession)
        return {
          sessions: nextSessions,
          activeSessionId: selectNextActiveSessionId(
            nextSessions,
            state.activeArchivedSessionId ? state.activeSessionId : (state.activeSessionId || nextSession.id),
          ),
          rawOutputBySessionId: {
            ...state.rawOutputBySessionId,
            [nextSession.id]: mergeAttachOutput(state.rawOutputBySessionId[nextSession.id], snapshot.output),
          },
          actionError: '',
        }
      })
      lastRequestedResizeBySessionId.set(nextSession.id, {
        cols: nextSession.cols,
        rows: nextSession.rows,
      })
    },

    applySessionEvent: (event = {}) => {
      const sessionId = asTrimmedString(event.sessionId || event?.session?.id)
      if (!sessionId) return
      const normalizedSession = normalizeTerminalSession(event.session)
      set((state) => {
        if (event.type === 'closed') {
          const nextSessions = removeSession(state.sessions, sessionId)
          const nextOutput = { ...state.rawOutputBySessionId }
          delete nextOutput[sessionId]
          lastRequestedResizeBySessionId.delete(sessionId)
          return {
            sessions: nextSessions,
            activeSessionId: selectNextActiveSessionId(nextSessions, state.activeSessionId === sessionId ? '' : state.activeSessionId),
            rawOutputBySessionId: nextOutput,
            modelSessionActivity: state.modelSessionActivity?.sessionId === sessionId
              ? {
                  ...state.modelSessionActivity,
                  action: 'close',
                  panelIntent: 'none',
                  updatedAt: Date.now(),
                }
              : state.modelSessionActivity,
            actionError: '',
          }
        }

        const nextSessions = normalizedSession.id
          ? upsertSession(state.sessions, {
              ...normalizedSession,
              hasUnreadOutput: event.type === 'data'
                ? shouldMarkSessionUnread(normalizedSession, getSessionUnreadContext(normalizedSession, state.activeSessionId))
                : (state.sessions.find((entry) => entry.id === normalizedSession.id)?.hasUnreadOutput === true),
            })
          : state.sessions
        const nextOutputBySessionId = { ...state.rawOutputBySessionId }

        if (event.type === 'data') {
          const previous = nextOutputBySessionId[sessionId]
          nextOutputBySessionId[sessionId] = appendOutputState(
            previous,
            event?.chunk?.data || '',
            event?.chunk?.sequence,
          )
        } else if (!nextOutputBySessionId[sessionId] && normalizedSession.id) {
          nextOutputBySessionId[normalizedSession.id] = {
            ...DEFAULT_OUTPUT_STATE,
            lastSequence: Number(normalizedSession.outputSequence || 0) || 0,
          }
        }

        if (normalizedSession.id) {
          lastRequestedResizeBySessionId.set(normalizedSession.id, {
            cols: normalizedSession.cols,
            rows: normalizedSession.rows,
          })
        }

        return {
          sessions: nextSessions,
          activeSessionId: selectNextActiveSessionId(
            nextSessions,
            state.activeArchivedSessionId ? state.activeSessionId : (state.activeSessionId || sessionId),
          ),
          rawOutputBySessionId: nextOutputBySessionId,
          actionError: event.type === 'error'
            ? asTrimmedString(event.error || 'Terminal session error.')
            : state.actionError,
        }
      })

      if (event.type === 'closed') {
        void disconnectSessionSubscription(sessionId)
        void get().refreshArchivedSessions()
      }
    },

    ensureSessionConnected: async (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      if (!normalizedSessionId) return
      const terminalApi = getTerminalApi()
      if (!terminalApi) return
      if (subscriptionCleanupBySessionId.has(normalizedSessionId)) return
      if (connectionPromiseBySessionId.has(normalizedSessionId)) {
        await connectionPromiseBySessionId.get(normalizedSessionId)
        return
      }

      const connectionPromise = (async () => {
        const outputState = get().rawOutputBySessionId[normalizedSessionId]
        const projectFolder = get().hydratedProjectFolder
        const permissionMode = get().hydratedPermissionMode
        const bufferedEvents = []
        let attachComplete = false
        let unsubscribe = null
        try {
          unsubscribe = await terminalApi.subscribe({
            sessionId: normalizedSessionId,
            projectFolder,
            permissionMode,
          }, (eventPayload = {}) => {
            if (!attachComplete) {
              bufferedEvents.push(eventPayload)
              return
            }
            get().applySessionEvent(eventPayload)
          })
          if (typeof unsubscribe === 'function') {
            subscriptionCleanupBySessionId.set(normalizedSessionId, unsubscribe)
          }

          const attachResult = await terminalApi.attachSession(normalizedSessionId, {
            sinceSequence: Number(outputState?.lastSequence || 0) || 0,
            projectFolder,
            permissionMode,
          })
          if (!attachResult?.ok) {
            throw new Error(asTrimmedString(attachResult?.message || attachResult?.error || 'terminal_session_attach_failed'))
          }
          get().applySessionSnapshot(attachResult)
          attachComplete = true
          for (const eventPayload of bufferedEvents) {
            get().applySessionEvent(eventPayload)
          }
        } catch (error) {
          if (typeof unsubscribe === 'function') {
            subscriptionCleanupBySessionId.delete(normalizedSessionId)
            try {
              await unsubscribe()
            } catch {
              // Best-effort cleanup only.
            }
          }
          throw error
        }
      })()

      connectionPromiseBySessionId.set(normalizedSessionId, connectionPromise)
      try {
        await connectionPromise
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to connect terminal session.') })
      } finally {
        connectionPromiseBySessionId.delete(normalizedSessionId)
      }
    },

    createSession: async ({
      projectFolder = '',
      cwd = '',
      shell = '',
      launchContext = {},
      sessionTitle = '',
      permissionMode = '',
      threadId = '',
      preferredSurface = 'chat_dock',
      telemetrySource = 'chat_terminal',
    } = {}) => {
      const terminalApi = getTerminalApi()
      const normalizedProjectFolder = asTrimmedString(projectFolder)
      const normalizedThreadId = asTrimmedString(threadId)
      const normalizedPreferredSurface = normalizeRuntimeSurfaceKey(preferredSurface)
      const normalizedTelemetrySource = asTrimmedString(telemetrySource) || 'chat_terminal'
      const terminalSettings = useSettingsStore.getState?.().coreSettings?.terminal
      const resolvedLaunchSettings = resolveTerminalLaunchSettings({
        terminalSettings,
        projectFolder: normalizedProjectFolder,
        explicitCwd: cwd,
        explicitShell: shell,
        launchContext,
      })
      if (!terminalApi) {
        set({ actionError: 'Terminal preload API is unavailable.' })
        return null
      }

      set({ creatingSession: true, actionError: '' })
      try {
        const viewportMetrics = get().viewportMetricsByMode?.[CHAT_TERMINAL_COMPACT_MODE] || get().viewportMetrics
        const result = await terminalApi.createSession({
          projectFolder: normalizedProjectFolder,
          cwd: resolvedLaunchSettings.cwd,
          shell: resolvedLaunchSettings.shell,
          cols: viewportMetrics.cols,
          rows: viewportMetrics.rows,
          permissionMode,
          threadId: normalizedThreadId,
          preferredSurface: normalizedPreferredSurface,
          sessionTitle: asTrimmedString(sessionTitle),
        })
        if (!result?.ok) {
          const hint = Array.isArray(result?.approvalPolicy?.hints) ? result.approvalPolicy.hints[0] : ''
          const message = asTrimmedString(hint || result?.message || result?.error || 'Terminal session creation failed.')
          set({ actionError: message })
          return null
        }
        get().applySessionSnapshot(result)
        void get().ensureSessionConnected(result?.session?.id)
        set((state) => ({
          telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'session_opened', {
            sessionId: asTrimmedString(result?.session?.id),
            source: normalizedTelemetrySource,
          }),
        }))
        return result?.session?.id || null
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Terminal session creation failed.') })
        return null
      } finally {
        set({ creatingSession: false })
      }
    },

    renameSession: async (sessionId = '', sessionTitle = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const terminalApi = getTerminalApi()
      if (!terminalApi || !normalizedSessionId || typeof terminalApi.renameSession !== 'function') return false
      try {
        const result = await terminalApi.renameSession(normalizedSessionId, asTrimmedString(sessionTitle), {
          projectFolder: get().hydratedProjectFolder,
          permissionMode: get().hydratedPermissionMode,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_session_rename_failed'))
        }
        set((state) => ({
          sessions: upsertSession(state.sessions, result.session),
          telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'rename', {
            sessionId: normalizedSessionId,
          }),
          actionError: '',
        }))
        return true
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to rename terminal session.') })
        return false
      }
    },

    duplicateSession: async (sessionId = '', {
      threadId = '',
      projectFolder = '',
      permissionMode = '',
      telemetrySource = 'chat_terminal_duplicate',
    } = {}) => {
      const normalizedSessionId = asTrimmedString(sessionId || get().activeSessionId)
      const sourceSession = (Array.isArray(get().sessions) ? get().sessions : [])
        .find((session) => asTrimmedString(session?.id) === normalizedSessionId)
      if (!sourceSession?.id) return null
      const nextThreadId = asTrimmedString(threadId || sourceSession.threadId || useAppStore.getState?.().activeThreadId)
      const nextProjectFolder = asTrimmedString(projectFolder || get().hydratedProjectFolder || sourceSession.project)
      const nextPermissionMode = asTrimmedString(permissionMode || get().hydratedPermissionMode)
      const sessionIdCreated = await get().createSession({
        projectFolder: nextProjectFolder,
        cwd: asTrimmedString(sourceSession.cwd || nextProjectFolder || '.'),
        shell: asTrimmedString(sourceSession.shell || 'default') || 'default',
        permissionMode: nextPermissionMode,
        threadId: nextThreadId,
        preferredSurface: 'chat_dock',
        telemetrySource,
      })
      if (!sessionIdCreated) return null
      if (nextThreadId) {
        useChatStore.getState?.().setTerminalDockState?.({
          collapsed: false,
          browserOpen: false,
        }, { threadId: nextThreadId })
        useChatStore.getState?.().setTerminalDockSelectedTab?.(sessionIdCreated, { threadId: nextThreadId })
      }
      return sessionIdCreated
    },

    switchThreadSession: async ({
      threadId = '',
      direction = 'next',
      surface = 'chat_dock',
    } = {}) => {
      const normalizedThreadId = asTrimmedString(threadId || useAppStore.getState?.().activeThreadId)
      if (!normalizedThreadId) return ''
      const threadSessions = (Array.isArray(get().sessions) ? get().sessions : [])
        .filter((session) => asTrimmedString(session?.threadId) === normalizedThreadId)
        .filter((session) => !['closing', 'ended', 'exited', 'closed'].includes(asTrimmedString(session?.lifecycleState || session?.status).toLowerCase()))
      if (threadSessions.length === 0) return ''
      const selectedTabId = asTrimmedString(useChatStore.getState?.().getThreadState?.(normalizedThreadId)?.terminalDock?.selectedTabId)
      const currentId = asTrimmedString(selectedTabId || get().activeSessionId)
      const currentIndex = Math.max(0, threadSessions.findIndex((session) => session.id === currentId))
      const offset = asTrimmedString(direction).toLowerCase() === 'previous' ? -1 : 1
      const nextIndex = (currentIndex + offset + threadSessions.length) % threadSessions.length
      const nextSessionId = asTrimmedString(threadSessions[nextIndex]?.id)
      if (!nextSessionId) return ''
      useChatStore.getState?.().setTerminalDockState?.({
        collapsed: false,
        browserOpen: false,
      }, { threadId: normalizedThreadId })
      useChatStore.getState?.().setTerminalDockSelectedTab?.(nextSessionId, { threadId: normalizedThreadId })
      get().setActiveSessionId(nextSessionId)
      await get().requestSessionSurfaceFocus(nextSessionId, surface)
      get().requestViewportFocus(CHAT_TERMINAL_COMPACT_MODE)
      return nextSessionId
    },

    openThreadTerminal: async ({
      threadId = '',
      projectFolder = '',
      cwd = '',
      launchContext = {},
      permissionMode = '',
      telemetrySource = 'chat_composer_rail',
    } = {}) => {
      const normalizedThreadId = asTrimmedString(threadId || useAppStore.getState?.().activeThreadId)
      if (!normalizedThreadId) return null

      const threadSessions = (Array.isArray(get().sessions) ? get().sessions : [])
        .filter((session) => asTrimmedString(session?.threadId) === normalizedThreadId)
      const pendingApprovals = useToolStore.getState?.().getPendingListForThread?.(normalizedThreadId) || []
      const hasPendingTerminalOpen = pendingApprovals.some((approval) => (
        asTrimmedString(approval?.toolName).toLowerCase() === 'terminal_session_open'
      ))

      if (threadSessions.length > 0 || hasPendingTerminalOpen) {
        return get().focusChatDock({ threadId: normalizedThreadId })
      }

      const sessionId = await get().createSession({
        projectFolder,
        cwd,
        launchContext,
        permissionMode,
        threadId: normalizedThreadId,
        preferredSurface: 'chat_dock',
        telemetrySource,
      })
      if (!sessionId) return null

      useChatStore.getState?.().setTerminalDockSelectedTab?.(sessionId, { threadId: normalizedThreadId })
      return get().focusChatDock({ threadId: normalizedThreadId })
    },

    openNewThreadTerminal: async ({
      threadId = '',
      projectFolder = '',
      cwd = '',
      shell = '',
      launchContext = {},
      sessionTitle = '',
      permissionMode = '',
      telemetrySource = 'command_palette',
    } = {}) => {
      const normalizedThreadId = asTrimmedString(threadId || useAppStore.getState?.().activeThreadId)
      if (!normalizedThreadId) return null

      const sessionId = await get().createSession({
        projectFolder,
        cwd,
        shell,
        launchContext,
        sessionTitle,
        permissionMode,
        threadId: normalizedThreadId,
        preferredSurface: 'chat_dock',
        telemetrySource,
      })
      if (!sessionId) return null

      useChatStore.getState?.().setTerminalDockState?.({
        collapsed: false,
        browserOpen: false,
      }, { threadId: normalizedThreadId })
      useChatStore.getState?.().setTerminalDockSelectedTab?.(sessionId, { threadId: normalizedThreadId })
      return get().focusChatDock({ threadId: normalizedThreadId })
    },

    writeInput: async (sessionId = '', data = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const terminalApi = getTerminalApi()
      if (!terminalApi || !normalizedSessionId || !data) return false
      try {
        const result = await terminalApi.writeSession(normalizedSessionId, data, {
          projectFolder: get().hydratedProjectFolder,
          permissionMode: get().hydratedPermissionMode,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_session_write_failed'))
        }
        setActionNotice('Input sent to the terminal session.', 'success')
        return true
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to send terminal input.'), actionNotice: null })
        return false
      }
    },

    resizeSession: async (sessionId = '', metrics = {}) => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const terminalApi = getTerminalApi()
      if (!terminalApi || !normalizedSessionId) return false
      const nextMetrics = normalizeViewportMetrics(metrics)
      const currentSession = get().sessions.find((entry) => entry.id === normalizedSessionId)
      const lastRequested = lastRequestedResizeBySessionId.get(normalizedSessionId)
      if (
        (currentSession && currentSession.cols === nextMetrics.cols && currentSession.rows === nextMetrics.rows)
        || (lastRequested && lastRequested.cols === nextMetrics.cols && lastRequested.rows === nextMetrics.rows)
      ) {
        return true
      }
      lastRequestedResizeBySessionId.set(normalizedSessionId, nextMetrics)
      try {
        const result = await terminalApi.resizeSession(normalizedSessionId, nextMetrics.cols, nextMetrics.rows, {
          projectFolder: get().hydratedProjectFolder,
          permissionMode: get().hydratedPermissionMode,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_session_resize_failed'))
        }
        lastRequestedResizeBySessionId.set(normalizedSessionId, {
          cols: Number(result?.session?.cols || nextMetrics.cols) || nextMetrics.cols,
          rows: Number(result?.session?.rows || nextMetrics.rows) || nextMetrics.rows,
        })
        set((state) => ({
          sessions: upsertSession(state.sessions, result.session),
        }))
        return true
      } catch (error) {
        const pending = lastRequestedResizeBySessionId.get(normalizedSessionId)
        if (pending && pending.cols === nextMetrics.cols && pending.rows === nextMetrics.rows) {
          lastRequestedResizeBySessionId.delete(normalizedSessionId)
        }
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to resize terminal session.') })
        return false
      }
    },

    closeSession: async (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const terminalApi = getTerminalApi()
      if (!terminalApi || !normalizedSessionId) return false
      try {
        const result = await terminalApi.closeSession(normalizedSessionId, '', {
          projectFolder: get().hydratedProjectFolder,
          permissionMode: get().hydratedPermissionMode,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_session_close_failed'))
        }
        set((state) => {
          const currentSession = state.sessions.find((entry) => entry.id === normalizedSessionId) || null
          if (result?.closed === true) {
            const nextSessions = removeSession(state.sessions, normalizedSessionId)
            const nextOutputBySessionId = { ...state.rawOutputBySessionId }
            delete nextOutputBySessionId[normalizedSessionId]
            lastRequestedResizeBySessionId.delete(normalizedSessionId)
            return {
              sessions: nextSessions,
              activeSessionId: selectNextActiveSessionId(
                nextSessions,
                state.activeSessionId === normalizedSessionId ? '' : state.activeSessionId,
              ),
              rawOutputBySessionId: nextOutputBySessionId,
              actionError: '',
              telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'close', {
                sessionId: normalizedSessionId,
                closed: true,
              }),
            }
          }
          return {
            sessions: upsertSession(state.sessions, {
              ...(currentSession || {}),
              id: normalizedSessionId,
              status: 'closing',
              closeRequested: true,
              updatedAt: Date.now(),
            }),
            actionError: '',
            telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'close', {
              sessionId: normalizedSessionId,
              closed: false,
            }),
          }
        })
        if (result?.closed === true) {
          void disconnectSessionSubscription(normalizedSessionId)
          void get().refreshArchivedSessions()
        }
        return true
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to close terminal session.') })
        return false
      }
    },

    requestSessionSurfaceFocus: async (sessionId = '', surface = 'chat_dock') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const terminalApi = getTerminalApi()
      if (!terminalApi || !normalizedSessionId || typeof terminalApi.focusSessionSurface !== 'function') return false
      try {
        const normalizedSurface = normalizeRuntimeSurfaceKey(surface)
        const result = await terminalApi.focusSessionSurface(normalizedSessionId, normalizedSurface, {
          projectFolder: get().hydratedProjectFolder,
          permissionMode: get().hydratedPermissionMode,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_session_focus_surface_failed'))
        }
        set((state) => ({
          sessions: upsertSession(state.sessions, result.session),
          telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'focus_surface', {
            sessionId: normalizedSessionId,
            surface: normalizedSurface,
          }),
        }))
        set((state) => ({
          sessions: clearUnreadFlagOnSession(state.sessions, normalizedSessionId),
        }))
        return true
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to focus terminal surface.') })
        return false
      }
    },

    takeOverSession: async (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const terminalApi = getTerminalApi()
      if (!terminalApi || !normalizedSessionId || typeof terminalApi.takeOverSession !== 'function') return false
      try {
        const result = await terminalApi.takeOverSession(normalizedSessionId, {
          projectFolder: get().hydratedProjectFolder,
          permissionMode: get().hydratedPermissionMode,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_session_takeover_failed'))
        }
        set((state) => ({
          sessions: upsertSession(state.sessions, result.session),
          telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'takeover', {
            sessionId: normalizedSessionId,
          }),
          actionNotice: {
            tone: 'success',
            message: 'Takeover active. Keyboard input now goes to this session.',
          },
          actionError: '',
        }))
        return true
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to take over terminal session.'), actionNotice: null })
        return false
      }
    },

    handBackSession: async (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const terminalApi = getTerminalApi()
      if (!terminalApi || !normalizedSessionId || typeof terminalApi.handBackSession !== 'function') return false
      try {
        const result = await terminalApi.handBackSession(normalizedSessionId, {
          projectFolder: get().hydratedProjectFolder,
          permissionMode: get().hydratedPermissionMode,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_session_handback_failed'))
        }
        set((state) => ({
          sessions: upsertSession(state.sessions, result.session),
          telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'handback', {
            sessionId: normalizedSessionId,
          }),
        }))
        return true
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to hand terminal session back to AI.') })
        return false
      }
    },

    interruptSession: async (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const terminalApi = getTerminalApi()
      if (!terminalApi || !normalizedSessionId || typeof terminalApi.interruptSession !== 'function') return false
      try {
        const result = await terminalApi.interruptSession(normalizedSessionId, {
          projectFolder: get().hydratedProjectFolder,
          permissionMode: get().hydratedPermissionMode,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_session_interrupt_failed'))
        }
        set((state) => ({
          sessions: upsertSession(state.sessions, result.session),
          telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'interrupt', {
            sessionId: normalizedSessionId,
          }),
        }))
        return true
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to interrupt terminal session.') })
        return false
      }
    },

    terminateSession: async (sessionId = '') => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const terminalApi = getTerminalApi()
      if (!terminalApi || !normalizedSessionId || typeof terminalApi.terminateSession !== 'function') return false
      try {
        const result = await terminalApi.terminateSession(normalizedSessionId, {
          projectFolder: get().hydratedProjectFolder,
          permissionMode: get().hydratedPermissionMode,
        })
        if (!result?.ok) {
          throw new Error(asTrimmedString(result?.message || result?.error || 'terminal_session_terminate_failed'))
        }
        set((state) => ({
          sessions: upsertSession(state.sessions, {
            ...(state.sessions.find((entry) => entry.id === normalizedSessionId) || {}),
            ...(result.session || {}),
            id: normalizedSessionId,
            status: 'closing',
            lifecycleState: 'closing',
            closeRequested: true,
            failureReason: 'terminated',
          }),
          telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'terminate', {
            sessionId: normalizedSessionId,
          }),
        }))
        return true
      } catch (error) {
        set({ actionError: asTrimmedString(error?.message || error || 'Failed to terminate terminal session.') })
        return false
      }
    },
  }
}
