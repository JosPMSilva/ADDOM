import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import ProviderSwitchContextBanner from './ProviderSwitchContextBanner.jsx'
import PermissionModeToggle from './PermissionModeToggle.jsx'
import useAppStore from '../../store/useAppStore.js'
import useAgentRunStore from '../../store/useAgentRunStore.js'
import { selectAgentCompanionStatus } from '../../store/agents/agent-run-selectors.mjs'
import { WORKSPACE_RAIL_OPEN_CONTROL_ID } from '../workspace/workspace-rail-interactions.mjs'
import { ChatTerminalGlobalIndicator } from './ChatTerminalDock.jsx'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import {
  CHAT_COMPANION_AGENTS,
  CHAT_COMPANION_GIT,
  formatAgentCompanionLabel,
  shouldShowAgentCompanionTrigger,
} from './chat-companion-state.mjs'
import { formatWorkspaceRailOpenLabel } from '../workspace/workspace-rail-activity-summary.mjs'
import GitBranchIcon from '../ui/GitBranchIcon.jsx'

function ThreadsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="10" y2="8" />
      <line x1="2" y1="12" x2="12" y2="12" />
    </svg>
  )
}

function AgentsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <circle cx="5" cy="5" r="2" />
      <circle cx="11" cy="5" r="2" />
      <path d="M2.5 12c.4-2 1.5-3 3.2-3s2.8 1 3.2 3" />
      <path d="M8.5 9.4c.5-.3 1.1-.4 1.8-.4 1.7 0 2.8 1 3.2 3" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="13" cy="8" r="1.2" />
    </svg>
  )
}

const GIT_POLL_MS = 10_000

function GitStatusCard({ active = false, onToggle, projectFolder }) {
  const [status, setStatus] = useState(null)

  const fetch = useCallback(async () => {
    if (!projectFolder || !window.addom?.git?.getHeaderStatus) return
    try {
      const result = await window.addom.git.getHeaderStatus(projectFolder)
      if (result?.ok) setStatus(result)
      else setStatus(null)
    } catch {
      setStatus(null)
    }
  }, [projectFolder])

  useEffect(() => {
    setStatus(null)
    if (!projectFolder) return
    fetch()
    const id = setInterval(fetch, GIT_POLL_MS)
    return () => clearInterval(id)
  }, [projectFolder, fetch])

  if (!status) return null

  return (
    <button
      type="button"
      data-ui="git-companion-toggle"
      aria-pressed={active}
      onClick={onToggle}
      title={`${active ? 'Close Git details' : 'Open Git details'} · ${status.branch || 'Git'}`}
      aria-label={`${active ? 'Close Git details' : 'Open Git details'} · ${status.branch || 'Git'}`}
      className={[
        'flex h-7 min-w-0 max-w-[220px] items-center gap-2 rounded-md border border-surface-border px-2 text-[11px] outline-none transition-colors duration-100',
        'hover:border-border-hover hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong',
        active ? 'bg-surface-panel text-text-primary' : 'bg-transparent text-text-secondary',
      ].join(' ')}
    >
      {status.branch && (
        <span className="flex min-w-0 items-center gap-1 text-text-secondary">
          <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate font-mono">{status.branch}</span>
        </span>
      )}
      {(status.added > 0 || status.removed > 0) && (
        <>
          {status.branch && <span className="text-surface-border select-none">·</span>}
          {status.added > 0 && (
            <span className="text-success font-mono font-medium">+{status.added}</span>
          )}
          {status.removed > 0 && (
            <span className="text-danger font-mono font-medium">-{status.removed}</span>
          )}
        </>
      )}
    </button>
  )
}

export default function ChatPanelHeaderBar({
  activeThreadId,
  activeThreadTitle,
  permissionMode,
  permissionModeChangePending = false,
  onPermissionModeChange,
  providerSwitchHint,
  actionsDisabled,
  onInjectSwitchContext,
  onDismissProviderSwitchHint,
  workspaceRailEnabled = false,
  workspaceRailOpen = true,
  workspaceRailActivitySummary = null,
  onOpenWorkspaceRail,
}) {
  const { t } = useRendererTranslation(['core'])
  const projectFolder = useAppStore((s) => s.projectFolder)
  const activeChatCompanion = useAppStore((s) => s.activeChatCompanion)
  const toggleChatCompanion = useAppStore((s) => s.toggleChatCompanion)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const agentStatus = useAgentRunStore(useShallow((s) => selectAgentCompanionStatus(s, {
    projectId: activeProjectId,
    threadId: activeThreadId,
  })))
  const showAgentStatus = shouldShowAgentCompanionTrigger(agentStatus, activeChatCompanion)
  const agentStatusLabel = formatAgentCompanionLabel(t, agentStatus)
  const workspaceRailOpenLabel = formatWorkspaceRailOpenLabel(t, workspaceRailActivitySummary)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const headerControlsRef = useRef(null)
  const overflowTriggerRef = useRef(null)
  const moreActionsLabel = t('core:chat.controlRail.moreActions', { defaultValue: 'More actions' })

  useEffect(() => {
    if (!overflowOpen) return undefined
    const onPointerDown = (event) => {
      if (!headerControlsRef.current?.contains(event.target)) setOverflowOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setOverflowOpen(false)
      overflowTriggerRef.current?.focus()
    }
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [overflowOpen])

  return (
    <>
      <div data-ui="chat-header" className="flex h-[52px] min-h-[52px] shrink-0 items-center border-b border-chat-border/60 px-4">
        <div
          data-ui="chat-header-content"
          className="relative mx-auto flex h-full w-full min-w-0 items-center justify-between gap-3"
          style={{ maxWidth: 'var(--app-chat-header-max-width)' }}
        >
          <div data-ui="chat-header-identity" className="flex min-w-0 flex-1 items-center gap-2">
            {workspaceRailEnabled && !workspaceRailOpen && (
              <button
                id={WORKSPACE_RAIL_OPEN_CONTROL_ID}
                type="button"
                onClick={onOpenWorkspaceRail}
                title={workspaceRailOpenLabel}
                aria-label={workspaceRailOpenLabel}
                data-ui="workspace-rail-open"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-surface-border bg-transparent text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
              >
                <ThreadsIcon />
              </button>
            )}
            <p className="min-w-0 truncate text-[12px] font-medium font-display text-text-secondary" title={activeThreadTitle || 'No active thread'}>
              {activeThreadTitle || 'No thread'}
            </p>
          </div>

          <div ref={headerControlsRef} data-ui="chat-header-actions" className="flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
            <PermissionModeToggle
              compact
              permissionMode={permissionMode}
              disabled={permissionModeChangePending}
              onChange={onPermissionModeChange}
            />
            <div id="chat-header-secondary-controls" data-ui="chat-header-secondary" data-open={overflowOpen} role="group" aria-label={moreActionsLabel} className="flex min-w-0 items-center gap-2">
              <ChatTerminalGlobalIndicator activeThreadId={activeThreadId} />
              <GitStatusCard
                active={activeChatCompanion === CHAT_COMPANION_GIT}
                onToggle={() => {
                  toggleChatCompanion(CHAT_COMPANION_GIT)
                  setOverflowOpen(false)
                }}
                projectFolder={projectFolder}
              />
              {showAgentStatus ? (
                <button
                  type="button"
                  data-ui="agents-companion-toggle"
                  aria-pressed={activeChatCompanion === CHAT_COMPANION_AGENTS}
                  onClick={() => {
                    toggleChatCompanion(CHAT_COMPANION_AGENTS)
                    setOverflowOpen(false)
                  }}
                  title={activeChatCompanion === CHAT_COMPANION_AGENTS
                    ? t('core:agentTrigger.close', { defaultValue: 'Close Agents' })
                    : t('core:agentTrigger.open', { defaultValue: 'Open Agents' })}
                  className={[
                    'flex h-7 items-center gap-1.5 rounded-md border border-surface-border px-2 text-[11px] outline-none transition-colors duration-100',
                    'hover:border-border-hover hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong',
                    activeChatCompanion === CHAT_COMPANION_AGENTS
                      ? 'bg-surface-panel text-text-primary'
                      : 'bg-transparent text-text-secondary',
                  ].join(' ')}
                >
                  <AgentsIcon />
                  <span>{agentStatusLabel}</span>
                </button>
              ) : null}
            </div>
            <button
              ref={overflowTriggerRef}
              type="button"
              data-ui="chat-header-overflow-trigger"
              aria-label={moreActionsLabel}
              title={moreActionsLabel}
              aria-expanded={overflowOpen}
              aria-controls="chat-header-secondary-controls"
              onClick={() => setOverflowOpen((value) => !value)}
              className="h-7 w-7 shrink-0 items-center justify-center rounded-md border border-surface-border bg-transparent text-text-secondary outline-none hover:border-border-hover hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
            >
              <MoreIcon />
            </button>
          </div>
        </div>
      </div>

      {providerSwitchHint && (
        <div className="relative z-10 shrink-0 px-4 pt-2 pb-1">
          <div
            className="mx-auto w-full"
            style={{ maxWidth: 'var(--app-chat-content-max-width)' }}
          >
            <ProviderSwitchContextBanner
              hint={providerSwitchHint}
              disabled={actionsDisabled}
              onInjectMemory={() => onInjectSwitchContext('memory')}
              onInjectArtifacts={() => onInjectSwitchContext('artifacts')}
              onInjectBoth={() => onInjectSwitchContext('both')}
              onDismiss={onDismissProviderSwitchHint}
            />
          </div>
        </div>
      )}
    </>
  )
}
