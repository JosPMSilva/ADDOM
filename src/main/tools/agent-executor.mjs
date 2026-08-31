/**
 * agent-executor.mjs
 *
 * MoA agent delegation orchestration.
 */

import crypto from 'node:crypto'
import {
  DEFAULT_MOA_POLICY,
  normalizeMoaPolicy,
  resolveRoleByIdentity,
  preflightDelegation,
} from '../moa/moa-policy.mjs'
import { resolveProviderCredentialReadiness } from '../moa/provider-credential-readiness.mjs'
import { resolveMoaRoleKey } from '../../common/moa/moa-role-keys.mjs'
import { createUsage, normalizeUsage, addUsage } from '../moa/usage-math.mjs'
import {
  formatDelegationText,
  applyDelegationEnvelopeTexts,
  buildDelegationErrorEnvelope,
  summarizeResults,
} from '../moa/delegation-summary.mjs'
import { parseAgentOutputContract } from '../moa/agent-output-contract.mjs'
import { resolveOpenAIExecutionAuth } from '../openai-account/openai-execution-auth.mjs'
import {
  getManagedAgentRuntime,
  resolveManagedAgentProjectId,
} from '../agents/managed-agent-runtime-singleton.mjs'
import { normalizeAgentSettings } from '../../common/agents/agent-settings.mjs'
import {
  buildOrchestratorSynthesis,
  extractRootChildContinuations,
} from '../agents/agent-orchestrator-synthesis.mjs'

export { formatDelegationText, applyDelegationEnvelopeTexts, buildDelegationErrorEnvelope, shouldUseSequentialPattern, buildRuntimeHandoff }

function cleanString(value) {
  return String(value ?? '').trim()
}

function taskAllowsAgentWrites(task = {}) {
  const constraints = Array.isArray(task?.constraints)
    ? task.constraints.map((entry) => cleanString(entry).toLowerCase())
    : []
  if (constraints.includes('read_only')) return false
  return true
}

function shouldUseSequentialPattern(pattern = '') {
  const normalized = cleanString(pattern).toLowerCase()
  return normalized === 'sequential_pipeline' || normalized === 'review_gate'
}

const MAX_RUNTIME_HANDOFF_STEPS = 3
const MAX_RUNTIME_HANDOFF_ITEMS = 4
const MAX_RUNTIME_HANDOFF_SUMMARY_CHARS = 600
const MAX_RUNTIME_HANDOFF_RAW_PREVIEW_CHARS = 500

function clipText(value, maxChars) {
  return cleanString(value).slice(0, Math.max(0, Number(maxChars || 0)))
}

function summarizeRuntimeHandoffContract(parsed = {}) {
  return {
    findings: Array.isArray(parsed?.findings)
      ? parsed.findings.slice(0, MAX_RUNTIME_HANDOFF_ITEMS).map((row) => ({
          severity: cleanString(row?.severity),
          file: clipText(row?.file, 200),
          issue: clipText(row?.issue, 320),
          suggestion: clipText(row?.suggestion, 320),
        }))
      : [],
    recommendations: Array.isArray(parsed?.recommendations)
      ? parsed.recommendations.slice(0, MAX_RUNTIME_HANDOFF_ITEMS).map((row) => ({
          priority: cleanString(row?.priority),
          title: clipText(row?.title, 240),
          file: clipText(row?.file, 200),
          rationale: clipText(row?.rationale, 320),
        }))
      : [],
    stagedChanges: Array.isArray(parsed?.stagedChanges)
      ? parsed.stagedChanges.slice(0, MAX_RUNTIME_HANDOFF_ITEMS).map((row) => ({
          filePath: clipText(row?.filePath, 260),
          changeType: cleanString(row?.changeType),
          rationale: clipText(row?.rationale, 320),
        }))
      : [],
    scorecard: Array.isArray(parsed?.scorecard)
      ? parsed.scorecard.slice(0, MAX_RUNTIME_HANDOFF_ITEMS).map((row) => ({
          label: clipText(row?.label, 200),
          score: Number.isFinite(Number(row?.score)) ? Number(row.score) : 0,
          rationale: clipText(row?.rationale, 320),
        }))
      : [],
  }
}

function buildRuntimeHandoff(pattern = '', priorAgents = []) {
  const completedAgents = (Array.isArray(priorAgents) ? priorAgents : [])
    .filter((agent) => cleanString(agent?.status).toLowerCase() === 'completed')
    .slice(-MAX_RUNTIME_HANDOFF_STEPS)
    .map((agent) => {
      const parsed = parseAgentOutputContract(agent?.output, {
        type: agent?.outputContractType,
      })
      const contract = summarizeRuntimeHandoffContract(parsed)
      return {
        taskId: cleanString(agent?.taskId),
        roleId: cleanString(agent?.roleId),
        role: cleanString(agent?.role),
        status: cleanString(agent?.status || 'completed'),
        outputContractType: cleanString(parsed?.contractType || agent?.outputContractType || 'findings'),
        parsedOk: parsed?.parsedOk === true,
        summary: clipText(parsed?.summary || agent?.output, MAX_RUNTIME_HANDOFF_SUMMARY_CHARS),
        findings: contract.findings,
        recommendations: contract.recommendations,
        stagedChanges: contract.stagedChanges,
        scorecard: contract.scorecard,
        rawPreview: parsed?.parsedOk ? '' : clipText(agent?.output, MAX_RUNTIME_HANDOFF_RAW_PREVIEW_CHARS),
      }
    })
    .filter((agent) => (
      agent.taskId
      || agent.role
      || agent.summary
      || agent.findings.length > 0
      || agent.recommendations.length > 0
      || agent.stagedChanges.length > 0
      || agent.scorecard.length > 0
      || agent.rawPreview
    ))

  if (completedAgents.length === 0) return ''
  return JSON.stringify({
    version: 1,
    pattern: cleanString(pattern),
    previousSteps: completedAgents,
  }, null, 2)
}

function buildSkippedSequentialAgent(task, role) {
  return {
    taskId: cleanString(task?.task_id),
    roleKey: resolveMoaRoleKey(role),
    roleId: cleanString(role?.id || task?.agent_role_id),
    role: cleanString(role?.name || task?.agent_role || '(unknown)'),
    providerId: cleanString(role?.providerId),
    model: cleanString(role?.model),
    status: 'aborted',
    error: 'Skipped: upstream sequential step did not complete successfully.',
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

/**
 * Execute a delegation: run tasks in parallel across agent roles.
 *
 * @param {Array} tasks
 * @param {Array} moaRoles
 * @param {Function} vaultGetKey
 * @param {string} projectFolder
 * @param {Function} send
 * @param {AbortSignal} abortSignal
 * @param {object} context
 * @returns {Promise<object>} delegation envelope
 */
export async function executeDelegation(tasks, moaRoles, vaultGetKey, projectFolder, send, abortSignal, context = {}) {
  const threadId = String(context.threadId || '')
  const turnId = String(context.turnId || '')
  const stepId = String(context.stepId || '')
  const initiator = String(context.initiator || 'orchestrator')
  const route = String(context.route || 'delegate_to_agents')
  const dispatchId = String(context.dispatchId || context.delegationId || '')
  const initiatorTurnId = String(context.initiatorTurnId || turnId || '')
  const initiatorMessageId = String(context.initiatorMessageId || initiatorTurnId || '')
  const riskTier = String(context.riskTier || '')
  const strategy = String(context.strategy || '')
  const pattern = String(context.pattern || '')
  const estimatedTokens = Number(context.estimatedTokens || 0) || 0
  const estimatedUsd = Number.isFinite(Number(context.estimatedUsd)) ? Number(context.estimatedUsd) : null
  const costDecision = String(context.costDecision || '')
  const policy = normalizeMoaPolicy(context.policy || DEFAULT_MOA_POLICY)
  const suppressLifecycleEvents = context?.suppressLifecycleEvents === true
  const resolveProviderApiKey = (providerId = '') => {
    if (cleanString(providerId).toLowerCase() === 'openai') {
      const openAIAuth = resolveOpenAIExecutionAuth()
      if (openAIAuth?.authMethod === 'account') return ''
    }
    return typeof vaultGetKey === 'function'
      ? String(vaultGetKey(providerId) || '')
      : ''
  }
  const preflight = preflightDelegation(
    tasks,
    moaRoles,
    resolveProviderApiKey,
    policy,
    (providerId, options = {}) => resolveProviderCredentialReadiness(providerId, {
      ...options,
      allowOpenAIAccountRuntime: true,
    }),
  )

  const delegationId = String(context.delegationId || `del_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`)
  const emit = (channel, payload = {}) => {
    if (typeof send !== 'function') return
    send(channel, {
      threadId,
      turnId,
      stepId,
      delegationId,
      initiator,
      route,
      dispatchId,
      initiatorTurnId,
      initiatorMessageId,
      ...payload,
    })
  }

  if (!preflight.ok) {
    return buildDelegationErrorEnvelope({
      delegationId,
      threadId,
      turnId,
      stepId,
      initiator,
      route,
      dispatchId,
      initiatorTurnId,
      initiatorMessageId,
      policy,
      tasks: preflight.tasks,
      pattern,
      errors: preflight.errors,
      status: 'preflight_failed',
    })
  }

  const preparedTasks = preflight.tasks
  const startedAt = Date.now()
  const delegationDeadlineAt = policy.maxDelegationDurationMs > 0
    ? startedAt + policy.maxDelegationDurationMs
    : 0
  const usageState = {
    totalTokens: 0,
    limit: Number(policy.maxTotalTokensPerDelegation || 0),
  }
  const stagedState = {
    totalFiles: 0,
    totalBytes: 0,
    byTask: new Map(),
  }
  const stagedChanges = []
  const delegationState = {
    stopReason: '',
  }

  const delegationController = new AbortController()
  const abortDelegation = (reason = 'aborted') => {
    if (delegationController.signal.aborted) return
    delegationState.stopReason = String(reason || 'aborted')
    delegationController.abort()
  }

  if (abortSignal?.aborted) {
    abortDelegation('aborted')
  } else if (abortSignal?.addEventListener) {
    abortSignal.addEventListener('abort', () => abortDelegation('aborted'), { once: true })
  }

  const agentSummary = preparedTasks.map((task) => {
    const role = resolveRoleByIdentity(task, moaRoles)
    return {
      taskId: String(task.task_id || ''),
      roleKey: role ? resolveMoaRoleKey(role) : String(task.agent_role_key || ''),
      role: role ? String(role.name || '') : String(task.agent_role || ''),
      roleId: role ? String(role.id || '') : String(task.agent_role_id || ''),
      providerId: role ? String(role.providerId || '') : '',
      model: role ? String(role.model || '') : '',
      outputContractType: cleanString(task?.outputContractType),
      routingStrategy: cleanString(task?.role_resolution_strategy),
      roleFitConfidence: cleanString(task?.role_fit_confidence),
      roleFitScore: Number(task?.role_fit_score || 0),
      roleFitMargin: Number(task?.role_fit_margin || 0),
      roleFitTerms: Array.isArray(task?.role_fit_terms) ? task.role_fit_terms : [],
      canWriteFiles: !!(
        policy.agentWriteAccessEnabled
        && policy.agentWriteMode === 'staged'
        && role?.canWriteFiles
        && taskAllowsAgentWrites(task)
      ),
    }
  })

  if (!suppressLifecycleEvents) {
    emit('moa:delegation-start', {
      taskCount: preparedTasks.length,
      agentSummary,
      policy,
      startedAt,
      status: 'running',
    })
  }

  let timeoutHandle = null
  if (policy.maxDelegationDurationMs > 0) {
    timeoutHandle = setTimeout(() => {
      abortDelegation('timeout')
    }, policy.maxDelegationDurationMs)
  }

  const buildUnexpectedAgentFailure = (task, errorLike) => {
    const role = resolveRoleByIdentity(task, moaRoles)
    const startedAt = Date.now()
    const finishedAt = startedAt
    const status = delegationState.stopReason === 'timeout'
      ? 'timeout'
      : delegationState.stopReason === 'stale'
        ? 'stale'
      : delegationState.stopReason === 'budget_exceeded'
        ? 'budget_exceeded'
        : 'failed'
    const payload = {
      taskId: String(task?.task_id || ''),
      roleKey: resolveMoaRoleKey(role),
      roleId: String(role?.id || task?.agent_role_id || ''),
      role: String(role?.name || task?.agent_role || '(unknown)'),
      providerId: String(role?.providerId || ''),
      model: String(role?.model || ''),
      outputContractType: cleanString(task?.outputContractType),
      routingStrategy: cleanString(task?.role_resolution_strategy),
      roleFitConfidence: cleanString(task?.role_fit_confidence),
      roleFitScore: Number(task?.role_fit_score || 0),
      roleFitMargin: Number(task?.role_fit_margin || 0),
      roleFitTerms: Array.isArray(task?.role_fit_terms) ? task.role_fit_terms : [],
      status,
      error: String(errorLike?.message || 'Unknown agent failure'),
      output: null,
      usage: createUsage(),
      tokenUsage: createUsage(),
      rounds: 0,
      truncated: false,
      stagedChanges: [],
      startedAt,
      finishedAt,
      durationMs: 0,
      attempted: true,
    }
    emit('moa:agent-error', {
      taskId: payload.taskId,
      agentRole: payload.role,
      agentRoleId: payload.roleId,
      providerId: payload.providerId,
      model: payload.model,
      agentCanWriteFiles: !!(
        policy.agentWriteAccessEnabled
        && policy.agentWriteMode === 'staged'
        && role?.canWriteFiles
        && taskAllowsAgentWrites(task)
      ),
      status: payload.status,
      error: payload.error,
      startedAt,
      finishedAt,
      durationMs: 0,
    })
    return payload
  }

  const agents = []
  const managedTasks = []
  const managedTaskIndexes = []
  for (const [index, task] of preparedTasks.entries()) {
    try {
      const role = resolveRoleByIdentity(task, moaRoles)
      if (!role) throw new TypeError(`Role "${task.agent_role || task.agent_role_id || ''}" is not configured`)
      const providerId = String(role.providerId || '')
      const apiKey = resolveProviderApiKey(providerId)
      const credentialReadiness = resolveProviderCredentialReadiness(providerId, {
        requireConfiguredApiKey: policy.requireConfiguredApiKey,
        getApiKey: resolveProviderApiKey,
        allowOpenAIAccountRuntime: true,
      })
      if (!credentialReadiness.ready) {
        throw new TypeError(
          credentialReadiness.message || `Provider "${providerId}" is not ready.`,
        )
      }
      const openAIExecutionAuthSnapshot = providerId.trim().toLowerCase() === 'openai'
        ? {
            ok: true,
            authMethod: credentialReadiness.authMethod,
            apiKey: String(credentialReadiness.apiKey || apiKey || ''),
            blockedReason: '',
            blockedMessage: '',
          }
        : null
      managedTaskIndexes.push(index)
      managedTasks.push({
        task,
        role: taskAllowsAgentWrites(task) ? role : { ...role, canWriteFiles: false },
        apiKey,
        projectFolder,
        agentRuntime: {
          policy,
          usageState,
          stagedState,
          stagedChanges,
          getStopReason: () => delegationState.stopReason,
          abortDelegation,
          delegationId,
          threadId,
          turnId,
          stepId,
          getApiKey: resolveProviderApiKey,
          providerRuntimeSettings: context.providerRuntimeSettings,
          agentWriteAccessRequested: taskAllowsAgentWrites(task),
          delegationDeadlineAt,
          emitLegacy: emit,
          ...(openAIExecutionAuthSnapshot ? { openAIExecutionAuthSnapshot } : {}),
        },
      })
    } catch (error) {
      agents[index] = buildUnexpectedAgentFailure(task, error)
    }
  }
  let agentRunId = ''
  let childSynthesis = null
  if (managedTasks.length > 0) {
    try {
      const managedRuntime = context.managedAgentRuntime || getManagedAgentRuntime()
      const agentSettings = normalizeAgentSettings(context.agentSettings)
      const graphResult = await managedRuntime.executeTaskGraph({
        projectId: context.managedAgentRuntime
          ? String(context.projectId || 'project_01')
          : resolveManagedAgentProjectId({ projectId: context.projectId, threadId }),
        threadId: threadId || 'thread_01',
        turnId: turnId || delegationId,
        policyProfileId: agentSettings.defaultProfile,
        policySettings: agentSettings,
        rootTaskSummary: `Delegation ${delegationId}`,
        tasks: managedTasks,
        sequential: shouldUseSequentialPattern(pattern),
        prepareSequentialInput: ({ input, priorResults }) => {
          const runtimeHandoff = buildRuntimeHandoff(
            pattern,
            priorResults.map((result) => result?.providerResult?.legacyResult).filter(Boolean),
          )
          return runtimeHandoff
            ? { ...input, task: { ...input.task, runtime_handoff: runtimeHandoff } }
            : input
        },
        abortSignal: delegationController.signal,
        childRouteResolver: async ({
          providerId,
          modelId,
          role: roleLabel,
          parentRole,
        }) => {
          const routedRole = moaRoles.find((candidate) => (
            ((providerId || modelId)
              && (!providerId || candidate.providerId === providerId)
              && (!modelId || candidate.model === modelId))
            || candidate.id === roleLabel
            || candidate.name === roleLabel
          )) || ((!providerId && !modelId) ? parentRole : null)
          if (!routedRole) {
            throw new TypeError(`No configured agent role matches ${roleLabel || `${providerId}/${modelId}`}`)
          }
          const resolvedRole = roleLabel
            ? { ...routedRole, name: roleLabel }
            : { ...routedRole }
          if (parentRole?.canWriteFiles === false) resolvedRole.canWriteFiles = false
          return {
            role: resolvedRole,
            apiKey: resolveProviderApiKey(resolvedRole.providerId),
            projectFolder,
            agentRuntime: {
              policy,
              usageState,
              stagedState,
              stagedChanges,
              getStopReason: () => delegationState.stopReason,
              abortDelegation,
              delegationId,
              threadId,
              turnId,
              stepId,
              getApiKey: resolveProviderApiKey,
              providerRuntimeSettings: context.providerRuntimeSettings,
              agentWriteAccessRequested: parentRole?.canWriteFiles !== false,
              delegationDeadlineAt,
              emitLegacy: emit,
            },
          }
        },
      })
      agentRunId = graphResult.runId
      const childContinuations = extractRootChildContinuations(
        managedRuntime.repository?.getRunGraph?.(agentRunId),
      )
      if (childContinuations.length > 0) {
        childSynthesis = buildOrchestratorSynthesis({
          continuations: childContinuations,
          orchestratorIntent: cleanString(context.orchestratorIntent) || 'follow_original_request',
        })
      }
      for (const [resultIndex, result] of graphResult.results.entries()) {
        const taskIndex = managedTaskIndexes[resultIndex]
        const legacy = result.providerResult?.legacyResult
        const task = preparedTasks[taskIndex]
        agents[taskIndex] = legacy
          ? {
              ...legacy,
              managedAttemptCount: Number(result.attemptCount || 1),
              managedRetryExhausted: (
                Number(result.attemptCount || 1) > 1
                && result.node?.status === 'failed'
              ),
            }
          : (
              shouldUseSequentialPattern(pattern) && result.node?.status === 'cancelled'
                ? buildSkippedSequentialAgent(task, resolveRoleByIdentity(task, moaRoles))
                : buildUnexpectedAgentFailure(
                    task,
                    new Error(result.node?.errorSummary || 'Managed agent returned no result'),
                  )
            )
      }
    } catch (error) {
      for (const taskIndex of managedTaskIndexes) {
        if (!agents[taskIndex]) {
          agents[taskIndex] = buildUnexpectedAgentFailure(preparedTasks[taskIndex], error)
        }
      }
    }
  }
  if (timeoutHandle) clearTimeout(timeoutHandle)

  const allStagedChanges = agents.flatMap((agent) => (
    Array.isArray(agent?.stagedChanges) ? agent.stagedChanges : []
  ))

  const totalUsage = agents.reduce((acc, agent) => {
    addUsage(acc, normalizeUsage(agent?.usage))
    return acc
  }, createUsage())

  const summary = summarizeResults(agents)
  const finishedAt = Date.now()
  const durationMs = Math.max(0, finishedAt - startedAt)

  let status = 'completed'
  if (delegationState.stopReason === 'timeout') status = 'timeout'
  else if (delegationState.stopReason === 'stale') status = 'stale'
  else if (delegationState.stopReason === 'budget_exceeded') status = 'budget_exceeded'
  else if (agents.some((agent) => String(agent.status || '') !== 'completed')) status = 'completed_with_errors'

  const envelope = {
    delegationId,
    agentRunId,
    threadId,
    turnId,
    stepId,
    status,
    initiator,
    route,
    dispatchId,
    initiatorTurnId,
    initiatorMessageId,
    taskCount: preparedTasks.length,
    startedAt,
    finishedAt,
    durationMs,
    policy,
    usage: totalUsage,
    riskTier,
    strategy,
    pattern,
    estimatedTokens,
    actualTokens: Number(totalUsage.totalTokens || 0),
    estimatedUsd,
    actualUsd: null,
    costDecision,
    summary,
    agents,
    ...(childSynthesis ? { childSynthesis } : {}),
    stagedSummary: {
      count: allStagedChanges.length,
      totalBytes: Number(stagedState.totalBytes || 0),
    },
    stagedChanges: allStagedChanges,
    errors: [],
  }
  applyDelegationEnvelopeTexts(envelope)

  if (!suppressLifecycleEvents) {
    emit('moa:delegation-done', {
      status,
      taskCount: envelope.taskCount,
      summary,
      usage: totalUsage,
      riskTier,
      strategy,
      pattern,
      estimatedTokens,
      actualTokens: Number(totalUsage.totalTokens || 0),
      estimatedUsd,
      actualUsd: null,
      costDecision,
      results: agents,
      startedAt,
      finishedAt,
      durationMs,
      policy,
      stagedSummary: {
        count: allStagedChanges.length,
        totalBytes: Number(stagedState.totalBytes || 0),
      },
      stagedChanges: allStagedChanges.slice(0, 200),
    })
  }

  return envelope
}
