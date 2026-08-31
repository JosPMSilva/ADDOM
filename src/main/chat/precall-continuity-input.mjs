import { estimateHistoryTokens } from './context-compaction.mjs'

function toInt(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback
}

function asOptionalTokenCount(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.max(0, Math.round(n)) : null
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function resolveProviderVerifiedThreadOccupancy(latestContextUsage = null) {
  const usage = latestContextUsage && typeof latestContextUsage === 'object'
    ? latestContextUsage
    : null
  if (!usage) return null
  const occupancySource = normalizeText(
    usage.threadOccupancySource || usage.occupancySource,
  ).toLowerCase()
  const occupancyConfidence = normalizeText(
    usage.threadOccupancyConfidence || usage.occupancyConfidence,
  ).toLowerCase()
  const providerVerifiedThreadOccupancyTokens = asOptionalTokenCount(
    usage.providerVerifiedThreadOccupancyTokens,
  )
  const fallbackThreadOccupancyTokens = asOptionalTokenCount(
    usage.threadOccupancyTokens ?? usage.contextOccupancyTokens,
  )
  if (occupancySource !== 'provider_thread_context' || occupancyConfidence !== 'provider_verified') {
    return null
  }
  const tokens = providerVerifiedThreadOccupancyTokens ?? fallbackThreadOccupancyTokens
  if (tokens === null) return null
  return {
    tokens,
    source: occupancySource,
    confidence: occupancyConfidence,
    method: normalizeText(
      usage.threadOccupancyMethod || usage.occupancyMethod,
      'provider_thread_occupancy_tokens',
    ),
    provenance: 'provider_verified',
  }
}

export function buildPreCallContinuityInput({
  history = [],
  round = 1,
  rollingUsage = {},
  userMessage = '',
  latestContextUsage = null,
  promptOccupancyEstimateTokens = null,
  promptOccupancyEstimateConfidence = '',
  promptOccupancyEstimateMethod = '',
} = {}) {
  const normalizedHistory = Array.isArray(history) ? history : []
  const estimatedThreadOccupancyTokens = asOptionalTokenCount(promptOccupancyEstimateTokens)
    ?? toInt(estimateHistoryTokens(normalizedHistory), 0)
  const estimatedThreadOccupancyConfidence = normalizeText(
    promptOccupancyEstimateConfidence,
    'rough_estimate',
  )
  const estimatedThreadOccupancyMethod = normalizeText(
    promptOccupancyEstimateMethod,
    'history_estimate',
  )
  const providerVerifiedThreadOccupancy = resolveProviderVerifiedThreadOccupancy(latestContextUsage)
  const selectedThreadOccupancy = providerVerifiedThreadOccupancy
    ? providerVerifiedThreadOccupancy
    : {
        tokens: estimatedThreadOccupancyTokens,
        source: estimatedThreadOccupancyConfidence === 'calibrated_estimate'
          ? 'estimated_history'
          : 'thread_local_estimate',
        confidence: estimatedThreadOccupancyConfidence,
        method: estimatedThreadOccupancyMethod,
        provenance: estimatedThreadOccupancyConfidence === 'calibrated_estimate'
          ? 'calibrated_estimate'
          : 'rough_estimate',
      }
  return {
    preCallOccupancyEstimateTokens: estimatedThreadOccupancyTokens,
    continuityInput: {
      history: normalizedHistory,
      round: Math.max(1, toInt(round, 1)),
      rollingTotalTokens: toInt(rollingUsage?.totalTokens, 0),
      contextOccupancyTokens: selectedThreadOccupancy.tokens,
      occupancySignal: {
        threadOccupancyTokens: selectedThreadOccupancy.tokens,
        threadOccupancyAvailable: true,
        threadOccupancySource: selectedThreadOccupancy.source,
        threadOccupancyConfidence: selectedThreadOccupancy.confidence,
        threadOccupancyMethod: selectedThreadOccupancy.method,
        threadOccupancyProvenance: selectedThreadOccupancy.provenance,
        estimatedThreadOccupancyTokens,
        estimatedThreadOccupancyConfidence,
        estimatedThreadOccupancyMethod,
        providerVerifiedThreadOccupancyTokens: providerVerifiedThreadOccupancy?.tokens ?? null,
      },
      userMessage: String(userMessage ?? ''),
    },
  }
}
