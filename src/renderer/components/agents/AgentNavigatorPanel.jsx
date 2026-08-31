import React from 'react'

import useAppStore from '../../store/useAppStore.js'
import useAgentRunStore from '../../store/useAgentRunStore.js'
import {
  DEFAULT_COMPLETED_BATCH_SIZE,
  nextNavigatorExpansion,
  selectAgentNavigatorModel,
} from '../../store/agents/agent-navigator-view-model.mjs'
import { presentationKey } from '../../store/agents/agent-run-normalizers.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import Icon from '../ui/Icon.jsx'
import AgentNavigatorRow, { AGENT_NAVIGATOR_ROW_HEIGHT } from './AgentNavigatorRow.jsx'
import AgentNavigatorSection from './AgentNavigatorSection.jsx'
import {
  focusAgentNavigatorIndex,
  settleAgentNavigatorFocus,
} from './agent-navigator-focus.mjs'
import { resolveNavigatorKeyCommand } from './agent-navigator-keyboard.mjs'

const AGE_TICK_MS = 15_000

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function formatAge(t, ageMs) {
  if (ageMs === null || ageMs === undefined) return ''
  const seconds = Math.floor(ageMs / 1000)
  if (seconds < 60) {
    return t('core:agentNavigator.age.seconds', { count: seconds, defaultValue: '{{count}}s' })
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return t('core:agentNavigator.age.minutes', { count: minutes, defaultValue: '{{count}}m' })
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return t('core:agentNavigator.age.hours', { count: hours, defaultValue: '{{count}}h' })
  }
  return t('core:agentNavigator.age.days', {
    count: Math.floor(hours / 24),
    defaultValue: '{{count}}d',
  })
}

export default function AgentNavigatorPanel({ onClose, embeddedInCompanion = false }) {
  const { t } = useRendererTranslation(['core'])
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const activeThreadId = useAppStore((state) => state.activeThreadId)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const setPresentation = useAgentRunStore((state) => state.setPresentation)
  const selectNavigatorNode = useAgentRunStore((state) => state.selectNavigatorNode)

  // Narrow slices keep the navigator off the transcript and event write paths.
  const runsById = useAgentRunStore((state) => state.runsById)
  const nodesById = useAgentRunStore((state) => state.nodesById)
  const childIdsByParent = useAgentRunStore((state) => state.childIdsByParent)
  const runIdsByScope = useAgentRunStore((state) => state.runIdsByScope)
  const presentationByScope = useAgentRunStore((state) => state.presentationByScope)

  const [nowTick, setNowTick] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), AGE_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const model = React.useMemo(() => selectAgentNavigatorModel(
    { runsById, nodesById, childIdsByParent, runIdsByScope, presentationByScope },
    { projectId: activeProjectId, threadId: activeThreadId, now: nowTick },
  ), [
    runsById, nodesById, childIdsByParent, runIdsByScope, presentationByScope,
    activeProjectId, activeThreadId, nowTick,
  ])

  const rows = React.useMemo(() => [...model.active, ...model.done], [model.active, model.done])
  const [focusedIndex, setFocusedIndex] = React.useState(0)
  const rowRefs = React.useRef(new Map())
  const pendingFocusIndexRef = React.useRef(null)
  const viewportRef = React.useRef(null)
  const [scroll, setScroll] = React.useState({ top: 0, height: 0 })

  React.useEffect(() => {
    if (focusedIndex > rows.length - 1) setFocusedIndex(Math.max(0, rows.length - 1))
  }, [focusedIndex, rows.length])

  const handleSelect = React.useCallback((row) => {
    selectNavigatorNode({ threadId: activeThreadId, runId: row.runId, nodeId: row.nodeId })
  }, [activeThreadId, selectNavigatorNode])

  const handleToggle = React.useCallback((row) => {
    const presentation = useAgentRunStore.getState()
      .presentationByScope[presentationKey(activeThreadId, row.runId)] || {}
    setPresentation({
      threadId: activeThreadId,
      runId: row.runId,
      ...nextNavigatorExpansion(presentation, row.nodeId, !row.expanded),
    })
  }, [activeThreadId, setPresentation])

  const handleKeyDown = React.useCallback((event) => {
    const command = resolveNavigatorKeyCommand(event.key, { rows, index: focusedIndex })
    if (command.type === 'none') return
    event.preventDefault()
    if (command.type === 'focus') {
      pendingFocusIndexRef.current = command.index
      setFocusedIndex(command.index)
      focusAgentNavigatorIndex({
        index: command.index,
        rowRefs: rowRefs.current,
        viewport: viewportRef.current,
        rowHeight: AGENT_NAVIGATOR_ROW_HEIGHT,
        requestFrame: (callback) => window.requestAnimationFrame(callback),
      })
      return
    }
    const row = rows[command.index]
    if (!row) return
    if (command.type === 'select') handleSelect(row)
    else handleToggle(row)
  }, [focusedIndex, handleSelect, handleToggle, rows])

  React.useLayoutEffect(() => {
    const index = pendingFocusIndexRef.current
    if (index === null) return
    if (settleAgentNavigatorFocus({ index, rowRefs: rowRefs.current })) {
      pendingFocusIndexRef.current = null
    }
  }, [focusedIndex, rows.length, scroll.top])

  const handleShowMoreCompleted = React.useCallback(() => {
    const nextSize = model.doneTotal + DEFAULT_COMPLETED_BATCH_SIZE
    for (const runId of model.runIds) {
      setPresentation({ threadId: activeThreadId, runId, completedBatchSize: nextSize })
    }
  }, [activeThreadId, model.doneTotal, model.runIds, setPresentation])

  // Stream return-focus is owned by AgentStreamReferenceGroup. Navigator handles navigator
  // surfaces immediately, and stream anchors that remain after a tick (no mounted group claimed them).
  const returnFocus = React.useMemo(() => {
    const prefix = `${activeThreadId}:`
    for (const [key, value] of Object.entries(presentationByScope)) {
      if (key.startsWith(prefix) && value?.returnAnchor?.focusNodeId) {
        return {
          nodeId: String(value.returnAnchor.focusNodeId),
          surface: String(value.returnAnchor.focusSurface || 'navigator'),
        }
      }
    }
    return null
  }, [presentationByScope, activeThreadId])

  React.useEffect(() => {
    if (!returnFocus?.nodeId) return

    const restoreNavigatorRow = () => {
      const index = rows.findIndex((row) => (
        row.nodeId === returnFocus.nodeId
        || row.memberNodeIds?.includes(returnFocus.nodeId)
      ))
      if (index >= 0) {
        setFocusedIndex(index)
        rowRefs.current.get(index)?.focus()
      }
      for (const runId of model.runIds) {
        setPresentation({ threadId: activeThreadId, runId, returnAnchor: null })
      }
    }

    if (returnFocus.surface !== 'stream') {
      restoreNavigatorRow()
      return undefined
    }

    const handle = window.setTimeout(() => {
      const scope = useAgentRunStore.getState().presentationByScope || {}
      const still = Object.entries(scope).some(([key, value]) => (
        key.startsWith(`${activeThreadId}:`)
        && String(value?.returnAnchor?.focusNodeId || '') === returnFocus.nodeId
        && String(value?.returnAnchor?.focusSurface || '') === 'stream'
      ))
      if (still) restoreNavigatorRow()
    }, 0)
    return () => window.clearTimeout(handle)
  }, [returnFocus, rows, model.runIds, activeThreadId, setPresentation])

  const attentionAnnouncement = React.useMemo(() => {
    const selected = rows.find((row) => row.selected)
    if (selected) {
      return t('core:agentNavigator.live.selected', {
        label: selected.label,
        status: t(`core:agentNavigator.status.${selected.status}`, { defaultValue: selected.status }),
        defaultValue: '{{label}} · {{status}}',
      })
    }
    const attentionRow = rows.find((row) => (
      row.hiddenAttentionStatus
      || ['approval_required', 'waiting', 'failed', 'paused'].includes(row.status)
    ))
    if (!attentionRow) return ''
    const statusKey = attentionRow.hiddenAttentionStatus || attentionRow.status
    return t('core:agentNavigator.live.attention', {
      label: attentionRow.label,
      status: t(`core:agentNavigator.status.${statusKey}`, { defaultValue: statusKey }),
      defaultValue: '{{label}} needs attention · {{status}}',
    })
  }, [rows, t])

  React.useEffect(() => {
    const element = viewportRef.current
    if (!element || !model.virtualize) return undefined
    const sync = () => setScroll({ top: element.scrollTop, height: element.clientHeight })
    sync()
    element.addEventListener('scroll', sync, { passive: true })
    return () => element.removeEventListener('scroll', sync)
  }, [model.virtualize])

  const renderRow = React.useCallback((row, index) => (
    <AgentNavigatorRow
      key={row.key}
      row={row}
      focused={index === focusedIndex}
      statusLabel={t(`core:agentNavigator.status.${row.status}`, { defaultValue: row.status })}
      ageLabel={formatAge(t, row.ageMs)}
      hiddenLabel={t('core:agentNavigator.hidden', {
        count: row.hiddenDescendantCount,
        defaultValue: '+{{count}}',
      })}
      hiddenAttentionLabel={row.hiddenAttentionStatus
        ? t(`core:agentNavigator.status.${row.hiddenAttentionStatus}`, {
          defaultValue: row.hiddenAttentionStatus,
        })
        : ''}
      disclosureLabel={row.expanded
        ? t('core:agentNavigator.collapse', { defaultValue: 'Collapse' })
        : t('core:agentNavigator.expand', { defaultValue: 'Expand' })}
      partialVisibilityLabel={t('core:agentNavigator.partialVisibility', {
        defaultValue: 'provider-managed, partial visibility',
      })}
      onSelect={handleSelect}
      onToggle={handleToggle}
      registerRef={(node) => {
        if (node) rowRefs.current.set(index, node)
        else rowRefs.current.delete(index)
      }}
    />
  ), [focusedIndex, handleSelect, handleToggle, t])

  return (
    <aside
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface"
      data-ui="agent-navigator-panel"
    >
      <div className="sr-only" aria-live="polite" data-ui="agent-navigator-live">
        {attentionAnnouncement}
      </div>
      {!embeddedInCompanion ? (
        <div
          className="flex min-h-[52px] shrink-0 items-center justify-between border-b border-surface-border px-3"
          data-ui="agent-navigator-header"
        >
          <span className="font-display text-xs font-semibold text-text-primary">
            {t('core:agentNavigator.title', { defaultValue: 'Agents' })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openSettingsTarget({ categoryId: 'agents', sectionId: 'moa-agents' })}
              title={t('core:agentNavigator.settings', { defaultValue: 'Agent settings' })}
              aria-label={t('core:agentNavigator.settings', { defaultValue: 'Agent settings' })}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-panel hover:text-text-primary"
            >
              <Icon name="gear" size={14} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title={t('core:agentNavigator.close', { defaultValue: 'Close agents' })}
              aria-label={t('core:agentNavigator.close', { defaultValue: 'Close agents' })}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-panel hover:text-text-primary"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-y-auto px-1 pb-3"
        data-ui="agent-navigator-viewport"
      >
        {model.isEmpty ? (
          <p className="px-2 pt-6 text-center text-[11px] text-text-muted">
            {t('core:agentNavigator.emptyThread', { defaultValue: 'No agents in this thread.' })}
          </p>
        ) : (
          <div
            role="tree"
            aria-label={t('core:agentNavigator.title', { defaultValue: 'Agents' })}
            onKeyDown={handleKeyDown}
          >
            <AgentNavigatorSection
              label={t('core:agentNavigator.sectionActive', { defaultValue: 'Active' })}
              rows={model.active}
              indexOffset={0}
              virtualize={model.virtualize}
              scrollTop={scroll.top}
              viewportHeight={scroll.height}
              renderRow={renderRow}
              emptyMessage={t('core:agentNavigator.emptyActive', { defaultValue: 'No active agents' })}
            />

            {model.doneTotal > 0 ? (
              <AgentNavigatorSection
                label={t('core:agentNavigator.sectionDone', {
                  count: model.doneTotal,
                  defaultValue: 'Done · {{count}}',
                })}
                rows={model.done}
                indexOffset={model.active.length}
                virtualize={model.virtualize}
                scrollTop={scroll.top}
                viewportHeight={scroll.height}
                renderRow={renderRow}
                emptyMessage=""
              />
            ) : null}

            {model.doneHidden > 0 ? (
              <button
                type="button"
                onClick={handleShowMoreCompleted}
                className="mx-2 mt-1 rounded-md px-1 py-1 text-left text-[11px] text-text-tertiary transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                {t('core:agentNavigator.showMore', {
                  count: model.doneHidden,
                  defaultValue: 'Show {{count}} more',
                })}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  )
}
