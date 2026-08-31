import { COMPACTION_MODES } from './compaction-mode-contract.mjs'
import { resolveOpenAIAutomaticContextManagement } from './automatic-context-management-resolver.mjs'

export function resolveCandidateCompactionModes({
  openAIContinuityEnabled = false,
  strategyMode = COMPACTION_MODES.NONE,
  manualRequested = false,
  providerNativeManualSupported = false,
  accountManualSupported = false,
} = {}) {
  const modes = []
  if (manualRequested) {
    if (accountManualSupported) {
      modes.push(COMPACTION_MODES.CODEX_THREAD_COMPACTION)
    }
    if (providerNativeManualSupported) {
      modes.push(COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
    }
  } else if (openAIContinuityEnabled && strategyMode && strategyMode !== COMPACTION_MODES.NONE) {
    modes.push(strategyMode)
  }
  if (!modes.includes(COMPACTION_MODES.LOCAL_SUMMARY)) {
    modes.push(COMPACTION_MODES.LOCAL_SUMMARY)
  }
  return modes
}

export function resolveFallbackCompactionMode(strategyMode = COMPACTION_MODES.NONE) {
  return strategyMode && strategyMode !== COMPACTION_MODES.NONE
    ? strategyMode
    : COMPACTION_MODES.LOCAL_SUMMARY
}

export function resolveOpenAIPreCallCompactionDecision({
  providerId = '',
  modelId = '',
  modelSupport = null,
  providerRuntimeSettings = null,
  continuityPolicy = null,
  requestContext = {},
  previousResponseId = '',
  openAIExecutionAuthContext = null,
  accountBridgeThreadId = '',
  occupancyEstimateTokens = 0,
  modelContextLimitTokens = 0,
  criticalTaskState = null,
} = {}) {
  const {
    openAIContinuityEnabled,
    accountAuth,
    openAIChainCompactionPolicyAllowed,
    openAIProviderTruncationPolicyAllowed,
    effectiveOpenAIRuntimeSettings,
    openAICompactionStrategy,
    automaticAccountCompactionDecision,
    contextManagementDiagnostics,
  } = resolveOpenAIAutomaticContextManagement({
    providerId,
    modelSupport,
    providerRuntimeSettings,
    continuityPolicy,
    requestContext,
    openAIExecutionAuthContext,
    accountBridgeThreadId,
    occupancyEstimateTokens,
    modelContextLimitTokens,
    criticalTaskState,
  })
  const providerChainCompactionUsable = (
    !accountAuth
    && (
    effectiveOpenAIRuntimeSettings.useResponseCompaction === true
    && modelSupport?.supportsProviderChainCompaction === true
    )
  )
  const shouldStoreOpenAIState = openAIContinuityEnabled && (
    accountAuth
    || (
    effectiveOpenAIRuntimeSettings.usePreviousResponseId !== false
    || effectiveOpenAIRuntimeSettings.useConversationState === true
    || providerChainCompactionUsable
    || openAICompactionStrategy.mode === COMPACTION_MODES.PROVIDER_TRUNCATION
    || effectiveOpenAIRuntimeSettings.enableBackgroundMode === true
    )
  )
  const selectedCompactionMode = openAIContinuityEnabled
    ? (openAICompactionStrategy.mode !== COMPACTION_MODES.NONE
        ? openAICompactionStrategy.mode
        : COMPACTION_MODES.LOCAL_SUMMARY)
    : COMPACTION_MODES.LOCAL_SUMMARY
  const candidateCompactionModes = resolveCandidateCompactionModes({
    openAIContinuityEnabled,
    strategyMode: openAICompactionStrategy.mode,
  })
  const manualCandidateCompactionModes = resolveCandidateCompactionModes({
    openAIContinuityEnabled,
    strategyMode: openAICompactionStrategy.mode,
    manualRequested: true,
    providerNativeManualSupported: !accountAuth && modelSupport?.supportsProviderChainCompaction === true,
    accountManualSupported: accountAuth,
  })
  let manualDecision = null
  if (requestContext?.forceManualCompaction === true) {
    let blockedReason = ''
    let blockedMessage = ''
    if (!openAIContinuityEnabled) {
      blockedReason = 'provider_not_openai'
      blockedMessage = 'Compaction command ignored: OpenAI must be the active provider for this command.'
    } else if (effectiveOpenAIRuntimeSettings.allowPromptCompactionCommands !== true) {
      blockedReason = 'commands_disabled'
      blockedMessage = 'Compaction command ignored: prompt-triggered compaction commands are disabled in OpenAI runtime settings.'
    } else if (!openAIChainCompactionPolicyAllowed) {
      blockedReason = 'provider_chain_compaction_disabled'
      blockedMessage = 'Compaction command ignored: OpenAI provider chain compaction is disabled in continuity policy.'
    } else if (accountAuth && !String(accountBridgeThreadId || '').trim()) {
      blockedReason = 'missing_account_bridge_thread_id'
      blockedMessage = 'Compaction command skipped: no active Codex account thread is available for this chat yet.'
    } else if (!accountAuth && modelSupport?.supportsProviderChainCompaction !== true) {
      blockedReason = 'unsupported_model'
      blockedMessage = `Compaction command skipped: ${String(modelId || 'Selected OpenAI model')} does not support native server-side compaction in ADDOM.`
    } else if (!accountAuth && !String(previousResponseId || '').trim()) {
      blockedReason = 'missing_previous_response_id'
      blockedMessage = 'Compaction command skipped: no OpenAI response chain is available for this thread yet.'
    }
    const requestedCompactionMode = accountAuth
      ? COMPACTION_MODES.CODEX_THREAD_COMPACTION
      : COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION

    manualDecision = {
      requested: true,
      shouldAttempt: !blockedReason,
      blockedReason,
      blockedMessage,
      requestedCompactionMode,
      candidateCompactionModes: manualCandidateCompactionModes,
      fallbackCompactionMode: blockedReason
        ? (
          requestContext?.commandOnly === true
            ? COMPACTION_MODES.NONE
            : resolveFallbackCompactionMode(openAICompactionStrategy.mode)
        )
        : '',
      fallbackReason: blockedReason
        ? (
          requestContext?.commandOnly === true
            ? 'command_only_turn_stopped'
            : 'continue_with_standard_turn_path'
        )
        : '',
      commandOnlyStopsTurn: !!blockedReason && requestContext?.commandOnly === true,
      previousResponseId: String(previousResponseId || '').trim(),
      accountBridgeThreadId: String(accountBridgeThreadId || '').trim(),
      occupancyEstimateTokens: Number(occupancyEstimateTokens || 0) || 0,
    }
  }

  return {
    openAIContinuityEnabled,
    openAIChainCompactionPolicyAllowed,
    openAIProviderTruncationPolicyAllowed,
    effectiveOpenAIRuntimeSettings,
    openAICompactionStrategy,
    providerChainCompactionUsable,
    shouldStoreOpenAIState,
    selectedCompactionMode,
    candidateCompactionModes,
    automaticAccountCompactionDecision,
    manualDecision,
    contextManagementDiagnostics,
  }
}
