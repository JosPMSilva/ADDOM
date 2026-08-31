const ACTIVE_WORK_REQUIRES_STOP = 'active_work_requires_stop'
const ACTIVE_WORK_SETTLEMENT_TIMEOUT = 'active_work_settlement_timeout'

function normalizeId(value) {
  return String(value ?? '').trim()
}

export function resolveWorkspaceDisposalFilter({
  scope = '',
  projectId = '',
  threadId = '',
} = {}) {
  const normalizedScope = normalizeId(scope).toLowerCase()
  if (normalizedScope === 'thread') {
    const id = normalizeId(threadId)
    if (!id) throw new Error('threadId is required')
    return { threadId: id }
  }
  if (normalizedScope === 'project') {
    const id = normalizeId(projectId)
    if (!id) throw new Error('projectId is required')
    return { projectId: id }
  }
  if (normalizedScope === 'workspace') return {}
  throw new Error('scope must be thread, project, or workspace')
}

export function getWorkspaceDisposalImpact({
  runRegistry,
  scope,
  projectId,
  threadId,
} = {}) {
  const filter = resolveWorkspaceDisposalFilter({ scope, projectId, threadId })
  const activeRuns = typeof runRegistry?.list === 'function'
    ? runRegistry.list(filter)
    : []
  return {
    ok: true,
    requiresStop: activeRuns.length > 0,
    activeRuns,
  }
}

export async function disposeWorkspaceScope({
  runRegistry,
  scope,
  projectId,
  threadId,
  stopActive = false,
  mutate,
} = {}) {
  if (typeof mutate !== 'function') throw new Error('mutate is required')
  const settlement = await settleWorkspaceScope({
    runRegistry,
    scope,
    projectId,
    threadId,
    stopActive,
  })
  if (!settlement?.ok) return settlement
  return await mutate()
}

export async function settleWorkspaceScope({
  runRegistry,
  scope,
  projectId,
  threadId,
  stopActive = false,
} = {}) {
  const filter = resolveWorkspaceDisposalFilter({ scope, projectId, threadId })
  const activeRuns = typeof runRegistry?.list === 'function'
    ? runRegistry.list(filter)
    : []
  if (activeRuns.length > 0 && stopActive !== true) {
    return { ok: false, error: ACTIVE_WORK_REQUIRES_STOP, activeRuns }
  }
  if (activeRuns.length > 0) {
    const settlement = await runRegistry.cancelAndWait(filter, {
      reason: 'Stopped before changing workspace availability.',
    })
    if (!settlement?.ok) {
      return {
        ok: false,
        error: ACTIVE_WORK_SETTLEMENT_TIMEOUT,
        activeRuns: Array.isArray(settlement?.runs) ? settlement.runs : activeRuns,
      }
    }
  }
  return { ok: true, activeRuns }
}
