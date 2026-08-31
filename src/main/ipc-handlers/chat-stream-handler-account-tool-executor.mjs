import { buildToolResultMessage } from '../api-clients/ai-provider.mjs'
import { executeTool } from '../tools/fs-tools.mjs'
import { buildMissingDependencyInstallHint } from '../chat/chat-error-hints.mjs'
import { recordToolWorkflowOutcome } from '../chat/chat-runtime-diagnostics.mjs'
import { toToolEventInput, trimText, extractRunCommandMeta } from '../chat/tool-event-mapper.mjs'
import { runDelegationToolCall } from '../chat/moa-tool-flow.mjs'
import { recordToolStepOutcome } from '../chat/chat-turn-events.mjs'
import { commitProjectedTimelineEvent } from '../chat/canonical-root-event-writer.mjs'
import {
  recordInspectedPathForTurn,
  shouldBlockEditFileWithoutInspection,
} from '../chat/edit-file-context-guard.mjs'
import {
  resolveToolWriteArtifactMeta,
  detectShellWriteArtifactChanges,
  takeShellWriteSnapshot,
  getBaseRevisionId,
} from '../chat/chat-tool-step.mjs'
import { executeApprovedToolStep } from '../chat/chat-stream-tool-execution.mjs'
import { resolveToolApprovalForStep } from '../chat/chat-tool-approval.mjs'
import { isAbortError } from '../chat/chat-stream-guards.mjs'
import {
  executeOpenAILocalRuntimeTool,
  isOpenAILocalRuntimeToolName,
} from '../api-clients/openai-local-runtime-tools.mjs'
import { executeProviderNativeToolCall } from '../api-clients/provider-native-tool-runtime.mjs'
import { resolveModeCapability } from '../chat/turn-mode.mjs'

export function createOpenAIAccountDynamicToolExecutor({
  providerId = '',
  model = '',
  authMethod = '',
  mode = 'execute',
  activeToolNames = [],
  apiKey = '',
  providerRuntimeSettings = null,
  runtimeToolSurface = {},
  resolvedToolSurface = {},
  permissionMode = '',
  activeThreadId = '',
  activeTurnId = '',
  activeAssistantMessageId = '',
  turnStartedAt = 0,
  effectiveProjectFolder = '',
  loop = null,
  sender = null,
  wid = '',
  settings = {},
  moaRoles = [],
  moaPolicy = null,
  moaBudgetPolicy = null,
  agentSettings = null,
  orchestratorIntent = '',
  delegationSelectionIntent = '',
  getProviderRuntimeApiKey = () => '',
  getCachedModelCapabilities = null,
  requestFanoutConfirmation = () => null,
  history = [],
  turnToolResults = [],
  errorDiagnostics = null,
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const normalizedAuthMethod = String(authMethod || '').trim().toLowerCase()
  const normalizedMode = String(mode || '').trim().toLowerCase() || 'execute'
  if (
    normalizedProviderId !== 'openai'
    || normalizedAuthMethod !== 'account'
    || !Array.isArray(activeToolNames)
  ) {
    return null
  }

  const activeToolNameSet = new Set(
    activeToolNames.map((name) => String(name || '').trim()).filter(Boolean),
  )
  let accountDynamicToolSequence = 0
  let accountHostFullAccessApprovedForTurn = false
  const accountInspectedPathsThisTurn = new Set()
  const recordAccountToolWorkflowOutcome = ({
    toolName = '',
    decision = '',
    isError = false,
    writeArtifactChanges = [],
    shellWriteDiagnostics = null,
    finishedAt = 0,
  } = {}) => {
    const latestOutcome = turnToolResults[turnToolResults.length - 1] || {}
    recordToolWorkflowOutcome(errorDiagnostics, {
      toolName,
      decision,
      isError,
      failureClass: latestOutcome.failureClass || '',
      rerouteToolName: latestOutcome.rerouteToolName || '',
      writeArtifactChanges,
      shellWriteDiagnostics,
      turnStartedAt,
      finishedAt,
    })
  }

  return async ({ toolName = '', input = {} } = {}) => {
    const normalizedToolName = String(toolName || '').trim()
    const toolInput = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
    if (!normalizedToolName) {
      return {
        result: 'Tool error: Missing tool name.',
        isError: true,
      }
    }
    const modeCapability = resolveModeCapability(normalizedToolName, normalizedMode, {
      backendToolName: resolvedToolSurface.toolExecutionMap?.[normalizedToolName],
      providerToolExecutionContext: runtimeToolSurface.providerToolExecutionContext,
    })
    if (!modeCapability.allowed) {
      return {
        result: `Tool error: ${normalizedToolName} is not allowed in ${normalizedMode} mode.`,
        isError: true,
        reason: modeCapability.reason,
      }
    }
    if (!activeToolNameSet.has(normalizedToolName)) {
      return {
        result: `Tool error: ${normalizedToolName} is not available for this turn.`,
        isError: true,
        reason: 'capability_unavailable',
      }
    }

    const tc = {
      id: `account_tool_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      name: normalizedToolName,
      input: toolInput,
    }
    const toolEventInput = toToolEventInput(tc.name, toolInput)
    accountDynamicToolSequence += 1
    const stepSequence = accountDynamicToolSequence
    const stepId = `${activeTurnId}:account-tool:${stepSequence}`
    const stepStartedAt = Date.now()
    const executionToolName = String(
      resolvedToolSurface.toolExecutionMap?.[normalizedToolName]
      || normalizedToolName,
    ).trim()

    if (executionToolName === 'delegate_to_agents') {
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
        projectFolder: effectiveProjectFolder,
        loop,
        moaRoles,
        moaPolicy,
        moaBudgetPolicy,
        agentSettings,
        getApiKey: getProviderRuntimeApiKey,
        getCachedCapabilities: getCachedModelCapabilities,
        requestFanoutConfirmation,
        history,
        turnToolResults,
        send,
        persistTimelineEvent,
        providerRuntimeSettings,
        orchestratorIntent,
        delegationSelectionIntent,
      })
      if (delegationOutcome?.handled) {
        return {
          result: delegationOutcome.toolResult || 'Delegation completed.',
          isError: delegationOutcome.toolIsError === true,
        }
      }
    }

    const executingPayload = {
      threadId: activeThreadId,
      turnId: activeTurnId,
      stepId,
      sequence: stepSequence,
      startedAt: stepStartedAt,
      toolName: tc.name,
      toolInput: toolEventInput,
    }
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'tool_executing',
      options: {
        role: 'assistant',
        content: `Executing ${tc.name}.`,
        meta: executingPayload,
      },
      channel: 'chat:tool-executing', payload: executingPayload,
    })

    const editGuard = shouldBlockEditFileWithoutInspection({
      toolName: tc.name,
      toolInput,
      inspectedPaths: accountInspectedPathsThisTurn,
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
        promptBudgetProfile: resolvedToolSurface.promptBudgetProfile,
        errorDiagnostics,
      })
      recordAccountToolWorkflowOutcome({
        toolName: tc.name,
        decision: 'approved',
        isError: true,
        finishedAt: stepFinishedAt,
      })
      return { result: editGuard.message, isError: true }
    }

    const approval = await resolveToolApprovalForStep({
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
      projectFolder: effectiveProjectFolder,
      loop,
      settings,
      hostFullAccessApprovedForTurn: accountHostFullAccessApprovedForTurn,
      send,
      persistTimelineEvent,
    })
    accountHostFullAccessApprovedForTurn = approval.hostFullAccessApprovedForTurn === true

    if (approval.cancelled || approval.decision !== 'approved') {
      const stepFinishedAt = Date.now()
      const durationMs = Math.max(0, stepFinishedAt - stepStartedAt)
      const result = approval.cancelled
        ? 'Tool error: Approval was interrupted before the tool could run.'
        : (
          approval.denyReason === 'policy_denied'
            ? `Tool error: ${tc.name} was blocked by policy.`
            : `Tool error: ${tc.name} was not approved.`
        )
      recordToolStepOutcome({
        turnToolResults,
        history,
        send,
        persistTimelineEvent,
        buildToolResultMessage,
        trimText,
        extractRunCommandMeta,
        approvalId: approval.approvalId,
        tc,
        toolInput,
        toolEventInput,
        result,
        isError: true,
        decision: approval.decision || 'denied',
        denyReason: approval.denyReason || (approval.cancelled ? 'cancelled' : 'user_denied'),
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
        promptBudgetProfile: resolvedToolSurface.promptBudgetProfile,
        errorDiagnostics,
        runCommandPolicyActivityMeta: approval.runCommandPolicyActivityMeta,
        browserActionPolicyActivityMeta: approval.browserActionPolicyActivityMeta,
      })
      recordAccountToolWorkflowOutcome({
        toolName: tc.name,
        decision: approval.decision || 'denied',
        isError: true,
        finishedAt: stepFinishedAt,
      })
      return { result, isError: true }
    }

    const execution = await executeApprovedToolStep({
      tc,
      toolInput,
      mode: normalizedMode,
      toolExecutionMap: resolvedToolSurface.toolExecutionMap,
      providerId,
      apiKey,
      providerRuntimeSettings,
      providerToolExecutionContext: runtimeToolSurface.providerToolExecutionContext,
      projectFolder: effectiveProjectFolder,
      permissionMode,
      activeThreadId,
      activeTurnId,
      loop,
      approvalEffectiveCommandSafety: approval.approvalEffectiveCommandSafety,
      approvalCommandSafetyOverride: approval.approvalCommandSafetyOverride,
      fileSystemHostFullAccess: approval.fileSystemHostFullAccess === true,
      moaRoles,
      moaPolicy,
      getApiKey: getProviderRuntimeApiKey,
      getCachedCapabilities: getCachedModelCapabilities,
      applyPreviewContent: approval.applyPreviewContent,
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
        buildMissingDependencyInstallHint,
        isAbortError,
        getBaseRevisionId,
      },
    })

    recordInspectedPathForTurn({
      toolName: tc.name,
      toolInput,
      decision: 'approved',
      isError: execution.isError,
      inspectedPaths: accountInspectedPathsThisTurn,
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
      approvalId: approval.approvalId,
      tc,
      toolInput,
      toolEventInput,
      result: execution.result,
      isError: execution.isError,
      decision: 'approved',
      denyReason: '',
      missingDependencySuspected: execution.missingDependencySuspected,
      stepId,
      sequence: stepSequence,
      startedAt: stepStartedAt,
      finishedAt: stepFinishedAt,
      durationMs,
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId,
      model: model ?? '',
      promptBudgetProfile: resolvedToolSurface.promptBudgetProfile,
      errorDiagnostics,
      writeArtifactMeta: execution.writeArtifactMeta,
      writeArtifactChanges: execution.writeArtifactChanges,
      shellWriteDiagnostics: execution.shellWriteDiagnostics,
      lintResult: execution.lintResult,
      runCommandPolicyActivityMeta: approval.runCommandPolicyActivityMeta,
      browserActionPolicyActivityMeta: approval.browserActionPolicyActivityMeta,
      terminalSessionActivityMeta: execution.terminalSessionActivityMeta,
    })
    recordAccountToolWorkflowOutcome({
      toolName: tc.name,
      decision: 'approved',
      isError: execution.isError,
      writeArtifactChanges: execution.writeArtifactChanges,
      shellWriteDiagnostics: execution.shellWriteDiagnostics,
      finishedAt: stepFinishedAt,
    })
    return {
      result: execution.result,
      isError: execution.isError,
    }
  }
}
