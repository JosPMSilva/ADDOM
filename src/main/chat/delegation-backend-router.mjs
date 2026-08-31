import { isDelegationToolName } from './delegation-tool-surface.mjs'

const SUPPORTED_DELEGATION_BACKEND_PREFERENCES = new Set([
  'auto',
  'openai_native',
  'addom_moa',
])

function normalizeLowerString(value = '') {
  return String(value || '').trim().toLowerCase()
}

function uniqueStrings(values = []) {
  const out = []
  const seen = new Set()
  for (const rawValue of Array.isArray(values) ? values : []) {
    const value = String(rawValue || '').trim().toLowerCase()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function normalizeDelegationBackendPreference(value = '', fallback = 'auto') {
  const normalized = normalizeLowerString(value)
  if (SUPPORTED_DELEGATION_BACKEND_PREFERENCES.has(normalized)) return normalized
  return SUPPORTED_DELEGATION_BACKEND_PREFERENCES.has(fallback) ? fallback : 'auto'
}

function hasRequestedAddomDelegation(addomTools = {}) {
  return Object.keys(addomTools && typeof addomTools === 'object' ? addomTools : {})
    .some((toolName) => isDelegationToolName(toolName))
}

function hasConfiguredOpenAINativeCollaborationMode({
  providerId = '',
  openaiRuntimeSupport = null,
  runtimeSettings = null,
} = {}) {
  if (normalizeLowerString(providerId) !== 'openai') return false
  if (openaiRuntimeSupport?.supportsCollabAgentActivities !== true) return false
  return !!normalizeLowerString(runtimeSettings?.nativeCollaborationModeId)
}

export function resolveDelegationBackend({
  providerId = '',
  adapterProfile = null,
  addomTools = {},
  runtimeSettings = null,
} = {}) {
  const normalizedProviderId = normalizeLowerString(providerId)
  const normalizedRuntimeSettings = runtimeSettings && typeof runtimeSettings === 'object'
    ? runtimeSettings
    : {}
  const openaiRuntimeSupport = adapterProfile?.openaiRuntimeSupport
    && typeof adapterProfile.openaiRuntimeSupport === 'object'
    ? adapterProfile.openaiRuntimeSupport
    : {}
  const staticDelegationBackends = uniqueStrings(
    Array.isArray(openaiRuntimeSupport.delegationBackends)
      ? openaiRuntimeSupport.delegationBackends.filter((backend) => normalizeLowerString(backend) !== 'openai_native')
      : [],
  )
  const hasConfiguredNativeCollaborationMode = hasConfiguredOpenAINativeCollaborationMode({
    providerId: normalizedProviderId,
    openaiRuntimeSupport,
    runtimeSettings: normalizedRuntimeSettings,
  })
  const requestedAddomDelegation = hasRequestedAddomDelegation(addomTools)
  const availableBackends = uniqueStrings([
    ...staticDelegationBackends,
    ...(
      requestedAddomDelegation
      && (
        normalizedProviderId !== 'openai'
        || openaiRuntimeSupport.supportsAddomMoaDelegation !== false
      )
        ? ['addom_moa']
        : []
    ),
    ...(
      normalizedProviderId === 'openai'
      && openaiRuntimeSupport.supportsCollabAgentActivities === true
        ? ['openai_native']
        : []
    ),
  ])
  const requestedPreference = normalizeDelegationBackendPreference(
    normalizedRuntimeSettings.delegationBackendPreference,
    'auto',
  )
  const preferredBackend = normalizeLowerString(openaiRuntimeSupport.preferredDelegationBackend)
  let selectedBackend = 'none'
  let selectionReason = 'delegation_unavailable'
  if (availableBackends.length > 0) {
    if (requestedPreference !== 'auto' && availableBackends.includes(requestedPreference)) {
      selectedBackend = requestedPreference
      selectionReason = 'runtime_preference'
    } else if (
      requestedPreference === 'auto'
      && preferredBackend === 'openai_native'
      && hasConfiguredNativeCollaborationMode !== true
      && availableBackends.includes('addom_moa')
    ) {
      selectedBackend = 'addom_moa'
      selectionReason = 'auto_native_collaboration_unconfigured'
    } else if (preferredBackend && availableBackends.includes(preferredBackend)) {
      selectedBackend = preferredBackend
      selectionReason = requestedPreference === 'auto' ? 'capability_default' : 'runtime_preference_unavailable'
    } else {
      selectedBackend = availableBackends[0]
      selectionReason = 'first_available'
    }
  } else if (requestedPreference !== 'auto') {
    selectionReason = 'runtime_preference_unavailable'
  }

  return {
    requestedAddomDelegation,
    requestedPreference,
    preferredBackend: preferredBackend || 'none',
    availableBackends,
    selectedBackend,
    selectionReason,
    hasConfiguredNativeCollaborationMode,
    supportsOpenAINativeDelegation: availableBackends.includes('openai_native'),
    supportsAddomMoaDelegation: availableBackends.includes('addom_moa'),
  }
}
