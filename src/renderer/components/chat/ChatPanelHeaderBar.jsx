import React, { useState, useEffect, useCallback } from 'react'
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
      title={active ? 'Close Git details' : 'Open Git details'}
      className={[
        'flex h-7 shrink-0 items-center gap-2 rounded-md border border-surface-border px-2 text-[11px] outline-none transition-colors duration-100',
        'hover:border-border-hover hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong',
        active ? 'bg-surface-panel text-text-primary' : 'bg-transparent text-text-secondary',
      ].join(' ')}
    >
      {status.branch && (
        <span className="flex items-center gap-1 text-text-secondary">
          <GitBranchIcon className="h-3.5 w-3.5" />
          <span className="font-mono">{status.branch}</span>
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

  return (
    <>
      <div className="flex min-h-[52px] shrink-0 items-center border-b border-chat-border/60 px-4 py-2">
        <div
          className="mx-auto flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2"
          style={{ maxWidth: 'var(--app-chat-content-max-width)' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {workspaceRailEnabled && !workspaceRailOpen && (
              <button
                id={WORKSPACE_RAIL_OPEN_CONTROL_ID}
                type="button"
                onClick={onOpenWorkspaceRail}
                title={workspaceRailOpenLabel}
                aria-label={workspaceRailOpenLabel}
                data-ui="workspace-rail-open"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-surface-border bg-transparent text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong md:h-7 md:w-auto md:gap-1.5 md:px-2"
              >
                <ThreadsIcon />
                <span className="hidden text-[11px] font-medium md:inline">{t('core:workspaceRail.title', { defaultValue: 'Projects' })}</span>
              </button>
            )}
            {workspaceRailEnabled && !workspaceRailOpen && <span className="text-text-muted/40 text-[12px] select-none">/</span>}
            <p className="text-[12px] font-medium font-display text-text-secondary truncate" title={activeThreadTitle || 'No active thread'}>
              {activeThreadTitle || 'No thread'}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 shrink-0">
            <ChatTerminalGlobalIndicator activeThreadId={activeThreadId} />
            <PermissionModeToggle
              permissionMode={permissionMode}
              disabled={permissionModeChangePending}
              onChange={onPermissionModeChange}
            />
            <GitStatusCard
              active={activeChatCompanion === CHAT_COMPANION_GIT}
              onToggle={() => toggleChatCompanion(CHAT_COMPANION_GIT)}
              projectFolder={projectFolder}
            />
            {showAgentStatus ? (
              <button
                type="button"
                data-ui="agents-companion-toggle"
                aria-pressed={activeChatCompanion === CHAT_COMPANION_AGENTS}
                onClick={() => toggleChatCompanion(CHAT_COMPANION_AGENTS)}
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
