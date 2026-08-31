import { ipcMain } from 'electron'
import * as vault from '../vault.mjs'
import {
  createStreamWithTools,
  getCachedModelCapabilities,
  buildAssistantToolUseMessage,
  buildToolResultMessage,
  prepareOpenAIBackgroundTurn,
} from '../api-clients/ai-provider.mjs'
import { listOpenAIProjectVectorStoreIds } from '../api-clients/openai-asset-service.mjs'
import { finalizeOpenAIBackgroundJob } from '../api-clients/openai-background-job-store.mjs'
import { resolveOpenAIThreadContinuation, upsertOpenAIThreadState } from '../api-clients/openai-thread-state-service.mjs'
import { createOpenAIBackgroundJob } from '../api-clients/openai-background-jobs.mjs'
import { updateOpenAIContinuationContext, resolveOpenAIContinuationPersistence } from '../api-clients/openai-continuation-context.mjs'
import { executeOpenAILocalRuntimeTool, isOpenAILocalRuntimeToolName } from '../api-clients/openai-local-runtime-tools.mjs'
import { executeTool } from '../tools/fs-tools.mjs'
import { toAISDKTools } from '../tools/tool-definitions.mjs'
import { getSettings } from '../settings.mjs'
import { normalizeChatMode, resolveTurnTools } from '../chat/turn-mode.mjs'
import { compactHistoryForContextWindow, estimateHistoryTokens } from '../chat/context-compaction.mjs'
import { buildPreCallContinuityInput } from '../chat/precall-continuity-input.mjs'
import { resolveWorkspaceProjectPath, touchProjectUsageByThread } from '../workspace/workspace-store.mjs'
import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import { normalizeCompressionThreshold, normalizeCompressionCooldownMs, normalizeCompressionMaxPerHour, normalizeCompressionMinNewLogs } from '../chat/memory-config.mjs'
import { buildMissingDependencyInstallHint } from '../chat/chat-error-hints.mjs'
import { toToolEventInput, trimText, asTokenCount, extractRunCommandMeta } from '../chat/tool-event-mapper.mjs'
import { runDelegationToolCall } from '../chat/moa-tool-flow.mjs'
import { resolveDelegationRuntimeSettings, resolveDelegationTurnPolicy } from '../chat/delegation-turn-policy.mjs'
import { resolveDelegationTurnContext } from '../chat/delegation-turn-intent.mjs'
import { createTurnLifecycle } from '../chat/turn-lifecycle.mjs'
import { requestAgentFanoutConfirmation } from '../chat/fanout-confirmation.mjs'
import { buildToolRecoveryPrompt } from '../chat/tool-recovery-prompt.mjs'
import { recordInspectedPathForTurn, shouldBlockEditFileWithoutInspection } from '../chat/edit-file-context-guard.mjs'
import { buildChatUsagePayload } from '../chat/chat-usage-payload.mjs'
import { resolveRuntimeToolSurface } from '../chat/runtime-tool-surface.mjs'
import { runPostTurnTasks } from '../chat/chat-post-turn-tasks.mjs'
import { runStreamRounds } from '../chat/chat-stream-rounds.mjs'
import { buildLoopKey, createLoopState } from '../chat/chat-turn-state.mjs'
import { resolveModelCapabilitiesWithTimeout } from '../chat/chat-capability-probe.mjs'
import { resolveToolWriteArtifactMeta, detectShellWriteArtifactChanges, takeShellWriteSnapshot, getBaseRevisionId } from '../chat/chat-tool-step.mjs'
import {
  applyCompactionIfNeeded,
  emitReasoningDone,
  emitUsageEvent,
  finalizeRoundWithoutTools,
  recordToolStepOutcome,
} from '../chat/chat-turn-events.mjs'
import { getCachedTerminalSessionRuntimeHealth } from '../chat/terminal-session-events.mjs'
import { resolveToolApprovalForStep } from '../chat/chat-tool-approval.mjs'
import { isAbortError, getChatStreamPrereqFailure } from '../chat/chat-stream-guards.mjs'
import { emitStreamFailure } from '../chat/chat-stream-error-output.mjs'
import { isToolsUnsupportedError } from '../api-clients/ai-provider-stream-utils.mjs'
import { buildToolWorkflowTelemetryPayload, resolveWorkspaceTrust } from '../chat/chat-runtime-diagnostics.mjs'
import { resolveProviderModelAdapter } from '../api-clients/provider-model-adapters.mjs'
import { resolveOpenAIModelRuntimeSupport } from '../api-clients/openai-model-runtime-support.mjs'
import { resolveOpenAIAuthParityReport } from '../api-clients/openai-account-capability-contract.mjs'
import { executeProviderNativeToolCall } from '../api-clients/provider-native-tool-runtime.mjs'
import { recordRepeatedToolCallBatch } from '../chat/repeated-tool-call-guard.mjs'
import { resolveOpenAIExecutionAuth } from '../openai-account/openai-execution-auth.mjs'
import { getOpenAIAccountAuthService } from '../openai-account/openai-account-auth-service.mjs'
import { resolveLearnedBudgetProfileWithRuntimeDiagnostics, withOpenAIAccountNativeCollaborationMode } from './chat-stream-handler-adaptive-budget.mjs'
import { buildChatStreamRoundContext } from './chat-stream-handler-round-context.mjs'
import {
  bumpRuntimeCount,
  applyResolvedToolSurfaceDiagnostics,
  applyToolCapabilityDiagnostics,
  createChatStreamDelivery,
  createChatStreamErrorDiagnostics,
  detectTextualApprovalRequestWithoutToolCall,
  extractPrefixedMetaFromResultText,
  normalizeChatTurnOptions, handleCursorAgentProviderTurn,
  pushUniqueRuntimeValue,
  resolveEffectiveTurnUserMessage,
  resolvePreviousThreadRuntimeContext,
} from './chat-stream-handler-helpers.mjs'
import { createOpenAIAccountDynamicToolExecutor } from './chat-stream-handler-account-tool-executor.mjs'
import { createRuntimeDiagnosticsEmitter } from './chat-stream-handler-runtime-diagnostics.mjs'
import { failPendingPlanDirectionAction } from './chat-stream-plan-action.mjs'
import { safeDebug } from '../utils/safe-console.mjs'
const MAX_TOOL_ROUNDS = 40, MAX_CONSECUTIVE_ERROR_ROUNDS = 3, MAX_CONSECUTIVE_IDENTICAL_TOOL_ROUNDS = 3
export async function handleChatStream(event, payload = {}, runRegistry) {
    const {
      providerId,
      model,
      messages,
      projectFolder,
      projectId,
      threadId,
      turnId,
      currentUserMessage,
      assistantMessageId,
      turnOptions: rawTurnOptions,
    } = payload
    const wid = event.sender.id
    const settings = getSettings()
    const mode = normalizeChatMode(payload.mode)
    const permissionMode = normalizePermissionMode(payload.permissionMode || settings.permissionMode)
    const { moaRoles, moaPolicy, moaBudgetPolicy, agentSettings } = resolveDelegationRuntimeSettings(settings)
    const memoryCompressionEnabled = typeof payload.memoryCompressionEnabled === 'boolean'
      ? payload.memoryCompressionEnabled
      : settings.memoryCompressionEnabled
    const memoryCompressionThreshold = normalizeCompressionThreshold(payload.memoryCompressionThreshold, settings.memoryCompressionThreshold)
    const memoryCompressionCooldownMs = normalizeCompressionCooldownMs(payload.memoryCompressionCooldownMs, settings.memoryCompressionCooldownMs ?? 120_000)
    const memoryCompressionMaxPerHour = normalizeCompressionMaxPerHour(payload.memoryCompressionMaxPerHour, settings.memoryCompressionMaxPerHour ?? 4)
    const memoryCompressionMinNewLogs = normalizeCompressionMinNewLogs(payload.memoryCompressionMinNewLogs, settings.memoryCompressionMinNewLogs ?? 12)
    const includeGlobalMemoryInContext = !!(
      typeof payload.includeGlobalMemoryInContext === 'boolean'
        ? payload.includeGlobalMemoryInContext
        : settings.includeGlobalMemoryInContext
    )
    const providerRuntimeSettings = settings.providerRuntimeSettings && typeof settings.providerRuntimeSettings === 'object'
      ? settings.providerRuntimeSettings
      : null
    const activeProjectId = String(projectId ?? '').trim()
    const activeThreadId = String(threadId ?? '').trim()
    const requestedProjectFolder = String(projectFolder ?? '').trim()
    const authoritativeProjectFolder = resolveWorkspaceProjectPath({
      projectId: activeProjectId,
      threadId: activeThreadId,
    })
    const effectiveProjectFolder = authoritativeProjectFolder || requestedProjectFolder
    const activeTurnId = String(turnId ?? '').trim() || `turn_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
    const activeAssistantMessageId = String(assistantMessageId ?? '').trim()
    const turnOptions = normalizeChatTurnOptions(rawTurnOptions)
    const planAction = turnOptions?.planAction || null
    const disableToolsForCommand = turnOptions?.command?.disableTools === true
    const turnStartedAt = Date.now()
    const persistedPermissionMode = normalizePermissionMode(settings.permissionMode)
    const requestedPermissionMode = Object.prototype.hasOwnProperty.call(payload, 'permissionMode')
      ? normalizePermissionMode(payload.permissionMode)
      : ''
    const previousThreadRuntimeContext = resolvePreviousThreadRuntimeContext(activeThreadId)
    let adapterProfile = resolveProviderModelAdapter(providerId, model ?? '')
    const workspaceDiagnostics = resolveWorkspaceTrust(effectiveProjectFolder, settings.commandSafety)
    const loopKey = buildLoopKey(wid, activeThreadId)
    const loop = createLoopState({
      activeProjectId,
      activeThreadId,
      activeTurnId,
      windowId: String(wid),
      loopKey,
      providerId,
      model: model ?? '',
      permissionMode,
      abortController: new AbortController(),
    })
    runRegistry.register(loop)
    const _debugThread = settings?.commandSafety?.showDeveloperOptions === true
    if (_debugThread) {
      safeDebug('[thread-session] run:start', { threadId: activeThreadId, turnId: activeTurnId, loopKey, providerId, model: model ?? '', mode })
    }
    const {
      send,
      persistTimelineEvent,
      commitTurnState, commitFinalTurn, commitCancellationTurn, commitFailureTurn,
      createSendNotice,
      failEarly,
    } = createChatStreamDelivery({
      event,
      activeThreadId,
      activeTurnId,
      activeAssistantMessageId,
      activeProjectId, providerId, runtime: String(providerId || ''),
      loop,
      suppressAssistantFinal: Boolean(planAction),
    })
    const { sendTurnState, sendCancelled } = createTurnLifecycle({
      send,
      persistTimelineEvent,
      commitTurnState,
      commitCancellationTurn,
      loop,
      threadId: activeThreadId, turnId: activeTurnId,
      mode,
    })
    const requestFanoutConfirmation = (requestPayload = {}) => requestAgentFanoutConfirmation({
      ipcMain,
      senderId: wid,
      send,
      threadId: activeThreadId,
      turnId: activeTurnId,
      requestPayload,
      abortSignal: loop.abortController.signal,
    })
    const errorDiagnostics = createChatStreamErrorDiagnostics({
      providerId,
      model,
      mode,
      messages,
      settings,
      permissionMode,
      persistedPermissionMode,
      requestedPermissionMode,
      adapterProfile,
      workspaceDiagnostics,
    })
    loop.errorDiagnostics = errorDiagnostics
    const sendNotice = createSendNotice({ errorDiagnostics })
    if (previousThreadRuntimeContext?.providerId && previousThreadRuntimeContext.providerId !== String(providerId || '').trim().toLowerCase()) {
      pushUniqueRuntimeValue(errorDiagnostics.surfacePolicyReresolution, 'provider_changed')
    }
    if (previousThreadRuntimeContext?.model && previousThreadRuntimeContext.model !== String(model || '').trim()) {
      pushUniqueRuntimeValue(errorDiagnostics.surfacePolicyReresolution, 'model_changed')
    }
    if (previousThreadRuntimeContext?.projectId && previousThreadRuntimeContext.projectId !== activeProjectId) {
      pushUniqueRuntimeValue(errorDiagnostics.surfacePolicyReresolution, 'workspace_changed')
    }
    const repeatedToolCallState = {
      lastSignature: '',
      repeatedCount: 0,
    }
    const emitTurnRuntimeDiagnostics = createRuntimeDiagnosticsEmitter({
      errorDiagnostics,
      getAdapterProfile: () => adapterProfile,
      activeThreadId,
      activeTurnId,
      send,
      persistTimelineEvent,
    })
    try {
      const normalizedProviderId = String(providerId || '').trim().toLowerCase()
      if (await handleCursorAgentProviderTurn({ payload, mode, permissionMode, activeTurnId, activeAssistantMessageId, authoritativeProjectFolder, loop, send, persistTimelineEvent, commitFinalTurn, sendTurnState, sendCancelled, runPostTurn: ({ userMessage, assistantText, toolResults }) => runPostTurnTasks({ projectFolder: authoritativeProjectFolder, userMessage, assistantText, turnToolResults: toolResults, mode, memoryCompressionEnabled: false, providerId: 'cursor', model: model ?? '', loop, send, persistTimelineEvent, activeThreadId, activeTurnId, isAbortError }) })) return
      const openAIExecutionAuth = normalizedProviderId === 'openai'
        ? resolveOpenAIExecutionAuth({ allowAccountRuntime: true })
        : null
      let effectiveProviderRuntimeSettings = providerRuntimeSettings
      let openAIAccountCollaborationModeId = ''
      const apiKey = normalizedProviderId === 'openai'
        ? String(openAIExecutionAuth?.apiKey || '')
        : (vault.getKey(providerId) ?? '')
      const getProviderRuntimeApiKey = (requestedProviderId = '') => {
        const normalizedRequestedProviderId = String(requestedProviderId || '').trim().toLowerCase()
        if (normalizedRequestedProviderId === 'openai') {
          const openAIAuth = resolveOpenAIExecutionAuth()
          if (openAIAuth?.authMethod === 'account') return ''
        }
        return String(vault.getKey(requestedProviderId) ?? '')
      }
      const isLocal = providerId === 'ollama' || providerId === 'lmstudio'
      adapterProfile = resolveProviderModelAdapter(providerId, model ?? '', {
        apiKeyConfigured: isLocal || !!apiKey || openAIExecutionAuth?.authMethod === 'account',
        authMethod: openAIExecutionAuth?.authMethod || 'api_key',
      })
      errorDiagnostics.authMethod = String(openAIExecutionAuth?.authMethod || '').trim().toLowerCase()
      errorDiagnostics.adapterSelection = adapterProfile.adapterSelection
      errorDiagnostics.adapterReason = adapterProfile.adapterReason
      errorDiagnostics.adapterId = adapterProfile.adapterId
      errorDiagnostics.wireApi = String(adapterProfile?.wireApi || '').trim() || 'ai_sdk_stream_text:unknown'
      errorDiagnostics.availabilityState = String(adapterProfile?.availability?.status || '').trim().toLowerCase()
      errorDiagnostics.availabilitySelectionState = String(adapterProfile?.availability?.selectionState || '').trim().toLowerCase()
      errorDiagnostics.availabilityRequiresKey = adapterProfile?.availability?.requiresKey === true
      errorDiagnostics.availabilityConfigured = typeof adapterProfile?.availability?.configured === 'boolean'
        ? adapterProfile.availability.configured
        : null
      errorDiagnostics.availabilityVerified = adapterProfile?.availability?.verified === true
      errorDiagnostics.availabilityGates = Array.isArray(adapterProfile?.availability?.gates)
        ? adapterProfile.availability.gates
        : []
      errorDiagnostics.providerNativeRuntimeFamily = String(adapterProfile?.providerNativeRuntime?.family || '').trim().toLowerCase()
      errorDiagnostics.providerNativeRuntimeMode = String(adapterProfile?.providerNativeRuntime?.mode || '').trim().toLowerCase()
      const openAIAccountRuntimeSettings = (
        providerRuntimeSettings?.openai
        && typeof providerRuntimeSettings.openai === 'object'
      )
        ? providerRuntimeSettings.openai
        : {}
      if (normalizedProviderId === 'openai' && openAIExecutionAuth?.authMethod === 'account') {
        const accountAutoCompactionTokenLimit = Number(
          openAIAccountRuntimeSettings.codexAutoThreadCompactionTokenLimit || 0
        ) || 0
        errorDiagnostics.accountAutoCompactionEnabled = (
          openAIAccountRuntimeSettings.codexAutoThreadCompactionEnabled === true
        )
        errorDiagnostics.accountAutoCompactionTokenLimit = accountAutoCompactionTokenLimit
        errorDiagnostics.accountAutoCompactionPromptConfigured = String(
          openAIAccountRuntimeSettings.codexAutoThreadCompactionInstructions || ''
        ).trim().length > 0
      }
      if (normalizedProviderId === 'openai' && openAIExecutionAuth?.ok !== true) {
        pushUniqueRuntimeValue(errorDiagnostics.capabilityBlockReasons, String(openAIExecutionAuth?.blockedReason || 'auth_blocked'))
        errorDiagnostics.surfaceResolutionFailure = String(openAIExecutionAuth?.blockedReason || 'auth_blocked')
        errorDiagnostics.failure_reason_code = String(openAIExecutionAuth?.blockedReason || 'auth_blocked')
        errorDiagnostics.failure_diagnostic_message = String(openAIExecutionAuth?.blockedMessage || '')
        errorDiagnostics.failure_message_sanitized = String(
          openAIExecutionAuth?.userFacingBlockedMessage
          || openAIExecutionAuth?.blockedMessage
          || 'OpenAI authentication is unavailable for this runtime path.',
        )
        failEarly(errorDiagnostics.failure_message_sanitized)
        return
      }
      const prereqFailure = getChatStreamPrereqFailure({
        providerId,
        modelId: model ?? '',
        messages,
        apiKey,
        isLocal,
        adapterProfile,
        authMethod: openAIExecutionAuth?.authMethod || '',
        authBlockedReason: openAIExecutionAuth?.blockedReason || '',
        authBlockedMessage: openAIExecutionAuth?.userFacingBlockedMessage || '',
        authBlockedClass: openAIExecutionAuth?.canonicalErrorClass || '',
        authDiagnosticMessage: openAIExecutionAuth?.blockedMessage || '',
      })
      if (prereqFailure) {
        const prereqFailureReason = String(
          prereqFailure.diagnosticReason
          || prereqFailure.reason
          || 'prereq_blocked',
        ).trim() || 'prereq_blocked'
        pushUniqueRuntimeValue(errorDiagnostics.capabilityBlockReasons, prereqFailureReason)
        errorDiagnostics.surfaceResolutionFailure = prereqFailureReason
        errorDiagnostics.failure_reason_code = prereqFailureReason
        errorDiagnostics.failure_diagnostic_message = String(prereqFailure.diagnosticMessage || '')
        errorDiagnostics.failure_message_sanitized = String(prereqFailure.message || '')
        errorDiagnostics.failure_canonical_error_class = String(
          prereqFailure.canonicalErrorClass
          || prereqFailure.errorClass
          || '',
        ).trim().toLowerCase()
        failEarly(prereqFailure.message)
        return
      }
      if (normalizedProviderId === 'openai' && openAIExecutionAuth?.authMethod === 'account') {
        const accountAuthService = getOpenAIAccountAuthService()
        const persistedOpenAIAccountCollaborationModeId = String(
          openAIAccountRuntimeSettings.nativeCollaborationModeId || ''
        ).trim()
        openAIAccountCollaborationModeId = persistedOpenAIAccountCollaborationModeId
          || await accountAuthService?.resolveNativeCollaborationModeId?.()
          || ''
        effectiveProviderRuntimeSettings = withOpenAIAccountNativeCollaborationMode(
          providerRuntimeSettings,
          openAIAccountCollaborationModeId,
        )
        errorDiagnostics.nativeCollaborationModeId = String(openAIAccountCollaborationModeId || '').trim()
      }
      const normalizedModelId = String(model || '').trim().toLowerCase()
      if (normalizedProviderId === 'openai' && normalizedModelId === 'computer-use-preview') {
        failEarly(
          'The OpenAI model "computer-use-preview" is currently disabled in ADDOM while this feature remains unstable. Choose another OpenAI model and retry.',
          { reason: 'computer_use_preview_disabled' },
        )
        return
      }
      const requestedReasoningEffort = String(effectiveProviderRuntimeSettings?.[normalizedProviderId]?.reasoningEffort || '').trim().toLowerCase()
      sendTurnState('started', {
        providerId: String(providerId ?? ''), model: String(model ?? ''), reasoningEffort: requestedReasoningEffort,
      })
      const hasExplicitCurrentUserMessage = Object.prototype.hasOwnProperty.call(payload, 'currentUserMessage')
      const {
        sourceHistoryMessages,
        fallbackUserEntry,
        userMessage,
      } = resolveEffectiveTurnUserMessage({
        currentUserMessage,
        hasExplicitCurrentUserMessage,
        messages,
      })
      const { orchestratorIntent, delegationSelectionIntent, requestedDelegation } = resolveDelegationTurnContext({
        turnOptions, userMessage, history: sourceHistoryMessages,
      })
      const { exposeTools: delegationAvailable, rejectExplicitRequest } = resolveDelegationTurnPolicy({
        providerId, model: model ?? '', mode,
        requestedDelegation,
        agentsEnabled: settings.agentSettings?.enabled !== false,
      })
      if (rejectExplicitRequest) {
        const agentsDisabled = settings.agentSettings?.enabled === false
        const reason = agentsDisabled ? 'agents_disabled' : 'model_delegation_unsupported'
        const message = agentsDisabled
          ? 'Agents are disabled in Settings. Enable Agents and retry.'
          : 'The selected model cannot delegate to Agents. Choose a supported hosted model and retry.'
        return failEarly(message, { reason })
      }
      const terminalSessionRuntimeHealth = disableToolsForCommand
        ? null
        : await getCachedTerminalSessionRuntimeHealth()
      const requestedTools = disableToolsForCommand
        ? {}
        : resolveTurnTools(mode, permissionMode, delegationAvailable, toAISDKTools, {
          includeTerminalSessionTools: terminalSessionRuntimeHealth?.status === 'supported',
        })
      const openAIAccountDynamicToolCatalog = toAISDKTools(permissionMode, true, {
        includeTerminalSessionTools: true,
      })
      const anthropicOrganizationId = String(
        effectiveProviderRuntimeSettings?.anthropic?.organizationId
        || effectiveProviderRuntimeSettings?.organizationId
        || '',
      ).trim()
      const anthropicWorkspaceId = String(
        effectiveProviderRuntimeSettings?.anthropic?.workspaceId
        || effectiveProviderRuntimeSettings?.workspaceId
        || '',
      ).trim()
      const {
        learnedBudgetProfile,
        runtimeDiagnostics: adaptiveBudgetRuntimeDiagnostics,
      } = await resolveLearnedBudgetProfileWithRuntimeDiagnostics({
        providerId,
        apiKey,
        organizationId: anthropicOrganizationId,
        workspaceId: anthropicWorkspaceId,
      })
      let openaiHostedToolIds = []
      let openaiExcludedToolReasons = []
      const runtimeToolSurface = await resolveRuntimeToolSurface({
        providerId,
        modelId: model ?? '',
        mode,
        history: sourceHistoryMessages,
        userMessage,
        apiKey,
        learnedBudgetProfile,
        addomTools: requestedTools,
        disableAllTools: disableToolsForCommand,
        providerRuntimeSettings: effectiveProviderRuntimeSettings,
        vectorStoreIds: listOpenAIProjectVectorStoreIds(activeProjectId),
        includeOpenAILocalRuntimeTools: true,
        adapterProfile,
        abortSignal: loop.abortController.signal,
        terminalSessionRuntimeHealth,
      })
      const resolvedToolSurface = runtimeToolSurface.resolvedToolSurface
      openaiHostedToolIds = runtimeToolSurface.openaiHostedToolIds
      openaiExcludedToolReasons = runtimeToolSurface.openaiExcludedToolReasons
      for (const notice of runtimeToolSurface.notices || []) {
        sendNotice(notice)
      }
      const activeToolDefinitions = {
        ...(resolvedToolSurface.tools || {}),
      }
      applyResolvedToolSurfaceDiagnostics({
        errorDiagnostics,
        resolvedToolSurface,
        adaptiveBudgetRuntimeDiagnostics,
        providerRuntimeSettings,
        effectiveProviderRuntimeSettings,
        openAIAccountCollaborationModeId,
      })
      const requestedToolCount = Object.keys(activeToolDefinitions).length
      errorDiagnostics.requestedToolCount = requestedToolCount
      let modelCapabilities = { supportsTools: null, source: 'unknown' }
      if (requestedToolCount > 0) {
        try {
          modelCapabilities = await resolveModelCapabilitiesWithTimeout({
            providerId,
            apiKey,
            modelId: model ?? '',
            authMethod: openAIExecutionAuth?.authMethod || 'api_key',
            failOnProbeError: true,
            abortSignal: loop.abortController.signal,
          })
        } catch (capabilityError) {
          if (loop.cancelled || loop.abortController?.signal?.aborted || isAbortError(capabilityError)) {
            sendCancelled(loop.cancelReason || 'Cancelled by user.')
            return
          }
          pushUniqueRuntimeValue(errorDiagnostics.capabilityBlockReasons, 'model_capability_probe_failed')
          errorDiagnostics.surfaceResolutionFailure = 'model_capability_probe_failed'
          errorDiagnostics.modelCapabilitiesSource = 'probe_failed'
          errorDiagnostics.failure_reason_code = 'model_capability_probe_failed'
          errorDiagnostics.failure_message_sanitized = String(capabilityError?.message || 'Capability probe failed.')
          errorDiagnostics.next_action_hint = 'Retry after restoring provider capability probing or choose a model with verified tool support.'
          emitTurnRuntimeDiagnostics()
          failEarly(
            `ADDOM could not verify tool support for ${String(providerId || '').trim()}:${String(model || '').trim()}. Tool execution was stopped instead of falling back to estimated capabilities.`,
            { reason: 'model_capability_probe_failed', errorMeta: { failureReasonCode: 'model_capability_probe_failed' } },
          )
          return
        }
      }
      if (normalizedProviderId === 'openai' && openAIExecutionAuth?.authMethod === 'account') {
        const accountRuntimeSupport = adapterProfile?.openaiRuntimeSupport && typeof adapterProfile.openaiRuntimeSupport === 'object'
          ? adapterProfile.openaiRuntimeSupport
          : resolveOpenAIModelRuntimeSupport(model ?? '', { authMethod: 'account' })
        const apiKeyRuntimeSupport = resolveOpenAIModelRuntimeSupport(model ?? '', { authMethod: 'api_key' })
        const parityReport = resolveOpenAIAuthParityReport({
          modelId: model ?? '',
          apiKeySupport: apiKeyRuntimeSupport,
          accountSupport: accountRuntimeSupport,
          contract: accountRuntimeSupport?.accountCapabilityContract || null,
        })
        errorDiagnostics.authMethod = 'account'
        errorDiagnostics.accountRuntimeStatus = String(accountRuntimeSupport?.accountRuntimeStatus || '').trim().toLowerCase()
          || 'parity'
        errorDiagnostics.accountCapabilityExceptionIds = Array.isArray(accountRuntimeSupport?.accountCapabilityExceptions)
          ? accountRuntimeSupport.accountCapabilityExceptions.map((row) => String(row?.id || '').trim()).filter(Boolean)
          : []
        errorDiagnostics.openAIAuthParityStatus = parityReport.status
        errorDiagnostics.openAIAuthParityCoreSummary = Object.values(parityReport?.capabilities || {})
          .map((row) => {
            const capabilityId = String(row?.capabilityId || '').trim()
            const accountStatus = String(row?.accountStatus || '').trim().toLowerCase()
            if (!capabilityId || !accountStatus) return ''
            return `${capabilityId}=${accountStatus}`
          })
          .filter(Boolean)
        errorDiagnostics.openAIAuthParityExceptions = parityReport.registeredExceptions
        errorDiagnostics.openAIAuthParityMismatches = parityReport.mismatches
      }
      const {
        activeToolNames,
        modelSupportsTools,
        tools,
      } = applyToolCapabilityDiagnostics({
        errorDiagnostics,
        activeToolDefinitions,
        requestedToolCount,
        modelCapabilities,
        resolvedToolSurface,
        adapterProfile,
        providerId,
        openaiHostedToolIds,
        openaiExcludedToolReasons,
      })
      const history = []
      const turnToolResults = []
      const openAIAccountDynamicToolExecutor = createOpenAIAccountDynamicToolExecutor({
        providerId,
        model: model ?? '',
        authMethod: openAIExecutionAuth?.authMethod || '',
        mode,
        activeToolNames,
        apiKey,
        providerRuntimeSettings,
        runtimeToolSurface,
        resolvedToolSurface,
        permissionMode,
        activeThreadId, activeTurnId, activeAssistantMessageId, turnStartedAt,
        effectiveProjectFolder,
        loop,
        sender: event.sender,
        wid,
        settings,
        moaRoles,
        moaPolicy,
        moaBudgetPolicy,
        agentSettings,
        orchestratorIntent,
        delegationSelectionIntent,
        getProviderRuntimeApiKey,
        getCachedModelCapabilities,
        requestFanoutConfirmation,
        history, turnToolResults, errorDiagnostics,
        send,
        persistTimelineEvent,
      })
      const rawDelegationVisible = activeToolNames.includes('delegate_to_agents')
      const compactDelegationVisible = activeToolNames.includes('delegate_tasks')
      if (rawDelegationVisible) {
        errorDiagnostics.toolWorkflowRawDelegationExposureCount = Number(errorDiagnostics.toolWorkflowRawDelegationExposureCount || 0) + 1
      } else if (compactDelegationVisible) {
        errorDiagnostics.toolWorkflowCompactDelegationOnlyExposureCount = Number(errorDiagnostics.toolWorkflowCompactDelegationOnlyExposureCount || 0) + 1
      }
      if (activeToolNames.includes('fetch_page') && activeToolNames.includes('browser_action')) {
        errorDiagnostics.toolWorkflowFetchBrowserCoexposureCount = Number(errorDiagnostics.toolWorkflowFetchBrowserCoexposureCount || 0) + 1
      }
      const roundContext = await buildChatStreamRoundContext({
        sender: event.sender,
        providerId,
        model: model ?? '',
        mode,
        permissionMode,
        settings,
        sourceHistoryMessages,
        fallbackUserEntry,
        userMessage,
        resolvedToolSurface,
        tools,
        openAIAccountDynamicToolCatalog,
        modelSupportsTools,
        modelCapabilities,
        delegationAvailable,
        includeGlobalMemoryInContext,
        activeProjectId,
        activeThreadId,
        activeTurnId,
        effectiveProjectFolder,
        errorDiagnostics,
        send,
        sendNotice,
        sendTurnState,
        persistTimelineEvent,
        commitFailureTurn,
        openAIExecutionAuth,
        openAIAccountDynamicToolExecutor,
        openAIAccountCollaborationModeId,
        adapterProfile,
        loop,
        turnOptions,
      })
      if (!roundContext.ok) {
        return
      }
      const {
        options,
        modelContext,
        promptBudgetProfile,
        rollingUsage,
        continuityRuntime,
        assistantCommentaryPhase,
        assistantFinalPhase,
        history: roundHistory,
        turnToolResults: roundTurnToolResults,
        turnReasoningSegments,
      } = roundContext
      history.length = 0
      if (Array.isArray(roundHistory) && roundHistory.length > 0) {
        history.push(...roundHistory)
      }
      turnToolResults.length = 0
      if (Array.isArray(roundTurnToolResults) && roundTurnToolResults.length > 0) {
        turnToolResults.push(...roundTurnToolResults)
      }
      await runStreamRounds({
        loop,
        sender: event.sender,
        wid,
        settings,
        history,
        rollingUsage,
        userMessage,
        mode,
        permissionMode,
        projectFolder: effectiveProjectFolder,
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
        providerToolExecutionContext: runtimeToolSurface.providerToolExecutionContext,
        toolExecutionMap: resolvedToolSurface.toolExecutionMap,
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
        turnOptions: { ...turnOptions, orchestratorIntent, delegationSelectionIntent },
        send,
        sendCancelled,
        sendNotice,
        sendTurnState,
        persistTimelineEvent,
        emitTurnRuntimeDiagnostics,
        requestFanoutConfirmation,
        turnToolResults,
        turnReasoningSegments,
        maxToolRounds: MAX_TOOL_ROUNDS,
        maxConsecutiveErrorRounds: MAX_CONSECUTIVE_ERROR_ROUNDS,
        maxConsecutiveIdenticalToolRounds: MAX_CONSECUTIVE_IDENTICAL_TOOL_ROUNDS,
        helpers: {
          getApiKey: getProviderRuntimeApiKey,
          getCachedModelCapabilities,
          buildPreCallContinuityInput,
          compactHistoryForContextWindow,
          applyCompactionIfNeeded,
          estimateHistoryTokens,
          resolveOpenAIThreadContinuation,
          pushUniqueRuntimeValue,
          upsertOpenAIThreadState,
          prepareOpenAIBackgroundTurn,
          createOpenAIBackgroundJob,
          finalizeOpenAIBackgroundJob,
          buildChatUsagePayload,
          emitUsageEvent,
          emitReasoningDone,
          updateOpenAIContinuationContext,
          resolveOpenAIContinuationPersistence,
          recordRepeatedToolCallBatch,
          commitFinalTurn, commitFailureTurn,
          finalizeRoundWithoutTools: (args = {}) => finalizeRoundWithoutTools({ ...args, commitFinalTurn }),
          buildAssistantToolUseMessage,
          createStreamWithTools,
          detectTextualApprovalRequestWithoutToolCall,
          touchProjectUsageByThread,
          runPostTurnTasks,
          asTokenCount,
          isAbortError,
          toolBatchHelpers: {
            toToolEventInput,
            shouldBlockEditFileWithoutInspection,
            recordToolStepOutcome,
            buildToolResultMessage,
            trimText,
            extractRunCommandMeta,
            runDelegationToolCall: (args) => runDelegationToolCall({
              ...args, activeAssistantMessageId,
              getApiKey: getProviderRuntimeApiKey,
              getCachedCapabilities: getCachedModelCapabilities,
            }),
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
          },
        },
      })
      failPendingPlanDirectionAction({
        planAction,
        projectFolder: effectiveProjectFolder,
        threadId: activeThreadId,
        turnId: activeTurnId,
        error: 'The provider completed without finalizing the plan direction.',
        persistTimelineEvent,
        send,
      })
      const toolWorkflowTelemetry = buildToolWorkflowTelemetryPayload(errorDiagnostics, {
        threadId: activeThreadId,
        turnId: activeTurnId,
      })
      if (toolWorkflowTelemetry) {
        send('chat:tool-workflow-telemetry', toolWorkflowTelemetry)
      }
    } catch (outerErr) {
      if (_debugThread) {
        const reason = loop.cancelled ? 'cancelled' : String(outerErr?.message || 'unknown').slice(0, 200)
        safeDebug('[thread-session] run:error', { threadId: activeThreadId, turnId: activeTurnId, loopKey, reason })
      }
      if (loop.cancelled || isAbortError(outerErr)) {
        sendCancelled(loop.cancelReason || 'Cancelled by user.')
      } else {
        failPendingPlanDirectionAction({
          planAction,
          projectFolder: effectiveProjectFolder,
          threadId: activeThreadId,
          turnId: activeTurnId,
          error: String(outerErr?.message || 'The provider failed before finalizing the plan direction.'),
          persistTimelineEvent,
          send,
        })
        if (isToolsUnsupportedError(outerErr)) {
          pushUniqueRuntimeValue(errorDiagnostics.capabilityBlockReasons, 'provider_rejected_tool_surface')
          errorDiagnostics.surfaceResolutionFailure = 'provider_rejected_tool_surface'
        } else if (
          String(outerErr?.message || '').toLowerCase().includes('tool choice is none')
          && String(outerErr?.message || '').toLowerCase().includes('model called a tool')
        ) {
          errorDiagnostics.surfaceResolutionFailure = 'tool_choice_none_model_called_tool'
        }
        emitTurnRuntimeDiagnostics()
        emitStreamFailure({
          outerErr,
          providerId,
          model: model ?? '',
          errorDiagnostics,
          send,
          sendTurnState,
          persistTimelineEvent,
          commitFailureTurn,
        })
      }
      try { loop.abortController?.abort() } catch { /* best-effort abort during stream teardown */ }
    } finally {
      if (_debugThread) {
        safeDebug('[thread-session] run:done', { threadId: activeThreadId, turnId: activeTurnId, loopKey, elapsedMs: Date.now() - turnStartedAt })
      }
      runRegistry.settle(loopKey, loop)
    }
}
