import {
  buildProviderTruncationBudget,
  resolveProviderTruncationTriggerTokens,
} from '../../../common/chat/provider-truncation-budget-policy.mjs'
import { resolveOpenAICompactionStrategy } from '../../api-clients/openai-server-side-compaction.mjs'
import { COMPACTION_MODES } from './compaction-mode-contract.mjs'
import {
  isProviderChainCompactionAllowed,
  isProviderTruncationAllowed,
} from './continuity-policy.mjs'

function asObject(value = null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizePositiveInt(value = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0
}

function resolveAutomaticThresholdTokens({
  configuredThresholdTokens = 0,
  modelContextLimitTokens = 0,
  softTriggerPercent = 85,
  criticalTaskState = null,
} = {}) {
  const configuredThreshold = normalizePositiveInt(configuredThresholdTokens)
  if (configuredThreshold > 0) return configuredThreshold
  const budget = buildProviderTruncationBudget({
    modelContextLimitTokens,
    softTriggerPercent,
  })
  return resolveProviderTruncationTriggerTokens({
    budget,
    criticalTaskState,
    fallbackTokens: budget.softTriggerTokens,
  })
}

function buildContextManagementDiagnostics({
  providerId = '',
  authMethod = '',
  selectedStrategy = COMPACTION_MODES.LOCAL_SUMMARY,
  skippedReasons = [],
  fallbackStrategy = '',
  fallbackReason = '',
  thresholdTokens = 0,
} = {}) {
  const uniqueSkippedReasons = []
  const seen = new Set()
  for (const reason of Array.isArray(skippedReasons) ? skippedReasons : []) {
    const normalized = normalizeId(reason)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    uniqueSkippedReasons.push(normalized)
  }
  return {
    providerId: normalizeId(providerId),
    authMethod: normalizeId(authMethod) || 'api_key',
    selectedStrategy: normalizeId(selectedStrategy) || COMPACTION_MODES.LOCAL_SUMMARY,
    skippedReasons: uniqueSkippedReasons,
    fallbackStrategy: normalizeId(fallbackStrategy),
    fallbackReason: normalizeId(fallbackReason),
    thresholdTokens: normalizePositiveInt(thresholdTokens),
  }
}

export function resolveOpenAIAutomaticContextManagement({
  providerId = '',
  modelSupport = null,
  providerRuntimeSettings = null,
  continuityPolicy = null,
  requestContext = {},
  openAIExecutionAuthContext = null,
  accountBridgeThreadId = '',
  occupancyEstimateTokens = 0,
  modelContextLimitTokens = 0,
  criticalTaskState = null,
} = {}) {
  const openAIContinuityEnabled = normalizeId(providerId) === 'openai'
  const authMethod = normalizeId(openAIExecutionAuthContext?.authMethod) || 'api_key'
  const accountAuth = openAIContinuityEnabled && authMethod === 'account'
  const normalizedRuntimeSettings = asObject(asObject(providerRuntimeSettings).openai)
  const openAIChainCompactionPolicyAllowed = openAIContinuityEnabled
    ? isProviderChainCompactionAllowed('openai', continuityPolicy || {})
    : false
  const openAIProviderTruncationPolicyAllowed = openAIContinuityEnabled
    ? isProviderTruncationAllowed('openai', continuityPolicy || {})
    : false
  const openAIChainCompactionRuntimeAllowed = normalizedRuntimeSettings.useResponseCompaction === true
  const effectiveOpenAIRuntimeSettings = openAIContinuityEnabled
    ? {
      ...normalizedRuntimeSettings,
      useResponseCompaction: (
        openAIChainCompactionPolicyAllowed
        && openAIChainCompactionRuntimeAllowed
      ),
      useServerSideCompaction: (
        openAIProviderTruncationPolicyAllowed
        && normalizedRuntimeSettings.useServerSideCompaction === true
      ),
    }
    : {}

  const openAICompactionStrategy = accountAuth
    ? { mode: COMPACTION_MODES.NONE, reason: 'account_runtime_separate', thresholdTokens: 0 }
    : (openAIContinuityEnabled
      ? resolveOpenAICompactionStrategy({
        runtimeSettings: effectiveOpenAIRuntimeSettings,
        modelSupport,
        requestContext: {
          openai: requestContext && typeof requestContext === 'object' ? requestContext : {},
        },
        forBackground: false,
        modelContextLimitTokens,
        criticalTaskState,
      })
      : { mode: COMPACTION_MODES.NONE, reason: 'not_openai', thresholdTokens: 0 })

  const accountAutoCompactionThresholdTokens = accountAuth && normalizedRuntimeSettings.codexAutoThreadCompactionEnabled === true
    ? resolveAutomaticThresholdTokens({
      configuredThresholdTokens: normalizedRuntimeSettings.codexAutoThreadCompactionTokenLimit,
      modelContextLimitTokens,
      softTriggerPercent: normalizedRuntimeSettings.providerTruncationSoftTriggerPercent,
      criticalTaskState,
    })
    : 0
  const accountBridgeThreadIdNormalized = String(accountBridgeThreadId || '').trim()
  const accountAutoCompactionSkippedReasons = []
  if (accountAuth && normalizedRuntimeSettings.codexAutoThreadCompactionEnabled === true) {
    if (!accountBridgeThreadIdNormalized) accountAutoCompactionSkippedReasons.push('missing_account_bridge_thread_id')
    if (accountAutoCompactionThresholdTokens <= 0) accountAutoCompactionSkippedReasons.push('invalid_auto_threshold')
    if (
      accountAutoCompactionThresholdTokens > 0
      && normalizePositiveInt(occupancyEstimateTokens) < accountAutoCompactionThresholdTokens
    ) {
      accountAutoCompactionSkippedReasons.push('below_threshold')
    }
  }
  const automaticAccountCompactionDecision = (
    accountAuth
    && normalizedRuntimeSettings.codexAutoThreadCompactionEnabled === true
    && accountAutoCompactionThresholdTokens > 0
    && accountBridgeThreadIdNormalized
    && normalizePositiveInt(occupancyEstimateTokens) >= accountAutoCompactionThresholdTokens
  )
    ? {
        requested: true,
        shouldAttempt: true,
        requestedCompactionMode: COMPACTION_MODES.CODEX_THREAD_COMPACTION,
        candidateCompactionModes: [
          COMPACTION_MODES.CODEX_THREAD_COMPACTION,
          COMPACTION_MODES.LOCAL_SUMMARY,
        ],
        accountBridgeThreadId: accountBridgeThreadIdNormalized,
        occupancyEstimateTokens: normalizePositiveInt(occupancyEstimateTokens),
        tokenLimit: accountAutoCompactionThresholdTokens,
        thresholdSource: normalizePositiveInt(normalizedRuntimeSettings.codexAutoThreadCompactionTokenLimit) > 0
          ? 'configured'
          : 'automatic',
      }
    : null

  const selectedStrategy = automaticAccountCompactionDecision?.shouldAttempt === true
    ? COMPACTION_MODES.CODEX_THREAD_COMPACTION
    : (
      openAICompactionStrategy.mode !== COMPACTION_MODES.NONE
        ? openAICompactionStrategy.mode
        : COMPACTION_MODES.LOCAL_SUMMARY
    )
  const skippedReasons = [
    ...accountAutoCompactionSkippedReasons,
    ...(openAICompactionStrategy.mode === COMPACTION_MODES.NONE
      ? [openAICompactionStrategy.reason || 'provider_compaction_disabled']
      : []),
  ]
  const diagnostics = buildContextManagementDiagnostics({
    providerId: openAIContinuityEnabled ? 'openai' : providerId,
    authMethod,
    selectedStrategy,
    skippedReasons,
    fallbackStrategy: selectedStrategy === COMPACTION_MODES.LOCAL_SUMMARY ? '' : COMPACTION_MODES.LOCAL_SUMMARY,
    fallbackReason: selectedStrategy === COMPACTION_MODES.LOCAL_SUMMARY ? '' : 'local_summary_available',
    thresholdTokens: automaticAccountCompactionDecision?.tokenLimit || openAICompactionStrategy.thresholdTokens || 0,
  })

  return {
    openAIContinuityEnabled,
    accountAuth,
    openAIChainCompactionPolicyAllowed,
    openAIProviderTruncationPolicyAllowed,
    effectiveOpenAIRuntimeSettings,
    openAICompactionStrategy,
    automaticAccountCompactionDecision,
    contextManagementDiagnostics: diagnostics,
  }
}

export function resolveAnthropicContextManagementStrategy({
  providerRuntimeSettings = null,
  effectiveAnthropicCommandTurnOptions = {},
  continuityPolicy = null,
  modelContext = {},
  criticalTaskState = null,
} = {}) {
  const anthropicRuntimeSettings = asObject(asObject(providerRuntimeSettings).anthropic)
  const commandThreshold = normalizePositiveInt(
    effectiveAnthropicCommandTurnOptions.forceContextManagementCompaction === true
      ? effectiveAnthropicCommandTurnOptions.contextManagementCompactionThresholdTokens
      : 0,
  )
  const runtimeThreshold = normalizePositiveInt(anthropicRuntimeSettings.contextManagementCompactionThresholdTokens)
  const thresholdTokens = resolveAutomaticThresholdTokens({
    configuredThresholdTokens: commandThreshold || runtimeThreshold,
    modelContextLimitTokens: modelContext?.limitTokens,
    softTriggerPercent: anthropicRuntimeSettings.providerTruncationSoftTriggerPercent,
    criticalTaskState,
  })
  const policyAllowed = isProviderChainCompactionAllowed('anthropic', continuityPolicy || {})
  const requested = effectiveAnthropicCommandTurnOptions.forceContextManagementCompaction === true
    ? commandThreshold > 0
    : anthropicRuntimeSettings.useContextManagementCompaction === true
  const enabled = requested && policyAllowed && thresholdTokens > 0
  const skippedReasons = []
  if (!requested) skippedReasons.push('disabled')
  if (requested && !policyAllowed) skippedReasons.push('provider_chain_compaction_disabled')
  if (requested && thresholdTokens <= 0) skippedReasons.push('invalid_threshold')
  return {
    enabled,
    thresholdTokens: enabled ? thresholdTokens : 0,
    diagnostics: buildContextManagementDiagnostics({
      providerId: 'anthropic',
      authMethod: 'api_key',
      selectedStrategy: enabled ? COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION : COMPACTION_MODES.LOCAL_SUMMARY,
      skippedReasons,
      fallbackStrategy: enabled ? COMPACTION_MODES.LOCAL_SUMMARY : '',
      fallbackReason: enabled ? 'local_summary_available' : '',
      thresholdTokens: enabled ? thresholdTokens : 0,
    }),
  }
}
