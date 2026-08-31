import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { stripAnsiControlSequences } from './ansi-output.mjs'
import {
  buildExecutionStreamActivityRow,
  coalesceExecutionStreamEvents,
  isExecutionStreamEventVisible,
} from './live-execution-stream-view-model.mjs'
import StreamActivityRow from './live-execution-stream-activity.jsx'
import {
  buildRenderItems,
  ReasoningArchiveRow,
  ReasoningDisplayRow,
} from './live-execution-stream-reasoning.jsx'
import LiveExecutionStreamHeader from './LiveExecutionStreamHeader.jsx'
import CanonicalExecutionStream from './CanonicalExecutionStream.jsx'
import useAgentRunStore from '../../store/useAgentRunStore.js'
import {
  agentReferenceFingerprint,
  insertAgentReferenceGroups,
  selectTurnAgentReferences,
} from '../../store/agents/agent-stream-references.mjs'
import { buildExecutionStreamItems } from './live-execution-stream-items.mjs'
import { resolveExecutionCapabilityProfile, EXECUTION_CAPABILITY_PROFILES, resolveExecutionFamilyFromProviderId } from '../../../common/chat/execution-capabilities.mjs'
const INITIAL_RENDER_ITEM_LIMIT = 80, RENDER_ITEM_BATCH_SIZE = 80

function useExecutionStreamTranslate() {
  const { t } = useRendererTranslation(['core'])
  return t
}

async function writeClipboardText(text) {
  const value = String(text ?? '')
  if (!value) return false
  if (typeof navigator === 'undefined' || !navigator?.clipboard?.writeText) return false
  await navigator.clipboard.writeText(value)
  return true
}

function buildSessionMetaById(events = []) {
  const metaBySessionId = new Map()
  for (const event of events) {
    const sessionId = String(event?.sessionId || '').trim()
    if (!sessionId) continue
    const existing = metaBySessionId.get(sessionId) || {
      commandText: '',
      outputLabel: '',
      cwd: '',
      shell: '',
      persistedPreviewByStream: {
        stdout: '',
        stderr: '',
      },
      outputByStream: {
        stdout: '',
        stderr: '',
      },
    }
    const activity = event?.activity && typeof event.activity === 'object' ? event.activity : null
    const toolInput = activity?.toolInput && typeof activity.toolInput === 'object' ? activity.toolInput : null
    const commandText = String(toolInput?.command || '').trim()
    if (!existing.commandText && commandText) {
      existing.commandText = commandText
    }
    const cwd = String(toolInput?.cwd || '').trim()
    if (!existing.cwd && cwd) existing.cwd = cwd
    const shell = String(toolInput?.shell || '').trim()
    if (!existing.shell && shell) existing.shell = shell
    const stdoutPreview = stripAnsiControlSequences(activity?.stdoutPreview || '').trim()
    if (stdoutPreview) existing.persistedPreviewByStream.stdout = stdoutPreview
    const stderrPreview = stripAnsiControlSequences(activity?.stderrPreview || '').trim()
    if (stderrPreview) existing.persistedPreviewByStream.stderr = stderrPreview
    const terminalSession = activity?.terminalSession && typeof activity.terminalSession === 'object'
      ? activity.terminalSession
      : null
    const terminalSessionId = String(terminalSession?.sessionId || '').trim()
    if (!existing.outputLabel && terminalSessionId) {
      existing.outputLabel = `terminal ${terminalSessionId}`
    }
    const terminalOutputPreview = stripAnsiControlSequences(terminalSession?.outputPreview || '').trim()
    if (terminalOutputPreview && !existing.persistedPreviewByStream.stdout) {
      existing.persistedPreviewByStream.stdout = terminalOutputPreview
    }
    if (String(event?.kind || '').trim() === 'tool_output') {
      const stream = String(event?.stream || 'stdout').trim().toLowerCase() === 'stderr' ? 'stderr' : 'stdout'
      const outputText = stripAnsiControlSequences(event?.detail || '').trim()
      if (outputText) existing.outputByStream[stream] = outputText
    }
    metaBySessionId.set(sessionId, existing)
  }
  return metaBySessionId
}

function resolveEventToolName(event = {}) {
  const directToolName = String(event?.toolName || '').trim()
  if (directToolName) return directToolName.toLowerCase()
  const activityToolName = String(event?.activity?.toolName || '').trim()
  return activityToolName.toLowerCase()
}

function resolveMoaAgentEventKey(event = {}) {
  const activity = event?.activity && typeof event.activity === 'object' ? event.activity : {}
  const moa = activity?.moa && typeof activity.moa === 'object' ? activity.moa : {}
  const taskId = String(moa?.taskId || '').trim()
  const roleId = String(moa?.agentRoleId || '').trim().toLowerCase()
  const role = String(moa?.agentRole || '').trim().toLowerCase()
  if (taskId) return `task:${taskId}`
  if (roleId) return `role:${roleId}`
  if (role) return `role-name:${role}`
  return ''
}

function isProviderCompactionEvent(event = {}) {
  const activity = event?.activity && typeof event.activity === 'object' ? event.activity : {}
  const eventKind = String(activity?.eventKind || event?.eventKind || '').trim().toLowerCase()
  if (eventKind !== 'openai_compaction_event') return false
  const status = String(activity?.status || event?.status || '').trim().toLowerCase()
  return (
    status === 'requested'
    || status === 'running'
    || activity?.compactionMilestone === true
  )
}

function ExecutionOutputCopyMenu({
  eventId = '',
  commandText = '',
  detail = '',
  persistedPreview = '',
}) {
  const t = useExecutionStreamTranslate()
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef(null)
  const menuId = eventId ? `live-execution-copy-menu-${eventId}` : undefined
  const items = useMemo(() => {
    const nextItems = [
      commandText
        ? {
            key: 'command',
            label: t('core:executionStream.output.copyCommand', { defaultValue: 'Copy command' }),
            text: commandText,
          }
        : null,
      {
        key: 'visible-output',
        label: t('core:executionStream.output.copyVisibleOutput', { defaultValue: 'Copy visible output' }),
        text: detail,
      },
      persistedPreview
        ? {
            key: 'persisted-preview',
            label: t('core:executionStream.output.copyPersistedPreview', { defaultValue: 'Copy persisted preview' }),
            text: persistedPreview,
          }
        : null,
    ]
    return nextItems.filter(Boolean)
  }, [commandText, detail, persistedPreview, t])

  useEffect(() => {
    if (!menuOpen || typeof document === 'undefined') return undefined
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (String(event?.key || '') === 'Escape') {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  async function handleCopyClick(text) {
    try {
      await writeClipboardText(text)
    } finally {
      setMenuOpen(false)
    }
  }

  if (items.length <= 0) return null

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-surface-border/65 bg-surface-panel/60 text-text-tertiary transition-colors hover:border-border-hover hover:bg-surface-panel hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        aria-label={t('core:executionStream.output.openCopyOptions', { defaultValue: 'Open copy options' })}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        data-ui="execution-output-copy-trigger"
        onClick={(event) => {
          event.stopPropagation()
          setMenuOpen((value) => !value)
        }}
      >
        <span aria-hidden="true" className="ph ph-copy text-sm leading-none" />
      </button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 min-w-[12.5rem] overflow-hidden rounded-lg border border-surface-border/70 bg-surface-panel-alt/95 p-1 shadow-lg"
          data-ui="execution-output-copy-menu"
          onClick={(event) => event.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              onClick={() => {
                void handleCopyClick(item.text)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ExecutionOutputRow({
  event = {},
  expanded = false,
  onToggle = () => {},
  sessionMeta = null,
}) {
  const t = useExecutionStreamTranslate()
  const detail = stripAnsiControlSequences(event?.detail || '')
  const stream = String(event?.stream || 'stdout').trim().toLowerCase()
  const truncated = event?.truncated === true
  const commandText = String(sessionMeta?.commandText || '').trim()
  const outputLabel = String(sessionMeta?.outputLabel || '').trim()
  const persistedPreview = String(sessionMeta?.persistedPreviewByStream?.[stream] || '').trim()
  const eventId = String(event?.id || '').trim()
  const detailPanelId = eventId ? `live-execution-output-panel-${eventId}` : undefined
  const titleText = commandText || outputLabel || t('core:executionStream.output.commandOutput', { defaultValue: 'Command output' })
  const detailPreview = String(detail.split(/\r?\n/).find((line) => String(line || '').trim()) || '').trim()

  if (!detail) return null

  return (
    <div className="group relative overflow-visible rounded-lg border border-surface-border/55 bg-surface-panel-alt/45 px-3.5 py-3 transition-colors hover:border-surface-border/80 hover:bg-surface-panel-alt/55 focus-within:border-accent/35 focus-within:bg-surface-panel-alt/60">
      <div className="flex w-full items-start gap-3 text-left">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-xl px-0.5 py-0.5 text-left transition-colors hover:text-text-primary active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          aria-expanded={expanded}
          aria-controls={detailPanelId}
          aria-label={expanded
            ? t('core:executionStream.output.hideCommandOutput', { defaultValue: 'Hide command output' })
            : t('core:executionStream.output.showCommandOutput', { defaultValue: 'Show command output' })}
        >
          <span className="chat-typo-exec-output-label block min-w-0 max-w-full truncate font-mono font-medium normal-case text-text-primary select-text">
            {titleText}
          </span>
          {(truncated || detailPreview) && (
            <span className="chat-typo-exec-output-meta block min-w-0 max-w-full truncate text-text-tertiary select-text">
              {truncated
                ? t('core:executionStream.output.truncated', { defaultValue: 'Output truncated' })
                : detailPreview}
            </span>
          )}
        </button>
        <ExecutionOutputCopyMenu
          eventId={eventId}
          commandText={commandText}
          detail={detail}
          persistedPreview={persistedPreview}
        />
      </div>
      <div
        className={`grid transition-all duration-300 ease-in-out ${expanded ? 'grid-rows-[1fr] mt-2' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <pre
            id={detailPanelId}
            className="chat-typo-exec-output-body max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface-panel/45 px-3 py-2.5 font-mono text-text-primary select-text"
          >
            {detail}
          </pre>
        </div>
      </div>
    </div>
  )
}

function resolveTurnExecutionProviderFamily(turn = {}) {
  const directProviderId = String(turn?.providerId || '').trim().toLowerCase()
  if (directProviderId) return resolveExecutionFamilyFromProviderId(directProviderId)
  for (const event of Object.values(turn?.eventsById || {})) {
    const providerId = String(
      event?.streamMeta?.providerId
      || event?.reasoningMeta?.providerId
      || event?.activity?.providerId
      || '',
    ).trim().toLowerCase()
    if (providerId) return resolveExecutionFamilyFromProviderId(providerId)
  }
  return ''
}

function formatExecutionStreamStatusLabel(t, status = '', isLiveTurn = false) {
  const normalized = String(status || '').trim().toLowerCase()
  if (isLiveTurn) return 'Working…'
  if (normalized === 'error' || normalized === 'failed' || normalized === 'timeout') {
    return 'Failed'
  }
  if (normalized === 'interrupted') {
    return 'Interrupted'
  }
  if (normalized === 'cancelled') {
    return 'Cancelled'
  }
  return 'Completed'
}

export default function LiveExecutionStreamBlock({
  turn = null,
  isLiveTurn = false,
  finalAnswerStarted = false,
  onContinueInterruptedTurn,
  headerDockPosition = '',
  filesHint = null,
}) {
  const t = useExecutionStreamTranslate()
  const eventOrder = useMemo(
    () => (Array.isArray(turn?.eventOrder) ? turn.eventOrder : []),
    [turn?.eventOrder],
  )
  const eventsById = useMemo(
    () => (turn?.eventsById && typeof turn.eventsById === 'object' ? turn.eventsById : {}),
    [turn?.eventsById],
  )
  const events = useMemo(() => (
    eventOrder
      .map((eventId) => eventsById[eventId])
      .filter(Boolean)
  ), [eventOrder, eventsById])
  const visibleEvents = useMemo(() => {
    let baseVisible = events.filter((event) => {
      if (!isExecutionStreamEventVisible(event)) return false
      if (String(event?.kind || '').trim().toLowerCase() !== 'tool_output') return true
      return !resolveEventToolName(event).startsWith('terminal_session_')
    })
    const hasProviderCompaction = baseVisible.some((event) => isProviderCompactionEvent(event))
    if (hasProviderCompaction) {
      baseVisible = baseVisible.filter((event) => {
        const activity = event?.activity && typeof event.activity === 'object' ? event.activity : {}
        return String(activity?.eventKind || event?.eventKind || '').trim().toLowerCase() !== 'turn_started'
      })
    }

    // Deduplicate lifecycle events: if a session has a terminal event (result/error),
    // hide its preceding intermediate events (start/progress) to reduce visual clutter.
    const terminalSessions = new Set()
    const finishedMoaAgents = new Set()
    for (const event of baseVisible) {
      const kind = String(event?.kind || '').trim().toLowerCase()
      if (kind === 'tool_result' || kind === 'error') {
        const sessionId = String(event?.sessionId || '').trim()
        if (sessionId) terminalSessions.add(sessionId)
      }
      const eventKind = String(event?.activity?.eventKind || '').trim().toLowerCase()
      if (eventKind === 'moa_agent_done' || eventKind === 'moa_agent_error') {
        const key = resolveMoaAgentEventKey(event)
        if (key) finishedMoaAgents.add(key)
      }
    }

    return coalesceExecutionStreamEvents(baseVisible.filter((event) => {
      const kind = String(event?.kind || '').trim().toLowerCase()
      if (kind === 'tool_start' || kind === 'tool_progress') {
        const sessionId = String(event?.sessionId || '').trim()
        if (sessionId && terminalSessions.has(sessionId)) return false
      }
      const eventKind = String(event?.activity?.eventKind || '').trim().toLowerCase()
      if (eventKind === 'moa_agent_start') {
        const key = resolveMoaAgentEventKey(event)
        if (key && finishedMoaAgents.has(key)) return false
      }
      return true
    }))
  }, [events])
  const deferredVisibleEvents = useDeferredValue(visibleEvents)
  const renderItems = useMemo(() => buildRenderItems(deferredVisibleEvents), [deferredVisibleEvents])
  const hasCanonicalState = Array.isArray(turn?.itemOrder)
  const capabilityProfile = useMemo(() => {
    const family = resolveTurnExecutionProviderFamily(turn)
    if (!family) return EXECUTION_CAPABILITY_PROFILES.reasoning_and_tools
    return resolveExecutionCapabilityProfile({ family })
  }, [turn])
  const canonicalItems = useMemo(() => (
    hasCanonicalState
      ? buildExecutionStreamItems(turn, capabilityProfile)
      : []
  ), [capabilityProfile, hasCanonicalState, turn])
  // A fingerprint keeps this turn off the agent event hot path: it re-renders only when one of its
  // own child references would look different.
  const agentFingerprint = useAgentRunStore(
    (state) => agentReferenceFingerprint(state, turn?.turnId),
  )
  const streamItems = useMemo(() => {
    if (!agentFingerprint) return canonicalItems
    const references = selectTurnAgentReferences(useAgentRunStore.getState(), turn?.turnId)
    return insertAgentReferenceGroups(canonicalItems, references)
  }, [agentFingerprint, canonicalItems, turn?.turnId])

  const [expanded, setExpanded] = useState(() => isLiveTurn)
  const [expandedOutputById, setExpandedOutputById] = useState({})
  const [expandedPreviewById, setExpandedPreviewById] = useState({})
  const [visibleItemCount, setVisibleItemCount] = useState(INITIAL_RENDER_ITEM_LIMIT)
  const [userToggled, setUserToggled] = useState(false)
  const previousFinalAnswerStartedRef = useRef(finalAnswerStarted)
  const sessionMetaById = useMemo(() => buildSessionMetaById(events), [events])
  const boundedVisibleItemCount = Math.max(0, Math.min(renderItems.length, visibleItemCount))
  const {
    hiddenItemCount,
    pinnedArchiveCount,
    visibleTailItemCount,
    visibleRenderItems,
  } = useMemo(() => {
    const hiddenCount = Math.max(0, renderItems.length - boundedVisibleItemCount)
    if (hiddenCount <= 0) {
      return {
        hiddenItemCount: 0,
        pinnedArchiveCount: 0,
        visibleTailItemCount: renderItems.length,
        visibleRenderItems: renderItems,
      }
    }

    const defaultTailItems = renderItems.slice(-boundedVisibleItemCount)
    const defaultTailItemIds = new Set(
      defaultTailItems
        .map((item) => String(item?.id || item?.event?.id || '').trim())
        .filter(Boolean),
    )
    const hiddenArchiveItems = renderItems.filter((item) => (
      item?.type === 'reasoning_archive'
      && !defaultTailItemIds.has(String(item?.id || item?.event?.id || '').trim())
    ))
    if (hiddenArchiveItems.length <= 0) {
      return {
        hiddenItemCount: hiddenCount,
        pinnedArchiveCount: 0,
        visibleTailItemCount: defaultTailItems.length,
        visibleRenderItems: defaultTailItems,
      }
    }

    const pinnedArchives = hiddenArchiveItems.slice(-Math.min(hiddenArchiveItems.length, boundedVisibleItemCount))
    const pinnedArchiveIds = new Set(
      pinnedArchives
        .map((item) => String(item?.id || item?.event?.id || '').trim())
        .filter(Boolean),
    )
    const tailCount = Math.max(0, boundedVisibleItemCount - pinnedArchives.length)
    const tailItems = tailCount > 0
      ? renderItems
          .slice(-tailCount)
          .filter((item) => !pinnedArchiveIds.has(String(item?.id || item?.event?.id || '').trim()))
      : []

    return {
      hiddenItemCount: hiddenCount,
      pinnedArchiveCount: pinnedArchives.length,
      visibleTailItemCount: tailItems.length,
      visibleRenderItems: [...pinnedArchives, ...tailItems],
    }
  }, [boundedVisibleItemCount, renderItems])
  useEffect(() => {
    setExpanded(true)
    setExpandedOutputById({})
    setExpandedPreviewById({})
    setVisibleItemCount(INITIAL_RENDER_ITEM_LIMIT)
    setUserToggled(false)
    previousFinalAnswerStartedRef.current = false
  }, [turn?.turnId])

  useEffect(() => {
    if (isLiveTurn) {
      if (!userToggled) {
        setExpanded(true)
      }
      return
    }
  }, [isLiveTurn, userToggled])

  useEffect(() => {
    const wasStarted = previousFinalAnswerStartedRef.current
    previousFinalAnswerStartedRef.current = finalAnswerStarted
    if (!wasStarted && finalAnswerStarted && !userToggled) {
      setExpanded(false)
    }
  }, [finalAnswerStarted, userToggled])

  useEffect(() => {
    setVisibleItemCount((current) => {
      const minimum = Math.min(renderItems.length, INITIAL_RENDER_ITEM_LIMIT)
      return Math.min(renderItems.length, Math.max(minimum, current))
    })
  }, [renderItems.length])

  useEffect(() => {
    setExpandedOutputById((current) => {
      let changed = false
      const next = { ...current }
      for (const event of events) {
        if (String(event?.kind || '').trim() !== 'tool_output') continue
        const eventId = String(event?.id || '').trim()
        if (!eventId || Object.prototype.hasOwnProperty.call(next, eventId)) continue
        next[eventId] = String(event?.status || '').trim().toLowerCase() === 'active'
        changed = true
      }
      return changed ? next : current
    })
  }, [events])

  useEffect(() => {
    setExpandedPreviewById((current) => {
      let changed = false
      const next = { ...current }
      for (const item of visibleRenderItems) {
        const event = item?.event || null
        if (!event) continue
        const row = buildExecutionStreamActivityRow(
          event,
          sessionMetaById.get(String(event?.sessionId || '').trim()) || null,
        )
        const rowId = String(row?.id || event?.id || '').trim()
        if (!rowId || !row?.isChild || !String(row?.richContentText || '').trim()) continue
        if (Object.prototype.hasOwnProperty.call(next, rowId)) continue
        next[rowId] = true
        changed = true
      }
      return changed ? next : current
    })
  }, [sessionMetaById, visibleRenderItems])

  const turnPanelId = String(turn?.turnId || '').trim()
    ? `live-execution-turn-panel-${String(turn.turnId).trim()}`
    : undefined
  const normalizedTurnStatus = String(turn?.status || (isLiveTurn ? 'active' : 'done')).trim().toLowerCase()
  const statusLabel = formatExecutionStreamStatusLabel(t, normalizedTurnStatus, isLiveTurn)
  const latestActiveReasoningEventId = useMemo(() => {
    let latestId = ''
    for (const event of deferredVisibleEvents) {
      if (String(event?.kind || '').trim() !== 'reasoning') continue
      if (String(event?.status || '').trim().toLowerCase() !== 'active') continue
      latestId = String(event?.id || '').trim()
    }
    return latestId
  }, [deferredVisibleEvents])
  const itemCount = hasCanonicalState ? streamItems.length : renderItems.length
  const shouldRenderPendingPlaceholder = itemCount === 0 && isLiveTurn
  const shouldRenderInterruptedAction = normalizedTurnStatus === 'interrupted'
    && typeof onContinueInterruptedTurn === 'function'

  if (itemCount === 0 && !shouldRenderPendingPlaceholder && !shouldRenderInterruptedAction) return null

  return (
    <section
      data-live-execution-stream-root="true"
      data-turn-header-dock={headerDockPosition || undefined}
      data-turn-header-dock-joined={headerDockPosition ? 'true' : undefined}
      className={headerDockPosition
        ? ''
        : 'rounded-lg bg-surface-panel-alt shadow-[0_8px_20px_rgb(var(--theme-shadow-rgb)_/_0.14)]'}
    >
      <div
        className="px-1 py-1"
        data-ui="live-execution-header-shell"
        data-floating={headerDockPosition ? 'false' : 'true'}
      >
        <LiveExecutionStreamHeader
          t={t}
          expanded={expanded}
          onToggle={() => {
            setUserToggled(true)
            setExpanded((value) => !value)
          }}
          panelId={turnPanelId}
          isLiveTurn={isLiveTurn}
          statusLabel={statusLabel}
          turn={turn}
          onContinue={shouldRenderInterruptedAction
            ? () => onContinueInterruptedTurn(turn)
            : null}
          filesHint={filesHint}
        />
      </div>

      <div
        id={turnPanelId}
        className={expanded ? 'px-1 pb-1 pt-1' : 'hidden'}
        hidden={!expanded}
      >
        {hiddenItemCount > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-surface-border/60 bg-surface/30 px-3 py-2">
            <p className="chat-typo-exec-header-meta text-text-tertiary">
              {pinnedArchiveCount > 0
                ? t('core:executionStream.header.hiddenSummaryPinned', {
                  defaultValue: 'Showing the latest {{visibleTailItemCount}} events plus {{pinnedArchiveCount}} collapsed earlier reasoning block{{archiveSuffix}}. {{hiddenItemCount}} earlier event{{eventSuffix}} hidden.',
                  visibleTailItemCount,
                  pinnedArchiveCount,
                  archiveSuffix: pinnedArchiveCount === 1 ? '' : 's',
                  hiddenItemCount,
                  eventSuffix: hiddenItemCount === 1 ? '' : 's',
                })
                : t('core:executionStream.header.hiddenSummary', {
                  defaultValue: 'Showing the latest {{visibleItemCount}} events. {{hiddenItemCount}} earlier event{{eventSuffix}} hidden.',
                  visibleItemCount: boundedVisibleItemCount,
                  hiddenItemCount,
                  eventSuffix: hiddenItemCount === 1 ? '' : 's',
                })}
            </p>
            <button
              type="button"
              onClick={() => {
                setVisibleItemCount((current) => Math.min(renderItems.length, current + RENDER_ITEM_BATCH_SIZE))
              }}
              className="rounded-md border border-surface-border/70 bg-surface-panel px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
              data-ui="live-execution-show-earlier"
            >
              {t('core:executionStream.showEarlier', {
                defaultValue: 'Show {{count}} earlier event{{suffix}}',
                count: Math.min(hiddenItemCount, RENDER_ITEM_BATCH_SIZE),
                suffix: Math.min(hiddenItemCount, RENDER_ITEM_BATCH_SIZE) === 1 ? '' : 's',
              })}
            </button>
          </div>
        )}
        <div className="space-y-2">
          {hasCanonicalState ? (
            <CanonicalExecutionStream
              items={streamItems}
              collapseReasoning={!isLiveTurn}
            />
          ) : shouldRenderPendingPlaceholder ? (
            <StreamActivityRow
              row={{
                id: `live-execution-placeholder:${String(turn?.turnId || 'active').trim() || 'active'}`,
                label: t('core:executionStream.transport.startingTurn', { defaultValue: 'Starting turn' }),
                toneClass: 'text-text-primary',
                showDots: true,
              }}
            />
          ) : visibleRenderItems.map((item) => {
            if (item?.type === 'reasoning_archive') {
              return (
                <ReasoningArchiveRow
                  key={item.id || String(item?.event?.id || '')}
                  event={item.event}
                  archiveItems={item.archiveItems}
                />
              )
            }
            if (item?.type === 'reasoning_item' || item?.type === 'reasoning_group') {
              const reasoningEvents = Array.isArray(item.events) ? item.events : []
              return (
                <ReasoningDisplayRow
                  key={item.id || String(item?.event?.id || '')}
                  item={item}
                  isLiveTurn={isLiveTurn}
                  showCursor={isLiveTurn && (
                    item?.type === 'reasoning_group'
                      ? reasoningEvents.some((event) => String(event?.id || '').trim() === latestActiveReasoningEventId)
                      : String(item?.event?.id || '').trim() === latestActiveReasoningEventId
                  )}
                />
              )
            }
            const event = item?.event || null
            if (!event) return null
            const eventKind = String(event?.kind || '').trim()
            if (eventKind === 'tool_output') {
              const eventId = String(event?.id || '').trim()
              const toolName = String(event?.toolName || event?.activity?.toolName || '').trim().toLowerCase()
              const isShellOutput = toolName === 'run_command' || toolName === 'local_shell'
              const outputCard = (
                <ExecutionOutputRow
                  key={event.id}
                  event={event}
                  expanded={expandedOutputById[eventId] === true}
                  onToggle={() => {
                    if (!eventId) return
                    setExpandedOutputById((current) => ({
                      ...current,
                      [eventId]: !current[eventId],
                    }))
                  }}
                  sessionMeta={sessionMetaById.get(String(event?.sessionId || '').trim()) || null}
                />
              )
              if (isShellOutput) {
                return (
                  <div key={event.id} className="py-1 group relative" data-chat-render="execution-row">
                    <div className="flex items-center gap-2 whitespace-pre-wrap break-words select-text chat-typo-exec-row-label text-text-tertiary">
                      <span className="min-w-0">
                        <span className="font-medium text-text-secondary">Ran</span>
                        <span className="font-normal text-text-tertiary"> command</span>
                      </span>
                    </div>
                    <div className="mt-1 ml-6">
                      {outputCard}
                    </div>
                  </div>
                )
              }
              return (
                outputCard
              )
            }
            const row = buildExecutionStreamActivityRow(
              event,
              sessionMetaById.get(String(event?.sessionId || '').trim()) || null,
            )
            const rowId = String(row?.id || event?.id || '').trim()
            return (
              <StreamActivityRow
                key={event.id}
                row={row}
                previewExpanded={rowId ? expandedPreviewById[rowId] === true : false}
                onTogglePreview={() => {
                  if (!rowId) return
                  setExpandedPreviewById((current) => ({
                    ...current,
                    [rowId]: !current[rowId],
                  }))
                }}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
