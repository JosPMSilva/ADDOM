function normalizeId(value) {
  return String(value ?? '').trim()
}

export function resolveWorkspaceTargetIntent({
  activeProjectId,
  projectId,
  threadId,
  createThread = false,
} = {}) {
  const destinationProjectId = normalizeId(projectId)
  if (!destinationProjectId) return null

  return {
    kind: normalizeId(activeProjectId) === destinationProjectId ? 'thread' : 'project_thread',
    projectId: destinationProjectId,
    threadId: createThread === true ? '' : normalizeId(threadId),
    createThread: createThread === true,
  }
}

export function captureWorkspaceTargetRoute(workspaceState = {}, appState = {}) {
  return {
    workspace: {
      threads: Array.isArray(workspaceState.threads) ? workspaceState.threads : [],
      activeProjectId: workspaceState.activeProjectId || null,
      activeThreadId: workspaceState.activeThreadId || null,
      preferredProjectId: workspaceState.preferredProjectId || null,
      restoreWorkspaceViewMode: workspaceState.restoreWorkspaceViewMode || 'project-entry',
    },
    app: {
      projectFolder: appState.projectFolder || null,
      activeProjectId: appState.activeProjectId || null,
      activeThreadId: appState.activeThreadId || null,
      workspaceViewMode: appState.workspaceViewMode || 'project-entry',
      activePanel: appState.activePanel || 'chat',
    },
  }
}
