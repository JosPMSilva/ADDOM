import { sanitizeTextForSecrets } from './openai-account-sanitization.mjs'
import {
  asOptionalObject,
  asTrimmedString,
  firstNonEmptyString,
} from './openai-account-auth-normalization.mjs'

export function resolveLoginConfirmationFailure(state = {}) {
  const availability = asOptionalObject(state?.storage?.availability)
  if (availability?.supported !== true) {
    return {
      errorCode: asTrimmedString(availability?.reason) || 'bridge_unavailable',
      errorMessage: asTrimmedString(availability?.message) || 'OpenAI account login could not be confirmed because the local account bridge became unavailable.',
    }
  }
  const sessionSummary = asOptionalObject(state?.sessionSummary)
  const status = asTrimmedString(sessionSummary?.status).toLowerCase()
  if (status === 'unsupported_auth_mode') {
    return {
      errorCode: 'unsupported_auth_mode',
      errorMessage: asTrimmedString(sessionSummary?.lastErrorMessage) || 'OpenAI account bridge reported an unsupported auth mode after login.',
    }
  }
  if (status === 'error') {
    return {
      errorCode: asTrimmedString(sessionSummary?.lastErrorCode) || 'account_session_error',
      errorMessage: asTrimmedString(sessionSummary?.lastErrorMessage) || 'OpenAI account login completed, but the connected account state could not be refreshed.',
    }
  }
  if (status === 'expired') {
    return {
      errorCode: 'account_session_expired',
      errorMessage: 'OpenAI account login completed, but the session immediately expired.',
    }
  }
  return {
    errorCode: 'login_confirmation_failed',
    errorMessage: 'OpenAI account login completed, but ADDOM could not confirm the connected account session.',
  }
}

export function isRetryableLoginConfirmationState(state = {}) {
  const availability = asOptionalObject(state?.storage?.availability)
  if (availability?.supported !== true) return false
  const sessionSummary = asOptionalObject(state?.sessionSummary)
  if (sessionSummary?.hasSession === true) return false
  const status = asTrimmedString(sessionSummary?.status).toLowerCase()
  return status === '' || status === 'needs_login'
}

export function mapBridgeError(error = null, fallbackReason = 'bridge_request_failed', fallbackMessage = 'OpenAI account bridge request failed.') {
  const source = error && typeof error === 'object' ? error : {}
  const rawReason = firstNonEmptyString(source.reason, source.code)
  const rawMessage = firstNonEmptyString(source.message)
  const normalizedReason = rawReason.toLowerCase()
  const normalizedMessage = rawMessage.toLowerCase()
  if (
    normalizedReason === 'callback_port_in_use'
    || normalizedReason === 'eaddrinuse'
    || normalizedMessage.includes('address already in use')
    || normalizedMessage.includes('callback port is already in use')
    || normalizedMessage.includes('eaddrinuse')
  ) {
    return {
      reason: 'callback_port_in_use',
      message: 'OpenAI account login could not continue because the local callback port is already in use. Retry the login flow or close the conflicting process and try again.',
    }
  }
  if (
    normalizedReason === 'consent_denied'
    || normalizedReason === 'access_denied'
    || normalizedReason === 'authorization_denied'
    || normalizedReason === 'user_denied'
    || normalizedReason === 'user_cancelled'
    || normalizedMessage.includes('access_denied')
    || normalizedMessage.includes('consent denied')
    || normalizedMessage.includes('user denied')
    || normalizedMessage.includes('authorization denied')
  ) {
    return {
      reason: 'consent_denied',
      message: 'OpenAI account login was cancelled or denied in the browser consent step. Start the login flow again to retry.',
    }
  }
  if (
    normalizedReason === 'callback_not_completed'
    || normalizedReason === 'callback_timeout'
    || normalizedMessage.includes('timed out waiting for callback')
    || normalizedMessage.includes('callback did not complete')
  ) {
    return {
      reason: 'callback_not_completed',
      message: 'OpenAI account login did not complete in the browser callback. Retry the login flow and finish the browser consent step before returning to ADDOM.',
    }
  }
  return {
    reason: rawReason || fallbackReason,
    message: sanitizeTextForSecrets(rawMessage || fallbackMessage),
  }
}
