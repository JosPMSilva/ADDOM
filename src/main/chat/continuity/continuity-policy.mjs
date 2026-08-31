const PROFILE_KEYS = ['economy', 'balanced', 'deep', 'custom']
const ARCHITECTURE_KEYS = ['hybrid_tiered']
const SCOPE_KEYS = ['thread_project', 'thread_only', 'workspace']

export const DEFAULT_CONTINUITY_POLICY = Object.freeze({
  enabled: true,
  architecture: 'hybrid_tiered',
  defaultScope: 'thread_only',
  latencyP95TargetMs: 300,
  activeProfile: 'balanced',
  maxContinuityPacketTokens: 7000,
  maxInjectedFacts: 18,
  driftGuardEnabled: true,
  invariantChecksEnabled: true,
  contradictionChecksEnabled: true,
  providerChainCompactionEnabled: false,
  providerTruncationEnabled: false,
  providerCompactionAllowlist: ['openai'],
  profiles: {
    economy: {
      packetTokensRatio: 0.08,
      outputReserveRatio: 0.18,
      toolReserveRatio: 0.1,
      maxInjectedFacts: 8,
      maxSourceRefs: 10,
      injectEveryRound: false,
    },
    balanced: {
      packetTokensRatio: 0.14,
      outputReserveRatio: 0.2,
      toolReserveRatio: 0.12,
      maxInjectedFacts: 16,
      maxSourceRefs: 18,
      injectEveryRound: false,
    },
    deep: {
      packetTokensRatio: 0.22,
      outputReserveRatio: 0.22,
      toolReserveRatio: 0.13,
      maxInjectedFacts: 28,
      maxSourceRefs: 30,
      injectEveryRound: true,
    },
    custom: {
      packetTokensRatio: 0.14,
      outputReserveRatio: 0.2,
      toolReserveRatio: 0.12,
      maxInjectedFacts: 16,
      maxSourceRefs: 18,
      injectEveryRound: false,
    },
  },
})

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function clampInt(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max))
}

function clampRatio(value, fallback) {
  return clampNumber(value, fallback, 0.01, 0.8)
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key)
}

function normalizeAllowlist(raw, fallback) {
  const rows = Array.isArray(raw) ? raw : fallback
  const out = []
  for (const item of rows) {
    const value = String(item ?? '').trim().toLowerCase()
    if (!value || out.includes(value)) continue
    out.push(value)
  }
  return out.length > 0 ? out.slice(0, 12) : [...fallback]
}

function normalizeProfile(raw = {}, fallback = {}) {
  const hasInjectEveryRound = Object.prototype.hasOwnProperty.call(raw || {}, 'injectEveryRound')
  return {
    packetTokensRatio: clampRatio(raw.packetTokensRatio, fallback.packetTokensRatio),
    outputReserveRatio: clampRatio(raw.outputReserveRatio, fallback.outputReserveRatio),
    toolReserveRatio: clampRatio(raw.toolReserveRatio, fallback.toolReserveRatio),
    maxInjectedFacts: clampInt(raw.maxInjectedFacts, fallback.maxInjectedFacts, 2, 80),
    maxSourceRefs: clampInt(raw.maxSourceRefs, fallback.maxSourceRefs, 2, 120),
    injectEveryRound: hasInjectEveryRound ? !!raw.injectEveryRound : !!fallback.injectEveryRound,
  }
}

export function normalizeContinuityPolicy(raw = {}, fallback = DEFAULT_CONTINUITY_POLICY) {
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_CONTINUITY_POLICY
  const input = raw && typeof raw === 'object' ? raw : {}
  const legacyProviderNativeCompactionEnabled = hasOwn(input, 'providerNativeCompactionEnabled')
    ? input.providerNativeCompactionEnabled === true
    : false
  const providerChainCompactionEnabled = hasOwn(input, 'providerChainCompactionEnabled')
    ? !!input.providerChainCompactionEnabled
    : legacyProviderNativeCompactionEnabled
  const providerTruncationEnabled = hasOwn(input, 'providerTruncationEnabled')
    ? !!input.providerTruncationEnabled
    : false
  const providerCompactionAllowlist = normalizeAllowlist(
    hasOwn(input, 'providerCompactionAllowlist')
      ? input.providerCompactionAllowlist
      : input.providerNativeAllowlist,
    base.providerCompactionAllowlist,
  )

  const architecture = ARCHITECTURE_KEYS.includes(String(input.architecture || '').trim())
    ? String(input.architecture).trim()
    : base.architecture
  const defaultScope = SCOPE_KEYS.includes(String(input.defaultScope || '').trim())
    ? String(input.defaultScope).trim()
    : base.defaultScope
  const activeProfile = PROFILE_KEYS.includes(String(input.activeProfile || '').trim())
    ? String(input.activeProfile).trim()
    : base.activeProfile

  const profilesIn = input.profiles && typeof input.profiles === 'object' ? input.profiles : {}
  const normalizedProfiles = {}
  for (const key of PROFILE_KEYS) {
    normalizedProfiles[key] = normalizeProfile(profilesIn[key], base.profiles[key])
  }

  return {
    enabled: input.enabled !== false,
    architecture,
    defaultScope,
    latencyP95TargetMs: clampInt(input.latencyP95TargetMs, base.latencyP95TargetMs, 50, 3_000),
    activeProfile,
    maxContinuityPacketTokens: clampInt(
      input.maxContinuityPacketTokens,
      base.maxContinuityPacketTokens,
      500,
      64_000,
    ),
    maxInjectedFacts: clampInt(input.maxInjectedFacts, base.maxInjectedFacts, 2, 120),
    driftGuardEnabled: input.driftGuardEnabled !== false,
    invariantChecksEnabled: input.invariantChecksEnabled !== false,
    contradictionChecksEnabled: input.contradictionChecksEnabled !== false,
    providerChainCompactionEnabled,
    providerTruncationEnabled,
    providerCompactionAllowlist,
    profiles: normalizedProfiles,
  }
}

export function resolveContinuityProfile(policy = DEFAULT_CONTINUITY_POLICY) {
  const normalized = normalizeContinuityPolicy(policy)
  const key = normalized.activeProfile
  const profile = normalized.profiles[key] || normalized.profiles.balanced
  return { key, profile, policy: normalized }
}

function isProviderCompactionAllowed(providerId, policy = DEFAULT_CONTINUITY_POLICY) {
  const normalized = normalizeContinuityPolicy(policy)
  const provider = String(providerId ?? '').trim().toLowerCase()
  if (!provider) return false
  return normalized.providerCompactionAllowlist.includes(provider)
}

export function isProviderChainCompactionAllowed(providerId, policy = DEFAULT_CONTINUITY_POLICY) {
  const normalized = normalizeContinuityPolicy(policy)
  if (!normalized.providerChainCompactionEnabled) return false
  return isProviderCompactionAllowed(providerId, normalized)
}

export function isProviderTruncationAllowed(providerId, policy = DEFAULT_CONTINUITY_POLICY) {
  const normalized = normalizeContinuityPolicy(policy)
  if (!normalized.providerTruncationEnabled) return false
  return isProviderCompactionAllowed(providerId, normalized)
}
