import { hasSemanticRoutingHints, resolveRoleForTask } from './role-fit-scoring.mjs'
import { resolveMoaRoleKey } from '../../common/moa/moa-role-keys.mjs'
import { AGENT_POLICY_HARD_CEILINGS } from '../../common/agents/agent-policy-profile.mjs'

export const DEFAULT_MOA_POLICY = Object.freeze({
  maxTasksPerDelegation: 6,
  maxAgentRounds: 8,
  maxConsecutiveIdenticalToolRounds: 3,
  maxConsecutiveNearDuplicateExplorationRounds: 4,
  maxLoopRecoveryAttempts: 1,
  maxDelegationDurationMs: 600_000,
  agentStreamIdleTimeoutMs: 30_000,
  localAgentStreamIdleTimeoutMs: 180_000,
  maxTotalTokensPerDelegation: 120_000,
  maxAgentOutputChars: 100_000,
  requireConfiguredApiKey: true,
  agentWriteAccessEnabled: false,
  agentWriteMode: 'staged',
  maxAgentStagedFilesPerTask: 4,
  maxAgentStagedFilesPerDelegation: 12,
  maxAgentStagedBytesPerFile: 1_048_576,
  maxAgentStagedTotalBytesPerDelegation: 2_097_152,
  promptEnhancementEnabled: true,
  agentMemoryEnabled: true,
})

function clampInteger(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function cleanString(value) {
  return String(value ?? '').trim()
}

function normalizeConstraints(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanString(entry)).filter(Boolean).slice(0, 12)
  }
  const single = cleanString(value)
  return single ? [single] : []
}

export function normalizeMoaPolicy(raw = {}, fallback = DEFAULT_MOA_POLICY) {
  const base = fallback && typeof fallback === 'object'
    ? { ...DEFAULT_MOA_POLICY, ...fallback }
    : { ...DEFAULT_MOA_POLICY }
  const input = raw && typeof raw === 'object' ? raw : {}
  const requestedWriteMode = cleanString(input.agentWriteMode).toLowerCase()
  const agentWriteMode = requestedWriteMode === 'staged' ? 'staged' : 'staged'
  const maxAgentStagedBytesPerFile = clampInteger(
    input.maxAgentStagedBytesPerFile,
    base.maxAgentStagedBytesPerFile,
    1_024,
    5_242_880,
  )
  const maxAgentStagedTotalBytesPerDelegation = clampInteger(
    input.maxAgentStagedTotalBytesPerDelegation,
    base.maxAgentStagedTotalBytesPerDelegation,
    4_096,
    20_971_520,
  )

  return {
    maxTasksPerDelegation: clampInteger(
      input.maxTasksPerDelegation,
      base.maxTasksPerDelegation,
      1,
      AGENT_POLICY_HARD_CEILINGS.maxDescendants,
    ),
    maxAgentRounds: clampInteger(input.maxAgentRounds, base.maxAgentRounds, 1, 20),
    maxConsecutiveIdenticalToolRounds: clampInteger(
      input.maxConsecutiveIdenticalToolRounds,
      base.maxConsecutiveIdenticalToolRounds,
      2,
      12,
    ),
    maxConsecutiveNearDuplicateExplorationRounds: clampInteger(
      input.maxConsecutiveNearDuplicateExplorationRounds,
      base.maxConsecutiveNearDuplicateExplorationRounds,
      2,
      12,
    ),
    maxLoopRecoveryAttempts: clampInteger(
      input.maxLoopRecoveryAttempts,
      base.maxLoopRecoveryAttempts,
      0,
      3,
    ),
    maxDelegationDurationMs: clampInteger(input.maxDelegationDurationMs, base.maxDelegationDurationMs, 10_000, 600_000),
    agentStreamIdleTimeoutMs: clampInteger(input.agentStreamIdleTimeoutMs, base.agentStreamIdleTimeoutMs, 5_000, 300_000),
    localAgentStreamIdleTimeoutMs: clampInteger(
      input.localAgentStreamIdleTimeoutMs,
      base.localAgentStreamIdleTimeoutMs,
      5_000,
      300_000,
    ),
    maxTotalTokensPerDelegation: clampInteger(input.maxTotalTokensPerDelegation, base.maxTotalTokensPerDelegation, 1_000, 2_000_000),
    maxAgentOutputChars: clampInteger(input.maxAgentOutputChars, base.maxAgentOutputChars, 500, 500_000),
    requireConfiguredApiKey: input.requireConfiguredApiKey !== false,
    agentWriteAccessEnabled: !!input.agentWriteAccessEnabled,
    agentWriteMode,
    maxAgentStagedFilesPerTask: clampInteger(input.maxAgentStagedFilesPerTask, base.maxAgentStagedFilesPerTask, 1, 20),
    maxAgentStagedFilesPerDelegation: clampInteger(input.maxAgentStagedFilesPerDelegation, base.maxAgentStagedFilesPerDelegation, 1, 100),
    maxAgentStagedBytesPerFile,
    maxAgentStagedTotalBytesPerDelegation: Math.max(maxAgentStagedBytesPerFile, maxAgentStagedTotalBytesPerDelegation),
    promptEnhancementEnabled: input.promptEnhancementEnabled !== false,
    agentMemoryEnabled: input.agentMemoryEnabled !== false,
  }
}

export function isLocalProvider(providerId) {
  const id = cleanString(providerId).toLowerCase()
  return id === 'ollama' || id === 'lmstudio'
}

export function toTaskId(value, index = 0) {
  const existing = cleanString(value)
  if (existing) return existing
  return `task_${index + 1}`
}

export function normalizeDelegationTask(task, index = 0) {
  const row = task && typeof task === 'object' ? task : {}
  return {
    task_id: toTaskId(row.task_id, index),
    agent_role_key: cleanString(row.agent_role_key || row.agentRoleKey),
    agent_role_id: cleanString(row.agent_role_id || row.agentRoleId),
    agent_role: cleanString(row.agent_role || row.agentRole),
    specialty: cleanString(row.specialty),
    task_type: cleanString(row.task_type || row.taskType),
    role_routing_mode: cleanString(row.role_routing_mode || row.roleRoutingMode).toLowerCase() === 'best_available'
      ? 'best_available'
      : '',
    goal: cleanString(row.goal),
    constraints: normalizeConstraints(row.constraints),
    instruction: cleanString(row.instruction),
    injected_context: String(row.injected_context ?? ''),
    expected_output_format: cleanString(row.expected_output_format),
    outputContractType: cleanString(
      row.outputContractType
      || row.output_contract_type
      || row.contractType
      || row.contract_type,
    ),
    outputPresentation: cleanString(
      row.outputPresentation
      || row.output_presentation,
    ).toLowerCase() === 'natural'
      ? 'natural'
      : 'structured',
  }
}

export function normalizeDelegationTasks(rawTasks = []) {
  if (!Array.isArray(rawTasks)) return []
  return rawTasks.map((task, idx) => normalizeDelegationTask(task, idx))
}

export function resolveRoleByIdentity(task, moaRoles = []) {
  const roles = Array.isArray(moaRoles) ? moaRoles : []
  const roleKey = cleanString(task?.agent_role_key || task?.agentRoleKey).toLowerCase()
  if (roleKey) {
    const byKey = roles.find((role) => resolveMoaRoleKey(role) === roleKey)
    if (byKey) return byKey
  }

  const roleId = cleanString(task?.agent_role_id || task?.agentRoleId).toLowerCase()
  if (roleId) {
    const byId = roles.find((role) => cleanString(role?.id).toLowerCase() === roleId)
    if (byId) return byId
  }

  const roleName = cleanString(task?.agent_role || task?.agentRole).toLowerCase()
  if (roleName) {
    const byName = roles.find((role) => cleanString(role?.name).toLowerCase() === roleName)
    if (byName) return byName
  }

  return null
}

function hasExplicitRolePin(task = {}) {
  return !!(
    cleanString(task?.agent_role_key || task?.agentRoleKey)
    || cleanString(task?.agent_role_id || task?.agentRoleId)
    || cleanString(task?.agent_role || task?.agentRole)
  )
}

export function resolveDelegationRole(task, moaRoles = []) {
  const explicitRole = resolveRoleByIdentity(task, moaRoles)
  if (explicitRole) {
    return {
      role: explicitRole,
      strategy: 'explicit',
      confidence: 'high',
      score: 100,
      margin: 100,
      matchedTerms: [],
      candidates: [{
        roleId: cleanString(explicitRole.id),
        roleName: cleanString(explicitRole.name),
        score: 100,
        confidence: 'high',
        matchedTerms: [],
      }],
    }
  }
  const explicitPinPresent = hasExplicitRolePin(task)
  if (explicitPinPresent) {
    return {
      role: null,
      strategy: 'invalid_explicit_pin',
      confidence: 'low',
      score: 0,
      margin: 0,
      matchedTerms: [],
      candidates: [],
    }
  }

  const hasSemanticHints = hasSemanticRoutingHints(task)
  const useBestAvailableRole = cleanString(task?.role_routing_mode || task?.roleRoutingMode).toLowerCase() === 'best_available'
  const semanticResolution = hasSemanticHints
    ? resolveRoleForTask(task, moaRoles, useBestAvailableRole
      ? { minScore: 0, minMargin: 0 }
      : undefined)
    : null
  if (semanticResolution?.role) {
    return semanticResolution
  }
  if (!hasSemanticHints) {
    return {
      role: null,
      strategy: 'unresolved',
      confidence: 'low',
      score: 0,
      margin: 0,
      matchedTerms: [],
      candidates: [],
    }
  }
  return semanticResolution
}

export function preflightDelegation(tasks, moaRoles, getApiKey, policyInput = DEFAULT_MOA_POLICY, getCredentialReadiness = null) {
  const policy = normalizeMoaPolicy(policyInput)
  const normalizedTasks = normalizeDelegationTasks(tasks)
  const errors = []
  const configuredRoles = Array.isArray(moaRoles) ? moaRoles : []
  const readinessByRuntime = new Map()
  const resolveRoleReadiness = (role = {}) => {
    const providerId = cleanString(role.providerId)
    const model = cleanString(role.model)
    const readinessKey = `${providerId.toLowerCase()}\u0000${model.toLowerCase()}`
    if (readinessByRuntime.has(readinessKey)) {
      return readinessByRuntime.get(readinessKey)
    }
    const readiness = typeof getCredentialReadiness === 'function'
      ? getCredentialReadiness(providerId, {
        requireConfiguredApiKey: policy.requireConfiguredApiKey,
        getApiKey,
        model,
        role,
      })
      : (
        !policy.requireConfiguredApiKey || isLocalProvider(providerId) || cleanString(typeof getApiKey === 'function' ? getApiKey(providerId) : '')
          ? {
            ready: true,
            authMethod: isLocalProvider(providerId) ? 'local' : 'api_key',
            code: '',
            message: '',
            blockedReason: '',
            canonicalErrorClass: '',
          }
          : {
            ready: false,
            authMethod: 'api_key',
            code: 'missing_api_key',
            message: `No API key configured for provider "${providerId}".`,
            blockedReason: 'missing_api_key',
            canonicalErrorClass: '',
          }
      )
    readinessByRuntime.set(readinessKey, readiness)
    return readiness
  }

  if (normalizedTasks.length === 0) {
    errors.push({
      code: 'no_tasks',
      message: 'No tasks were provided for delegation.',
      taskId: '',
    })
  }

  if (normalizedTasks.length > policy.maxTasksPerDelegation) {
    errors.push({
      code: 'max_tasks_exceeded',
      message: `Delegation requested ${normalizedTasks.length} tasks but policy allows at most ${policy.maxTasksPerDelegation}.`,
      taskId: '',
    })
  }

  for (const task of normalizedTasks) {
    if (!task.instruction) {
      errors.push({
        code: 'missing_instruction',
        message: `Task "${task.task_id}" is missing "instruction".`,
        taskId: task.task_id,
      })
    }
    if (!String(task.injected_context ?? '').trim()) {
      errors.push({
        code: 'missing_context',
        message: `Task "${task.task_id}" is missing "injected_context".`,
        taskId: task.task_id,
      })
    }
    if (!task.expected_output_format) {
      errors.push({
        code: 'missing_output_format',
        message: `Task "${task.task_id}" is missing "expected_output_format".`,
        taskId: task.task_id,
      })
    }

    let candidateRoles = configuredRoles
    if (!hasExplicitRolePin(task)) {
      const readyRoles = configuredRoles.filter((role) => resolveRoleReadiness(role).ready)
      if (readyRoles.length > 0) candidateRoles = readyRoles
    }
    const roleResolution = resolveDelegationRole(task, candidateRoles)
    const role = roleResolution.role
    if (!role) {
      const hasSemanticHints = hasSemanticRoutingHints(task)
      errors.push({
        code: 'role_not_found',
        message: task.agent_role_key
          ? `Role key "${task.agent_role_key}" is not configured in Settings > Subagents.`
          : task.agent_role_id
          ? `Role id "${task.agent_role_id}" is not configured in Settings > Subagents.`
          : task.agent_role
            ? `Role "${task.agent_role}" is not configured in Settings > Subagents.`
            : hasSemanticHints
              ? 'No configured MoA agent role strongly matched the provided semantic routing hints.'
              : 'Delegation task is missing both explicit role identity and semantic routing hints.',
        taskId: task.task_id,
        agentRoleKey: task.agent_role_key,
        agentRoleId: task.agent_role_id,
        agentRole: task.agent_role,
        specialty: task.specialty,
        taskType: task.task_type,
        roleCandidates: roleResolution.candidates,
      })
      continue
    }
    task.agent_role_key = resolveMoaRoleKey(role)
    if (!task.agent_role_id) task.agent_role_id = cleanString(role.id)
    task.agent_role = cleanString(role.name)
    task.role_resolution_strategy = cleanString(roleResolution.strategy)
    task.role_fit_confidence = cleanString(roleResolution.confidence)
    task.role_fit_score = Number(roleResolution.score || 0)
    task.role_fit_margin = Number(roleResolution.margin || 0)
    task.role_fit_terms = Array.isArray(roleResolution.matchedTerms) ? roleResolution.matchedTerms : []

    const providerId = cleanString(role.providerId)
    const credentialReadiness = resolveRoleReadiness(role)
    if (!credentialReadiness.ready) {
      errors.push({
        code: credentialReadiness.code || 'provider_not_ready',
        message: `Task "${task.task_id}" targets role "${cleanString(role.name)}" (${providerId}) but cannot run: ${credentialReadiness.message || 'provider credentials are not ready.'}`,
        taskId: task.task_id,
        agentRoleId: cleanString(role.id),
        agentRole: cleanString(role.name),
        providerId,
        authMethod: credentialReadiness.authMethod,
        blockedReason: credentialReadiness.blockedReason,
        canonicalErrorClass: credentialReadiness.canonicalErrorClass || '',
      })
    }
  }

  return {
    ok: errors.length === 0,
    policy,
    tasks: normalizedTasks,
    errors,
  }
}
