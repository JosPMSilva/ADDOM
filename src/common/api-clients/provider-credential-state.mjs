export function normalizeOpenAIProviderAuthMethod(value = '', fallback = 'api_key') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'api_key' || normalized === 'account') return normalized
  return fallback === 'account' ? 'account' : 'api_key'
}

export function normalizeCursorProviderAuthMethod(value = '', fallback = 'account') {
  return normalizeOpenAIProviderAuthMethod(value, fallback)
}

export function providerUsesOpenAIAccountAuth(provider = null) {
  const source = provider && typeof provider === 'object' ? provider : {}
  return normalizeOpenAIProviderAuthMethod(source.authMethod, 'api_key') === 'account'
}

export function providerHasCredential(provider = null) {
  const source = provider && typeof provider === 'object' ? provider : {}
  if (source.noKeyRequired === true) return true
  return (
    source.hasCredential === true
    || source.configured === true
    || source.isConfigured === true
    || source.hasKey === true
  )
}

export function providerHasStoredApiKey(provider = null) {
  const source = provider && typeof provider === 'object' ? provider : {}
  if (source.noKeyRequired === true) return false
  if (typeof source.hasApiKey === 'boolean') return source.hasApiKey
  return (
    source.hasKey === true
    || source.configured === true
    || source.isConfigured === true
  )
}

export function providerSupportsOpenAIAccountAuth(provider = null) {
  const source = provider && typeof provider === 'object' ? provider : {}
  if (String(source.id || '').trim().toLowerCase() !== 'openai') return false
  if (Array.isArray(source.availableAuthMethods)) {
    return source.availableAuthMethods.includes('account')
  }
  return true
}
