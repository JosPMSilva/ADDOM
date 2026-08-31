import { createProviderCredentialFingerprint } from '../api-clients/provider-credential-fingerprint.mjs'

const ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS = 16_000
const MAX_ADAPTIVE_PREFLIGHT_TOKENS = 180_000
const DAY_MS = 24 * 60 * 60 * 1000
const LEARNED_BUDGET_PROFILE_STALE_AFTER_MS = 7 * DAY_MS
const LEARNED_BUDGET_PROFILE_EXPIRE_AFTER_MS = 30 * DAY_MS
const ADAPTIVE_EXPLORATION_OVERRIDES = Object.freeze({
  strict: Object.freeze({
    explorationToolBudgetMode: 'strict',
    perToolOutputPreviewChars: 32_000,
    perTurnToolResultBudgetChars: 64_000,
    oldToolResultProtectChars: 24_000,
  }),
  moderate: Object.freeze({
    explorationToolBudgetMode: 'moderate',
    perToolOutputPreviewChars: 40_000,
    perTurnToolResultBudgetChars: 80_000,
    oldToolResultProtectChars: 32_000,
  }),
  relaxed: Object.freeze({
    explorationToolBudgetMode: 'relaxed',
    perToolOutputPreviewChars: 50_000,
    perTurnToolResultBudgetChars: 100_000,
    oldToolResultProtectChars: 40_000,
  }),
})

const PROFILE_DEFINITIONS = Object.freeze({
  anthropic_strict: Object.freeze({
    id: 'anthropic_strict',
    family: 'anthropic',
    strictness: 'strict',
    defaultMaxOutputTokens: ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS,
    explorationToolBudgetMode: 'strict',
    toolSchemaBudgetTokens: 12_000,
    perToolOutputPreviewChars: 32_000,
    perTurnToolResultBudgetChars: 64_000,
    oldToolResultProtectChars: 24_000,
    oldToolResultMinPruneChars: 1_000,
    oldToolResultPrune: 'aggressive',
    memoryBudgetTokens: 4_000,
    memoryTightBudgetTokens: 1_600,
    memoryMaxNodes: 6,
    memoryTightMaxNodes: 3,
    continuityBudgetTokens: 4_000,
    continuityTightBudgetTokens: 2_500,
    localPreflightInputCeilingTokens: 24_000,
    providerContextManagement: true,
  }),
  openai_moderate: Object.freeze({
    id: 'openai_moderate',
    family: 'openai',
    strictness: 'moderate',
    defaultMaxOutputTokens: null,
    explorationToolBudgetMode: 'moderate',
    toolSchemaBudgetTokens: 24_000,
    perToolOutputPreviewChars: 50_000,
    perTurnToolResultBudgetChars: 100_000,
    oldToolResultProtectChars: 40_000,
    oldToolResultMinPruneChars: 1_000,
    oldToolResultPrune: 'moderate',
    memoryBudgetTokens: 8_000,
    memoryTightBudgetTokens: 5_000,
    memoryMaxNodes: 8,
    memoryTightMaxNodes: 6,
    continuityBudgetTokens: 8_000,
    continuityTightBudgetTokens: 6_000,
    localPreflightInputCeilingTokens: null,
    providerContextManagement: true,
  }),
  generic_remote: Object.freeze({
    id: 'generic_remote',
    family: 'remote',
    strictness: 'moderate',
    defaultMaxOutputTokens: null,
    explorationToolBudgetMode: 'moderate',
    toolSchemaBudgetTokens: 16_000,
    perToolOutputPreviewChars: 40_000,
    perTurnToolResultBudgetChars: 80_000,
    oldToolResultProtectChars: 32_000,
    oldToolResultMinPruneChars: 1_000,
    oldToolResultPrune: 'moderate',
    memoryBudgetTokens: 6_000,
    memoryTightBudgetTokens: 3_600,
    memoryMaxNodes: 7,
    memoryTightMaxNodes: 5,
    continuityBudgetTokens: 6_000,
    continuityTightBudgetTokens: 4_500,
    localPreflightInputCeilingTokens: null,
    providerContextManagement: false,
  }),
  local: Object.freeze({
    id: 'local',
    family: 'local',
    strictness: 'local',
    defaultMaxOutputTokens: null,
    explorationToolBudgetMode: 'moderate',
    toolSchemaBudgetTokens: 24_000,
    perToolOutputPreviewChars: 50_000,
    perTurnToolResultBudgetChars: 100_000,
    oldToolResultProtectChars: 50_000,
    oldToolResultMinPruneChars: 1_000,
    oldToolResultPrune: 'moderate',
    memoryBudgetTokens: 8_000,
    memoryTightBudgetTokens: 5_000,
    memoryMaxNodes: 8,
    memoryTightMaxNodes: 6,
    continuityBudgetTokens: 8_000,
    continuityTightBudgetTokens: 6_000,
    localPreflightInputCeilingTokens: null,
    providerContextManagement: false,
  }),
})

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeAdaptiveExplorationMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return (
    normalized === 'strict'
    || normalized === 'moderate'
    || normalized === 'relaxed'
  )
    ? normalized
    : ''
}

function normalizeMode(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeBoolean(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback === true
}

function normalizePositiveInt(value, fallback = 0, { min = 1, max = 2_000_000 } = {}) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const fallbackNumeric = Number(fallback)
    if (!Number.isFinite(fallbackNumeric) || fallbackNumeric <= 0) return 0
    return Math.min(max, Math.max(min, Math.round(fallbackNumeric)))
  }
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function normalizeNonNegativeInt(value, fallback = 0, { max = 2_000_000 } = {}) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    const fallbackNumeric = Number(fallback)
    if (!Number.isFinite(fallbackNumeric) || fallbackNumeric < 0) return 0
    return Math.min(max, Math.max(0, Math.round(fallbackNumeric)))
  }
  return Math.min(max, Math.max(0, Math.round(numeric)))
}

function isLocalProvider(providerId = '') {
  const provider = normalizeProviderId(providerId)
  return provider === 'ollama' || provider === 'lmstudio'
}

function resolveProfileId({ providerId = '' } = {}) {
  const provider = normalizeProviderId(providerId)
  if (provider === 'anthropic') return 'anthropic_strict'
  if (provider === 'openai') return 'openai_moderate'
  if (isLocalProvider(provider)) return 'local'
  return 'generic_remote'
}

function resolveScopedRuntimeSettings(providerId = '', runtimeSettings = null) {
  if (!runtimeSettings || typeof runtimeSettings !== 'object' || Array.isArray(runtimeSettings)) {
    return null
  }
  const normalizedProviderId = normalizeProviderId(providerId)
  if (!normalizedProviderId) return runtimeSettings
  const directMatch = runtimeSettings[normalizedProviderId]
  if (directMatch && typeof directMatch === 'object' && !Array.isArray(directMatch)) return directMatch
  const scopedEntry = Object.entries(runtimeSettings).find(([key, value]) => (
    normalizeProviderId(key) === normalizedProviderId
    && value
    && typeof value === 'object'
    && !Array.isArray(value)
  ))
  return scopedEntry?.[1] || runtimeSettings
}

function applyRuntimeOverrides(profile = {}, runtimeSettings = null) {
  const scopedRuntimeSettings = resolveScopedRuntimeSettings(profile.providerId, runtimeSettings)
  const defaultMaxOutputTokensOverride = normalizePositiveInt(
    scopedRuntimeSettings?.defaultMaxOutputTokensOverride,
    0,
    { min: 256 },
  )
  const toolResultBudgetCharsOverride = normalizePositiveInt(
    scopedRuntimeSettings?.toolResultBudgetCharsOverride,
    0,
    { min: 1_000 },
  )
  const oldToolResultPruningEnabled = normalizeBoolean(
    scopedRuntimeSettings?.oldToolResultPruningEnabled,
    true,
  )
  const promptPreflightHardGuardEnabled = normalizeBoolean(
    scopedRuntimeSettings?.promptPreflightHardGuardEnabled,
    true,
  )
  const adaptiveInputCeilingOverrideTokens = normalizeNonNegativeInt(
    scopedRuntimeSettings?.adaptiveInputCeilingOverrideTokens,
    0,
    { max: MAX_ADAPTIVE_PREFLIGHT_TOKENS },
  )
  const adaptiveExplorationModeOverride = normalizeAdaptiveExplorationMode(
    scopedRuntimeSettings?.adaptiveExplorationModeOverride,
  )
  const family = String(profile?.family || '').trim().toLowerCase()
  const adaptiveExplorationOverrides = family === 'anthropic' && adaptiveExplorationModeOverride
    ? (ADAPTIVE_EXPLORATION_OVERRIDES[adaptiveExplorationModeOverride] || null)
    : null
  const adaptiveRuntimeOverrideApplied = family === 'anthropic' && (
    adaptiveInputCeilingOverrideTokens > 0
    || !!adaptiveExplorationModeOverride
  )
  const resolvedExplorationToolBudgetMode = adaptiveExplorationModeOverride
    || String(profile?.explorationToolBudgetMode || '').trim().toLowerCase()
  const resolvedAdaptivePerToolOutputPreviewChars = normalizePositiveInt(
    adaptiveExplorationOverrides?.perToolOutputPreviewChars,
    profile?.perToolOutputPreviewChars,
    { min: 1_000 },
  )
  const resolvedAdaptivePerTurnToolResultBudgetChars = normalizePositiveInt(
    adaptiveExplorationOverrides?.perTurnToolResultBudgetChars,
    profile?.perTurnToolResultBudgetChars,
    { min: 1_000 },
  )
  const resolvedAdaptiveOldToolResultProtectChars = normalizePositiveInt(
    adaptiveExplorationOverrides?.oldToolResultProtectChars,
    profile?.oldToolResultProtectChars,
    { min: 1_000 },
  )
  const resolvedLocalPreflightInputCeilingTokens = promptPreflightHardGuardEnabled === false
    ? null
    : (
      adaptiveRuntimeOverrideApplied && adaptiveInputCeilingOverrideTokens > 0
        ? adaptiveInputCeilingOverrideTokens
        : profile.localPreflightInputCeilingTokens
    )
  const resolvedAdaptivePreflightCeilingTokens = promptPreflightHardGuardEnabled === false
    ? 0
    : normalizeNonNegativeInt(
      resolvedLocalPreflightInputCeilingTokens,
      profile?.adaptiveBudgetPreflightCeilingTokens,
      { max: MAX_ADAPTIVE_PREFLIGHT_TOKENS },
    )

  return {
    ...profile,
    defaultMaxOutputTokens: defaultMaxOutputTokensOverride > 0
      ? defaultMaxOutputTokensOverride
      : profile.defaultMaxOutputTokens,
    explorationToolBudgetMode: resolvedExplorationToolBudgetMode || profile.explorationToolBudgetMode,
    perToolOutputPreviewChars: toolResultBudgetCharsOverride > 0
      ? toolResultBudgetCharsOverride
      : resolvedAdaptivePerToolOutputPreviewChars,
    perTurnToolResultBudgetChars: toolResultBudgetCharsOverride > 0
      ? toolResultBudgetCharsOverride
      : resolvedAdaptivePerTurnToolResultBudgetChars,
    oldToolResultProtectChars: toolResultBudgetCharsOverride > 0
      ? toolResultBudgetCharsOverride
      : resolvedAdaptiveOldToolResultProtectChars,
    oldToolResultPrune: oldToolResultPruningEnabled === false
      ? 'disabled'
      : profile.oldToolResultPrune,
    oldToolResultPruningEnabled,
    promptPreflightHardGuardEnabled,
    localPreflightInputCeilingTokens: resolvedLocalPreflightInputCeilingTokens,
    adaptiveBudgetPreflightCeilingTokens: resolvedAdaptivePreflightCeilingTokens,
    adaptiveBudgetResolutionSource: adaptiveRuntimeOverrideApplied
      ? 'runtime_override'
      : (String(profile?.adaptiveBudgetResolutionSource || '').trim().toLowerCase() || 'fallback_profile'),
    adaptiveBudgetResolutionReason: adaptiveRuntimeOverrideApplied
      ? 'runtime_override'
      : String(profile?.adaptiveBudgetResolutionReason || '').trim().toLowerCase(),
    adaptiveBudgetRuntimeOverrideApplied: adaptiveRuntimeOverrideApplied,
    adaptiveBudgetRuntimeOverrideSource: adaptiveRuntimeOverrideApplied
      ? 'provider_runtime_settings'
      : '',
    adaptiveBudgetRuntimeOverrideCeilingTokens: adaptiveRuntimeOverrideApplied && adaptiveInputCeilingOverrideTokens > 0
      ? adaptiveInputCeilingOverrideTokens
      : 0,
    adaptiveBudgetRuntimeOverrideExplorationMode: adaptiveRuntimeOverrideApplied
      ? adaptiveExplorationModeOverride
      : '',
    runtimeSettingsPresent: !!scopedRuntimeSettings,
  }
}

function normalizeLearnedBudgetSource(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'fallback'
  if (normalized === 'manual_override') return 'manual_override'
  if (normalized === 'observed_headers') return 'observed_headers'
  return normalized
}

function normalizeAdaptiveConfidence(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'fallback'
  return normalized
}

function resolveExplorationToolBudgetMode({ inputTpmLimit = 0 } = {}) {
  const inputTpm = normalizeNonNegativeInt(inputTpmLimit, 0)
  if (inputTpm <= 0) return 'strict'
  if (inputTpm <= 30_000) return 'strict'
  if (inputTpm <= 80_000) return 'moderate'
  return 'relaxed'
}

function resolveAdaptiveCapacityTier({ inputTpmLimit = 0 } = {}) {
  const inputTpm = normalizeNonNegativeInt(inputTpmLimit, 0, { max: 10_000_000 })
  if (inputTpm <= 0) return ''
  if (inputTpm <= 30_000) return 'low'
  if (inputTpm <= 80_000) return 'medium'
  if (inputTpm <= 200_000) return 'high'
  return 'very_high'
}

function resolveAdaptiveBudgetScope({
  organizationId = '',
  workspaceId = '',
} = {}) {
  const hasOrganization = String(organizationId || '').trim().length > 0
  const hasWorkspace = String(workspaceId || '').trim().length > 0
  if (hasOrganization && hasWorkspace) return 'organization_workspace'
  if (hasOrganization) return 'organization'
  if (hasWorkspace) return 'workspace'
  return 'credential'
}

function resolveAdaptiveBudgetResolutionReason({
  source = '',
  inputTpmLimit = 0,
  runtimeOverrideApplied = false,
} = {}) {
  if (runtimeOverrideApplied === true) return 'runtime_override'
  const normalizedSource = normalizeLearnedBudgetSource(source)
  if (normalizedSource === 'manual_override') return 'stored_manual_override'
  if (normalizedSource === 'fallback') return 'fallback_no_telemetry'
  const capacityTier = resolveAdaptiveCapacityTier({ inputTpmLimit })
  return capacityTier ? `observed_${capacityTier}_capacity` : 'observed_unknown_capacity'
}

function deriveAdaptivePreflightInputCeilingTokens({ inputTpmLimit = 0, fallback = 0 } = {}) {
  const inputTpm = normalizeNonNegativeInt(inputTpmLimit, 0, { max: 10_000_000 })
  if (inputTpm <= 0) return normalizeNonNegativeInt(fallback, 0, { max: MAX_ADAPTIVE_PREFLIGHT_TOKENS })
  if (inputTpm <= 30_000) return 20_000
  if (inputTpm <= 80_000) return 48_000
  if (inputTpm <= 200_000) return 100_000
  return Math.min(
    MAX_ADAPTIVE_PREFLIGHT_TOKENS,
    Math.max(20_000, Math.floor(inputTpm * 0.55)),
  )
}

function resolveManualOverride(record = null) {
  const manualOverride = record?.manualOverride
  if (!manualOverride || typeof manualOverride !== 'object' || Array.isArray(manualOverride)) {
    return {}
  }
  const localPreflightInputCeilingTokens = normalizeNonNegativeInt(
    manualOverride.localPreflightInputCeilingTokens,
    0,
    { max: MAX_ADAPTIVE_PREFLIGHT_TOKENS },
  )
  const explorationToolBudgetMode = String(manualOverride.explorationToolBudgetMode || '').trim().toLowerCase()
  return {
    localPreflightInputCeilingTokens,
    explorationToolBudgetMode: (
      explorationToolBudgetMode === 'strict'
      || explorationToolBudgetMode === 'moderate'
      || explorationToolBudgetMode === 'relaxed'
    )
      ? explorationToolBudgetMode
      : '',
  }
}

function hasMeaningfulAdaptiveBudgetSignal({
  inputTpmLimit = 0,
  outputTpmLimit = 0,
  requestsPerMinuteLimit = 0,
  manualOverride = {},
} = {}) {
  if (normalizeNonNegativeInt(inputTpmLimit, 0, { max: 10_000_000 }) > 0) return true
  if (normalizeNonNegativeInt(outputTpmLimit, 0, { max: 10_000_000 }) > 0) return true
  if (normalizeNonNegativeInt(requestsPerMinuteLimit, 0, { max: 100_000 }) > 0) return true
  return !!(
    normalizeNonNegativeInt(manualOverride?.localPreflightInputCeilingTokens, 0, { max: MAX_ADAPTIVE_PREFLIGHT_TOKENS }) > 0
    || normalizeAdaptiveExplorationMode(manualOverride?.explorationToolBudgetMode)
  )
}

function resolveLearnedBudgetLifecycle(record = null, { nowMs = Date.now() } = {}) {
  const lastObservedAt = normalizeNonNegativeInt(record?.lastObservedAt, 0, { max: 99_999_999_999_999 })
  const normalizedNowMs = normalizeNonNegativeInt(nowMs, Date.now(), { max: 99_999_999_999_999 }) || Date.now()
  const manualOverride = resolveManualOverride(record)
  const manualOverridePresent = (
    manualOverride.localPreflightInputCeilingTokens > 0
    || !!manualOverride.explorationToolBudgetMode
    || String(record?.profileSource || '').trim().toLowerCase() === 'manual_override'
  )
  const observationAgeMs = lastObservedAt > 0
    ? Math.max(0, normalizedNowMs - lastObservedAt)
    : 0
  const stale = manualOverridePresent === false
    && lastObservedAt > 0
    && observationAgeMs >= LEARNED_BUDGET_PROFILE_STALE_AFTER_MS
  const expired = manualOverridePresent === false && (
    lastObservedAt <= 0
    || observationAgeMs >= LEARNED_BUDGET_PROFILE_EXPIRE_AFTER_MS
  )
  return {
    manualOverride,
    manualOverridePresent,
    lastObservedAt,
    observationAgeMs,
    stale,
    expired,
  }
}

function applyLearnedBudgetProfile(profile = {}, learnedBudgetProfile = null) {
  const adaptiveFields = {
    adaptiveBudgetSource: 'fallback',
    adaptiveBudgetConfidence: 'fallback',
    adaptiveBudgetOrganizationId: '',
    adaptiveBudgetWorkspaceId: '',
    adaptiveBudgetCredentialFingerprint: '',
    adaptiveBudgetScope: '',
    adaptiveBudgetCapacityTier: '',
    adaptiveBudgetObservedInputTpm: 0,
    adaptiveBudgetObservedOutputTpm: 0,
    adaptiveBudgetObservedRpm: 0,
    adaptiveBudgetLastObservedAt: 0,
    adaptiveBudgetResolutionSource: 'fallback_profile',
    adaptiveBudgetResolutionReason: 'fallback_no_telemetry',
    adaptiveBudgetPreflightCeilingTokens: normalizeNonNegativeInt(
      profile?.localPreflightInputCeilingTokens,
      0,
      { max: MAX_ADAPTIVE_PREFLIGHT_TOKENS },
    ),
    adaptiveBudgetRuntimeOverrideApplied: false,
    adaptiveBudgetRuntimeOverrideSource: '',
    adaptiveBudgetRuntimeOverrideCeilingTokens: 0,
    adaptiveBudgetRuntimeOverrideExplorationMode: '',
  }
  if (String(profile?.family || '').trim().toLowerCase() !== 'anthropic') {
    return {
      ...profile,
      ...adaptiveFields,
    }
  }

  const record = learnedBudgetProfile && typeof learnedBudgetProfile === 'object'
    ? learnedBudgetProfile
    : null
  if (!record) {
    return {
      ...profile,
      ...adaptiveFields,
    }
  }

  const lifecycle = resolveLearnedBudgetLifecycle(record)
  const manualOverride = lifecycle.manualOverride
  const inputTpmLimit = normalizeNonNegativeInt(record.inputTpmLimit, 0, { max: 10_000_000 })
  const outputTpmLimit = normalizeNonNegativeInt(record.outputTpmLimit, 0, { max: 10_000_000 })
  const requestsPerMinuteLimit = normalizeNonNegativeInt(record.requestsPerMinuteLimit, 0, { max: 100_000 })
  if (lifecycle.expired === true) {
    return {
      ...profile,
      ...adaptiveFields,
      adaptiveBudgetResolutionReason: 'expired_observation',
    }
  }
  if (hasMeaningfulAdaptiveBudgetSignal({
    inputTpmLimit,
    outputTpmLimit,
    requestsPerMinuteLimit,
    manualOverride,
  }) !== true) {
    return {
      ...profile,
      ...adaptiveFields,
      adaptiveBudgetResolutionReason: 'invalid_observation',
    }
  }
  const derivedCeiling = manualOverride.localPreflightInputCeilingTokens > 0
    ? manualOverride.localPreflightInputCeilingTokens
    : deriveAdaptivePreflightInputCeilingTokens({
      inputTpmLimit,
      fallback: profile?.localPreflightInputCeilingTokens,
    })
  const derivedMode = manualOverride.explorationToolBudgetMode
    || resolveExplorationToolBudgetMode({ inputTpmLimit })
  const explorationOverrides = ADAPTIVE_EXPLORATION_OVERRIDES[derivedMode]
    || ADAPTIVE_EXPLORATION_OVERRIDES.strict
  const adaptiveBudgetScope = resolveAdaptiveBudgetScope({
    organizationId: record.organizationId,
    workspaceId: record.workspaceId,
  })
  const adaptiveBudgetCapacityTier = resolveAdaptiveCapacityTier({ inputTpmLimit })

  return {
    ...profile,
    ...explorationOverrides,
    localPreflightInputCeilingTokens: derivedCeiling,
    adaptiveBudgetSource: normalizeLearnedBudgetSource(record.profileSource),
    adaptiveBudgetConfidence: normalizeAdaptiveConfidence(record.confidence),
    adaptiveBudgetOrganizationId: String(record.organizationId || '').trim(),
    adaptiveBudgetWorkspaceId: String(record.workspaceId || '').trim(),
    adaptiveBudgetCredentialFingerprint: String(record.credentialFingerprint || '').trim(),
    adaptiveBudgetScope,
    adaptiveBudgetCapacityTier,
    adaptiveBudgetObservedInputTpm: inputTpmLimit,
    adaptiveBudgetObservedOutputTpm: outputTpmLimit,
    adaptiveBudgetObservedRpm: requestsPerMinuteLimit,
    adaptiveBudgetLastObservedAt: lifecycle.lastObservedAt,
    adaptiveBudgetResolutionSource: 'learned_profile',
    adaptiveBudgetResolutionReason: lifecycle.stale === true
      ? 'stale_observation'
      : resolveAdaptiveBudgetResolutionReason({
        source: record.profileSource,
        inputTpmLimit,
      }),
    adaptiveBudgetPreflightCeilingTokens: derivedCeiling,
  }
}

function sortLearnedBudgetCandidates(left = null, right = null, {
  organizationId = '',
  workspaceId = '',
} = {}) {
  const leftOrgMatch = String(left?.organizationId || '').trim() && String(left?.organizationId || '').trim() === String(organizationId || '').trim()
  const rightOrgMatch = String(right?.organizationId || '').trim() && String(right?.organizationId || '').trim() === String(organizationId || '').trim()
  if (leftOrgMatch !== rightOrgMatch) return leftOrgMatch ? -1 : 1
  const leftWorkspaceMatch = String(left?.workspaceId || '').trim() && String(left?.workspaceId || '').trim() === String(workspaceId || '').trim()
  const rightWorkspaceMatch = String(right?.workspaceId || '').trim() && String(right?.workspaceId || '').trim() === String(workspaceId || '').trim()
  if (leftWorkspaceMatch !== rightWorkspaceMatch) return leftWorkspaceMatch ? -1 : 1
  const leftObserved = normalizeNonNegativeInt(left?.lastObservedAt, 0, { max: 99_999_999_999_999 })
  const rightObserved = normalizeNonNegativeInt(right?.lastObservedAt, 0, { max: 99_999_999_999_999 })
  if (leftObserved !== rightObserved) return rightObserved - leftObserved
  const leftCount = normalizeNonNegativeInt(left?.observationCount, 0, { max: 1_000_000 })
  const rightCount = normalizeNonNegativeInt(right?.observationCount, 0, { max: 1_000_000 })
  return rightCount - leftCount
}

function normalizeScopeId(value = '') {
  return String(value || '').trim()
}

function buildBudgetScopeKey({
  organizationId = '',
  workspaceId = '',
} = {}) {
  return `${normalizeScopeId(organizationId)}\n${normalizeScopeId(workspaceId)}`
}

function resolveScopedLearnedBudgetCandidates(rows = [], {
  organizationId = '',
  workspaceId = '',
} = {}) {
  const candidates = Array.isArray(rows) ? rows.filter(Boolean) : []
  const requestedOrganizationId = normalizeScopeId(organizationId)
  const requestedWorkspaceId = normalizeScopeId(workspaceId)
  if (!requestedOrganizationId && !requestedWorkspaceId) {
    const uniqueScopeKeys = new Set(
      candidates.map((row) => buildBudgetScopeKey({
        organizationId: row?.organizationId,
        workspaceId: row?.workspaceId,
      })),
    )
    if (uniqueScopeKeys.size <= 1) return candidates
    return candidates.filter((row) => (
      normalizeScopeId(row?.organizationId) === ''
      && normalizeScopeId(row?.workspaceId) === ''
    ))
  }

  return candidates.filter((row) => (
    normalizeScopeId(row?.organizationId) === requestedOrganizationId
    && normalizeScopeId(row?.workspaceId) === requestedWorkspaceId
  ))
}

export async function resolveLearnedProviderBudgetProfile({
  providerId = '',
  apiKey = '',
  organizationId = '',
  workspaceId = '',
  credentialFingerprint = '',
} = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  if (normalizedProviderId !== 'anthropic') return null
  const resolvedCredentialFingerprint = String(credentialFingerprint || '').trim()
    || createProviderCredentialFingerprint(normalizedProviderId, apiKey)
  if (!resolvedCredentialFingerprint) return null
  try {
    const {
      cleanupProviderBudgetProfiles,
      getProviderBudgetProfileLifecycle,
      listProviderBudgetProfiles,
      touchProviderBudgetProfileResolution,
    } = await import('../api-clients/provider-budget-store.mjs')
    cleanupProviderBudgetProfiles({ providerId: normalizedProviderId })
    const matchingRows = listProviderBudgetProfiles({ providerId: normalizedProviderId })
      .filter((row) => String(row?.credentialFingerprint || '').trim() === resolvedCredentialFingerprint)
    const rows = resolveScopedLearnedBudgetCandidates(matchingRows, {
      organizationId,
      workspaceId,
    })
      .filter((row) => {
        const lifecycle = getProviderBudgetProfileLifecycle(row)
        if (lifecycle.invalid === true) return false
        if (lifecycle.expired === true) return false
        return true
      })
      .sort((left, right) => sortLearnedBudgetCandidates(left, right, {
        organizationId,
        workspaceId,
      }))
    const selectedRow = rows[0] || null
    if (!selectedRow) return null
    const resolvedAt = Date.now()
    touchProviderBudgetProfileResolution(selectedRow, { resolvedAt })
    return {
      ...selectedRow,
      lastResolvedAt: resolvedAt,
    }
  } catch {
    return null
  }
}

export function resolveProviderPromptBudgetProfile({
  providerId = '',
  modelId = '',
  mode = '',
  runtimeSettings = null,
  requestContext = {},
  learnedBudgetProfile = null,
} = {}) {
  const baseProfile = PROFILE_DEFINITIONS[resolveProfileId({ providerId })]
    || PROFILE_DEFINITIONS.generic_remote
  const normalizedProviderId = normalizeProviderId(providerId)
  const adaptiveProfile = applyLearnedBudgetProfile({
    ...baseProfile,
    providerId: normalizedProviderId,
  }, learnedBudgetProfile || requestContext?.learnedBudgetProfile || null)
  const profile = applyRuntimeOverrides(adaptiveProfile, runtimeSettings)

  return Object.freeze({
    ...profile,
    modelId: String(modelId || '').trim(),
    mode: normalizeMode(mode || requestContext?.mode || requestContext?.turnMode),
  })
}

export function buildEmptyPromptBudgetDiagnosticSnapshot() {
  return {
    promptBudgetProfileId: '',
    promptBudgetProfileFamily: '',
    promptBudgetStrictness: '',
    promptBudgetHardGuardEnabled: null,
    promptBudgetResolvedCeilingTokens: null,
    adaptiveBudgetSource: '',
    adaptiveBudgetConfidence: '',
    adaptiveBudgetScope: '',
    adaptiveBudgetCapacityTier: '',
    adaptiveBudgetObservedInputTpm: 0,
    adaptiveBudgetObservedOutputTpm: 0,
    adaptiveBudgetObservedRpm: 0,
    adaptiveBudgetLastObservedAt: 0,
    adaptiveBudgetResolutionSource: '',
    adaptiveBudgetResolutionReason: '',
    adaptiveBudgetResolvedCeilingTokens: null,
    adaptiveBudgetResolvedExplorationMode: '',
    adaptiveBudgetRuntimeOverrideApplied: false,
    adaptiveBudgetRuntimeOverrideSource: '',
    adaptiveBudgetRuntimeOverrideCeilingTokens: 0,
    adaptiveBudgetRuntimeOverrideExplorationMode: '',
  }
}

export function buildPromptBudgetDiagnosticSnapshot(promptBudgetProfile = null) {
  const profile = promptBudgetProfile && typeof promptBudgetProfile === 'object'
    ? promptBudgetProfile
    : {}
  const family = String(profile.family || '').trim().toLowerCase()
  const strictness = String(profile.strictness || '').trim().toLowerCase()
  const promptBudgetHardGuardEnabled = profile.promptPreflightHardGuardEnabled !== false
  const resolvedCeilingTokens = promptBudgetHardGuardEnabled === true
    ? normalizeNonNegativeInt(
      profile.localPreflightInputCeilingTokens,
      0,
      { max: MAX_ADAPTIVE_PREFLIGHT_TOKENS },
    )
    : 0
  const adaptiveBudgetSource = normalizeLearnedBudgetSource(profile.adaptiveBudgetSource)
  const adaptiveBudgetConfidence = normalizeAdaptiveConfidence(profile.adaptiveBudgetConfidence)
  const adaptiveBudgetResolutionSource = String(profile.adaptiveBudgetResolutionSource || '').trim().toLowerCase()
  const adaptiveBudgetResolutionReason = String(profile.adaptiveBudgetResolutionReason || '').trim().toLowerCase()
  const adaptiveBudgetRuntimeOverrideApplied = profile.adaptiveBudgetRuntimeOverrideApplied === true

  return {
    ...buildEmptyPromptBudgetDiagnosticSnapshot(),
    promptBudgetProfileId: String(profile.id || '').trim(),
    promptBudgetProfileFamily: family,
    promptBudgetStrictness: strictness,
    promptBudgetHardGuardEnabled,
    promptBudgetResolvedCeilingTokens: promptBudgetHardGuardEnabled === true && resolvedCeilingTokens > 0
      ? resolvedCeilingTokens
      : null,
    adaptiveBudgetSource: family === 'anthropic' ? adaptiveBudgetSource : '',
    adaptiveBudgetConfidence: family === 'anthropic' ? adaptiveBudgetConfidence : '',
    adaptiveBudgetScope: family === 'anthropic' && adaptiveBudgetSource !== 'fallback'
      ? String(profile.adaptiveBudgetScope || '').trim().toLowerCase()
      : '',
    adaptiveBudgetCapacityTier: family === 'anthropic'
      ? String(profile.adaptiveBudgetCapacityTier || '').trim().toLowerCase()
      : '',
    adaptiveBudgetObservedInputTpm: family === 'anthropic'
      ? normalizeNonNegativeInt(profile.adaptiveBudgetObservedInputTpm, 0, { max: 10_000_000 })
      : 0,
    adaptiveBudgetObservedOutputTpm: family === 'anthropic'
      ? normalizeNonNegativeInt(profile.adaptiveBudgetObservedOutputTpm, 0, { max: 10_000_000 })
      : 0,
    adaptiveBudgetObservedRpm: family === 'anthropic'
      ? normalizeNonNegativeInt(profile.adaptiveBudgetObservedRpm, 0, { max: 100_000 })
      : 0,
    adaptiveBudgetLastObservedAt: family === 'anthropic'
      ? normalizeNonNegativeInt(profile.adaptiveBudgetLastObservedAt, 0, { max: 99_999_999_999_999 })
      : 0,
    adaptiveBudgetResolutionSource: family === 'anthropic' ? adaptiveBudgetResolutionSource : '',
    adaptiveBudgetResolutionReason: family === 'anthropic' ? adaptiveBudgetResolutionReason : '',
    adaptiveBudgetResolvedCeilingTokens: family === 'anthropic' && promptBudgetHardGuardEnabled === true && resolvedCeilingTokens > 0
      ? resolvedCeilingTokens
      : null,
    adaptiveBudgetResolvedExplorationMode: family === 'anthropic'
      ? normalizeAdaptiveExplorationMode(profile.explorationToolBudgetMode)
      : '',
    adaptiveBudgetRuntimeOverrideApplied,
    adaptiveBudgetRuntimeOverrideSource: family === 'anthropic' && adaptiveBudgetRuntimeOverrideApplied
      ? String(profile.adaptiveBudgetRuntimeOverrideSource || '').trim().toLowerCase()
      : '',
    adaptiveBudgetRuntimeOverrideCeilingTokens: family === 'anthropic' && adaptiveBudgetRuntimeOverrideApplied
      ? normalizeNonNegativeInt(profile.adaptiveBudgetRuntimeOverrideCeilingTokens, 0, { max: MAX_ADAPTIVE_PREFLIGHT_TOKENS })
      : 0,
    adaptiveBudgetRuntimeOverrideExplorationMode: family === 'anthropic' && adaptiveBudgetRuntimeOverrideApplied
      ? normalizeAdaptiveExplorationMode(profile.adaptiveBudgetRuntimeOverrideExplorationMode)
      : '',
  }
}
