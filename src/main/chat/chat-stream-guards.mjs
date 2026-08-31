export { isAbortError } from '../utils/abort-error.mjs'

function normalizeAvailabilityState(value = '') {
  return String(value || '').trim().toLowerCase()
}

function buildProviderModelLabel(providerId = '', modelId = '') {
  const provider = String(providerId || '').trim()
  const model = String(modelId || '').trim()
  if (provider && model) return `${provider}:${model}`
  return provider || model || 'this model'
}

function buildChatStreamPrereqFailure({
  errorClass = '',
  message = '',
  reason = '',
  diagnosticReason = '',
  diagnosticMessage = '',
} = {}) {
  const normalizedMessage = String(message || '').trim()
  if (!normalizedMessage) return null
  const canonicalErrorClass = String(errorClass || '').trim().toLowerCase()
  return {
    canonicalErrorClass,
    errorClass: canonicalErrorClass,
    message: normalizedMessage,
    reason: String(reason || '').trim().toLowerCase(),
    diagnosticReason: String(diagnosticReason || '').trim().toLowerCase(),
    diagnosticMessage: String(diagnosticMessage || '').trim(),
  }
}

export function getChatStreamPrereqFailure({
  providerId,
  modelId,
  messages,
  apiKey,
  isLocal,
  adapterProfile = null,
  authMethod = '',
  authBlockedReason = '',
  authBlockedMessage = '',
  authBlockedClass = '',
  authDiagnosticMessage = '',
} = {}) {
  if (!providerId || !messages?.length) {
    return buildChatStreamPrereqFailure({
      message: 'providerId and messages are required.',
      reason: 'missing_input',
    })
  }
  const normalizedAuthMethod = String(authMethod || '').trim().toLowerCase()
  if (normalizedAuthMethod === 'account' && String(authBlockedMessage || '').trim()) {
    return buildChatStreamPrereqFailure({
      errorClass: authBlockedClass,
      message: String(authBlockedMessage || 'Account authentication is unavailable for this runtime path.').trim(),
      reason: 'auth_blocked',
      diagnosticReason: authBlockedReason,
      diagnosticMessage: authDiagnosticMessage,
    })
  }
  const accountRuntimeSupport = adapterProfile?.openaiRuntimeSupport
  if (
    normalizedAuthMethod === 'account'
    && normalizeAvailabilityState(accountRuntimeSupport?.accountRuntimeStatus) === 'unsupported'
  ) {
    return buildChatStreamPrereqFailure({
      errorClass: 'capability_unsupported',
      message: String(
        accountRuntimeSupport?.accountRuntimeMessage
        || `${buildProviderModelLabel(providerId, modelId)} is not supported with the selected account authentication method.`,
      ).trim(),
      reason: 'account_model_unsupported',
    })
  }
  const availability = adapterProfile?.availability && typeof adapterProfile.availability === 'object'
    ? adapterProfile.availability
    : null
  const availabilityStatus = normalizeAvailabilityState(availability?.status)
  const availabilitySelectionState = normalizeAvailabilityState(availability?.selectionState)
  if (availabilityStatus === 'unsupported' || availabilitySelectionState === 'unsupported') {
    return buildChatStreamPrereqFailure({
      errorClass: 'capability_unsupported',
      message: `ADDOM does not currently support ${buildProviderModelLabel(providerId, modelId)} through the curated compatibility engine.`,
      reason: 'availability_unsupported',
    })
  }
  if (normalizedAuthMethod !== 'account' && availability?.requiresKey === true && availability?.configured === false) {
    return buildChatStreamPrereqFailure({
      errorClass: 'missing_prerequisite',
      message: `No API key for ${providerId}. Add it in Settings.`,
      reason: 'missing_api_key',
    })
  }
  if (!apiKey && !isLocal && normalizedAuthMethod !== 'account') {
    return buildChatStreamPrereqFailure({
      errorClass: 'missing_prerequisite',
      message: `No API key for ${providerId}. Add it in Settings.`,
      reason: 'missing_api_key',
    })
  }
  return null
}

export function getChatStreamPrereqError(args = {}) {
  return getChatStreamPrereqFailure(args)?.message || ''
}
