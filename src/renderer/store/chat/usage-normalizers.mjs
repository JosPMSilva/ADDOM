import { normalizeCompactionLifecycle } from '../../../common/chat/compaction-lifecycle.mjs'
export { reduceAccountContextUsageSnapshot } from '../../../common/chat/account-context-usage-state.mjs'

function asFiniteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asTokenCount(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.max(0, Math.round(n)) : fallback
}

function asOptionalTokenCount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.max(0, Math.round(n)) : null
}

function normalizeText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function hasExplicitOccupancyPlane(payload = {}) {
  return [
    'providerOccupancyTokens',
    'estimatedOccupancyTokens',
    'effectiveOccupancyTokens',
    'occupancyConfidence',
    'occupancyMethod',
    'providerUsageSemantics',
  ].some((key) => Object.prototype.hasOwnProperty.call(payload, key))
}

function isProviderBackedOccupancySource(value = '') {
  const source = normalizeText(value).toLowerCase()
  return source === 'provider_rendered_input'
    || source === 'provider_mapped_input'
    || source === 'provider_thread_context'
}

function normalizeLegacyOccupancySource(value = '') {
  const source = normalizeText(value, 'estimated_history')
  return isProviderBackedOccupancySource(source) ? 'estimated_history' : source
}

function normalizeLegacyOccupancyMethod(value = '') {
  const method = normalizeText(value)
  return method || 'legacy_context_usage'
}

function normalizeLegacyOccupancyConfidence(value = '') {
  const confidence = normalizeText(value)
  if (!confidence || confidence === 'provider_verified' || confidence === 'provider_mapped') {
    return 'rough_estimate'
  }
  return confidence
}

function deriveThreadOccupancyProvenance({
  occupancySource = '',
  occupancyConfidence = '',
} = {}) {
  const normalizedSource = normalizeText(occupancySource).toLowerCase()
  const normalizedConfidence = normalizeText(occupancyConfidence).toLowerCase()
  if (normalizedSource === 'provider_thread_context' && normalizedConfidence === 'provider_verified') {
    return 'provider_verified'
  }
  if (normalizedConfidence === 'provider_mapped') return 'provider_mapped'
  if (normalizedConfidence === 'calibrated_estimate') return 'calibrated_estimate'
  if (normalizedConfidence === 'rough_estimate') return 'rough_estimate'
  return 'unavailable'
}

function resolveOccupancyPlane(payload = {}) {
  const explicitPlane = hasExplicitOccupancyPlane(payload)
  const providerOccupancyTokens = asOptionalTokenCount(payload.providerOccupancyTokens)
  const estimatedOccupancyTokens = asOptionalTokenCount(payload.estimatedOccupancyTokens)
  const effectiveOccupancyTokens = asOptionalTokenCount(payload.effectiveOccupancyTokens)
  const legacyContextOccupancyTokens = asOptionalTokenCount(payload.contextOccupancyTokens)
  const explicitSource = normalizeText(payload.occupancySource)
  const explicitConfidence = normalizeText(payload.occupancyConfidence)
  const explicitMethod = normalizeText(payload.occupancyMethod)
  const explicitSemantics = normalizeText(payload.providerUsageSemantics)

  if (providerOccupancyTokens !== null) {
    const occupancySource = explicitSource || 'provider_mapped_input'
    const occupancyConfidence = explicitConfidence || (
      explicitSource === 'provider_rendered_input' ? 'provider_verified' : 'provider_mapped'
    )
    const occupancyMethod = explicitMethod || 'provider_occupancy'
    return {
      providerOccupancyTokens,
      estimatedOccupancyTokens: estimatedOccupancyTokens ?? null,
      effectiveOccupancyTokens: providerOccupancyTokens,
      occupancySource,
      occupancyConfidence,
      occupancyMethod,
      providerUsageSemantics: explicitSemantics || 'provider_usage',
      occupancyAvailable: true,
      threadOccupancyTokens: providerOccupancyTokens,
      threadOccupancyAvailable: true,
      threadOccupancySource: occupancySource,
      threadOccupancyConfidence: occupancyConfidence,
      threadOccupancyMethod: occupancyMethod,
      threadOccupancyProvenance: deriveThreadOccupancyProvenance({ occupancySource, occupancyConfidence }),
      estimatedThreadOccupancyTokens: estimatedOccupancyTokens ?? null,
      providerVerifiedThreadOccupancyTokens: occupancySource === 'provider_thread_context' && occupancyConfidence === 'provider_verified'
        ? providerOccupancyTokens
        : null,
    }
  }

  if (explicitPlane) {
    const estimateTokens = estimatedOccupancyTokens ?? effectiveOccupancyTokens ?? legacyContextOccupancyTokens
    const confidence = explicitConfidence || 'rough_estimate'
    const occupancySource = explicitSource || 'estimated_history'
    const occupancyMethod = explicitMethod || 'history_estimate'
    return {
      providerOccupancyTokens: null,
      estimatedOccupancyTokens: estimateTokens,
      effectiveOccupancyTokens: estimateTokens ?? 0,
      occupancySource,
      occupancyConfidence: confidence,
      occupancyMethod,
      providerUsageSemantics: explicitSemantics || 'estimate_only',
      occupancyAvailable: estimateTokens !== null,
      threadOccupancyTokens: estimateTokens ?? 0,
      threadOccupancyAvailable: estimateTokens !== null,
      threadOccupancySource: occupancySource,
      threadOccupancyConfidence: confidence,
      threadOccupancyMethod: occupancyMethod,
      threadOccupancyProvenance: deriveThreadOccupancyProvenance({ occupancySource, occupancyConfidence: confidence }),
      estimatedThreadOccupancyTokens: estimateTokens,
      providerVerifiedThreadOccupancyTokens: null,
    }
  }

  if (legacyContextOccupancyTokens !== null) {
    const occupancySource = normalizeLegacyOccupancySource(payload.occupancySource)
    const occupancyConfidence = normalizeLegacyOccupancyConfidence(payload.occupancyConfidence)
    const occupancyMethod = normalizeLegacyOccupancyMethod(payload.occupancyMethod)
    return {
      providerOccupancyTokens: null,
      estimatedOccupancyTokens: legacyContextOccupancyTokens,
      effectiveOccupancyTokens: legacyContextOccupancyTokens,
      occupancySource,
      occupancyConfidence,
      occupancyMethod,
      providerUsageSemantics: explicitSemantics || 'legacy_context_occupancy_alias',
      occupancyAvailable: true,
      threadOccupancyTokens: legacyContextOccupancyTokens,
      threadOccupancyAvailable: true,
      threadOccupancySource: occupancySource,
      threadOccupancyConfidence: occupancyConfidence,
      threadOccupancyMethod: occupancyMethod,
      threadOccupancyProvenance: deriveThreadOccupancyProvenance({ occupancySource, occupancyConfidence }),
      estimatedThreadOccupancyTokens: legacyContextOccupancyTokens,
      providerVerifiedThreadOccupancyTokens: null,
    }
  }

  return {
    providerOccupancyTokens: null,
    estimatedOccupancyTokens: null,
    effectiveOccupancyTokens: 0,
    occupancySource: 'unavailable',
    occupancyConfidence: 'unavailable',
    occupancyMethod: explicitMethod || 'unavailable',
    providerUsageSemantics: explicitSemantics || 'occupancy_unavailable',
    occupancyAvailable: false,
    threadOccupancyTokens: 0,
    threadOccupancyAvailable: false,
    threadOccupancySource: 'unavailable',
    threadOccupancyConfidence: 'unavailable',
    threadOccupancyMethod: explicitMethod || 'unavailable',
    threadOccupancyProvenance: 'unavailable',
    estimatedThreadOccupancyTokens: null,
    providerVerifiedThreadOccupancyTokens: null,
  }
}

export function normalizeContextUsagePayload(payload = {}, {
  currentTotals = null,
  fallbackThreadId = '',
  fallbackTurnId = '',
  fallbackUpdatedAt = 0,
} = {}) {
  const compactionLifecycle = normalizeCompactionLifecycle({
    strategy: payload.compactionStrategy || payload.strategy,
    scope: payload.compactionScope || payload.scope,
    compactionSource: payload.compactionSource,
    usageRefreshState: payload.usageRefreshState,
    status: 'applied',
    remainingContextTokens: payload.contextRemainingTokens ?? payload.remainingTokens,
    threadOccupancyTokens: payload.threadOccupancyTokens ?? payload.contextOccupancyTokens,
    effectiveOccupancyTokens: payload.effectiveOccupancyTokens,
    estimatedAfterTokens: payload.estimatedOccupancyTokens,
  })
  const usage = payload?.usage && typeof payload.usage === 'object' ? payload.usage : {}
  const inputTokens = asTokenCount(usage.inputTokens, 0)
  const outputTokens = asTokenCount(usage.outputTokens, 0)
  const reasoningTokens = asTokenCount(usage.reasoningTokens, 0)
  const totalTokens = asTokenCount(
    usage.totalTokens,
    inputTokens + outputTokens + reasoningTokens,
  )
  const rollingBase = currentTotals && typeof currentTotals === 'object' ? currentTotals : {}
  const rollingInputTokens = asTokenCount(
    payload.rollingInputTokens,
    asTokenCount(rollingBase.inputTokens, 0) + inputTokens,
  )
  const rollingOutputTokens = asTokenCount(
    payload.rollingOutputTokens,
    asTokenCount(rollingBase.outputTokens, 0) + outputTokens,
  )
  const rollingReasoningTokens = asTokenCount(
    payload.rollingReasoningTokens,
    asTokenCount(rollingBase.reasoningTokens, 0) + reasoningTokens,
  )
  const rollingTotalTokens = asTokenCount(
    payload.rollingTotalTokens,
    asTokenCount(rollingBase.totalTokens, 0) + totalTokens,
  )
  const modelLimit = asTokenCount(payload.modelLimit, 0)
  const occupancy = resolveOccupancyPlane(payload)
  const explicitRemainingTokens = asOptionalTokenCount(payload.contextRemainingTokens)
  const legacyRemainingTokens = asOptionalTokenCount(payload.remainingTokens)
  const contextRemainingTokens = explicitRemainingTokens ?? legacyRemainingTokens ?? (
    occupancy.occupancyAvailable && modelLimit > 0
      ? Math.max(0, modelLimit - occupancy.effectiveOccupancyTokens)
      : 0
  )
  const providerUsageAvailable = typeof payload.providerUsageAvailable === 'boolean'
    ? payload.providerUsageAvailable
    : [
      inputTokens,
      outputTokens,
      totalTokens,
      reasoningTokens,
      asFiniteNumber(payload.providerInputTokens, 0),
      asFiniteNumber(payload.providerOutputTokens, 0),
      asFiniteNumber(payload.providerTotalTokens, 0),
      asFiniteNumber(payload.providerBilledInputTokens, 0),
      asFiniteNumber(payload.providerBilledTotalTokens, 0),
      asFiniteNumber(payload.providerCachedReadTokens, 0),
      asFiniteNumber(payload.providerCachedWriteTokens, 0),
    ].some((value) => Number.isFinite(value) && value > 0)
  const limitProvenance = normalizeText(payload.limitProvenance || payload.source, 'estimated')
  const limitPrecision = normalizeText(payload.limitPrecision, (
    limitProvenance === 'provider' || limitProvenance === 'exact'
      ? 'exact'
      : (limitProvenance === 'openrouter_fallback' || limitProvenance === 'verified_fallback'
        ? 'verified_fallback'
        : 'estimated')
  ))

  return {
    threadId: normalizeText(payload.threadId, normalizeText(fallbackThreadId)),
    turnId: normalizeText(payload.turnId, normalizeText(fallbackTurnId)),
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    latestMeasuredTurnTokens: asTokenCount(payload.latestMeasuredTurnTokens, totalTokens),
    rollingInputTokens,
    rollingOutputTokens,
    rollingReasoningTokens,
    rollingTotalTokens,
    sessionSpendTokens: asTokenCount(payload.sessionSpendTokens, rollingTotalTokens),
    modelLimit,
    maxOutputTokens: asTokenCount(payload.maxOutputTokens, 0),
    threadOccupancyTokens: occupancy.threadOccupancyTokens,
    threadOccupancyAvailable: occupancy.threadOccupancyAvailable,
    threadOccupancySource: occupancy.threadOccupancySource,
    threadOccupancyConfidence: occupancy.threadOccupancyConfidence,
    threadOccupancyMethod: occupancy.threadOccupancyMethod,
    threadOccupancyProvenance: occupancy.threadOccupancyProvenance,
    estimatedThreadOccupancyTokens: occupancy.estimatedThreadOccupancyTokens,
    providerVerifiedThreadOccupancyTokens: occupancy.providerVerifiedThreadOccupancyTokens,
    contextOccupancyTokens: occupancy.effectiveOccupancyTokens,
    effectiveOccupancyTokens: occupancy.effectiveOccupancyTokens,
    estimatedOccupancyTokens: occupancy.estimatedOccupancyTokens,
    contextRemainingTokens,
    remainingTokens: contextRemainingTokens,
    emptyThreadContextLeftFallback: payload?.emptyThreadContextLeftFallback === true,
    source: normalizeText(payload.source, 'estimated'),
    limitProvenance,
    limitPrecision,
    limitLastVerified: normalizeText(payload.limitLastVerified),
    occupancySource: occupancy.occupancySource,
    occupancyConfidence: occupancy.occupancyConfidence,
    occupancyMethod: occupancy.occupancyMethod,
    providerUsageSemantics: occupancy.providerUsageSemantics,
    usagePlane: normalizeText(payload.usagePlane, 'thread_context'),
    providerUsageAvailable,
    accountBridgeThreadId: normalizeText(payload.accountBridgeThreadId),
    accountBridgeTurnId: normalizeText(payload.accountBridgeTurnId),
    contextCompactionGeneration: asTokenCount(payload.contextCompactionGeneration, 0),
    contextUsageAnomaly: normalizeText(payload.contextUsageAnomaly),
    contextUsageMonotonicAdjusted: payload.contextUsageMonotonicAdjusted === true,
    providerInputTokens: asOptionalTokenCount(payload.providerInputTokens),
    providerInputNoCacheTokens: asOptionalTokenCount(payload.providerInputNoCacheTokens),
    providerCachedReadTokens: asOptionalTokenCount(payload.providerCachedReadTokens),
    providerCachedWriteTokens: asOptionalTokenCount(payload.providerCachedWriteTokens),
    providerOutputTokens: asOptionalTokenCount(payload.providerOutputTokens),
    providerReasoningTokens: asOptionalTokenCount(payload.providerReasoningTokens),
    providerTotalTokens: asOptionalTokenCount(payload.providerTotalTokens),
    providerBilledInputTokens: asOptionalTokenCount(payload.providerBilledInputTokens),
    providerBilledTotalTokens: asOptionalTokenCount(payload.providerBilledTotalTokens),
    providerOccupancyTokens: occupancy.providerOccupancyTokens,
    occupancyAvailable: occupancy.occupancyAvailable,
    compactionStrategy: compactionLifecycle.strategy,
    compactionScope: compactionLifecycle.scope,
    compactionSource: compactionLifecycle.source,
    usageRefreshState: compactionLifecycle.usageRefreshState,
    authMethod: normalizeText(payload.authMethod),
    transportMode: normalizeText(payload.transportMode),
    updatedAt: asFiniteNumber(payload.updatedAt, asFiniteNumber(fallbackUpdatedAt, 0)),
  }
}

export function createEmptyContextUsage() {
  return {
    threadId: '',
    turnId: '',
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    latestMeasuredTurnTokens: 0,
    rollingInputTokens: 0,
    rollingOutputTokens: 0,
    rollingReasoningTokens: 0,
    rollingTotalTokens: 0,
    sessionSpendTokens: 0,
    modelLimit: 0,
    maxOutputTokens: 0,
    threadOccupancyTokens: 0,
    threadOccupancyAvailable: false,
    threadOccupancySource: 'unavailable',
    threadOccupancyConfidence: 'unavailable',
    threadOccupancyMethod: 'unavailable',
    threadOccupancyProvenance: 'unavailable',
    estimatedThreadOccupancyTokens: null,
    providerVerifiedThreadOccupancyTokens: null,
    contextOccupancyTokens: 0,
    effectiveOccupancyTokens: 0,
    estimatedOccupancyTokens: null,
    contextRemainingTokens: 0,
    remainingTokens: 0,
    emptyThreadContextLeftFallback: false,
    source: 'estimated',
    limitProvenance: 'estimated',
    limitPrecision: 'estimated',
    limitLastVerified: '',
    occupancySource: 'estimated_history',
    occupancyConfidence: 'rough_estimate',
    occupancyMethod: 'history_estimate',
    providerUsageSemantics: 'estimate_only',
    usagePlane: 'thread_context',
    providerUsageAvailable: false,
    accountBridgeThreadId: '',
    accountBridgeTurnId: '',
    contextCompactionGeneration: 0,
    contextUsageAnomaly: '',
    contextUsageMonotonicAdjusted: false,
    providerInputTokens: null,
    providerInputNoCacheTokens: null,
    providerCachedReadTokens: null,
    providerCachedWriteTokens: null,
    providerOutputTokens: null,
    providerReasoningTokens: null,
    providerTotalTokens: null,
    providerBilledInputTokens: null,
    providerBilledTotalTokens: null,
    providerOccupancyTokens: null,
    occupancyAvailable: false,
    compactionStrategy: '',
    compactionScope: '',
    compactionSource: '',
    usageRefreshState: 'none',
    authMethod: '',
    transportMode: '',
    updatedAt: 0,
  }
}

export function createEmptyCostEstimate() {
  return {
    threadId: '',
    turnId: '',
    providerId: '',
    model: '',
    mode: 'execute',
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedTotalTokens: 0,
    estimatedUsd: null,
    usdAvailable: false,
    estimateConfidence: 'token_only',
    pricingWarning: '',
    source: 'pre_turn',
    contextLimitTokens: 0,
    maxOutputTokens: 0,
    emittedAt: 0,
  }
}

export function createEmptyContinuityStatus() {
  return {
    threadId: '',
    turnId: '',
    enabled: false,
    architecture: 'hybrid_tiered',
    profile: 'balanced',
    scope: 'thread_project',
    phase: '',
    tokenBudget: 0,
    packetTokens: 0,
    driftRisk: 'low',
    sourceRefCount: 0,
    removedMessages: 0,
    estimatedBeforeTokens: 0,
    estimatedAfterTokens: 0,
    packetId: '',
    updatedAt: 0,
  }
}
