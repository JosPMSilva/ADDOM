import { resolveOpenAIExecutionAuth } from '../openai-account/openai-execution-auth.mjs'

function cleanString(value) {
  return String(value ?? '').trim()
}

function isLocalProvider(providerId = '') {
  const normalized = cleanString(providerId).toLowerCase()
  return normalized === 'ollama' || normalized === 'lmstudio'
}

function readinessResult({
  ready = false,
  providerId = '',
  authMethod = '',
  apiKey = '',
  code = '',
  message = '',
  canonicalErrorClass = '',
  userFacingBlockedReason = '',
  userFacingBlockedMessage = '',
} = {}) {
  return {
    ready: ready === true,
    providerId: cleanString(providerId),
    authMethod: cleanString(authMethod),
    apiKey: cleanString(apiKey),
    code: cleanString(code),
    message: cleanString(message),
    blockedReason: cleanString(code),
    blockedMessage: cleanString(message),
    canonicalErrorClass: cleanString(canonicalErrorClass),
    userFacingBlockedReason: cleanString(userFacingBlockedReason),
    userFacingBlockedMessage: cleanString(userFacingBlockedMessage),
  }
}

export function resolveProviderCredentialReadiness(providerId = '', {
  requireConfiguredApiKey = true,
  getApiKey = null,
  allowOpenAIAccountRuntime = false,
} = {}) {
  const normalizedProviderId = cleanString(providerId).toLowerCase()
  if (!normalizedProviderId) {
    return readinessResult({
      ready: false,
      code: 'missing_provider',
      message: 'Provider is required.',
    })
  }

  if (normalizedProviderId === 'cursor') {
    return readinessResult({
      ready: false,
      providerId: normalizedProviderId,
      code: 'delegated_runtime_unavailable',
      message: 'Cursor cannot run as a delegated agent until ADDOM can provide an isolated delegated workspace and enforce its permission policy.',
    })
  }

  if (!requireConfiguredApiKey || isLocalProvider(normalizedProviderId)) {
    return readinessResult({
      ready: true,
      providerId: normalizedProviderId,
      authMethod: isLocalProvider(normalizedProviderId) ? 'local' : '',
    })
  }

  if (normalizedProviderId === 'openai') {
    const auth = resolveOpenAIExecutionAuth({
      allowAccountRuntime: allowOpenAIAccountRuntime,
      getKey: (requestedProviderId = '') => (
        cleanString(requestedProviderId).toLowerCase() === 'openai'
        && typeof getApiKey === 'function'
          ? cleanString(getApiKey('openai'))
          : ''
      ),
    })
    return readinessResult({
      ready: auth?.ok === true,
      providerId: normalizedProviderId,
      authMethod: cleanString(auth?.authMethod),
      apiKey: cleanString(auth?.apiKey),
      code: cleanString(auth?.blockedReason),
      message: cleanString(auth?.blockedMessage),
      canonicalErrorClass: cleanString(auth?.canonicalErrorClass),
      userFacingBlockedReason: cleanString(auth?.userFacingBlockedReason),
      userFacingBlockedMessage: cleanString(auth?.userFacingBlockedMessage),
    })
  }

  if (typeof getApiKey !== 'function') {
    return readinessResult({
      ready: true,
      providerId: normalizedProviderId,
      authMethod: 'api_key',
    })
  }

  const apiKey = cleanString(getApiKey(normalizedProviderId))
  if (apiKey) {
    return readinessResult({
      ready: true,
      providerId: normalizedProviderId,
      authMethod: 'api_key',
      apiKey,
    })
  }

  return readinessResult({
    ready: false,
    providerId: normalizedProviderId,
    authMethod: 'api_key',
    code: 'missing_api_key',
    message: `No API key configured for provider "${normalizedProviderId}".`,
  })
}

export function resolveProviderAgentReadiness(providerId = '', {
  model = '',
  getCachedCapabilities = null,
  ...credentialOptions
} = {}) {
  const credentialReadiness = resolveProviderCredentialReadiness(providerId, credentialOptions)
  if (!credentialReadiness.ready) return credentialReadiness

  const normalizedModel = cleanString(model)
  if (!normalizedModel) {
    return readinessResult({
      ready: false,
      providerId: credentialReadiness.providerId,
      authMethod: credentialReadiness.authMethod,
      code: 'missing_model',
      message: 'A model is required for delegated agent execution.',
    })
  }

  if (typeof getCachedCapabilities === 'function') {
    try {
      const cached = getCachedCapabilities(credentialReadiness.providerId, normalizedModel, {
        authMethod: credentialReadiness.authMethod || 'api_key',
      }) || null
      if (cached?.supportsTools === false) {
        return {
          ...readinessResult({
            ready: false,
            providerId: credentialReadiness.providerId,
            authMethod: credentialReadiness.authMethod,
            code: 'delegated_model_tools_unavailable',
            message: `Model "${normalizedModel}" cannot run ADDOM's delegated agent tools.`,
            canonicalErrorClass: 'capability_unsupported',
            userFacingBlockedReason: 'capability_unsupported',
            userFacingBlockedMessage: 'Choose an agent model that supports ADDOM tool execution.',
          }),
          model: normalizedModel,
          toolSupportMode: cleanString(cached.toolSupportMode),
          capabilitySource: cleanString(cached.source),
          supportsTools: false,
        }
      }
    } catch {
      // Capability cache inspection is advisory; runtime negotiation remains authoritative.
    }
  }

  return {
    ...credentialReadiness,
    model: normalizedModel,
  }
}
