import { applyDelegationEnvelopeTexts, summarizeResults } from '../moa/delegation-summary.mjs'
import { normalizeMoaPolicy } from '../moa/moa-policy.mjs'
import { createUsage } from '../moa/usage-math.mjs'

const STRICT_SELECTION_MODES = new Set(['all_configured_roles', 'user_named_roles'])

function clean(value) {
  return String(value ?? '').trim()
}

function ensureDispatchCounts(state = null) {
  const target = state && typeof state === 'object' ? state : {}
  if (!(target.roleDispatchCounts instanceof Map)) target.roleDispatchCounts = new Map()
  return target.roleDispatchCounts
}

function countRoleKeys(roleKeys = []) {
  const counts = new Map()
  for (const value of Array.isArray(roleKeys) ? roleKeys : []) {
    const roleKey = clean(value)
    if (roleKey) counts.set(roleKey, Number(counts.get(roleKey) || 0) + 1)
  }
  return counts
}

export function planTurnSelectionContract(state = null, delegationRequest = null) {
  const tasks = Array.isArray(delegationRequest?.tasks) ? delegationRequest.tasks : []
  const mode = clean(delegationRequest?.selection?.mode)
  const requestedRoleKeys = Array.isArray(delegationRequest?.selection?.selected_role_keys)
    ? delegationRequest.selection.selected_role_keys.map(clean).filter(Boolean)
    : []
  if (!delegationRequest?.ok || !STRICT_SELECTION_MODES.has(mode) || requestedRoleKeys.length === 0) {
    return { tasks, mode, requestedRoleKeys, strict: false, alreadyFulfilled: false }
  }

  const desiredCounts = countRoleKeys(requestedRoleKeys)
  const dispatchedCounts = ensureDispatchCounts(state)
  const admittedCounts = new Map()
  const pendingTasks = tasks.filter((task) => {
    const roleKey = clean(task?.agent_role_key)
    const desired = Number(desiredCounts.get(roleKey) || 0)
    const dispatched = Number(dispatchedCounts.get(roleKey) || 0)
    const admitted = Number(admittedCounts.get(roleKey) || 0)
    if (!roleKey || dispatched + admitted >= desired) return false
    admittedCounts.set(roleKey, admitted + 1)
    return true
  })
  return {
    tasks: pendingTasks,
    mode,
    requestedRoleKeys,
    strict: true,
    alreadyFulfilled: tasks.length > 0 && pendingTasks.length === 0,
  }
}

export function noteTurnSelectionDispatched(state = null, tasks = [], selectionPlan = null) {
  if (selectionPlan?.strict !== true) return
  const counts = ensureDispatchCounts(state)
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const roleKey = clean(task?.agent_role_key)
    if (roleKey) counts.set(roleKey, Number(counts.get(roleKey) || 0) + 1)
  }
}

export function buildAlreadyFulfilledSelectionEnvelope({
  delegationId = '',
  threadId = '',
  turnId = '',
  stepId = '',
  stepStartedAt = 0,
  policy = null,
  dispatchMeta = {},
} = {}) {
  const finishedAt = Date.now()
  const envelope = {
    delegationId,
    threadId,
    turnId,
    stepId,
    ...dispatchMeta,
    status: 'already_fulfilled',
    selectionContractStatus: 'already_fulfilled',
    taskCount: 0,
    requestedTaskCount: 0,
    plannedTaskCount: 0,
    admittedTaskCount: 0,
    executedTaskCount: 0,
    skippedTaskCount: 0,
    limitedTaskCount: 0,
    startedAt: stepStartedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - Number(stepStartedAt || finishedAt)),
    usage: createUsage(),
    summary: summarizeResults([]),
    agents: [],
    errors: [],
    stagedChanges: [],
    stagedSummary: { count: 0, totalBytes: 0 },
    policy: normalizeMoaPolicy(policy || {}),
  }
  applyDelegationEnvelopeTexts(envelope)
  return envelope
}
