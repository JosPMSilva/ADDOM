import { normalizeCompactionLifecycle } from '../../common/chat/compaction-lifecycle.mjs'
import {
  resolveOpenAIAccountUsageRefreshTelemetry,
} from '../api-clients/ai-provider-openai-account-telemetry.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function asTokenCountOrNull(value = null) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.max(0, Math.round(n))
}

function asTokenCount(value = null) {
  return asTokenCountOrNull(value) ?? 0
}

function normalizeUsageRecord(usage = {}) {
  const inputTokens = asTokenCount(usage?.inputTokens)
  const outputTokens = asTokenCount(usage?.outputTokens)
  const reasoningTokens = asTokenCountOrNull(usage?.reasoningTokens)
  const totalTokens = asTokenCountOrNull(usage?.totalTokens)
    ?? (inputTokens + outputTokens + (reasoningTokens ?? 0))
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(reasoningTokens !== null ? { reasoningTokens } : {}),
  }
}

function resolveVerifiedOccupancyTokens({
  modelLimit = null,
  remainingContextTokens = null,
  threadOccupancyTokens = null,
} = {}) {
  const explicitOccupancy = asTokenCountOrNull(threadOccupancyTokens)
  if (explicitOccupancy !== null) return explicitOccupancy
  const limit = asTokenCountOrNull(modelLimit)
  const remaining = asTokenCountOrNull(remainingContextTokens)
  if (limit !== null && remaining !== null) {
    return Math.max(0, limit - remaining)
  }
  return null
}

export function buildCompactionUsageRefreshPayload({
  threadId = '',
  turnId = '',
  usage = {},
  modelLimit = null,
  remainingContextTokens = null,
  threadOccupancyTokens = null,
  estimatedAfterTokens = null,
  strategy = '',
  scope = '',
  compactionSource = '',
  status = 'applied',
  usageRefreshState = '',
  authMethod = '',
  transportMode = '',
  providerUsageSemantics = '',
  accountBridgeThreadId = '',
  accountBridgeTurnId = '',
  contextCompactionGeneration = 0,
} = {}) {
  const lifecycle = normalizeCompactionLifecycle({
    strategy,
    scope,
    compactionSource,
    status,
    usageRefreshState,
    remainingContextTokens,
    threadOccupancyTokens,
    estimatedAfterTokens,
  })
  if (!lifecycle.strategy) return null

  const normalizedUsage = usage && typeof usage === 'object' && !Array.isArray(usage)
    ? normalizeUsageRecord(usage)
    : normalizeUsageRecord({})
  const limit = asTokenCountOrNull(modelLimit)
  const remaining = asTokenCountOrNull(remainingContextTokens)
  const verifiedOccupancyTokens = resolveVerifiedOccupancyTokens({
    modelLimit: limit,
    remainingContextTokens: remaining,
    threadOccupancyTokens,
  })
  const estimatedOccupancy = asTokenCountOrNull(estimatedAfterTokens)
  const payload = {
    threadId: normalizeId(threadId),
    turnId: normalizeId(turnId),
    usage: normalizedUsage,
    compactionStrategy: lifecycle.strategy,
    compactionScope: lifecycle.scope,
    compactionSource: lifecycle.source,
    usageRefreshState: lifecycle.usageRefreshState,
    occupancySource: 'unavailable',
    occupancyConfidence: 'unavailable',
    occupancyMethod: lifecycle.usageRefreshState === 'recalculating'
      ? 'compaction_recalculation_pending'
      : 'unavailable',
    providerUsageSemantics: providerUsageSemantics || (
      lifecycle.usageRefreshState === 'recalculating'
        ? 'compaction_recalculation_pending'
        : 'occupancy_unavailable'
    ),
    providerUsageAvailable: false,
    accountBridgeThreadId: normalizeId(accountBridgeThreadId),
    accountBridgeTurnId: normalizeId(accountBridgeTurnId),
    contextCompactionGeneration: Math.max(0, Number(contextCompactionGeneration || 0) || 0),
    ...(limit !== null ? { modelLimit: limit } : {}),
    ...(normalizeId(authMethod) ? { authMethod: normalizeId(authMethod).toLowerCase() } : {}),
    ...(normalizeId(transportMode) ? { transportMode: normalizeId(transportMode).toLowerCase() } : {}),
  }

  if (lifecycle.usageRefreshState === 'verified' && (remaining !== null || verifiedOccupancyTokens !== null)) {
    return {
      ...payload,
      source: 'provider',
      limitProvenance: 'provider_response_meta',
      limitPrecision: 'exact',
      providerUsageSemantics: providerUsageSemantics || 'openai_account_provider_context',
      providerUsageAvailable: true,
      occupancySource: 'provider_thread_context',
      occupancyConfidence: 'provider_verified',
      occupancyMethod: 'provider_thread_context',
      ...(remaining !== null ? { contextRemainingTokens: remaining, remainingTokens: remaining } : {}),
      ...(verifiedOccupancyTokens !== null
        ? {
            contextOccupancyTokens: verifiedOccupancyTokens,
            effectiveOccupancyTokens: verifiedOccupancyTokens,
            providerOccupancyTokens: verifiedOccupancyTokens,
            threadOccupancyTokens: verifiedOccupancyTokens,
            threadOccupancyAvailable: true,
            threadOccupancySource: 'provider_thread_context',
            threadOccupancyConfidence: 'provider_verified',
            threadOccupancyMethod: 'provider_thread_context',
            threadOccupancyProvenance: 'provider_verified',
            providerVerifiedThreadOccupancyTokens: verifiedOccupancyTokens,
          }
        : {
            threadOccupancyAvailable: false,
            threadOccupancySource: 'unavailable',
            threadOccupancyConfidence: 'unavailable',
            threadOccupancyMethod: 'unavailable',
            threadOccupancyProvenance: 'unavailable',
            providerVerifiedThreadOccupancyTokens: null,
          }),
    }
  }

  if (lifecycle.usageRefreshState === 'estimated' && estimatedOccupancy !== null) {
    return {
      ...payload,
      source: 'estimated',
      limitProvenance: 'estimated',
      limitPrecision: 'estimated',
      estimatedOccupancyTokens: estimatedOccupancy,
      effectiveOccupancyTokens: estimatedOccupancy,
      contextOccupancyTokens: estimatedOccupancy,
      threadOccupancyTokens: estimatedOccupancy,
      threadOccupancyAvailable: true,
      threadOccupancySource: 'thread_local_estimate',
      threadOccupancyConfidence: 'calibrated_estimate',
      threadOccupancyMethod: 'compaction_estimate',
      threadOccupancyProvenance: 'calibrated_estimate',
      estimatedThreadOccupancyTokens: estimatedOccupancy,
      providerVerifiedThreadOccupancyTokens: null,
      occupancySource: 'thread_local_estimate',
      occupancyConfidence: 'calibrated_estimate',
      occupancyMethod: 'compaction_estimate',
      providerUsageSemantics: providerUsageSemantics || 'compaction_estimate_only',
      ...(limit !== null
        ? {
            contextRemainingTokens: Math.max(0, limit - estimatedOccupancy),
            remainingTokens: Math.max(0, limit - estimatedOccupancy),
          }
        : {}),
    }
  }

  return {
    ...payload,
    source: 'estimated',
    limitProvenance: 'estimated',
    limitPrecision: 'estimated',
    threadOccupancyTokens: 0,
    threadOccupancyAvailable: false,
    threadOccupancySource: 'unavailable',
    threadOccupancyConfidence: 'unavailable',
    threadOccupancyMethod: payload.occupancyMethod,
    threadOccupancyProvenance: 'unavailable',
    estimatedThreadOccupancyTokens: null,
    providerVerifiedThreadOccupancyTokens: null,
  }
}

export function buildOpenAIAccountCompactionUsageRefreshPayload({
  threadId = '',
  turnId = '',
  completedTurn = null,
  latestThreadTokenUsageTelemetry = null,
  strategy = 'codex_thread_compaction',
  scope = 'thread_reset',
  compactionSource = 'provider',
  status = 'applied',
  authMethod = 'account',
  transportMode = 'codex_app_server_chatgpt',
  accountBridgeThreadId = '',
  accountBridgeTurnId = '',
  contextCompactionGeneration = 0,
} = {}) {
  const { usage, contextTelemetry } = resolveOpenAIAccountUsageRefreshTelemetry({
    completedTurn,
    threadTokenUsageTelemetry: latestThreadTokenUsageTelemetry,
  })
  return buildCompactionUsageRefreshPayload({
    threadId,
    turnId,
    usage: usage || {},
    modelLimit: contextTelemetry?.inputLimitTokens ?? null,
    remainingContextTokens: contextTelemetry?.remainingContextTokens ?? null,
    threadOccupancyTokens: contextTelemetry?.threadOccupancyTokens ?? null,
    strategy,
    scope,
    compactionSource,
    status,
    authMethod,
    transportMode,
    providerUsageSemantics: contextTelemetry?.providerUsageSemantics || '',
    accountBridgeThreadId,
    accountBridgeTurnId,
    contextCompactionGeneration,
  })
}
