import React, { useEffect, useRef, useState } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { formatDateTime, useRendererFormattingLocale } from '../../i18n/formatters.mjs'
import { DIALOG_Z_STANDARD } from '../dialog-layering.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import { useDialogEscapeDismiss } from '../use-dialog-escape-dismiss.mjs'
import Icon from '../ui/Icon.jsx'
function EmbedderBadge({ state, progress }) {
  const { t } = useRendererTranslation(['core'])
  if (state === 'ready' || state === 'idle') return null
  const label = state === 'downloading'
    ? t('core:memoryPanel.embedder.downloading', {
      defaultValue: 'Downloading model {{progress}}%',
      progress,
    })
    : state === 'loading'
      ? t('core:memoryPanel.embedder.loading', { defaultValue: 'Loading model...' })
      : state === 'error'
        ? t('core:memoryPanel.embedder.unavailable', { defaultValue: 'Embedding unavailable' })
        : null
  if (!label) return null

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${state === 'error' ? 'text-danger' : 'text-text-muted'}`}>
      {state === 'downloading' || state === 'loading'
        ? <Icon name="spinner" className="animate-spin" size={10} />
        : <Icon name="warning-circle" size={10} />}
      {label}
    </span>
  )
}

function compactMemoryRef(value = '') {
  const normalized = String(value || '').trim()
  if (normalized.length <= 20) return normalized
  return `${normalized.slice(0, 10)}...${normalized.slice(-6)}`
}

function getMemoryNodeScopePresentation(node, t) {
  const scope = String(node?.scope || (node?.isGlobal ? 'global' : 'project')).trim().toLowerCase()
  if (scope === 'thread') {
    return {
      label: t('core:memoryPanel.badges.thread', { defaultValue: 'thread' }),
      icon: 'chat-circle-dots',
      className: 'text-text-muted',
    }
  }
  if (scope === 'global') {
    return {
      label: t('core:memoryPanel.badges.global', { defaultValue: 'global' }),
      icon: 'globe',
      className: 'text-text-muted',
    }
  }
  return {
    label: t('core:memoryPanel.badges.project', { defaultValue: 'project' }),
    icon: 'folder',
    className: 'text-text-muted',
  }
}

function getMemoryNodeLastUsedAt(node) {
  const candidate = Number(node?.lastUsedAt || node?.lastAccessed || 0)
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 0
}

export function MemoryNodeCard({
  node,
  onPin,
  onEdit,
  onDelete,
  onPromoteToProject = null,
  onKeepInThread = null,
  onMakeGlobal = null,
  onInvalidate = null,
}) {
  const { t } = useRendererTranslation(['core'])
  const formatLocale = useRendererFormattingLocale()
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const contentRef = useRef(null)
  const visibleTags = Array.isArray(node.displayTags) ? node.displayTags : (Array.isArray(node.tags) ? node.tags : [])
  const terminalProvenance = node?.provenance?.kind === 'terminal' ? node.provenance : null
  const scopeBadge = getMemoryNodeScopePresentation(node, t)
  const lastUsedAt = getMemoryNodeLastUsedAt(node)
  const invalidatedAt = Number(node?.invalidatedAt || 0) > 0 ? Number(node.invalidatedAt) : 0
  const originThreadId = String(node?.originThreadId || '').trim()
  const originThreadDeletedAt = Number(node?.originThreadDeletedAt || 0) > 0
    ? Number(node.originThreadDeletedAt)
    : 0
  const isDeletedThreadMemory = node?.scope === 'thread' && node?.originThreadState === 'deleted'
  const originThreadTitle = String(node?.originThreadTitle || originThreadId).trim()
  const cardActions = [
    onPromoteToProject
      ? {
          key: 'promote-project',
          onClick: onPromoteToProject,
          label: t('core:memoryPanel.actions.promoteToProject', { defaultValue: 'Promote to project' }),
        }
      : null,
    onKeepInThread
      ? {
          key: 'keep-thread',
          onClick: onKeepInThread,
          label: t('core:memoryPanel.actions.keepInThread', { defaultValue: 'Keep in this thread' }),
        }
      : null,
    onMakeGlobal
      ? {
          key: 'make-global',
          onClick: onMakeGlobal,
          label: t('core:memoryPanel.actions.makeGlobal', { defaultValue: 'Make global' }),
        }
      : null,
    onInvalidate
      ? {
          key: 'invalidate',
          onClick: onInvalidate,
          label: t('core:memoryPanel.actions.invalidate', { defaultValue: 'Invalidate' }),
          tone: 'danger',
        }
      : null,
  ].filter(Boolean)

  const sourceLabel = {
    user_memory: t('core:memoryPanel.source.userMemory', { defaultValue: 'User memory' }),
    workspace_event: t('core:memoryPanel.source.workspaceEvent', { defaultValue: 'Workspace event' }),
    terminal_summary: t('core:memoryPanel.source.terminalSummary', { defaultValue: 'Terminal summary' }),
    validated_decision: t('core:memoryPanel.source.validatedDecision', { defaultValue: 'Validated decision' }),
    reference_note: t('core:memoryPanel.source.referenceNote', { defaultValue: 'Reference note' }),
  }[node.source] ?? node.source

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const checkOverflow = () => {
      if (expanded) return
      setCanExpand(el.scrollHeight > el.clientHeight + 1)
    }
    checkOverflow()
    if (typeof window === 'undefined' || typeof window.ResizeObserver !== 'function') return
    const observer = new window.ResizeObserver(() => {
      checkOverflow()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [node.content, expanded])

  return (
    <div
      id={`memory-node-${node.id}`}
      data-memory-record="true"
      className={`group flex flex-col gap-2.5 border-b border-surface-border/60 px-1 py-4 ${node.pinned ? 'bg-surface-panel/25' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {node.pinned && <Icon name="push-pin" size={13} weight="fill" className="shrink-0 text-text-secondary" />}
          <div className="min-w-0 flex-1">
            <p title={`#${node.sortId} ${node.topic}`} className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold leading-snug tracking-tight text-text-primary font-display"><span className="mr-1.5 font-mono text-[10px] font-normal text-text-muted">#{node.sortId}</span>{node.topic}</p>
          </div>
          {node.compressed && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-text-muted">
              <Icon name="archive" size={10} /> {t('core:memoryPanel.badges.archived', { defaultValue: 'archived' })}
            </span>
          )}
          {isDeletedThreadMemory && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-text-muted">
              <Icon name="chat-circle-dots" size={10} />
              {t('core:memoryPanel.badges.deletedThread', { defaultValue: 'Deleted thread' })}
            </span>
          )}
          {invalidatedAt > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-danger">
              <Icon name="warning-circle" size={10} /> {t('core:memoryPanel.badges.invalidated', { defaultValue: 'invalidated' })}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn onClick={onPin} title={node.pinned ? t('core:memoryPanel.actions.unpin', { defaultValue: 'Unpin' }) : t('core:memoryPanel.actions.pin', { defaultValue: 'Pin' })}><Icon name={node.pinned ? "push-pin-slash" : "push-pin"} size={14} weight={node.pinned ? "regular" : "bold"} /></IconBtn>
          <IconBtn onClick={onEdit} title={t('core:memoryPanel.actions.edit', { defaultValue: 'Edit' })}><Icon name="pencil-simple" size={14} weight="bold" /></IconBtn>
          <IconBtn onClick={onDelete} title={t('core:memoryPanel.actions.delete', { defaultValue: 'Delete' })} danger><Icon name="trash" size={14} weight="bold" /></IconBtn>
        </div>
      </div>

      <p
        ref={contentRef}
        className={`text-text-secondary text-[12.5px] leading-relaxed whitespace-pre-wrap ${!expanded ? 'line-clamp-3' : ''
        }`}>
        {node.content}
      </p>

      {(lastUsedAt > 0 || originThreadId || invalidatedAt > 0 || isDeletedThreadMemory) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
          {lastUsedAt > 0 && (
            <span className="inline-flex items-center gap-1">
              <Icon name="clock-counter-clockwise" size={10} />
              {t('core:memoryPanel.meta.lastUsed', {
                defaultValue: 'Last used {{time}}',
                time: formatDateTime(lastUsedAt, {
                  locale: formatLocale,
                  fallback: '-',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </span>
          )}
          {isDeletedThreadMemory && (
            <span className="inline-flex items-center gap-1" title={originThreadId}>
              <Icon name="archive" size={10} />
              {t('core:memoryPanel.meta.deletedThreadOrigin', {
                defaultValue: '{{threadTitle}} · deleted {{time}}',
                threadTitle: originThreadTitle,
                time: formatDateTime(originThreadDeletedAt, {
                  locale: formatLocale,
                  fallback: '-',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </span>
          )}
          {originThreadId && !terminalProvenance?.threadId && !isDeletedThreadMemory && (
            <span className="inline-flex items-center gap-1">
              <Icon name="git-branch" size={10} />
              {t('core:memoryPanel.meta.originThread', {
                defaultValue: 'Origin {{threadId}}',
                threadId: compactMemoryRef(originThreadId),
              })}
            </span>
          )}
          {invalidatedAt > 0 && (
            <span className="inline-flex items-center gap-1 text-danger">
              <Icon name="warning-circle" size={10} />
              {t('core:memoryPanel.meta.invalidatedAt', {
                defaultValue: 'Invalidated {{time}}',
                time: formatDateTime(invalidatedAt, {
                  locale: formatLocale,
                  fallback: '-',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </span>
          )}
        </div>
      )}

      {terminalProvenance && (
        <dl
          aria-label={t('core:memoryPanel.provenance.ariaLabel', { defaultValue: 'Memory provenance' })}
          className="grid gap-1 border-l border-surface-border pl-3 text-[11px] text-text-secondary"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <dt className="font-semibold text-text-tertiary">
              {t('core:memoryPanel.provenance.origin', { defaultValue: 'Origin' })}
            </dt>
            <dd className="font-medium text-text-primary">
              {t('core:memoryPanel.provenance.terminalSession', { defaultValue: 'Accepted terminal summary' })}
            </dd>
          </div>
          {terminalProvenance.sessionId && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <dt className="font-semibold text-text-tertiary">
                {t('core:memoryPanel.provenance.session', { defaultValue: 'Session' })}
              </dt>
              <dd className="font-mono text-text-primary" title={terminalProvenance.sessionId}>
                {compactMemoryRef(terminalProvenance.sessionId)}
              </dd>
            </div>
          )}
          {terminalProvenance.threadId && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <dt className="font-semibold text-text-tertiary">
                {t('core:memoryPanel.provenance.thread', { defaultValue: 'Thread' })}
              </dt>
              <dd className="font-mono text-text-primary" title={terminalProvenance.threadId}>
                {compactMemoryRef(terminalProvenance.threadId)}
              </dd>
            </div>
          )}
          {terminalProvenance.acceptedAt && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <dt className="font-semibold text-text-tertiary">
                {t('core:memoryPanel.provenance.saved', { defaultValue: 'Saved' })}
              </dt>
              <dd className="text-text-primary">
                {formatDateTime(terminalProvenance.acceptedAt, {
                  locale: formatLocale,
                  fallback: '-',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </dd>
            </div>
          )}
        </dl>
      )}

      {canExpand && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-text-muted hover:text-accent font-medium text-[11px] self-start transition-colors flex items-center gap-1.5"
        >
          {expanded
            ? <><Icon name="caret-up" size={12} weight="bold" /> {t('core:memoryPanel.actions.showLess', { defaultValue: 'Show less' })}</>
            : <><Icon name="caret-down" size={12} weight="bold" /> {t('core:memoryPanel.actions.showMore', { defaultValue: 'Show more' })}</>}
        </button>
      )}

      {cardActions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cardActions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              className={`inline-flex min-h-7 items-center rounded-md border border-transparent bg-surface-panel/70 px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-surface-border hover:bg-surface-panel-alt focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong ${action.tone === 'danger'
                ? 'text-danger'
                : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-muted">
        {visibleTags.map((t) => (
          <span key={t}>#{t}</span>
        ))}
        <span className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <span className={`inline-flex shrink-0 items-center gap-1 ${scopeBadge.className}`}>
            <Icon name={scopeBadge.icon} size={10} /> {scopeBadge.label}
          </span>
          <span className="min-w-0 text-right text-text-muted">{sourceLabel}</span>
        </span>
        {node._score !== undefined && (
          <span className="text-text-muted text-[10px] font-mono">
            {t('core:memoryPanel.scoreRef', {
              defaultValue: '{{score}}% ref',
              score: (node._score * 100).toFixed(0),
            })}
          </span>
        )}
      </div>
    </div>
  )
}

function HistoryEventCard({ entry, locale }) {
  const { t } = useRendererTranslation(['core'])
  const isUser = entry.kind === 'user_message'
  return (
    <article data-memory-history-entry="true" className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 border-b border-surface-border/60 px-1 py-4">
      <Icon name={isUser ? 'user' : 'sparkle'} size={14} className="mt-0.5 text-text-muted" />
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-text-secondary">
            {isUser
              ? t('core:memoryPanel.history.userMessage', { defaultValue: 'User message' })
              : t('core:memoryPanel.history.assistantMessage', { defaultValue: 'Assistant message' })}
          </span>
          <span className="text-[10px] text-text-muted">
            {formatDateTime(entry.createdAt, {
              locale,
              fallback: '-',
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-text-secondary">
          {entry.content}
        </p>
      </div>
    </article>
  )
}

function AddNodeForm({ onSave, onCancel, defaultIsGlobal = false }) {
  const { t } = useRendererTranslation(['core'])
  const [topic, setTopic] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [isGlobal, setIsGlobal] = useState(!!defaultIsGlobal)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!topic.trim() || !content.trim()) return
    setSaving(true)
    try {
      await onSave({
        topic: topic.trim(),
        content: content.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        isGlobal: !!isGlobal,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-memory-add-form="true" className="flex flex-col gap-3 border-y border-surface-border/60 py-4">
      <div className="flex items-center gap-2">
        <Icon name="plus-circle" size={15} className="text-text-muted" />
        <h3 className="text-[13px] font-semibold tracking-tight text-text-primary font-display">{t('core:memoryPanel.addForm.title', { defaultValue: 'Add New Memory Node' })}</h3>
      </div>
      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder={t('core:memoryPanel.addForm.topicPlaceholder', { defaultValue: 'Topic / title' })}
        className="w-full max-w-sm rounded-md border border-surface-border bg-surface px-3 py-2 text-sm font-medium text-text-primary outline-none placeholder-text-tertiary focus:border-text-muted"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('core:memoryPanel.addForm.contentPlaceholder', {
          defaultValue: 'Write down any context, facts, or instructions...',
        })}
        rows={4}
        className="w-full resize-none rounded-md border border-surface-border bg-surface px-3 py-2.5 text-sm leading-relaxed text-text-primary outline-none placeholder-text-tertiary focus:border-text-muted"
      />
      <input
        type="text"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder={t('core:memoryPanel.addForm.tagsPlaceholder', { defaultValue: 'Tags (comma separated)' })}
        className="w-full max-w-sm rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder-text-tertiary focus:border-text-muted"
      />
      <label className="inline-flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer w-max hover:text-text-primary transition-colors">
        <input
          type="checkbox"
          checked={isGlobal}
          onChange={(event) => setIsGlobal(event.target.checked)}
          className="accent-accent"
        />
        {t('core:memoryPanel.addForm.saveAsGlobal', { defaultValue: 'Save as persistent global memory' })}
      </label>
      <div className="mt-1 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary">{t('core:common.cancel', { defaultValue: 'Cancel' })}</button>
        <button
          onClick={handleSave}
          disabled={saving || !topic.trim() || !content.trim()}
          className="flex items-center gap-1.5 rounded-md bg-control-active px-3 py-1.5 text-[11px] font-medium text-control-active-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving
            ? <><Icon name="spinner" size={14} className="animate-spin" weight="bold" /> {t('core:memoryPanel.addForm.saving', { defaultValue: 'Saving...' })}</>
            : <><Icon name="floppy-disk" size={14} weight="bold" /> {t('core:memoryPanel.addForm.saveNode', { defaultValue: 'Save Node' })}</>}
        </button>
      </div>
    </div>
  )
}

function EditNodeModal({ node, onSave, onClose }) {
  const { t } = useRendererTranslation(['core'])
  const dialogRef = React.useRef(null)
  const [topic, setTopic] = useState(node.topic)
  const [content, setContent] = useState(node.content)
  const [tags, setTags] = useState(node.tags.join(', '))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        topic: topic.trim(),
        content: content.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
    } finally {
      setSaving(false)
    }
  }
  useDialogFocusTrap(true, dialogRef)
  useDialogEscapeDismiss(true, dialogRef, onClose)

  return (
    <div className={`fixed inset-0 ${DIALOG_Z_STANDARD} flex items-center justify-center bg-overlay-scrim`}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-edit-node-title"
        className="mx-4 w-full max-w-lg overflow-hidden rounded-lg border border-surface-border bg-surface-raised focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Icon name="pencil-simple" size={16} className="text-accent" weight="fill" />
            <h3 id="memory-edit-node-title" className="text-text-primary text-sm font-semibold font-display tracking-tight">{t('core:memoryPanel.editForm.title', { defaultValue: 'Edit Memory Node' })}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-border/50 rounded-md transition-colors" aria-label={t('core:memoryPanel.editForm.closeAriaLabel', { defaultValue: 'Close memory node editor' })}><Icon name="x" size={14} weight="bold" /></button>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('core:memoryPanel.editForm.topicPlaceholder', { defaultValue: 'Topic' })}
            className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-text-primary text-sm outline-none focus:border-accent transition-colors"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder={t('core:memoryPanel.editForm.contentPlaceholder', { defaultValue: 'Content' })}
            className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-text-primary text-sm outline-none focus:border-accent transition-colors resize-none"
          />
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t('core:memoryPanel.editForm.tagsPlaceholder', { defaultValue: 'Tags (comma separated)' })}
            className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-text-primary text-sm outline-none focus:border-accent transition-colors"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-4">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary">{t('core:common.cancel', { defaultValue: 'Cancel' })}</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-control-active px-3 py-1.5 text-[11px] font-medium text-control-active-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? <><Icon name="spinner" size={14} className="animate-spin" weight="bold" /> {t('core:memoryPanel.editForm.saving', { defaultValue: 'Saving...' })}</>
              : <><Icon name="floppy-disk" size={14} weight="bold" /> {t('core:memoryPanel.editForm.saveChanges', { defaultValue: 'Save Changes' })}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyMemoryState({ searched }) {
  const { t } = useRendererTranslation(['core'])
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center h-full">
      <div className="flex h-10 w-10 items-center justify-center text-text-muted">
        {searched ? <Icon name="magnifying-glass" size={24} weight="duotone" /> : <Icon name="brain" size={28} weight="duotone" />}
      </div>
      <p className="text-text-primary text-sm font-semibold font-display tracking-tight mt-1">
        {searched
          ? t('core:memoryPanel.empty.searchTitle', { defaultValue: 'No matching memories' })
          : t('core:memoryPanel.empty.title', { defaultValue: 'No memories yet' })}
      </p>
      <p className="text-text-tertiary text-[12.5px] max-w-sm leading-relaxed">
        {searched
          ? t('core:memoryPanel.empty.searchDescription', {
            defaultValue: 'Try a different search term or clear the search to see all memory nodes.',
          })
          : t('core:memoryPanel.empty.description', {
            defaultValue: 'Durable memory stores explicit notes, workspace events, validated decisions, and reference notes. Raw chat turns now live in thread history instead.',
          })}
      </p>
    </div>
  )
}

function EmptyHistoryState({ hasThread }) {
  const { t } = useRendererTranslation(['core'])
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center h-full">
      <div className="flex h-10 w-10 items-center justify-center text-text-muted">
        <Icon name="clock-counter-clockwise" size={24} weight="duotone" />
      </div>
      <p className="text-text-primary text-sm font-semibold font-display tracking-tight mt-1">
        {hasThread
          ? t('core:memoryPanel.history.emptyTitle', { defaultValue: 'No thread history yet' })
          : t('core:memoryPanel.history.noActiveThreadTitle', { defaultValue: 'No active thread selected' })}
      </p>
      <p className="text-text-tertiary text-[12.5px] max-w-sm leading-relaxed">
        {hasThread
          ? t('core:memoryPanel.history.emptyDescription', {
            defaultValue: 'User and assistant transcript events for this thread will appear here.',
          })
          : t('core:memoryPanel.history.noActiveThreadDescription', {
            defaultValue: 'Open or create a thread to inspect its transcript history.',
          })}
      </p>
    </div>
  )
}

function IconBtn({ onClick, title, danger, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-md p-1.5 transition-colors ${danger ? 'text-text-muted hover:text-danger' : 'text-text-muted hover:bg-surface-panel hover:text-text-primary'}`}
    >
      {children}
    </button>
  )
}
export {
  AddNodeForm,
  EditNodeModal,
  EmbedderBadge,
  EmptyHistoryState,
  EmptyMemoryState,
  HistoryEventCard,
}
