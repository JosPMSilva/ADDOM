import crypto from 'node:crypto'
import {
  buildDelegationErrorEnvelope,
  summarizeResults,
} from '../moa/delegation-summary.mjs'
import { normalizeMoaPolicy, preflightDelegation } from '../moa/moa-policy.mjs'
import { createUsage } from '../moa/usage-math.mjs'
import { trimText } from './tool-event-mapper.mjs'
import { createMoaEventEmitter } from './moa-event-persistence.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'
import { planDelegation } from '../moa/delegation-planner.mjs'
import { buildProjectSignals, buildRecentMoaStats } from '../moa/delegation-signals.mjs'
import {
  applyFanoutDecision,
  evaluateFanoutConfirmation,
  FANOUT_CONFIRMATION_DECISIONS,
} from './fanout-confirmation.mjs'
import { handleDelegationPreflightFailure } from '../moa/delegation-preflight-failure.mjs'
import { emitDelegationToolResult } from '../moa/delegation-tool-result.mjs'
import { resolveEffectivePricingProfiles } from '../moa/moa-budget-policy.mjs'
import { finalizeDelegationForSynthesis } from './moa-synthesis-finalizer.mjs'
import {
  buildMoaDelegationPreflightRepairPrompt,
  evaluateDelegationPreflightRepairability,
} from './moa-preflight-repair-prompt.mjs'
import { buildMoaDelegationPreflightTelemetry } from './moa-preflight-telemetry.mjs'
import {
  createMoaRetryState,
  getMoaRetryRecord,
  isMoaTaskTerminalForTurn,
  isMoaTerminalAgentStatus,
  noteMoaTaskRetryScheduled,
  noteMoaTaskSuccess,
  noteMoaTaskTerminalFailure,
  shouldRetryMoaTask,
} from './moa-retry-state.mjs'
import {
  buildAgentSummary,
  buildDelegationInput,
  buildDelegationCancelledPayload,
  buildDelegationPlannedPayload,
  buildTaskDescriptor,
  dedupeStagedChanges,
  finalizeBoundedDelegationEnvelope,
  findDescriptorForAgent,
  mergeRetryResults,
  mergeUsageTotals,
} from './moa-tool-flow-support.mjs'
import { loadExecuteDelegation, normalizeText } from './moa-tool-flow-runtime.mjs'
import { enhanceAllTasks } from '../moa/prompt-enhancer.mjs'
import { resolveProviderAgentReadiness } from '../moa/provider-credential-readiness.mjs'
import { buildAgentCatalogSnapshot } from '../moa/agent-catalog-service.mjs'
import { resolveDelegationRequest } from '../moa/delegation-request-resolver.mjs'
import { resolveDelegationRequestText } from './delegation-turn-intent.mjs'
import {
  mergePartialDelegationPreflight,
  prepareRunnableDelegationPreflight,
} from '../moa/partial-delegation-preflight.mjs'
import {
  buildAlreadyFulfilledSelectionEnvelope,
  noteTurnSelectionDispatched,
  planTurnSelectionContract,
} from './moa-turn-selection-contract.mjs'

export async function runDelegationToolCall({
  tc,
  toolInput,
  stepId,
  stepSequence,
  stepStartedAt,
  activeThreadId,
  activeTurnId,
  activeAssistantMessageId = '',
  projectFolder,
  loop,
  moaRoles,
  moaPolicy,
  moaBudgetPolicy,
  agentSettings = null,
  getApiKey,
  getCachedCapabilities = null,
  requestFanoutConfirmation,
  history,
  turnToolResults,
  send,
  persistTimelineEvent,
  providerRuntimeSettings = null,
  moaRetryState = null,
  allowPreflightRepairRetry = false,
  orchestratorProviderId = '',
  orchestratorModel = '',
  orchestratorIntent = '',
  delegationSelectionIntent = '',
  isPreflightRepairRetryAttempt = false,
  executeDelegationFn = null,
}) {
  const modelFacingToolName = normalizeText(tc?.visibleToolName || tc?.name) || 'delegate_to_agents'
  const delegationRetryState = moaRetryState && typeof moaRetryState === 'object'
    ? moaRetryState
    : createMoaRetryState()
  const effectivePolicy = normalizeMoaPolicy(moaPolicy)
  const userRequest = resolveDelegationRequestText('', { history })
  const delegationRequest = modelFacingToolName === 'delegate_tasks'
    ? resolveDelegationRequest(toolInput, {
        catalog: buildAgentCatalogSnapshot({
          moaRoles,
          moaPolicy: effectivePolicy,
          getApiKey,
          getCachedCapabilities,
          allowOpenAIAccountRuntime: true,
        }),
        moaRoles,
        moaPolicy: effectivePolicy,
        selectionIntent: delegationSelectionIntent,
        userRequest,
      })
    : null
  const selectionPlan = planTurnSelectionContract(delegationRetryState, delegationRequest)
  const rawTasks = delegationRequest
    ? (delegationRequest.ok ? selectionPlan.tasks : [])
    : (Array.isArray(toolInput.tasks) ? toolInput.tasks : [])
  const delegationInput = buildDelegationInput(rawTasks, moaRoles)

  const executingPayload = {
    threadId: activeThreadId,
    turnId: activeTurnId,
    stepId,
    sequence: stepSequence,
    startedAt: stepStartedAt,
    toolName: tc.name,
    toolInput: delegationInput,
  }
  commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind: 'tool_executing',
    options: {
      role: 'assistant',
      content: `Delegating ${delegationInput.taskCount} task(s) to agents.`,
      meta: executingPayload,
    },
    channel: 'chat:tool-executing', payload: executingPayload,
  })

  const emitMoaEvent = createMoaEventEmitter({
    send,
    persistTimelineEvent,
    activeThreadId,
    activeTurnId,
    stepId,
    stepSequence,
  })
  const delegationId = `del_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const delegationDispatchMeta = {
    initiator: 'orchestrator',
    route: 'delegate_to_agents',
    dispatchId: delegationId,
    initiatorTurnId: activeTurnId,
    initiatorMessageId: String(activeAssistantMessageId || '').trim(),
  }
  const emitDelegationMoaEvent = (channel, payload = {}) => emitMoaEvent(channel, {
    ...delegationDispatchMeta,
    ...payload,
  })

  if (selectionPlan.alreadyFulfilled) {
    const delegationEnvelope = buildAlreadyFulfilledSelectionEnvelope({
      delegationId,
      threadId: activeThreadId,
      turnId: activeTurnId,
      stepId,
      stepStartedAt,
      policy: moaPolicy,
      dispatchMeta: delegationDispatchMeta,
    })
    emitDelegationToolResult({
      tc, toolInput, delegationInput, delegationEnvelope,
      delegationIsError: false,
      activeThreadId, activeTurnId, stepId, stepSequence, stepStartedAt,
      history, turnToolResults, send, persistTimelineEvent, trimText,
    })
    return {
      handled: true,
      pendingSynthesisPrompt: 'The user-requested role selection contract was already dispatched in this turn. Do not call delegate_tasks again. Synthesize the existing agent results and report any failures.',
      pendingSynthesisMessages: null,
      preflightRepairTriggered: false,
      toolResult: delegationEnvelope.text,
      toolIsError: false,
    }
  }

  const rawPreflight = delegationRequest && !delegationRequest.ok
    ? {
        ok: false,
        tasks: [],
        errors: delegationRequest.errors,
        policy: effectivePolicy,
      }
    : preflightDelegation(
        rawTasks,
        moaRoles,
        getApiKey,
        effectivePolicy,
        (providerId, options = {}) => resolveProviderAgentReadiness(providerId, {
          ...options,
          allowOpenAIAccountRuntime: true,
          getCachedCapabilities,
        }),
      )
  const { preflight, partialPreflight } = prepareRunnableDelegationPreflight(rawPreflight)
  let delegationEnvelope = null
  let delegationIsError = false
  let plannerPacket = null
  let costDecision = 'proceed_planned'
  let fanoutDecision = FANOUT_CONFIRMATION_DECISIONS.launchAll
  let plannedTaskCount = 0
  let limitedTaskCount = 0
  let effectivePlannedTasks = Array.isArray(preflight?.tasks) ? preflight.tasks : []
  let preflightRepairPrompt = ''
  let preflightRepairTriggered = false
  try {
    if (!preflight.ok) {
      const repairability = evaluateDelegationPreflightRepairability(preflight)
      const willInjectRepairPrompt = !!(allowPreflightRepairRetry && repairability.repairable)
      emitDelegationMoaEvent('moa:delegation-preflight-telemetry', buildMoaDelegationPreflightTelemetry({
        providerId: orchestratorProviderId,
        model: orchestratorModel,
        rawTasks,
        preflight: partialPreflight ? rawPreflight : preflight,
        repairability,
        repairPromptInjected: willInjectRepairPrompt,
        isRepairRetryAttempt: !!isPreflightRepairRetryAttempt,
        delegationId,
      }))
      delegationEnvelope = handleDelegationPreflightFailure({
        preflight,
        delegationId,
        activeThreadId,
        activeTurnId,
        stepId,
        stepStartedAt,
        moaPolicy,
        emitMoaEvent: emitDelegationMoaEvent,
        buildDelegationErrorEnvelope,
      })
      if (delegationEnvelope && typeof delegationEnvelope === 'object') {
        Object.assign(delegationEnvelope, delegationDispatchMeta)
      }
      delegationIsError = true
      if (willInjectRepairPrompt) {
        preflightRepairPrompt = buildMoaDelegationPreflightRepairPrompt({
          preflight,
          allowRetry: true,
          toolName: modelFacingToolName,
        })
        preflightRepairTriggered = true
      }
    } else {
      emitDelegationMoaEvent('moa:delegation-preflight-telemetry', buildMoaDelegationPreflightTelemetry({
        providerId: orchestratorProviderId,
        model: orchestratorModel,
        rawTasks,
        preflight: partialPreflight ? rawPreflight : preflight,
        repairability: { repairable: false },
        repairPromptInjected: false,
        isRepairRetryAttempt: !!isPreflightRepairRetryAttempt,
        delegationId,
      }))
      const projectSignals = buildProjectSignals(preflight.tasks, projectFolder)
      const recentMoaStats = buildRecentMoaStats(turnToolResults)
      plannerPacket = planDelegation({
        tasks: preflight.tasks,
        roles: moaRoles,
        policy: moaPolicy,
        projectSignals,
        recentMoaStats,
        pricingProfiles: resolveEffectivePricingProfiles(
          Array.isArray(moaBudgetPolicy?.pricingProfiles) ? moaBudgetPolicy.pricingProfiles : [],
        ),
      })
      let plannedTasks = Array.isArray(plannerPacket?.plannedTasks) && plannerPacket.plannedTasks.length > 0
        ? plannerPacket.plannedTasks
        : preflight.tasks
      plannedTaskCount = plannedTasks.length
      effectivePlannedTasks = plannedTasks
      emitDelegationMoaEvent('moa:delegation-planned', buildDelegationPlannedPayload({
        delegationId,
        rawTasks,
        plannerPacket,
        plannedTasks,
      }))

      const fanoutGate = evaluateFanoutConfirmation({
        requestedCount: plannedTasks.length,
        threshold: agentSettings?.fanoutConfirmationThreshold,
      })
      if (fanoutGate.shouldConfirm) {
        const response = await requestFanoutConfirmation({
          delegationId,
          activeThreadId,
          activeTurnId,
          stepId,
          requestedCount: fanoutGate.requestedCount,
          threshold: fanoutGate.threshold,
        })
        const decidedPlan = applyFanoutDecision({
          decision: response?.decision,
          tasks: plannedTasks,
          threshold: fanoutGate.threshold,
        })
        fanoutDecision = decidedPlan.decision
        limitedTaskCount = decidedPlan.limitedTaskCount
        emitDelegationMoaEvent('moa:delegation-fanout-confirmed', {
          delegationId,
          decision: fanoutDecision,
          requestedTaskCount: rawTasks.length,
          plannedTaskCount,
          admittedTaskCount: decidedPlan.tasks.length,
          limitedTaskCount,
          threshold: fanoutGate.threshold,
        })
        if (decidedPlan.stopTurn) {
          delegationEnvelope = buildDelegationErrorEnvelope({
            delegationId,
            threadId: activeThreadId,
            turnId: activeTurnId,
            stepId,
            ...delegationDispatchMeta,
            policy: moaPolicy,
            tasks: [],
            pattern: String(plannerPacket?.pattern || ''),
            requestedTaskCount: rawTasks.length,
            plannedTaskCount,
            admittedTaskCount: 0,
            limitedTaskCount,
            fanoutDecision,
            executedTaskCount: 0,
            skippedTaskCount: 0,
            errors: [{
              code: 'fanout_confirmation_stopped_turn',
              message: 'The user stopped the turn at the agent fanout confirmation.',
              taskId: '',
            }],
            status: 'cancelled',
          })
          emitDelegationMoaEvent('moa:delegation-done', buildDelegationCancelledPayload({
            delegationEnvelope,
            rawTasks,
            plannerPacket,
            stepStartedAt,
            fanoutDecision,
          }))
          if (delegationEnvelope && typeof delegationEnvelope === 'object') {
            Object.assign(delegationEnvelope, delegationDispatchMeta)
          }
          delegationIsError = true
          plannedTasks = []
          effectivePlannedTasks = []
          loop.cancelled = true
          loop.cancelReason = 'Turn stopped by user at agent fanout confirmation.'
          loop.abortController?.abort?.()
        } else {
          plannedTasks = decidedPlan.tasks
          effectivePlannedTasks = plannedTasks
        }
      }

      plannedTasks = enhanceAllTasks(plannedTasks, {
        projectFolder,
        enabled: moaPolicy?.promptEnhancementEnabled === true,
        memoryEnabled: moaPolicy?.agentMemoryEnabled === true,
      })
      effectivePlannedTasks = plannedTasks

      if (!delegationEnvelope) {
        const executeDelegation = typeof executeDelegationFn === 'function'
          ? executeDelegationFn
          : await loadExecuteDelegation()
        const requestedDescriptors = plannedTasks.map((task) => buildTaskDescriptor(task, moaRoles))
        const executableDescriptors = []
        const skippedDescriptors = []
        for (const descriptor of requestedDescriptors) {
          if (isMoaTaskTerminalForTurn(delegationRetryState, descriptor.signature)) skippedDescriptors.push(descriptor)
          else executableDescriptors.push(descriptor)
        }

        for (const descriptor of skippedDescriptors) {
          const record = getMoaRetryRecord(delegationRetryState, descriptor.signature)
          const status = normalizeText(record.lastStatus || 'failed') || 'failed'
          const skipError = record.lastError || (
            Number(record.attempts || 0) > 0
              ? 'Skipped: retry budget exhausted for this task in the current turn.'
              : isMoaTerminalAgentStatus(status)
                ? 'Skipped: this task already failed with a terminal provider/configuration error in the current turn.'
                : 'Skipped: this task is terminal for the current turn.'
          )
          emitDelegationMoaEvent('moa:delegation-skip', {
            delegationId,
            taskId: descriptor.taskId,
            agentRole: descriptor.roleName,
            agentRoleId: descriptor.roleId,
            providerId: descriptor.providerId,
            model: descriptor.model,
            attempts: Number(record.attempts || 0),
            status,
            error: skipError,
          })
        }

        if (executableDescriptors.length > 0) {
          emitDelegationMoaEvent('moa:delegation-start', {
            delegationId,
            taskCount: requestedDescriptors.length,
            requestedTaskCount: rawTasks.length,
            plannedTaskCount,
            admittedTaskCount: requestedDescriptors.length,
            executedTaskCount: executableDescriptors.length,
            skippedTaskCount: skippedDescriptors.length,
            limitedTaskCount,
            agentSummary: buildAgentSummary(requestedDescriptors, moaPolicy),
            policy: normalizeMoaPolicy(moaPolicy || {}),
            startedAt: stepStartedAt,
            status: 'running',
          })

          const attemptContext = {
            delegationId,
            threadId: activeThreadId,
            turnId: activeTurnId,
            stepId,
            ...delegationDispatchMeta,
            sequence: stepSequence,
            policy: moaPolicy,
            riskTier: String(plannerPacket?.riskTier || ''),
            strategy: String(plannerPacket?.strategy || ''),
            pattern: String(plannerPacket?.pattern || ''),
            estimatedTokens: Number(plannerPacket?.estimatedTokens || 0),
            estimatedUsd: Number.isFinite(Number(plannerPacket?.estimatedUsd))
              ? Number(plannerPacket.estimatedUsd)
              : null,
            costDecision,
            fanoutDecision,
            providerRuntimeSettings,
            agentSettings,
            orchestratorIntent,
            suppressLifecycleEvents: true,
          }

          const initialEnvelope = await executeDelegation(
            executableDescriptors.map((descriptor) => descriptor.task),
            moaRoles,
            getApiKey,
            projectFolder,
            emitDelegationMoaEvent,
            loop.abortController.signal,
            attemptContext,
          )
          noteTurnSelectionDispatched(
            delegationRetryState,
            executableDescriptors.map((descriptor) => descriptor.task),
            selectionPlan,
          )

          let combinedEnvelope = {
            ...initialEnvelope,
            retryAttempted: false,
            retryAttemptCount: 0,
          }
          const retryDescriptors = []
          for (const agent of Array.isArray(initialEnvelope?.agents) ? initialEnvelope.agents : []) {
            const descriptor = findDescriptorForAgent(agent, executableDescriptors)
            if (!descriptor) continue
            const status = normalizeText(agent?.status).toLowerCase()
            const error = normalizeText(agent?.error)
            if (status === 'completed') {
              noteMoaTaskSuccess(delegationRetryState, descriptor.signature, { status, error })
              continue
            }
            if (
              agent?.managedRetryExhausted !== true
              && loop?.abortController?.signal?.aborted !== true
              && loop?.cancelled !== true
              && shouldRetryMoaTask(delegationRetryState, descriptor.signature, status)
            ) {
              const record = noteMoaTaskRetryScheduled(delegationRetryState, descriptor.signature, { status, error })
              retryDescriptors.push(descriptor)
              emitDelegationMoaEvent('moa:delegation-retry', {
                delegationId,
                taskId: descriptor.taskId,
                agentRole: descriptor.roleName,
                agentRoleId: descriptor.roleId,
                providerId: descriptor.providerId,
                model: descriptor.model,
                attempt: Number(record.attempts || 0),
                status,
                error,
              })
            } else {
              noteMoaTaskTerminalFailure(delegationRetryState, descriptor.signature, { status, error })
            }
          }

          if (retryDescriptors.length > 0) {
            const retryEnvelope = await executeDelegation(
              retryDescriptors.map((descriptor) => descriptor.task),
              moaRoles,
              getApiKey,
              projectFolder,
              emitDelegationMoaEvent,
              loop.abortController.signal,
              attemptContext,
            )
            combinedEnvelope = {
              ...combinedEnvelope,
              usage: mergeUsageTotals(initialEnvelope?.usage, retryEnvelope?.usage),
              agents: mergeRetryResults(
                Array.isArray(combinedEnvelope?.agents) ? combinedEnvelope.agents : [],
                Array.isArray(retryEnvelope?.agents) ? retryEnvelope.agents : [],
              ),
              stagedChanges: dedupeStagedChanges([
                ...(Array.isArray(combinedEnvelope?.stagedChanges) ? combinedEnvelope.stagedChanges : []),
                ...(Array.isArray(retryEnvelope?.stagedChanges) ? retryEnvelope.stagedChanges : []),
              ]),
              errors: [
                ...(Array.isArray(combinedEnvelope?.errors) ? combinedEnvelope.errors : []),
                ...(Array.isArray(retryEnvelope?.errors) ? retryEnvelope.errors : []),
              ],
              retryAttempted: true,
              retryAttemptCount: Number(retryDescriptors.length || 0),
            }
            for (const agent of Array.isArray(retryEnvelope?.agents) ? retryEnvelope.agents : []) {
              const descriptor = findDescriptorForAgent(agent, retryDescriptors)
              if (!descriptor) continue
              const status = normalizeText(agent?.status).toLowerCase()
              const error = normalizeText(agent?.error)
              if (status === 'completed') {
                noteMoaTaskSuccess(delegationRetryState, descriptor.signature, { status, error })
              } else {
                noteMoaTaskTerminalFailure(delegationRetryState, descriptor.signature, { status, error })
              }
            }
          }

          delegationEnvelope = finalizeBoundedDelegationEnvelope({
            delegationEnvelope: combinedEnvelope,
            requestedTaskCount: rawTasks.length,
            plannedTaskCount,
            admittedTaskCount: requestedDescriptors.length,
            executedTaskCount: executableDescriptors.length,
            limitedTaskCount,
            requestedDescriptors,
            skippedDescriptors,
            retryState: delegationRetryState,
            stepStartedAt,
            costDecision,
            fanoutDecision,
            plannerPacket,
            policy: moaPolicy,
          })
        } else {
          delegationEnvelope = finalizeBoundedDelegationEnvelope({
            delegationEnvelope: {
              delegationId,
              threadId: activeThreadId,
              turnId: activeTurnId,
              stepId,
              ...delegationDispatchMeta,
              startedAt: stepStartedAt,
              finishedAt: stepStartedAt,
              durationMs: 0,
              usage: createUsage(),
              summary: summarizeResults([]),
              agents: [],
              stagedChanges: [],
              policy: normalizeMoaPolicy(moaPolicy || {}),
              errors: [],
              retryAttempted: false,
              retryAttemptCount: 0,
            },
            requestedTaskCount: rawTasks.length,
            plannedTaskCount,
            admittedTaskCount: requestedDescriptors.length,
            executedTaskCount: executableDescriptors.length,
            limitedTaskCount,
            requestedDescriptors,
            skippedDescriptors,
            retryState: delegationRetryState,
            stepStartedAt,
            costDecision,
            fanoutDecision,
            plannerPacket,
            policy: moaPolicy,
          })
        }

        if (partialPreflight) {
          delegationEnvelope = mergePartialDelegationPreflight({
            executionEnvelope: delegationEnvelope,
            blockedTasks: partialPreflight.blockedTasks,
            allTasks: partialPreflight.allTasks,
            errors: partialPreflight.errors,
            policy: moaPolicy,
            envelopeMeta: {
              delegationId,
              threadId: activeThreadId,
              turnId: activeTurnId,
              stepId,
              ...delegationDispatchMeta,
            },
          })
        }

        emitDelegationMoaEvent('moa:delegation-done', {
          delegationId: delegationEnvelope.delegationId,
          status: delegationEnvelope.status,
          taskCount: delegationEnvelope.taskCount,
          requestedTaskCount: Number(delegationEnvelope.requestedTaskCount || rawTasks.length || 0),
          plannedTaskCount: Number(delegationEnvelope.plannedTaskCount || delegationEnvelope.taskCount || 0),
          admittedTaskCount: Number(delegationEnvelope.admittedTaskCount || delegationEnvelope.taskCount || 0),
          executedTaskCount: Number(delegationEnvelope.executedTaskCount || 0),
          skippedTaskCount: Number(delegationEnvelope.skippedTaskCount || 0),
          limitedTaskCount: Number(delegationEnvelope.limitedTaskCount || 0),
          summary: delegationEnvelope.summary,
          usage: delegationEnvelope.usage,
          riskTier: String(delegationEnvelope.riskTier || plannerPacket?.riskTier || ''),
          strategy: String(delegationEnvelope.strategy || plannerPacket?.strategy || ''),
          pattern: String(delegationEnvelope.pattern || plannerPacket?.pattern || ''),
          estimatedTokens: Number(delegationEnvelope.estimatedTokens || plannerPacket?.estimatedTokens || 0),
          actualTokens: Number(delegationEnvelope.actualTokens || delegationEnvelope?.usage?.totalTokens || 0),
          estimatedUsd: Number.isFinite(Number(delegationEnvelope.estimatedUsd))
            ? Number(delegationEnvelope.estimatedUsd)
            : null,
          actualUsd: null,
          costDecision,
          fanoutDecision,
          results: delegationEnvelope.agents,
          startedAt: Number(delegationEnvelope.startedAt || stepStartedAt),
          finishedAt: Number(delegationEnvelope.finishedAt || Date.now()),
          durationMs: Number(delegationEnvelope.durationMs || 0),
          policy: delegationEnvelope.policy,
          stagedSummary: delegationEnvelope.stagedSummary || { count: 0, totalBytes: 0 },
          stagedChanges: Array.isArray(delegationEnvelope.stagedChanges)
            ? delegationEnvelope.stagedChanges.slice(0, 200)
            : [],
          retryAttempted: !!delegationEnvelope.retryAttempted,
          retryAttemptCount: Number(delegationEnvelope.retryAttemptCount || 0),
          retryExhaustedTasks: delegationEnvelope.retryExhaustedTasks,
          skippedRetryExhaustedTasks: delegationEnvelope.skippedRetryExhaustedTasks,
          allAgentsFailed: !!delegationEnvelope.allAgentsFailed,
          partialSuccess: !!delegationEnvelope.partialSuccess,
        })

        delegationIsError = false
      }
    }
  } catch (err) {
    delegationEnvelope = buildDelegationErrorEnvelope({
      delegationId,
      threadId: activeThreadId,
      turnId: activeTurnId,
      stepId,
      ...delegationDispatchMeta,
      policy: moaPolicy,
      tasks: effectivePlannedTasks,
      pattern: String(plannerPacket?.pattern || ''),
      requestedTaskCount: rawTasks.length,
      plannedTaskCount: effectivePlannedTasks.length,
      executedTaskCount: 0,
      skippedTaskCount: 0,
      errors: [{ code: 'delegation_error', message: `Delegation error: ${String(err?.message || 'unknown error')}`, taskId: '' }],
      status: 'failed',
    })
    delegationIsError = true
  }

  if (delegationEnvelope && typeof delegationEnvelope === 'object') {
    Object.assign(delegationEnvelope, delegationDispatchMeta)
  }

  const finalized = finalizeDelegationForSynthesis({
    delegationEnvelope,
    plannerPacket,
    costDecision,
    orchestratorIntent,
  })
  delegationEnvelope = finalized.delegationEnvelope
  emitDelegationToolResult({
    tc,
    toolInput,
    delegationInput,
    delegationEnvelope,
    delegationIsError,
    activeThreadId,
    activeTurnId,
    stepId,
    stepSequence,
    stepStartedAt,
    history,
    turnToolResults,
    send,
    persistTimelineEvent,
    trimText,
  })
  const pendingSynthesisPrompt = preflightRepairPrompt || finalized.pendingSynthesisPrompt
  const pendingSynthesisMessages = preflightRepairPrompt
    ? null
    : finalized.pendingSynthesisMessages

  return {
    handled: true,
    pendingSynthesisPrompt,
    pendingSynthesisMessages,
    preflightRepairTriggered,
    toolResult: String(delegationEnvelope?.text || 'Delegation failed with no output.'),
    toolIsError: delegationIsError === true,
  }
}
