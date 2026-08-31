import * as vault from '../vault.mjs'
import { getProviderManifest, getProviderModels, resolveModelCapabilities } from '../api-clients/ai-provider.mjs'
import { getSettings } from '../settings.mjs'
import {
  normalizeCursorProviderAuthMethod,
  normalizeOpenAIProviderAuthMethod,
} from '../../common/api-clients/provider-credential-state.mjs'
import { getOpenAIAccountAuthService } from '../openai-account/openai-account-auth-service.mjs'
import { getCursorAgentAuthService } from '../cursor-agent/cursor-agent-auth-service.mjs'
import {
  CURSOR_AGENT_PROVIDER_ID,
  getCursorAgentModels,
  getCursorAgentProviderManifestEntry,
  isSupportedCursorAgentModelId,
} from '../../common/api-clients/cursor-agent-provider.mjs'

function insertCursorAgentProvider(manifest = []) {
  const rows = Array.isArray(manifest) ? [...manifest] : []
  if (rows.some((provider) => String(provider?.id || '').trim() === CURSOR_AGENT_PROVIDER_ID)) return rows
  const openAIIndex = rows.findIndex((provider) => String(provider?.id || '').trim() === 'openai')
  rows.splice(openAIIndex >= 0 ? openAIIndex + 1 : 0, 0, getCursorAgentProviderManifestEntry())
  return rows
}

function assertTestOnlyVaultHandlerAccess() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test-only vault handler helper called in non-test environment.')
  }
  if (!process.env.ADDOM_USER_DATA_PATH && process.env.NODE_ENV !== 'test') {
    throw new Error('Test-only vault handler helper requires a test user-data path.')
  }
}

export async function resolveVaultGetProvidersResponse({ forceRefresh = false } = {}, deps = {}) {
  const listConfiguredProviders = typeof deps.listConfiguredProviders === 'function'
    ? deps.listConfiguredProviders
    : vault.listConfiguredProviders
  const getManifest = typeof deps.getProviderManifest === 'function'
    ? deps.getProviderManifest
    : getProviderManifest
  const getModels = typeof deps.getProviderModels === 'function'
    ? deps.getProviderModels
    : getProviderModels
  const readKey = typeof deps.getKey === 'function'
    ? deps.getKey
    : vault.getKey
  const readSettings = typeof deps.getSettings === 'function'
    ? deps.getSettings
    : getSettings
  const readOpenAIAccountState = typeof deps.getOpenAIAccountState === 'function'
    ? deps.getOpenAIAccountState
    : ({ refresh = false } = {}) => refresh
        ? getOpenAIAccountAuthService().refreshState()
        : getOpenAIAccountAuthService().getState()
  const readCursorRuntimeState = typeof deps.getCursorAgentRuntimeState === 'function'
    ? deps.getCursorAgentRuntimeState
    : () => getCursorAgentAuthService().getRuntimeState()
  const readCursorAgentState = typeof deps.getCursorAgentState === 'function'
    ? deps.getCursorAgentState
    : (options = {}) => getCursorAgentAuthService().getState({
      forceRefresh: options?.forceRefresh === true,
    })

  const configured = listConfiguredProviders()
  const manifest = await getManifest({ forceRefresh: !!forceRefresh })
  const settings = readSettings()
  const selectedOpenAIAuthMethod = normalizeOpenAIProviderAuthMethod(
    settings?.providerAuthSettings?.openai?.authMethod,
    'api_key',
  )
  const openAIAccountState = await Promise.resolve(readOpenAIAccountState({
    refresh: selectedOpenAIAuthMethod === 'account',
  }))
  const selectedCursorAuthMethod = normalizeCursorProviderAuthMethod(
    settings?.providerAuthSettings?.cursor?.authMethod,
    'account',
  )
  // API-key readiness only needs the on-disk runtime; account CLI status is unused there.
  // Explicit test/deps overrides of getCursorAgentState still win for deterministic fixtures.
  const cursorAgentState = typeof deps.getCursorAgentState === 'function'
    ? await Promise.resolve(readCursorAgentState({ forceRefresh: !!forceRefresh }))
    : selectedCursorAuthMethod === 'api_key'
      ? {
        runtime: await Promise.resolve(readCursorRuntimeState()),
        account: { status: 'unavailable', accountLabel: '' },
        loginPending: false,
      }
      : await Promise.resolve(readCursorAgentState({ forceRefresh: !!forceRefresh }))
  const accountAvailability = openAIAccountState?.sessionSummary?.availability
    && typeof openAIAccountState.sessionSummary.availability === 'object'
    ? openAIAccountState.sessionSummary.availability
    : { supported: false, reason: '', message: '' }
  const openAIAccountSupported = accountAvailability.supported === true
  const openAIAccountSession = openAIAccountState?.sessionSummary && typeof openAIAccountState.sessionSummary === 'object'
    ? openAIAccountState.sessionSummary
    : null
  const openAIEntry = manifest.find((provider) => String(provider?.id || '').trim().toLowerCase() === 'openai')
  if (
    openAIEntry
    && selectedOpenAIAuthMethod === 'api_key'
    && configured.openai
  ) {
    const apiKey = String(readKey('openai') || '').trim()
    if (apiKey) {
      const models = await getModels({
        providerId: 'openai',
        apiKey,
        forceRefresh: !!forceRefresh,
      })
      if (Array.isArray(models) && models.length > 0) {
        openAIEntry.models = models
        const hasLiveEligibilityEvidence = models.some((model) => (
          String(model?.modelEligibility?.source || '').trim().toLowerCase() === 'openai_models_api'
        ))
        openAIEntry.modelSource = hasLiveEligibilityEvidence ? 'dynamic' : 'static'
        openAIEntry.modelsFetchedAt = hasLiveEligibilityEvidence ? Date.now() : null
      }
    }
  }

  return insertCursorAgentProvider(manifest).map((p) => {
    const providerId = String(p?.id || '').trim().toLowerCase()
    const hasApiKey = p.noKeyRequired ? false : !!configured[p.id]
    if (providerId === 'openai') {
      const authMethod = selectedOpenAIAuthMethod === 'account'
        ? 'account'
        : 'api_key'
      const hasAccountSession = openAIAccountSupported && openAIAccountSession?.hasSession === true
      const accountStatus = !openAIAccountSupported
        ? 'unavailable'
        : (hasAccountSession
          ? 'connected'
          : String(openAIAccountSession?.status || 'needs_login').trim().toLowerCase() || 'needs_login')
      const hasCredential = authMethod === 'account' ? hasAccountSession : hasApiKey
      return {
        ...p,
        authMethod,
        availableAuthMethods: ['api_key', 'account'],
        accountRuntimeSupported: openAIAccountSupported,
        hasApiKey,
        hasAccountSession,
        hasCredential,
        hasKey: hasCredential,
        configured: hasCredential,
        isConfigured: hasCredential,
        accountStatus,
        accountUnsupportedReason: String(accountAvailability.reason || '').trim(),
        accountStatusMessage: String(
          openAIAccountSession?.lastErrorMessage
          || accountAvailability.message
          || ''
        ).trim(),
        accountEmail: String(openAIAccountSession?.email || '').trim(),
        accountLabel: String(openAIAccountSession?.label || openAIAccountSession?.email || '').trim(),
        accountPlanType: String(openAIAccountSession?.planType || '').trim(),
        rateLimitSummary: openAIAccountSession?.rateLimitSummary || null,
      }
    }
    if (providerId === CURSOR_AGENT_PROVIDER_ID) {
      const hasApiKey = !!configured[CURSOR_AGENT_PROVIDER_ID]
      const hasAccountSession = cursorAgentState?.account?.status === 'authenticated'
      const runtimeReady = cursorAgentState?.runtime?.status === 'runtime_ready'
      const hasCredential = selectedCursorAuthMethod === 'account' ? hasAccountSession : hasApiKey
      return {
        ...p,
        authMethod: selectedCursorAuthMethod,
        hasApiKey,
        hasAccountSession,
        hasCredential,
        hasKey: hasCredential,
        configured: hasCredential,
        isConfigured: hasCredential,
        runtimeReady,
        ready: runtimeReady && hasCredential,
        accountStatus: String(cursorAgentState?.account?.status || 'unavailable'),
        accountLabel: String(cursorAgentState?.account?.accountLabel || ''),
        runtimeStatus: String(cursorAgentState?.runtime?.status || 'runtime_missing'),
        runtimeStatusMessage: String(cursorAgentState?.runtime?.message || ''),
      }
    }
    const hasCredential = p.noKeyRequired ? true : hasApiKey
    return {
      ...p,
      hasApiKey,
      hasAccountSession: false,
      hasCredential,
      hasKey: hasCredential,
      configured: hasCredential,
      isConfigured: hasCredential,
    }
  })
}

export async function resolveVaultGetProviderModelsResponse({
  providerId,
  forceRefresh = false,
} = {}, deps = {}) {
  const getModels = typeof deps.getProviderModels === 'function'
    ? deps.getProviderModels
    : getProviderModels
  const readKey = typeof deps.getKey === 'function'
    ? deps.getKey
    : vault.getKey

  const normalizedProviderId = String(providerId || '').trim()
  if (!normalizedProviderId) return []
  if (normalizedProviderId.toLowerCase() === CURSOR_AGENT_PROVIDER_ID) return getCursorAgentModels()
  const normalizedApiKey = normalizedProviderId.toLowerCase() === 'openai'
    ? String(readKey('openai') || '').trim()
    : ''

  const models = await getModels({
    providerId: normalizedProviderId,
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    forceRefresh: !!forceRefresh,
  })

  return Array.isArray(models) ? models : []
}

export async function resolveVaultGetModelCapabilitiesResponse({
  providerId,
  modelId,
  forceRefresh = false,
} = {}, deps = {}) {
  const getKey = typeof deps.getKey === 'function'
    ? deps.getKey
    : vault.getKey
  const resolveCapabilities = typeof deps.resolveModelCapabilities === 'function'
    ? deps.resolveModelCapabilities
    : resolveModelCapabilities
  const readSettings = typeof deps.getSettings === 'function'
    ? deps.getSettings
    : getSettings
  const readOpenAIAccountState = typeof deps.getOpenAIAccountState === 'function'
    ? deps.getOpenAIAccountState
    : ({ refresh = false } = {}) => refresh
        ? getOpenAIAccountAuthService().refreshState()
        : getOpenAIAccountAuthService().getState()

  const provider = String(providerId || '').trim()
  const model = String(modelId || '').trim()
  if (!provider || !model) {
    return {
      providerId: provider.toLowerCase(),
      modelId: model,
      supportsTools: false,
      supportsAnyToolSurface: false,
      toolSupportMode: 'unknown',
      toolSurfaceMode: 'unknown',
      supportsReasoning: false,
      source: 'unknown',
      checkedAt: Date.now(),
      note: 'Missing provider/model.',
    }
  }

  if (provider.toLowerCase() === CURSOR_AGENT_PROVIDER_ID) {
    const supported = isSupportedCursorAgentModelId(model)
    return {
      providerId: CURSOR_AGENT_PROVIDER_ID,
      modelId: model,
      source: 'agent_runtime',
      agentRuntime: supported,
      supportsTools: false,
      supportsAnyToolSurface: false,
      supportsReasoning: false,
      requiresExecuteMode: supported,
      requiresFullAccess: supported,
      supportsContextTelemetry: false,
      supportsQuotaTelemetry: false,
      supportsCompactionTelemetry: false,
      checkedAt: Date.now(),
      note: supported ? 'Cursor owns execution for this model.' : 'Unsupported Cursor model.',
    }
  }

  const settings = readSettings()
  const selectedOpenAIAuthMethod = normalizeOpenAIProviderAuthMethod(
    settings?.providerAuthSettings?.openai?.authMethod,
    'api_key',
  )
  if (provider.toLowerCase() === 'openai' && selectedOpenAIAuthMethod === 'account') {
    const openAIAccountState = await Promise.resolve(readOpenAIAccountState({ refresh: true }))
    const availability = openAIAccountState?.sessionSummary?.availability
      && typeof openAIAccountState.sessionSummary.availability === 'object'
      ? openAIAccountState.sessionSummary.availability
      : { supported: false, reason: '', message: '' }
    const hasAccountSession = availability.supported === true && openAIAccountState?.sessionSummary?.hasSession === true
    if (!hasAccountSession) {
      const blockedReason = String(availability.reason || '').trim() || 'missing_account_session'
      const blockedMessage = String(
        openAIAccountState?.sessionSummary?.lastErrorMessage
        || availability.message
        || 'OpenAI account mode is selected, but no active account session is available.'
      ).trim()
      return {
        providerId: provider.toLowerCase(),
        modelId: model,
        supportsTools: false,
        supportsAnyToolSurface: false,
        toolSupportMode: 'unknown',
        toolSurfaceMode: 'unknown',
        supportsReasoning: false,
        source: 'auth_blocked',
        checkedAt: Date.now(),
        note: blockedMessage,
        authMethod: 'account',
        authBlockedReason: blockedReason,
      }
    }
    const accountCapabilities = await resolveCapabilities(provider, '', model, {
      authMethod: 'account',
      forceRefresh: !!forceRefresh,
    })
    return {
      ...accountCapabilities,
      authMethod: 'account',
    }
  }

  const apiKey = String(getKey(provider) ?? '')
  const capabilities = await resolveCapabilities(provider, apiKey, model, {
    authMethod: 'api_key',
    forceRefresh: !!forceRefresh,
  })
  return {
    ...capabilities,
    authMethod: 'api_key',
  }
}

export const __testVaultHandlerInternals = Object.freeze({
  resolveVaultGetProvidersResponse: async (...args) => {
    assertTestOnlyVaultHandlerAccess()
    return resolveVaultGetProvidersResponse(...args)
  },
  resolveVaultGetProviderModelsResponse: async (...args) => {
    assertTestOnlyVaultHandlerAccess()
    return resolveVaultGetProviderModelsResponse(...args)
  },
  resolveVaultGetModelCapabilitiesResponse: async (...args) => {
    assertTestOnlyVaultHandlerAccess()
    return resolveVaultGetModelCapabilitiesResponse(...args)
  },
})
