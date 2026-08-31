import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useAppStore from '../../src/renderer/store/useAppStore.js'
import useSourceControlStore, {
  groupSourceControlEntries,
  describeSourceControlEntry,
  describeSourceControlEntryForScope,
  getSourceControlEntryLineStats,
} from '../../src/renderer/store/useSourceControlStore.js'
import Icon from '../../src/renderer/components/ui/Icon.jsx'

export const LIST_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'staged', label: 'Staged' },
  { id: 'unstaged', label: 'Unstaged' },
  { id: 'conflicted', label: 'Conflicts' },
  { id: 'untracked', label: 'Untracked' },
])

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

function formatLineDelta(value = 0) {
  return Math.max(0, Number(value || 0) || 0).toLocaleString('en-US')
}

export function getFilterCount(groupedEntries, filterId = 'all') {
  switch (String(filterId || 'all').trim().toLowerCase()) {
    case 'staged':
      return groupedEntries.staged.length
    case 'unstaged':
      return groupedEntries.unstaged.length
    case 'conflicted':
      return groupedEntries.conflicted.length
    case 'untracked':
      return groupedEntries.untracked.length
    default:
      return groupedEntries.staged.length + groupedEntries.unstaged.length
  }
}

export function matchesEntrySearch(entry, searchTerm = '', scope = 'unstaged') {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase()
  if (!normalizedSearch) return true
  const haystack = [
    entry?.projectRelativePath,
    entry?.previousProjectRelativePath,
    describeSourceControlEntry(entry),
    describeSourceControlEntryForScope(entry, scope),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  return haystack.includes(normalizedSearch)
}

function ScmEntryRow({ entry, scope, selected, onSelect }) {
  const label = describeSourceControlEntryForScope(entry, scope)
  const previousPath = String(entry?.previousProjectRelativePath || '').trim()
  const currentPath = String(entry?.projectRelativePath || '').trim()
  const showRename = previousPath && previousPath !== currentPath
  const preferredPath = currentPath || previousPath
  const pathBits = splitDisplayPath(preferredPath)
  const previousBits = splitDisplayPath(previousPath)
  const lineStats = getSourceControlEntryLineStats(entry, scope)
  const showLineStats = lineStats.changedLines > 0

  return (
    <button
      type="button"
      onClick={() => onSelect?.(entry, scope)}
      className={[
        'w-full rounded-xl border px-3 py-2.5 text-left transition-all',
        selected
          ? 'border-accent/50 bg-accent/12 shadow-[inset_0_0_0_1px_rgba(91,141,238,0.12)] text-text-primary'
          : 'border-surface-border bg-surface-panel hover:border-border-hover hover:bg-surface-panel-muted',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="min-w-0 truncate text-sm font-medium text-text-primary">{pathBits.fileName || preferredPath}</div>
            {showLineStats ? (
              <div className="shrink-0 font-mono text-[11px] text-text-secondary">
                <span className="text-emerald-300">+{formatLineDelta(lineStats.addedLines)}</span>
                <span className="mx-1 text-text-tertiary">/</span>
                <span className="text-rose-300">-{formatLineDelta(lineStats.deletedLines)}</span>
              </div>
            ) : null}
          </div>
          {(pathBits.directory || showRename) ? (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
              {pathBits.directory ? <span className="truncate">{pathBits.directory}</span> : null}
              {showRename ? (
                <span className="truncate">
                  from {previousBits.directory ? `${previousBits.directory}/` : ''}{previousBits.fileName || previousPath}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-surface-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-secondary">
            {label}
          </span>
        </div>
      </div>
    </button>
  )
}

export function ScmGroup({ title, entries, scope, selectedKey, onSelect }) {
  if (!Array.isArray(entries) || entries.length === 0) return null
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">{title}</h3>
        <span className="text-xs text-text-tertiary">{entries.length}</span>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <ScmEntryRow
            key={`${scope}:${entry.key}`}
            entry={entry}
            scope={scope}
            selected={selectedKey === entry.key}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}

export function BranchSummary({ branch, totals }) {
  const chips = [
    { label: 'Staged', value: totals?.staged ?? 0 },
    { label: 'Unstaged', value: totals?.unstaged ?? 0 },
    { label: 'Conflicts', value: totals?.conflicted ?? 0 },
  ]
  return (
    <div className="space-y-3 border-b border-surface-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Changes</h2>
          <p className="text-xs text-text-tertiary">
            {branch ? `On branch ${branch}` : 'Repository state for the current workspace'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="rounded-full border border-surface-border bg-surface-panel px-2.5 py-1 text-[11px] uppercase tracking-wide text-text-secondary"
          >
            {chip.label}: {chip.value}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ListToolbar({
  groupedEntries,
  activeFilter,
  searchValue,
  onFilterChange,
  onSearchChange,
}) {
  return (
    <div className="space-y-3 border-b border-surface-border px-4 py-3">
      <div className="flex flex-wrap gap-2">
        {LIST_FILTERS.map((filter) => {
          const active = activeFilter === filter.id
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => onFilterChange?.(filter.id)}
              className={[
                'rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-wide transition-colors',
                active
                  ? 'border-accent/40 bg-accent/12 text-accent'
                  : 'border-surface-border bg-surface-panel text-text-secondary hover:border-border-hover hover:text-text-primary',
              ].join(' ')}
            >
              {filter.label}: {getFilterCount(groupedEntries, filter.id)}
            </button>
          )
        })}
      </div>
      <label className="block">
        <span className="sr-only">Search changed files</span>
        <input
          value={searchValue}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder="Search changed files"
          className="w-full rounded-xl border border-surface-border bg-surface-panel px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent/40"
        />
      </label>
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
  const hasStagedEntries = groupedEntries.staged.length > 0
  const trimmedMessage = String(commitMessage || '').trim()
  const disabled = commitPending || !hasStagedEntries || !trimmedMessage

  return (
    <section className="space-y-3 border-b border-surface-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">Commit</h3>
          <p className="text-xs text-text-tertiary">Creates a commit from staged changes only.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary px-3 py-1.5"
          disabled={disabled}
          onClick={() => onCommit?.()}
        >
          {commitPending ? 'Committing...' : 'Commit'}
        </button>
      </div>
      <textarea
        value={commitMessage}
        onChange={(event) => onCommitMessageChange?.(event.target.value)}
        placeholder={hasStagedEntries ? 'Commit message' : 'Stage files to enable commit authoring'}
        disabled={commitPending}
        className="min-h-[84px] w-full rounded-xl border border-surface-border bg-surface-panel px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent/40"
      />
      {(commitError || lastCommitSummary) ? (
        <div className="rounded-xl border border-surface-border bg-surface-panel px-3 py-2 text-sm text-text-secondary">
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
    <pre className="max-h-64 overflow-auto rounded-xl border border-surface-border bg-surface-panel px-3 py-3 text-xs leading-6 text-text-secondary">
      {previewContent}
    </pre>
  )
}

function DetailStages({ stages = [] }) {
  if (!Array.isArray(stages) || stages.length === 0) return null
  return (
    <div className="space-y-2">
      {stages.map((stage) => (
        <div key={`${stage.stage}:${stage.oid}`} className="rounded-xl border border-surface-border bg-surface-panel px-3 py-2 text-xs text-text-secondary">
          Stage {stage.stage} ({stage.label}): <span className="font-mono text-text-primary">{stage.oid}</span>
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
        <button
          type="button"
          className="btn btn-secondary px-3 py-1.5"
          disabled={Boolean(actionPending)}
          onClick={() => onRestoreFile?.()}
        >
          {actionPending === 'restore_file' ? 'Restoring...' : 'Restore file'}
        </button>
      ) : null}
      {canUnstageDeletion ? (
        <button
          type="button"
          className="btn btn-secondary px-3 py-1.5"
          disabled={Boolean(actionPending)}
          onClick={() => onUnstageFile?.()}
        >
          {actionPending === 'unstage_file' ? 'Unstaging...' : 'Unstage deletion'}
        </button>
      ) : null}
      {canUnstageRename ? (
        <button
          type="button"
          className="btn btn-secondary px-3 py-1.5"
          disabled={Boolean(actionPending)}
          onClick={() => onUnstageFile?.()}
        >
          {actionPending === 'unstage_file' ? 'Unstaging...' : 'Unstage rename'}
        </button>
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
  const detail = detailState?.detail
  if (detailLoading) {
    return (
      <section className="space-y-3 border-b border-surface-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Icon name="spinner-gap" className="animate-spin text-[16px]" />
          Loading SCM detail...
        </div>
      </section>
    )
  }
  if (!detailState) return null

  return (
    <section className="space-y-3 border-b border-surface-border px-4 py-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
          {detail?.title || 'SCM detail'}
        </h3>
        <p className="mt-1 text-sm text-text-secondary">{detail?.summary || detailError || ''}</p>
      </div>
      <div className="space-y-1 text-xs text-text-tertiary">
        {detail?.projectRelativePath ? <div>Path: {detail.projectRelativePath}</div> : null}
        {detail?.previousProjectRelativePath ? <div>Previous path: {detail.previousProjectRelativePath}</div> : null}
        {detail?.previewSource && detail.previewSource !== 'none' ? <div>Preview source: {detail.previewSource}</div> : null}
        {detail?.indexOid ? <div>Index commit: <span className="font-mono text-text-secondary">{detail.indexOid}</span></div> : null}
        {detail?.worktreeOid ? <div>Worktree commit: <span className="font-mono text-text-secondary">{detail.worktreeOid}</span></div> : null}
        {typeof detail?.worktreeDirty === 'boolean' ? <div>Dirty worktree: {detail.worktreeDirty ? 'yes' : 'no'}</div> : null}
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
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {detailActionError || detailError}
        </div>
      ) : null}
    </section>
  )
}

export default function SourceControlPanelMonolithRepro() {
  const projectFolder = useAppStore((state) => state.projectFolder)
  const {
    branch,
    commitError,
    commitMessage,
    commitPending,
    detailActionError,
    detailActionPending,
    detailError,
    detailLoading,
    entries,
    error,
    lastCommitSummary,
    loading,
    repoRoot,
    selectedDetail,
    selectedKey,
    selectedScope,
    selectionMessage,
    status,
    totals,
    refreshStatus,
    navigateEntry,
    restoreSelectedDetailFile,
    unstageSelectedDetailFile,
    setCommitMessage,
    commitStaged,
  } = useSourceControlStore(useShallow((state) => ({
    branch: state.branch,
    commitError: state.commitError,
    commitMessage: state.commitMessage,
    commitPending: state.commitPending,
    detailActionError: state.detailActionError,
    detailActionPending: state.detailActionPending,
    detailError: state.detailError,
    detailLoading: state.detailLoading,
    entries: state.entries,
    error: state.error,
    lastCommitSummary: state.lastCommitSummary,
    loading: state.loading,
    repoRoot: state.repoRoot,
    selectedDetail: state.selectedDetail,
    selectedKey: state.selectedKey,
    selectedScope: state.selectedScope,
    selectionMessage: state.selectionMessage,
    status: state.status,
    totals: state.totals,
    refreshStatus: state.refreshStatus,
    navigateEntry: state.navigateEntry,
    restoreSelectedDetailFile: state.restoreSelectedDetailFile,
    unstageSelectedDetailFile: state.unstageSelectedDetailFile,
    setCommitMessage: state.setCommitMessage,
    commitStaged: state.commitStaged,
  })))
  const [navigationError, setNavigationError] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchValue, setSearchValue] = useState('')

  useEffect(() => {
    if (!projectFolder) return
    void refreshStatus(projectFolder)
  }, [projectFolder, refreshStatus])

  const groupedEntries = useMemo(() => groupSourceControlEntries(entries), [entries])
  const filteredGroupedEntries = useMemo(() => {
    const filterScopedEntries = (rows, scope) => rows.filter((entry) => matchesEntrySearch(entry, searchValue, scope))
    if (activeFilter === 'staged') {
      return {
        staged: filterScopedEntries(groupedEntries.staged, 'staged'),
        unstaged: [],
      }
    }
    if (activeFilter === 'unstaged') {
      return {
        staged: [],
        unstaged: filterScopedEntries(groupedEntries.unstaged, 'unstaged'),
      }
    }
    if (activeFilter === 'conflicted') {
      const conflicted = filterScopedEntries(groupedEntries.conflicted, 'unstaged')
      return {
        staged: conflicted.filter((entry) => entry.hasStagedChanges),
        unstaged: conflicted.filter((entry) => entry.hasUnstagedChanges),
      }
    }
    if (activeFilter === 'untracked') {
      return {
        staged: [],
        unstaged: filterScopedEntries(groupedEntries.untracked, 'unstaged'),
      }
    }
    return {
      staged: filterScopedEntries(groupedEntries.staged, 'staged'),
      unstaged: filterScopedEntries(groupedEntries.unstaged, 'unstaged'),
    }
  }, [activeFilter, groupedEntries, searchValue])

  const handleSelectEntry = async (entry, scope) => {
    if (!projectFolder) return
    setNavigationError('')
    const result = await navigateEntry(projectFolder, entry, scope)
    if (result?.ok) return
    setNavigationError(String(result?.message || result?.reason || 'Failed to open the selected Source Control entry.'))
  }

  if (!projectFolder) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-panel-alt px-6 text-sm text-text-muted">
        Open a project folder to inspect changes.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-panel-alt">
      <BranchSummary branch={branch} totals={totals} />

      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <p className="truncate text-xs text-text-tertiary">
          {repoRoot ? repoRoot : 'Repository state for the current workspace'}
        </p>
        <button
          type="button"
          onClick={() => { void refreshStatus(projectFolder) }}
          className="btn btn-secondary px-3 py-1.5"
        >
          Refresh
        </button>
      </div>

      <CommitComposer
        groupedEntries={groupedEntries}
        commitMessage={commitMessage}
        commitPending={commitPending}
        commitError={commitError}
        lastCommitSummary={lastCommitSummary}
        onCommitMessageChange={setCommitMessage}
        onCommit={() => { void commitStaged(projectFolder) }}
      />

      <DetailCard
        detailState={selectedDetail}
        detailLoading={detailLoading}
        detailError={detailError}
        detailActionPending={detailActionPending}
        detailActionError={detailActionError}
        onRestoreFile={() => { void restoreSelectedDetailFile(projectFolder) }}
        onUnstageFile={() => { void unstageSelectedDetailFile(projectFolder) }}
      />

      {(selectionMessage || navigationError || error) ? (
        <div className="border-b border-surface-border bg-surface-panel-muted px-4 py-3 text-sm text-text-secondary">
          {navigationError || selectionMessage || error}
        </div>
      ) : null}

      <ListToolbar
        groupedEntries={groupedEntries}
        activeFilter={activeFilter}
        searchValue={searchValue}
        onFilterChange={setActiveFilter}
        onSearchChange={setSearchValue}
      />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            Loading changes...
          </div>
        ) : null}

        {!loading && status === 'no_repo' ? (
          <div className="rounded-2xl border border-surface-border bg-surface-panel px-4 py-3 text-sm text-text-secondary">
            This workspace is not inside a git repository.
          </div>
        ) : null}

        {!loading && status !== 'no_repo' && groupedEntries.staged.length === 0 && groupedEntries.unstaged.length === 0 ? (
          <div className="rounded-2xl border border-surface-border bg-surface-panel px-4 py-3 text-sm text-text-secondary">
            Working tree clean.
          </div>
        ) : null}

        {!loading
          && groupedEntries.staged.length + groupedEntries.unstaged.length > 0
          && filteredGroupedEntries.staged.length + filteredGroupedEntries.unstaged.length === 0 ? (
            <div className="rounded-2xl border border-surface-border bg-surface-panel px-4 py-3 text-sm text-text-secondary">
              No files match the current filter.
            </div>
        ) : null}

        {!loading && (filteredGroupedEntries.staged.length > 0 || filteredGroupedEntries.unstaged.length > 0) ? (
          <div className="space-y-6">
            <ScmGroup
              title="Unstaged"
              entries={filteredGroupedEntries.unstaged}
              scope="unstaged"
              selectedKey={selectedScope === 'unstaged' ? selectedKey : ''}
              onSelect={handleSelectEntry}
            />
            <ScmGroup
              title="Staged"
              entries={filteredGroupedEntries.staged}
              scope="staged"
              selectedKey={selectedScope === 'staged' ? selectedKey : ''}
              onSelect={handleSelectEntry}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
