import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import useWorkspaceStore from '../../store/useWorkspaceStore.js'
import { requestAppAlert, requestAppConfirm } from '../../store/useAppStore.js'
import {
  partitionWorkspaceProjects,
  resolveInitialExpandedProjectIds,
} from '../workspace-project-entry-state.mjs'
import {
  DEFAULT_VISIBLE_PROJECT_THREAD_COUNT,
  MAX_PROJECT_THREAD_SEARCH_CONCURRENCY,
  filterWorkspaceProjectTree,
  resolveArchiveDisclosure,
  resolveArchiveDisclosureToggle,
  resolveProjectThreadLoadState,
  runBoundedProjectThreadLoads,
} from './workspace-project-tree-state.mjs'
import { runOwningThreadMutation } from './workspace-thread-actions.mjs'
import { prepareWorkspaceDisposalIntent } from './workspace-disposal-intent.mjs'

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key)
}

export default function useWorkspaceProjectTree({ enabled = true } = {}) {
  const { t } = useRendererTranslation(['core'])
  const {
    initialized,
    projects,
    activeProjectId,
    threads,
    loadingProjects,
    error,
    projectEntryArchivedAtById,
    projectEntryRestoredAtById,
    archiveProjectById,
    removeProjectById,
    restoreProjectToRecent,
    renameThread,
    deleteThread,
  } = useWorkspaceStore(useShallow((state) => ({
    initialized: state.initialized,
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    threads: state.threads,
    loadingProjects: state.loadingProjects,
    error: state.error,
    projectEntryArchivedAtById: state.projectEntryArchivedAtById,
    projectEntryRestoredAtById: state.projectEntryRestoredAtById,
    archiveProjectById: state.archiveProjectById,
    removeProjectById: state.removeProjectById,
    restoreProjectToRecent: state.restoreProjectToRecent,
    renameThread: state.renameThread,
    deleteThread: state.deleteThread,
  })))
  const [query, setQuery] = useState('')
  const [archiveExpanded, setArchiveExpanded] = useState(false)
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set())
  const [threadStateByProject, setThreadStateByProject] = useState({})
  const [visibleCountByProject, setVisibleCountByProject] = useState({})
  const [threadActionErrorByKey, setThreadActionErrorByKey] = useState({})
  const expansionInitializedRef = useRef(false)
  const threadStateRef = useRef({})
  const threadRequestsRef = useRef(new Map())
  const loadQueueRef = useRef(Promise.resolve())
  const showProjectsLoading = (!initialized || loadingProjects) && projects.length === 0

  const updateThreadState = useCallback((projectId, nextState) => {
    setThreadStateByProject((current) => {
      const next = { ...current, [projectId]: nextState }
      threadStateRef.current = next
      return next
    })
  }, [])

  const loadProjectThreads = useCallback((projectId, { force = false } = {}) => {
    const id = String(projectId || '').trim()
    if (!id) return Promise.resolve([])
    const cached = threadStateRef.current[id]
    if (!force && (cached?.status === 'loaded' || cached?.status === 'empty')) {
      return Promise.resolve(cached.threads)
    }
    const pending = threadRequestsRef.current.get(id)
    if (pending) return pending
    const listThreads = window?.addom?.workspace?.listThreads
    if (typeof listThreads !== 'function') {
      const failed = resolveProjectThreadLoadState(
        undefined,
        'Desktop workspace required',
        cached?.threads,
      )
      updateThreadState(id, failed)
      return Promise.reject(new Error(failed.error))
    }

    updateThreadState(id, {
      status: 'loading',
      threads: cached?.threads || [],
      error: '',
    })
    const request = Promise.resolve()
      .then(() => listThreads(id))
      .then((rows) => {
        const settled = resolveProjectThreadLoadState(rows)
        updateThreadState(id, settled)
        setVisibleCountByProject((current) => hasOwn(current, id)
          ? current
          : { ...current, [id]: DEFAULT_VISIBLE_PROJECT_THREAD_COUNT })
        return settled.threads
      })
      .catch((loadError) => {
        updateThreadState(id, resolveProjectThreadLoadState(undefined, loadError, cached?.threads))
        throw loadError
      })
      .finally(() => {
        threadRequestsRef.current.delete(id)
      })
    threadRequestsRef.current.set(id, request)
    return request
  }, [updateThreadState])

  const queueProjectThreadLoads = useCallback((projectIds, options) => {
    const ids = [...new Set(projectIds.map((id) => String(id || '').trim()).filter(Boolean))]
    const run = () => runBoundedProjectThreadLoads(
      ids,
      (projectId) => loadProjectThreads(projectId, options),
      MAX_PROJECT_THREAD_SEARCH_CONCURRENCY,
    )
    const queued = loadQueueRef.current.then(run, run)
    loadQueueRef.current = queued.then(() => undefined, () => undefined)
    return queued
  }, [loadProjectThreads])

  const { recentProjects, archivedProjects } = useMemo(() => partitionWorkspaceProjects(
    projects,
    projectEntryRestoredAtById,
    projectEntryArchivedAtById,
  ), [projectEntryArchivedAtById, projectEntryRestoredAtById, projects])

  useEffect(() => {
    if (!enabled || showProjectsLoading || projects.length === 0) return
    const validIds = new Set(projects.map((project) => project.id))
    if (!expansionInitializedRef.current) {
      expansionInitializedRef.current = true
      setExpandedProjectIds(new Set(resolveInitialExpandedProjectIds(recentProjects)))
    } else {
      setExpandedProjectIds((current) => new Set([...current].filter((id) => validIds.has(id))))
    }
    setThreadStateByProject((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => validIds.has(id)))
      threadStateRef.current = next
      return next
    })
    setVisibleCountByProject((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => validIds.has(id)),
    ))
  }, [enabled, projects, recentProjects, showProjectsLoading])

  useEffect(() => {
    if (!enabled || showProjectsLoading || expandedProjectIds.size === 0) return
    void queueProjectThreadLoads([...expandedProjectIds])
  }, [enabled, expandedProjectIds, queueProjectThreadLoads, showProjectsLoading])

  useEffect(() => {
    if (!enabled || showProjectsLoading || !query.trim()) return
    void queueProjectThreadLoads(projects.map((project) => project.id))
  }, [enabled, projects, query, queueProjectThreadLoads, showProjectsLoading])

  useEffect(() => {
    const current = threadStateRef.current[activeProjectId]
    if (!enabled || !activeProjectId || !current || current.status === 'loading') return
    updateThreadState(activeProjectId, resolveProjectThreadLoadState(threads))
  }, [activeProjectId, enabled, threads, updateThreadState])

  const recentResults = useMemo(() => filterWorkspaceProjectTree(
    recentProjects,
    threadStateByProject,
    query,
  ), [query, recentProjects, threadStateByProject])
  const archivedResults = useMemo(() => filterWorkspaceProjectTree(
    archivedProjects,
    threadStateByProject,
    query,
  ), [archivedProjects, query, threadStateByProject])
  const archiveVisible = resolveArchiveDisclosure(archiveExpanded, query)
  const toggleArchiveExpanded = useCallback(() => {
    setArchiveExpanded((current) => resolveArchiveDisclosureToggle(current, query))
  }, [query])
  const searchLoading = Boolean(query.trim()) && projects.some((project) => {
    const status = threadStateByProject[project.id]?.status
    return !status || status === 'loading'
  })
  const effectiveExpandedProjectIds = useMemo(() => {
    if (!query.trim()) return expandedProjectIds
    const next = new Set(expandedProjectIds)
    for (const result of [...recentResults, ...archivedResults]) {
      if (result.matchingThreads.length > 0) next.add(result.project.id)
    }
    return next
  }, [archivedResults, expandedProjectIds, query, recentResults])

  const toggleProjectExpanded = useCallback((projectId) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  const revealAllThreads = useCallback((projectId) => {
    const threads = threadStateRef.current[projectId]?.threads || []
    setVisibleCountByProject((current) => ({ ...current, [projectId]: threads.length }))
  }, [])

  const retryProjectThreads = useCallback((projectId) => (
    queueProjectThreadLoads([projectId], { force: true })
  ), [queueProjectThreadLoads])
  const refreshOwningProjectThreads = useCallback((projectId) => (
    loadProjectThreads(projectId, { force: true })
  ), [loadProjectThreads])

  const setThreadActionError = useCallback((projectId, threadId, message = '') => {
    const key = `${projectId}:${threadId}`
    setThreadActionErrorByKey((current) => ({ ...current, [key]: String(message || '') }))
  }, [])

  const renameProjectThread = useCallback(async ({ projectId, threadId, title }) => {
    setThreadActionError(projectId, threadId)
    return runOwningThreadMutation({
      projectId,
      mutate: async () => {
        const changed = await renameThread({
          projectId, threadId, title, reportError: false, throwOnError: true,
        })
        if (!changed) throw new Error('Failed to rename thread.')
        return changed
      },
      refresh: refreshOwningProjectThreads,
      onError: (actionError) => setThreadActionError(projectId, threadId, actionError?.message),
    })
  }, [refreshOwningProjectThreads, renameThread, setThreadActionError])

  const deleteProjectThread = useCallback(async ({ projectId, threadId, title }) => {
    setThreadActionError(projectId, threadId)
    const intent = await prepareWorkspaceDisposalIntent({
      workspaceApi: window.addom.workspace,
      action: 'delete-thread',
      scope: 'thread',
      projectId,
      threadId,
    })
    const activeMessage = intent.requiresStop
      ? `\n\n${t('core:workspaceDisposal.threadDeleteActiveMessage', { defaultValue: intent.message })}`
      : ''
    const confirmed = await requestAppConfirm({
      title: t('core:chat.threadModals.clear.deleteTitle', { defaultValue: 'Delete thread' }),
      message: t('core:chat.threadModals.clear.deleteMessage', {
        defaultValue: 'Delete this thread{{threadTitle}}? Its conversation, attachments, and thread activity will be removed. Project files, Artifacts, and preserved Memory will remain.',
        threadTitle: title ? ` “${title}”` : '',
      }) + activeMessage,
      confirmLabel: intent.requiresStop
        ? t('core:workspaceDisposal.stopAndDelete', { defaultValue: intent.confirmLabel })
        : t('core:chat.threadModals.clear.deleteConfirm', { defaultValue: 'Delete thread' }),
      cancelLabel: t('core:chat.threadModals.common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!confirmed) return null
    return runOwningThreadMutation({
      projectId,
      mutate: async () => {
        const result = await deleteThread({
          projectId, threadId, stopActive: intent.stopActive, reportError: false, throwOnError: true,
        })
        if (!result?.ok) throw new Error('Failed to delete thread.')
        return result
      },
      refresh: refreshOwningProjectThreads,
      onError: (actionError) => setThreadActionError(projectId, threadId, actionError?.message),
    })
  }, [deleteThread, refreshOwningProjectThreads, setThreadActionError, t])

  const archiveProject = useCallback(async (projectId) => {
    const project = projects.find((row) => row.id === projectId)
    if (!project) return false
    const intent = await prepareWorkspaceDisposalIntent({
      workspaceApi: window.addom.workspace,
      action: 'archive-project',
      scope: 'project',
      projectId,
    })
    if (intent.requiresStop) {
      const confirmed = await requestAppConfirm({
        title: t('core:projectEntry.archiveProjectDialog.title', {
          defaultValue: 'Stop active work and archive project?',
        }),
        message: t('core:projectEntry.archiveProjectDialog.message', {
          defaultValue: 'Active work in "{{name}}" will stop before the project moves to Archive.',
          name: project.name,
        }),
        confirmLabel: t('core:workspaceDisposal.stopAndArchive', {
          defaultValue: intent.confirmLabel,
        }),
        cancelLabel: t('core:projectEntry.archiveProjectDialog.cancel', { defaultValue: 'Cancel' }),
      })
      if (!confirmed) return false
    }
    const result = await archiveProjectById(projectId, { stopActive: intent.stopActive })
    if (!result?.ok) throw new Error(String(result?.error || 'Failed to archive project.'))
    return true
  }, [archiveProjectById, projects, t])

  const removeProject = useCallback(async (projectId) => {
    const project = projects.find((row) => row.id === projectId)
    if (!project) return false
    const intent = await prepareWorkspaceDisposalIntent({
      workspaceApi: window.addom.workspace,
      action: 'remove-project',
      scope: 'project',
      projectId,
    })
    const activeMessage = intent.requiresStop
      ? `\n\n${t('core:workspaceDisposal.activeMessage', { defaultValue: intent.message })}`
      : ''
    const duplicateName = projects.some((row) => row.id !== project.id && row.name === project.name)
    const pathMessage = duplicateName
      ? `\n\n${t('core:projectEntry.removeProjectDialog.path', {
        defaultValue: 'Folder: {{path}}',
        path: project.path,
      })}`
      : ''
    const confirmed = await requestAppConfirm({
      title: t('core:projectEntry.removeProjectDialog.title', { defaultValue: 'Remove from ADDOM?' }),
      message: t('core:projectEntry.removeProjectDialog.message', {
        defaultValue: '"{{name}}" and all of its ADDOM history, Memory, Artifacts, and recovery data will be removed. Project files are unchanged.',
        name: project.name,
      }) + pathMessage + activeMessage,
      confirmLabel: intent.requiresStop
        ? t('core:workspaceDisposal.stopAndRemove', { defaultValue: intent.confirmLabel })
        : t('core:projectEntry.removeProjectDialog.confirm', { defaultValue: 'Remove from ADDOM' }),
      cancelLabel: t('core:projectEntry.removeProjectDialog.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!confirmed) return false
    const result = await removeProjectById(projectId, { stopActive: intent.stopActive })
    if (!result?.ok) {
      await requestAppAlert({
        title: t('core:projectEntry.removeProjectDialog.failureTitle', {
          defaultValue: 'Could not remove from ADDOM',
        }),
        message: result?.retryable
          ? t('core:projectEntry.removeProjectDialog.failureMessage', {
            defaultValue: 'Nothing was removed from ADDOM. Try again.',
          })
          : String(result?.error || 'The project could not be removed.'),
      })
      return false
    }
    return true
  }, [projects, removeProjectById, t])

  const restoreProject = useCallback((projectId) => {
    restoreProjectToRecent(projectId)
    return true
  }, [restoreProjectToRecent])

  return {
    projects,
    recentProjects: recentResults,
    archivedProjects: archivedResults,
    archivedProjectCount: archivedProjects.length,
    query,
    setQuery,
    archiveExpanded,
    archiveVisible,
    toggleArchiveExpanded,
    expandedProjectIds: effectiveExpandedProjectIds,
    threadStateByProject,
    visibleCountByProject,
    showProjectsLoading,
    searchLoading,
    error,
    toggleProjectExpanded,
    revealAllThreads,
    retryProjectThreads,
    renameProjectThread,
    deleteProjectThread,
    threadActionErrorByKey,
    clearThreadActionError: setThreadActionError,
    archiveProject,
    removeProject,
    restoreProject,
  }
}
