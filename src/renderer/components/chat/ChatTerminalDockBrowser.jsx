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
import { PendingApprovalViewport } from './ChatTerminalDockPendingApproval.jsx'
import {
  getPriorityClasses,
  getPriorityIcon,
  getThreadTitle,
} from './chat-terminal-dock-utils.mjs'

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
    fieldThread: t('core:terminal.dock.browser.fields.thread', { defaultValue: 'Thread' }),
    fieldScope: t('core:terminal.dock.browser.fields.scope', { defaultValue: 'Scope' }),
    fieldUpdated: t('core:terminal.dock.browser.fields.updated', { defaultValue: 'Updated' }),
    openThread: t('core:terminal.dock.browser.actions.openThread', { defaultValue: 'Open thread' }),
    savedToMemory: t('core:terminal.dock.browser.actions.savedToMemory', { defaultValue: 'Saved to Memory' }),
    noMemorySummary: t('core:terminal.dock.browser.actions.noMemorySummary', { defaultValue: 'No Memory summary' }),
    saveToThreadMemory: t('core:terminal.dock.browser.actions.saveToThreadMemory', { defaultValue: 'Save to thread memory' }),
    saveToProjectMemory: t('core:terminal.dock.browser.actions.saveToProjectMemory', { defaultValue: 'Save to project memory' }),
    sendOutputToChat: t('core:terminal.dock.browser.actions.sendOutputToChat', { defaultValue: 'Send output to chat' }),
    explainLastError: t('core:terminal.dock.browser.actions.explainLastError', { defaultValue: 'Explain last error' }),
    summarizeSession: t('core:terminal.dock.browser.actions.summarizeSession', { defaultValue: 'Summarize session' }),
    saveSnapshotToMemory: t('core:terminal.dock.browser.actions.saveSnapshotToMemory', { defaultValue: 'Save snapshot to Memory' }),
    deletingArchive: t('core:terminal.dock.browser.actions.deletingArchive', { defaultValue: 'Deleting...' }),
    deleteArchive: t('core:terminal.dock.browser.actions.deleteArchive', { defaultValue: 'Delete archive' }),
    suggestionFallback: t('core:terminal.dock.browser.suggestionFallback', {
      defaultValue: 'Timeline suggestion cards stay separate from this browser.',
    }),
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
        'flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition-colors',
        active
          ? 'border-accent/35 bg-accent/10 text-text-primary'
          : 'border-transparent text-text-secondary hover:border-surface-border/40 hover:bg-surface-panel/45 hover:text-text-primary',
      ].join(' ')}
      aria-pressed={active ? 'true' : 'false'}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="rounded-full border border-surface-border/70 bg-surface-panel/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
        {count}
      </span>
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
      className={[
        'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
        active
          ? 'border-accent/35 bg-accent/10'
          : 'border-transparent bg-surface-panel/25 hover:border-surface-border/40 hover:bg-surface-panel/45',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text-primary">{entry.label}</p>
          {entry.detail && (
            <p className="mt-1 truncate text-xs text-text-secondary">{entry.detail}</p>
          )}
          {entry.meta && (
            <p className="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-text-tertiary">{entry.meta}</p>
          )}
        </div>
        {entry.stateLabel && (
          <span className={['shrink-0 inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]', getPriorityClasses(entry.priority)].join(' ')} title={entry.stateLabel}>
            <Icon name={getPriorityIcon(entry.priority)} className="mr-1 text-[11px]" />
            {entry.stateLabel}
          </span>
        )}
      </div>
    </button>
  )
}

function BrowserDetailField({ label = '', value = '' }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">{label}</p>
      <p className="mt-1 break-words text-xs text-text-primary">{value}</p>
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
  return (
    <div
      style={{ height: `${browserHeight}px` }}
      className="min-h-0"
    >
      <div className="flex h-full min-h-0 flex-col md:flex-row" data-ui="chat-terminal-browser">
        <aside className="flex w-full shrink-0 flex-col border-b border-surface-border/20 bg-surface-panel/12 md:w-[18.5rem] md:border-b-0 md:border-r">
          <div className="space-y-1.5 px-3 py-3">
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
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-surface-border/20 px-3 py-3">
            {browserSectionEntries.length > 0 ? (
              <div className="space-y-2">
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
              <div className="rounded-2xl bg-surface-panel/30 px-3 py-4 text-xs text-text-secondary">
                {browserSection === 'current_thread'
                  ? labels.emptyCurrentThread
                  : browserSection === 'other_live'
                    ? labels.emptyOtherLive
                    : labels.emptyHistory}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-surface-border/20 px-4 py-3">
            <TerminalStatusBanner runtimeHealth={runtimeHealth} actionError={actionError} />
            {selectedBrowserEntry ? (
              <div className={actionError || runtimeStatus !== 'supported' ? 'mt-3' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{selectedBrowserEntry.label}</p>
                    {selectedBrowserEntry.detail && (
                      <p className="mt-1 text-xs text-text-secondary">{selectedBrowserEntry.detail}</p>
                    )}
                  </div>
                  {selectedBrowserEntry.stateLabel && (
                    <span className={['rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]', getPriorityClasses(selectedBrowserEntry.priority)].join(' ')}>
                      {selectedBrowserEntry.stateLabel}
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <BrowserDetailField label={labels.fieldThread} value={getThreadTitle(threads, selectedBrowserThreadId)} />
                  <BrowserDetailField
                    label={labels.fieldScope}
                    value={selectedBrowserSession
                      ? getTerminalScopeLabel(selectedBrowserSession, { labels: labels.terminalSessionLabels })
                      : (selectedArchivedBrowserSession ? getTerminalScopeLabel(selectedArchivedBrowserSession, { labels: labels.terminalSessionLabels }) : '')}
                  />
                  <BrowserDetailField
                    label={labels.fieldUpdated}
                    value={selectedBrowserSession
                      ? getTerminalExactTimestampLabel(selectedBrowserSession?.updatedAt || selectedBrowserSession?.createdAt, { locale })
                      : (selectedArchivedBrowserSession
                        ? getTerminalExactTimestampLabel(selectedArchivedBrowserSession?.closedAt || selectedArchivedBrowserSession?.openedAt, { locale })
                        : '')}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {showBrowserOpenThreadAction && (
                    <button
                      type="button"
                    onClick={() => void onOpenOwningThread?.(selectedBrowserThreadId)}
                    className="rounded-full border border-surface-border/70 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
                  >
                      {labels.openThread}
                    </button>
                  )}
                  {selectedBrowserSession && selectedBrowserEntry?.section === 'current_thread' && (
                    <>
                      <button
                        type="button"
                        onClick={() => browserOutputActions.sendOutputToChat()}
                        disabled={!selectedBrowserRawOutput}
                        className="rounded-full border border-surface-border/70 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {labels.sendOutputToChat}
                      </button>
                      <button
                        type="button"
                        onClick={() => browserOutputActions.explainLastError()}
                        disabled={!selectedBrowserRawOutput}
                        className="rounded-full border border-surface-border/70 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {labels.explainLastError}
                      </button>
                      <button
                        type="button"
                        onClick={() => browserOutputActions.summarizeSession()}
                        disabled={!selectedBrowserRawOutput}
                        className="rounded-full border border-surface-border/70 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {labels.summarizeSession}
                      </button>
                      <button
                        type="button"
                        onClick={() => void browserOutputActions.saveSnapshotToMemory()}
                        disabled={!selectedBrowserRawOutput || browserOutputActions.memoryPending}
                        className="rounded-full border border-surface-border/70 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {labels.saveSnapshotToMemory}
                      </button>
                    </>
                  )}
                  {selectedArchivedBrowserSession && (
                    <>
                      <button
                        type="button"
                        onClick={() => void saveArchivedSessionToMemory?.(selectedArchivedBrowserSession.sessionId, { targetScope: 'thread' })}
                        disabled={archiveSaveAction?.disabled}
                        className="rounded-full border border-surface-border/70 bg-surface-panel/50 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {archiveSaveAction?.saved ? labels.savedToMemory : archiveSaveAction?.missing ? labels.noMemorySummary : labels.saveToThreadMemory}
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveArchivedSessionToMemory?.(selectedArchivedBrowserSession.sessionId, { targetScope: 'project' })}
                        disabled={archiveSaveAction?.disabled}
                        className="rounded-full border border-surface-border/70 bg-surface-panel/50 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {archiveSaveAction?.saved ? labels.savedToMemory : archiveSaveAction?.missing ? labels.noMemorySummary : labels.saveToProjectMemory}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteArchivedBrowserSession?.(selectedArchivedBrowserSession.sessionId)}
                        disabled={archiveDeletePendingBySessionId?.[selectedArchivedBrowserSession.sessionId] === true}
                        className="rounded-full border border-danger/35 bg-danger/10 px-3 py-1.5 text-xs text-danger-soft transition-colors hover:border-danger/50 hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {archiveDeletePendingBySessionId?.[selectedArchivedBrowserSession.sessionId] === true ? labels.deletingArchive : labels.deleteArchive}
                      </button>
                    </>
                  )}
                </div>
                {selectedArchivedBrowserSession && (
                  <p className="mt-2 text-xs text-text-tertiary">
                    {getTerminalArchiveSuggestionLabel(selectedArchivedBrowserSession.memoryCandidateStatus, {
                      labels: labels.terminalSessionLabels,
                    })}
                    {selectedArchivedBrowserSession.memoryCandidateSummary
                      ? `: ${selectedArchivedBrowserSession.memoryCandidateSummary}`
                      : `. ${labels.suggestionFallback}`}
                  </p>
                )}
              </div>
            ) : null}
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
