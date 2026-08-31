import { runSingleStreamRound } from './chat-stream-round-runner.mjs'
import { createMoaRetryState } from './moa-retry-state.mjs'
import { executeApprovedToolStep } from './chat-stream-tool-execution.mjs'
import {
  recordToolWorkflowLintEvent,
  recordToolWorkflowOutcome,
} from './chat-runtime-diagnostics.mjs'
import {
  buildLintBlockedResult,
  lintToolCall,
  TOOL_CALL_LINT_DECISIONS,
} from './tool-call-linter.mjs'
import {
  handleHiddenKnownToolRecoveryStep,
  primeHiddenRerouteToolRecovery,
} from './tool-surface-recovery.mjs'
import { normalizeQuestionUserRequest } from '../../common/chat/question-user-request.mjs'
import { runRequiredAgentDelegationBeforeRoot } from './required-agent-delegation.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'
import { APPROVAL_RENDERER_UNAVAILABLE_MESSAGE, buildDeniedToolCallResult, buildQuestionUserAssistantText, finalizeQuestionUserRound, getBlockedToolNames, getBlockedToolStates, isFileMutationTool, recordBlockedToolRetryStep, stopAfterConsecutiveToolErrors, stopAfterMaxToolRounds, updateToolBatchFailureState } from './chat-stream-rounds-tool-batch-helpers.mjs'
export async function runToolCallBatchForRound({
  toolCalls = [],
  loop,
  sender = null,
  wid = 0,
  settings = null,
  mode = 'execute',
  permissionMode = '',
  projectFolder = '',
  providerId = '',
  model = '',
  promptBudgetProfile = null,
  apiKey = '',
  providerRuntimeSettings = null,
  orchestratorIntent = '',
  delegationSelectionIntent = '',
  moaRoles = [],
  moaPolicy = null,
  moaBudgetPolicy = null,
  agentSettings = null,
  activeThreadId = '',
  activeTurnId = '',
  activeAssistantMessageId = '',
  history = [],
  turnToolResults = [],
  turnReasoningSegments = [],
  providerToolExecutionContext = null,
  toolExecutionMap = {},
  activeToolDefinitions = {},
  tools = {},
  inspectedFilePathsThisTurn = new Set(),
  errorDiagnostics = {},
  send = () => {},
  persistTimelineEvent = () => {},
  sendTurnState = () => {},
  emitTurnRuntimeDiagnostics = () => {},
  requestFanoutConfirmation = () => Promise.resolve(null),
  getApiKey = null,
  getCachedCapabilities = null,
  turnStartedAt = 0,
  stepSequence = 0,
  consecutiveErrorRounds = 0,
  hostFullAccessApprovedForTurn = false,
  moaPreflightRepairRetryUsed = false,
  moaPendingPreflightRepairRetryAttempt = false,
  moaRetryState = null,
  maxConsecutiveErrorRounds = 3,
  helpers = {},
} = {}) {
  const {
    toToolEventInput,
    shouldBlockEditFileWithoutInspection,
    recordToolStepOutcome,
    buildToolResultMessage,
    trimText,
    extractRunCommandMeta,
    runDelegationToolCall,
    resolveToolApprovalForStep,
    bumpRuntimeCount,
    takeShellWriteSnapshot,
    detectShellWriteArtifactChanges,
    executeOpenAILocalRuntimeTool,
    isOpenAILocalRuntimeToolName,
    executeTool,
    resolveToolWriteArtifactMeta,
    getBaseRevisionId,
    buildMissingDependencyInstallHint,
    isAbortError,
    executeProviderNativeToolCall,
    extractPrefixedMetaFromResultText,
    buildToolRecoveryPrompt,
    recordInspectedPathForTurn,
  } = helpers

  let pendingSynthesisPrompt = null
  let pendingSynthesisMessages = null
  let questionUserRequest = null
  const effectivePermissionMode = String(permissionMode || settings?.permissionMode || 'ask').trim().toLowerCase() || 'ask'
  let moaSpecializedContinuationPromptInjectedThisRound = false
  let shouldBreakRoundLoop = false
  let shouldStopToolBatch = false
  let executedToolCallCount = 0
  const blockedToolNames = getBlockedToolNames(loop)
  const blockedToolStates = getBlockedToolStates(loop)
  const visibleToolNamesAtRoundStart = Object.keys(
    Object.keys(activeToolDefinitions || {}).length > 0
      ? activeToolDefinitions
      : (tools || {}),
  )

  for (const tc of toolCalls) {
    if (loop.cancelled) break
    const toolInput = tc.input ?? tc.args ?? {}
    const toolEventInput = toToolEventInput(tc.name, toolInput)
    stepSequence += 1
    const stepId = `${activeTurnId}:step:${stepSequence}`
    const stepStartedAt = Date.now()

    if (recordBlockedToolRetryStep({
      blockedToolNames, blockedToolStates, tc, toolInput, toolEventInput,
      recordToolStepOutcome, recordToolWorkflowOutcome, turnToolResults,
      history, send, persistTimelineEvent, buildToolResultMessage, trimText,
      extractRunCommandMeta, stepId, stepSequence, stepStartedAt,
      activeThreadId, activeTurnId, providerId,
      model: model ?? '',
      promptBudgetProfile, errorDiagnostics, turnStartedAt,
    })) {
      executedToolCallCount += 1
      continue
    }

    const hiddenKnownRecovery = handleHiddenKnownToolRecoveryStep({
      tc, toolInput, toolEventInput,
      visibleToolNames: visibleToolNamesAtRoundStart,
      loop, activeThreadId, activeTurnId, activeToolDefinitions, tools,
      toolExecutionMap, errorDiagnostics, recordToolStepOutcome,
      recordToolWorkflowOutcome, turnToolResults, history, send,
      persistTimelineEvent, buildToolResultMessage, trimText,
      extractRunCommandMeta, stepId, stepSequence, stepStartedAt, providerId,
      model: model ?? '',
      promptBudgetProfile, turnStartedAt,
    })
    if (hiddenKnownRecovery.handled) {
      if (hiddenKnownRecovery.blockedForTurn) {
        const blockedName = String(tc?.name || '').trim().toLowerCase()
        blockedToolNames.add(blockedName)
        blockedToolStates.set(blockedName, {
          lintCode: hiddenKnownRecovery.lintResult?.lintCode || '',
          failureClass: hiddenKnownRecovery.lintResult?.failureClass || '',
          rerouteToolName: hiddenKnownRecovery.lintResult?.rerouteToolName || '',
        })
      }
      executedToolCallCount += 1
      continue
    }

    const editGuard = shouldBlockEditFileWithoutInspection({
      toolName: tc.name,
      toolInput,
      inspectedPaths: inspectedFilePathsThisTurn,
    })
    if (editGuard.blocked) {
      const stepFinishedAt = Date.now()
      const durationMs = Math.max(0, stepFinishedAt - stepStartedAt)
      recordToolStepOutcome({
        turnToolResults,
        history,
        send,
        persistTimelineEvent,
        buildToolResultMessage,
        trimText,
        extractRunCommandMeta,
        approvalId: '',
        tc,
        toolInput,
        toolEventInput,
        result: editGuard.message,
        isError: true,
        decision: 'approved',
        denyReason: '',
        missingDependencySuspected: false,
        stepId,
        sequence: stepSequence,
        startedAt: stepStartedAt,
        finishedAt: stepFinishedAt,
        durationMs,
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId,
        model: model ?? '',
        promptBudgetProfile,
        errorDiagnostics,
      })
      executedToolCallCount += 1
      continue
    }

    const lintResult = lintToolCall({
      toolName: tc.name,
      toolInput,
    })
    recordToolWorkflowLintEvent(errorDiagnostics, {
      toolName: tc.name,
      lintResult,
    })
    if (lintResult.decision === TOOL_CALL_LINT_DECISIONS.REJECT) {
      primeHiddenRerouteToolRecovery({
        loop,
        rerouteToolName: lintResult.rerouteToolName,
        visibleToolNames: visibleToolNamesAtRoundStart,
        activeToolDefinitions,
        tools,
        toolExecutionMap,
      })
      const stepFinishedAt = Date.now()
      const durationMs = Math.max(0, stepFinishedAt - stepStartedAt)
      recordToolStepOutcome({
        turnToolResults,
        history,
        send,
        persistTimelineEvent,
        buildToolResultMessage,
        trimText,
        extractRunCommandMeta,
        approvalId: '',
        tc,
        toolInput,
        toolEventInput,
        result: buildLintBlockedResult({
          toolName: tc.name,
          lintResult,
        }),
        isError: true,
        decision: 'approved',
        denyReason: '',
        missingDependencySuspected: false,
        stepId,
        sequence: stepSequence,
        startedAt: stepStartedAt,
        finishedAt: stepFinishedAt,
        durationMs,
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId,
        model: model ?? '',
        promptBudgetProfile,
        errorDiagnostics,
        lintResult,
      })
      recordToolWorkflowOutcome(errorDiagnostics, {
        toolName: tc.name,
        decision: 'approved',
        isError: true,
        failureClass: lintResult.failureClass || '',
        rerouteToolName: lintResult.rerouteToolName || '',
        turnStartedAt,
        finishedAt: stepFinishedAt,
      })
      executedToolCallCount += 1
      continue
    }

    const executionToolName = String(toolExecutionMap?.[tc.name] || tc.name || '').trim()

    if (executionToolName === 'delegate_to_agents') {
      const isPreflightRepairRetryAttempt = moaPendingPreflightRepairRetryAttempt
      const delegationToolInput = toolInput
      const delegationOutcome = await runDelegationToolCall({
        tc,
        toolInput: delegationToolInput,
        stepId,
        stepSequence,
        stepStartedAt,
        activeThreadId,
        activeTurnId,
        activeAssistantMessageId,
        projectFolder,
        loop,
        moaRoles,
        moaPolicy,
        moaBudgetPolicy,
        agentSettings,
        requestFanoutConfirmation,
        history,
        turnToolResults,
        send,
        persistTimelineEvent,
        providerRuntimeSettings,
        moaRetryState,
        allowPreflightRepairRetry: !moaPreflightRepairRetryUsed,
        orchestratorProviderId: providerId,
        orchestratorModel: model ?? '',
        orchestratorIntent,
        delegationSelectionIntent,
        isPreflightRepairRetryAttempt,
      })
      if (delegationOutcome?.handled) {
        executedToolCallCount += 1
        if (isPreflightRepairRetryAttempt) {
          moaPendingPreflightRepairRetryAttempt = false
        }
        if (delegationOutcome?.preflightRepairTriggered) {
          moaPreflightRepairRetryUsed = true
          moaPendingPreflightRepairRetryAttempt = true
          moaSpecializedContinuationPromptInjectedThisRound = true
        }
        pendingSynthesisPrompt = delegationOutcome.pendingSynthesisPrompt || pendingSynthesisPrompt
        pendingSynthesisMessages = delegationOutcome.pendingSynthesisMessages || pendingSynthesisMessages
        if (shouldStopToolBatch) break
        continue
      }
    }

    const approvalOutcome = await resolveToolApprovalForStep({
      sender,
      wid,
      tc,
      toolInput,
      toolEventInput,
      stepId,
      stepSequence,
      stepStartedAt,
      activeThreadId,
      activeTurnId,
      projectFolder,
      loop,
      settings,
      hostFullAccessApprovedForTurn,
      send,
      persistTimelineEvent,
      sendTurnState,
    })
    if (approvalOutcome?.cancelled || loop.cancelled) break

    const applyPreviewContent = approvalOutcome?.applyPreviewContent
    const approvalId = String(approvalOutcome?.approvalId || '')
    const approvalPolicy = approvalOutcome?.approvalPolicy || null
    const approvalPromptSource = String(approvalOutcome?.approvalPromptSource || '').trim()
    const approvalPromptAction = String(approvalOutcome?.approvalPromptAction || '').trim()
    if (approvalOutcome?.approvalPromptShown === true) {
      errorDiagnostics.approvalPromptCount += 1
      if (tc.name === 'run_command' && approvalPolicy?.elevationRequired === true) {
        errorDiagnostics.riskyApprovalPromptCount += 1
      }
    } else if (approvalPromptSource && approvalPromptAction === 'approve') {
      bumpRuntimeCount(errorDiagnostics.approvalAutoSources, approvalPromptSource)
    }
    const decision = approvalOutcome?.decision === 'approved' ? 'approved' : 'denied'
    const denyReason = decision === 'approved'
      ? ''
      : String(approvalOutcome?.denyReason || 'user_denied')
    if (decision === 'approved') {
      errorDiagnostics.approvalApprovedCount += 1
    } else {
      errorDiagnostics.approvalDeniedCount += 1
      if (denyReason === 'policy_denied') errorDiagnostics.approvalPolicyBlockedCount += 1
      if (denyReason === 'user_denied') errorDiagnostics.approvalUserDeniedCount += 1
      if (denyReason === 'timeout') errorDiagnostics.approvalTimeoutCount += 1
    }
    let runCommandPolicyActivityMeta = approvalOutcome?.runCommandPolicyActivityMeta
      && typeof approvalOutcome.runCommandPolicyActivityMeta === 'object'
      ? approvalOutcome.runCommandPolicyActivityMeta
      : {}
    const browserActionPolicyActivityMeta = approvalOutcome?.browserActionPolicyActivityMeta
      && typeof approvalOutcome.browserActionPolicyActivityMeta === 'object'
      ? approvalOutcome.browserActionPolicyActivityMeta
      : {}
    const approvalEffectiveCommandSafety = approvalOutcome?.approvalEffectiveCommandSafety
    const approvalCommandSafetyOverride = approvalOutcome?.approvalCommandSafetyOverride
    hostFullAccessApprovedForTurn = approvalOutcome?.hostFullAccessApprovedForTurn === true
      ? true
      : hostFullAccessApprovedForTurn

    let result
    let isError = false
    let missingDependencySuspected = false
    let writeArtifactMeta = null
    let writeArtifactChanges = []
    let shellWriteDiagnostics = null

    if (decision === 'approved') {
      sendTurnState(isFileMutationTool(tc.name) ? 'applying_artifact' : 'running_tool', {
        status: isFileMutationTool(tc.name) ? 'applying_artifact' : 'running_tool',
        label: isFileMutationTool(tc.name) ? 'applying artifact' : 'running tool',
        stepId,
        sequence: stepSequence,
        startedAt: stepStartedAt,
        toolName: tc.name,
      })
      const executingPayload = {
        threadId: activeThreadId,
        turnId: activeTurnId,
        stepId,
        sequence: stepSequence,
        startedAt: stepStartedAt,
        toolName: tc.name,
        toolInput: toolEventInput,
        ...runCommandPolicyActivityMeta,
        ...browserActionPolicyActivityMeta,
      }
      commitProjectedTimelineEvent({
        persistTimelineEvent, send, kind: 'tool_executing',
        options: {
          role: 'assistant',
          content: `Running: ${tc.name}`,
          meta: executingPayload,
        },
        channel: 'chat:tool-executing', payload: executingPayload,
      })
      try {
        const executionOutcome = await executeApprovedToolStep({
          tc,
          toolInput,
          mode,
          providerId,
          apiKey,
          providerRuntimeSettings,
          providerToolExecutionContext,
          toolExecutionMap,
          projectFolder,
          permissionMode: effectivePermissionMode,
          activeThreadId,
          activeTurnId,
          loop,
          approvalEffectiveCommandSafety,
          approvalCommandSafetyOverride,
          fileSystemHostFullAccess: approvalOutcome?.fileSystemHostFullAccess === true,
          applyPreviewContent,
          moaRoles,
          moaPolicy,
          getApiKey,
          getCachedCapabilities,
          send,
          stepId,
          stepSequence,
          stepStartedAt,
          helpers: {
            takeShellWriteSnapshot,
            detectShellWriteArtifactChanges,
            executeOpenAILocalRuntimeTool,
            isOpenAILocalRuntimeToolName,
            executeTool,
            executeProviderNativeToolCall,
            resolveToolWriteArtifactMeta,
            getBaseRevisionId,
            buildMissingDependencyInstallHint,
            isAbortError,
          },
        })
        result = executionOutcome.result
        isError = executionOutcome.isError
        missingDependencySuspected = executionOutcome.missingDependencySuspected
        writeArtifactMeta = executionOutcome.writeArtifactMeta
        writeArtifactChanges = executionOutcome.writeArtifactChanges
        shellWriteDiagnostics = executionOutcome.shellWriteDiagnostics
      } catch (err) {
        if (loop.cancelled || isAbortError(err)) break
        throw err
      }
    } else {
      const deniedToolCall = buildDeniedToolCallResult({
        toolName: tc.name,
        denyReason,
        approvalPolicy,
      })
      result = deniedToolCall.result
      isError = deniedToolCall.isError
    }

    if (tc.name === 'run_command' && runCommandPolicyActivityMeta?.runCommandPolicy) {
      const sandboxFallbackReason = extractPrefixedMetaFromResultText(result, 'sandbox_fallback_reason')
      const sandboxBackend = extractPrefixedMetaFromResultText(result, 'sandbox_backend')
      const runCommandPolicy = runCommandPolicyActivityMeta.runCommandPolicy
        && typeof runCommandPolicyActivityMeta.runCommandPolicy === 'object'
        ? runCommandPolicyActivityMeta.runCommandPolicy
        : {}
      runCommandPolicyActivityMeta = {
        ...runCommandPolicyActivityMeta,
        runCommandPolicy: {
          ...runCommandPolicy,
          ...(sandboxFallbackReason ? { sandboxFallbackReason } : {}),
          ...(sandboxBackend
            ? {
              sandbox: {
                ...(runCommandPolicy.sandbox && typeof runCommandPolicy.sandbox === 'object'
                  ? runCommandPolicy.sandbox
                  : {}),
                backend: sandboxBackend,
              },
            }
            : {}),
        },
      }
    }

    const stepFinishedAt = Date.now()
    const durationMs = Math.max(0, stepFinishedAt - stepStartedAt)
    recordToolStepOutcome({
      turnToolResults,
      history,
      send,
      persistTimelineEvent,
      buildToolResultMessage,
      trimText,
      extractRunCommandMeta,
      approvalId,
      tc,
      toolInput,
      toolEventInput,
      result,
      isError,
      decision,
      denyReason,
      missingDependencySuspected,
      stepId,
      sequence: stepSequence,
      startedAt: stepStartedAt,
      finishedAt: stepFinishedAt,
      durationMs,
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId,
      model: model ?? '',
      promptBudgetProfile,
      errorDiagnostics,
      runCommandPolicyActivityMeta,
      browserActionPolicyActivityMeta,
      writeArtifactMeta,
      writeArtifactChanges,
      shellWriteDiagnostics,
    })
    executedToolCallCount += 1
    const latestOutcome = turnToolResults[turnToolResults.length - 1] || {}
    recordToolWorkflowOutcome(errorDiagnostics, {
      toolName: tc.name,
      decision,
      isError,
      failureClass: latestOutcome.failureClass || '',
      rerouteToolName: latestOutcome.rerouteToolName || '',
      writeArtifactChanges,
      shellWriteDiagnostics,
      turnStartedAt,
      finishedAt: stepFinishedAt,
    })
    recordInspectedPathForTurn({
      toolName: tc.name,
      toolInput,
      decision,
      isError,
      inspectedPaths: inspectedFilePathsThisTurn,
    })
    if (decision === 'approved' && !isError) {
      const normalizedToolName = String(tc?.name || '').trim().toLowerCase()
      if (normalizedToolName === 'read_file' || normalizedToolName === 'view_file_range') {
        blockedToolNames.delete('edit_file')
        blockedToolStates.delete('edit_file')
      }
    }
    if (denyReason === 'renderer_unavailable') {
      loop.cancelled = true
      loop.cancelReason = APPROVAL_RENDERER_UNAVAILABLE_MESSAGE
      shouldBreakRoundLoop = true
      break
    }
    if (tc.name === 'question_user' && decision === 'approved' && !isError) {
      const resolvedQuestionResult = result && typeof result === 'object'
        ? result
        : (toolInput && typeof toolInput === 'object' ? toolInput : {})
      const normalizedQuestionUser = normalizeQuestionUserRequest(resolvedQuestionResult)
      questionUserRequest = {
        ...(normalizedQuestionUser || {}),
        originMode: mode,
        assistantText: buildQuestionUserAssistantText(resolvedQuestionResult),
      }
      shouldBreakRoundLoop = true
      break
    }
  }

  if (Array.isArray(pendingSynthesisMessages) && pendingSynthesisMessages.length > 0) {
    history.push(...pendingSynthesisMessages)
  } else if (pendingSynthesisPrompt) {
    history.push({ role: 'system', content: pendingSynthesisPrompt })
  }
  if (loop.cancelled) {
    return {
      stepSequence,
      consecutiveErrorRounds,
      hostFullAccessApprovedForTurn,
      moaPreflightRepairRetryUsed,
      moaPendingPreflightRepairRetryAttempt,
      questionUserRequest,
      shouldBreakRoundLoop: true,
    }
  }
  const roundResults = executedToolCallCount > 0 ? turnToolResults.slice(-executedToolCallCount) : []
  consecutiveErrorRounds = updateToolBatchFailureState({
    roundResults, loop, consecutiveErrorRounds, maxConsecutiveErrorRounds,
    moaSpecializedContinuationPromptInjectedThisRound, errorDiagnostics, history, buildToolRecoveryPrompt,
  })

  if (consecutiveErrorRounds >= maxConsecutiveErrorRounds) {
    stopAfterConsecutiveToolErrors({
      maxConsecutiveErrorRounds, turnReasoningSegments, send, sendTurnState,
      persistTimelineEvent, commitFailureTurn: helpers.commitFailureTurn,
      emitTurnRuntimeDiagnostics, activeThreadId, activeTurnId,
    })
    shouldBreakRoundLoop = true
  }

  return {
    stepSequence,
    consecutiveErrorRounds,
    hostFullAccessApprovedForTurn,
    moaPreflightRepairRetryUsed,
    moaPendingPreflightRepairRetryAttempt,
    questionUserRequest,
    shouldBreakRoundLoop,
  }
}

export { runRequiredAgentDelegationBeforeRoot } from './required-agent-delegation.mjs'

export async function runStreamRounds({
  loop, sender = null, wid = 0, settings = null,
  history = [], rollingUsage = {}, userMessage = '', mode = '',
  permissionMode = 'ask', projectFolder = '', providerId = '', model = '',
  adapterProfile = null, promptBudgetProfile = null, apiKey = '',
  options = {}, tools = {}, activeToolDefinitions = {},
  moaRoles = [],
  moaPolicy = null,
  moaBudgetPolicy = null,
  agentSettings = null,
  modelContext = {},
  continuityRuntime = null,
  providerRuntimeSettings = null,
  activeProjectId = '',
  activeThreadId = '',
  activeTurnId = '',
  activeAssistantMessageId = '',
  openaiHostedToolIds = [],
  providerToolExecutionContext = null,
  toolExecutionMap = {},
  assistantFinalPhase = '',
  assistantCommentaryPhase = '',
  memoryCompressionEnabled = false,
  memoryCompressionThreshold = 0,
  memoryCompressionCooldownMs = 0,
  memoryCompressionMaxPerHour = 0,
  memoryCompressionMinNewLogs = 0,
  repeatedToolCallState = null,
  errorDiagnostics = {},
  turnStartedAt = 0,
  turnOptions = {},
  send = () => {},
  sendCancelled = () => {},
  sendNotice = () => {},
  sendTurnState = () => {},
  persistTimelineEvent = () => {},
  emitTurnRuntimeDiagnostics = () => {},
  requestFanoutConfirmation = () => Promise.resolve(null),
  turnToolResults = [],
  turnReasoningSegments = [],
  maxToolRounds = 40,
  maxConsecutiveErrorRounds = 3,
  maxConsecutiveIdenticalToolRounds = 3,
  helpers = {},
} = {}) {
  let round = 0
  let stepSequence = 0
  let consecutiveErrorRounds = 0
  const inspectedFilePathsThisTurn = new Set()
  let hostFullAccessApprovedForTurn = false
  let latestOpenAICompactionId = ''
  let moaPreflightRepairRetryUsed = false
  let moaPendingPreflightRepairRetryAttempt = false
  let questionUserRequest = null
  const moaRetryState = createMoaRetryState()
  const requiredDelegationOutcome = await runRequiredAgentDelegationBeforeRoot({
    requiredAgentDelegation: turnOptions?.requiredAgentDelegation,
    orchestratorIntent: turnOptions?.orchestratorIntent,
    delegationSelectionIntent: turnOptions?.delegationSelectionIntent,
    history, loop, projectFolder, moaRoles, moaPolicy, moaBudgetPolicy, agentSettings, providerRuntimeSettings,
    activeThreadId, activeTurnId, activeAssistantMessageId, turnToolResults,
    send, persistTimelineEvent, requestFanoutConfirmation, moaRetryState,
    orchestratorProviderId: providerId,
    orchestratorModel: model ?? '',
    assistantCommentaryPhase, activeToolDefinitions, toolExecutionMap, stepSequence, helpers,
  })
  stepSequence = requiredDelegationOutcome.stepSequence

  while (round < maxToolRounds) {
    if (loop.cancelled) break
    round += 1
    errorDiagnostics.round = round

    const roundState = await runSingleStreamRound({
      round,
      loop,
      sender,
      wid,
      settings,
      history,
      rollingUsage,
      userMessage,
      mode,
      permissionMode,
      projectFolder,
      providerId,
      model: model ?? '',
      adapterProfile,
      promptBudgetProfile,
      apiKey,
      options,
      tools,
      activeToolDefinitions,
      moaRoles,
      moaPolicy,
      moaBudgetPolicy,
      agentSettings,
      modelContext,
      continuityRuntime,
      providerRuntimeSettings,
      activeProjectId,
      activeThreadId,
      activeTurnId,
      activeAssistantMessageId,
      openaiHostedToolIds,
      providerToolExecutionContext,
      toolExecutionMap,
      assistantFinalPhase,
      assistantCommentaryPhase,
      memoryCompressionEnabled,
      memoryCompressionThreshold,
      memoryCompressionCooldownMs,
      memoryCompressionMaxPerHour,
      memoryCompressionMinNewLogs,
      repeatedToolCallState,
      errorDiagnostics,
      turnStartedAt,
      turnOptions,
      send,
      sendNotice,
      sendTurnState,
      persistTimelineEvent,
      emitTurnRuntimeDiagnostics,
      requestFanoutConfirmation,
      turnToolResults,
      turnReasoningSegments,
      maxConsecutiveIdenticalToolRounds,
      maxConsecutiveErrorRounds,
      stepSequence,
      consecutiveErrorRounds,
      inspectedFilePathsThisTurn,
      hostFullAccessApprovedForTurn,
      latestOpenAICompactionId,
      moaPreflightRepairRetryUsed,
      moaPendingPreflightRepairRetryAttempt,
      moaRetryState,
      helpers,
    })
    latestOpenAICompactionId = roundState.latestOpenAICompactionId
    stepSequence = roundState.stepSequence
    consecutiveErrorRounds = roundState.consecutiveErrorRounds
    hostFullAccessApprovedForTurn = roundState.hostFullAccessApprovedForTurn
    moaPreflightRepairRetryUsed = roundState.moaPreflightRepairRetryUsed
    moaPendingPreflightRepairRetryAttempt = roundState.moaPendingPreflightRepairRetryAttempt
    questionUserRequest = roundState.questionUserRequest || questionUserRequest
    if (roundState.shouldBreakRoundLoop) break
  }

  if (loop.cancelled) {
    emitTurnRuntimeDiagnostics({
      terminalState: 'cancelled',
      terminalReason: loop.cancelReason || 'Stop requested. Stopping after current action.',
    })
    sendCancelled(loop.cancelReason || 'Stop requested. Stopping after current action.')
  } else if (questionUserRequest?.assistantText) {
    finalizeQuestionUserRound({
      helpers, send, persistTimelineEvent, sendTurnState, continuityRuntime,
      projectFolder, userMessage, questionUserRequest, turnReasoningSegments, turnToolResults,
      mode, memoryCompressionEnabled, memoryCompressionThreshold, memoryCompressionCooldownMs,
      memoryCompressionMaxPerHour, memoryCompressionMinNewLogs, providerId, apiKey,
      model: model ?? '', loop, activeThreadId, activeTurnId, activeAssistantMessageId, round, assistantFinalPhase,
    })
  } else if (round >= maxToolRounds) {
    stopAfterMaxToolRounds({
      maxToolRounds, turnReasoningSegments, send, sendTurnState,
      persistTimelineEvent, commitFailureTurn: helpers.commitFailureTurn,
      emitTurnRuntimeDiagnostics, activeThreadId, activeTurnId,
    })
  }
}
