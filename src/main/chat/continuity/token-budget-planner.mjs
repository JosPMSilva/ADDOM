import { normalizeContinuityPolicy, resolveContinuityProfile } from './continuity-policy.mjs'

function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function hasFiniteNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value))
}

function resolveOccupancyCandidate(occupancySignal = null, contextOccupancyTokens = null) {
  const signal = occupancySignal && typeof occupancySignal === 'object'
    ? occupancySignal
    : null
  if (!signal && hasFiniteNumber(contextOccupancyTokens)) {
    return {
      tokens: Number(contextOccupancyTokens),
      usageSource: 'context_occupancy',
      confidence: 'rough_estimate',
      provenance: 'rough_estimate',
    }
  }
  const providerVerifiedTokens = hasFiniteNumber(signal?.providerVerifiedThreadOccupancyTokens)
    ? Number(signal.providerVerifiedThreadOccupancyTokens)
    : null
  if (providerVerifiedTokens !== null) {
    return {
      tokens: providerVerifiedTokens,
      usageSource: 'provider_verified_thread_occupancy',
      confidence: 'provider_verified',
      provenance: 'provider_verified',
    }
  }

  const estimatedTokens = hasFiniteNumber(signal?.estimatedThreadOccupancyTokens)
    ? Number(signal.estimatedThreadOccupancyTokens)
    : null
  const estimatedConfidence = String(signal?.estimatedThreadOccupancyConfidence || '').trim().toLowerCase()
  if (estimatedTokens !== null && estimatedConfidence === 'calibrated_estimate') {
    return {
      tokens: estimatedTokens,
      usageSource: 'calibrated_thread_estimate',
      confidence: 'calibrated_estimate',
      provenance: 'calibrated_estimate',
    }
  }

  const threadOccupancyTokens = hasFiniteNumber(signal?.threadOccupancyTokens)
    ? Number(signal.threadOccupancyTokens)
    : (
        hasFiniteNumber(contextOccupancyTokens)
          ? Number(contextOccupancyTokens)
          : null
      )
  const threadOccupancyConfidence = String(signal?.threadOccupancyConfidence || '').trim().toLowerCase()
  if (threadOccupancyTokens !== null && threadOccupancyConfidence === 'calibrated_estimate') {
    return {
      tokens: threadOccupancyTokens,
      usageSource: 'calibrated_thread_estimate',
      confidence: 'calibrated_estimate',
      provenance: 'calibrated_estimate',
    }
  }

  if (estimatedTokens !== null) {
    return {
      tokens: estimatedTokens,
      usageSource: 'rough_thread_estimate',
      confidence: estimatedConfidence || 'rough_estimate',
      provenance: estimatedConfidence || 'rough_estimate',
    }
  }

  if (threadOccupancyTokens !== null) {
    return {
      tokens: threadOccupancyTokens,
      usageSource: threadOccupancyConfidence === 'provider_mapped'
        ? 'provider_mapped_thread_estimate'
        : 'rough_thread_estimate',
      confidence: threadOccupancyConfidence || 'rough_estimate',
      provenance: threadOccupancyConfidence || 'rough_estimate',
    }
  }

  return {
    tokens: null,
    usageSource: 'occupancy_unavailable',
    confidence: 'unavailable',
    provenance: 'unavailable',
  }
}

export function planContinuityTokenBudget({
  modelLimit = 0,
  maxOutputTokens = null,
  rollingTotalTokens = 0,
  contextOccupancyTokens = null,
  occupancySignal = null,
  policy = {},
  promptBudgetProfile = null,
} = {}) {
  const normalized = normalizeContinuityPolicy(policy)
  const { key: profileKey, profile } = resolveContinuityProfile(normalized)

  const limit = clampInt(modelLimit, 0, 0, 10_000_000)
  const occupancyCandidate = resolveOccupancyCandidate(occupancySignal, contextOccupancyTokens)
  // Important: rollingTotalTokens is cumulative spend across the conversation,
  // not current prompt occupancy. Do not use it for continuity/compaction budgeting.
  // We keep the parameter for telemetry/backward compatibility with existing callers.
  void rollingTotalTokens
  const used = clampInt(occupancyCandidate.tokens !== null ? occupancyCandidate.tokens : 0, 0, 0, 10_000_000)
  const remaining = Math.max(0, limit - used)

  const ratioOutputReserve = Math.max(256, Math.floor(limit * profile.outputReserveRatio))
  const explicitMaxOutput = hasFiniteNumber(maxOutputTokens)
    ? clampInt(Number(maxOutputTokens), ratioOutputReserve, 1, 10_000_000)
    : null
  const outputReserve = explicitMaxOutput !== null
    ? Math.max(1, Math.min(ratioOutputReserve, explicitMaxOutput))
    : ratioOutputReserve
  const toolReserve = Math.max(192, Math.floor(limit * profile.toolReserveRatio))
  const profilePacketCap = Math.max(256, Math.floor(limit * profile.packetTokensRatio))
  const policyHardPacketCap = clampInt(normalized.maxContinuityPacketTokens, 7000, 500, 64_000)
  const providerHardPacketCap = clampInt(
    promptBudgetProfile?.continuityBudgetTokens,
    policyHardPacketCap,
    256,
    64_000,
  )
  const hardPacketCap = Math.min(policyHardPacketCap, providerHardPacketCap)
  const desiredPacket = Math.min(profilePacketCap, hardPacketCap)

  const availableForContinuity = Math.max(0, remaining - outputReserve - toolReserve)
  const tokenBudget = Math.max(0, Math.min(desiredPacket, availableForContinuity))
  const budgetReductionReasons = []
  if (hardPacketCap < policyHardPacketCap) budgetReductionReasons.push('provider_profile_cap')
  if (tokenBudget < desiredPacket) budgetReductionReasons.push('occupancy_pressure')

  return {
    enabled: normalized.enabled,
    profileKey,
    injectEveryRound: !!profile.injectEveryRound,
    limit,
    used,
    remaining,
    usageSource: occupancyCandidate.usageSource,
    occupancyConfidence: occupancyCandidate.confidence,
    occupancyProvenance: occupancyCandidate.provenance,
    reserves: {
      output: outputReserve,
      tools: toolReserve,
    },
    maxOutputTokens: explicitMaxOutput,
    packet: {
      desired: desiredPacket,
      budget: tokenBudget,
      hardCap: hardPacketCap,
      policyHardCap: policyHardPacketCap,
      providerHardCap: providerHardPacketCap,
      budgetReductionApplied: budgetReductionReasons.length > 0,
      budgetReductionReasons,
    },
    maxInjectedFacts: Math.max(
      2,
      Math.min(clampInt(normalized.maxInjectedFacts, 18, 2, 120), clampInt(profile.maxInjectedFacts, 16, 2, 120)),
    ),
    maxSourceRefs: clampInt(profile.maxSourceRefs, 18, 2, 120),
  }
}
