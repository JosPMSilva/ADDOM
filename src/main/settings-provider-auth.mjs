function normalizeProviderAuthMethod(value, { fallback = 'api_key' } = {}) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'account') return 'account'
  if (normalized === 'api_key') return 'api_key'
  return fallback === 'account' ? 'account' : 'api_key'
}

export function normalizeProviderAuthSettings(raw = {}, fallback = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const base = fallback && typeof fallback === 'object' ? fallback : {}
  return Object.fromEntries(['openai', 'cursor'].map((providerId) => {
    const providerBase = base[providerId] && typeof base[providerId] === 'object'
      ? base[providerId]
      : {}
    const providerSource = source[providerId] && typeof source[providerId] === 'object'
      ? source[providerId]
      : {}
    return [providerId, {
      authMethod: normalizeProviderAuthMethod(providerSource.authMethod, {
        fallback: providerBase.authMethod,
      }),
    }]
  }))
}
