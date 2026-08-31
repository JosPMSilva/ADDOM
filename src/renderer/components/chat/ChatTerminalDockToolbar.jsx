import React from 'react'

import Icon from '../ui/Icon.jsx'
import useTerminalStore from '../../store/useTerminalStore.js'
import { useTerminalOutputActions } from '../terminal/use-terminal-output-actions.mjs'

const MENU_ITEM_BASE_CLASS = [
  'group/menuitem relative flex h-7 w-full items-center rounded-md px-2 text-left text-[11px] font-medium',
  'text-text-secondary transition-colors hover:bg-surface-panel-alt hover:text-text-primary',
  'focus:outline-none focus-visible:bg-surface-panel-alt focus-visible:text-text-primary',
  'disabled:cursor-not-allowed disabled:text-text-tertiary disabled:hover:bg-transparent',
].join(' ')

const MENU_ITEM_DANGER_CLASS = [
  'group/menuitem relative flex h-7 w-full items-center rounded-md px-2 text-left text-[11px] font-medium',
  'text-danger-soft transition-colors hover:bg-danger/10 hover:text-danger-soft',
  'focus:outline-none focus-visible:bg-danger/10 focus-visible:text-danger-soft',
  'disabled:cursor-not-allowed disabled:text-text-tertiary disabled:hover:bg-transparent',
].join(' ')

const TOOLBAR_GHOST_CLASS = [
  'inline-flex h-7 items-center justify-center rounded-md px-2.5 text-xs font-medium',
  'text-text-secondary transition-colors hover:bg-surface-panel-alt hover:text-text-primary',
  'disabled:cursor-not-allowed disabled:opacity-40',
].join(' ')

const TOOLBAR_PRIMARY_CLASS = [
  'inline-flex h-7 items-center justify-center rounded-md bg-surface-panel-muted-strong px-2.5',
  'text-xs font-medium text-text-primary transition-colors hover:bg-surface-panel-alt',
].join(' ')

const TOOLBAR_ICON_CLASS = [
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary',
  'transition-colors hover:bg-surface-panel-alt hover:text-text-primary',
].join(' ')

function TerminalMenuItem({
  label = '',
  hint = '',
  tone = 'default',
  ...buttonProps
}) {
  const resolvedLabel = String(label || '').trim()
  const resolvedHint = String(hint || '').trim()
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={resolvedHint ? `${resolvedLabel}. ${resolvedHint}` : resolvedLabel}
      title={resolvedHint || resolvedLabel}
      className={tone === 'danger' ? MENU_ITEM_DANGER_CLASS : MENU_ITEM_BASE_CLASS}
      {...buttonProps}
    >
      <span className="truncate">{resolvedLabel}</span>
      {resolvedHint ? (
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none absolute right-1.5 top-1/2 max-w-[9.5rem] -translate-y-1/2 truncate rounded border px-1.5 py-0.5 text-[10px] font-normal leading-none opacity-0 shadow-[0_8px_18px_rgb(var(--theme-shadow-rgb)_/_0.24)] transition-opacity',
            tone === 'danger'
              ? 'border-danger-border bg-surface-panel text-danger-soft group-hover/menuitem:opacity-100 group-focus-visible/menuitem:opacity-100'
              : 'border-surface-border bg-surface text-text-muted group-hover/menuitem:opacity-100 group-focus-visible/menuitem:opacity-100',
          ].join(' ')}
        >
          {resolvedHint}
        </span>
      ) : null}
    </button>
  )
}

function TerminalMenuSeparator() {
  return <div className="my-1 h-px bg-surface-border/30" role="separator" />
}

export default function ChatTerminalDockToolbar({
  activeThreadId = '',
  browserOpen = false,
  canExplainControlState = false,
  collapsed = false,
  controlDetailMessage = '',
  labels = {},
  pendingTakeover = false,
  priority = 'running',
  projectFolder = '',
  selectedSession = null,
  showCompactSessionChrome = false,
  showHandBackAction = false,
  showTakeOverAction = false,
  stateLabel = '',
  onCloseSession = null,
  onConfirmTakeover = null,
  onDuplicateSession = null,
  onHideTerminal = null,
  onHandBackSession = null,
  onInterruptSession = null,
  onOpenTerminal = null,
  onOpenTerminalAtEditorCwd = null,
  onOpenTerminalAtProjectRoot = null,
  onOpenTerminalAtSessionCwd = null,
  onOpenTerminalWithShell = null,
  onRenameSession = null,
  onTerminateSession = null,
  onToggleBrowser = null,
  onToggleCollapsed = null,
  shellChoices = [],
}) {
  const [utilityMenuOpen, setUtilityMenuOpen] = React.useState(false)
  const [controlPopoverOpen, setControlPopoverOpen] = React.useState(false)
  const [renameEditorOpen, setRenameEditorOpen] = React.useState(false)
  const [renameDraftTitle, setRenameDraftTitle] = React.useState('')
  const utilityMenuRef = React.useRef(null)
  const controlPopoverRef = React.useRef(null)
  const selectedSessionId = String(selectedSession?.id || '').trim()
  const selectedRawOutput = useTerminalStore((state) => (
    selectedSessionId ? String(state.rawOutputBySessionId?.[selectedSessionId]?.rawOutput || '') : ''
  ))
  const terminalOutputActions = useTerminalOutputActions({
    session: selectedSession,
    rawOutput: selectedRawOutput,
    projectFolder,
  })
  const controlPopoverId = selectedSession?.id ? `chat-terminal-dock-state-${selectedSession.id}` : 'chat-terminal-dock-state'
  const renameInputId = selectedSession?.id ? `chat-terminal-rename-${selectedSession.id}` : 'chat-terminal-rename'

  React.useEffect(() => {
    setRenameEditorOpen(false)
    setRenameDraftTitle('')
  }, [selectedSession?.id])

  React.useEffect(() => {
    if (!utilityMenuOpen) return undefined
    const handlePointerDown = (event) => {
      if (utilityMenuRef.current?.contains?.(event.target)) return
      setUtilityMenuOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setUtilityMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [utilityMenuOpen])

  React.useEffect(() => {
    if (!controlPopoverOpen) return undefined
    const handlePointerDown = (event) => {
      if (controlPopoverRef.current?.contains?.(event.target)) return
      setControlPopoverOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setControlPopoverOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [controlPopoverOpen])

  const handleBeginRename = React.useCallback(() => {
    setRenameDraftTitle(String(selectedSession?.sessionTitle || ''))
    setRenameEditorOpen(true)
  }, [selectedSession?.sessionTitle])

  const handleCancelRename = React.useCallback(() => {
    setRenameEditorOpen(false)
    setRenameDraftTitle('')
  }, [])

  const handleRenameSubmit = React.useCallback((event) => {
    event.preventDefault()
    void onRenameSession?.(renameDraftTitle)
    setRenameEditorOpen(false)
    setUtilityMenuOpen(false)
  }, [onRenameSession, renameDraftTitle])

  const handleRenameKeyDown = React.useCallback((event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    handleCancelRename()
  }, [handleCancelRename])

  const showQuietStateChip = showCompactSessionChrome
    && !showHandBackAction
    && !showTakeOverAction
    && !!stateLabel
  const quietStateTone = priority === 'failed'
    ? 'text-danger-soft'
    : (priority === 'ended' ? 'text-text-tertiary' : 'text-text-secondary')

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => void onOpenTerminal?.()}
        disabled={!activeThreadId || !projectFolder}
        className={TOOLBAR_GHOST_CLASS}
      >
        {labels.openTerminal}
      </button>
      {browserOpen ? (
        <button
          type="button"
          onClick={() => onToggleBrowser?.(false)}
          className={TOOLBAR_GHOST_CLASS}
        >
          {labels.backToDock}
        </button>
      ) : !showCompactSessionChrome ? (
        <button
          type="button"
          onClick={() => onToggleBrowser?.(true)}
          className={TOOLBAR_GHOST_CLASS}
        >
          {labels.browseSessions}
        </button>
      ) : (
        <>
          {showHandBackAction ? (
            <>
              <div className="relative" ref={controlPopoverRef}>
                <span
                  role={canExplainControlState ? 'button' : undefined}
                  tabIndex={canExplainControlState ? 0 : undefined}
                  onMouseEnter={() => canExplainControlState && setControlPopoverOpen(true)}
                  onMouseLeave={() => setControlPopoverOpen(false)}
                  onFocus={() => canExplainControlState && setControlPopoverOpen(true)}
                  onBlur={() => setControlPopoverOpen(false)}
                  onClick={() => {
                    if (!canExplainControlState) return
                    setControlPopoverOpen((open) => !open)
                  }}
                  onKeyDown={(event) => {
                    if (!canExplainControlState) return
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setControlPopoverOpen((open) => !open)
                  }}
                  aria-describedby={controlPopoverOpen && canExplainControlState ? controlPopoverId : undefined}
                  title={canExplainControlState ? controlDetailMessage : undefined}
                  className={[TOOLBAR_PRIMARY_CLASS, canExplainControlState ? 'cursor-help' : 'cursor-default'].join(' ')}
                >
                  {stateLabel || labels.userTakeover}
                </span>
                {controlPopoverOpen && canExplainControlState && (
                  <div
                    id={controlPopoverId}
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-30 max-w-[18rem] rounded-lg bg-surface-panel px-3 py-2 text-left text-xs text-text-secondary shadow-[0_18px_40px_rgb(var(--theme-shadow-rgb)_/_0.28)]"
                  >
                    {controlDetailMessage}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => void onHandBackSession?.(selectedSession?.id)}
                className={TOOLBAR_GHOST_CLASS}
              >
                {labels.handBackToAi}
              </button>
            </>
          ) : showTakeOverAction ? (
            <div className="relative" ref={controlPopoverRef}>
              <button
                type="button"
                onMouseEnter={() => canExplainControlState && setControlPopoverOpen(true)}
                onMouseLeave={() => setControlPopoverOpen(false)}
                onFocus={() => canExplainControlState && setControlPopoverOpen(true)}
                onBlur={() => setControlPopoverOpen(false)}
                onClick={() => void onConfirmTakeover?.()}
                aria-describedby={controlPopoverOpen && canExplainControlState ? controlPopoverId : undefined}
                title={canExplainControlState ? controlDetailMessage : undefined}
                className={TOOLBAR_PRIMARY_CLASS}
              >
                {pendingTakeover ? labels.confirmTakeover : labels.takeOver}
              </button>
              {controlPopoverOpen && canExplainControlState && (
                <div
                  id={controlPopoverId}
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-30 max-w-[18rem] rounded-lg bg-surface-panel px-3 py-2 text-left text-xs text-text-secondary shadow-[0_18px_40px_rgb(var(--theme-shadow-rgb)_/_0.28)]"
                >
                  {controlDetailMessage}
                </div>
              )}
            </div>
          ) : showQuietStateChip ? (
            <span
              className={['inline-flex h-7 items-center px-1 text-[11px] font-medium', quietStateTone].join(' ')}
              title={stateLabel}
            >
              {stateLabel}
            </span>
          ) : null}
        </>
      )}
      {browserOpen && (
        <button
          type="button"
          onClick={() => onToggleCollapsed?.(!collapsed)}
          className={TOOLBAR_ICON_CLASS}
          aria-label={collapsed ? labels.expandBrowser : labels.collapseBrowser}
          title={collapsed ? labels.expand : labels.collapse}
        >
          <Icon
            name={collapsed ? 'chevron-up' : 'chevron-down'}
            className="text-[16px]"
          />
        </button>
      )}
      <div className="relative" ref={utilityMenuRef}>
        <button
          type="button"
          onClick={() => setUtilityMenuOpen((open) => !open)}
          className={TOOLBAR_ICON_CLASS}
          aria-haspopup="menu"
          aria-expanded={utilityMenuOpen ? 'true' : 'false'}
          aria-label={labels.openTerminalActions}
          title={labels.openTerminalActions}
        >
          <Icon name="dots-three-vertical" className="text-[16px]" />
        </button>
        {utilityMenuOpen && (
          <div
            role="menu"
            aria-label={labels.terminalDockActions}
            className="absolute bottom-[calc(100%+0.25rem)] right-0 z-30 max-h-[50vh] min-w-[12.5rem] overflow-y-auto rounded-lg border border-surface-border bg-surface-panel p-1 shadow-[0_14px_32px_rgb(var(--theme-shadow-rgb)_/_0.26)]"
          >
            <TerminalMenuItem
              label={browserOpen ? labels.closeBrowser : labels.browseSessions}
              hint={labels.browserSubtitle}
              onClick={() => onToggleBrowser?.()}
            />
            {!browserOpen && selectedSession && (
              <>
                <TerminalMenuItem
                  label={labels.renameSession}
                  hint={labels.editTitle}
                  onClick={() => {
                    handleBeginRename()
                  }}
                />
                {renameEditorOpen && (
                  <form
                    aria-label={labels.renamePrompt}
                    className="my-1 rounded-md border border-surface-border/40 bg-surface p-1.5"
                    onSubmit={handleRenameSubmit}
                    onKeyDown={handleRenameKeyDown}
                    role="form"
                  >
                    <label htmlFor={renameInputId} className="sr-only">{labels.renamePrompt}</label>
                    <input
                      id={renameInputId}
                      type="text"
                      value={renameDraftTitle}
                      onChange={(event) => setRenameDraftTitle(event.target.value)}
                      autoFocus
                      placeholder={selectedSession.id}
                      className="h-7 w-full rounded border border-surface-border/50 bg-surface-base px-2 text-[11px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent/60"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCancelRename}
                        className="rounded px-2 py-1 text-[11px] text-text-tertiary hover:bg-surface-panel-alt hover:text-text-secondary"
                      >
                        {labels.cancel}
                      </button>
                      <button
                        type="submit"
                        className="rounded bg-accent px-2 py-1 text-[11px] text-surface-base hover:bg-accent-soft"
                      >
                        {labels.save}
                      </button>
                    </div>
                  </form>
                )}
                <TerminalMenuItem
                  label={labels.duplicateSession}
                  hint={labels.sameCwdShell}
                  onClick={() => {
                    setUtilityMenuOpen(false)
                    void onDuplicateSession?.()
                  }}
                />
                <TerminalMenuItem
                  label={labels.sendOutputToChat}
                  hint={labels.prefillComposer}
                  onClick={() => {
                    setUtilityMenuOpen(false)
                    terminalOutputActions.sendOutputToChat()
                  }}
                  disabled={!selectedRawOutput}
                />
                <TerminalMenuItem
                  label={labels.explainLastError}
                  hint={labels.recentOutput}
                  onClick={() => {
                    setUtilityMenuOpen(false)
                    terminalOutputActions.explainLastError()
                  }}
                  disabled={!selectedRawOutput}
                />
                <TerminalMenuItem
                  label={labels.summarizeSession}
                  hint={labels.boundedOutput}
                  onClick={() => {
                    setUtilityMenuOpen(false)
                    terminalOutputActions.summarizeSession()
                  }}
                  disabled={!selectedRawOutput}
                />
                <TerminalMenuItem
                  label={labels.saveSnapshotToMemory}
                  hint={labels.threadMemory}
                  onClick={() => {
                    setUtilityMenuOpen(false)
                    void terminalOutputActions.saveSnapshotToMemory()
                  }}
                  disabled={!selectedRawOutput || terminalOutputActions.memoryPending}
                />
                <TerminalMenuSeparator />
                <TerminalMenuItem
                  label={labels.newFromCurrentCwd}
                  hint={labels.currentCwd}
                  onClick={() => {
                    setUtilityMenuOpen(false)
                    void onOpenTerminalAtSessionCwd?.()
                  }}
                  disabled={!onOpenTerminalAtSessionCwd}
                />
                <TerminalMenuItem
                  label={labels.interrupt}
                  hint={labels.stopInput}
                  onClick={() => {
                    setUtilityMenuOpen(false)
                    void onInterruptSession?.(selectedSession.id)
                  }}
                  disabled={selectedSession?.interruptCapability !== true}
                />
                <TerminalMenuItem
                  label={labels.closeSession}
                  hint={labels.archiveSession}
                  onClick={() => {
                    setUtilityMenuOpen(false)
                    void onCloseSession?.()
                  }}
                  disabled={selectedSession?.closeCapability !== true}
                />
              </>
            )}
            <TerminalMenuItem
              label={labels.newAtProjectRoot}
              hint={labels.defaultShell}
              onClick={() => {
                setUtilityMenuOpen(false)
                void onOpenTerminalAtProjectRoot?.()
              }}
              disabled={!activeThreadId || !projectFolder}
            />
            {onOpenTerminalAtEditorCwd && (
              <TerminalMenuItem
                label={labels.newFromEditorCwd}
                hint={labels.editorFolder}
                onClick={() => {
                  setUtilityMenuOpen(false)
                  void onOpenTerminalAtEditorCwd?.()
                }}
              />
            )}
            {shellChoices.length > 1 && (
              <>
                <TerminalMenuSeparator />
                {shellChoices.filter((shell) => shell !== 'default').map((shell) => (
                  <TerminalMenuItem
                    key={shell}
                    label={`${labels.newWithShell}: ${shell}`}
                    hint={shell}
                    onClick={() => {
                      setUtilityMenuOpen(false)
                      void onOpenTerminalWithShell?.(shell)
                    }}
                    disabled={!activeThreadId || !projectFolder}
                  />
                ))}
              </>
            )}
            <TerminalMenuItem
              label={labels.hideTerminal}
              hint={labels.dismiss}
              onClick={() => {
                setUtilityMenuOpen(false)
                void onHideTerminal?.()
              }}
            />
            {!browserOpen && selectedSession && (
              <TerminalMenuItem
                label={labels.forceTerminate}
                hint={labels.killProcess}
                tone="danger"
                onClick={() => {
                  setUtilityMenuOpen(false)
                  void onTerminateSession?.()
                }}
                disabled={selectedSession?.terminateCapability !== true}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
