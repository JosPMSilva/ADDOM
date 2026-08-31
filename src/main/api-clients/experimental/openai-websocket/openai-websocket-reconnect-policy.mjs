import { isRetryableProviderError } from '../../provider-policy.mjs'

export const OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS = 6
export const OPENAI_WEBSOCKET_RECONNECT_DELAY_MS = 5000

function normalizeId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeMessage(error = null) {
  const parts = [
    error?.message,
    error?.cause?.message,
    error?.error?.message,
    error?.responseBody,
  ]
  return parts
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

export function isOpenAIWebSocketAbortError(error = null) {
  const name = normalizeId(error?.name)
  const code = normalizeId(error?.code || error?.cause?.code)
  if (name === 'aborterror' || code === 'abort_err') return true
  return normalizeMessage(error).includes('aborted')
}

export function inferOpenAIWebSocketReconnectReason(error = null, fallback = 'transient_transport_failure') {
  const explicit = normalizeId(error?.openaiWebSocketReconnectReason || error?.code)
  if (explicit) return explicit
  const text = normalizeMessage(error)
  if (text.includes('timed out') || text.includes('timeout')) return 'timeout'
  if (text.includes('network')) return 'network_error'
  if (text.includes('socket closed')) return 'socket_closed_before_terminal'
  if (text.includes('temporarily unavailable')) return 'temporarily_unavailable'
  if (text.includes('stream disconnected before completion')) return 'stream_disconnected_before_completion'
  return normalizeId(fallback) || 'transient_transport_failure'
}

export function classifyOpenAIWebSocketRecovery({
  error = null,
  reconnectAttempt = 0,
  fallbackEnabled = true,
  abortSignal = null,
} = {}) {
  const preOutputFailure = error?.openaiWebSocketEmittedAnyChunk !== true
  const reason = inferOpenAIWebSocketReconnectReason(error)

  if (error?.openaiWebSocketDeadlineExceeded === true) {
    return {
      action: 'fail_truthfully',
      reason: reason || 'deadline_exceeded',
      preOutputFailure,
      exhausted: false,
    }
  }

  if (abortSignal?.aborted || isOpenAIWebSocketAbortError(error)) {
    return {
      action: 'user_cancelled',
      reason: reason || 'aborted',
      preOutputFailure,
    }
  }

  if (error?.openaiWebSocketChainResetRecommended === true && preOutputFailure) {
    return {
      action: 'fresh_chain_retry',
      reason: reason || 'previous_response_not_found',
      preOutputFailure,
    }
  }

  const transientPreOutputFailure = preOutputFailure && (
    error?.openaiWebSocketReconnectRecommended === true
    || isRetryableProviderError(error)
  )

  if (transientPreOutputFailure && reconnectAttempt < OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS) {
    return {
      action: 'retryable_pre_output',
      reason,
      preOutputFailure,
      exhausted: false,
    }
  }

  if (transientPreOutputFailure) {
    return {
      action: fallbackEnabled ? 'fallback_to_legacy' : 'fail_truthfully',
      reason,
      preOutputFailure,
      exhausted: true,
    }
  }

  if (preOutputFailure && fallbackEnabled && error?.openaiWebSocketFallbackRecommended === true) {
    return {
      action: 'fallback_to_legacy',
      reason: inferOpenAIWebSocketReconnectReason(error, normalizeId(error?.openaiWebSocketFallbackReason) || 'fallback_recommended'),
      preOutputFailure,
      exhausted: false,
    }
  }

  return {
    action: 'fail_truthfully',
    reason,
    preOutputFailure,
    exhausted: false,
  }
}
