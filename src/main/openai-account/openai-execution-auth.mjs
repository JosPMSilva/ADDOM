import * as vault from '../vault.mjs'
import { getSettings } from '../settings.mjs'
import { getOpenAIAccountAuthService } from './openai-account-auth-service.mjs'
import { normalizeOpenAIProviderAuthMethod } from '../../common/api-clients/provider-credential-state.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function resolveOpenAIExecutionCanonicalErrorClass(blockedReason = '') {
  const normalizedBlockedReason = normalizeId(blockedReason).toLowerCase()
  if (!normalizedBlockedReason) return ''
  if (normalizedBlockedReason === 'account_runtime_unsupported') return 'capability_unsupported'
  if (
    normalizedBlockedReason === 'missing_api_key'
    || normalizedBlockedReason === 'account_login_required'
    || normalizedBlockedReason === 'account_login_in_progress'
    || normalizedBlockedReason === 'account_session_expired'
  ) {
    return 'missing_prerequisite'
  }
  if (
    normalizedBlockedReason.startsWith('bridge_')
    || normalizedBlockedReason === 'unsupported_auth_mode'
    || normalizedBlockedReason === 'account_session_error'
  ) {
    return 'provider_transport_error'
  }
  return ''
}

function resolveOpenAIExecutionUserFacingBlockedState({
  blockedReason = '',
  canonicalErrorClass = '',
} = {}) {
  const normalizedClass = normalizeId(
    canonicalErrorClass || resolveOpenAIExecutionCanonicalErrorClass(blockedReason),
  ).toLowerCase()
  if (!normalizedClass) {
    return {
      userFacingBlockedReason: '',
      userFacingBlockedMessage: '',
    }
  }
  if (normalizedClass === 'missing_prerequisite') {
    return {
      userFacingBlockedReason: 'missing_prerequisite',
      userFacingBlockedMessage: 'OpenAI authentication is not ready yet. Update OpenAI in Settings and try again.',
    }
  }
  if (normalizedClass === 'provider_transport_error') {
    return {
      userFacingBlockedReason: 'provider_transport_error',
      userFacingBlockedMessage: 'OpenAI authentication is currently unavailable. Retry or reconnect in Settings.',
    }
  }
  if (normalizedClass === 'capability_unsupported') {
    return {
      userFacingBlockedReason: 'capability_unsupported',
      userFacingBlockedMessage: 'This OpenAI capability is not available in the current runtime path.',
    }
  }
  return {
    userFacingBlockedReason: normalizedClass,
    userFacingBlockedMessage: '',
  }
}

function resolveSelectedOpenAIAuthMethod(settings = null) {
  const source = settings && typeof settings === 'object' ? settings : {}
  return normalizeOpenAIProviderAuthMethod(source?.providerAuthSettings?.openai?.authMethod, 'api_key')
}

function resolveOpenAIAccountState(getOpenAIAccountState = null) {
  if (typeof getOpenAIAccountState === 'function') {
    const state = getOpenAIAccountState()
    return state && typeof state === 'object' ? state : {}
  }
  const service = getOpenAIAccountAuthService()
  const state = service?.getState?.()
  return state && typeof state === 'object' ? state : {}
}

function resolveAccountAvailability(state = {}) {
  const availability = state?.storage?.availability && typeof state.storage.availability === 'object'
    ? state.storage.availability
    : (state?.sessionSummary?.availability && typeof state.sessionSummary.availability === 'object'
      ? state.sessionSummary.availability
      : null)
  if (availability) {
    return {
      supported: availability.supported === true,
      reason: normalizeId(availability.reason),
      message: normalizeId(availability.message),
    }
  }
  return {
    supported: false,
    reason: 'bridge_unavailable',
    message: 'OpenAI account auth is unavailable because the local account bridge is not ready.',
  }
}

function resolveAccountBlockedState(state = {}) {
  const sessionSummary = state?.sessionSummary && typeof state.sessionSummary === 'object'
    ? state.sessionSummary
    : null
  const availability = resolveAccountAvailability(state)
  if (availability.supported !== true) {
    return {
      blockedReason: availability.reason || 'bridge_unavailable',
      blockedMessage: availability.message || 'OpenAI account auth is unavailable because the local account bridge is not ready.',
      availability,
      sessionSummary,
      activeLogin: state?.activeLogin ?? null,
    }
  }

  if (sessionSummary?.hasSession !== true) {
    return resolveAccountSessionBlockedState(state)
  }

  return {
    blockedReason: 'account_runtime_unsupported',
    blockedMessage: 'OpenAI account auth is connected, but this runtime path does not yet support account-mode execution.',
    availability,
    sessionSummary,
    activeLogin: state?.activeLogin ?? null,
  }
}

function resolveAccountSessionBlockedState(state = {}) {
  const sessionSummary = state?.sessionSummary && typeof state.sessionSummary === 'object'
    ? state.sessionSummary
    : null
  const activeLogin = state?.activeLogin ?? null
  const loginPhase = normalizeId(activeLogin?.phase).toLowerCase()
  if (loginPhase === 'starting' || loginPhase === 'waiting_for_browser' || loginPhase === 'waiting_for_callback') {
    return {
      blockedReason: 'account_login_in_progress',
      blockedMessage: 'OpenAI account login is still in progress.',
      availability: resolveAccountAvailability(state),
      sessionSummary,
      activeLogin,
    }
  }

  const sessionStatus = normalizeId(sessionSummary?.status).toLowerCase()
  if (sessionStatus === 'expired') {
    return {
      blockedReason: 'account_session_expired',
      blockedMessage: 'Your OpenAI account session expired. Reconnect it in Settings.',
      availability: resolveAccountAvailability(state),
      sessionSummary,
      activeLogin,
    }
  }
  if (sessionStatus === 'error') {
    return {
      blockedReason: 'account_session_error',
      blockedMessage: normalizeId(sessionSummary?.lastErrorMessage) || 'OpenAI account session is unavailable.',
      availability: resolveAccountAvailability(state),
      sessionSummary,
      activeLogin,
    }
  }
  if (sessionStatus === 'unsupported_auth_mode') {
    const bridgeAuthMode = normalizeId(sessionSummary?.bridgeAuthMode)
    return {
      blockedReason: 'unsupported_auth_mode',
      blockedMessage: normalizeId(sessionSummary?.lastErrorMessage) || (
        bridgeAuthMode
          ? `OpenAI account bridge reported unsupported auth mode "${bridgeAuthMode}".`
          : 'OpenAI account bridge reported an unsupported auth mode.'
      ),
      availability: resolveAccountAvailability(state),
      sessionSummary,
      activeLogin,
    }
  }
  return {
    blockedReason: 'account_login_required',
    blockedMessage: 'OpenAI account auth is selected, but no active account session is connected.',
    availability: resolveAccountAvailability(state),
    sessionSummary,
    activeLogin,
  }
}

function buildOpenAIExecutionBlockedAuthResult(source = {}) {
  const blockedReason = normalizeId(source.blockedReason)
  const canonicalErrorClass = resolveOpenAIExecutionCanonicalErrorClass(
    source.canonicalErrorClass || blockedReason,
  )
  return {
    ...source,
    canonicalErrorClass,
    ...resolveOpenAIExecutionUserFacingBlockedState({
      blockedReason,
      canonicalErrorClass,
    }),
  }
}

export function resolveOpenAIExecutionAuth({
  apiKey = '',
  getSettingsFn = getSettings,
  getKey = vault.getKey,
  getOpenAIAccountState = null,
  allowAccountRuntime = false,
} = {}) {
  const explicitApiKey = normalizeId(apiKey)
  if (explicitApiKey) {
    return {
      ok: true,
      authMethod: 'api_key',
      apiKey: explicitApiKey,
      blockedReason: '',
      blockedMessage: '',
      canonicalErrorClass: '',
      userFacingBlockedReason: '',
      userFacingBlockedMessage: '',
      availability: null,
      sessionSummary: null,
      activeLogin: null,
    }
  }

  const settings = typeof getSettingsFn === 'function' ? getSettingsFn() : {}
  const authMethod = resolveSelectedOpenAIAuthMethod(settings)
  if (authMethod === 'account') {
    const accountState = resolveOpenAIAccountState(getOpenAIAccountState)
    const availability = resolveAccountAvailability(accountState)
    const sessionSummary = accountState?.sessionSummary && typeof accountState.sessionSummary === 'object'
      ? accountState.sessionSummary
      : null
    const activeLogin = accountState?.activeLogin ?? null
    if (availability.supported === true && allowAccountRuntime === true && sessionSummary?.hasSession === true) {
      return {
        ok: true,
        authMethod: 'account',
        apiKey: '',
        blockedReason: '',
        blockedMessage: '',
        canonicalErrorClass: '',
        userFacingBlockedReason: '',
        userFacingBlockedMessage: '',
        availability,
        sessionSummary,
        activeLogin,
      }
    }
    if (availability.supported === true && allowAccountRuntime === true) {
      const blockedState = resolveAccountSessionBlockedState(accountState)
      return buildOpenAIExecutionBlockedAuthResult({
        ok: false,
        authMethod: 'account',
        apiKey: '',
        ...blockedState,
      })
    }
    const blockedState = resolveAccountBlockedState(accountState)
    return buildOpenAIExecutionBlockedAuthResult({
      ok: false,
      authMethod: 'account',
      apiKey: '',
      ...blockedState,
    })
  }

  const storedApiKey = normalizeId(typeof getKey === 'function' ? getKey('openai') : '')
  const blockedReason = storedApiKey ? '' : 'missing_api_key'
  const canonicalErrorClass = resolveOpenAIExecutionCanonicalErrorClass(blockedReason)
  return {
    ok: !!storedApiKey,
    authMethod: 'api_key',
    apiKey: storedApiKey,
    blockedReason,
    blockedMessage: storedApiKey ? '' : 'No API key for openai. Add it in Settings.',
    canonicalErrorClass,
    ...resolveOpenAIExecutionUserFacingBlockedState({
      blockedReason,
      canonicalErrorClass,
    }),
    availability: null,
    sessionSummary: null,
    activeLogin: null,
  }
}

export function createOpenAIExecutionAuthError(auth = null) {
  const source = auth && typeof auth === 'object' ? auth : {}
  const error = new Error(
    normalizeId(source.userFacingBlockedMessage)
    || normalizeId(source.blockedMessage)
    || 'OpenAI authentication is unavailable for this runtime path.',
  )
  error.code = 'openai_auth_blocked'
  error.providerId = 'openai'
  error.authMethod = normalizeId(source.authMethod) || 'api_key'
  error.reason = normalizeId(source.blockedReason) || 'openai_auth_blocked'
  error.canonicalErrorClass = resolveOpenAIExecutionCanonicalErrorClass(
    source.canonicalErrorClass || source.blockedReason,
  )
  error.userFacingReason = normalizeId(source.userFacingBlockedReason || source.canonicalErrorClass)
  error.userFacingMessage = normalizeId(source.userFacingBlockedMessage || source.blockedMessage)
  error.diagnosticMessage = normalizeId(source.blockedMessage)
  if (source.availability && typeof source.availability === 'object') {
    error.availability = { ...source.availability }
  }
  if (source.sessionSummary && typeof source.sessionSummary === 'object') {
    error.sessionStatus = normalizeId(source.sessionSummary.status)
  }
  return error
}

export const __testOpenAIExecutionAuthInternals = Object.freeze({
  resolveSelectedOpenAIAuthMethod,
  resolveAccountAvailability,
  resolveAccountBlockedState,
  resolveOpenAIExecutionCanonicalErrorClass,
  resolveOpenAIExecutionUserFacingBlockedState,
})
