import React from 'react'

import useAgentRunStore from '../../store/useAgentRunStore.js'
import useAppStore from '../../store/useAppStore.js'
import {
  allReferencesTerminal,
  highestAttentionStatus,
} from '../../store/agents/agent-stream-references.mjs'
import { presentationKey } from '../../store/agents/agent-run-normalizers.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { AGENT_STATUS_TONE } from './agent-status-tone.mjs'
import { planStreamReturnFocus } from './agent-stream-return-focus.mjs'

const EMPTY_REFERENCES = Object.freeze([])

function ReferenceRow({ reference, statusLabel, openLabel, onOpen, buttonRef }) {
  const tone = AGENT_STATUS_TONE[reference.status] || 'bg-text-secondary'
  const running = !AGENT_STATUS_TONE[reference.status]
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onOpen(reference)}
      className="group flex min-h-7 w-full items-center gap-2 rounded-sm px-2 py-0.5 text-left outline-none transition-colors hover:bg-surface-panel/35 focus-visible:ring-1 focus-visible:ring-border-strong"
      data-ui="agent-stream-reference"
      data-agent-node={reference.nodeId}
      aria-label={`${reference.label}, ${statusLabel}`}
    >
      <span
        aria-hidden="true"
        data-agent-status={reference.status}
        className={[
          'h-1.5 w-1.5 shrink-0 rounded-full',
          tone,
          running ? 'animate-pulse motion-reduce:animate-none' : '',
        ].join(' ')}
      />
      <span className="chat-typo-exec-row-label min-w-0 shrink-0 truncate font-medium text-text-secondary">
        {reference.label}
      </span>
      <span className="chat-typo-exec-row-label min-w-0 flex-1 truncate text-text-tertiary">
        {reference.preview || reference.task || statusLabel}
      </span>
      <span className="shrink-0 text-[10px] text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {openLabel}
      </span>
    </button>
  )
}

/**
 * Direct children of this turn, shown where the delegation happened. The group collapses on its own
 * once every child has settled, but an explicit choice is never overridden by later updates.
 */
export default function AgentStreamReferenceGroup({ item }) {
  const { t } = useRendererTranslation(['core'])
  const references = Array.isArray(item?.references) ? item.references : EMPTY_REFERENCES
  const settled = allReferencesTerminal(references)
  const attention = highestAttentionStatus(references)
  const groupId = String(item?.id || '')
  const runId = String(references[0]?.runId || '')
  const activeThreadId = useAppStore((state) => state.activeThreadId)
  const setPresentation = useAgentRunStore((state) => state.setPresentation)
  const selectNavigatorNode = useAgentRunStore((state) => state.selectNavigatorNode)
  const presentation = useAgentRunStore((state) => (
    runId ? state.presentationByScope[presentationKey(activeThreadId, runId)] || null : null
  ))
  const preference = presentation?.streamGroupCollapsePreference
  const hasUserPreference = Boolean(
    groupId
    && preference
    && typeof preference === 'object'
    && Object.prototype.hasOwnProperty.call(preference, groupId),
  )
  const collapsed = hasUserPreference ? preference[groupId] === true : settled
  const refButtons = React.useRef(new Map())

  const handleOpen = React.useCallback((reference) => {
    selectNavigatorNode({
      threadId: activeThreadId,
      runId: reference.runId,
      nodeId: reference.nodeId,
    })
  }, [activeThreadId, selectNavigatorNode])

  const persistCollapsed = React.useCallback((nextCollapsed) => {
    if (!runId || !groupId) return
    setPresentation({
      threadId: activeThreadId,
      runId,
      streamGroupCollapsePreference: { [groupId]: nextCollapsed === true },
    })
  }, [activeThreadId, groupId, runId, setPresentation])

  // Back from a child expands this group first; focus runs only after the panel is visible.
  React.useEffect(() => {
    const anchor = presentation?.returnAnchor
    const focusNodeId = String(anchor?.focusNodeId || '')
    const action = planStreamReturnFocus({
      focusNodeId,
      focusSurface: anchor?.focusSurface,
      collapsed,
      referencesContainFocus: references.some((reference) => reference.nodeId === focusNodeId),
    })
    if (!action) return
    if (action.type === 'expand') {
      persistCollapsed(false)
      return
    }
    const button = refButtons.current.get(action.focusNodeId)
    if (button && typeof button.focus === 'function') {
      button.focus()
      setPresentation({ threadId: activeThreadId, runId, returnAnchor: null })
    }
  }, [
    presentation?.returnAnchor,
    references,
    collapsed,
    persistCollapsed,
    activeThreadId,
    runId,
    setPresentation,
  ])

  if (references.length === 0) return null

  const panelId = `agents-group-${String(item.id).replace(/[^a-z0-9_-]/gi, '-')}`
  const title = t('core:agentStream.title', {
    count: references.length,
    defaultValue: 'Agents · {{count}}',
  })
  const openLabel = t('core:agentStream.open', { defaultValue: 'Open' })

  return (
    <div data-ui="agent-stream-group" data-collapsed={collapsed ? 'true' : 'false'}>
      <button
        type="button"
        className="group flex min-h-7 w-full items-center rounded-sm px-2 py-0.5 text-left outline-none transition-colors hover:bg-surface-panel/35 focus-visible:ring-1 focus-visible:ring-border-strong"
        aria-expanded={!collapsed}
        aria-controls={panelId}
        onClick={() => persistCollapsed(!collapsed)}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="chat-typo-exec-row-label chat-typo-exec-row-verb min-w-0 truncate text-text-tertiary">
            {title}
            {collapsed && attention ? (
              <span className="ml-2 text-warning">
                {t(`core:agentNavigator.status.${attention}`, { defaultValue: attention })}
              </span>
            ) : null}
          </span>
          <span className="text-text-tertiary" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        </span>
      </button>
      <div
        id={panelId}
        className={collapsed ? 'hidden' : 'space-y-0.5 pb-1'}
        hidden={collapsed}
      >
        {references.map((reference) => (
          <ReferenceRow
            key={reference.key}
            reference={reference}
            statusLabel={t(`core:agentNavigator.status.${reference.status}`, {
              defaultValue: reference.status,
            })}
            openLabel={openLabel}
            onOpen={handleOpen}
            buttonRef={(node) => {
              if (node) refButtons.current.set(reference.nodeId, node)
              else refButtons.current.delete(reference.nodeId)
            }}
          />
        ))}
      </div>
    </div>
  )
}
