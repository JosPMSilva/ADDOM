function applyAccountThreadEstimateUsageSemantics(contextUsage = {}) {
  const effectiveOccupancyTokens = Number.isFinite(Number(contextUsage?.effectiveOccupancyTokens))
    ? Number(contextUsage.effectiveOccupancyTokens)
    : (Number.isFinite(Number(contextUsage?.contextOccupancyTokens))
      ? Number(contextUsage.contextOccupancyTokens)
      : 0)
  const hasExplicitOccupancy = (
    Number.isFinite(Number(contextUsage?.effectiveOccupancyTokens))
    || Number.isFinite(Number(contextUsage?.contextOccupancyTokens))
  )
  const occupancyAvailable = typeof contextUsage?.occupancyAvailable === 'boolean'
    ? contextUsage.occupancyAvailable
    : hasExplicitOccupancy
  return {
    ...contextUsage,
    latestMeasuredTurnTokens: Number.isFinite(Number(contextUsage?.latestMeasuredTurnTokens))
      ? Number(contextUsage.latestMeasuredTurnTokens)
      : (Number.isFinite(Number(contextUsage?.totalTokens)) ? Number(contextUsage.totalTokens) : 0),
    sessionSpendTokens: Number.isFinite(Number(contextUsage?.sessionSpendTokens))
      ? Number(contextUsage.sessionSpendTokens)
      : (Number.isFinite(Number(contextUsage?.rollingTotalTokens)) ? Number(contextUsage.rollingTotalTokens) : 0),
    threadOccupancyTokens: Number.isFinite(Number(contextUsage?.threadOccupancyTokens))
      ? Number(contextUsage.threadOccupancyTokens)
      : effectiveOccupancyTokens,
    threadOccupancyAvailable: typeof contextUsage?.threadOccupancyAvailable === 'boolean'
      ? contextUsage.threadOccupancyAvailable
      : occupancyAvailable,
    threadOccupancySource: String(contextUsage?.threadOccupancySource || contextUsage?.occupancySource || 'thread_local_estimate'),
    threadOccupancyConfidence: String(contextUsage?.threadOccupancyConfidence || contextUsage?.occupancyConfidence || 'rough_estimate'),
    threadOccupancyMethod: String(contextUsage?.threadOccupancyMethod || contextUsage?.occupancyMethod || 'thread_local_estimate'),
    threadOccupancyProvenance: String(contextUsage?.threadOccupancyProvenance || 'rough_estimate'),
    estimatedThreadOccupancyTokens: Number.isFinite(Number(contextUsage?.estimatedThreadOccupancyTokens))
      ? Number(contextUsage.estimatedThreadOccupancyTokens)
      : effectiveOccupancyTokens,
    providerVerifiedThreadOccupancyTokens: Number.isFinite(Number(contextUsage?.providerVerifiedThreadOccupancyTokens))
      ? Number(contextUsage.providerVerifiedThreadOccupancyTokens)
      : null,
    contextOccupancyTokens: effectiveOccupancyTokens,
    effectiveOccupancyTokens,
    estimatedOccupancyTokens: Number.isFinite(Number(contextUsage?.estimatedOccupancyTokens))
      ? Number(contextUsage.estimatedOccupancyTokens)
      : effectiveOccupancyTokens,
    source: 'account_thread_local_estimate',
    limitProvenance: 'account_thread_local_estimate',
    limitPrecision: 'estimated',
    occupancySource: 'thread_local_estimate',
    occupancyConfidence: 'rough_estimate',
    occupancyMethod: String(contextUsage?.occupancyMethod || 'thread_local_estimate'),
    occupancyAvailable,
    usagePlane: 'thread_context',
    providerUsageAvailable: contextUsage?.providerUsageAvailable === true ? true : false,
    authMethod: String(contextUsage?.authMethod || 'account'),
  }
}

function hasProviderBackedAccountOccupancy(contextUsage = {}) {
  if (Number.isFinite(Number(contextUsage?.providerOccupancyTokens))) return true
  const occupancySource = String(contextUsage?.occupancySource || '').trim().toLowerCase()
  return occupancySource === 'provider_thread_context'
}

function shouldEnableEmptyThreadContextLeftFallback(contextUsage = {}, { threadIsEmpty = false } = {}) {
  if (threadIsEmpty !== true) return false
  if (String(contextUsage?.usageRefreshState || '').trim().toLowerCase() === 'recalculating') return false
  const modelLimit = Number(contextUsage?.modelLimit || 0)
  if (!(modelLimit > 0)) return false
  const threadOccupancyAvailable = typeof contextUsage?.threadOccupancyAvailable === 'boolean'
    ? contextUsage.threadOccupancyAvailable
    : (typeof contextUsage?.occupancyAvailable === 'boolean' ? contextUsage.occupancyAvailable : false)
  if (threadOccupancyAvailable === true) return false
  return true
}

function applyEmptyThreadContextLeftFallback(contextUsage = {}, options = {}) {
  const emptyThreadContextLeftFallback = shouldEnableEmptyThreadContextLeftFallback(contextUsage, options)
  return {
    ...contextUsage,
    emptyThreadContextLeftFallback,
  }
}

export function providerSupportsContextMeter(provider = null) {
  return provider?.capabilities?.contextTelemetry !== false
}

export function buildContextMeterUsage(contextUsage = {}, activeModelManifest = null, options = {}) {
  const accountThreadEstimate = options?.accountThreadEstimate === true
    && !hasProviderBackedAccountOccupancy(contextUsage)
  const existingLimit = Number(contextUsage?.modelLimit || 0)
  if (existingLimit > 0) {
    const usageWithSemantics = accountThreadEstimate
      ? applyAccountThreadEstimateUsageSemantics(contextUsage)
      : contextUsage
    return applyEmptyThreadContextLeftFallback(usageWithSemantics, options)
  }

  const fallbackLimit = Number(
    activeModelManifest?.contextWindowTokens
    || activeModelManifest?.contextWindow
    || 0,
  )
  if (fallbackLimit <= 0) return contextUsage

  const fallbackProvenance = accountThreadEstimate
    ? 'account_thread_local_estimate'
    : String(
      activeModelManifest?.contextWindowProvenance
      || activeModelManifest?.contextWindowSource
      || contextUsage?.limitProvenance
      || contextUsage?.source
      || 'estimated',
    )
  const fallbackPrecision = String(
    (accountThreadEstimate ? 'estimated' : activeModelManifest?.contextWindowPrecision)
    || contextUsage?.limitPrecision
    || (
      fallbackProvenance === 'provider' || fallbackProvenance === 'exact'
        ? 'exact'
        : (fallbackProvenance === 'openrouter_fallback' || fallbackProvenance === 'verified_fallback'
          ? 'verified_fallback'
          : 'estimated')
    ),
  )
  const effectiveOccupancyTokens = Number.isFinite(Number(contextUsage?.effectiveOccupancyTokens))
    ? Number(contextUsage.effectiveOccupancyTokens)
    : Number(contextUsage?.contextOccupancyTokens || 0)
  const hasExplicitOccupancy = (
    Number.isFinite(Number(contextUsage?.effectiveOccupancyTokens))
    || Number.isFinite(Number(contextUsage?.contextOccupancyTokens))
  )
  const occupancyAvailable = typeof contextUsage?.occupancyAvailable === 'boolean'
    ? contextUsage.occupancyAvailable
    : hasExplicitOccupancy
  const fallbackRemainingTokens = Math.max(0, fallbackLimit - effectiveOccupancyTokens)

  const nextUsage = {
    ...contextUsage,
    modelLimit: fallbackLimit,
    latestMeasuredTurnTokens: Number.isFinite(Number(contextUsage?.latestMeasuredTurnTokens))
      ? Number(contextUsage.latestMeasuredTurnTokens)
      : (Number.isFinite(Number(contextUsage?.totalTokens)) ? Number(contextUsage.totalTokens) : 0),
    sessionSpendTokens: Number.isFinite(Number(contextUsage?.sessionSpendTokens))
      ? Number(contextUsage.sessionSpendTokens)
      : (Number.isFinite(Number(contextUsage?.rollingTotalTokens)) ? Number(contextUsage.rollingTotalTokens) : 0),
    threadOccupancyTokens: Number.isFinite(Number(contextUsage?.threadOccupancyTokens))
      ? Number(contextUsage.threadOccupancyTokens)
      : effectiveOccupancyTokens,
    threadOccupancyAvailable: typeof contextUsage?.threadOccupancyAvailable === 'boolean'
      ? contextUsage.threadOccupancyAvailable
      : occupancyAvailable,
    threadOccupancySource: String(contextUsage?.threadOccupancySource || contextUsage?.occupancySource || 'estimated_history'),
    threadOccupancyConfidence: String(contextUsage?.threadOccupancyConfidence || contextUsage?.occupancyConfidence || 'rough_estimate'),
    threadOccupancyMethod: String(contextUsage?.threadOccupancyMethod || contextUsage?.occupancyMethod || 'history_estimate'),
    threadOccupancyProvenance: String(contextUsage?.threadOccupancyProvenance || (
      String(contextUsage?.threadOccupancyConfidence || contextUsage?.occupancyConfidence || '').trim().toLowerCase() || 'rough_estimate'
    )),
    estimatedThreadOccupancyTokens: Number.isFinite(Number(contextUsage?.estimatedThreadOccupancyTokens))
      ? Number(contextUsage.estimatedThreadOccupancyTokens)
      : (
          Number.isFinite(Number(contextUsage?.estimatedOccupancyTokens))
            ? Number(contextUsage.estimatedOccupancyTokens)
            : effectiveOccupancyTokens
        ),
    providerVerifiedThreadOccupancyTokens: Number.isFinite(Number(contextUsage?.providerVerifiedThreadOccupancyTokens))
      ? Number(contextUsage.providerVerifiedThreadOccupancyTokens)
      : null,
    contextOccupancyTokens: effectiveOccupancyTokens,
    effectiveOccupancyTokens,
    estimatedOccupancyTokens: Number.isFinite(Number(contextUsage?.estimatedOccupancyTokens))
      ? Number(contextUsage.estimatedOccupancyTokens)
      : contextUsage?.estimatedOccupancyTokens,
    contextRemainingTokens: fallbackRemainingTokens,
    remainingTokens: fallbackRemainingTokens,
    source: String(accountThreadEstimate ? 'account_thread_local_estimate' : (activeModelManifest?.contextWindowSource || contextUsage?.source || 'estimated')),
    limitProvenance: fallbackProvenance,
    limitPrecision: fallbackPrecision,
    limitLastVerified: String(activeModelManifest?.contextWindowVerifiedAt || contextUsage?.limitLastVerified || ''),
    occupancyAvailable,
  }
  const usageWithSemantics = accountThreadEstimate ? applyAccountThreadEstimateUsageSemantics(nextUsage) : nextUsage
  return applyEmptyThreadContextLeftFallback(usageWithSemantics, options)
}
