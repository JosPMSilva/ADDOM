import { resolveRegistryModel } from './model-registry.mjs'

export const PROVIDER_PROCESSING_MODE_STANDARD = 'standard'
export const PROVIDER_PROCESSING_MODE_FAST = 'fast'

export function normalizeProviderProcessingMode(value = '') {
  return String(value || '').trim().toLowerCase() === PROVIDER_PROCESSING_MODE_FAST
    ? PROVIDER_PROCESSING_MODE_FAST
    : PROVIDER_PROCESSING_MODE_STANDARD
}

function normalizeReturnedProviderMode(providerId = '', value = '') {
  const provider = String(providerId || '').trim().toLowerCase()
  const returned = String(value || '').trim().toLowerCase()
  if (!returned) return ''

  if (provider === 'openai') {
    if (['priority', 'fast'].includes(returned)) return PROVIDER_PROCESSING_MODE_FAST
    if (['default', 'standard', 'auto', 'flex'].includes(returned)) return PROVIDER_PROCESSING_MODE_STANDARD
  }

  if (provider === 'moonshot') {
    if (returned === 'kimi-k2.7-code-highspeed') return PROVIDER_PROCESSING_MODE_FAST
    if (returned === 'kimi-k2.7-code') return PROVIDER_PROCESSING_MODE_STANDARD
  }

  return ''
}

function cloneRequest(value) {
  return value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : null
}

export function resolveProviderProcessingMode({
  providerId = '',
  modelId = '',
  authMethod = '',
  providerConfigured = false,
  requestedMode = PROVIDER_PROCESSING_MODE_STANDARD,
  returnedProviderMode = '',
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const resolvedModel = resolveRegistryModel(normalizedProviderId, modelId)
  const fastCapability = resolvedModel?.model?.capabilities?.processing?.fast
  const allowedAuthMethods = Array.isArray(fastCapability?.authMethods)
    ? fastCapability.authMethods.map((value) => String(value || '').trim().toLowerCase())
    : []
  const normalizedAuthMethod = String(authMethod || '').trim().toLowerCase()
  const fastAvailable = (
    providerConfigured === true
    && Boolean(fastCapability)
    && allowedAuthMethods.includes(normalizedAuthMethod)
  )
  const normalizedRequestedMode = normalizeProviderProcessingMode(requestedMode)
  const effectiveRequestedMode = fastAvailable
    ? normalizedRequestedMode
    : PROVIDER_PROCESSING_MODE_STANDARD
  const returnedMode = normalizeReturnedProviderMode(normalizedProviderId, returnedProviderMode)

  return {
    providerId: normalizedProviderId,
    modelId: resolvedModel?.canonicalModelId || String(modelId || '').trim(),
    availableModes: fastAvailable
      ? [PROVIDER_PROCESSING_MODE_STANDARD, PROVIDER_PROCESSING_MODE_FAST]
      : [PROVIDER_PROCESSING_MODE_STANDARD],
    requestedMode: effectiveRequestedMode,
    returnedMode,
    effectiveMode: returnedMode || effectiveRequestedMode,
    request: effectiveRequestedMode === PROVIDER_PROCESSING_MODE_FAST
      ? cloneRequest(fastCapability?.requestByAuthMethod?.[normalizedAuthMethod] ?? fastCapability?.request)
      : null,
    premiumPricing: (
      effectiveRequestedMode === PROVIDER_PROCESSING_MODE_FAST
      && String(fastCapability?.pricing || '').trim().toLowerCase() === 'premium'
    ),
  }
}
