function isPlainObject(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function normalizeOpenAIAccountAuthRefreshRequest(params = null) {
  if (!isPlainObject(params)) {
    return { valid: false, failureReason: 'invalid_request_shape' }
  }
  const supportedKeys = new Set(['reason', 'previousAccountId'])
  if (Object.keys(params).some((key) => !supportedKeys.has(key))) {
    return { valid: false, failureReason: 'unsupported_request_shape' }
  }
  const reason = String(params.reason || '').trim().toLowerCase()
  if (reason !== 'unauthorized') {
    return { valid: false, failureReason: 'unsupported_refresh_reason' }
  }
  const previousAccountId = params.previousAccountId === null
    ? ''
    : String(params.previousAccountId || '').trim()
  if (previousAccountId.length > 256) {
    return { valid: false, failureReason: 'invalid_previous_account_id' }
  }
  return {
    valid: true,
    reason,
    previousAccountId,
  }
}

export function buildOpenAIAccountExternalAuthRefreshError() {
  return {
    code: -32001,
    message: 'OpenAI account authorization needs to be renewed in ADDOM.',
  }
}
