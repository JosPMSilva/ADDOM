import {
  applyDelegationEnvelopeTexts,
  summarizeResults,
} from '../moa/delegation-summary.mjs'
import {
  formatMoaRoleLabel,
  summarizeMoaRoleLabels,
} from '../../common/moa/moa-display-formatters.mjs'
import { resolveMoaRoleKey } from '../../common/moa/moa-role-keys.mjs'
import { normalizeMoaPolicy, resolveRoleByIdentity } from '../moa/moa-policy.mjs'
import { addUsage, createUsage, normalizeUsage } from '../moa/usage-math.mjs'
import {
  buildMoaTaskSignature,
  getMoaRetryRecord,
  isMoaTaskTerminalForTurn,
  isMoaTerminalAgentStatus,
} from './moa-retry-state.mjs'

function normalizeText(value) {
  return String(value ?? '').trim()
}

export function buildTaskDescriptor(task = {}, moaRoles = []) {
  const role = resolveRoleByIdentity(task, moaRoles)
  return {
    task,
    taskId: normalizeText(task?.task_id),
    role,
    roleKey: normalizeText(resolveMoaRoleKey(role) || task?.agent_role_key),
    roleId: normalizeText(role?.id || task?.agent_role_id),
    roleName: normalizeText(role?.name || task?.agent_role),
    providerId: normalizeText(role?.providerId),
    model: normalizeText(role?.model),
    signature: buildMoaTaskSignature(task, moaRoles),
  }
}

export function buildAgentSummary(descriptors = [], policy = {}) {
  return descriptors.map((descriptor) => ({
    taskId: descriptor.taskId,
    roleKey: descriptor.roleKey,
    role: descriptor.roleName,
    roleId: descriptor.roleId,
    providerId: descriptor.providerId,
    model: descriptor.model,
    canWriteFiles: !!(
      policy.agentWriteAccessEnabled
      && policy.agentWriteMode === 'staged'
      && descriptor.role?.canWriteFiles
    ),
  }))
}

export function buildDelegationInput(rawTasks = [], moaRoles = []) {
  const tasks = Array.isArray(rawTasks) ? rawTasks : []
  const roleEntries = tasks.map((task) => {
    const descriptor = buildTaskDescriptor(task, moaRoles)
    return {
      role: descriptor.roleName,
      roleId: descriptor.roleId,
    }
  })
  const roleNames = [...new Set(
    roleEntries
      .map((entry) => formatMoaRoleLabel({ ...entry, fallback: '' }))
      .filter(Boolean),
  )]
  return {
    taskCount: tasks.length,
    instructionCount: tasks.filter((task) => String(task?.instruction || '').trim()).length,
    contextCount: tasks.filter((task) => String(task?.injected_context || '').trim()).length,
    roles: roleNames.slice(0, 20),
    roleSummary: summarizeMoaRoleLabels(roleEntries, { maxVisible: 3 }),
  }
}

export function findDescriptorForAgent(agent = {}, descriptors = []) {
  const taskId = normalizeText(agent?.taskId)
  if (taskId) {
    const byTaskId = descriptors.find((descriptor) => descriptor.taskId === taskId)
    if (byTaskId) return byTaskId
  }
  const roleId = normalizeText(agent?.roleId)
  if (roleId) {
    const byRoleId = descriptors.find((descriptor) => descriptor.roleId === roleId)
    if (byRoleId) return byRoleId
  }
  const role = normalizeText(agent?.role).toLowerCase()
  if (role) {
    return descriptors.find((descriptor) => descriptor.roleName.toLowerCase() === role) || null
  }
  return null
}

export function mergeUsageTotals(...values) {
  return values.reduce((acc, value) => {
    addUsage(acc, normalizeUsage(value))
    return acc
  }, createUsage())
}

export function dedupeStagedChanges(rows = []) {
  const next = []
  const seen = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    const revisionId = normalizeText(row?.revisionId)
    const filePath = normalizeText(row?.filePath)
    const key = `${revisionId}:${filePath}`
    if (!revisionId || !filePath || seen.has(key)) continue
    seen.add(key)
    next.push(row)
  }
  return next
}

function buildSkippedAgentResult(descriptor, retryState) {
  const record = getMoaRetryRecord(retryState, descriptor.signature)
  const status = normalizeText(record.lastStatus || 'failed') || 'failed'
  const skippedReason = Number(record.attempts || 0) > 0
    ? 'Skipped: retry budget exhausted for this task in the current turn.'
    : isMoaTerminalAgentStatus(status)
      ? 'Skipped: this task already failed with a terminal provider/configuration error in the current turn.'
      : 'Skipped: this task is terminal for the current turn.'
  const error = record.lastError
    ? `${skippedReason}\n\nLast failure: ${record.lastError}`
    : skippedReason
  return {
    taskId: descriptor.taskId,
    roleKey: descriptor.roleKey,
    roleId: descriptor.roleId,
    role: descriptor.roleName || '(unknown)',
    providerId: descriptor.providerId,
    model: descriptor.model,
    status,
    error,
    output: null,
    usage: createUsage(),
    tokenUsage: createUsage(),
    rounds: 0,
    truncated: false,
    stagedChanges: [],
    startedAt: 0,
    finishedAt: Date.now(),
    durationMs: 0,
    attempted: false,
  }
}

export function mergeRetryResults(primaryAgents = [], retryAgents = []) {
  const next = Array.isArray(primaryAgents) ? [...primaryAgents] : []
  for (const retryAgent of Array.isArray(retryAgents) ? retryAgents : []) {
    const taskId = normalizeText(retryAgent?.taskId)
    const roleId = normalizeText(retryAgent?.roleId)
    const idx = next.findIndex((agent) => {
      if (taskId && normalizeText(agent?.taskId) === taskId) return true
      if (roleId && normalizeText(agent?.roleId) === roleId) return true
      return false
    })
    if (idx >= 0) next[idx] = retryAgent
    else next.push(retryAgent)
  }
  return next
}

function buildRetryExhaustedInfo(descriptors = [], retryState) {
  return descriptors.map((descriptor) => {
    const record = getMoaRetryRecord(retryState, descriptor.signature)
    return {
      taskId: descriptor.taskId,
      roleKey: descriptor.roleKey,
      roleId: descriptor.roleId,
      role: descriptor.roleName,
      providerId: descriptor.providerId,
      model: descriptor.model,
      status: normalizeText(record.lastStatus || 'failed') || 'failed',
      error: normalizeText(record.lastError),
      attempts: Number(record.attempts || 0),
      terminalForTurn: record.terminalForTurn === true,
    }
  })
}

export function finalizeBoundedDelegationEnvelope({
  delegationEnvelope,
  requestedTaskCount = 0,
  plannedTaskCount = 0,
  admittedTaskCount = 0,
  executedTaskCount = 0,
  limitedTaskCount = 0,
  requestedDescriptors = [],
  skippedDescriptors = [],
  retryState = null,
  stepStartedAt = 0,
  costDecision = 'proceed_planned',
  fanoutDecision = 'launch_all',
  plannerPacket = null,
  policy = null,
} = {}) {
  const executedAgents = Array.isArray(delegationEnvelope?.agents) ? delegationEnvelope.agents : []
  const skippedAgents = skippedDescriptors.map((descriptor) => buildSkippedAgentResult(descriptor, retryState))
  const agents = mergeRetryResults(executedAgents, skippedAgents)
  const sourceStatus = normalizeText(delegationEnvelope?.status).toLowerCase()
  const usage = normalizeUsage(delegationEnvelope?.usage)
  const summary = summarizeResults(agents)
  const finishedAt = Date.now()
  const completed = Number(summary.completed || 0)
  const totalTasks = requestedDescriptors.length > 0 ? requestedDescriptors.length : agents.length
  const allAgentsFailed = totalTasks > 0 && completed === 0
  const partialSuccess = completed > 0 && completed < totalTasks
  const retryExhaustedTasks = buildRetryExhaustedInfo(
    requestedDescriptors.filter((descriptor) => isMoaTaskTerminalForTurn(retryState, descriptor.signature)),
    retryState,
  )
  const skippedRetryExhaustedTasks = buildRetryExhaustedInfo(skippedDescriptors, retryState)
  const stagedChanges = dedupeStagedChanges([
    ...(Array.isArray(delegationEnvelope?.stagedChanges) ? delegationEnvelope.stagedChanges : []),
    ...agents.flatMap((agent) => (Array.isArray(agent?.stagedChanges) ? agent.stagedChanges : [])),
  ])
  const status = sourceStatus === 'timeout'
    || sourceStatus === 'stale'
    || sourceStatus === 'budget_exceeded'
    || sourceStatus === 'cancelled'
    || sourceStatus === 'preflight_failed'
    ? sourceStatus
    : agents.length > 0 && agents.every((agent) => normalizeText(agent?.status).toLowerCase() === 'completed')
      ? 'completed'
      : 'completed_with_errors'

  const envelope = {
    ...(delegationEnvelope && typeof delegationEnvelope === 'object' ? delegationEnvelope : {}),
    status,
    taskCount: totalTasks,
    finishedAt,
    durationMs: Math.max(0, finishedAt - Number(stepStartedAt || delegationEnvelope?.startedAt || finishedAt)),
    usage,
    summary,
    agents,
    stagedSummary: {
      count: stagedChanges.length,
      totalBytes: stagedChanges.reduce((sum, row) => sum + Number(row?.bytes || 0), 0),
    },
    stagedChanges,
    retryAttempted: !!delegationEnvelope?.retryAttempted,
    retryAttemptCount: Number(delegationEnvelope?.retryAttemptCount || 0),
    requestedTaskCount: Number(requestedTaskCount || 0),
    plannedTaskCount: Number(plannedTaskCount || totalTasks),
    admittedTaskCount: Number(admittedTaskCount || totalTasks),
    executedTaskCount: Number(executedTaskCount || executedAgents.length),
    skippedTaskCount: skippedDescriptors.length,
    limitedTaskCount: Number(limitedTaskCount || 0),
    retryExhaustedTasks,
    skippedRetryExhaustedTasks,
    allAgentsFailed,
    partialSuccess,
    pattern: String(plannerPacket?.pattern || delegationEnvelope?.pattern || ''),
    estimatedTokens: Number(plannerPacket?.estimatedTokens || delegationEnvelope?.estimatedTokens || 0),
    estimatedUsd: Number.isFinite(Number(plannerPacket?.estimatedUsd ?? delegationEnvelope?.estimatedUsd))
      ? Number(plannerPacket?.estimatedUsd ?? delegationEnvelope?.estimatedUsd)
      : null,
    costDecision,
    fanoutDecision,
    policy: normalizeMoaPolicy(policy || delegationEnvelope?.policy || {}),
  }
  applyDelegationEnvelopeTexts(envelope)
  return envelope
}

export function buildDelegationPlannedPayload({
  delegationId = '',
  rawTasks = [],
  plannerPacket = null,
  plannedTasks = [],
} = {}) {
  return {
    delegationId,
    requestedTaskCount: Array.isArray(rawTasks) ? rawTasks.length : 0,
    riskTier: String(plannerPacket?.riskTier || 'medium'),
    strategy: String(plannerPacket?.strategy || 'balanced'),
    pattern: String(plannerPacket?.pattern || 'parallel_independent'),
    plannedTaskCount: Array.isArray(plannedTasks) ? plannedTasks.length : 0,
    estimatedTokens: Number(plannerPacket?.estimatedTokens || 0),
    estimatedUsd: Number.isFinite(Number(plannerPacket?.estimatedUsd)) ? Number(plannerPacket.estimatedUsd) : null,
    usdAvailable: !!plannerPacket?.usdAvailable,
    estimateConfidence: String(plannerPacket?.estimateConfidence || 'token_only'),
    pricingWarning: String(plannerPacket?.pricingWarning || ''),
    leanTaskCount: Number(plannerPacket?.leanAlternative?.plannedTasks?.length || 0),
    leanEstimatedTokens: Number(plannerPacket?.leanAlternative?.estimatedTokens || 0),
    leanEstimatedUsd: Number.isFinite(Number(plannerPacket?.leanAlternative?.estimatedUsd))
      ? Number(plannerPacket.leanAlternative.estimatedUsd)
      : null,
    plannedVsLeanTokenDelta: Math.max(
      0,
      Number(plannerPacket?.estimatedTokens || 0) - Number(plannerPacket?.leanAlternative?.estimatedTokens || 0),
    ),
    plannedVsLeanUsdDelta: (
      Number.isFinite(Number(plannerPacket?.estimatedUsd))
      && Number.isFinite(Number(plannerPacket?.leanAlternative?.estimatedUsd))
    )
      ? Math.max(0, Number(plannerPacket.estimatedUsd) - Number(plannerPacket.leanAlternative.estimatedUsd))
      : null,
    rationale: Array.isArray(plannerPacket?.rationale) ? plannerPacket.rationale : [],
  }
}

export function buildDelegationCancelledPayload({
  delegationEnvelope = null,
  rawTasks = [],
  plannerPacket = null,
  stepStartedAt = 0,
  fanoutDecision = '',
} = {}) {
  return {
    delegationId: delegationEnvelope?.delegationId,
    status: 'cancelled',
    taskCount: delegationEnvelope?.taskCount,
    requestedTaskCount: Number(delegationEnvelope?.requestedTaskCount || (Array.isArray(rawTasks) ? rawTasks.length : 0) || 0),
    plannedTaskCount: Number(delegationEnvelope?.plannedTaskCount || delegationEnvelope?.taskCount || 0),
    admittedTaskCount: Number(delegationEnvelope?.admittedTaskCount || 0),
    executedTaskCount: Number(delegationEnvelope?.executedTaskCount || 0),
    skippedTaskCount: Number(delegationEnvelope?.skippedTaskCount || 0),
    limitedTaskCount: Number(delegationEnvelope?.limitedTaskCount || 0),
    summary: delegationEnvelope?.summary,
    usage: delegationEnvelope?.usage,
    riskTier: String(plannerPacket?.riskTier || ''),
    strategy: String(plannerPacket?.strategy || ''),
    pattern: String(plannerPacket?.pattern || ''),
    estimatedTokens: Number(plannerPacket?.estimatedTokens || 0),
    actualTokens: 0,
    estimatedUsd: Number.isFinite(Number(plannerPacket?.estimatedUsd))
      ? Number(plannerPacket.estimatedUsd)
      : null,
    actualUsd: null,
    fanoutDecision,
    results: delegationEnvelope?.agents,
    startedAt: stepStartedAt,
    finishedAt: Date.now(),
    durationMs: Math.max(0, Date.now() - stepStartedAt),
    policy: delegationEnvelope?.policy,
    stagedSummary: delegationEnvelope?.stagedSummary || { count: 0, totalBytes: 0 },
    stagedChanges: [],
    errors: delegationEnvelope?.errors,
  }
}
