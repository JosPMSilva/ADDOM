import {
  COMPACTION_MODES,
  normalizeCompactionMode,
  normalizeCompactionModeList,
} from '../compaction-mode-contract.mjs'

export const PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS = Object.freeze({
  UNKNOWN_REASON: 'unknown_reason',
  PROVIDER_NOT_SUPPORTED: 'provider_not_supported',
  POLICY_DISABLED: 'policy_disabled',
  INSUFFICIENT_HISTORY: 'insufficient_history',
  MISSING_MODEL: 'missing_model',
  MISSING_PREVIOUS_RESPONSE_ID: 'missing_previous_response_id',
  BELOW_THRESHOLD: 'below_threshold',
  MISSING_COMPACTION_ITEM: 'missing_compaction_item',
  PROVIDER_ERROR: 'provider_error',
})

export const PROVIDER_NATIVE_COMPACTION_SUCCESS_REASONS = Object.freeze({
  COMPACTED: 'compacted',
})

const PROVIDER_NATIVE_COMPACTION_FAILURE_REASON_SET = new Set(
  Object.values(PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS),
)
const PROVIDER_NATIVE_COMPACTION_SUCCESS_REASON_SET = new Set(
  Object.values(PROVIDER_NATIVE_COMPACTION_SUCCESS_REASONS),
)

const PROVIDER_NATIVE_COMPACTION_ADAPTER_DEFINITIONS = Object.freeze({
  openai: Object.freeze({
    providerId: 'openai',
    supported: true,
    supportedModes: Object.freeze([COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION]),
    preferredMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    requiresPreviousResponseId: true,
    evidenceStatus: 'verified_provider_adapter',
  }),
})

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeProviderId(value = '') {
  return normalizeId(value).toLowerCase()
}

function normalizeReference(value = null) {
  return value && typeof value === 'object'
    ? { ...value }
    : null
}

function normalizeObjectArray(value = []) {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === 'object')
    : []
}

function normalizeStringList(value = []) {
  const seen = new Set()
  const out = []
  for (const rawEntry of Array.isArray(value) ? value : []) {
    const entry = normalizeId(rawEntry)
    if (!entry) continue
    const key = entry.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}

function resolveContractCompactionMode(providerId = '', compactionMode = COMPACTION_MODES.NONE) {
  const adapter = resolveProviderNativeCompactionAdapter(providerId)
  const normalizedCompactionMode = normalizeCompactionMode(compactionMode, COMPACTION_MODES.NONE)
  if (normalizedCompactionMode !== COMPACTION_MODES.NONE) return normalizedCompactionMode
  if (adapter.supported === true && adapter.preferredMode && adapter.preferredMode !== COMPACTION_MODES.NONE) {
    return adapter.preferredMode
  }
  return COMPACTION_MODES.NONE
}

export function normalizeProviderNativeCompactionFailureReason(
  value = '',
  fallback = PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.UNKNOWN_REASON,
) {
  const normalizedFallback = PROVIDER_NATIVE_COMPACTION_FAILURE_REASON_SET.has(normalizeId(fallback))
    ? normalizeId(fallback)
    : PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.UNKNOWN_REASON
  const normalizedValue = normalizeId(value)
  return PROVIDER_NATIVE_COMPACTION_FAILURE_REASON_SET.has(normalizedValue)
    ? normalizedValue
    : normalizedFallback
}

export function normalizeProviderNativeCompactionSuccessReason(
  value = '',
  fallback = PROVIDER_NATIVE_COMPACTION_SUCCESS_REASONS.COMPACTED,
) {
  const normalizedFallback = PROVIDER_NATIVE_COMPACTION_SUCCESS_REASON_SET.has(normalizeId(fallback))
    ? normalizeId(fallback)
    : PROVIDER_NATIVE_COMPACTION_SUCCESS_REASONS.COMPACTED
  const normalizedValue = normalizeId(value)
  return PROVIDER_NATIVE_COMPACTION_SUCCESS_REASON_SET.has(normalizedValue)
    ? normalizedValue
    : normalizedFallback
}

export function resolveProviderNativeCompactionAdapter(providerId = '') {
  const normalizedProviderId = normalizeProviderId(providerId)
  const definition = PROVIDER_NATIVE_COMPACTION_ADAPTER_DEFINITIONS[normalizedProviderId]
  if (definition) return definition
  return {
    providerId: normalizedProviderId,
    supported: false,
    supportedModes: [],
    preferredMode: COMPACTION_MODES.NONE,
    requiresPreviousResponseId: false,
    evidenceStatus: normalizedProviderId ? 'not_implemented' : 'missing_provider',
  }
}

export function createProviderNativeCompactionReference({
  providerId = '',
  compactionMode = COMPACTION_MODES.NONE,
  stage = '',
  ...meta
} = {}) {
  const adapter = resolveProviderNativeCompactionAdapter(providerId)
  const normalizedProviderId = adapter.providerId || normalizeProviderId(providerId)
  const normalizedCompactionMode = resolveContractCompactionMode(providerId, compactionMode)
  const normalizedStage = normalizeId(stage)
  return {
    provider: normalizedProviderId,
    compactionMode: normalizedCompactionMode,
    ...(normalizedStage ? { stage: normalizedStage } : {}),
    ...meta,
  }
}

export function createProviderNativeCompactionEligibility({
  eligible = false,
  providerId = '',
  compactionMode = COMPACTION_MODES.NONE,
  reason = '',
  reference = null,
  ...meta
} = {}) {
  return {
    eligible: eligible === true,
    reason: eligible === true
      ? ''
      : normalizeProviderNativeCompactionFailureReason(reason),
    compactionMode: resolveContractCompactionMode(providerId, compactionMode),
    reference: normalizeReference(reference),
    ...meta,
  }
}

export function createProviderNativeCompactionResult({
  used = false,
  providerId = '',
  compactionMode = COMPACTION_MODES.NONE,
  reason = '',
  reference = null,
  compactionId = '',
  compactionIds = [],
  compactedWindow = [],
  responseId = '',
} = {}) {
  const normalizedCompactionIds = normalizeStringList(compactionIds)
  const normalizedCompactionId = normalizeId(compactionId) || normalizedCompactionIds[0] || ''

  return {
    used: used === true,
    reason: used === true
      ? normalizeProviderNativeCompactionSuccessReason(reason)
      : normalizeProviderNativeCompactionFailureReason(reason),
    compactionMode: resolveContractCompactionMode(providerId, compactionMode),
    ...(normalizedCompactionId ? { compactionId: normalizedCompactionId } : {}),
    ...(normalizedCompactionIds.length > 0 ? { compactionIds: normalizedCompactionIds } : {}),
    ...(normalizeObjectArray(compactedWindow).length > 0
      ? { compactedWindow: normalizeObjectArray(compactedWindow) }
      : {}),
    ...(normalizeId(responseId) ? { responseId: normalizeId(responseId) } : {}),
    reference: normalizeReference(reference),
  }
}

export function listProviderNativeCompactionProviders() {
  return Object.values(PROVIDER_NATIVE_COMPACTION_ADAPTER_DEFINITIONS)
}

export function listProviderNativeCompactionModes(providerId = '') {
  return normalizeCompactionModeList(
    resolveProviderNativeCompactionAdapter(providerId)?.supportedModes || [],
  )
}
