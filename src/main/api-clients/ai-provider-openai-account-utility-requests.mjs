function isPlainObject(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function buildOpenAIAccountCurrentTimeResponse(params = null, {
  now = Date.now,
} = {}) {
  if (!isPlainObject(params)) {
    return { valid: false, reason: 'invalid_request_shape', response: null }
  }
  const keys = Object.keys(params)
  if (keys.some((key) => key !== 'threadId')) {
    return { valid: false, reason: 'unsupported_request_shape', response: null }
  }
  const threadId = String(params.threadId || '').trim()
  if (!threadId || threadId.length > 256) {
    return { valid: false, reason: 'missing_thread_id', response: null }
  }
  const currentTimeMs = Number(now())
  if (!Number.isFinite(currentTimeMs) || currentTimeMs < 0) {
    return { valid: false, reason: 'invalid_system_clock', response: null }
  }
  return {
    valid: true,
    response: {
      currentTimeAt: Math.floor(currentTimeMs / 1_000),
    },
  }
}

export function buildOpenAIAccountAttestationUnavailableError() {
  return {
    code: -32601,
    message: 'Client attestation is not supported by ADDOM.',
  }
}
