const DEFAULT_RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const DEFAULT_RETRYABLE_CODES = new Set([
  'ABORT_ERR',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

export const PROVIDER_POLICY = Object.freeze({
  modelFetch: Object.freeze({
    timeoutMs: 3500,
    retries: 2,
    baseDelayMs: 180,
    maxDelayMs: 1200,
  }),
  stream: Object.freeze({
    timeoutMs: 300_000,
    idleTimeoutMs: 60_000,
    retries: 1,
    baseDelayMs: 200,
    maxDelayMs: 1200,
  }),
})

function normalizeHeadersMap(headers = {}) {
  if (!headers || typeof headers !== 'object') return {}
  const next = {}
  const entries = typeof headers.forEach === 'function'
    ? (() => {
        const out = []
        try {
          headers.forEach((value, key) => out.push([key, value]))
        } catch {
          return []
        }
        return out
      })()
    : Object.entries(headers)
  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey || '').trim().toLowerCase()
    if (!key) continue
    next[key] = Array.isArray(rawValue) ? String(rawValue[0] || '') : String(rawValue || '')
  }
  return next
}

function flattenProviderErrorText(err) {
  const parts = [
    err?.message,
    err?.responseBody,
    err?.data?.error?.message,
    err?.cause?.message,
    err?.cause?.responseBody,
    err?.cause?.data?.error?.message,
  ]
  return parts
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('\n')
}

function parseRetryDelaySecondsFromText(text = '') {
  const raw = String(text || '')
  if (!raw) return 0
  const direct = /(?:retry|try again)\s+in\s+(\d+(?:\.\d+)?)s/i.exec(raw)
  if (direct) return Math.max(0, Math.ceil(Number(direct[1] || 0)))
  const retryDelay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(raw)
  if (retryDelay) return Math.max(0, Math.ceil(Number(retryDelay[1] || 0)))
  return 0
}

function parseRetryAfterSecondsFromHeaders(err) {
  const headerSources = [
    err?.responseHeaders,
    err?.cause?.responseHeaders,
  ]
  for (const source of headerSources) {
    const headers = normalizeHeadersMap(source)
    const retryAfterRaw = String(headers['retry-after'] || '').trim()
    if (!retryAfterRaw) continue
    const seconds = Number(retryAfterRaw)
    if (Number.isFinite(seconds) && seconds > 0) return Math.max(1, Math.ceil(seconds))
  }
  return 0
}

export function getProviderErrorStatusCode(err) {
  const status = Number(
    err?.statusCode
    ?? err?.status
    ?? err?.cause?.statusCode
    ?? err?.cause?.status,
  )
  return Number.isFinite(status) ? status : 0
}

export function getProviderRetryAfterSeconds(err) {
  const fromHeaders = parseRetryAfterSecondsFromHeaders(err)
  if (fromHeaders > 0) return fromHeaders
  return parseRetryDelaySecondsFromText(flattenProviderErrorText(err))
}

export function isProviderQuotaExceededError(err) {
  const text = flattenProviderErrorText(err).toLowerCase()
  if (!text) return false
  return (
    text.includes('quota exceeded')
    || text.includes('resource_exhausted')
    || text.includes('insufficient_quota')
    || text.includes('quota failure')
    || text.includes('billing details')
    || text.includes('generate_content_free_tier_requests')
    || text.includes('perdayperproject')
    || text.includes('per day per project')
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryDelay(attempt, { baseDelayMs, maxDelayMs }) {
  const exp = Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)))
  const low = Math.max(1, Math.floor(exp * 0.5))
  return low + Math.floor(Math.random() * (exp - low + 1))
}

export function isRetryableProviderError(err) {
  const status = getProviderErrorStatusCode(err)
  if (status === 429 && isProviderQuotaExceededError(err)) {
    return false
  }
  if (Number.isFinite(status) && DEFAULT_RETRYABLE_STATUS.has(status)) {
    return true
  }

  const code = String(err?.code ?? err?.cause?.code ?? '').toUpperCase()
  if (code && DEFAULT_RETRYABLE_CODES.has(code)) {
    return true
  }

  const msg = flattenProviderErrorText(err).toLowerCase()
  if (isProviderQuotaExceededError(err)) {
    return false
  }
  return (
    msg.includes('timed out')
    || msg.includes('timeout')
    || msg.includes('network')
    || msg.includes('rate limit')
    || msg.includes('temporarily unavailable')
    || msg.includes('ecconn')
    || /status\s+5\d\d/.test(msg)
  )
}

export async function withRetry(fn, {
  retries = 0,
  baseDelayMs = 200,
  maxDelayMs = 2000,
  retryableFn = isRetryableProviderError,
  onRetry = null,
} = {}) {
  let attempt = 0
  let lastError = null

  while (attempt <= retries) {
    attempt += 1
    try {
      return await fn({ attempt })
    } catch (err) {
      lastError = err
      const shouldRetry = attempt <= retries && retryableFn(err, { attempt })
      if (!shouldRetry) throw err

      const delayMs = retryDelay(attempt, { baseDelayMs, maxDelayMs })
      if (typeof onRetry === 'function') {
        onRetry({ attempt, delayMs, error: err })
      }
      await sleep(delayMs)
    }
  }

  throw lastError
}

function timeoutSignal(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return null
  return AbortSignal.timeout(Math.round(timeoutMs))
}

export function combineSignals(...signals) {
  const filtered = signals.filter(Boolean)
  if (filtered.length === 0) return undefined
  if (filtered.length === 1) return filtered[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(filtered)
  return filtered[0]
}

export function buildTimeoutSignal(timeoutMs, existingSignal = undefined) {
  const timeout = timeoutSignal(timeoutMs)
  return combineSignals(existingSignal, timeout)
}

export function createProviderStreamStaleError({
  providerId = '',
  timeoutMs = 0,
  message = '',
  code = 'provider_stream_stale',
} = {}) {
  const normalizedTimeoutMs = Math.max(0, Math.round(Number(timeoutMs || 0) || 0))
  const fallbackMessage = normalizedTimeoutMs > 0
    ? `Provider stream went stale after ${normalizedTimeoutMs} ms without progress.`
    : 'Provider stream went stale without progress.'
  const error = new Error(String(message || fallbackMessage).trim() || fallbackMessage)
  error.name = 'TimeoutError'
  error.code = String(code || 'provider_stream_stale').trim().toLowerCase() || 'provider_stream_stale'
  error.providerId = String(providerId || '').trim() || undefined
  error.streamStale = true
  error.timeoutMs = normalizedTimeoutMs
  return error
}

export function isProviderStreamStaleError(errorLike = null) {
  if (!errorLike || typeof errorLike !== 'object') return false
  if (errorLike.streamStale === true) return true
  return String(errorLike.code || '').trim().toLowerCase() === 'provider_stream_stale'
}

export function createProgressTimeoutMonitor({
  timeoutMs = 0,
  buildError = null,
  schedulerGraceMs = null,
} = {}) {
  const normalizedTimeoutMs = Math.max(0, Math.round(Number(timeoutMs || 0) || 0))
  const normalizedSchedulerGraceMs = normalizedTimeoutMs > 0
    ? (() => {
        const requestedGraceMs = Number(schedulerGraceMs)
        if (Number.isFinite(requestedGraceMs) && requestedGraceMs > 0) {
          return Math.max(0, Math.round(requestedGraceMs))
        }
        return Math.min(250, Math.max(25, Math.round(normalizedTimeoutMs * 0.1)))
      })()
    : 0
  const controller = normalizedTimeoutMs > 0 ? new AbortController() : null
  let timeoutHandle = null
  let timedOut = false
  let timeoutError = null
  let timeoutDeadlineAt = 0

  const clear = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  const scheduleTimeout = () => {
    if (!controller || timedOut || timeoutDeadlineAt <= 0) return
    const remainingMs = Math.max(0, timeoutDeadlineAt - Date.now())
    timeoutHandle = setTimeout(triggerTimeout, remainingMs)
    timeoutHandle?.unref?.()
  }

  const triggerTimeout = () => {
    if (!controller || timedOut) return
    if (timeoutDeadlineAt > Date.now()) {
      clear()
      scheduleTimeout()
      return
    }
    timedOut = true
    clear()
    timeoutError = typeof buildError === 'function'
      ? buildError()
      : createProviderStreamStaleError({ timeoutMs: normalizedTimeoutMs })
    try {
      controller.abort(timeoutError)
    } catch {
      controller.abort()
    }
  }

  const markProgress = () => {
    if (!controller || timedOut) return
    timeoutDeadlineAt = Date.now() + normalizedTimeoutMs + normalizedSchedulerGraceMs
    clear()
    scheduleTimeout()
  }

  return {
    signal: controller?.signal,
    clear,
    dispose: clear,
    markProgress,
    timedOut: () => timedOut,
    error: () => timeoutError,
  }
}

export async function fetchJsonWithPolicy(url, init = {}, policy = PROVIDER_POLICY.modelFetch) {
  return withRetry(async () => {
    const signal = buildTimeoutSignal(policy.timeoutMs, init.signal)
    const res = await fetch(url, {
      ...init,
      signal,
    })
    if (!res.ok) {
      const err = new Error(`Model fetch failed: ${res.status}`)
      err.statusCode = res.status
      throw err
    }
    return res.json()
  }, {
    retries: policy.retries,
    baseDelayMs: policy.baseDelayMs,
    maxDelayMs: policy.maxDelayMs,
  })
}
