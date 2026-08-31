function normalizeId(value) {
  return String(value ?? '').trim()
}

function defaultConfirmLabel(action) {
  if (action === 'archive-project') return 'Archive'
  if (action === 'delete-thread') return 'Delete'
  if (action === 'remove-project') return 'Remove'
  return 'Clear'
}

function stopConfirmLabel(action) {
  if (action === 'archive-project') return 'Stop and archive'
  if (action === 'delete-thread') return 'Stop and delete'
  if (action === 'remove-project') return 'Stop and remove'
  return 'Stop and clear'
}

function stopMessage(action) {
  if (action === 'archive-project') return 'Active work in this project will stop before it is archived.'
  if (action === 'delete-thread') return 'Active work in this thread will stop before deletion.'
  return 'Active work must stop before this data can be removed.'
}

export function resolveWorkspaceDisposalIntent({
  action = '',
  scope = '',
  projectId = '',
  threadId = '',
  activeRuns = [],
} = {}) {
  const normalizedAction = normalizeId(action).toLowerCase()
  const requiresStop = Array.isArray(activeRuns) && activeRuns.length > 0
  return {
    action: normalizedAction,
    scope: normalizeId(scope).toLowerCase(),
    projectId: normalizeId(projectId),
    threadId: normalizeId(threadId),
    stopActive: requiresStop,
    requiresStop,
    confirmLabel: requiresStop
      ? stopConfirmLabel(normalizedAction)
      : defaultConfirmLabel(normalizedAction),
    message: requiresStop
      ? stopMessage(normalizedAction)
      : '',
  }
}

export async function prepareWorkspaceDisposalIntent({
  workspaceApi,
  action,
  scope,
  projectId = '',
  threadId = '',
} = {}) {
  if (typeof workspaceApi?.getDisposalImpact !== 'function') {
    throw new Error('Workspace disposal preflight is unavailable.')
  }
  const target = {
    scope: normalizeId(scope).toLowerCase(),
    projectId: normalizeId(projectId),
    threadId: normalizeId(threadId),
  }
  const impact = await workspaceApi.getDisposalImpact(target)
  return resolveWorkspaceDisposalIntent({
    action,
    ...target,
    activeRuns: impact?.activeRuns,
  })
}
