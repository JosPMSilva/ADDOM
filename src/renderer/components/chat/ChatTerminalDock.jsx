import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { requestAppConfirm } from '../../store/useAppStore.js'
import useChatStore from '../../store/useChatStore.js'
import useEditorStore from '../../store/useEditorStore.js'
import useTerminalStore from '../../store/useTerminalStore.js'
import useToolStore from '../../store/useToolStore.js'
import useWorkspaceStore from '../../store/useWorkspaceStore.js'
import ChatTerminalDockBrowser from './ChatTerminalDockBrowser.jsx'
import { buildBrowserSessionEntries } from './chat-terminal-dock-browser-entries.mjs'
import ChatTerminalGlobalIndicator from './ChatTerminalDockGlobalIndicator.jsx'
import { PendingApprovalViewport } from './ChatTerminalDockPendingApproval.jsx'
import ChatTerminalDockTitleArea from './ChatTerminalDockTitleArea.jsx'
import ChatTerminalDockToolbar from './ChatTerminalDockToolbar.jsx'
import {
  buildTerminalDockBrowserEntryLabels,
  buildTerminalDockLabels,
} from './chat-terminal-dock-labels.mjs'
import { getTerminalShellChoices } from './chat-terminal-shell-choices.mjs'
import {
  asTrimmedString,
  buildDisambiguatedTabLabel,
  dirnameFromPath,
  getArchiveSaveActionState,
  getDockPanelDomId,
  getDockTabDomId,
  getPendingTabLabel,
  getSelectedTabDetail,
  getSessionTabLabel,
  getTabPriority,
  getTabStateLabel,
  joinWorkspacePath,
} from './chat-terminal-dock-utils.mjs'
import TerminalStatusBanner from '../terminal/TerminalStatusBanner.jsx'
import TerminalViewport from '../terminal/TerminalViewport.jsx'

const MIN_DOCK_HEIGHT = 180
const MAX_DOCK_HEIGHT = 520
const DEFAULT_DOCK_HEIGHT = 260

function DockAnnouncement({ message = '' }) {
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}

function useDockTabs(activeThreadId, labels) {
  const sessions = useTerminalStore(useShallow((state) => state.getSessions?.() || []))
  const pendingApprovals = useToolStore(useShallow((state) => state.getPendingListForThread(activeThreadId)))
  const liveTabs = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => asTrimmedString(session?.threadId) === asTrimmedString(activeThreadId))
    .map((session) => ({
      id: session.id,
      key: `session:${session.id}`,
      baseLabel: getSessionTabLabel(session, { labels }),
      kind: 'session',
      session,
    }))
  const pendingTabs = (Array.isArray(pendingApprovals) ? pendingApprovals : [])
    .filter((approval) => asTrimmedString(approval?.toolName).toLowerCase() === 'terminal_session_open')
    .map((approval) => ({
      id: `approval:${approval.approvalId}`,
      key: `approval:${approval.approvalId}`,
      baseLabel: getPendingTabLabel(approval, { labels }),
      kind: 'pending',
      approval,
    }))
  const mergedTabs = [...pendingTabs, ...liveTabs]
  const countsByBaseLabel = new Map()
  for (const tab of mergedTabs) {
    const baseLabel = asTrimmedString(tab.baseLabel) || labels.terminal
    countsByBaseLabel.set(baseLabel, Number(countsByBaseLabel.get(baseLabel) || 0) + 1)
  }
  const seenByBaseLabel = new Map()
  return mergedTabs.map((tab) => {
    const baseLabel = asTrimmedString(tab.baseLabel) || labels.terminal
    const duplicateIndex = Number(seenByBaseLabel.get(baseLabel) || 0)
    seenByBaseLabel.set(baseLabel, duplicateIndex + 1)
    return {
      ...tab,
      label: buildDisambiguatedTabLabel(baseLabel, tab, duplicateIndex, Number(countsByBaseLabel.get(baseLabel) || 0), { labels }),
    }
  })
}

function ChatTerminalDockInner({
  activeThreadId = '',
  projectFolder = '',
  permissionMode = '',
}) {
  const { t } = useRendererTranslation(['core'])
  const labels = React.useMemo(() => buildTerminalDockLabels(t), [t])
  const tabs = useDockTabs(activeThreadId, labels)
  const {
    runtimeHealth,
    hydratedProjectFolder,
    hydratedPermissionMode,
    sessions,
    activeSessionId,
    activeArchivedSessionId,
    archivedSessions,
    archiveMemoryActionPendingBySessionId,
    archiveDeletePendingBySessionId,
    actionError,
    actionNotice,
    rawOutputBySessionId,
    focusRequestKeyByMode,
    takeOverSession,
    handBackSession,
    closeSession,
    interruptSession,
    terminateSession,
    renameSession,
    duplicateSession,
    switchThreadSession,
    requestSessionSurfaceFocus,
    requestViewportFocus,
    setActiveSessionId,
    ensureSessionConnected,
    hydratePanel,
    openThreadTerminal,
    openNewThreadTerminal,
    selectArchivedSession,
    saveArchivedSessionToMemory,
    deleteArchivedSession,
    writeInput,
    resizeSession,
    setViewportMetricsForMode,
    recordTelemetryEvent,
  } = useTerminalStore(useShallow((state) => ({
    runtimeHealth: state.runtimeHealth,
    hydratedProjectFolder: state.hydratedProjectFolder,
    hydratedPermissionMode: state.hydratedPermissionMode,
    sessions: state.getSessions?.() || [],
    activeSessionId: state.activeSessionId,
    activeArchivedSessionId: state.activeArchivedSessionId,
    archivedSessions: state.getArchivedSessions?.() || [],
    archiveMemoryActionPendingBySessionId: state.archiveMemoryActionPendingBySessionId,
    archiveDeletePendingBySessionId: state.archiveDeletePendingBySessionId,
    actionError: state.actionError,
    actionNotice: state.actionNotice,
    rawOutputBySessionId: state.rawOutputBySessionId,
    focusRequestKeyByMode: state.focusRequestKeyByMode,
    takeOverSession: state.takeOverSession,
    handBackSession: state.handBackSession,
    closeSession: state.closeSession,
    interruptSession: state.interruptSession,
    terminateSession: state.terminateSession,
    renameSession: state.renameSession,
    duplicateSession: state.duplicateSession,
    switchThreadSession: state.switchThreadSession,
    requestSessionSurfaceFocus: state.requestSessionSurfaceFocus,
    requestViewportFocus: state.requestViewportFocus,
    setActiveSessionId: state.setActiveSessionId,
    ensureSessionConnected: state.ensureSessionConnected,
    hydratePanel: state.hydratePanel,
    openThreadTerminal: state.openThreadTerminal,
    openNewThreadTerminal: state.openNewThreadTerminal,
    selectArchivedSession: state.selectArchivedSession,
    saveArchivedSessionToMemory: state.saveArchivedSessionToMemory,
    deleteArchivedSession: state.deleteArchivedSession,
    writeInput: state.writeInput,
    resizeSession: state.resizeSession,
    setViewportMetricsForMode: state.setViewportMetricsForMode,
    recordTelemetryEvent: state.recordTelemetryEvent,
  })))
  const terminalDock = useChatStore(useShallow((state) => state.getThreadState(activeThreadId)?.terminalDock || {}))
  const setTerminalDockState = useChatStore((state) => state.setTerminalDockState)
  const setTerminalDockSelectedTab = useChatStore((state) => state.setTerminalDockSelectedTab)
  const threads = useWorkspaceStore((state) => state.threads)
  const openThreadInChat = useWorkspaceStore((state) => state.openThreadInChat)
  const editorCwd = useEditorStore(useShallow((state) => {
    const currentTab = (Array.isArray(state.tabs) ? state.tabs : [])
      .find((tab) => tab?.id === state.activeTabId)
    return joinWorkspacePath(projectFolder, dirnameFromPath(currentTab?.filePath))
  }))
  const [pendingTakeoverSessionId, setPendingTakeoverSessionId] = React.useState('')
  const [announcement, setAnnouncement] = React.useState('')
  const [dragState, setDragState] = React.useState(null)

  const selectedTabId = asTrimmedString(terminalDock?.selectedTabId)
  const selectedLiveSessionId = tabs.some((tab) => tab.kind === 'session' && tab.id === activeSessionId)
    ? activeSessionId
    : ''
  const resolvedSelectedTabId = selectedTabId || selectedLiveSessionId || asTrimmedString(tabs[0]?.id)
  const selectedTab = tabs.find((tab) => tab.id === resolvedSelectedTabId) || tabs[0] || null
  const selectedSession = selectedTab?.kind === 'session' ? selectedTab.session : null
  const showTabs = tabs.length > 1
  const dockHeight = Number(terminalDock?.height || DEFAULT_DOCK_HEIGHT) || DEFAULT_DOCK_HEIGHT
  const collapsed = terminalDock?.collapsed === true
  const browserOpen = terminalDock?.browserOpen === true
  const browserSection = asTrimmedString(terminalDock?.browserSection) || 'current_thread'
  const browserSelectionSessionId = asTrimmedString(terminalDock?.browserSelectionSessionId)
  const runtimeStatus = asTrimmedString(runtimeHealth?.status).toLowerCase()

  React.useEffect(() => {
    if (!projectFolder) return
    const needsHydration = (
      runtimeStatus === 'idle'
      || asTrimmedString(hydratedProjectFolder) !== asTrimmedString(projectFolder)
      || asTrimmedString(hydratedPermissionMode) !== asTrimmedString(permissionMode)
    )
    if (!needsHydration) return
    void hydratePanel({ projectFolder, permissionMode })
  }, [
    hydratePanel,
    hydratedPermissionMode,
    hydratedProjectFolder,
    permissionMode,
    projectFolder,
    runtimeStatus,
  ])

  React.useEffect(() => {
    if (!selectedSession?.id) return
    void ensureSessionConnected(selectedSession.id)
  }, [ensureSessionConnected, selectedSession?.id])

  React.useEffect(() => {
    if (!dragState) return undefined
    const onPointerMove = (event) => {
      const delta = Number(dragState.startY || 0) - Number(event.clientY || 0)
      const nextHeight = Math.max(MIN_DOCK_HEIGHT, Math.min(MAX_DOCK_HEIGHT, Number(dragState.startHeight || DEFAULT_DOCK_HEIGHT) + delta))
      setTerminalDockState({ height: nextHeight }, { threadId: activeThreadId })
    }
    const onPointerUp = () => setDragState(null)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [activeThreadId, dragState, setTerminalDockState])

  const handleSelectTab = React.useCallback((tab) => {
    if (!tab) return
    setTerminalDockState({ collapsed: false }, { threadId: activeThreadId })
    setTerminalDockSelectedTab(tab.id, { threadId: activeThreadId })
    if (tab.kind === 'session') {
      setActiveSessionId(tab.id)
      void requestSessionSurfaceFocus(tab.id, 'chat_dock')
      requestViewportFocus('chat_terminal_compact')
    }
  }, [activeThreadId, requestSessionSurfaceFocus, requestViewportFocus, setActiveSessionId, setTerminalDockSelectedTab, setTerminalDockState])

  const handleResizeKeyDown = React.useCallback((event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const delta = event.key === 'ArrowUp' ? 24 : -24
    setTerminalDockState({
      height: Math.max(MIN_DOCK_HEIGHT, Math.min(MAX_DOCK_HEIGHT, dockHeight + delta)),
    }, { threadId: activeThreadId })
  }, [activeThreadId, dockHeight, setTerminalDockState])

  const confirmTakeover = React.useCallback(async () => {
    if (!selectedSession?.id) return
    const ok = await takeOverSession(selectedSession.id)
    if (!ok) return
    setPendingTakeoverSessionId('')
    setAnnouncement(labels.userTakeoverActiveAnnouncement)
    void requestSessionSurfaceFocus(selectedSession.id, 'chat_dock')
    requestViewportFocus('chat_terminal_compact')
  }, [labels.userTakeoverActiveAnnouncement, requestSessionSurfaceFocus, requestViewportFocus, selectedSession?.id, takeOverSession])

  const handleViewportInput = React.useCallback(async (sessionId, data) => {
    const session = selectedSession && selectedSession.id === sessionId ? selectedSession : null
    if (!session) return false
    if (session.controlOwner !== 'user') {
      setPendingTakeoverSessionId(sessionId)
      setAnnouncement(labels.takeoverRequiredAnnouncement)
      return false
    }
    return writeInput(sessionId, data)
  }, [labels.takeoverRequiredAnnouncement, selectedSession, writeInput])

  const handleClose = React.useCallback(async (sessionId = '') => {
    const targetSessionId = asTrimmedString(sessionId || selectedSession?.id)
    if (!targetSessionId) return
    await closeSession(targetSessionId)
  }, [closeSession, selectedSession])

  const handleTerminate = React.useCallback(async () => {
    if (!selectedSession?.id) return
    const hostScoped = selectedSession.scope === 'host'
    const confirmed = await requestAppConfirm({
      title: hostScoped ? labels.forceTerminateHostTitle : labels.forceTerminateTitle,
      message: hostScoped
        ? labels.forceTerminateHostMessage
        : labels.forceTerminateMessage,
      confirmLabel: labels.forceTerminate,
      cancelLabel: labels.cancel,
      tone: 'danger',
    })
    if (!confirmed) return
    await terminateSession(selectedSession.id)
  }, [labels.cancel, labels.forceTerminate, labels.forceTerminateHostMessage, labels.forceTerminateHostTitle, labels.forceTerminateMessage, labels.forceTerminateTitle, selectedSession, terminateSession])

  const {
    currentThreadBrowserEntries,
    otherLiveBrowserEntries,
    historyBrowserEntries,
  } = React.useMemo(() => buildBrowserSessionEntries({
    tabs,
    sessions,
    archivedSessions,
    threads,
    activeThreadId,
    labels: buildTerminalDockBrowserEntryLabels(t, labels),
  }), [activeThreadId, archivedSessions, labels, sessions, tabs, t, threads])

  const browserSections = React.useMemo(() => ([
    { key: 'current_thread', label: labels.currentThread, count: currentThreadBrowserEntries.length },
    { key: 'other_live', label: labels.otherLive, count: otherLiveBrowserEntries.length },
    { key: 'history', label: labels.history, count: historyBrowserEntries.length },
  ]), [currentThreadBrowserEntries.length, historyBrowserEntries.length, labels.currentThread, labels.history, labels.otherLive, otherLiveBrowserEntries.length])

  const browserEntriesBySection = React.useMemo(() => ({
    current_thread: currentThreadBrowserEntries,
    other_live: otherLiveBrowserEntries,
    history: historyBrowserEntries,
  }), [currentThreadBrowserEntries, historyBrowserEntries, otherLiveBrowserEntries])

  const browserSectionEntries = browserEntriesBySection[browserSection] || []
  const resolvedBrowserSelectionId = (
    browserSectionEntries.some((entry) => entry.selectionId === browserSelectionSessionId)
      ? browserSelectionSessionId
      : asTrimmedString(browserSectionEntries[0]?.selectionId)
  )
  const selectedBrowserEntry = browserSectionEntries.find((entry) => entry.selectionId === resolvedBrowserSelectionId) || null
  const selectedArchivedBrowserSession = selectedBrowserEntry?.kind === 'archived'
    ? (archivedSessions.find((entry) => asTrimmedString(entry?.sessionId) === resolvedBrowserSelectionId) || selectedBrowserEntry.archive || null)
    : null
  const selectedBrowserSession = selectedBrowserEntry?.kind === 'session'
    ? selectedBrowserEntry.session
    : null
  const selectedBrowserThreadId = asTrimmedString(
    selectedBrowserSession?.threadId
    || selectedArchivedBrowserSession?.threadId
    || selectedBrowserEntry?.approval?.threadId,
  )
  const showBrowserOpenThreadAction = !!selectedBrowserThreadId && selectedBrowserThreadId !== asTrimmedString(activeThreadId)
  const hasDockContent = (
    tabs.length > 0
    || browserOpen
    || otherLiveBrowserEntries.length > 0
    || historyBrowserEntries.length > 0
    || runtimeStatus !== 'supported'
    || !!actionError
  )

  const handleToggleBrowser = React.useCallback((nextOpen) => {
    const shouldOpen = nextOpen !== undefined ? nextOpen === true : browserOpen !== true
    const nextSection = browserSection || 'current_thread'
    const nextEntries = browserEntriesBySection[nextSection] || []
    const nextSelectionId = asTrimmedString(nextEntries[0]?.selectionId)
    setTerminalDockState({
      collapsed: shouldOpen ? false : collapsed,
      browserOpen: shouldOpen,
      browserSection: nextSection,
      browserSelectionSessionId: shouldOpen
        ? (browserSelectionSessionId || nextSelectionId)
        : browserSelectionSessionId,
    }, { threadId: activeThreadId })
  }, [
    activeThreadId,
    browserEntriesBySection,
    browserOpen,
    browserSection,
    browserSelectionSessionId,
    collapsed,
    setTerminalDockState,
  ])

  const handleSelectBrowserSection = React.useCallback((sectionKey = 'current_thread') => {
    const nextSection = sectionKey === 'other_live' || sectionKey === 'history' ? sectionKey : 'current_thread'
    const nextEntries = browserEntriesBySection[nextSection] || []
    const nextSelectionId = asTrimmedString(nextEntries[0]?.selectionId)
    setTerminalDockState({
      browserOpen: true,
      browserSection: nextSection,
      browserSelectionSessionId: nextSelectionId,
      collapsed: false,
    }, { threadId: activeThreadId })
  }, [activeThreadId, browserEntriesBySection, setTerminalDockState])

  const handleSelectBrowserEntry = React.useCallback((entry = null) => {
    if (!entry) return
    setTerminalDockState({
      browserOpen: true,
      browserSection: entry.section,
      browserSelectionSessionId: entry.selectionId,
      collapsed: false,
    }, { threadId: activeThreadId })
    if (entry.section === 'current_thread' && entry.kind === 'session' && entry.session?.id) {
      setTerminalDockSelectedTab(entry.session.id, { threadId: activeThreadId })
      setActiveSessionId(entry.session.id)
    }
    if (entry.section === 'history' && entry.kind === 'archived' && entry.selectionId) {
      void selectArchivedSession(entry.selectionId)
    }
  }, [activeThreadId, selectArchivedSession, setActiveSessionId, setTerminalDockSelectedTab, setTerminalDockState])

  const handleOpenOwningThread = React.useCallback(async (threadId = '') => {
    const normalizedThreadId = asTrimmedString(threadId)
    if (!normalizedThreadId) return
    setTerminalDockState({ browserOpen: false }, { threadId: activeThreadId })
    const terminalNavigation = selectedBrowserEntry?.kind === 'session'
      ? {
          terminal: {
            selectedTabId: selectedBrowserEntry.session?.id,
            activeSessionId: selectedBrowserEntry.session?.id,
            focusMode: 'compact',
          },
        }
      : (selectedBrowserEntry?.kind === 'archived'
          ? {
              terminal: {
                browserOpen: true,
                browserSection: 'history',
                browserSelectionSessionId: selectedBrowserEntry.archive?.sessionId || selectedBrowserEntry.selectionId,
                archivedSessionId: selectedBrowserEntry.archive?.sessionId || selectedBrowserEntry.selectionId,
                focusMode: 'browser',
              },
            }
          : {})
    await openThreadInChat?.(normalizedThreadId, terminalNavigation)
  }, [activeThreadId, openThreadInChat, selectedBrowserEntry, setTerminalDockState])

  const handleDeleteArchivedBrowserSession = React.useCallback(async (sessionId = '') => {
    const normalizedSessionId = asTrimmedString(sessionId)
    if (!normalizedSessionId) return false
    const confirmed = typeof window === 'undefined'
      ? true
      : await requestAppConfirm({
        title: labels.deleteArchiveTitle,
        message: labels.deleteArchiveMessage,
        confirmLabel: labels.deleteArchiveConfirm,
        cancelLabel: labels.cancel,
        tone: 'danger',
      })
    if (!confirmed) return false
    return deleteArchivedSession(normalizedSessionId)
  }, [deleteArchivedSession, labels.cancel, labels.deleteArchiveConfirm, labels.deleteArchiveMessage, labels.deleteArchiveTitle])

  const handleOpenTerminal = React.useCallback(async () => {
    if (!activeThreadId || !projectFolder) return
    await openThreadTerminal({
      threadId: activeThreadId,
      projectFolder,
      permissionMode,
      launchContext: {
        editorCwd,
        sessionCwd: selectedSession?.cwd,
      },
      telemetrySource: 'chat_terminal_dock',
    })
  }, [activeThreadId, editorCwd, openThreadTerminal, permissionMode, projectFolder, selectedSession?.cwd])

  const handleOpenNewTerminal = React.useCallback(async ({
    cwd = '',
    shell = '',
    telemetrySource = 'chat_terminal_dock',
  } = {}) => {
    if (!activeThreadId || !projectFolder) return
    await openNewThreadTerminal({
      threadId: activeThreadId,
      projectFolder,
      cwd: asTrimmedString(cwd),
      shell,
      permissionMode,
      launchContext: {
        editorCwd,
        sessionCwd: selectedSession?.cwd,
      },
      telemetrySource,
    })
  }, [activeThreadId, editorCwd, openNewThreadTerminal, permissionMode, projectFolder, selectedSession?.cwd])

  const handleRenameSession = React.useCallback(async (nextTitle = '') => {
    if (!selectedSession?.id) return
    await renameSession(selectedSession.id, nextTitle)
  }, [renameSession, selectedSession])

  const handleDuplicateSession = React.useCallback(async () => {
    if (!selectedSession?.id) return
    await duplicateSession(selectedSession.id, {
      threadId: activeThreadId,
      projectFolder,
      permissionMode,
    })
  }, [activeThreadId, duplicateSession, permissionMode, projectFolder, selectedSession?.id])

  const handleSwitchSession = React.useCallback(async (direction = 'next') => {
    await switchThreadSession({
      threadId: activeThreadId,
      direction,
      surface: 'chat_dock',
    })
  }, [activeThreadId, switchThreadSession])

  React.useEffect(() => {
    if (!browserOpen || !selectedBrowserEntry) return
    if (selectedBrowserEntry.kind === 'session' && selectedBrowserEntry.section === 'current_thread' && selectedBrowserSession?.id) {
      void ensureSessionConnected(selectedBrowserSession.id)
      return
    }
    if (selectedBrowserEntry.kind === 'archived' && resolvedBrowserSelectionId && activeArchivedSessionId !== resolvedBrowserSelectionId) {
      void selectArchivedSession(resolvedBrowserSelectionId)
    }
  }, [
    activeArchivedSessionId,
    browserOpen,
    ensureSessionConnected,
    resolvedBrowserSelectionId,
    selectArchivedSession,
    selectedBrowserEntry,
    selectedBrowserSession?.id,
  ])

  if (!hasDockContent) return null
  if (collapsed) return null

  const rawOutput = selectedSession?.id
    ? asTrimmedString(rawOutputBySessionId?.[selectedSession.id]?.rawOutput)
    : ''
  const outputTruncated = selectedSession?.id
    ? rawOutputBySessionId?.[selectedSession.id]?.truncated === true
    : false
  const stateLabel = getTabStateLabel(selectedTab, { labels })
  const priority = getTabPriority(selectedTab)
  const selectedPanelId = selectedTab ? getDockPanelDomId(selectedTab.id) : undefined
  const selectedIdentityLabel = asTrimmedString(
    showTabs
      ? selectedTab?.label
      : (selectedTab?.baseLabel || selectedTab?.label),
  ) || labels.terminal
  const selectedIdentityDetail = getSelectedTabDetail(selectedTab)
  const sessionOwnedByUser = selectedSession?.takeoverState === 'user_takeover' || selectedSession?.controlOwner === 'user'
  const sessionOwnedByModel = selectedSession?.controlOwner === 'model'
  const pendingTakeover = pendingTakeoverSessionId === selectedSession?.id
  const lifecycleState = asTrimmedString(selectedSession?.lifecycleState || selectedSession?.status).toLowerCase()
  const controlActionsBlocked = !!selectedSession && (
    selectedSession?.approvalState === 'denied'
    || asTrimmedString(selectedSession?.failureReason).length > 0
    || ['closing', 'ended', 'exited', 'closed'].includes(lifecycleState)
  )
  const showHandBackAction = !!selectedSession && sessionOwnedByUser && !controlActionsBlocked
  const showTakeOverAction = !!selectedSession && sessionOwnedByModel && !controlActionsBlocked
  const controlBoundaryMessage = sessionOwnedByModel
    ? labels.aiControlsShell
    : (sessionOwnedByUser ? labels.userControlsShell : '')
  const canExplainControlState = (
    !!selectedSession
    && (
      showTakeOverAction
      || showHandBackAction
      || selectedSession?.pendingAiControlRequest === true
      || pendingTakeover
    )
  )
  const controlDetailMessage = pendingTakeover
    ? labels.typingBlockedUntilTakeover
    : (selectedSession?.pendingAiControlRequest === true
        ? labels.aiWaitingForUser
        : controlBoundaryMessage)
  const resolvedActionNotice = actionNotice || (
    sessionOwnedByUser
      ? {
          tone: 'success',
          message: 'Takeover active. Keyboard input now goes to this session.',
        }
      : null
  )
  const showCompactSessionChrome = !browserOpen && !!selectedTab
  const browserHeight = Math.max(dockHeight, 360)
  const selectedBrowserRawOutput = selectedBrowserSession?.id
    ? asTrimmedString(rawOutputBySessionId?.[selectedBrowserSession.id]?.rawOutput)
    : ''
  const selectedBrowserOutputTruncated = selectedBrowserSession?.id
    ? rawOutputBySessionId?.[selectedBrowserSession.id]?.truncated === true
    : (selectedArchivedBrowserSession?.outputTruncated === true)
  const archiveSaveAction = getArchiveSaveActionState(
    selectedArchivedBrowserSession,
    archiveMemoryActionPendingBySessionId?.[selectedArchivedBrowserSession?.sessionId] === true,
  )
  const shellChoices = getTerminalShellChoices(runtimeHealth)

  return (
    <section
      className="mt-2 overflow-visible rounded-t-xl bg-surface-panel shadow-[0_-8px_28px_rgb(var(--theme-shadow-rgb)_/_0.22)]"
      data-ui="chat-terminal-dock"
    >
      <DockAnnouncement message={announcement} />
      <div className="relative px-3 pb-2 pt-2.5">
        <div
          role="separator"
          tabIndex={0}
          aria-label={labels.resizeDock}
          aria-orientation="horizontal"
          onKeyDown={handleResizeKeyDown}
          onPointerDown={(event) => {
            setDragState({
              startY: Number(event.clientY || 0),
              startHeight: dockHeight,
            })
          }}
          className="group absolute inset-x-0 top-0 z-10 mx-auto flex h-3 w-full max-w-md cursor-row-resize touch-none items-start justify-center"
        >
          <div aria-hidden="true" className="mt-[2px] h-[3px] w-12 rounded-full bg-surface-border/40 transition-colors group-hover:bg-text-tertiary/60" />
        </div>
        <div className="relative z-20 flex items-start justify-between gap-3">
          <ChatTerminalDockTitleArea
            browserOpen={browserOpen}
            browserSection={browserSection}
            labels={labels}
            selectedTab={selectedTab}
            showTabs={showTabs}
            tabs={tabs}
            resolvedSelectedTabId={resolvedSelectedTabId}
            selectedIdentityLabel={selectedIdentityLabel}
            selectedIdentityDetail={selectedIdentityDetail}
            onSelectTab={handleSelectTab}
          />
          <ChatTerminalDockToolbar
            activeThreadId={activeThreadId}
            browserOpen={browserOpen}
            canExplainControlState={canExplainControlState}
            collapsed={collapsed}
            controlDetailMessage={controlDetailMessage}
            labels={labels}
            pendingTakeover={pendingTakeover}
            priority={priority}
            projectFolder={projectFolder}
            selectedSession={selectedSession}
            showCompactSessionChrome={showCompactSessionChrome}
            showHandBackAction={showHandBackAction}
            showTakeOverAction={showTakeOverAction}
            stateLabel={stateLabel}
            onCloseSession={handleClose}
            onConfirmTakeover={confirmTakeover}
            onDuplicateSession={handleDuplicateSession}
            onHandBackSession={(sessionId) => handBackSession(sessionId)}
            onHideTerminal={() => {
              setTerminalDockState({ collapsed: true }, { threadId: activeThreadId })
              recordTelemetryEvent('dock_visibility', {
                threadId: activeThreadId,
                collapsed: true,
              })
            }}
            onInterruptSession={(sessionId) => interruptSession(sessionId)}
            onOpenTerminal={handleOpenTerminal}
            onOpenTerminalAtEditorCwd={editorCwd ? () => handleOpenNewTerminal({
              cwd: editorCwd,
              telemetrySource: 'chat_terminal_editor_cwd',
            }) : null}
            onOpenTerminalAtProjectRoot={() => handleOpenNewTerminal({
              cwd: projectFolder,
              telemetrySource: 'chat_terminal_project_root',
            })}
            onOpenTerminalAtSessionCwd={selectedSession?.cwd ? () => handleOpenNewTerminal({
              cwd: selectedSession.cwd,
              telemetrySource: 'chat_terminal_session_cwd',
            }) : null}
            onOpenTerminalWithShell={(shell) => handleOpenNewTerminal({
              cwd: projectFolder,
              shell,
              telemetrySource: `chat_terminal_shell_${shell}`,
            })}
            onRenameSession={handleRenameSession}
            onTerminateSession={handleTerminate}
            onToggleBrowser={handleToggleBrowser}
            onToggleCollapsed={(nextCollapsed) => setTerminalDockState({ collapsed: nextCollapsed }, { threadId: activeThreadId })}
            shellChoices={shellChoices}
          />
        </div>
      </div>

      {!collapsed && (
        <div
          style={{ height: `${browserOpen ? browserHeight : dockHeight}px` }}
          className="min-h-0"
        >
          {browserOpen ? (
            <ChatTerminalDockBrowser
              runtimeHealth={runtimeHealth}
              runtimeStatus={runtimeStatus}
              actionError={actionError}
              actionNotice={actionNotice}
              browserHeight={browserHeight}
              browserSections={browserSections}
              browserSection={browserSection}
              browserSectionEntries={browserSectionEntries}
              resolvedBrowserSelectionId={resolvedBrowserSelectionId}
              onSelectBrowserSection={handleSelectBrowserSection}
              onSelectBrowserEntry={handleSelectBrowserEntry}
              selectedBrowserEntry={selectedBrowserEntry}
              selectedBrowserThreadId={selectedBrowserThreadId}
              selectedBrowserSession={selectedBrowserSession}
              selectedArchivedBrowserSession={selectedArchivedBrowserSession}
              selectedBrowserRawOutput={selectedBrowserRawOutput}
              selectedBrowserOutputTruncated={selectedBrowserOutputTruncated}
              threads={threads}
              showBrowserOpenThreadAction={showBrowserOpenThreadAction}
              onOpenOwningThread={handleOpenOwningThread}
              archiveSaveAction={archiveSaveAction}
              saveArchivedSessionToMemory={saveArchivedSessionToMemory}
              archiveDeletePendingBySessionId={archiveDeletePendingBySessionId}
              onDeleteArchivedBrowserSession={handleDeleteArchivedBrowserSession}
              focusRequestKeyByMode={focusRequestKeyByMode}
              onViewportInput={handleViewportInput}
              onResizeSession={resizeSession}
              onRequestSessionSurfaceFocus={requestSessionSurfaceFocus}
              onSetViewportMetricsForMode={setViewportMetricsForMode}
              onOpenNewTerminal={handleOpenNewTerminal}
              onCloseCurrentSession={handleClose}
              onSwitchSession={handleSwitchSession}
            />
          ) : (
            <>
              {selectedTab?.kind === 'pending' && (
                <div
                  id={selectedPanelId}
                  role="tabpanel"
                  aria-labelledby={getDockTabDomId(selectedTab.id)}
                  className="h-full"
                >
                  <PendingApprovalViewport approval={selectedTab.approval} />
                </div>
              )}
              {selectedSession && (
                <div
                  id={selectedPanelId}
                  role="tabpanel"
                  aria-labelledby={getDockTabDomId(selectedSession.id)}
                  className="flex h-full min-h-0 flex-col"
                >
                  {(actionError || resolvedActionNotice || runtimeStatus !== 'supported') && (
                    <div className="shrink-0 px-3 pb-1 pt-1">
                      <TerminalStatusBanner runtimeHealth={runtimeHealth} actionError={actionError} actionNotice={resolvedActionNotice} />
                    </div>
                  )}
                  <div className="relative min-h-0 flex-1">
                    <TerminalViewport
                      runtimeHealth={runtimeHealth}
                      session={selectedSession}
                      modelSessionId=""
                      surfaceKey="chat_dock"
                      rawOutput={rawOutput}
                      outputTruncated={outputTruncated}
                      focusRequestKey={Number(focusRequestKeyByMode?.chat_terminal_compact || 0)}
                      onInput={handleViewportInput}
                      onResize={resizeSession}
                      onRequestSurfaceFocus={(sessionId) => requestSessionSurfaceFocus(sessionId, 'chat_dock')}
                      onMetricsChange={(metrics) => setViewportMetricsForMode('chat_terminal_compact', metrics)}
                      onNewTerminalRequest={() => handleOpenNewTerminal({
                        telemetrySource: 'terminal_shortcut',
                      })}
                      onCloseTerminalRequest={handleClose}
                      onSwitchPreviousSessionRequest={() => handleSwitchSession('previous')}
                      onSwitchNextSessionRequest={() => handleSwitchSession('next')}
                    />
                  </div>
                </div>
              )}
              {!selectedTab && (
                <div className="flex h-full items-center justify-center px-6 py-8">
                  <div className="max-w-xs text-center">
                    <TerminalStatusBanner runtimeHealth={runtimeHealth} actionError={actionError} actionNotice={actionNotice} />
                    <p className={`text-sm font-semibold text-text-primary ${actionError || runtimeStatus !== 'supported' ? 'mt-3' : ''}`}>
                      {labels.terminalSessions}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleToggleBrowser(true)}
                      className="mt-3 inline-flex h-7 items-center justify-center rounded-md px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-panel-alt hover:text-text-primary"
                    >
                      {labels.browseSessions}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default function ChatTerminalDock(props) {
  return <ChatTerminalDockInner {...props} />
}

export { ChatTerminalGlobalIndicator }
