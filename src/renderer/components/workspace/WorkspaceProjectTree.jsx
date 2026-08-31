import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import {
  formatDateTime,
  formatRelativeTime,
  useRendererFormattingLocale,
} from '../../i18n/formatters.mjs'
import Icon from '../ui/Icon.jsx'
import ProjectEntryActionsMenu from '../ProjectEntryActionsMenu.jsx'
import useWorkspaceProjectTree from './useWorkspaceProjectTree.js'
import useWorkspaceThreadActivity from './useWorkspaceThreadActivity.js'
import WorkspaceThreadRow from './WorkspaceThreadRow.jsx'
import WorkspaceThreadActionsMenu from './WorkspaceThreadActionsMenu.jsx'
import { resolveVisibleProjectThreads } from './workspace-project-tree-state.mjs'
import { highestWorkspaceThreadActivity } from './workspace-thread-activity-state.mjs'

function projectActionsMenuId(projectId) {
  return `project-entry-actions-menu-${projectId}`
}

function projectActivityLabel(activity, t) {
  if (activity === 'needs_input') return t('core:threadDrawer.activity.needsInput', { defaultValue: 'Needs input' })
  if (activity === 'blocked') return t('core:threadDrawer.activity.sessionBlocked', { defaultValue: 'Session blocked' })
  if (activity === 'failed') return t('core:threadDrawer.activity.sessionFailed', { defaultValue: 'Failed' })
  if (activity === 'active') return t('core:threadDrawer.activity.sessionActive', { defaultValue: 'Session active' })
  if (activity === 'completed') return t('core:threadDrawer.activity.sessionCompleted', { defaultValue: 'Completed' })
  return ''
}

function projectActivityIcon(activity) {
  if (activity === 'needs_input') return 'question'
  if (activity === 'blocked') return 'hand-palm'
  if (activity === 'failed') return 'x-circle'
  if (activity === 'active') return 'play-circle'
  if (activity === 'completed') return 'check-circle'
  return ''
}

export default function WorkspaceProjectTree({
  enabled = true,
  activeProjectId = '',
  activeThreadId = '',
  onSelectThread,
  onCreateThread,
}) {
  const { t } = useRendererTranslation(['core'])
  const locale = useRendererFormattingLocale()
  const tree = useWorkspaceProjectTree({ enabled })
  const retryProjectThreads = tree.retryProjectThreads
  const [openMenuProjectId, setOpenMenuProjectId] = useState('')
  const [menuAnchorElement, setMenuAnchorElement] = useState(null)
  const [threadMenu, setThreadMenu] = useState(null)
  const menuTriggerRef = useRef(null)
  const menuRef = useRef(null)
  const archivedProjectIds = useMemo(
    () => new Set(tree.archivedProjects.map(({ project }) => project.id)),
    [tree.archivedProjects],
  )
  const selectedProject = openMenuProjectId
    ? tree.projects.find((project) => project.id === openMenuProjectId) || null
    : null
  const menuId = selectedProject ? projectActionsMenuId(selectedProject.id) : undefined
  const knownThreads = useMemo(() => Object.values(tree.threadStateByProject)
    .flatMap((state) => (Array.isArray(state?.threads) ? state.threads : []))
    .filter((thread) => thread?.id), [tree.threadStateByProject])
  const activityByThreadId = useWorkspaceThreadActivity({
    enabled,
    threads: knownThreads,
    foregroundThreadId: activeThreadId,
  })
  const threadMenuId = threadMenu
    ? `workspace-thread-actions-${threadMenu.projectId}-${threadMenu.thread.id}`
    : undefined
  const threadMenuKey = threadMenu ? `${threadMenu.projectId}:${threadMenu.thread.id}` : ''

  const closeProjectMenu = useCallback((restoreFocus = false) => {
    setOpenMenuProjectId('')
    setMenuAnchorElement(null)
    if (restoreFocus) window.requestAnimationFrame(() => menuTriggerRef.current?.focus())
  }, [])

  const handleMenuToggle = useCallback((projectId, trigger) => {
    if (openMenuProjectId === projectId) {
      closeProjectMenu()
      return
    }
    menuTriggerRef.current = trigger
    setMenuAnchorElement(trigger)
    setOpenMenuProjectId(projectId)
  }, [closeProjectMenu, openMenuProjectId])

  useEffect(() => {
    if (!openMenuProjectId) return undefined
    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return
      if (event.target?.closest?.('[data-ui="project-entry-actions-trigger"]')) return
      closeProjectMenu()
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeProjectMenu(true)
    }
    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeProjectMenu, openMenuProjectId])

  const handleThreadSelect = useCallback((projectId, threadId) => {
    onSelectThread(projectId, threadId)
  }, [onSelectThread])

  const closeThreadMenu = useCallback(() => setThreadMenu(null), [])

  const openThreadMenu = useCallback((projectId, thread, anchorElement) => {
    tree.clearThreadActionError(projectId, thread.id)
    setThreadMenu({ projectId, thread, anchorElement })
  }, [tree])

  const handleCreateThread = useCallback(async (projectId) => {
    const created = await onCreateThread(projectId)
    if (created) await retryProjectThreads(projectId)
    return created
  }, [onCreateThread, retryProjectThreads])

  const handleMenuMutation = useCallback(async (mutation, projectId) => {
    const changed = await mutation(projectId)
    if (changed) closeProjectMenu()
  }, [closeProjectMenu])

  if (!enabled) return null
  const hasVisibleProjectMatch = tree.recentProjects.length > 0 || tree.archivedProjects.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-ui="workspace-project-tree">
      {tree.projects.length > 0 && (
        <div className="border-b border-surface-border/45 px-3.5 py-2.5">
          <label className="sr-only" htmlFor="project-entry-search">
            {t('core:projectEntry.search.label', { defaultValue: 'Search projects' })}
          </label>
          <div className="relative">
            <Icon
              name="magnifying-glass"
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-text-muted"
            />
            <input
              id="project-entry-search"
              value={tree.query}
              onChange={(event) => tree.setQuery(event.target.value)}
              placeholder={t('core:projectEntry.search.placeholder', { defaultValue: 'Search projects' })}
              className="h-7 w-full rounded-md border border-surface-border/60 bg-surface px-7 text-[11px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-hover focus:bg-surface-panel/50"
              data-ui="project-entry-search"
            />
            {tree.query && (
              <button
                type="button"
                aria-label={t('core:projectEntry.search.clear', { defaultValue: 'Clear search' })}
                onClick={() => tree.setQuery('')}
                className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-border/45 hover:text-text-primary"
              >
                <Icon name="x" className="text-[11px]" />
              </button>
            )}
          </div>
        </div>
      )}

      {tree.error && (
        <div className="mx-3.5 mt-3 rounded-md border border-danger-border bg-danger-bg/10 px-2.5 py-2 text-[11px] leading-4 text-danger-soft">
          {String(tree.error)}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5">
        {tree.showProjectsLoading ? (
          <div className="space-y-2.5">
            <ProjectRailSkeleton />
            <ProjectRailSkeleton />
            <ProjectRailSkeleton />
          </div>
        ) : tree.projects.length === 0 ? (
          <ProjectRailEmpty />
        ) : !hasVisibleProjectMatch ? (
          <div className="px-2 py-8 text-center">
            <p className="text-[11px] font-medium text-text-secondary">
              {tree.searchLoading
                ? t('core:projectEntry.threads.loading', { defaultValue: 'Loading threads' })
                : t('core:projectEntry.search.noResults', { defaultValue: 'No matching projects' })}
            </p>
            {!tree.searchLoading && (
              <p className="mt-1 text-[10px] leading-4 text-text-muted">
                {t('core:projectEntry.search.noResultsDescription', { defaultValue: 'Clear search to return to recent projects.' })}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {tree.recentProjects.map((result) => (
              <WorkspaceProjectGroup
                key={result.project.id}
                {...result}
                activeProjectId={activeProjectId}
                activeThreadId={activeThreadId}
                activityByThreadId={activityByThreadId}
                expanded={tree.expandedProjectIds.has(result.project.id)}
                locale={locale}
                menuOpen={openMenuProjectId === result.project.id}
                onCreateThread={handleCreateThread}
                onMenuToggle={handleMenuToggle}
                onRetryThreads={tree.retryProjectThreads}
                onRevealAllThreads={tree.revealAllThreads}
                onThreadSelect={handleThreadSelect}
                onThreadMenuOpen={openThreadMenu}
                threadMenuKey={threadMenuKey}
                onToggleExpanded={tree.toggleProjectExpanded}
                query={tree.query}
                threadState={tree.threadStateByProject[result.project.id]}
                visibleCount={tree.visibleCountByProject[result.project.id]}
              />
            ))}
            {tree.archivedProjectCount > 0 && (!tree.query.trim() || tree.archivedProjects.length > 0) && (
              <div className="mt-2 border-t border-surface-border/55 pt-2" data-ui="project-entry-archive">
                <button
                  type="button"
                  aria-expanded={tree.archiveVisible}
                  aria-label={t('core:projectEntry.archive.toggle', { defaultValue: 'Toggle Archive' })}
                  disabled={Boolean(tree.query.trim())}
                  onClick={tree.toggleArchiveExpanded}
                  className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-border/30 hover:text-text-primary disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-text-secondary"
                  data-ui="project-entry-archive-toggle"
                >
                  <Icon name="archive-box" className="text-[13px] text-text-muted" />
                  <span>{t('core:projectEntry.archive.title', { defaultValue: 'Archive' })}</span>
                  <span className="ml-auto text-[9px] tabular-nums text-text-muted">{tree.archivedProjectCount}</span>
                  <Icon
                    name="caret-right"
                    className={['text-[10px] text-text-muted transition-transform duration-100', tree.archiveVisible ? 'rotate-90' : ''].join(' ')}
                  />
                </button>
                {tree.archiveVisible && (
                  <div className="mt-1.5 space-y-2 border-l border-surface-border/35 pl-1.5">
                    {tree.archivedProjects.map((result) => (
                      <WorkspaceProjectGroup
                        key={result.project.id}
                        {...result}
                        activeProjectId={activeProjectId}
                        activeThreadId={activeThreadId}
                        activityByThreadId={activityByThreadId}
                        expanded={tree.expandedProjectIds.has(result.project.id)}
                        locale={locale}
                        menuOpen={openMenuProjectId === result.project.id}
                        onCreateThread={handleCreateThread}
                        onMenuToggle={handleMenuToggle}
                        onRetryThreads={tree.retryProjectThreads}
                        onRevealAllThreads={tree.revealAllThreads}
                        onThreadSelect={handleThreadSelect}
                        onThreadMenuOpen={openThreadMenu}
                        threadMenuKey={threadMenuKey}
                        onToggleExpanded={tree.toggleProjectExpanded}
                        query={tree.query}
                        threadState={tree.threadStateByProject[result.project.id]}
                        visibleCount={tree.visibleCountByProject[result.project.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <ProjectEntryActionsMenu
        anchorElement={menuAnchorElement}
        archived={selectedProject ? archivedProjectIds.has(selectedProject.id) : false}
        menuId={menuId}
        menuRef={menuRef}
        onArchive={(projectId) => void handleMenuMutation(tree.archiveProject, projectId)}
        onClose={closeProjectMenu}
        onCreateThread={handleCreateThread}
        onRemove={(projectId) => void handleMenuMutation(tree.removeProject, projectId)}
        onRestore={(projectId) => void handleMenuMutation(tree.restoreProject, projectId)}
        project={selectedProject}
      />
      <WorkspaceThreadActionsMenu
        actionError={threadMenu ? tree.threadActionErrorByKey[`${threadMenu.projectId}:${threadMenu.thread.id}`] : ''}
        anchorElement={threadMenu?.anchorElement || null}
        menuId={threadMenuId}
        onClose={closeThreadMenu}
        onDelete={tree.deleteProjectThread}
        onRename={tree.renameProjectThread}
        projectId={threadMenu?.projectId || ''}
        thread={threadMenu?.thread || null}
      />
    </div>
  )
}

function WorkspaceProjectGroup({
  activeProjectId,
  activeThreadId,
  activityByThreadId,
  expanded,
  locale,
  matchingThreads,
  menuOpen,
  onCreateThread,
  onMenuToggle,
  onRetryThreads,
  onRevealAllThreads,
  onThreadSelect,
  onThreadMenuOpen,
  onToggleExpanded,
  project,
  query,
  threadState,
  threadMenuKey,
  visibleCount,
}) {
  const { t } = useRendererTranslation(['core'])
  const projectName = project.name || t('core:projectEntry.recentProjects.fallbackProjectName', { defaultValue: 'Project' })
  const isProjectActive = project.id === activeProjectId
  const relative = formatRelativeTime(project.lastWorkedAt, { locale, fallback: '', style: 'narrow', numeric: 'auto' })
  const lastWorkedTitle = formatDateTime(project.lastWorkedAt, { locale, fallback: '', dateStyle: 'medium', timeStyle: 'short' })
  const cachedThreads = threadState?.threads || []
  const projectActivity = highestWorkspaceThreadActivity(
    cachedThreads.map((thread) => activityByThreadId[thread.id] || 'idle'),
  )
  const projectStatusLabel = projectActivityLabel(projectActivity, t)
  const searchedThreads = query.trim() && matchingThreads.length > 0 ? matchingThreads : cachedThreads
  const visibility = query.trim()
    ? resolveVisibleProjectThreads(searchedThreads, searchedThreads.length)
    : resolveVisibleProjectThreads(searchedThreads, visibleCount)
  const regionId = `project-threads-${project.id}`
  const menuId = projectActionsMenuId(project.id)
  const projectRowActionClass = [
    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted outline-none transition hover:bg-surface-border/45 hover:text-text-primary focus-visible:text-text-primary',
    menuOpen
      ? 'opacity-100 text-text-primary'
      : 'opacity-100 md:opacity-0 md:group-hover/project:opacity-100 md:group-focus-within/project:opacity-100',
  ].join(' ')

  return (
    <div className="group/project relative" data-project-id={project.id} data-ui="project-entry-row">
      <div className={['relative flex min-h-7 items-center gap-1.5 rounded-lg py-0.5 pl-1.5 pr-1.5 transition-colors', isProjectActive ? 'bg-surface-panel-alt/70 text-text-primary' : 'text-text-secondary hover:bg-surface-border/35 hover:text-text-primary'].join(' ')}>
        <button
          type="button"
          aria-controls={regionId}
          aria-expanded={expanded}
          aria-label={expanded
            ? t('core:projectEntry.projectDisclosure.collapse', { defaultValue: 'Collapse {{name}}', name: projectName })
            : t('core:projectEntry.projectDisclosure.expand', { defaultValue: 'Expand {{name}}', name: projectName })}
          onClick={() => onToggleExpanded(project.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-0.5 text-left"
          data-ui="project-entry-disclosure"
          title={project.path}
        >
          <Icon name="caret-right" className={['shrink-0 text-[10px] text-text-muted transition-transform duration-100', expanded ? 'rotate-90' : ''].join(' ')} />
          <Icon name="folder-simple" weight="duotone" className="shrink-0 text-[13px] text-text-muted" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{projectName}</span>
        </button>
        {projectStatusLabel && (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center text-[11px] text-text-muted"
            data-activity={projectActivity}
            title={projectStatusLabel}
          >
            <Icon name={projectActivityIcon(projectActivity)} />
            <span className="sr-only">{projectStatusLabel}</span>
          </span>
        )}
        {relative && <span className="shrink-0 text-[9px] tabular-nums text-text-muted" title={lastWorkedTitle}>{relative}</span>}
        <div className="flex shrink-0 items-center gap-px" data-ui="project-entry-controls">
          <button
            type="button"
            data-ui="project-entry-actions-trigger"
            aria-controls={menuOpen ? menuId : undefined}
            aria-haspopup="menu"
            aria-label={t('core:projectEntry.projectActions.ariaLabel', { defaultValue: 'Project actions for {{name}}', name: projectName })}
            aria-expanded={menuOpen}
            onClick={(event) => onMenuToggle(project.id, event.currentTarget)}
            className={projectRowActionClass}
          >
            <Icon name="dots-three" className="text-[13px]" />
          </button>
          <button
            type="button"
            data-ui="project-entry-new-thread"
            aria-label={t('core:projectEntry.newThreadInProject', {
              defaultValue: 'New thread in {{name}}',
              name: projectName,
            })}
            title={t('core:projectEntry.newThreadInProject', {
              defaultValue: 'New thread in {{name}}',
              name: projectName,
            })}
            onClick={() => onCreateThread(project.id)}
            className={projectRowActionClass}
          >
            <Icon name="chat-circle-dots" className="text-[13px]" />
          </button>
        </div>
      </div>
      {expanded && (
        <div id={regionId} className="ml-3.5 mt-0.5 space-y-px pl-1.5">
          {visibility.visible.map((thread) => (
            <WorkspaceThreadRow
              key={thread.id}
              active={isProjectActive && thread.id === activeThreadId}
              activity={activityByThreadId[thread.id] || 'idle'}
              menuId={`workspace-thread-actions-${project.id}-${thread.id}`}
              menuOpen={threadMenuKey === `${project.id}:${thread.id}`}
              onMenuOpen={(anchorElement) => onThreadMenuOpen(project.id, thread, anchorElement)}
              onOpen={() => onThreadSelect(project.id, thread.id)}
              thread={thread}
            />
          ))}
          {visibility.visible.length === 0 && (
            <ProjectThreadState
              onCreate={() => onCreateThread(project.id)}
              onRetry={() => onRetryThreads(project.id)}
              status={threadState?.status || 'loading'}
            />
          )}
          {visibility.remaining > 0 && (
            <button
              type="button"
              onClick={() => onRevealAllThreads(project.id)}
              className="rounded px-2 py-0.5 text-left text-[9px] text-text-muted transition-colors hover:bg-surface-border/35 hover:text-text-secondary"
            >
              {t('core:threadDrawer.loadMore', { defaultValue: 'Load more threads ({{count}} hidden)', count: visibility.remaining })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ProjectThreadState({ onCreate, onRetry, status }) {
  const { t } = useRendererTranslation(['core'])
  if (status === 'failed') {
    return <button type="button" onClick={onRetry} className="rounded px-2 py-1 text-left text-[10px] text-text-muted hover:text-text-primary">{t('core:threadDrawer.retry', { defaultValue: 'Retry' })}</button>
  }
  if (status === 'empty') {
    return <button type="button" onClick={onCreate} className="rounded px-2 py-1 text-left text-[10px] text-text-muted hover:text-text-primary">{t('core:threadDrawer.newThreadTitle', { defaultValue: 'New thread' })}</button>
  }
  return <span className="block rounded px-2 py-1 text-[10px] text-text-muted/70">{t('core:projectEntry.threads.loading', { defaultValue: 'Loading threads' })}</span>
}

function ProjectRailEmpty() {
  const { t } = useRendererTranslation(['core'])
  return (
    <div className="flex min-h-[15rem] flex-col items-center justify-center px-3 text-center">
      <Icon name="folder-simple-dashed" className="text-[25px] text-text-tertiary/45" />
      <p className="mt-3 text-[12px] font-medium text-text-secondary">{t('core:projectEntry.empty.title', { defaultValue: 'No recent projects' })}</p>
      <p className="mt-1 max-w-56 text-[11px] leading-4 text-text-tertiary">{t('core:projectEntry.empty.description', { defaultValue: 'Open a folder to start working in the main workspace.' })}</p>
    </div>
  )
}

function ProjectRailSkeleton() {
  return (
    <div className="px-1.5 py-1 motion-safe:animate-pulse">
      <div className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded bg-surface-border/60" /><span className="h-3 w-28 rounded bg-surface-border/55" /><span className="ml-auto h-2.5 w-7 rounded bg-surface-border/40" /></div>
      <div className="ml-3.5 mt-1.5 space-y-1 border-l border-surface-border/40 pl-1.5"><span className="block h-5 w-full rounded bg-surface-border/35" /><span className="block h-5 w-3/4 rounded bg-surface-border/30" /></div>
    </div>
  )
}
