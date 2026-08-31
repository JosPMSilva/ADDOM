import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import { useShallow } from 'zustand/react/shallow'
import useMemoryStore from '../store/useMemoryStore.js'
import useAppStore, { requestAppAlert } from '../store/useAppStore.js'
import useChatStore from '../store/useChatStore.js'
import Icon from './ui/Icon.jsx'
import { useRendererFormattingLocale } from '../i18n/formatters.mjs'
import {
  AddNodeForm,
  EditNodeModal,
  EmbedderBadge,
  EmptyHistoryState,
  EmptyMemoryState,
  HistoryEventCard,
  MemoryNodeCard,
} from './memory/MemoryPanelLeafComponents.jsx'

const MEMORY_SCOPE_FILTER_OPTIONS = [
  { value: 'current_thread', labelKey: 'core:memoryPanel.scopeFilters.currentThread', defaultValue: 'Current Thread' },
  { value: 'project', labelKey: 'core:memoryPanel.scopeFilters.project', defaultValue: 'Project' },
  { value: 'global', labelKey: 'core:memoryPanel.scopeFilters.global', defaultValue: 'Global' },
  { value: 'all', labelKey: 'core:memoryPanel.scopeFilters.all', defaultValue: 'All' },
]

export default function MemoryPanel() {
  const { t } = useRendererTranslation(['core'])
  const formatLocale = useRendererFormattingLocale()
  const projectFolder = useAppStore((s) => s.projectFolder)
  const activeThreadId = useAppStore((s) => s.activeThreadId)
  const activeTimelineSignature = useChatStore((s) => {
    const rows = Array.isArray(s.timeline) ? s.timeline : []
    const lastRow = rows[rows.length - 1]
    const lastRowMarker = lastRow?.message?.id
      || lastRow?.activity?.id
      || lastRow?.turnId
      || lastRow?.id
      || ''
    return `${String(s.activeThreadId || '')}:${rows.length}:${String(lastRowMarker || '')}`
  })
  const {
    nodes,
    loading,
    activeScopeFilter,
    setActiveScopeFilter,
    includeCompressed,
    setIncludeCompressed,
    lastCompressionEvent,
    setCompressionEvent,
    clearCompressionEvent,
    loadNodes,
    refreshNodes,
    searchQuery,
    searchResults,
    searching,
    search,
    clearSearch,
    setSearchQuery,
    addNode,
    updateNode,
    deleteNode,
    togglePin,
    promoteNode,
    keepNodeInThread,
    makeNodeGlobal,
    invalidateNode,
    embedderState,
    embedderProgress,
    setEmbedderStatus,
    editingNode,
    setEditingNode,
    clearEditingNode,
  } = useMemoryStore(useShallow((s) => ({
    nodes: s.nodes,
    loading: s.loading,
    activeScopeFilter: s.activeScopeFilter,
    setActiveScopeFilter: s.setActiveScopeFilter,
    includeCompressed: s.includeCompressed,
    setIncludeCompressed: s.setIncludeCompressed,
    lastCompressionEvent: s.lastCompressionEvent,
    setCompressionEvent: s.setCompressionEvent,
    clearCompressionEvent: s.clearCompressionEvent,
    loadNodes: s.loadNodes,
    refreshNodes: s.refreshNodes,
    searchQuery: s.searchQuery,
    searchResults: s.searchResults,
    searching: s.searching,
    search: s.search,
    clearSearch: s.clearSearch,
    setSearchQuery: s.setSearchQuery,
    addNode: s.addNode,
    updateNode: s.updateNode,
    deleteNode: s.deleteNode,
    togglePin: s.togglePin,
    promoteNode: s.promoteNode,
    keepNodeInThread: s.keepNodeInThread,
    makeNodeGlobal: s.makeNodeGlobal,
    invalidateNode: s.invalidateNode,
    embedderState: s.embedderState,
    embedderProgress: s.embedderProgress,
    setEmbedderStatus: s.setEmbedderStatus,
    editingNode: s.editingNode,
    setEditingNode: s.setEditingNode,
    clearEditingNode: s.clearEditingNode,
  })))

  const [showAddForm, setShowAddForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeView, setActiveView] = useState('memory')
  const [threadHistory, setThreadHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const lastCompressionSummaryNodeId = String(lastCompressionEvent?.summaryNodeId || '').trim()

  useEffect(() => {
    if (!lastCompressionSummaryNodeId || loading) return
    const timer = setTimeout(() => {
      const el = document.getElementById(`memory-node-${lastCompressionSummaryNodeId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-accent')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-accent')
      }, 1200)
    }, 120)
    return () => clearTimeout(timer)
  }, [lastCompressionSummaryNodeId, loading])

  useEffect(() => {
    const unUpdated = window.addom.memory.onUpdated(() => {
      if (projectFolder) {
        refreshNodes(projectFolder, {
          scopeFilter: activeScopeFilter,
          threadId: activeThreadId,
        })
      }
    })
    const unStatus = window.addom.memory.onEmbedderStatus((status) => {
      setEmbedderStatus(status)
    })

    return () => {
      unUpdated()
      unStatus()
    }
  }, [activeScopeFilter, activeThreadId, projectFolder, refreshNodes, setEmbedderStatus])

  useEffect(() => {
    if (activeScopeFilter !== 'current_thread' || activeThreadId) return
    setActiveScopeFilter('project')
  }, [activeScopeFilter, activeThreadId, setActiveScopeFilter])

  useEffect(() => {
    let cancelled = false
    if (activeView !== 'history') return () => {}
    if (!activeThreadId || !window?.addom?.workspace?.listTimeline) {
      setThreadHistory([])
      return () => {}
    }
    setHistoryLoading(true)
    window.addom.workspace.listTimeline(activeThreadId, { limit: 300 })
      .then((rows) => {
        if (cancelled) return
        const filtered = (Array.isArray(rows) ? rows : [])
          .filter((row) => row?.kind === 'user_message' || row?.kind === 'assistant_message')
          .slice(-200)
        setThreadHistory(filtered)
      })
      .catch(() => {
        if (!cancelled) setThreadHistory([])
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeThreadId, activeTimelineSignature, activeView])

  const isSearchMode = searchResults !== null

  useEffect(() => {
    if (activeView !== 'memory' || !projectFolder) return
    if (isSearchMode && searchQuery.trim()) {
      void search(projectFolder, searchQuery, {
        scopeFilter: activeScopeFilter,
        threadId: activeThreadId,
      })
      return
    }
    void loadNodes(projectFolder, {
      includeCompressed,
      scopeFilter: activeScopeFilter,
      threadId: activeThreadId,
    })
  }, [
    activeScopeFilter,
    activeThreadId,
    activeView,
    includeCompressed,
    isSearchMode,
    loadNodes,
    projectFolder,
    search,
    searchQuery,
  ])

  const handleSearch = useCallback((e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      search(projectFolder, searchQuery, {
        scopeFilter: activeScopeFilter,
        threadId: activeThreadId,
      })
    }
    else clearSearch()
  }, [activeScopeFilter, activeThreadId, clearSearch, projectFolder, search, searchQuery])
  const handleToggleIncludeCompressed = useCallback((checked) => {
    clearSearch()
    setIncludeCompressed(checked)
    if (!projectFolder) return
    void loadNodes(projectFolder, {
      includeCompressed: checked,
      scopeFilter: activeScopeFilter,
      threadId: activeThreadId,
    })
  }, [
    activeScopeFilter,
    activeThreadId,
    clearSearch,
    loadNodes,
    projectFolder,
    setIncludeCompressed,
  ])
  const handleSelectScopeFilter = useCallback((scopeFilter) => {
    clearSearch()
    setShowAddForm(false)
    setActiveScopeFilter(scopeFilter)
  }, [clearSearch, setActiveScopeFilter])

  const displayNodes = searchResults !== null ? searchResults : nodes
  const { pinnedNodes, otherNodes } = useMemo(() => {
    const nextPinnedNodes = []
    const nextOtherNodes = []
    for (const node of Array.isArray(displayNodes) ? displayNodes : []) {
      if (node?.pinned) nextPinnedNodes.push(node)
      else nextOtherNodes.push(node)
    }
    return {
      pinnedNodes: nextPinnedNodes,
      otherNodes: nextOtherNodes,
    }
  }, [displayNodes])
  const visibleCount = activeView === 'history'
    ? threadHistory.length
    : (Array.isArray(displayNodes) ? displayNodes.length : 0)
  const visibleCountLabel = activeView === 'history'
    ? t(
      visibleCount === 1
        ? 'core:memoryPanel.visibleCount.eventOne'
        : 'core:memoryPanel.visibleCount.eventOther',
      {
        count: visibleCount,
        defaultValue: visibleCount === 1 ? '{{count}} event' : '{{count}} events',
      },
    )
    : t(
      visibleCount === 1
        ? 'core:memoryPanel.visibleCount.nodeOne'
        : 'core:memoryPanel.visibleCount.nodeOther',
      {
        count: visibleCount,
        defaultValue: visibleCount === 1 ? '{{count}} node' : '{{count}} nodes',
      },
    )
  const handleExportProjectJson = useCallback(async () => {
    if (!projectFolder || exporting) return
    setExporting(true)
    try {
      const result = await window.addom.memory.exportProjectJson(projectFolder, {
        includeGlobal: activeScopeFilter === 'global' || activeScopeFilter === 'all',
      })
      if (result?.cancelled) return
      if (!result?.ok) {
        throw new Error(String(result?.error || 'Export failed'))
      }
      await requestAppAlert({
        title: t('core:memoryPanel.export.completedTitle', { defaultValue: 'Export complete' }),
        message: t('core:memoryPanel.export.completedMessage', {
          defaultValue: 'Exported context JSON.\n\nFile: {{filePath}}\nMemory nodes: {{memoryNodeCount}}\nArtifact files: {{artifactFileCount}}\nArtifact revisions: {{artifactRevisionCount}}',
          filePath: result.filePath,
          memoryNodeCount: Number(result.memoryNodeCount || 0),
          artifactFileCount: Number(result.artifactFileCount || 0),
          artifactRevisionCount: Number(result.artifactRevisionCount || 0),
        }),
      })
    } catch (err) {
      await requestAppAlert({
        title: t('core:memoryPanel.export.failedTitle', { defaultValue: 'Export failed' }),
        message: t('core:memoryPanel.export.failedMessage', {
          defaultValue: 'Failed to export context JSON: {{message}}',
          message: err.message,
        }),
      })
    } finally {
      setExporting(false)
    }
  }, [activeScopeFilter, projectFolder, exporting, t])

  const renderNodeCard = useCallback((node) => {
    const originThreadId = String(node?.originThreadId || node?.threadId || activeThreadId || '').trim()
    const canKeepInCurrentThread = !!activeThreadId
      && !(node?.scope === 'thread' && String(node?.threadId || '').trim() === String(activeThreadId || '').trim())

    return (
      <MemoryNodeCard
        key={node.id}
        node={node}
        onPin={() => togglePin(projectFolder, node.id, node.pinned)}
        onEdit={() => setEditingNode(node)}
        onDelete={() => deleteNode(projectFolder, node.id)}
        onPromoteToProject={node.scope !== 'project'
          ? () => promoteNode(projectFolder, node.id, {
            targetScope: 'project',
            originThreadId,
          })
          : null}
        onKeepInThread={canKeepInCurrentThread
          ? () => keepNodeInThread(projectFolder, node.id, {
            threadId: activeThreadId,
            originThreadId: originThreadId || activeThreadId,
          })
          : null}
        onMakeGlobal={node.scope !== 'global'
          ? () => makeNodeGlobal(projectFolder, node.id, {
            originThreadId,
          })
          : null}
        onInvalidate={!node.invalidatedAt
          ? () => invalidateNode(projectFolder, node.id)
          : null}
      />
    )
  }, [
    activeThreadId,
    deleteNode,
    invalidateNode,
    keepNodeInThread,
    makeNodeGlobal,
    projectFolder,
    promoteNode,
    setEditingNode,
    togglePin,
  ])

  return (
    <div data-memory-layout="ledger" className="flex h-full flex-col bg-surface-panel-alt">
      <header className="shrink-0 border-b border-surface-border/60 bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="book-open" className="text-text-secondary" size={17} />
            <h2 className="text-[15px] font-semibold tracking-tight text-text-primary font-display">
              {t('core:memoryPanel.title', { defaultValue: 'Memory' })}
            </h2>
            <span className="text-[11px] text-text-muted">{visibleCountLabel}</span>
            <EmbedderBadge state={embedderState} progress={embedderProgress} />
          </div>
          <div
            role="tablist"
            aria-label={t('core:memoryPanel.title', { defaultValue: 'Memory' })}
            className="flex items-center gap-4"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'memory'}
              aria-controls="memory-ledger-view"
              onClick={() => setActiveView('memory')}
              className={`border-b px-0.5 py-1.5 text-[12px] font-medium transition-colors ${activeView === 'memory'
                ? 'border-text-primary text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {t('core:memoryPanel.tabs.memoryView', { defaultValue: 'Memory' })}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'history'}
              aria-controls="memory-history-view"
              onClick={() => setActiveView('history')}
              className={`border-b px-0.5 py-1.5 text-[12px] font-medium transition-colors ${activeView === 'history'
                ? 'border-text-primary text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {t('core:memoryPanel.tabs.history', { defaultValue: 'Thread History' })}
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-5 sm:px-6">
          {activeView === 'memory' && (
            <section id="memory-ledger-view" role="tabpanel" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-surface-border/60 pb-3">
                {MEMORY_SCOPE_FILTER_OPTIONS.map((option) => {
                  const disabled = option.value === 'current_thread' && !activeThreadId
                  const selected = activeScopeFilter === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSelectScopeFilter(option.value)}
                      disabled={disabled}
                      aria-pressed={selected}
                      className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected
                        ? 'bg-surface-raised text-text-primary'
                        : 'text-text-muted hover:bg-surface-panel hover:text-text-secondary'
                      }`}
                    >
                      {t(option.labelKey, { defaultValue: option.defaultValue })}
                    </button>
                  )
                })}
              </div>

              <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2.5">
                <div className="flex min-w-[16rem] flex-1 items-center gap-2 border border-surface-border bg-surface px-3 py-2 focus-within:border-text-muted">
                  <Icon name="magnifying-glass" className="text-text-muted" size={15} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') clearSearch()
                    }}
                    placeholder={t('core:memoryPanel.search.placeholder', { defaultValue: 'Search memory...' })}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary placeholder-text-tertiary outline-none"
                  />
                  {searchResults !== null && (
                    <button type="button" onClick={clearSearch} className="text-[11px] text-text-muted hover:text-text-primary">
                      {t('core:common.clear', { defaultValue: 'Clear' })}
                    </button>
                  )}
                </div>
                <label className="inline-flex items-center gap-1.5 px-1 text-[11px] text-text-secondary">
                  <input
                    type="checkbox"
                    checked={includeCompressed}
                    onChange={(e) => handleToggleIncludeCompressed(e.target.checked)}
                    className="accent-accent"
                  />
                  {t('core:memoryPanel.controls.showArchived', { defaultValue: 'Show archived' })}
                </label>
                <button
                  type="button"
                  onClick={handleExportProjectJson}
                  disabled={!projectFolder || exporting}
                  className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-2.5 py-1.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  title={t('core:memoryPanel.controls.exportJsonTitle', { defaultValue: 'Export memory logs and artifacts to JSON' })}
                >
                  {exporting
                    ? <><Icon name="spinner" className="animate-spin" size={12} /> {t('core:memoryPanel.controls.exporting', { defaultValue: 'Exporting...' })}</>
                    : <><Icon name="export" size={12} /> {t('core:memoryPanel.controls.exportJson', { defaultValue: 'Export JSON' })}</>}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm((value) => !value)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-control-active px-2.5 py-1.5 text-[11px] font-medium text-control-active-fg transition-colors hover:opacity-90"
                >
                  <Icon name="plus" size={12} weight="bold" />
                  {t('core:memoryPanel.controls.addNode', { defaultValue: 'Add Node' })}
                </button>
              </form>

              {searchResults !== null && (
                <p className="text-[11px] text-text-muted" aria-live="polite">
                  {searching
                    ? t('core:memoryPanel.search.searching', { defaultValue: 'Searching...' })
                    : t(
                      searchResults.length === 1
                        ? 'core:memoryPanel.search.resultOne'
                        : 'core:memoryPanel.search.resultOther',
                      {
                        count: searchResults.length,
                        defaultValue: searchResults.length === 1 ? '{{count}} result' : '{{count}} results',
                      },
                    )}
                </p>
              )}

              {showAddForm && (
                <AddNodeForm
                  onSave={async ({ topic, content, tags, isGlobal }) => {
                    const requestedScope = isGlobal
                      ? 'global'
                      : activeScopeFilter === 'current_thread'
                        ? 'thread'
                        : activeScopeFilter === 'global'
                          ? 'global'
                          : 'project'
                    await addNode(projectFolder, {
                      topic,
                      content,
                      tags,
                      isGlobal: requestedScope === 'global',
                      scope: requestedScope,
                      threadId: requestedScope === 'thread' ? activeThreadId : '',
                      originThreadId: requestedScope === 'thread' ? activeThreadId : '',
                    })
                    setShowAddForm(false)
                  }}
                  defaultIsGlobal={activeScopeFilter === 'global'}
                  onCancel={() => setShowAddForm(false)}
                />
              )}

              {lastCompressionEvent?.summaryNodeId && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-surface-border/60 py-3 text-[11px]">
                  <Icon name="archive" size={13} className="text-text-muted" />
                  <span className="font-medium text-text-primary">{t('core:memoryPanel.compression.latestBatchTitle', { defaultValue: 'Latest compression batch' })}</span>
                  <span className="min-w-[16rem] flex-1 text-text-muted">
                    {t('core:memoryPanel.compression.summary', {
                      defaultValue: 'Compressed logs #{{rangeStart}} to #{{rangeEnd}} into summary node ({{archivedCount}} archived).',
                      rangeStart: lastCompressionEvent.rangeStart,
                      rangeEnd: lastCompressionEvent.rangeEnd,
                      archivedCount: lastCompressionEvent.archivedCount,
                    })}
                  </span>
                  <button type="button" onClick={() => setCompressionEvent(lastCompressionEvent)} className="text-text-secondary hover:text-text-primary">
                    {t('core:memoryPanel.compression.jumpToSummary', { defaultValue: 'Jump to Summary' })}
                  </button>
                  <button type="button" onClick={() => handleToggleIncludeCompressed(true)} className="text-text-secondary hover:text-text-primary">
                    {t('core:memoryPanel.controls.showArchived', { defaultValue: 'Show archived' })}
                  </button>
                  <button type="button" onClick={clearCompressionEvent} className="text-text-muted hover:text-text-primary">
                    {t('core:memoryPanel.compression.dismiss', { defaultValue: 'Dismiss' })}
                  </button>
                </div>
              )}

              <div className="flex flex-col">
        {activeView === 'memory' && loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-tertiary">
            <Icon name="spinner" className="animate-spin text-accent" size={24} />
            <p className="text-sm font-medium">{t('core:memoryPanel.loading.memory', { defaultValue: 'Loading memory...' })}</p>
          </div>
        )}

        {activeView === 'memory' && !loading && displayNodes.length === 0 && (
          <EmptyMemoryState searched={searchResults !== null} />
        )}

        {activeView === 'memory' && pinnedNodes.length > 0 && (
          <>
            <p className="text-text-tertiary text-[11px] font-bold uppercase tracking-[0.1em] px-1 mt-1 flex items-center gap-1.5"><Icon name="push-pin" size={12} weight="fill" className="text-accent/60" /> {t('core:memoryPanel.sections.pinned', { defaultValue: 'Pinned' })}</p>
            {pinnedNodes.map(renderNodeCard)}
            {otherNodes.length > 0 && (
              <p className="text-text-tertiary text-[11px] font-bold uppercase tracking-[0.1em] px-1 mt-3 flex items-center gap-1.5"><Icon name="squares-four" size={12} weight="fill" className="text-accent/60" /> {t('core:memoryPanel.sections.allNodes', { defaultValue: 'All Memory Nodes' })}</p>
            )}
          </>
        )}

        {activeView === 'memory' && otherNodes.map(renderNodeCard)}
              </div>
            </section>
          )}

          {activeView === 'history' && (
            <section id="memory-history-view" role="tabpanel" className="flex flex-col">
              {historyLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-tertiary">
            <Icon name="spinner" className="animate-spin text-accent" size={24} />
            <p className="text-sm font-medium">{t('core:memoryPanel.loading.threadHistory', { defaultValue: 'Loading thread history...' })}</p>
          </div>
              )}

              {!historyLoading && threadHistory.length === 0 && (
                <EmptyHistoryState hasThread={!!activeThreadId} />
              )}

              {!historyLoading && threadHistory.map((entry) => (
                <HistoryEventCard key={entry.eventId} entry={entry} locale={formatLocale} />
              ))}
            </section>
          )}
        </div>
      </div>

      {editingNode && (
        <EditNodeModal
          node={editingNode}
          onSave={async (fields) => {
            await updateNode(projectFolder, editingNode.id, fields)
            clearEditingNode()
          }}
          onClose={clearEditingNode}
        />
      )}
    </div>
  )
}

export { MemoryNodeCard } from './memory/MemoryPanelLeafComponents.jsx'
