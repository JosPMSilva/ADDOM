import electron from 'electron'
import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import path from 'path'
import {
  disposeWorkspaceScope,
  getWorkspaceDisposalImpact,
  settleWorkspaceScope,
} from './workspace-disposal-handler.mjs'
import {
  registerProject,
  listProjects,
  setActiveProject,
  listThreads,
  createThread,
  autoTitleThread,
  setActiveThread,
  acknowledgeThreadActivity,
  renameThread,
  listTimeline,
  exportThread,
  importThread,
  deleteThread,
  removeProject,
} from '../workspace/workspace-store.mjs'

const { ipcMain } = electron

function normalizeAbsolutePath(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return path.resolve(raw)
}

function sameAbsolutePath(a = '', b = '') {
  const left = normalizeAbsolutePath(a)
  const right = normalizeAbsolutePath(b)
  if (!left || !right) return false
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

export function registerWorkspaceHandlers({
  ipcMainImpl = ipcMain,
  onActiveProjectPathChanged = null,
  onThreadDisposed = null,
  onWorkspaceReset = null,
  runRegistry = null,
  sendVersionedImpl = sendVersioned,
} = {}) {
  let activeProjectPath = ''
  const notifyWorkspaceActivation = (sender, action = '', result = null) => {
    if (!sender || typeof sendVersionedImpl !== 'function') return
    const safeResult = result && typeof result === 'object' ? result : null
    sendVersionedImpl(sender, 'workspace:active-project-changed', {
      action: String(action || '').trim(),
      project: safeResult?.project || null,
      activeThread: safeResult?.activeThread || safeResult?.thread || null,
    })
  }
  const notifyActiveProjectPathChanged = (nextPath = '') => {
    const normalized = normalizeAbsolutePath(nextPath)
    activeProjectPath = normalized
    if (typeof onActiveProjectPathChanged !== 'function') return
    try {
      onActiveProjectPathChanged(normalized)
    } catch {
      // Non-fatal.
    }
  }

  handleVersioned(ipcMainImpl, 'workspace:list-projects', () => {
    return listProjects()
  })

  handleVersioned(ipcMainImpl, 'workspace:open-project', (event, { path: projectPath, notifyRenderer = true } = {}) => {
    if (!projectPath) throw new Error('path is required')
    const result = registerProject(projectPath)
    notifyActiveProjectPathChanged(result?.project?.path || '')
    if (notifyRenderer !== false) notifyWorkspaceActivation(event?.sender, 'open-project', result)
    return result
  })

  handleVersioned(ipcMainImpl, 'workspace:set-active-project', (event, { projectId, notifyRenderer = true } = {}) => {
    if (!projectId) throw new Error('projectId is required')
    const result = setActiveProject(projectId)
    notifyActiveProjectPathChanged(result?.project?.path || '')
    if (notifyRenderer !== false) notifyWorkspaceActivation(event?.sender, 'set-active-project', result)
    return result
  })

  handleVersioned(ipcMainImpl, 'workspace:clear-active-project', (event, { notifyRenderer = true } = {}) => {
    const result = { project: null, activeThread: null }
    notifyActiveProjectPathChanged('')
    if (notifyRenderer !== false) notifyWorkspaceActivation(event?.sender, 'clear-active-project', result)
    return result
  })

  handleVersioned(ipcMainImpl, 'workspace:list-threads', (_event, { projectId } = {}) => {
    if (!projectId) return []
    return listThreads(projectId)
  })

  handleVersioned(ipcMainImpl, 'workspace:create-thread', (event, { projectId, title, notifyRenderer = true } = {}) => {
    if (!projectId) throw new Error('projectId is required')
    const result = createThread(projectId, title)
    if (notifyRenderer !== false) notifyWorkspaceActivation(event?.sender, 'create-thread', result)
    return result
  })

  handleVersioned(ipcMainImpl, 'workspace:auto-title-thread', (_event, { projectId, threadId, prompt } = {}) => {
    if (!projectId || !threadId) throw new Error('projectId and threadId are required')
    return autoTitleThread(projectId, threadId, prompt)
  })

  handleVersioned(ipcMainImpl, 'workspace:set-active-thread', (event, { projectId, threadId, notifyRenderer = true } = {}) => {
    if (!projectId || !threadId) throw new Error('projectId and threadId are required')
    const result = setActiveThread(projectId, threadId)
    if (notifyRenderer !== false) notifyWorkspaceActivation(event?.sender, 'set-active-thread', result)
    return result
  })

  handleVersioned(ipcMainImpl, 'workspace:acknowledge-thread-activity', (_event, { threadId, acknowledgedAt } = {}) => {
    if (!threadId) throw new Error('threadId is required')
    return acknowledgeThreadActivity(threadId, acknowledgedAt)
  })

  handleVersioned(ipcMainImpl, 'workspace:rename-thread', (_event, { projectId, threadId, title } = {}) => {
    if (!projectId || !threadId) throw new Error('projectId and threadId are required')
    return renameThread(projectId, threadId, title)
  })

  handleVersioned(ipcMainImpl, 'workspace:list-timeline', (_event, { threadId, limit, afterEventId } = {}) => {
    if (!threadId) return []
    return listTimeline(threadId, { limit, afterEventId })
  })

  handleVersioned(ipcMainImpl, 'workspace:export-thread', async (_event, { threadId, options } = {}) => {
    if (!threadId) throw new Error('threadId is required')
    return await exportThread(threadId, options || {})
  })

  handleVersioned(ipcMainImpl, 'workspace:import-thread', async (_event, { projectId, payload } = {}) => {
    if (!projectId) throw new Error('projectId is required')
    return await importThread(projectId, payload || {})
  })

  handleVersioned(ipcMainImpl, 'workspace:get-disposal-impact', (_event, payload = {}) => {
    return getWorkspaceDisposalImpact({ runRegistry, ...payload })
  })

  handleVersioned(ipcMainImpl, 'workspace:stop-active-work', async (_event, payload = {}) => {
    return await settleWorkspaceScope({ runRegistry, ...payload })
  })

  handleVersioned(ipcMainImpl, 'workspace:delete-thread', async (_event, { threadId, stopActive } = {}) => {
    if (!threadId) throw new Error('threadId is required')
    const result = await disposeWorkspaceScope({
      runRegistry,
      scope: 'thread',
      threadId,
      stopActive,
      mutate: () => deleteThread(threadId),
    })
    if (!result?.ok) return result
    if (typeof onThreadDisposed === 'function') {
      try {
        await onThreadDisposed({
          scope: 'thread',
          action: 'delete-thread',
          threadId: String(threadId || '').trim(),
          projectId: String(result?.projectId || '').trim(),
          result,
        })
      } catch {
        // Non-fatal.
      }
    }
    return result
  })

  handleVersioned(ipcMainImpl, 'workspace:remove-project', async (_event, { projectId, stopActive } = {}) => {
    if (!projectId) throw new Error('projectId is required')
    const result = await disposeWorkspaceScope({
      runRegistry,
      scope: 'project',
      projectId,
      stopActive,
      mutate: () => removeProject(projectId),
    })
    if (!result?.ok) return result
    const deletedPath = String(result?.deletedProjectPath || '').trim()
    if (deletedPath && sameAbsolutePath(deletedPath, activeProjectPath)) {
      notifyActiveProjectPathChanged('')
    }
    if (typeof onWorkspaceReset === 'function') {
      try {
        await onWorkspaceReset({
          scope: 'project',
          action: 'remove-project',
          projectId: String(projectId || '').trim(),
          projectPath: deletedPath,
          result,
        })
      } catch {
        // Non-fatal.
      }
    }
    return result
  })
}
