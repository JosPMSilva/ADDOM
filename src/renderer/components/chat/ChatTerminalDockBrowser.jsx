import React from 'react'

import { useRendererFormattingLocale } from '../../i18n/formatters.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import TerminalStatusBanner from '../terminal/TerminalStatusBanner.jsx'
import TerminalViewport from '../terminal/TerminalViewport.jsx'
import { useTerminalOutputActions } from '../terminal/use-terminal-output-actions.mjs'
import {
  getTerminalArchiveOutputText,
  getTerminalArchiveSuggestionLabel,
  getTerminalExactTimestampLabel,
  getTerminalScopeLabel,
} from '../terminal/terminal-session-display.mjs'
import Icon from '../ui/Icon.jsx'
import { MenuRow, MenuSurface } from '../ui/MenuSurface.jsx'
import { PendingApprovalViewport } from './ChatTerminalDockPendingApproval.jsx'
import { getThreadTitle } from './chat-terminal-dock-utils.mjs'

function buildTerminalDockBrowserLabels(t) {
  return {
    currentThread: t('core:terminal.dock.browser.sections.currentThread', { defaultValue: 'Current Thread' }),
    otherLive: t('core:terminal.dock.browser.sections.otherLive', { defaultValue: 'Other Live' }),
    history: t('core:terminal.dock.browser.sections.history', { defaultValue: 'History' }),
    emptyCurrentThread: t('core:terminal.dock.browser.empty.currentThread', {
      defaultValue: 'No live or pending terminal sessions are attached to this thread yet.',
    }),
    emptyOtherLive: t('core:terminal.dock.browser.empty.otherLive', {
      defaultValue: 'No other threads have live terminal activity right now.',
    }),
    emptyHistory: t('core:terminal.dock.browser.empty.history', {
      defaultValue: 'No archived terminal history is available for this workspace yet.',
    }),
    openThread: t('core:terminal.dock.browser.actions.openThread', { defaultValue: 'Open thread' }),
    saveToThreadMemory: t('core:terminal.dock.browser.actions.saveToThreadMemory', { defaultValue: 'Save to thread memory' }),
    saveToProjectMemory: t('core:terminal.dock.browser.actions.saveToProjectMemory', { defaultValue: 'Save to project memory' }),
    sendOutputToChat: t('core:terminal.dock.browser.actions.sendOutputToChat', { defaultValue: 'Send output to chat' }),
    explainLastError: t('core:terminal.dock.browser.actions.explainLastError', { defaultValue: 'Explain last error' }),
    summarizeSession: t('core:terminal.dock.browser.actions.summarizeSession', { defaultValue: 'Summarize session' }),
    saveSnapshotToMemory: t('core:terminal.dock.browser.actions.saveSnapshotToMemory', { defaultValue: 'Save snapshot to Memory' }),
    deletingArchive: t('core:terminal.dock.browser.actions.deletingArchive', { defaultValue: 'Deleting...' }),
    deleteArchive: t('core:terminal.dock.browser.actions.deleteArchive', { defaultValue: 'Delete archive' }),
    terminalActions: t('core:terminal.viewport.aria.terminalActions', { defaultValue: 'Terminal actions' }),
    readOnly: t('core:terminal.viewport.readOnly', { defaultValue: 'Read-only' }),
    trimmed: t('core:terminal.viewport.trimmed', { defaultValue: 'Trimmed' }),
    crossThreadTitle: t('core:terminal.dock.browser.crossThread.title', { defaultValue: 'Cross-thread session' }),
    crossThreadDescription: t('core:terminal.dock.browser.crossThread.description', {
      defaultValue: 'Browse the metadata here, then use {{openThreadLabel}} to inspect or interact from the owning chat thread.',
      openThreadLabel: t('core:terminal.dock.browser.actions.openThread', { defaultValue: 'Open thread' }),
    }),
    selectSession: t('core:terminal.dock.browser.selectSession', { defaultValue: 'Select a terminal session' }),
    workspaceRoot: t('core:terminal.dock.workspaceRoot', { defaultValue: 'workspace root' }),
    requestedIn: t('core:terminal.dock.browser.requestedIn', {
      defaultValue: 'Requested in {{section}}',
      section: t('core:terminal.dock.browser.sections.currentThread', { defaultValue: 'Current Thread' }),
    }),
    terminalSessionLabels: {
      user: t('core:terminal.common.user', { defaultValue: 'User' }),
      ai: t('core:terminal.common.ai', { defaultValue: 'AI' }),
      session: t('core:terminal.common.session', { defaultValue: 'Session' }),
      host: t('core:terminal.common.host', { defaultValue: 'Host' }),
      workspace: t('core:terminal.common.workspace', { defaultValue: 'Workspace' }),
      shell: t('core:terminal.common.shell', { defaultValue: 'shell' }),
      terminal: t('core:terminal.common.terminal', { defaultValue: 'terminal' }),
      threadPrefix: t('core:terminal.common.threadPrefix', { defaultValue: 'Thread' }),
      closing: t('core:terminal.common.status.closing', { defaultValue: 'Closing' }),
      ended: t('core:terminal.common.status.ended', { defaultValue: 'Ended' }),
      closed: t('core:terminal.common.status.closed', { defaultValue: 'Closed' }),
      live: t('core:terminal.common.status.live', { defaultValue: 'Live' }),
      failed: t('core:terminal.common.status.failed', { defaultValue: 'Failed' }),
      terminated: t('core:terminal.common.status.terminated', { defaultValue: 'Terminated' }),
      closedPrefix: t('core:terminal.common.timestamp.closedPrefix', { defaultValue: 'Closed' }),
      startedPrefix: t('core:terminal.common.timestamp.startedPrefix', { defaultValue: 'Started' }),
      savedToMemory: t('core:terminal.dock.browser.actions.savedToMemory', { defaultValue: 'Saved to Memory' }),
      dismissed: t('core:terminal.common.suggestion.dismissed', { defaultValue: 'Dismissed' }),
      suggested: t('core:terminal.common.suggestion.suggested', { defaultValue: 'Suggested' }),
      noSuggestion: t('core:terminal.common.suggestion.none', { defaultValue: 'No suggestion' }),
    },
    dockStateLabels: {
      terminal: t('core:terminal.common.terminalTitle', { defaultValue: 'Terminal' }),
      approval: t('core:terminal.dock.state.approval', { defaultValue: 'Approval' }),
      approvalSuffix: t('core:terminal.dock.state.approvalSuffix', { defaultValue: 'approval' }),
      denied: t('core:terminal.dock.state.denied', { defaultValue: 'Denied' }),
      failed: t('core:terminal.common.status.failed', { defaultValue: 'Failed' }),
      closing: t('core:terminal.common.status.closing', { defaultValue: 'Closing' }),
      ended: t('core:terminal.common.status.ended', { defaultValue: 'Ended' }),
      userTakeover: t('core:terminal.dock.state.userTakeover', { defaultValue: 'User takeover' }),
      aiWaiting: t('core:terminal.dock.state.aiWaiting', { defaultValue: 'AI waiting' }),
      aiControlling: t('core:terminal.dock.state.aiControlling', { defaultValue: 'AI controlling' }),
      running: t('core:terminal.dock.state.running', { defaultValue: 'Running' }),
      currentThread: t('core:terminal.dock.browser.sections.currentThread', { defaultValue: 'Current Thread' }),
      otherLive: t('core:terminal.dock.browser.sections.otherLive', { defaultValue: 'Other Live' }),
      history: t('core:terminal.dock.browser.sections.history', { defaultValue: 'History' }),
    },
  }
}

function BrowserSectionButton({
  active = false,
  label = '',
  count = 0,
  onClick = null,
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.()}
      className={[
        'flex shrink-0 items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors md:w-full',
        active
          ? 'bg-surface-panel/70 text-text-primary'
          : 'text-text-secondary hover:bg-surface-panel/45 hover:text-text-primary',
      ].join(' ')}
      aria-pressed={active ? 'true' : 'false'}
    >
      <span className="text-xs font-medium">{label}</span>
      {count > 0 && <span className="font-mono text-[11px] tabular-nums text-text-tertiary">{count}</span>}
    </button>
  )
}

function BrowserEntryRow({
  entry = null,
  active = false,
  onClick = null,
}) {
  if (!entry) return null
  return (
    <button
      type="button"
      onClick={() => onClick?.(entry)}
      title={[entry.label, entry.detail, entry.meta].filter(Boolean).join(' · ')}
      className={[
        'w-full rounded-md px-2.5 py-2 text-left transition-colors',
        active
          ? 'bg-surface-panel/70'
          : 'hover:bg-surface-panel/45',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text-primary">{entry.label}</p>
          {entry.detail && (
            <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{entry.detail}</p>
          )}
        </div>
        {entry.stateLabel && (
          <span className="shrink-0 text-[11px] text-text-tertiary">{entry.stateLabel}</span>
        )}
      </div>
    </button>
  )
}

function BrowserActionsMenu({ label = '', items = [] }) {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef(null)
  const triggerRef = React.useRef(null)
  const menuRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return undefined
    menuRef.current?.querySelector('button:not([disabled])')?.focus()
    const closeMenu = (event) => {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape') return
        setOpen(false)
        triggerRef.current?.focus()
      } else if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('focusin', closeMenu)
    document.addEventListener('keydown', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('focusin', closeMenu)
      document.removeEventListener('keydown', closeMenu)
    }
  }, [open])

  if (items.length === 0) return null
  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-panel/60 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="dots-three-vertical" className="text-[15px]" />
      </button>
      {open && (
        <div ref={menuRef} className="absolute right-0 top-[calc(100%+4px)] z-40 min-w-44">
          <MenuSurface
            role="menu"
            aria-label={label}
            className="max-h-[min(50vh,20rem)] overflow-y-auto"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
              const buttons = Array.from(menuRef.current?.querySelectorAll('button:not([disabled])') || [])
              if (buttons.length === 0) return
              event.preventDefault()
              const index = buttons.indexOf(document.activeElement)
              const delta = event.key === 'ArrowDown' ? 1 : -1
              const nextIndex = index < 0
                ? (delta > 0 ? 0 : buttons.length - 1)
                : (index + delta + buttons.length) % buttons.length
              buttons[nextIndex]?.focus()
            }}
          >
            {items.map((item) => (
              <MenuRow
                key={item.id}
                role="menuitem"
                danger={item.danger === true}
                disabled={item.disabled === true}
                onClick={() => {
                  setOpen(false)
                  triggerRef.current?.focus()
                  void item.onSelect?.()
                }}
              >
                {item.label}
              </MenuRow>
            ))}
          </MenuSurface>
        </div>
      )}
    </div>
  )
}

export default function ChatTerminalDockBrowser({
  runtimeHealth = null,
  runtimeStatus = '',
  actionError = '',
  browserHeight = 360,
  browserSections = [],
  browserSection = 'current_thread',
  browserSectionEntries = [],
  resolvedBrowserSelectionId = '',
  onSelectBrowserSection = null,
  onSelectBrowserEntry = null,
  selectedBrowserEntry = null,
  selectedBrowserThreadId = '',
  selectedBrowserSession = null,
  selectedArchivedBrowserSession = null,
  selectedBrowserRawOutput = '',
  selectedBrowserOutputTruncated = false,
  threads = [],
  showBrowserOpenThreadAction = false,
  onOpenOwningThread = null,
  archiveSaveAction = null,
  saveArchivedSessionToMemory = null,
  archiveDeletePendingBySessionId = {},
  onDeleteArchivedBrowserSession = null,
  focusRequestKeyByMode = {},
  onViewportInput = null,
  onResizeSession = null,
  onRequestSessionSurfaceFocus = null,
  onSetViewportMetricsForMode = null,
  onOpenNewTerminal = null,
  onCloseCurrentSession = null,
  onSwitchSession = null,
}) {
  const { t } = useRendererTranslation(['core'])
  const locale = useRendererFormattingLocale()
  const labels = React.useMemo(() => buildTerminalDockBrowserLabels(t), [t])
  const browserOutputActions = useTerminalOutputActions({
    session: selectedBrowserSession,
    rawOutput: selectedBrowserRawOutput,
    projectFolder: selectedBrowserSession?.project,
  })
  const browserMetadata = [
    getThreadTitle(threads, selectedBrowserThreadId),
    selectedBrowserSession
      ? getTerminalScopeLabel(selectedBrowserSession, { labels: labels.terminalSessionLabels })
      : (selectedArchivedBrowserSession
        ? getTerminalScopeLabel(selectedArchivedBrowserSession, { labels: labels.terminalSessionLabels })
        : ''),
    selectedBrowserSession
      ? getTerminalExactTimestampLabel(selectedBrowserSession?.updatedAt || selectedBrowserSession?.createdAt, { locale })
      : (selectedArchivedBrowserSession
        ? getTerminalExactTimestampLabel(selectedArchivedBrowserSession?.closedAt || selectedArchivedBrowserSession?.openedAt, { locale })
        : ''),
  ].filter(Boolean)
  const browserContext = [
    selectedBrowserSession?.cwd || selectedArchivedBrowserSession?.cwd || selectedBrowserEntry?.detail,
    ...browserMetadata,
  ].filter(Boolean)
  const browserActions = [
    ...(selectedBrowserSession && selectedBrowserEntry?.section === 'current_thread' && selectedBrowserRawOutput
      ? [
          { id: 'send-output', label: labels.sendOutputToChat, onSelect: () => browserOutputActions.sendOutputToChat() },
          { id: 'explain-error', label: labels.explainLastError, onSelect: () => browserOutputActions.explainLastError() },
          { id: 'summarize', label: labels.summarizeSession, onSelect: () => browserOutputActions.summarizeSession() },
          {
            id: 'save-snapshot',
            label: labels.saveSnapshotToMemory,
            disabled: browserOutputActions.memoryPending,
            onSelect: () => browserOutputActions.saveSnapshotToMemory(),
          },
        ]
      : []),
    ...(selectedArchivedBrowserSession && !archiveSaveAction?.missing && !archiveSaveAction?.saved
      ? [
          {
            id: 'save-thread',
            label: labels.saveToThreadMemory,
            disabled: archiveSaveAction?.disabled,
            onSelect: () => saveArchivedSessionToMemory?.(selectedArchivedBrowserSession.sessionId, { targetScope: 'thread' }),
          },
          {
            id: 'save-project',
            label: labels.saveToProjectMemory,
            disabled: archiveSaveAction?.disabled,
            onSelect: () => saveArchivedSessionToMemory?.(selectedArchivedBrowserSession.sessionId, { targetScope: 'project' }),
          },
        ]
      : []),
    ...(selectedArchivedBrowserSession
      ? [{
          id: 'delete-archive',
          label: archiveDeletePendingBySessionId?.[selectedArchivedBrowserSession.sessionId] === true
            ? labels.deletingArchive
            : labels.deleteArchive,
          danger: true,
          disabled: archiveDeletePendingBySessionId?.[selectedArchivedBrowserSession.sessionId] === true,
          onSelect: () => onDeleteArchivedBrowserSession?.(selectedArchivedBrowserSession.sessionId),
        }]
      : []),
  ]
  return (
    <div
      style={{ height: `${browserHeight}px` }}
      className="min-h-0"
    >
      <div className="flex h-full min-h-0 flex-col md:flex-row" data-ui="chat-terminal-browser">
        <aside className="flex w-full shrink-0 flex-col border-b border-surface-border/20 bg-surface-panel/12 md:w-[18.5rem] md:border-b-0 md:border-r">
          <div className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col md:overflow-x-visible">
            {browserSections.map((section) => (
              <BrowserSectionButton
                key={section.key}
                active={browserSection === section.key}
                label={section.label}
                count={section.count}
                onClick={() => onSelectBrowserSection?.(section.key)}
              />
            ))}
          </div>
          <div className="min-h-0 max-h-28 overflow-y-auto border-t border-surface-border/20 px-2 py-2 md:max-h-none md:flex-1">
            {browserSectionEntries.length > 0 ? (
              <div className="space-y-1">
                {browserSectionEntries.map((entry) => (
                  <BrowserEntryRow
                    key={`${entry.section}:${entry.selectionId}`}
                    entry={entry}
                    active={entry.selectionId === resolvedBrowserSelectionId}
                    onClick={onSelectBrowserEntry}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-surface-panel/30 px-3 py-4 text-xs text-text-secondary">
                {browserSection === 'current_thread'
                  ? labels.emptyCurrentThread
                  : browserSection === 'other_live'
                    ? labels.emptyOtherLive
                    : labels.emptyHistory}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-surface-border/20 px-3 py-2">
            <TerminalStatusBanner runtimeHealth={runtimeHealth} actionError={actionError} />
            {selectedBrowserEntry && (
              <div className={actionError || runtimeStatus !== 'supported' ? 'mt-2' : ''}>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 lg:flex-nowrap">
                  <p className="min-w-0 w-full truncate text-xs font-semibold text-text-primary lg:w-auto lg:flex-1" title={selectedBrowserEntry.label}>
                    {selectedBrowserEntry.label}
                  </p>
                  {selectedBrowserEntry.stateLabel && (
                    <span className="shrink-0 text-[11px] text-text-tertiary">{selectedBrowserEntry.stateLabel}</span>
                  )}
                  {selectedArchivedBrowserSession && (
                    <span className="shrink-0 text-[11px] text-text-tertiary">{labels.readOnly}</span>
                  )}
                  {selectedBrowserOutputTruncated && (
                    <span className="shrink-0 text-[11px] text-warning-soft">{labels.trimmed}</span>
                  )}
                  {showBrowserOpenThreadAction && (
                    <button
                      type="button"
                      onClick={() => void onOpenOwningThread?.(selectedBrowserThreadId)}
                      className="shrink-0 rounded px-1.5 py-1 text-[11px] text-text-secondary hover:bg-surface-panel/60 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
                    >
                      {labels.openThread}
                    </button>
                  )}
                  <BrowserActionsMenu key={selectedBrowserEntry.selectionId} label={labels.terminalActions} items={browserActions} />
                </div>
                {browserContext.length > 0 && (
                  <p
                    className="mt-0.5 truncate text-[11px] leading-4 text-text-tertiary"
                    title={browserContext.join(' · ')}
                    data-ui="chat-terminal-browser-metadata"
                  >
                    {browserContext.join(' · ')}
                  </p>
                )}
                {selectedArchivedBrowserSession?.memoryCandidateSummary && (
                  <p className="mt-1 truncate text-[11px] text-text-tertiary" title={selectedArchivedBrowserSession.memoryCandidateSummary}>
                    {getTerminalArchiveSuggestionLabel(selectedArchivedBrowserSession.memoryCandidateStatus, {
                      labels: labels.terminalSessionLabels,
                    })}
                    {`: ${selectedArchivedBrowserSession.memoryCandidateSummary}`}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1">
            {selectedBrowserEntry?.kind === 'pending' && (
              <PendingApprovalViewport approval={selectedBrowserEntry.approval} />
            )}

            {selectedBrowserEntry?.kind === 'session' && selectedBrowserEntry.section === 'current_thread' && selectedBrowserSession && (
              <div className="flex h-full min-h-0 flex-col">
                <div className="relative min-h-0 flex-1">
                  <TerminalViewport
                    runtimeHealth={runtimeHealth}
                    session={selectedBrowserSession}
                    modelSessionId=""
                    surfaceKey="chat_dock"
                    rawOutput={selectedBrowserRawOutput}
                    outputTruncated={selectedBrowserOutputTruncated}
                    focusRequestKey={Number(focusRequestKeyByMode?.chat_terminal_expanded || 0)}
                    onInput={onViewportInput}
                    onResize={onResizeSession}
                    onRequestSurfaceFocus={(sessionId) => onRequestSessionSurfaceFocus?.(sessionId, 'chat_dock')}
                    onMetricsChange={(metrics) => onSetViewportMetricsForMode?.('chat_terminal_expanded', metrics)}
                    onNewTerminalRequest={() => onOpenNewTerminal?.({
                      cwd: selectedBrowserSession?.cwd,
                      telemetrySource: 'terminal_browser_shortcut',
                    })}
                    onCloseTerminalRequest={onCloseCurrentSession}
                    onSwitchPreviousSessionRequest={() => onSwitchSession?.('previous')}
                    onSwitchNextSessionRequest={() => onSwitchSession?.('next')}
                  />
                </div>
              </div>
            )}

            {selectedBrowserEntry?.kind === 'session' && selectedBrowserEntry.section === 'other_live' && selectedBrowserSession && (
              <div className="flex h-full items-center justify-center px-6 py-8">
                <div className="max-w-md text-center">
                  <p className="text-sm font-semibold text-text-primary">{labels.crossThreadTitle}</p>
                  <p className="mt-2 text-sm text-text-secondary">
                    {labels.crossThreadDescription}
                  </p>
                </div>
              </div>
            )}

            {selectedBrowserEntry?.kind === 'archived' && selectedArchivedBrowserSession && (
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  <TerminalViewport
                    runtimeHealth={runtimeHealth}
                    session={selectedArchivedBrowserSession}
                    modelSessionId=""
                    surfaceKey="chat_dock"
                    hideChromeHeader
                    rawOutput={getTerminalArchiveOutputText(selectedArchivedBrowserSession)}
                    outputTruncated={selectedBrowserOutputTruncated}
                  />
                </div>
              </div>
            )}

            {!selectedBrowserEntry && (
              <div className="flex h-full items-center justify-center px-6 py-8">
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface-panel/40 text-text-tertiary">
                    <Icon name="terminal-window" className="text-[20px]" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary">{labels.selectSession}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
