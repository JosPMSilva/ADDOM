import { getProviderErrorStatusCode, isRetryableProviderError } from './provider-policy.mjs'
import { createProviderCredentialFingerprint } from './provider-credential-fingerprint.mjs'

const ANTHROPIC_RELEVANT_HEADERS = Object.freeze([
  'anthropic-organization-id',
  'anthropic-workspace-id',
  'anthropic-ratelimit-input-tokens-limit',
  'anthropic-ratelimit-input-tokens-remaining',
  'anthropic-ratelimit-output-tokens-limit',
  'anthropic-ratelimit-output-tokens-remaining',
  'anthropic-ratelimit-requests-limit',
  'anthropic-ratelimit-requests-remaining',
  'anthropic-ratelimit-tokens-limit',
  'anthropic-ratelimit-tokens-remaining',
  'retry-after',
])

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizePositiveInt(value) {
  const normalized = normalizeText(value)
  if (!normalized) return 0
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.max(0, Math.ceil(numeric))
}

export function normalizeProviderBudgetHeaders(headers = null) {
  if (!headers || typeof headers !== 'object') return {}

  const next = {}
  const entries = typeof headers.entries === 'function'
    ? Array.from(headers.entries())
    : typeof headers.forEach === 'function'
      ? (() => {
          const out = []
          headers.forEach((value, key) => out.push([key, value]))
          return out
        })()
      : Object.entries(headers)

  for (const [rawKey, rawValue] of entries) {
    const key = normalizeProviderId(rawKey)
    if (!key || !ANTHROPIC_RELEVANT_HEADERS.includes(key)) continue
    const value = Array.isArray(rawValue)
      ? normalizeText(rawValue[0])
      : normalizeText(rawValue)
    if (!value) continue
    next[key] = value
  }

  return next
}

export function extractProviderBudgetHeadersFromError(errorLike = null) {
  const sources = [
    errorLike?.responseHeaders,
    errorLike?.response?.headers,
    errorLike?.headers,
    errorLike?.cause?.responseHeaders,
    errorLike?.cause?.response?.headers,
    errorLike?.cause?.headers,
  ]

  const merged = {}
  for (const source of sources) {
    const normalized = normalizeProviderBudgetHeaders(source)
    for (const headerName of ANTHROPIC_RELEVANT_HEADERS) {
      if (merged[headerName] || !normalized[headerName]) continue
      merged[headerName] = normalized[headerName]
    }
  }

  return merged
}

function resolveObservationSource(value = '') {
  const normalized = normalizeProviderId(value)
  if (normalized === 'rate_limit_error') return 'rate_limit_error'
  return 'success_response'
}

function readHeaderValue(headers = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(headers?.[key])
    if (value) return value
  }
  return ''
}

function hasObservationSignal(headers = {}) {
  return ANTHROPIC_RELEVANT_HEADERS.some((headerName) => normalizeText(headers?.[headerName]).length > 0)
}

export function normalizeProviderBudgetObservation({
  providerId = '',
  apiKey = '',
  modelId = '',
  observationSource = 'success_response',
  headers = null,
  error = null,
  observedAt = Date.now(),
} = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  if (normalizedProviderId !== 'anthropic') return null

  const credentialFingerprint = createProviderCredentialFingerprint(normalizedProviderId, apiKey)
  if (!credentialFingerprint) return null

  const resolvedObservationSource = resolveObservationSource(observationSource)
  if (
    resolvedObservationSource === 'rate_limit_error'
    && (
      getProviderErrorStatusCode(error) !== 429
      || isRetryableProviderError(error) !== true
    )
  ) {
    return null
  }

  const relevantHeaders = resolvedObservationSource === 'rate_limit_error'
    ? extractProviderBudgetHeadersFromError(error)
    : normalizeProviderBudgetHeaders(headers)

  if (!hasObservationSignal(relevantHeaders)) return null

  return {
    providerId: normalizedProviderId,
    organizationId: readHeaderValue(relevantHeaders, ['anthropic-organization-id']),
    workspaceId: readHeaderValue(relevantHeaders, ['anthropic-workspace-id']),
    credentialFingerprint,
    observationSource: resolvedObservationSource,
    modelId: normalizeText(modelId),
    observedAt: Math.max(0, Number(observedAt || Date.now()) || Date.now()),
    inputTpmLimit: normalizePositiveInt(readHeaderValue(relevantHeaders, [
      'anthropic-ratelimit-input-tokens-limit',
      'anthropic-ratelimit-tokens-limit',
    ])),
    inputTpmRemaining: normalizePositiveInt(readHeaderValue(relevantHeaders, [
      'anthropic-ratelimit-input-tokens-remaining',
      'anthropic-ratelimit-tokens-remaining',
    ])),
    outputTpmLimit: normalizePositiveInt(readHeaderValue(relevantHeaders, [
      'anthropic-ratelimit-output-tokens-limit',
    ])),
    outputTpmRemaining: normalizePositiveInt(readHeaderValue(relevantHeaders, [
      'anthropic-ratelimit-output-tokens-remaining',
    ])),
    requestsPerMinuteLimit: normalizePositiveInt(readHeaderValue(relevantHeaders, [
      'anthropic-ratelimit-requests-limit',
    ])),
    requestsRemaining: normalizePositiveInt(readHeaderValue(relevantHeaders, [
      'anthropic-ratelimit-requests-remaining',
    ])),
    retryAfterSeconds: normalizePositiveInt(readHeaderValue(relevantHeaders, ['retry-after'])),
    rawHeaders: relevantHeaders,
  }
}
