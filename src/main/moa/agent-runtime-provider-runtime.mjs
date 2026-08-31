import {
  getProviderRetryAfterSeconds,
  isProviderQuotaExceededError,
} from '../api-clients/provider-policy.mjs'

const MIN_AGENT_STREAM_TIMEOUT_MS = 5_000
const AGENT_STREAM_TIMEOUT_BUFFER_MS = 5_000

function isRateLimitError(errorLike) {
  const msg = String(errorLike?.message || '').trim().toLowerCase()
  const status = Number(errorLike?.status ?? errorLike?.statusCode ?? 0)
  return (
    status === 429
    || msg.includes('429')
    || msg.includes('rate limit')
    || msg.includes('too many requests')
  )
}

export function classifyAgentProviderFailure(errorLike = null) {
  const quotaExceeded = isProviderQuotaExceededError(errorLike)
  const rateLimited = quotaExceeded || isRateLimitError(errorLike)
  const retryAfterSeconds = rateLimited ? getProviderRetryAfterSeconds(errorLike) : 0
  if (!rateLimited) {
    return {
      status: 'failed',
      retryAfterSeconds: 0,
      error: String(errorLike?.message || 'Unknown agent error.'),
    }
  }
  const retryHint = retryAfterSeconds > 0 ? ` Retry after about ${retryAfterSeconds}s.` : ''
  const original = String(errorLike?.message || '').trim()
  if (!quotaExceeded) {
    return {
      status: 'rate_limited',
      retryAfterSeconds,
      error: original
        ? `Provider rate limited the request.${retryHint}\n\n${original}`
        : `Provider rate limited the request.${retryHint}`.trim(),
    }
  }
  return {
    status: 'rate_limited',
    retryAfterSeconds,
    error: original
      ? `Provider quota exceeded.${retryHint}\n\n${original}`
      : `Provider quota exceeded.${retryHint}`.trim(),
  }
}

export function isAgentRateLimitError(errorLike) {
  return isRateLimitError(errorLike)
}

export function resolveAgentProviderRuntimeSettings(providerId = '', providerRuntimeSettings = {}) {
  const normalizedProviderId = String(providerId || '').trim()
  if (!normalizedProviderId || !providerRuntimeSettings || typeof providerRuntimeSettings !== 'object') {
    return undefined
  }
  const settings = providerRuntimeSettings[normalizedProviderId]
  if (!settings || typeof settings !== 'object') return settings
  if (normalizedProviderId !== 'openai') return settings
  return {
    ...settings,
    transportMode: 'responses_stream',
  }
}

export function resolveAgentStreamTimeoutMs(runtime = {}) {
  const deadlineAt = Number(runtime?.delegationDeadlineAt || 0)
  if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) return 0
  const remainingMs = deadlineAt - Date.now() - AGENT_STREAM_TIMEOUT_BUFFER_MS
  if (remainingMs <= 0) return MIN_AGENT_STREAM_TIMEOUT_MS
  return Math.max(MIN_AGENT_STREAM_TIMEOUT_MS, Math.round(remainingMs))
}

export function resolveAgentStreamIdleTimeoutMs(providerId = '', runtime = {}) {
  const policy = runtime?.policy && typeof runtime.policy === 'object'
    ? runtime.policy
    : null
  const configuredTimeoutMs = (
    String(providerId || '').trim().toLowerCase() === 'ollama'
    || String(providerId || '').trim().toLowerCase() === 'lmstudio'
  )
    ? Number(policy?.localAgentStreamIdleTimeoutMs || 0)
    : Number(policy?.agentStreamIdleTimeoutMs || 0)
  const fallbackTimeoutMs = configuredTimeoutMs > 0 ? configuredTimeoutMs : 0
  if (fallbackTimeoutMs <= 0) return 0

  const deadlineAt = Number(runtime?.delegationDeadlineAt || 0)
  if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) {
    return Math.max(MIN_AGENT_STREAM_TIMEOUT_MS, Math.round(fallbackTimeoutMs))
  }
  const remainingMs = deadlineAt - Date.now() - AGENT_STREAM_TIMEOUT_BUFFER_MS
  if (remainingMs <= 0) return MIN_AGENT_STREAM_TIMEOUT_MS
  return Math.max(
    MIN_AGENT_STREAM_TIMEOUT_MS,
    Math.min(Math.round(fallbackTimeoutMs), Math.round(remainingMs)),
  )
}
