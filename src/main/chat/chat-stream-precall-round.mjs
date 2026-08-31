import { buildProviderTruncationEffectivePromptBudget, buildSafeProviderTruncationOccupancyEstimate } from '../../common/chat/provider-truncation-budget-policy.mjs'
import { updateOpenAIContinuationContext } from '../api-clients/openai-continuation-context.mjs'
import { COMPACTION_MODES } from './continuity/compaction-mode-contract.mjs'
import { resolveOpenAIPreCallCompactionDecision } from './continuity/openai-precall-compaction-decision.mjs'
import { buildAnthropicProviderRequestContext, buildProviderTruncationCriticalTaskState } from './chat-stream-precall-budget.mjs'
import { assignCompactionDiagnostics, buildCurrentOpenAIRequestContext, injectCompactionImminentAwareness, injectProviderChainResumedAfterHandoff, injectProviderTruncationResumedAfterHandoff } from './chat-stream-precall-compaction-helpers.mjs'
import {
  emitAdaptiveBudgetUserNote,
  applyPreCallHistoryConditioning,
  resolveLatestPersistedContextUsage,
} from './chat-stream-precall-history-conditioning.mjs'
import {
  handleAutomaticOpenAIAccountCompaction,
  handleManualOpenAICompactionCommand,
} from './chat-stream-precall-openai-command.mjs'
import { estimateDispatchedPromptOccupancy } from './context-occupancy-estimator.mjs'
import {
  buildPromptBudgetDiagnosticSnapshot,
  resolveProviderPromptBudgetProfile,
} from './provider-prompt-budget-profile.mjs'
import {
  buildPreCallContinuityIdentity,
  createOpenAIProviderNativeCompactionRunner,
  resolveEffectivePreCallCommandOptions,
} from './chat-stream-precall-round-context.mjs'

export async function preparePreCallRoundContext({
  history = [],
  round = 0,
  rollingUsage = {},
  userMessage = '',
  turnToolResults = [],
  turnReasoningSegments = [],
  errorDiagnostics = {},
  providerId = '',
  model = '',
  adapterProfile = null,
  promptBudgetProfile = null,
  activeToolDefinitions = {},
  providerRuntimeSettings = null,
  continuityPolicy = null,
  openAIExecutionAuthContext = null,
  activeProjectId = '',
  activeThreadId = '',
  activeTurnId = '',
  turnOptions = {},
  apiKey = '',
  continuityRuntime = null,
  modelContext = {},
  loop,
  latestOpenAICompactionId = '',
  send = () => {},
  persistTimelineEvent = () => {},
  buildPreCallContinuityInput,
  compactHistoryForContextWindow,
  applyCompactionIfNeeded,
  estimateHistoryTokens,
  resolveOpenAIThreadContinuation,
  pushUniqueRuntimeValue,
  upsertOpenAIThreadState = () => {},
} = {}) {
  let compaction = null
  let preparedHistory = null
  let continuityPacketPayload = null
  const preCallPromptOccupancyEstimate = estimateDispatchedPromptOccupancy({
    history,
    activeToolDefinitions,
    providerId,
    model,
  })
  const latestPersistedContextUsage = resolveLatestPersistedContextUsage(activeThreadId)
  const {
    preCallOccupancyEstimateTokens,
    continuityInput,
  } = buildPreCallContinuityInput({
    history,
    round,
    rollingUsage,
    userMessage,
    latestContextUsage: latestPersistedContextUsage,
    promptOccupancyEstimateTokens: preCallPromptOccupancyEstimate.tokenEstimate,
    promptOccupancyEstimateConfidence: preCallPromptOccupancyEstimate.occupancyConfidence,
    promptOccupancyEstimateMethod: preCallPromptOccupancyEstimate.occupancyMethod,
  })
  errorDiagnostics.preCallOccupancyEstimateTokens = Number(preCallOccupancyEstimateTokens || 0) || 0
  const safePreCallOccupancyEstimateTokens = buildSafeProviderTruncationOccupancyEstimate(
    preCallOccupancyEstimateTokens,
  )
  const providerTruncationCriticalTaskState = buildProviderTruncationCriticalTaskState({
    turnToolResults,
    turnReasoningSegments,
  })
  const effectivePromptBudget = buildProviderTruncationEffectivePromptBudget({
    modelContextLimitTokens: modelContext?.limitTokens,
    maxOutputTokens: modelContext?.maxOutputTokens,
  })
  errorDiagnostics.preCallSafeOccupancyEstimateTokens = Number(safePreCallOccupancyEstimateTokens || 0) || 0
  errorDiagnostics.effectivePromptBudgetTokens = Number(effectivePromptBudget.effectivePromptBudgetTokens || 0) || 0
  errorDiagnostics.promptBudgetOutputReserveTokens = Number(effectivePromptBudget.outputReserveTokens || 0) || 0
  errorDiagnostics.promptBudgetSafetyReserveTokens = Number(effectivePromptBudget.safetyReserveTokens || 0) || 0
  errorDiagnostics.providerTruncationCriticalTaskActive = providerTruncationCriticalTaskState.active === true
  errorDiagnostics.providerTruncationCriticalTaskReasons = [...(providerTruncationCriticalTaskState.reasons || [])]
  const {
    openAICommandTurnOptions,
    effectiveOpenAICommandTurnOptions,
    effectiveAnthropicCommandTurnOptions,
    openAIContinuityEnabled,
    anthropicContinuityEnabled,
  } = resolveEffectivePreCallCommandOptions({
    turnOptions,
    providerId,
    providerRuntimeSettings,
    continuityPolicy,
    model,
    activeThreadId,
    activeTurnId,
    send,
    persistTimelineEvent,
  })
  const resolvedPromptBudgetProfile = promptBudgetProfile && typeof promptBudgetProfile === 'object'
    ? promptBudgetProfile
    : resolveProviderPromptBudgetProfile({
      providerId,
      modelId: model,
      runtimeSettings: providerRuntimeSettings,
      requestContext: turnOptions,
    })
  Object.assign(
    errorDiagnostics,
    buildPromptBudgetDiagnosticSnapshot(resolvedPromptBudgetProfile),
  )
  emitAdaptiveBudgetUserNote({
    errorDiagnostics,
    activeThreadId,
    activeTurnId,
    send,
    persistTimelineEvent,
  })

  const {
    toolsetHash,
    systemPromptHash,
    continuitySignature,
  } = buildPreCallContinuityIdentity({
    history,
    activeToolDefinitions,
    providerId,
    model,
  })
  const resolvedAdapterProfile = adapterProfile && typeof adapterProfile === 'object'
    ? adapterProfile
    : null
  const openAIModelSupport = openAIContinuityEnabled
    ? (resolvedAdapterProfile?.openaiRuntimeSupport || null)
    : null
  const initialOpenAIPreCallCompactionDecision = resolveOpenAIPreCallCompactionDecision({
    providerId,
    modelId: String(model ?? ''),
    modelSupport: openAIModelSupport,
    providerRuntimeSettings,
    continuityPolicy,
    requestContext: effectiveOpenAICommandTurnOptions,
    previousResponseId: '',
    openAIExecutionAuthContext,
    occupancyEstimateTokens: Number(safePreCallOccupancyEstimateTokens || 0) || 0,
    modelContextLimitTokens: Number(modelContext?.limitTokens || 0) || 0,
    criticalTaskState: providerTruncationCriticalTaskState,
  })
  const usingExperimentalOpenAIWebSocketTransport = (
    openAIContinuityEnabled
    && String(providerRuntimeSettings?.openai?.transportMode || '').trim().toLowerCase() === 'responses_websocket_experimental'
  )
  const openAIContinuation = openAIContinuityEnabled
    ? resolveOpenAIThreadContinuation({
      threadId: activeThreadId,
      model: String(model ?? ''),
      toolsetHash,
      systemPromptHash,
      continuitySignature,
      usePreviousResponseId: initialOpenAIPreCallCompactionDecision.effectiveOpenAIRuntimeSettings.usePreviousResponseId !== false,
      useConversationState: initialOpenAIPreCallCompactionDecision.effectiveOpenAIRuntimeSettings.useConversationState === true,
    })
    : null
  const pendingProviderTruncationResume = (
    openAIContinuation?.pendingProviderTruncationResume
    && typeof openAIContinuation.pendingProviderTruncationResume === 'object'
  )
    ? openAIContinuation.pendingProviderTruncationResume
    : null

  if (String(openAIContinuation?.invalidReason || '').trim()) {
    pushUniqueRuntimeValue(
      errorDiagnostics.surfacePolicyReresolution,
      String(openAIContinuation.invalidReason || '').trim(),
    )
  }
  const openAIPreCallCompactionDecision = resolveOpenAIPreCallCompactionDecision({
    providerId,
    modelId: String(model ?? ''),
    modelSupport: openAIModelSupport,
    providerRuntimeSettings,
    continuityPolicy,
    requestContext: effectiveOpenAICommandTurnOptions,
    previousResponseId: String(openAIContinuation?.previousResponseId || '').trim(),
    openAIExecutionAuthContext,
    accountBridgeThreadId: String(
      openAIContinuation?.accountBridgeThreadId
      || openAIContinuation?.state?.metadata?.accountBridgeThreadId
      || ''
    ).trim(),
    occupancyEstimateTokens: Number(safePreCallOccupancyEstimateTokens || 0) || 0,
    modelContextLimitTokens: Number(modelContext?.limitTokens || 0) || 0,
    criticalTaskState: providerTruncationCriticalTaskState,
  })
  const {
    openAICompactionStrategy,
    providerChainCompactionUsable: openAIProviderChainCompactionUsable,
    shouldStoreOpenAIState,
    automaticAccountCompactionDecision,
    manualDecision,
    contextManagementDiagnostics,
  } = openAIPreCallCompactionDecision
  if (contextManagementDiagnostics && typeof contextManagementDiagnostics === 'object') {
    errorDiagnostics.contextManagementStrategy = contextManagementDiagnostics.selectedStrategy
    errorDiagnostics.contextManagementSkippedReasons = Array.isArray(contextManagementDiagnostics.skippedReasons)
      ? [...contextManagementDiagnostics.skippedReasons]
      : []
    errorDiagnostics.contextManagementFallbackStrategy = contextManagementDiagnostics.fallbackStrategy
    errorDiagnostics.contextManagementFallbackReason = contextManagementDiagnostics.fallbackReason
    errorDiagnostics.contextManagementThresholdTokens = Number(contextManagementDiagnostics.thresholdTokens || 0) || 0
  }

  let effectiveOpenAIContinuation = openAIContinuation
  let currentProviderRequestContext = (
    turnOptions?.processingMode === 'standard' || turnOptions?.processingMode === 'fast'
  )
    ? { processingMode: turnOptions.processingMode }
    : undefined
  let nextLatestOpenAICompactionId = String(latestOpenAICompactionId || '')
  let commandOnly = false
  let commandOnlyAssistantText = ''
  let effectiveCompactionStrategyMode = String(openAICompactionStrategy.mode || COMPACTION_MODES.NONE)
  let selectedCompactionMode = String(openAIPreCallCompactionDecision.selectedCompactionMode || COMPACTION_MODES.LOCAL_SUMMARY)
  let candidateCompactionModes = [...(openAIPreCallCompactionDecision.candidateCompactionModes || [])]
  let compactionFailureReason = ''
  let fallbackCompactionMode = ''
  let fallbackReason = ''
  let compactionEventType = ''
  let compactionEventPhase = ''
  let compactionEventOccurred = null
  let canonicalHandoffUsed = null
  let carryForwardSource = ''
  let manualCompactionAppliedPreCall = false
  let automaticAccountCompactionAppliedPreCall = false
  let providerChainCompactionAppliedAutomatic = false
  let providerTruncationResumedAfterInjected = false
  assignCompactionDiagnostics(errorDiagnostics, {
    selectedCompactionMode,
    candidateCompactionModes,
    compactionEventType,
    compactionEventPhase,
    compactionEventOccurred,
    canonicalHandoffUsed,
    carryForwardSource,
  })

  if (anthropicContinuityEnabled) {
    currentProviderRequestContext = {
      ...(currentProviderRequestContext || {}),
      ...buildAnthropicProviderRequestContext({
        providerRuntimeSettings,
        effectiveAnthropicCommandTurnOptions,
        continuityPolicy,
        modelContext,
        providerTruncationCriticalTaskState,
      }),
    }
  }

  if (openAICommandTurnOptions.forceManualCompaction) {
    const manualCommandResult = await handleManualOpenAICompactionCommand({
      enabled: true,
      continuityPolicy,
      history,
      model,
      effectiveOpenAIContinuation,
      apiKey,
      preCallOccupancyEstimateTokens,
      activeThreadId,
      activeTurnId,
      activeProjectId,
      toolsetHash,
      systemPromptHash,
      continuitySignature,
      shouldStoreOpenAIState,
      openAIExecutionAuthContext,
      usingExperimentalOpenAIWebSocketTransport,
      openAICommandTurnOptions,
      manualDecision,
      effectiveCompactionStrategyMode,
      send,
      persistTimelineEvent,
      upsertOpenAIThreadState,
      nextLatestOpenAICompactionId,
    })
    candidateCompactionModes = [...(manualCommandResult.candidateCompactionModes || candidateCompactionModes)]
    compactionFailureReason = String(manualCommandResult.compactionFailureReason || compactionFailureReason)
    fallbackCompactionMode = String(manualCommandResult.fallbackCompactionMode || fallbackCompactionMode)
    fallbackReason = String(manualCommandResult.fallbackReason || fallbackReason)
    compactionEventType = String(manualCommandResult.compactionEventType || compactionEventType)
    compactionEventPhase = String(manualCommandResult.compactionEventPhase || compactionEventPhase)
    compactionEventOccurred = Object.prototype.hasOwnProperty.call(manualCommandResult, 'compactionEventOccurred')
      ? manualCommandResult.compactionEventOccurred
      : compactionEventOccurred
    selectedCompactionMode = String(manualCommandResult.selectedCompactionMode || selectedCompactionMode)
    effectiveCompactionStrategyMode = String(
      manualCommandResult.effectiveCompactionStrategyMode || effectiveCompactionStrategyMode,
    )
    effectiveOpenAIContinuation = manualCommandResult.effectiveOpenAIContinuation || effectiveOpenAIContinuation
    nextLatestOpenAICompactionId = String(
      manualCommandResult.nextLatestOpenAICompactionId || nextLatestOpenAICompactionId,
    )
    manualCompactionAppliedPreCall = manualCommandResult.manualCompactionAppliedPreCall === true
    commandOnly = manualCommandResult.commandOnly === true
    commandOnlyAssistantText = commandOnly
      ? String(manualCommandResult.commandOnlyAssistantText || '')
      : ''
  }

  if (
    !commandOnly
    && automaticAccountCompactionDecision?.shouldAttempt === true
  ) {
    const automaticAccountCompactionResult = await handleAutomaticOpenAIAccountCompaction({
      enabled: true,
      automaticDecision: automaticAccountCompactionDecision,
      model,
      effectiveOpenAIContinuation,
      activeThreadId,
      activeTurnId,
      activeProjectId,
      toolsetHash,
      systemPromptHash,
      continuitySignature,
      shouldStoreOpenAIState,
      send,
      persistTimelineEvent,
      upsertOpenAIThreadState,
      nextLatestOpenAICompactionId,
    })
    if (automaticAccountCompactionResult.handled) {
      candidateCompactionModes = [...(automaticAccountCompactionResult.candidateCompactionModes || candidateCompactionModes)]
      compactionFailureReason = String(automaticAccountCompactionResult.compactionFailureReason || compactionFailureReason)
      fallbackCompactionMode = String(automaticAccountCompactionResult.fallbackCompactionMode || fallbackCompactionMode)
      fallbackReason = String(automaticAccountCompactionResult.fallbackReason || fallbackReason)
      compactionEventType = String(automaticAccountCompactionResult.compactionEventType || compactionEventType)
      compactionEventPhase = String(automaticAccountCompactionResult.compactionEventPhase || compactionEventPhase)
      compactionEventOccurred = Object.prototype.hasOwnProperty.call(automaticAccountCompactionResult, 'compactionEventOccurred')
        ? automaticAccountCompactionResult.compactionEventOccurred
        : compactionEventOccurred
      selectedCompactionMode = String(automaticAccountCompactionResult.selectedCompactionMode || selectedCompactionMode)
      effectiveCompactionStrategyMode = String(
        automaticAccountCompactionResult.automaticAccountCompactionAppliedPreCall === true
          ? COMPACTION_MODES.CODEX_THREAD_COMPACTION
          : effectiveCompactionStrategyMode,
      )
      effectiveOpenAIContinuation = automaticAccountCompactionResult.effectiveOpenAIContinuation || effectiveOpenAIContinuation
      nextLatestOpenAICompactionId = String(
        automaticAccountCompactionResult.nextLatestOpenAICompactionId || nextLatestOpenAICompactionId,
      )
      automaticAccountCompactionAppliedPreCall = automaticAccountCompactionResult.automaticAccountCompactionAppliedPreCall === true
    }
  }

  if (commandOnly) {
    assignCompactionDiagnostics(errorDiagnostics, {
      selectedCompactionMode,
      candidateCompactionModes,
      compactionFailureReason,
      fallbackCompactionMode,
      fallbackReason,
      compactionEventType,
      compactionEventPhase,
      compactionEventOccurred,
      canonicalHandoffUsed,
      carryForwardSource,
    })
    const requestedCompactionMode = String(
      effectiveCompactionStrategyMode || COMPACTION_MODES.NONE
    )
    const currentOpenAIRequestContext = buildCurrentOpenAIRequestContext({
      openAIContinuityEnabled,
      effectiveOpenAIContinuation,
      shouldStoreOpenAIState,
      openAIProviderChainCompactionUsable,
      requestedCompactionMode,
      forceProviderTruncation: effectiveOpenAICommandTurnOptions.forceServerSideCompaction === true,
      providerTruncationThresholdTokens: Number(openAICompactionStrategy.thresholdTokens || 0) || 0,
      selectedCompactionMode,
      candidateCompactionModes,
      compactionFailureReason,
      fallbackCompactionMode,
      fallbackReason,
      compactionEventType,
      compactionEventPhase,
      compactionEventOccurred,
      canonicalHandoffUsed,
      carryForwardSource,
    })
    return {
      preCallOccupancyEstimateTokens,
      promptOccupancyEstimateTokens: Number(preCallOccupancyEstimateTokens || 0) || 0,
      openAIContinuityEnabled,
      openAIContinuation: effectiveOpenAIContinuation,
      shouldStoreOpenAIState,
      currentOpenAIRequestContext,
      currentProviderRequestContext,
      toolsetHash,
      systemPromptHash,
      continuitySignature,
      latestOpenAICompactionId: nextLatestOpenAICompactionId,
      commandOnly: true,
      commandOnlyAssistantText,
    }
  }

  if (manualCompactionAppliedPreCall || automaticAccountCompactionAppliedPreCall) {
    injectProviderChainResumedAfterHandoff({
      history,
      continuityInput,
      selectedStrategyMode: effectiveCompactionStrategyMode,
      compactionEventType: String(compactionEventType || '').trim().toLowerCase() || 'provider_chain_compaction',
      providerId: String(providerId || '').trim().toLowerCase(),
      threadId: activeThreadId,
      turnId: activeTurnId,
      persistTimelineEvent,
    })
    compactionEventType = String(compactionEventType || '').trim().toLowerCase() || 'provider_chain_compaction'
    compactionEventPhase = 'resumed_after'
    compactionEventOccurred = true
    canonicalHandoffUsed = true
  } else if (String(effectiveCompactionStrategyMode || '').trim() === COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION) {
    injectCompactionImminentAwareness({
      history,
      continuityInput,
      selectedStrategyMode: effectiveCompactionStrategyMode,
      allowedStrategyModes: [COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION],
      occurred: false,
      type: 'provider_chain_compaction',
      phase: 'imminent',
      source: 'provider',
      confidence: 'explicit',
      providerId: String(providerId || '').trim().toLowerCase(),
      threadId: activeThreadId,
      turnId: activeTurnId,
      preCallOccupancyEstimateTokens,
      modelLimitTokens: Number(modelContext?.limitTokens || 0) || 0,
      note: 'Provider chain compaction selected for this turn; preserve objective and next step explicitly before boundary application.',
      persistTimelineEvent,
    })
    if (String(effectiveCompactionStrategyMode || '').trim() === COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION) {
      compactionEventType = 'provider_chain_compaction'
      compactionEventPhase = 'imminent'
      compactionEventOccurred = false
    }
  }
  if (String(effectiveCompactionStrategyMode || '').trim() === COMPACTION_MODES.PROVIDER_TRUNCATION) {
    providerTruncationResumedAfterInjected = injectProviderTruncationResumedAfterHandoff({
      history,
      continuityInput,
      selectedStrategyMode: effectiveCompactionStrategyMode,
      providerId: String(providerId || '').trim().toLowerCase(),
      threadId: activeThreadId,
      turnId: activeTurnId,
      modelLimitTokens: Number(modelContext?.limitTokens || 0) || 0,
      preCallOccupancyEstimateTokens,
      pendingTruncationResume: pendingProviderTruncationResume,
      persistTimelineEvent,
    })
    if (providerTruncationResumedAfterInjected) {
      compactionEventType = 'provider_truncation'
      compactionEventPhase = 'resumed_after'
      compactionEventOccurred = true
      canonicalHandoffUsed = true
    }
  }
  if (String(effectiveCompactionStrategyMode || '').trim() === COMPACTION_MODES.PROVIDER_TRUNCATION) {
    if (!providerTruncationResumedAfterInjected) {
      injectCompactionImminentAwareness({
        history,
        continuityInput,
        selectedStrategyMode: effectiveCompactionStrategyMode,
        allowedStrategyModes: [COMPACTION_MODES.PROVIDER_TRUNCATION],
        occurred: false,
        type: 'provider_truncation',
        phase: 'imminent',
        source: 'provider',
        confidence: 'explicit',
        providerId: String(providerId || '').trim().toLowerCase(),
        threadId: activeThreadId,
        turnId: activeTurnId,
        preCallOccupancyEstimateTokens,
        modelLimitTokens: Number(modelContext?.limitTokens || 0) || 0,
        note: 'Provider truncation is armed for this turn; preserve objective and next step explicitly before provider-managed boundary changes.',
        persistTimelineEvent,
      })
      compactionEventType = 'provider_truncation'
      compactionEventPhase = 'imminent'
      compactionEventOccurred = false
    }
  }

  try {
    const continuity = await continuityRuntime.applyBeforeModelCall({
      ...continuityInput,
      providerNativeContext: openAIContinuityEnabled
        ? {
          model: String(model ?? ''),
          previousResponseId: String(effectiveOpenAIContinuation?.previousResponseId || ''),
          manualCompactedWindow: Array.isArray(effectiveOpenAIContinuation?.manualCompactedWindow)
            ? effectiveOpenAIContinuation.manualCompactedWindow
            : [],
          resetChainFromCompactedWindow: effectiveOpenAIContinuation?.resetChainFromCompactedWindow === true,
          apiKey,
          historyTokenEstimate: Number(preCallOccupancyEstimateTokens || 0) || 0,
          compactionStrategy: effectiveCompactionStrategyMode,
          serverSideCompactionThresholdTokens: Number(openAICompactionStrategy.thresholdTokens || 0) || 0,
          runProviderNativeCompaction: createOpenAIProviderNativeCompactionRunner({
            enabled: effectiveCompactionStrategyMode === COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
            activeThreadId,
            activeTurnId,
            model,
            candidateCompactionModes,
            providerId,
            continuityPolicy,
            history,
            effectiveOpenAIContinuation,
            apiKey,
            send,
            persistTimelineEvent,
          }),
        }
        : null,
    })
    compaction = continuity?.compaction || null
    preparedHistory = Array.isArray(continuity?.history) ? continuity.history : null
    const continuityBudget = continuity?.budget && typeof continuity.budget === 'object'
      ? continuity.budget
      : null
    const packetPayload = continuity?.packetPayload && typeof continuity.packetPayload === 'object'
      ? continuity.packetPayload
      : null
    if (packetPayload) {
      continuityPacketPayload = packetPayload
      errorDiagnostics.continuityPacketTokens = Number(packetPayload.packetTokens || 0) || 0
      errorDiagnostics.continuitySourceRefs = Number(packetPayload.sourceRefCount || 0) || 0
      errorDiagnostics.continuityPacketBudgetReductionApplied = continuityBudget?.packet?.budgetReductionApplied === true
      errorDiagnostics.continuityPacketBudgetReductionReasons = Array.isArray(continuityBudget?.packet?.budgetReductionReasons)
        ? [...continuityBudget.packet.budgetReductionReasons]
        : []
      const providerNativeMeta = packetPayload.providerNativeMeta && typeof packetPayload.providerNativeMeta === 'object'
        ? packetPayload.providerNativeMeta
        : null
      if (effectiveCompactionStrategyMode === COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION) {
        if (providerNativeMeta?.used === true) {
          providerChainCompactionAppliedAutomatic = true
          if (usingExperimentalOpenAIWebSocketTransport) {
            effectiveOpenAIContinuation = {
              previousResponseId: '',
              conversationId: '',
              manualCompactedWindow: Array.isArray(providerNativeMeta?.compactedWindow)
                ? providerNativeMeta.compactedWindow
                : [],
              resetChainFromCompactedWindow: true,
            }
          } else {
            effectiveOpenAIContinuation = updateOpenAIContinuationContext({
              previousResponseId: String(effectiveOpenAIContinuation?.previousResponseId || ''),
              conversationId: String(effectiveOpenAIContinuation?.conversationId || ''),
              manualCompactedWindow: Array.isArray(effectiveOpenAIContinuation?.manualCompactedWindow)
                ? effectiveOpenAIContinuation.manualCompactedWindow
                : [],
              resetChainFromCompactedWindow: effectiveOpenAIContinuation?.resetChainFromCompactedWindow === true,
            }, {
              responseId: String(providerNativeMeta?.responseId || ''),
            })
          }
          selectedCompactionMode = String(
            providerNativeMeta?.compactionMode
            || COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
          )
          compactionFailureReason = ''
          fallbackCompactionMode = ''
          fallbackReason = ''
          compactionEventType = 'provider_chain_compaction'
          compactionEventPhase = 'resumed_after'
          compactionEventOccurred = true
        } else {
          selectedCompactionMode = COMPACTION_MODES.LOCAL_SUMMARY
          compactionFailureReason = String(providerNativeMeta?.reason || '')
          fallbackCompactionMode = COMPACTION_MODES.LOCAL_SUMMARY
          fallbackReason = providerNativeMeta?.reason ? 'provider_chain_compaction_unavailable' : ''
          compactionEventType = 'provider_chain_compaction'
          compactionEventPhase = 'imminent'
          compactionEventOccurred = false
        }
      }
      nextLatestOpenAICompactionId = String(
        providerNativeMeta?.compactionId
        || providerNativeMeta?.compactionIds?.[0]
        || nextLatestOpenAICompactionId
        || '',
      )
    }
  } catch {
    selectedCompactionMode = COMPACTION_MODES.LOCAL_SUMMARY
    compactionFailureReason = compactionFailureReason || 'continuity_runtime_failed'
    fallbackCompactionMode = COMPACTION_MODES.LOCAL_SUMMARY
    fallbackReason = 'continuity_runtime_failed'
    if (!compactionEventType) {
      compactionEventType = String(effectiveCompactionStrategyMode || '').trim() === COMPACTION_MODES.PROVIDER_TRUNCATION
        ? 'provider_truncation'
        : 'provider_chain_compaction'
    }
    if (!compactionEventPhase) {
      compactionEventPhase = 'imminent'
    }
    if (compactionEventOccurred === null) {
      compactionEventOccurred = false
    }
    compaction = await compactHistoryForContextWindow(history, {
      modelLimit: modelContext.limitTokens,
      softThreshold: 0.85,
      hardThreshold: 0.92,
      providerId,
      model: model ?? '',
      apiKey,
      abortSignal: loop.abortController.signal,
    })
    preparedHistory = Array.isArray(compaction?.history) ? compaction.history : null
  }

  const conditionedHistory = await applyPreCallHistoryConditioning({
    history,
    compaction,
    preparedHistory,
    modelContext,
    send,
    persistTimelineEvent,
    activeThreadId,
    activeTurnId,
    continuityPacketPayload,
    errorDiagnostics,
    resolvedPromptBudgetProfile,
    providerId,
    model,
    effectiveCompactionStrategyMode,
    providerChainCompactionAppliedAutomatic,
    continuityInput,
    preCallOccupancyEstimateTokens,
    activeToolDefinitions,
    effectivePromptBudget,
    estimateHistoryTokens,
    compactHistoryForContextWindow,
    applyCompactionIfNeeded,
    apiKey,
    loop,
    selectedCompactionMode,
    compactionEventPhase,
    carryForwardSource,
    canonicalHandoffUsed,
  })
  carryForwardSource = conditionedHistory.carryForwardSource
  canonicalHandoffUsed = conditionedHistory.canonicalHandoffUsed
  assignCompactionDiagnostics(errorDiagnostics, {
    selectedCompactionMode,
    candidateCompactionModes,
    compactionFailureReason,
    fallbackCompactionMode,
    fallbackReason,
    compactionEventType,
    compactionEventPhase,
    compactionEventOccurred,
    canonicalHandoffUsed,
    carryForwardSource,
  })

  const requestedCompactionMode = String(
    effectiveCompactionStrategyMode || COMPACTION_MODES.NONE,
  )
  const currentOpenAIRequestContext = buildCurrentOpenAIRequestContext({
    openAIContinuityEnabled,
    effectiveOpenAIContinuation,
    shouldStoreOpenAIState,
    openAIProviderChainCompactionUsable,
    requestedCompactionMode,
    forceProviderTruncation: effectiveOpenAICommandTurnOptions.forceServerSideCompaction === true,
    providerTruncationThresholdTokens: Number(openAICompactionStrategy.thresholdTokens || 0) || 0,
    selectedCompactionMode,
    candidateCompactionModes,
    compactionFailureReason,
    fallbackCompactionMode,
    fallbackReason,
    compactionEventType,
    compactionEventPhase,
    compactionEventOccurred,
    canonicalHandoffUsed,
    carryForwardSource,
  })

  return {
    preCallOccupancyEstimateTokens,
    promptOccupancyEstimateTokens: conditionedHistory.promptOccupancyEstimateTokens,
    promptOccupancyEstimateConfidence: conditionedHistory.promptOccupancyEstimateConfidence,
    promptOccupancyEstimateMethod: conditionedHistory.promptOccupancyEstimateMethod,
    openAIContinuityEnabled,
    openAIContinuation: effectiveOpenAIContinuation,
    shouldStoreOpenAIState,
    currentOpenAIRequestContext,
    currentProviderRequestContext,
    toolsetHash,
    systemPromptHash,
    continuitySignature,
    latestOpenAICompactionId: nextLatestOpenAICompactionId,
    commandOnly: false,
    commandOnlyAssistantText: '',
  }
}
