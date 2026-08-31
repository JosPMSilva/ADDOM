const OCCUPANCY_FIELDS = [
  'providerOccupancyTokens',
  'estimatedOccupancyTokens',
  'effectiveOccupancyTokens',
  'threadOccupancyTokens',
  'threadOccupancyAvailable',
  'threadOccupancySource',
  'threadOccupancyConfidence',
  'threadOccupancyMethod',
  'threadOccupancyProvenance',
  'estimatedThreadOccupancyTokens',
  'providerVerifiedThreadOccupancyTokens',
  'contextOccupancyTokens',
  'contextRemainingTokens',
  'remainingTokens',
  'occupancySource',
  'occupancyConfidence',
  'occupancyMethod',
  'providerUsageSemantics',
]

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeGeneration(value = 0) {
  const generation = Number(value)
  return Number.isInteger(generation) && generation >= 0 ? generation : 0
}

function asOccupancy(value) {
  const occupancy = Number(value)
  return Number.isFinite(occupancy) && occupancy >= 0 ? Math.round(occupancy) : null
}

function isAccountProviderContext(snapshot = null) {
  return Boolean(
    snapshot
    && typeof snapshot === 'object'
    && normalizeId(snapshot.authMethod).toLowerCase() === 'account'
    && normalizeId(snapshot.accountBridgeThreadId)
    && normalizeId(snapshot.occupancySource).toLowerCase() === 'provider_thread_context'
    && asOccupancy(snapshot.contextOccupancyTokens) !== null
  )
}

function retainOccupancy(current = {}, incoming = {}, anomaly = '') {
  const next = { ...incoming }
  for (const field of OCCUPANCY_FIELDS) {
    next[field] = current[field]
  }
  return {
    ...next,
    contextUsageAnomaly: anomaly,
    contextUsageMonotonicAdjusted: true,
  }
}

export function reduceAccountContextUsageSnapshot(current = null, incoming = null) {
  if (!incoming || typeof incoming !== 'object') return current
  const normalizedIncoming = {
    ...incoming,
    accountBridgeThreadId: normalizeId(incoming.accountBridgeThreadId),
    accountBridgeTurnId: normalizeId(incoming.accountBridgeTurnId),
    contextCompactionGeneration: normalizeGeneration(incoming.contextCompactionGeneration),
  }
  if (!isAccountProviderContext(current) || !isAccountProviderContext(normalizedIncoming)) {
    return normalizedIncoming
  }

  const currentBridgeThreadId = normalizeId(current.accountBridgeThreadId)
  const incomingBridgeThreadId = normalizedIncoming.accountBridgeThreadId
  if (currentBridgeThreadId !== incomingBridgeThreadId) {
    if (normalizedIncoming.providerSessionBoundary === true) return normalizedIncoming
    return {
      ...current,
      contextUsageAnomaly: 'account_context_usage_stale_bridge',
      contextUsageMonotonicAdjusted: true,
      rejectedAccountBridgeThreadId: incomingBridgeThreadId,
    }
  }

  const currentGeneration = normalizeGeneration(current.contextCompactionGeneration)
  const incomingGeneration = normalizedIncoming.contextCompactionGeneration
  if (incomingGeneration < currentGeneration) {
    return retainOccupancy(
      current,
      normalizedIncoming,
      'account_context_usage_stale_generation',
    )
  }
  if (incomingGeneration > currentGeneration) return normalizedIncoming

  const currentOccupancy = asOccupancy(current.contextOccupancyTokens)
  const incomingOccupancy = asOccupancy(normalizedIncoming.contextOccupancyTokens)
  if (currentOccupancy !== null && incomingOccupancy !== null && incomingOccupancy < currentOccupancy) {
    return retainOccupancy(
      current,
      normalizedIncoming,
      'account_context_usage_regression_without_compaction',
    )
  }
  return normalizedIncoming
}
