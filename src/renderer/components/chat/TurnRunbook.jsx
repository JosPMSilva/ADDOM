import React, { useMemo, useState } from 'react'
import useChatStore from '../../store/useChatStore.js'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { MemoToolActivityLine } from './ToolActivityLine.jsx'
import { collectTurnFileChanges } from './turn-file-changes.mjs'
import { resolveCompletedTurnStatus } from '../../store/chat/turn-status-classifier.mjs'

const FILE_TOOL_NAMES = new Set(['write_file', 'edit_file', 'delete_file', 'rename_file'])
const ACCOUNT_AUTH_HIDDEN_EVENT_KINDS = new Set([
  'chat_cost_estimate',
  'continuity_packet_built',
  'openai_continuity_status',
])

function shouldHideAccountAuthRunbookActivity(activity = {}, contextUsage = {}) {
  const authMethod = String(activity.authMethod || contextUsage?.authMethod || '').trim().toLowerCase()
  if (authMethod !== 'account') return false

  const eventKind = String(activity.eventKind || '').trim().toLowerCase()
  if (ACCOUNT_AUTH_HIDDEN_EVENT_KINDS.has(eventKind)) return true

  if (eventKind === 'chat_usage') {
    const providerUsageAvailable = (
      typeof activity.providerUsageAvailable === 'boolean'
        ? activity.providerUsageAvailable
        : contextUsage?.providerUsageAvailable === true
    )
    const totalTokens = Number(
      activity.totalTokens
      || activity?.usage?.totalTokens
      || 0,
    ) || 0
    if (!providerUsageAvailable && totalTokens <= 0) return true
  }

  return false
}

function classifyActivity(activity = {}) {
  const type = String(activity.type || '').trim()
  const eventKind = String(activity.eventKind || '').trim()
  const toolName = String(activity.toolName || '').trim()
  const decision = String(activity.decision || '').trim()
  const isError = !!activity.isError

  const isReasoning = type === 'reasoning' || eventKind === 'reasoning_done'
  const isUsage = type === 'usage' || eventKind === 'chat_usage'
  const isFile = (
    type === 'file_change'
    || eventKind === 'file_change'
    || (activity.fileChange && typeof activity.fileChange === 'object')
    || (type === 'result' && FILE_TOOL_NAMES.has(toolName) && decision !== 'denied' && !isError)
  )

  const isCommand = (
    (type === 'executing' || (type === 'result' && toolName))
    && !isFile
    && !isReasoning
    && !isUsage
  )

  const isApproval = (
    !isCommand
    && (
      eventKind === 'approval_countdown'
      || eventKind === 'approval_timeout'
      || type === 'pending'
      || (type === 'result' && decision === 'denied')
    )
  )

  return {
    isApproval,
    isReasoning,
    isUsage,
    isFile,
    isCommand,
  }
}

function statusPill(turnState, turnStatus, activities, isStreaming, t = (key, options) => options?.defaultValue || key) {
  const state = String(turnState || '').trim().toLowerCase()
  if (state === 'cancelled') return { label: t('core:chat.runbook.status.cancelled', { defaultValue: 'stop requested' }), cls: 'text-warning-soft' }
  if (state === 'interrupted') return { label: t('core:chat.runbook.status.interrupted', { defaultValue: 'interrupted' }), cls: 'text-warning-soft' }
  if (state === 'completed') {
    const completedStatus = resolveCompletedTurnStatus({ turnStatus, activities })
    if (completedStatus === 'error') {
      return { label: t('core:chat.runbook.status.finishedWithErrors', { defaultValue: 'finished with errors' }), cls: 'text-warning-soft' }
    }
    if (completedStatus === 'warning') {
      return { label: t('core:chat.runbook.status.finishedWithWarnings', { defaultValue: 'finished with warnings' }), cls: 'text-warning-soft' }
    }
  }
  if (state === 'completed') return { label: t('core:chat.runbook.status.finished', { defaultValue: 'finished' }), cls: 'text-text-tertiary' }
  if (!isStreaming && (state === 'started' || state === '')) return { label: t('core:chat.runbook.status.finished', { defaultValue: 'finished' }), cls: 'text-text-tertiary' }
  return { label: t('core:chat.runbook.status.running', { defaultValue: 'running' }), cls: 'text-text-secondary' }
}

function Section({ title, count, children }) {
  if (count <= 0) return null
  return (
    <div className="space-y-1.5">
      <p className="chat-typo-runbook-section-label uppercase tracking-wide text-text-muted">
        {title} ({count})
      </p>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  )
}

export default function TurnRunbook({
  turnId = '',
  activities = [],
  fileChanges = null,
  initialExpanded = false,
}) {
  const { t } = useRendererTranslation(['core'])
  const [expanded, setExpanded] = useState(initialExpanded)
  const [filter, setFilter] = useState('all')
  const rows = useMemo(() => (Array.isArray(activities) ? activities : []), [activities])
  const ownerThreadId = useMemo(
    () => String(rows.find((activity) => String(activity?.threadId || '').trim())?.threadId || '').trim(),
    [rows],
  )
  const isGloballyStreaming = useChatStore((s) => {
    const activeThreadId = String(s.activeThreadId || '').trim()
    if (!ownerThreadId || ownerThreadId === activeThreadId) return !!s.streamingId
    return !!s.threadStateById?.[ownerThreadId]?.streamingId
  })
  const threadContextUsage = useChatStore((s) => {
    const activeThreadId = String(s.activeThreadId || '').trim()
    if (!ownerThreadId || ownerThreadId === activeThreadId) {
      return s.contextUsage && typeof s.contextUsage === 'object' ? s.contextUsage : {}
    }
    const threadState = s.threadStateById?.[ownerThreadId]
    return threadState?.contextUsage && typeof threadState.contextUsage === 'object'
      ? threadState.contextUsage
      : {}
  })
  const firstActivity = rows.find((a) => a && typeof a.createdAt === 'number' && a.createdAt > 0)
  const turnTs = firstActivity?.createdAt || 0
  const shortTurn = turnTs > 0
    ? new Date(turnTs).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
      })
    : String(turnId || '').trim().slice(-8) || 'n/a'

  const resolvedFileChanges = useMemo(
    () => (Array.isArray(fileChanges) ? fileChanges : collectTurnFileChanges(rows)),
    [fileChanges, rows],
  )
  const visibleRows = useMemo(
    () => rows.filter((activity) => !shouldHideAccountAuthRunbookActivity(activity, threadContextUsage)),
    [rows, threadContextUsage],
  )
  const grouped = useMemo(() => {
    const commands = []
    const usage = []
    const actions = []
    const files = resolvedFileChanges
    let turnState = ''
    let turnStatus = ''

    for (const activity of visibleRows) {
      if (!activity || typeof activity !== 'object') continue
      const type = String(activity.type || '').trim()
      if (type === 'turn') {
        turnState = String(activity.turnState || turnState || '').trim().toLowerCase()
        turnStatus = String(activity.turnStatus || turnStatus || '').trim().toLowerCase()
      }
      const cls = classifyActivity(activity)
      if (cls.isUsage) usage.push(activity)
      if (cls.isCommand) commands.push(activity)
      if (!cls.isUsage && !cls.isCommand && !cls.isFile) {
        actions.push(activity)
      }
    }

    return {
      commands,
      files,
      usage,
      actions,
      turnState,
      turnStatus,
    }
  }, [resolvedFileChanges, visibleRows])

  const pill = statusPill(
    grouped.turnState,
    grouped.turnStatus,
    visibleRows,
    isGloballyStreaming,
    t,
  )

  const filterButtons = [
    { id: 'all', label: t('core:chat.runbook.filters.all', { defaultValue: 'All' }) },
    { id: 'commands', label: t('core:chat.runbook.filters.commands', { defaultValue: 'Commands' }) },
    { id: 'usage', label: t('core:chat.runbook.filters.usage', { defaultValue: 'Usage' }) },
    { id: 'reasoning', label: t('core:chat.runbook.filters.reasoning', { defaultValue: 'Reasoning' }) },
    { id: 'approvals', label: t('core:chat.runbook.filters.approvals', { defaultValue: 'Approvals' }) },
  ]

  const showSection = (section) => {
    if (filter === 'all') return true
    if (section === 'commands') return filter === 'commands'
    if (section === 'usage') return filter === 'usage'
    if (section === 'actions') return filter === 'reasoning' || filter === 'approvals'
    return false
  }

  const actionRows = grouped.actions.filter((row) => {
    if (filter === 'reasoning') return classifyActivity(row).isReasoning
    if (filter === 'approvals') return classifyActivity(row).isApproval
    return true
  })

  return (
    <div
      id={`turn-runbook-${String(turnId || '').trim()}`}
      className={[
        'align-top min-w-0',
        expanded ? 'w-full max-w-[80%]' : 'inline-block w-fit max-w-[80%]',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={[
          'inline-flex max-w-full items-center gap-1.5 text-left transition-colors',
          expanded ? 'w-full pb-1.5 border-b border-surface-border/60' : 'hover:opacity-80',
        ].join(' ')}
        aria-label={expanded
          ? t('core:chat.runbook.aria.collapse', { defaultValue: 'Collapse turn runbook' })
          : t('core:chat.runbook.aria.expand', { defaultValue: 'Expand turn runbook' })}
        aria-expanded={expanded}
        aria-controls={`turn-runbook-panel-${String(turnId || '').trim()}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`w-2.5 h-2.5 shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="chat-typo-runbook-header-meta text-text-muted">{shortTurn}</span>
        <span className={`chat-typo-runbook-header-meta ${pill.cls}`}>{pill.label}</span>
        {!expanded && grouped.files.length > 0 && (
          <span className="chat-typo-runbook-header-detail text-text-muted">
            · {grouped.files.length} file{grouped.files.length === 1 ? '' : 's'}
          </span>
        )}
      </button>

      {expanded && (
        <div id={`turn-runbook-panel-${String(turnId || '').trim()}`} className="mt-1.5 space-y-2 border-t border-chat-border pt-2">
          <div className="chat-typo-runbook-summary flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
            <span>{t('core:chat.runbook.summary.actions', { defaultValue: 'actions {{count}}', count: grouped.actions.length })}</span>
            <span>{t('core:chat.runbook.summary.commands', { defaultValue: 'commands {{count}}', count: grouped.commands.length })}</span>
            <span>{t('core:chat.runbook.summary.files', { defaultValue: 'files {{count}}', count: grouped.files.length })}</span>
            <span>{t('core:chat.runbook.summary.usage', { defaultValue: 'usage {{count}}', count: grouped.usage.length })}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filterButtons.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={[
                  'chat-typo-runbook-filter rounded-md border bg-surface-panel-alt px-2 py-1 transition-colors',
                  filter === chip.id
                    ? 'border-accent text-accent-soft'
                    : 'border-surface-border text-text-secondary hover:border-border-hover',
                ].join(' ')}
                aria-pressed={filter === chip.id}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {showSection('actions') && (
            <Section title={t('core:chat.runbook.sections.actions', { defaultValue: 'Actions' })} count={actionRows.length}>
              {actionRows.map((activity) => (
                <MemoToolActivityLine key={activity.id} activity={activity} />
              ))}
            </Section>
          )}

          {showSection('commands') && (
            <Section title={t('core:chat.runbook.sections.commands', { defaultValue: 'Commands' })} count={grouped.commands.length}>
              {grouped.commands.map((activity) => (
                <MemoToolActivityLine key={activity.id} activity={activity} />
              ))}
            </Section>
          )}

          {showSection('usage') && (
            <Section title={t('core:chat.runbook.sections.usage', { defaultValue: 'Usage' })} count={grouped.usage.length}>
              {grouped.usage.map((activity) => (
                <MemoToolActivityLine key={activity.id} activity={activity} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
