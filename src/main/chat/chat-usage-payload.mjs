import { mapProviderContextUsage } from './context-usage-provider-mapping.mjs'

function asTokenCount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.max(0, Math.round(n)) : 0
}

function asTokenCountOrNull(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.max(0, Math.round(n)) : null
}

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function deriveLimitPrecision(source = '') {
  const s = String(source || '').trim().toLowerCase()
  if (s === 'provider' || s === 'exact') return 'exact'
  if (s === 'openrouter_fallback' || s === 'verified_fallback') return 'verified_fallback'
  return 'estimated'
}

export function buildChatUsagePayload({
  threadId = '',
  turnId = '',
  providerId = '',
  usage = {},
  providerResponseMeta = null,
  modelContext = {},
  promptOccupancyEstimateTokens = 0,
  rollingUsage = {},
  round = 1,
  sourceOverride = '',
  limitProvenanceOverride = '',
  limitPrecisionOverride = '',
  occupancySourceOverride = '',
  usagePlane = 'thread_context',
  providerUsageAvailable = undefined,
  authMethod = '',
  transportMode = '',
  promptOccupancyEstimateConfidence = 'rough_estimate',
  promptOccupancyEstimateMethod = 'history_estimate',
} = {}) {
  const usageInput = asTokenCount(usage?.inputTokens)
  const usageOutput = asTokenCount(usage?.outputTokens)
  const usageReasoning = asTokenCount(usage?.reasoningTokens)
  const usageTotal = asTokenCount(usage?.totalTokens) || (usageInput + usageOutput + usageReasoning)

  const providerInputLimitTokens = asTokenCountOrNull(providerResponseMeta?.inputLimitTokens)
  const providerRemainingContextTokens = asTokenCountOrNull(
    providerResponseMeta?.remainingContextTokens
    ?? providerResponseMeta?.contextRemainingTokens
    ?? providerResponseMeta?.remainingTokens,
  )
  const modelLimit = providerInputLimitTokens ?? Math.max(0, safeNumber(modelContext?.limitTokens, 0))
  const normalizedAuthMethod = String(authMethod || '').trim()
  const normalizedTransportMode = String(transportMode || '').trim()
  const occupancyTelemetry = mapProviderContextUsage({
    providerId,
    usage,
    providerResponseMeta,
    promptOccupancyEstimateTokens,
    promptOccupancyEstimateConfidence,
    promptOccupancyEstimateMethod,
    authMethod: normalizedAuthMethod,
  })
  const rawOccupancyTokens = Math.max(0, safeNumber(occupancyTelemetry?.effectiveOccupancyTokens, 0))
  const occupancyTokens = modelLimit > 0
    ? Math.min(rawOccupancyTokens, modelLimit)
    : rawOccupancyTokens
  const contextRemainingTokens = providerRemainingContextTokens ?? Math.max(0, modelLimit - occupancyTokens)
  const source = String(sourceOverride || (providerInputLimitTokens !== null ? 'provider' : modelContext?.source) || 'estimated')
  const provenance = String(limitProvenanceOverride || (providerInputLimitTokens !== null ? 'provider_response_meta' : modelContext?.provenance) || source || 'estimated')
  const precision = String(limitPrecisionOverride || (providerInputLimitTokens !== null ? 'exact' : modelContext?.precision) || deriveLimitPrecision(provenance))
  const normalizedUsagePlane = String(usagePlane || 'thread_context').trim() || 'thread_context'
  const normalizedProviderUsageAvailable = typeof providerUsageAvailable === 'boolean'
    ? providerUsageAvailable
    : occupancyTelemetry.providerUsageAvailable
  const rollingTotalTokens = Math.max(0, safeNumber(rollingUsage?.totalTokens, 0))

  return {
    threadId: String(threadId || ''),
    turnId: String(turnId || ''),
    usage: {
      inputTokens: usageInput,
      outputTokens: usageOutput,
      totalTokens: usageTotal,
      ...(usageReasoning > 0 ? { reasoningTokens: usageReasoning } : {}),
    },
    modelLimit,
    ...(Number.isFinite(Number(modelContext?.maxOutputTokens)) ? { maxOutputTokens: Number(modelContext.maxOutputTokens) } : {}),
    source,
    limitProvenance: provenance,
    limitPrecision: precision,
    limitLastVerified: modelContext?.lastVerified ? String(modelContext.lastVerified) : '',
    occupancySource: String(occupancySourceOverride || occupancyTelemetry.occupancySource || 'estimated_history'),
    occupancyConfidence: String(occupancyTelemetry.occupancyConfidence || 'rough_estimate'),
    occupancyMethod: String(occupancyTelemetry.occupancyMethod || 'history_estimate'),
    providerUsageSemantics: String(occupancyTelemetry.providerUsageSemantics || 'estimate_only'),
    providerInputTokens: occupancyTelemetry.providerInputTokens,
    providerInputNoCacheTokens: occupancyTelemetry.providerInputNoCacheTokens,
    providerCachedReadTokens: occupancyTelemetry.providerCachedReadTokens,
    providerCachedWriteTokens: occupancyTelemetry.providerCachedWriteTokens,
    providerOutputTokens: occupancyTelemetry.providerOutputTokens,
    providerReasoningTokens: occupancyTelemetry.providerReasoningTokens,
    providerTotalTokens: occupancyTelemetry.providerTotalTokens,
    providerBilledInputTokens: occupancyTelemetry.providerBilledInputTokens,
    providerBilledTotalTokens: occupancyTelemetry.providerBilledTotalTokens,
    providerOccupancyTokens: occupancyTelemetry.providerOccupancyTokens,
    estimatedOccupancyTokens: occupancyTelemetry.estimatedOccupancyTokens,
    effectiveOccupancyTokens: occupancyTelemetry.effectiveOccupancyTokens,
    threadOccupancyTokens: occupancyTelemetry.threadOccupancyTokens,
    threadOccupancyAvailable: occupancyTelemetry.threadOccupancyAvailable,
    threadOccupancySource: occupancyTelemetry.threadOccupancySource,
    threadOccupancyConfidence: occupancyTelemetry.threadOccupancyConfidence,
    threadOccupancyMethod: occupancyTelemetry.threadOccupancyMethod,
    threadOccupancyProvenance: occupancyTelemetry.threadOccupancyProvenance,
    estimatedThreadOccupancyTokens: occupancyTelemetry.estimatedThreadOccupancyTokens,
    providerVerifiedThreadOccupancyTokens: occupancyTelemetry.providerVerifiedThreadOccupancyTokens,
    contextOccupancyTokens: occupancyTokens,
    contextRemainingTokens,
    remainingTokens: contextRemainingTokens,
    usagePlane: normalizedUsagePlane,
    providerUsageAvailable: normalizedProviderUsageAvailable,
    accountBridgeThreadId: String(providerResponseMeta?.accountBridgeThreadId || '').trim(),
    accountBridgeTurnId: String(providerResponseMeta?.accountBridgeTurnId || '').trim(),
    contextCompactionGeneration: Math.max(0, safeNumber(providerResponseMeta?.contextCompactionGeneration, 0)),
    latestMeasuredTurnTokens: usageTotal,
    sessionSpendTokens: rollingTotalTokens,
    ...(normalizedAuthMethod ? { authMethod: normalizedAuthMethod } : {}),
    ...(normalizedTransportMode ? { transportMode: normalizedTransportMode } : {}),
    rollingInputTokens: Math.max(0, safeNumber(rollingUsage?.inputTokens, 0)),
    rollingOutputTokens: Math.max(0, safeNumber(rollingUsage?.outputTokens, 0)),
    rollingReasoningTokens: Math.max(0, safeNumber(rollingUsage?.reasoningTokens, 0)),
    rollingTotalTokens,
    round: Math.max(1, Math.round(safeNumber(round, 1))),
  }
}
