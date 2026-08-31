import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import useAppStore from '../store/useAppStore.js'
import useSourceControlStore, {
  groupSourceControlEntries,
} from '../store/useSourceControlStore.js'
import {
  BranchSummary,
  CommitComposer,
  CompanionDetailHeader,
  DetailCard,
  ListToolbar,
  ScmGroup,
} from './source-control-panel-parts.jsx'
import { matchesEntrySearch } from './source-control-panel-filters.mjs'

export default function SourceControlPanel({ onClose, embeddedInCompanion = false }) {
  const { t } = useRendererTranslation(['core'])
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
    indexActionError,
    indexActionPending,
    loading,
    repoRoot,
    selectedDetail,
    selectedKey,
    selectedScope,
    selectionMessage,
    status,
    totals,
    activeFilter,
    searchValue,
    clearSelectedDetail,
    refreshStatus,
    navigateEntry,
    restoreSelectedDetailFile,
    unstageSelectedDetailFile,
    setCommitMessage,
    setActiveFilter,
    setSearchValue,
    setAllStaged,
    setEntryStaged,
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
    indexActionError: state.indexActionError,
    indexActionPending: state.indexActionPending,
    loading: state.loading,
    repoRoot: state.repoRoot,
    selectedDetail: state.selectedDetail,
    selectedKey: state.selectedKey,
    selectedScope: state.selectedScope,
    selectionMessage: state.selectionMessage,
    status: state.status,
    totals: state.totals,
    activeFilter: state.activeFilter,
    searchValue: state.searchValue,
    clearSelectedDetail: state.clearSelectedDetail,
    refreshStatus: state.refreshStatus,
    navigateEntry: state.navigateEntry,
    restoreSelectedDetailFile: state.restoreSelectedDetailFile,
    unstageSelectedDetailFile: state.unstageSelectedDetailFile,
    setCommitMessage: state.setCommitMessage,
    setActiveFilter: state.setActiveFilter,
    setSearchValue: state.setSearchValue,
    setAllStaged: state.setAllStaged,
    setEntryStaged: state.setEntryStaged,
    commitStaged: state.commitStaged,
  })))
  const [navigationError, setNavigationError] = useState('')

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
    setNavigationError(String(result?.message || result?.reason || t('core:sourceControl.navigationFailed', {
      defaultValue: 'Failed to open the selected Source Control entry.',
    })))
  }

  const handleEntryIndexAction = async (entry, staged) => {
    if (!projectFolder) return
    await setEntryStaged(projectFolder, entry, staged)
  }

  const handleAllIndexAction = async (staged) => {
    if (!projectFolder) return
    await setAllStaged(projectFolder, staged)
  }

  if (!projectFolder) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-panel-alt px-6 text-sm text-text-muted">
        {t('core:sourceControl.openProject', { defaultValue: 'Open a project folder to inspect changes.' })}
      </div>
    )
  }

  const detailOpen = Boolean(selectedDetail || detailLoading)

  return (
    <div
      data-source-control-layout="git-companion"
      data-source-control-view={detailOpen ? 'detail' : 'list'}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-panel-alt"
    >
      {detailOpen ? (
        <>
          <CompanionDetailHeader
            branch={branch}
            onBack={clearSelectedDetail}
            onClose={embeddedInCompanion ? undefined : onClose}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
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
              <div className={[
                'px-4 py-3 text-xs',
                navigationError || error ? 'text-danger-soft' : 'text-text-secondary',
              ].join(' ')} role="status">
                {navigationError || selectionMessage || error}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <BranchSummary
            branch={branch}
            repoRoot={repoRoot}
            totals={totals}
            loading={loading}
            onClose={embeddedInCompanion ? undefined : onClose}
            onRefresh={() => { void refreshStatus(projectFolder) }}
          />
          <ListToolbar
            groupedEntries={groupedEntries}
            activeFilter={activeFilter}
            searchValue={searchValue}
            onFilterChange={setActiveFilter}
            onSearchChange={setSearchValue}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-text-secondary">
                <span className="size-1.5 animate-pulse rounded-full bg-text-tertiary" />
                {t('core:sourceControl.loading', { defaultValue: 'Loading changes...' })}
              </div>
            ) : null}
            {!loading && status === 'no_repo' ? (
              <div className="px-2 py-4 text-sm text-text-secondary">
                {t('core:sourceControl.noRepo', { defaultValue: 'This workspace is not inside a git repository.' })}
              </div>
            ) : null}
            {!loading && status !== 'no_repo' && groupedEntries.staged.length === 0 && groupedEntries.unstaged.length === 0 ? (
              <div className="px-2 py-4 text-sm text-text-secondary">
                {t('core:sourceControl.clean', { defaultValue: 'Working tree clean.' })}
              </div>
            ) : null}
            {!loading
              && groupedEntries.staged.length + groupedEntries.unstaged.length > 0
              && filteredGroupedEntries.staged.length + filteredGroupedEntries.unstaged.length === 0 ? (
                <div className="px-2 py-4 text-sm text-text-secondary">
                  {t('core:sourceControl.emptyFilter', { defaultValue: 'No files match the current filter.' })}
                </div>
            ) : null}
            {!loading && (filteredGroupedEntries.staged.length > 0 || filteredGroupedEntries.unstaged.length > 0) ? (
              <div className="space-y-6">
                <ScmGroup
                  title={t('core:sourceControl.groups.unstaged', { defaultValue: 'Unstaged' })}
                  entries={filteredGroupedEntries.unstaged}
                  scope="unstaged"
                  selectedKey={selectedScope === 'unstaged' ? selectedKey : ''}
                  indexActionPending={indexActionPending}
                  onAllAction={handleAllIndexAction}
                  onIndexAction={handleEntryIndexAction}
                  onSelect={handleSelectEntry}
                />
                <ScmGroup
                  title={t('core:sourceControl.groups.staged', { defaultValue: 'Staged' })}
                  entries={filteredGroupedEntries.staged}
                  scope="staged"
                  selectedKey={selectedScope === 'staged' ? selectedKey : ''}
                  indexActionPending={indexActionPending}
                  onAllAction={handleAllIndexAction}
                  onIndexAction={handleEntryIndexAction}
                  onSelect={handleSelectEntry}
                />
              </div>
            ) : null}
            {(indexActionError || navigationError || error) ? (
              <div className="px-2 py-3 text-xs text-danger-soft" role="status">
                {indexActionError || navigationError || error}
              </div>
            ) : null}
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
        </>
      )}
    </div>
  )
}
