import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../store/useChatStore.js'
import useEditorStore from '../store/useEditorStore.js'
import useTerminalStore from '../store/useTerminalStore.js'
import { resolveTerminalActionStates } from './chat/chat-terminal-dock-utils.mjs'

export function useCommandPaletteTerminalActions({
  activeThreadId = '',
  workspaceActive = false,
  projectFolder = '',
  permissionMode = '',
  setActivePanel = null,
  emitCommandPaletteEvent = null,
} = {}) {
  const terminalDock = useChatStore(useShallow((s) => s.getThreadState(activeThreadId)?.terminalDock || {}))
  const setTerminalDockState = useChatStore((s) => s.setTerminalDockState)
  const editorCwd = useEditorStore(useShallow((s) => {
    const currentTab = (Array.isArray(s.tabs) ? s.tabs : []).find((tab) => tab?.id === s.activeTabId)
    const normalizedFilePath = String(currentTab?.filePath || '').trim().replace(/\\/g, '/')
    if (!normalizedFilePath.includes('/')) return ''
    if (/^[A-Za-z]:\//.test(normalizedFilePath) || normalizedFilePath.startsWith('/')) {
      return normalizedFilePath.split('/').slice(0, -1).join('/')
    }
    const parts = normalizedFilePath.split('/').filter(Boolean)
    if (parts.length <= 1) return ''
    const relativeDir = parts.slice(0, -1).join('/')
    const normalizedProjectFolder = String(projectFolder || '').trim().replace(/[\\/]+$/g, '')
    if (!normalizedProjectFolder) return ''
    const separator = normalizedProjectFolder.includes('\\') ? '\\' : '/'
    return `${normalizedProjectFolder}${separator}${relativeDir.replace(/[\\/]/g, separator)}`
  }))
  const { terminalSessions, activeTerminalSessionId } = useTerminalStore(useShallow((s) => ({
    terminalSessions: s.getSessions?.() || [],
    activeTerminalSessionId: s.activeSessionId,
  })))

  const selectedTerminalSession = useMemo(() => {
    const normalizedThreadId = String(activeThreadId || '').trim()
    const sessionsForThread = (Array.isArray(terminalSessions) ? terminalSessions : [])
      .filter((session) => String(session?.threadId || '').trim() === normalizedThreadId)
    const selectedTabId = String(terminalDock?.selectedTabId || '').trim()
    return sessionsForThread.find((session) => String(session?.id || '').trim() === selectedTabId)
      || sessionsForThread.find((session) => String(session?.id || '').trim() === String(activeTerminalSessionId || '').trim())
      || sessionsForThread[0]
      || null
  }, [activeTerminalSessionId, activeThreadId, terminalDock?.selectedTabId, terminalSessions])

  const hasTerminalDockTarget = Boolean(
    selectedTerminalSession
    || terminalDock?.browserOpen === true
    || String(terminalDock?.selectedTabId || '').trim()
    || String(terminalDock?.browserSelectionSessionId || '').trim(),
  )

  const terminalActionStates = useMemo(() => resolveTerminalActionStates({
    workspaceActive,
    activeThreadId,
    projectFolder,
    selectedSession: selectedTerminalSession,
    hasTerminalDockTarget,
    terminalDockCollapsed: terminalDock?.collapsed === true,
  }), [
    activeThreadId,
    hasTerminalDockTarget,
    projectFolder,
    selectedTerminalSession,
    terminalDock?.collapsed,
    workspaceActive,
  ])

  const focusTerminal = useCallback(() => {
    setActivePanel?.('chat')
    void useTerminalStore.getState().focusChatDock({ threadId: activeThreadId })
  }, [activeThreadId, setActivePanel])

  const openChatTerminal = useCallback(() => {
    setActivePanel?.('chat')
    void useTerminalStore.getState().openThreadTerminal({
      threadId: activeThreadId,
      projectFolder,
      permissionMode,
      launchContext: {
        editorCwd,
        sessionCwd: selectedTerminalSession?.cwd,
      },
    })
  }, [activeThreadId, editorCwd, permissionMode, projectFolder, selectedTerminalSession?.cwd, setActivePanel])

  const openNewTerminal = useCallback(() => {
    setActivePanel?.('chat')
    void useTerminalStore.getState().openNewThreadTerminal({
      threadId: activeThreadId,
      projectFolder,
      permissionMode,
      launchContext: {
        editorCwd,
        sessionCwd: selectedTerminalSession?.cwd,
      },
      telemetrySource: 'command_palette',
    })
  }, [activeThreadId, editorCwd, permissionMode, projectFolder, selectedTerminalSession?.cwd, setActivePanel])

  const browseTerminalSessions = useCallback(() => {
    setActivePanel?.('chat')
    setTerminalDockState({
      collapsed: false,
      browserOpen: true,
      browserSection: 'current_thread',
      browserSelectionSessionId: String(
        terminalDock?.browserSelectionSessionId
        || terminalDock?.selectedTabId
        || selectedTerminalSession?.id
        || '',
      ).trim(),
    }, { threadId: activeThreadId })
    useTerminalStore.getState().requestViewportFocus?.('chat_terminal_expanded')
    emitCommandPaletteEvent?.('terminal.browseSessions', { threadId: activeThreadId })
  }, [
    activeThreadId,
    emitCommandPaletteEvent,
    selectedTerminalSession?.id,
    setActivePanel,
    setTerminalDockState,
    terminalDock?.browserSelectionSessionId,
    terminalDock?.selectedTabId,
  ])

  const runSelectedTerminalAction = useCallback((actionName) => {
    const sessionId = String(selectedTerminalSession?.id || '').trim()
    if (!sessionId) return
    const terminalStore = useTerminalStore.getState()
    if (actionName === 'takeover') {
      void terminalStore.takeOverSession?.(sessionId)
    } else if (actionName === 'handback') {
      void terminalStore.handBackSession?.(sessionId)
    } else if (actionName === 'interrupt') {
      void terminalStore.interruptSession?.(sessionId)
    } else if (actionName === 'close') {
      void terminalStore.closeSession?.(sessionId)
    }
  }, [selectedTerminalSession?.id])

  const hideTerminalDock = useCallback(() => {
    setTerminalDockState({ collapsed: true }, { threadId: activeThreadId })
    useTerminalStore.getState().recordTelemetryEvent?.('dock_visibility', {
      threadId: activeThreadId,
      collapsed: true,
      source: 'command_palette',
    })
  }, [activeThreadId, setTerminalDockState])

  const terminalCommands = useMemo(() => createTerminalCommandPaletteDefinitions({
    terminalActionStates,
    focusTerminal,
    openNewTerminal,
    browseTerminalSessions,
    runSelectedTerminalAction,
    hideTerminalDock,
  }), [
    browseTerminalSessions,
    focusTerminal,
    hideTerminalDock,
    openNewTerminal,
    runSelectedTerminalAction,
    terminalActionStates,
  ])

  return {
    openChatTerminal,
    terminalCommands,
  }
}

export function createTerminalCommandPaletteDefinitions({
  terminalActionStates,
  focusTerminal,
  openNewTerminal,
  browseTerminalSessions,
  runSelectedTerminalAction,
  hideTerminalDock,
} = {}) {
  return [
    {
      id: 'terminal.focus',
      title: 'Focus Terminal',
      category: 'Terminal',
      aliases: ['focus terminal', 'terminal focus', 'focus shell', 'chat terminal focus'],
      getState: () => terminalActionStates.focus,
      run: focusTerminal,
    },
    {
      id: 'terminal.new',
      title: 'New Terminal',
      category: 'Terminal',
      aliases: ['new terminal', 'create terminal', 'terminal new', 'new shell'],
      getState: () => terminalActionStates.new,
      run: openNewTerminal,
    },
    {
      id: 'terminal.browseSessions',
      title: 'Browse Terminal Sessions',
      category: 'Terminal',
      aliases: ['browse terminal sessions', 'terminal sessions', 'terminal browser', 'terminal history'],
      getState: () => terminalActionStates.browse,
      run: browseTerminalSessions,
    },
    {
      id: 'terminal.takeOver',
      title: 'Take Over Terminal',
      category: 'Terminal',
      aliases: ['take over terminal', 'terminal takeover', 'takeover shell', 'control terminal'],
      getState: () => terminalActionStates.takeover,
      run: () => runSelectedTerminalAction('takeover'),
    },
    {
      id: 'terminal.handBack',
      title: 'Hand Back Terminal to AI',
      category: 'Terminal',
      aliases: ['hand back terminal', 'terminal handback', 'return terminal to ai', 'ai terminal control'],
      getState: () => terminalActionStates.handback,
      run: () => runSelectedTerminalAction('handback'),
    },
    {
      id: 'terminal.interrupt',
      title: 'Interrupt Terminal',
      category: 'Terminal',
      aliases: ['interrupt terminal', 'stop terminal input', 'ctrl c terminal', 'cancel terminal command'],
      getState: () => terminalActionStates.interrupt,
      run: () => runSelectedTerminalAction('interrupt'),
    },
    {
      id: 'terminal.close',
      title: 'Close Terminal Session',
      category: 'Terminal',
      aliases: ['close terminal', 'close terminal session', 'archive terminal', 'end terminal session'],
      getState: () => terminalActionStates.close,
      run: () => runSelectedTerminalAction('close'),
    },
    {
      id: 'terminal.hide',
      title: 'Hide Terminal Dock',
      category: 'Terminal',
      aliases: ['hide terminal', 'collapse terminal', 'dismiss terminal dock', 'hide shell'],
      getState: () => terminalActionStates.hide,
      run: hideTerminalDock,
    },
  ]
}
