import React from 'react'
import {
  describeSourceControlEntryForScope,
  getSourceControlEntryLineStats,
} from '../store/useSourceControlStore.js'
import { formatNumber, useRendererFormattingLocale } from '../i18n/formatters.mjs'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import Icon from './ui/Icon.jsx'
import ActionButton from './ui/ActionButton.jsx'
import GitBranchIcon from './ui/GitBranchIcon.jsx'
import { getFilterCount } from './source-control-panel-filters.mjs'

function buildListFilters(t) {
  return Object.freeze([
    { id: 'all', label: t('core:sourceControl.filters.all', { defaultValue: 'All' }) },
    { id: 'staged', label: t('core:sourceControl.filters.staged', { defaultValue: 'Staged' }) },
    { id: 'unstaged', label: t('core:sourceControl.filters.unstaged', { defaultValue: 'Unstaged' }) },
    { id: 'conflicted', label: t('core:sourceControl.filters.conflicted', { defaultValue: 'Conflicts' }) },
    { id: 'untracked', label: t('core:sourceControl.filters.untracked', { defaultValue: 'Untracked' }) },
  ])
}

function splitDisplayPath(input = '') {
  const normalized = String(input || '').trim().replace(/\\/g, '/')
  if (!normalized) return { fileName: '', directory: '' }
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return { fileName: normalized, directory: '' }
  return {
    fileName: normalized.slice(lastSlash + 1),
    directory: normalized.slice(0, lastSlash),
  }
}

function formatLineDelta(value = 0, locale = '') {
  return formatNumber(Math.max(0, Number(value || 0) || 0), { locale, fallback: '0' })
}

function ScmEntryRow({ entry, scope, selected, indexActionPending, onIndexAction, onSelect }) {
  const { t } = useRendererTranslation(['core'])
  const locale = useRendererFormattingLocale()
  const label = describeSourceControlEntryForScope(entry, scope)
  const previousPath = String(entry?.previousProjectRelativePath || '').trim()
  const currentPath = String(entry?.projectRelativePath || '').trim()
  const showRename = previousPath && previousPath !== currentPath
  const preferredPath = currentPath || previousPath
  const pathBits = splitDisplayPath(preferredPath)
  const previousBits = splitDisplayPath(previousPath)
  const lineStats = getSourceControlEntryLineStats(entry, scope)
  const showLineStats = lineStats.changedLines > 0
  const shouldStage = scope === 'unstaged'
  const actionLabel = shouldStage
    ? t('core:sourceControl.actions.stageFile', { defaultValue: 'Stage file' })
    : t('core:sourceControl.actions.unstageFile', { defaultValue: 'Unstage file' })
  const actionKey = `${shouldStage ? 'stage' : 'unstage'}:${String(entry?.key || preferredPath).trim()}`
  const actionPending = indexActionPending === actionKey

  return (
    <div
      className={[
        'group flex w-full items-center border-b border-surface-border transition-colors duration-100',
        selected
          ? 'bg-surface-panel text-text-primary'
          : 'text-text-secondary hover:bg-surface-panel hover:text-text-primary',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect?.(entry, scope)}
        className="min-w-0 flex-1 px-2 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-muted"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text-primary">{pathBits.fileName || preferredPath}</div>
            {(pathBits.directory || showRename) ? (
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-text-tertiary">
                {pathBits.directory ? <span className="truncate">{pathBits.directory}</span> : null}
                {showRename ? (
                  <span className="truncate">
                    {t('core:sourceControl.entry.renameFrom', {
                      defaultValue: 'from {{path}}',
                      path: `${previousBits.directory ? `${previousBits.directory}/` : ''}${previousBits.fileName || previousPath}`,
                    })}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[11px]">
            {showLineStats ? (
              <div className="font-mono">
                <span className="text-success-soft">+{formatLineDelta(lineStats.addedLines, locale)}</span>
                <span className="ml-1.5 text-danger-soft">-{formatLineDelta(lineStats.deletedLines, locale)}</span>
              </div>
            ) : null}
            <span className="min-w-14 text-right text-text-tertiary">{label}</span>
          </div>
        </div>
      </button>
      {!entry?.isConflicted ? (
        <button
          type="button"
          aria-label={`${actionLabel}: ${preferredPath}`}
          title={actionLabel}
          disabled={Boolean(indexActionPending)}
          onClick={() => onIndexAction?.(entry, shouldStage)}
          className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-100 hover:bg-surface-border/70 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-muted disabled:opacity-40"
        >
          <Icon name={actionPending ? 'arrows-clockwise' : shouldStage ? 'plus' : 'minus'} className={actionPending ? 'animate-spin text-[14px]' : 'text-[14px]'} />
        </button>
      ) : null}
    </div>
  )
}

export function ScmGroup({ title, entries, scope, selectedKey, indexActionPending, onAllAction, onIndexAction, onSelect }) {
  const { t } = useRendererTranslation(['core'])
  if (!Array.isArray(entries) || entries.length === 0) return null
  const shouldStage = scope === 'unstaged'
  const allActionLabel = shouldStage
    ? t('core:sourceControl.actions.stageAll', { defaultValue: 'Stage all' })
    : t('core:sourceControl.actions.unstageAll', { defaultValue: 'Unstage all' })
  const allActionPending = indexActionPending === (shouldStage ? 'stage-all' : 'unstage-all')
  return (
    <section>
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <h3 className="text-xs font-semibold text-text-secondary">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-text-tertiary">{entries.length}</span>
          <button
            type="button"
            disabled={Boolean(indexActionPending)}
            onClick={() => onAllAction?.(shouldStage)}
            className="rounded px-1.5 py-0.5 text-[11px] text-text-tertiary transition-colors duration-100 hover:bg-surface-panel hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-muted disabled:opacity-40"
          >
            {allActionPending ? `${allActionLabel}…` : allActionLabel}
          </button>
        </div>
      </div>
      <div className="border-t border-surface-border">
        {entries.map((entry) => (
          <ScmEntryRow
            key={`${scope}:${entry.key}`}
            entry={entry}
            scope={scope}
            selected={selectedKey === entry.key}
            indexActionPending={indexActionPending}
            onIndexAction={onIndexAction}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}

export function BranchSummary({ branch, repoRoot, totals, loading, onClose, onRefresh }) {
  const { t } = useRendererTranslation(['core'])
  const counts = [
    { label: t('core:sourceControl.summary.chips.staged', { defaultValue: 'Staged' }), value: totals?.staged ?? 0 },
    { label: t('core:sourceControl.summary.chips.unstaged', { defaultValue: 'Unstaged' }), value: totals?.unstaged ?? 0 },
    { label: t('core:sourceControl.summary.chips.conflicts', { defaultValue: 'Conflicts' }), value: totals?.conflicted ?? 0 },
  ]
  return (
    <header className="border-b border-surface-border px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-text-primary">
          <GitBranchIcon className="h-[15px] w-[15px] text-text-tertiary" />
          <span className="truncate font-mono">{branch || 'Repository'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={t('core:sourceControl.refresh', { defaultValue: 'Refresh' })}
            title={t('core:sourceControl.refresh', { defaultValue: 'Refresh' })}
            disabled={loading}
            onClick={() => onRefresh?.()}
            className="flex size-7 items-center justify-center rounded-md text-text-tertiary transition-colors duration-100 hover:bg-surface-panel hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-muted disabled:opacity-50"
          >
            <Icon name="arrows-clockwise" className={loading ? 'animate-spin text-[15px]' : 'text-[15px]'} />
          </button>
          {typeof onClose === 'function' ? (
            <button
              type="button"
              aria-label="Close Git details"
              title="Close Git details"
              onClick={() => onClose?.()}
              className="flex size-7 items-center justify-center rounded-md text-text-tertiary transition-colors duration-100 hover:bg-surface-panel hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-muted"
            >
              <Icon name="x" className="text-[15px]" />
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-2 truncate font-mono text-[10px] text-text-tertiary" title={repoRoot}>{repoRoot}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
        {counts.map((count) => (
          <span key={count.label}>
            <span className="text-text-secondary">{count.value}</span> {count.label.toLowerCase()}
          </span>
        ))}
      </div>
    </header>
  )
}

export function CompanionDetailHeader({ branch, onBack, onClose }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-surface-border px-3">
      <button
        type="button"
        onClick={() => onBack?.()}
        className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs text-text-secondary transition-colors duration-100 hover:bg-surface-panel hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-muted"
      >
        <Icon name="arrow-left" className="text-[14px]" />
        <span className="truncate">{branch || 'Git'}</span>
      </button>
      {typeof onClose === 'function' ? (
        <button
          type="button"
          aria-label="Close Git details"
          title="Close Git details"
          onClick={() => onClose?.()}
          className="flex size-7 items-center justify-center rounded-md text-text-tertiary transition-colors duration-100 hover:bg-surface-panel hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-muted"
        >
          <Icon name="x" className="text-[15px]" />
        </button>
      ) : null}
    </header>
  )
}

export function ListToolbar({
  groupedEntries,
  activeFilter,
  searchValue,
  onFilterChange,
  onSearchChange,
}) {
  const { t } = useRendererTranslation(['core'])
  const filters = React.useMemo(() => buildListFilters(t), [t])
  return (
    <div className="space-y-2.5 border-b border-surface-border px-4 py-3">
      <label className="relative block">
        <Icon name="magnifying-glass" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-text-tertiary" />
        <span className="sr-only">
          {t('core:sourceControl.search.label', { defaultValue: 'Search changed files' })}
        </span>
        <input
          value={searchValue}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder={t('core:sourceControl.search.placeholder', { defaultValue: 'Search changed files' })}
          className="h-8 w-full rounded-md border border-surface-border bg-surface pl-8 pr-3 text-xs text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-border-hover focus:ring-1 focus:ring-accent-muted"
        />
      </label>
      <div className="flex min-w-0 gap-1 overflow-x-auto" role="group">
        {filters.map((filter) => {
          const active = activeFilter === filter.id
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={active}
              onClick={() => onFilterChange?.(filter.id)}
              className={[
                'shrink-0 rounded-md px-2 py-1 text-[11px] transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-muted',
                active
                  ? 'bg-surface-panel text-text-primary'
                  : 'text-text-tertiary hover:bg-surface-panel hover:text-text-secondary',
              ].join(' ')}
            >
              {filter.label}: {getFilterCount(groupedEntries, filter.id)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CommitComposer({
  groupedEntries,
  commitMessage,
  commitPending,
  commitError,
  lastCommitSummary,
  onCommitMessageChange,
  onCommit,
}) {
  const { t } = useRendererTranslation(['core'])
  const hasStagedEntries = groupedEntries.staged.length > 0
  const trimmedMessage = String(commitMessage || '').trim()
  const disabled = commitPending || !hasStagedEntries || !trimmedMessage

  return (
    <section className="space-y-2.5 border-t border-surface-border bg-surface-panel-alt px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-text-secondary">
            {t('core:sourceControl.commit.title', { defaultValue: 'Commit' })}
          </h3>
          <p className="text-[11px] text-text-tertiary">{groupedEntries.staged.length} {t('core:sourceControl.filters.staged', { defaultValue: 'Staged' }).toLowerCase()}</p>
        </div>
        <ActionButton
          disabled={disabled}
          onClick={() => onCommit?.()}
        >
          {commitPending
            ? t('core:sourceControl.commit.pending', { defaultValue: 'Committing...' })
            : t('core:sourceControl.commit.action', { defaultValue: 'Commit' })}
        </ActionButton>
      </div>
      <textarea
        value={commitMessage}
        onChange={(event) => onCommitMessageChange?.(event.target.value)}
        placeholder={hasStagedEntries
          ? t('core:sourceControl.commit.placeholder', { defaultValue: 'Commit message' })
          : t('core:sourceControl.commit.disabledPlaceholder', {
            defaultValue: 'Stage files to enable commit authoring',
          })}
        disabled={commitPending}
        className="min-h-[58px] w-full resize-none rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-border-hover focus:ring-1 focus:ring-accent-muted disabled:opacity-60"
      />
      {(commitError || lastCommitSummary) ? (
        <div className={commitError ? 'text-xs text-danger-soft' : 'text-xs text-text-secondary'}>
          {commitError || lastCommitSummary}
        </div>
      ) : null}
    </section>
  )
}

function DetailPreview({ detail }) {
  const previewContent = String(detail?.previewContent || '').trim()
  if (!previewContent) return null
  return (
    <pre className="min-h-48 flex-1 overflow-auto rounded-md border border-surface-border bg-surface p-4 font-mono text-xs leading-6 text-text-secondary">
      {previewContent}
    </pre>
  )
}

function DetailStages({ stages = [] }) {
  const { t } = useRendererTranslation(['core'])
  if (!Array.isArray(stages) || stages.length === 0) return null
  return (
    <div className="divide-y divide-surface-border border-y border-surface-border">
      {stages.map((stage) => (
        <div key={`${stage.stage}:${stage.oid}`} className="px-1 py-2 text-xs text-text-secondary">
          {t('core:sourceControl.detail.stage', {
            defaultValue: 'Stage {{stage}} ({{label}}):',
            stage: stage.stage,
            label: stage.label,
          })} <span className="font-mono text-text-primary">{stage.oid}</span>
        </div>
      ))}
    </div>
  )
}

function DetailActions({
  detailState,
  actionPending,
  onRestoreFile,
  onUnstageFile,
}) {
  const { t } = useRendererTranslation(['core'])
  const detail = detailState?.detail
  const detailKind = String(detailState?.detailKind || '').trim()
  const canRestore = detail?.canRestore === true
  const canUnstageDeletion = detailKind === 'deleted_file' && detail?.canUnstage === true
  const canUnstageRename = detailKind === 'rename'
    && detail?.canUnstage === true
    && Boolean(String(detail?.previousProjectRelativePath || '').trim())

  if (!canRestore && !canUnstageDeletion && !canUnstageRename) return null

  return (
    <div className="flex flex-wrap gap-2">
      {canRestore ? (
        <ActionButton
          disabled={Boolean(actionPending)}
          onClick={() => onRestoreFile?.()}
        >
          {actionPending === 'restore_file'
            ? t('core:sourceControl.detail.actions.restoring', { defaultValue: 'Restoring...' })
            : t('core:sourceControl.detail.actions.restoreFile', { defaultValue: 'Restore file' })}
        </ActionButton>
      ) : null}
      {canUnstageDeletion ? (
        <ActionButton
          disabled={Boolean(actionPending)}
          onClick={() => onUnstageFile?.()}
        >
          {actionPending === 'unstage_file'
            ? t('core:sourceControl.detail.actions.unstaging', { defaultValue: 'Unstaging...' })
            : t('core:sourceControl.detail.actions.unstageDeletion', { defaultValue: 'Unstage deletion' })}
        </ActionButton>
      ) : null}
      {canUnstageRename ? (
        <ActionButton
          disabled={Boolean(actionPending)}
          onClick={() => onUnstageFile?.()}
        >
          {actionPending === 'unstage_file'
            ? t('core:sourceControl.detail.actions.unstaging', { defaultValue: 'Unstaging...' })
            : t('core:sourceControl.detail.actions.unstageRename', { defaultValue: 'Unstage rename' })}
        </ActionButton>
      ) : null}
    </div>
  )
}

export function DetailCard({
  detailState,
  detailLoading,
  detailError,
  detailActionPending,
  detailActionError,
  onRestoreFile,
  onUnstageFile,
}) {
  const { t } = useRendererTranslation(['core'])
  const detail = detailState?.detail
  if (detailLoading) {
    return (
      <section className="flex h-full items-center justify-center px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Icon name="spinner-gap" className="animate-spin text-[16px]" />
          {t('core:sourceControl.detail.loading', { defaultValue: 'Loading SCM detail...' })}
        </div>
      </section>
    )
  }
  if (!detailState) return null

  return (
    <section className="flex min-h-full flex-col gap-4 px-4 py-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          {detail?.title || t('core:sourceControl.detail.title', { defaultValue: 'SCM detail' })}
        </h3>
        <p className="mt-1 text-sm text-text-secondary">{detail?.summary || detailError || ''}</p>
      </div>
      <div className="space-y-1 font-mono text-xs text-text-tertiary">
        {detail?.projectRelativePath ? (
          <div>
            {t('core:sourceControl.detail.path', { defaultValue: 'Path:' })} {detail.projectRelativePath}
          </div>
        ) : null}
        {detail?.previousProjectRelativePath ? (
          <div>
            {t('core:sourceControl.detail.previousPath', { defaultValue: 'Previous path:' })} {detail.previousProjectRelativePath}
          </div>
        ) : null}
        {detail?.previewSource && detail.previewSource !== 'none' ? (
          <div>
            {t('core:sourceControl.detail.previewSource', { defaultValue: 'Preview source:' })} {detail.previewSource}
          </div>
        ) : null}
        {detail?.indexOid ? (
          <div>
            {t('core:sourceControl.detail.indexCommit', { defaultValue: 'Index commit:' })} <span className="font-mono text-text-secondary">{detail.indexOid}</span>
          </div>
        ) : null}
        {detail?.worktreeOid ? (
          <div>
            {t('core:sourceControl.detail.worktreeCommit', { defaultValue: 'Worktree commit:' })} <span className="font-mono text-text-secondary">{detail.worktreeOid}</span>
          </div>
        ) : null}
        {typeof detail?.worktreeDirty === 'boolean' ? (
          <div>
            {t('core:sourceControl.detail.dirtyWorktree', { defaultValue: 'Dirty worktree:' })} {detail.worktreeDirty
              ? t('core:sourceControl.common.yes', { defaultValue: 'yes' })
              : t('core:sourceControl.common.no', { defaultValue: 'no' })}
          </div>
        ) : null}
      </div>
      <DetailStages stages={detail?.unmergedStages} />
      <DetailPreview detail={detail} />
      <DetailActions
        detailState={detailState}
        actionPending={detailActionPending}
        onRestoreFile={onRestoreFile}
        onUnstageFile={onUnstageFile}
      />
      {(detailActionError || (detailError && !detail?.summary)) ? (
        <div className="flex items-center gap-2 text-sm text-danger-soft" role="status">
          <Icon name="warning-circle" className="text-[16px]" />
          {detailActionError || detailError}
        </div>
      ) : null}
    </section>
  )
}

export function ReviewEmptyState({ branch, changedCount = 0, clean = false }) {
  const { t } = useRendererTranslation(['core'])
  return (
    <div className="flex h-full min-h-48 items-center justify-center px-6 py-10 text-center">
      <div className="max-w-xs">
        <Icon name={clean ? 'check-circle' : 'file-diff'} className="text-[22px] text-text-tertiary" />
        <h3 className="mt-3 text-sm font-semibold text-text-primary">
          {clean
            ? t('core:sourceControl.clean', { defaultValue: 'Working tree clean.' })
            : t('core:sourceControl.summary.title', { defaultValue: 'Changes' })}
        </h3>
        <p className="mt-1 text-xs text-text-tertiary">
          {clean
            ? branch
            : `${t('core:sourceControl.filters.all', { defaultValue: 'All' })}: ${changedCount}`}
        </p>
      </div>
    </div>
  )
}
