import {
  createStreamWithTools,
  buildAssistantToolUseMessage,
  buildToolResultMessage,
  shouldIncludeReasoningPartInAssistantToolHistory,
} from '../api-clients/ai-provider.mjs'
import {
  isProviderStreamStaleError,
  isProviderQuotaExceededError,
} from '../api-clients/provider-policy.mjs'
import { addUsage, createUsage, normalizeUsage } from './usage-math.mjs'
import {
  buildAgentMessages,
  isNaturalAgentOutput,
  normalizeOpenAIExecutionAuthSnapshot,
  truncateOutput,
  sleep,
} from './agent-runtime-helpers.mjs'
import {
  executeAgentToolCall,
  filterAccountRuntimeAgentTools,
  resolveAgentRuntimeTooling,
} from './agent-runtime-tooling.mjs'
import {
  createAgentStreamEventRouter,
  createManagedDeltaCoalescer,
} from './agent-runtime-stream-events.mjs'
import { listOpenAIProjectVectorStoreIds } from '../api-clients/openai-asset-service.mjs'
import { resolveProviderModelAdapter } from '../api-clients/provider-model-adapters.mjs'
import { resolveRuntimeToolSurface } from '../chat/runtime-tool-surface.mjs'
import { resolveAgentOutputContractType } from './agent-output-contract.mjs'
import { resolveOpenAIExecutionAuth } from '../openai-account/openai-execution-auth.mjs'
import {
  buildExplorationToolCallBatchSignature,
  recordRepeatedToolCallBatch,
} from '../chat/repeated-tool-call-guard.mjs'
import {
  buildMoaLoopRecoveryContract,
  buildMoaLoopRecoveryPrompt,
  filterAgentToolsByRecovery,
  isToolBlockedByLoopRecovery,
} from './moa-loop-recovery.mjs'
import { buildBlockedRecoveryToolMessage } from './moa-agent-recovery-note.mjs'
import {
  buildMoaAgentReportMarkdown,
  parseMoaStructuredOutput,
} from '../../common/moa/moa-display-formatters.mjs'
import { resolveMoaRoleKey } from '../../common/moa/moa-role-keys.mjs'
import {
  classifyAgentProviderFailure,
  isAgentRateLimitError,
  resolveAgentProviderRuntimeSettings,
  resolveAgentStreamIdleTimeoutMs,
  resolveAgentStreamTimeoutMs,
} from './agent-runtime-provider-runtime.mjs'
import { resolveAgentToolClass } from './agent-runtime-tool-class.mjs'
import { appendAgentContinuationHistory } from './agent-orchestration-continuation-history.mjs'
const MAX_RETRY_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 2000
export {
  resolveAgentProviderRuntimeSettings,
  resolveAgentStreamIdleTimeoutMs,
  resolveAgentStreamTimeoutMs,
} from './agent-runtime-provider-runtime.mjs'
export async function runSingleAgent(task, role, apiKey, projectFolder, emit, abortSignal, runtime = {}) {
  const agentRole = String(role?.name || '')
  const agentRoleId = String(role?.id || '')
  const agentRoleKey = resolveMoaRoleKey(role)
  const activeProviderId = String(role?.providerId || '')
  const activeModel = String(role?.model || '')
  const activeApiKey = String(apiKey || '')
  const taskId = String(task?.task_id || '')
  const userFacingOutput = isNaturalAgentOutput(task)
  const openAIExecutionAuthSnapshot = normalizeOpenAIExecutionAuthSnapshot(runtime.openAIExecutionAuthSnapshot)
  const openAIExecutionAuth = String(activeProviderId || '').trim().toLowerCase() === 'openai'
    ? (
        openAIExecutionAuthSnapshot
        || resolveOpenAIExecutionAuth({
          apiKey: activeApiKey,
          allowAccountRuntime: true,
        })
      )
    : null
  const activeAuthMethod = String(openAIExecutionAuth?.authMethod || 'api_key').trim().toLowerCase()
  const usesOpenAIAccountRuntime = activeAuthMethod === 'account'
  const resolvedApiKey = usesOpenAIAccountRuntime
    ? ''
    : String(openAIExecutionAuth?.apiKey || activeApiKey || '')
  const resolvedProviderRuntimeSettings = resolveAgentProviderRuntimeSettings(
    activeProviderId,
    runtime.providerRuntimeSettings,
  )
  const streamEvents = createAgentStreamEventRouter(runtime.onAgentStreamEvent)
  const routeStreamEvent = streamEvents.route
  const {
    policy,
    roleCanWriteFiles,
    agentTools,
  } = resolveAgentRuntimeTooling(role, runtime)

  const usageState = runtime.usageState && typeof runtime.usageState === 'object'
    ? runtime.usageState
    : { totalTokens: 0, limit: 0 }
  const readStopReason = () => {
    if (typeof runtime.getStopReason === 'function') {
      return String(runtime.getStopReason() || '')
    }
    return String(runtime.stopReason || '')
  }

  const startedAt = Date.now()
  const taskInstruction = String(task?.instruction || '').trim()
  const todoScopeKey = [
    'moa',
    String(runtime.delegationId || runtime.threadId || '').trim(),
    agentRoleId,
    taskId,
  ].filter(Boolean).join(':')
  emit('moa:agent-start', {
    taskId,
    agentRoleKey,
    agentRole,
    agentRoleId,
    taskInstruction,
    providerId: activeProviderId,
    model: activeModel,
    agentCanWriteFiles: roleCanWriteFiles,
    status: 'running',
    startedAt,
  })
  const outputContractType = resolveAgentOutputContractType(task)
  const routingStrategy = String(task?.role_resolution_strategy || '')
  const roleFitConfidence = String(task?.role_fit_confidence || '')
  const roleFitScore = Number(task?.role_fit_score || 0)
  const roleFitMargin = Number(task?.role_fit_margin || 0)
  const roleFitTerms = Array.isArray(task?.role_fit_terms) ? task.role_fit_terms : []

  let lastError = null
  let errorStatus = 'failed'
  let retryAfterSeconds = 0
  const totalUsage = createUsage()
  const agentStagedChanges = []
  let totalRounds = 0
  let accountBridgeThreadId = ''
  const syntheticAgentThreadId = [
    'moa',
    String(runtime.delegationId || runtime.threadId || '').trim(),
    agentRoleId,
    taskId,
  ].filter(Boolean).join(':')

  if (String(activeProviderId || '').trim().toLowerCase() === 'openai' && openAIExecutionAuth?.ok !== true) {
    const finishedAt = Date.now()
    const status = String(openAIExecutionAuth?.blockedReason || 'openai_auth_blocked').trim() || 'openai_auth_blocked'
    const error = String(
      openAIExecutionAuth?.blockedMessage
      || 'OpenAI account runtime is unavailable for this delegated agent.',
    )
    emit('moa:agent-error', {
      taskId,
      agentRoleKey,
      agentRole,
      agentRoleId,
      taskInstruction,
      providerId: activeProviderId,
      model: activeModel,
      agentCanWriteFiles: roleCanWriteFiles,
      routingStrategy,
      roleFitConfidence,
      roleFitScore,
      roleFitMargin,
      roleFitTerms,
      status,
      error,
      retryAfterSeconds: 0,
      usage: totalUsage,
      tokenUsage: totalUsage,
      rounds: totalRounds,
      stagedChanges: agentStagedChanges,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, finishedAt - startedAt),
    })
    return {
      taskId,
      roleKey: agentRoleKey,
      roleId: agentRoleId,
      role: agentRole,
      taskInstruction,
      outputContractType,
      providerId: activeProviderId,
      model: activeModel,
      agentCanWriteFiles: roleCanWriteFiles,
      routingStrategy,
      roleFitConfidence,
      roleFitScore,
      roleFitMargin,
      roleFitTerms,
      status,
      error,
      retryAfterSeconds: 0,
      output: null,
      rawOutput: null,
      structuredOutput: null,
      reportMarkdown: '',
      usage: totalUsage,
      tokenUsage: totalUsage,
      rounds: totalRounds,
      truncated: false,
      stagedChanges: agentStagedChanges,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, finishedAt - startedAt),
      attempted: true,
    }
  }
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    if (abortSignal?.aborted) {
      const finishedAt = Date.now()
      const status = readStopReason() || 'aborted'
      return {
        taskId,
        roleKey: agentRoleKey,
        roleId: agentRoleId,
        role: agentRole,
        taskInstruction,
        outputContractType,
        providerId: activeProviderId,
        model: activeModel,
        agentCanWriteFiles: roleCanWriteFiles,
        status: status === 'budget_exceeded' ? 'budget_exceeded' : status === 'timeout' ? 'timeout' : 'aborted',
        output: null,
        error: status === 'timeout' ? 'Delegation timed out.' : status === 'budget_exceeded' ? 'Delegation token budget exceeded.' : 'Aborted',
        usage: totalUsage,
        tokenUsage: totalUsage,
        rawOutput: null,
        structuredOutput: null,
        reportMarkdown: '',
        rounds: totalRounds,
        truncated: false,
        stagedChanges: agentStagedChanges,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt - startedAt),
        attempted: true,
      }
    }

    let rounds = 0
    try {
      const options = {
        model: activeModel,
        abortSignal,
        streamTimeoutMs: resolveAgentStreamTimeoutMs(runtime),
        streamIdleTimeoutMs: resolveAgentStreamIdleTimeoutMs(activeProviderId, runtime),
      }
      let activeAgentTools = usesOpenAIAccountRuntime ? {} : { ...agentTools }
      const adapterProfile = resolveProviderModelAdapter(activeProviderId, activeModel)
      const runtimeToolSurface = await resolveRuntimeToolSurface({
        providerId: activeProviderId,
        modelId: activeModel,
        mode: 'execute',
        userMessage: String(task?.instruction || ''),
        apiKey: resolvedApiKey,
        addomTools: agentTools,
        providerRuntimeSettings: resolvedProviderRuntimeSettings,
        vectorStoreIds: usesOpenAIAccountRuntime ? [] : listOpenAIProjectVectorStoreIds(runtime.projectId),
        includeOpenAILocalRuntimeTools: false,
        adapterProfile,
        disableAllTools: false,
        abortSignal,
      })
      const resolvedToolSurface = runtimeToolSurface.resolvedToolSurface
      activeAgentTools = usesOpenAIAccountRuntime
        ? filterAccountRuntimeAgentTools(resolvedToolSurface.tools || {}, agentTools)
        : {
            ...(resolvedToolSurface.tools || {}),
          }
      const baseAgentTools = { ...activeAgentTools }
      const toolExecutionMap = resolvedToolSurface.toolExecutionMap || {}

      const history = [...buildAgentMessages(task, role, {
        canWriteFiles: roleCanWriteFiles,
        toolNames: Object.keys(baseAgentTools || {}),
      })]
      const repeatedToolCallState = {
        lastSignature: '',
        repeatedCount: 0,
      }
      const repeatedExplorationToolCallState = {
        lastSignature: '',
        repeatedCount: 0,
      }
      let pendingLoopRecovery = null
      let loopRecoveryAttemptsUsed = 0
      let finalText = ''
      let lastToolExecutionError = ''
      let needsMoreRounds = false

      while (rounds < policy.maxAgentRounds) {
        if (abortSignal?.aborted) {
          throw new Error('Aborted')
        }
        rounds += 1
        const pendingAgentMessages = typeof runtime.consumeAgentMessages === 'function'
          ? runtime.consumeAgentMessages()
          : []
        appendAgentContinuationHistory({ history, pendingAgentMessages })

        const currentLoopRecovery = pendingLoopRecovery
        if (currentLoopRecovery) {
          history.push({
            role: 'system',
            content: buildMoaLoopRecoveryPrompt(currentLoopRecovery),
          })
        }
        const roundAgentTools = currentLoopRecovery
          ? filterAgentToolsByRecovery(baseAgentTools, currentLoopRecovery)
          : { ...baseAgentTools }
        pendingLoopRecovery = null
        options.tools = roundAgentTools

        let reasoningOpen = false
        const onTextChunk = createManagedDeltaCoalescer((delta) => {
          void routeStreamEvent({ kind: 'assistant_delta', payload: {
            delta, presentation: userFacingOutput ? 'user' : 'internal' } })
        })
        let streamedReasoning = ''
        const onReasoningChunk = createManagedDeltaCoalescer((delta, metadata = {}) => {
          if (metadata.boundaryBefore === true && reasoningOpen) {
            reasoningOpen = false
            void routeStreamEvent({
              kind: 'reasoning_boundary',
              payload: { boundary: 'end' },
            })
          }
          if (!reasoningOpen) {
            reasoningOpen = true
            void routeStreamEvent({
              kind: 'reasoning_boundary',
              payload: { boundary: 'start' },
            })
          }
          streamedReasoning += delta
          void routeStreamEvent({ kind: 'reasoning', payload: { delta } })
        })
        const executeRoutedToolCall = async (toolCall) => {
          const toolCallId = String(toolCall?.id || `${taskId}:${rounds}:${toolCall?.name || 'tool'}`)
          const toolName = String(toolCall?.name || '').trim()
          await routeStreamEvent({
            kind: 'tool_started',
            payload: {
              toolCallId,
              toolName,
              toolClass: resolveAgentToolClass(toolName),
            },
          })
          const execution = await executeAgentToolCall({
            toolCall,
            roleCanWriteFiles,
            projectFolder,
            taskId,
            agentRoleId,
            agentRole,
            runtime,
            policy,
            emit,
            abortSignal,
            todoScopeKey,
            activeProviderId,
            resolvedApiKey,
            runtimeToolSurface,
            toolExecutionMap,
            agentStagedChanges,
          })
          await routeStreamEvent({
            kind: 'tool_output',
            payload: {
              toolCallId,
              output: execution.result,
            },
          })
          await routeStreamEvent({
            kind: 'tool_completed',
            payload: {
              toolCallId,
              status: execution.isToolError ? 'failed' : 'completed',
            },
          })
          return execution
        }
        const streamPayload = await createStreamWithTools(
          activeProviderId,
          resolvedApiKey,
          history,
          {
            ...options,
            providerRuntimeSettings: resolvedProviderRuntimeSettings,
            ...(String(activeProviderId || '').trim().toLowerCase() === 'openai'
              ? {
                openAIExecutionAuthContext: {
                  authMethod: activeAuthMethod || 'api_key',
                },
                ...(usesOpenAIAccountRuntime ? { openAIAccountApprovalContext: { permissionProfile: ':read-only' } } : {}),
                ...(usesOpenAIAccountRuntime && Object.keys(activeAgentTools || {}).length > 0
                  ? {
                    openAIAccountDynamicToolExecutor: async ({ toolName = '', input = {} } = {}) => {
                      const execution = await executeRoutedToolCall({
                        id: `account:${taskId}:${rounds}:${String(toolName || '').trim()}`,
                        name: String(toolName || '').trim(),
                        input,
                      })
                      if (execution.isToolError) {
                        lastToolExecutionError = execution.errorMessage || 'Tool execution failed.'
                      }
                      return {
                        result: execution.result,
                        isError: execution.isToolError,
                      }
                    },
                  }
                  : {}),
              }
              : {}),
            requestContext: {
              projectId: runtime.projectId,
              threadId: usesOpenAIAccountRuntime ? syntheticAgentThreadId : runtime.threadId,
              projectFolder, workspacePath: projectFolder,
              toolNames: Object.keys(roundAgentTools || {}),
              ...(usesOpenAIAccountRuntime && accountBridgeThreadId
                ? {
                  openai: {
                    accountBridgeThreadId,
                  },
                }
                : {}),
            },
          },
          onTextChunk,
          onReasoningChunk,
        )
        await streamEvents.drain()
        const {
          text,
          toolCalls,
          usage,
          reasoning,
          providerReasoningParts = [],
          providerResponseMeta = null,
        } = streamPayload || {}
        const authoritativeReasoning = String(reasoning ?? '')
        if (authoritativeReasoning.trim() && authoritativeReasoning !== streamedReasoning) {
          if (!reasoningOpen) {
            reasoningOpen = true
            await routeStreamEvent({
              kind: 'reasoning_boundary',
              payload: { boundary: 'start' },
            })
          }
          await routeStreamEvent({
            kind: 'reasoning',
            payload: { delta: authoritativeReasoning, snapshot: true },
          })
        }
        if (reasoningOpen) {
          reasoningOpen = false
          await routeStreamEvent({
            kind: 'reasoning_boundary',
            payload: { boundary: 'end' },
          })
        }
        await streamEvents.drain()
        if (usesOpenAIAccountRuntime) {
          accountBridgeThreadId = String(providerResponseMeta?.accountBridgeThreadId || '').trim() || accountBridgeThreadId
        }

        const deltaUsage = normalizeUsage(usage)
        addUsage(totalUsage, deltaUsage)
        usageState.totalTokens += Number(deltaUsage.totalTokens || 0)
        if (usageState.limit > 0 && usageState.totalTokens > usageState.limit) {
          runtime.abortDelegation?.('budget_exceeded')
          throw new Error('Delegation token budget exceeded.')
        }

        finalText = String(text ?? '')
        if (!toolCalls.length) {
          needsMoreRounds = false
          break
        }
        const recoveryBlockedCalls = currentLoopRecovery
          ? toolCalls.filter((toolCall) => isToolBlockedByLoopRecovery(toolCall?.name, currentLoopRecovery))
          : []
        if (recoveryBlockedCalls.length > 0) {
          errorStatus = 'failed'
          throw new Error(
            `Loop recovery failed because the worker retried blocked tool(s): ${
              recoveryBlockedCalls.map((toolCall) => String(toolCall?.name || '').trim()).filter(Boolean).join(', ')
            }.`,
          )
        }
        const repeatedToolBatch = recordRepeatedToolCallBatch({
          state: repeatedToolCallState,
          toolCalls,
          maxConsecutiveIdenticalRounds: policy.maxConsecutiveIdenticalToolRounds,
        })
        if (repeatedToolBatch.blocked) {
          if (loopRecoveryAttemptsUsed < Number(policy.maxLoopRecoveryAttempts || 0)) {
            loopRecoveryAttemptsUsed += 1
            pendingLoopRecovery = buildMoaLoopRecoveryContract({
              triggerKind: 'identical_tool_batch',
              toolCalls,
              recoveryAttempt: loopRecoveryAttemptsUsed,
              maxRecoveryAttempts: policy.maxLoopRecoveryAttempts,
            })
            emit('moa:agent-recovery', {
              taskId,
              agentRoleKey,
              agentRole,
              agentRoleId,
              taskInstruction,
              providerId: activeProviderId,
              model: activeModel,
              triggerKind: pendingLoopRecovery.triggerKind,
              recoveryAttempt: pendingLoopRecovery.recoveryAttempt,
              maxRecoveryAttempts: pendingLoopRecovery.maxRecoveryAttempts,
              blockedToolNames: pendingLoopRecovery.blockedToolNames,
              targetPath: pendingLoopRecovery.targetPath,
              message: 'Loop guard tripped. Retrying once with narrowed scope.',
              startedAt,
              recoveredAt: Date.now(),
            })
            needsMoreRounds = true
            continue
          }
          errorStatus = 'failed'
          throw new Error(
            `Stopped after ${policy.maxConsecutiveIdenticalToolRounds} identical tool-call rounds. ` +
            'Same tool batch kept repeating without progress.',
          )
        }
        const repeatedExplorationBatch = recordRepeatedToolCallBatch({
          state: repeatedExplorationToolCallState,
          toolCalls,
          maxConsecutiveIdenticalRounds: policy.maxConsecutiveNearDuplicateExplorationRounds,
          signatureBuilder: buildExplorationToolCallBatchSignature,
        })
        if (repeatedExplorationBatch.blocked) {
          if (loopRecoveryAttemptsUsed < Number(policy.maxLoopRecoveryAttempts || 0)) {
            loopRecoveryAttemptsUsed += 1
            pendingLoopRecovery = buildMoaLoopRecoveryContract({
              triggerKind: 'near_duplicate_exploration',
              toolCalls,
              recoveryAttempt: loopRecoveryAttemptsUsed,
              maxRecoveryAttempts: policy.maxLoopRecoveryAttempts,
            })
            emit('moa:agent-recovery', {
              taskId,
              agentRoleKey,
              agentRole,
              agentRoleId,
              taskInstruction,
              providerId: activeProviderId,
              model: activeModel,
              triggerKind: pendingLoopRecovery.triggerKind,
              recoveryAttempt: pendingLoopRecovery.recoveryAttempt,
              maxRecoveryAttempts: pendingLoopRecovery.maxRecoveryAttempts,
              blockedToolNames: pendingLoopRecovery.blockedToolNames,
              targetPath: pendingLoopRecovery.targetPath,
              message: 'Loop guard tripped. Retrying once with narrowed scope.',
              startedAt,
              recoveredAt: Date.now(),
            })
            needsMoreRounds = true
            continue
          }
          errorStatus = 'failed'
          throw new Error(
            `Stopped after ${policy.maxConsecutiveNearDuplicateExplorationRounds} near-duplicate exploration rounds. ` +
            'The worker kept revisiting the same file, query, or code region without progress.',
          )
        }
        needsMoreRounds = true

        const assistantMsg = buildAssistantToolUseMessage(text, toolCalls, {
          reasoningText: reasoning || '',
          includeReasoningPart: shouldIncludeReasoningPartInAssistantToolHistory(activeProviderId),
          providerReasoningParts,
        })
        history.push(assistantMsg)

        for (const tc of toolCalls) {
          if (abortSignal?.aborted) throw new Error('Aborted')
          if (isToolBlockedByLoopRecovery(tc?.name, currentLoopRecovery)) {
            const result = buildBlockedRecoveryToolMessage(currentLoopRecovery, tc?.name)
            history.push(buildToolResultMessage(tc.id, tc.name, result, true))
            lastToolExecutionError = result
            continue
          }
          const { result, isToolError, errorMessage } = await executeRoutedToolCall(tc)
          if (isToolError) {
            lastToolExecutionError = errorMessage || 'Tool execution failed.'
          }
          const resultMsg = buildToolResultMessage(tc.id, tc.name, result, isToolError)
          history.push(resultMsg)
        }
      }

      if (needsMoreRounds && rounds >= policy.maxAgentRounds) {
        errorStatus = 'failed'
        throw new Error(`Agent exceeded max tool rounds (${policy.maxAgentRounds}).`)
      }

      if (!String(finalText || '').trim() && lastToolExecutionError) {
        errorStatus = 'failed'
        throw new Error(lastToolExecutionError)
      }

      totalRounds += rounds
      const clipped = truncateOutput(finalText, policy.maxAgentOutputChars)
      const structuredOutput = parseMoaStructuredOutput(clipped.output)
      const reportMarkdown = buildMoaAgentReportMarkdown({
        rawOutput: clipped.output,
        outputContractType,
      })
      const finishedAt = Date.now()
      const accumulatedRounds = totalRounds
      const payload = {
        taskId,
        agentRoleKey,
        agentRole,
        agentRoleId,
        taskInstruction,
        outputContractType,
        providerId: activeProviderId,
        model: activeModel,
        agentCanWriteFiles: roleCanWriteFiles,
        routingStrategy,
        roleFitConfidence,
        roleFitScore,
        roleFitMargin,
        roleFitTerms,
        status: 'completed',
        output: clipped.output,
        rawOutput: clipped.output,
        structuredOutput,
        reportMarkdown,
        truncated: clipped.truncated,
        originalOutputChars: clipped.originalChars,
        tokenUsage: totalUsage,
        usage: totalUsage,
        rounds: accumulatedRounds,
        stagedChanges: agentStagedChanges,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt - startedAt),
      }
      emit('moa:agent-done', payload)

      return {
        taskId,
        roleKey: agentRoleKey,
        roleId: agentRoleId,
        role: agentRole,
        taskInstruction,
        outputContractType,
        providerId: activeProviderId,
        model: activeModel,
        agentCanWriteFiles: roleCanWriteFiles,
        routingStrategy,
        roleFitConfidence,
        roleFitScore,
        roleFitMargin,
        roleFitTerms,
        status: 'completed',
        output: clipped.output,
        rawOutput: clipped.output,
        structuredOutput,
        reportMarkdown,
        error: null,
        usage: totalUsage,
        tokenUsage: totalUsage,
        rounds: accumulatedRounds,
        truncated: clipped.truncated,
        originalOutputChars: clipped.originalChars,
        stagedChanges: agentStagedChanges,
        startedAt,
        finishedAt,
        durationMs: payload.durationMs,
        attempted: true,
      }
    } catch (err) {
      totalRounds += rounds
      lastError = err
      if (abortSignal?.aborted) {
        const status = readStopReason() || 'aborted'
        errorStatus = status === 'budget_exceeded'
          ? 'budget_exceeded'
          : status === 'timeout'
            ? 'timeout'
            : status === 'stale'
              ? 'stale'
              : 'aborted'
        break
      }
      if (isProviderStreamStaleError(err)) {
        errorStatus = 'stale'
        break
      }
      if (isProviderQuotaExceededError(err)) {
        const classified = classifyAgentProviderFailure(err)
        errorStatus = 'rate_limited'
        retryAfterSeconds = classified.retryAfterSeconds
        break
      }
      if (isAgentRateLimitError(err)) {
        if (attempt < MAX_RETRY_ATTEMPTS) {
          await sleep(attempt * RETRY_BASE_DELAY_MS)
          continue
        }
        const classified = classifyAgentProviderFailure(err)
        errorStatus = 'rate_limited'
        retryAfterSeconds = classified.retryAfterSeconds
        break
      }
      break
    }
  }

  const finishedAt = Date.now()
  const stopReason = readStopReason()
  const fallback = stopReason === 'timeout'
    ? 'Delegation timed out.'
    : stopReason === 'stale'
      ? 'Delegated agent stream went stale.'
    : stopReason === 'budget_exceeded'
      ? 'Delegation token budget exceeded.'
      : 'Unknown agent error.'
  const classifiedError = classifyAgentProviderFailure(lastError)
  const errorMsg = errorStatus === 'rate_limited'
    ? classifiedError.error
    : String(lastError?.message || fallback)
  emit('moa:agent-error', {
    taskId,
    agentRoleKey,
    agentRole,
    agentRoleId,
    taskInstruction,
    providerId: activeProviderId,
    model: activeModel,
    agentCanWriteFiles: roleCanWriteFiles,
    routingStrategy,
    roleFitConfidence,
    roleFitScore,
    roleFitMargin,
    roleFitTerms,
    status: errorStatus,
    error: errorMsg,
    retryAfterSeconds,
    usage: totalUsage,
    tokenUsage: totalUsage,
    rounds: totalRounds,
    stagedChanges: agentStagedChanges,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
  })
  return {
    taskId,
    roleKey: agentRoleKey,
    roleId: agentRoleId,
    role: agentRole,
    taskInstruction,
    outputContractType,
    providerId: activeProviderId,
    model: activeModel,
    agentCanWriteFiles: roleCanWriteFiles,
    routingStrategy,
    roleFitConfidence,
    roleFitScore,
    roleFitMargin,
    roleFitTerms,
    status: errorStatus,
    error: errorMsg,
    retryAfterSeconds,
    output: null,
    rawOutput: null,
    structuredOutput: null,
    reportMarkdown: '',
    usage: totalUsage,
    tokenUsage: totalUsage,
    rounds: totalRounds,
    truncated: false,
    stagedChanges: agentStagedChanges,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
    attempted: true,
  }
}
