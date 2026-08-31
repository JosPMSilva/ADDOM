import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyOpenAIWebSocketRecovery,
  OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
} from '../../src/main/api-clients/experimental/openai-websocket/openai-websocket-reconnect-policy.mjs'

test('openai websocket reconnect policy prioritizes fresh-chain retry before generic reconnecting', () => {
  const recovery = classifyOpenAIWebSocketRecovery({
    error: {
      code: 'previous_response_not_found',
      openaiWebSocketChainResetRecommended: true,
      openaiWebSocketReconnectRecommended: true,
      openaiWebSocketEmittedAnyChunk: false,
    },
    reconnectAttempt: 0,
    fallbackEnabled: true,
  })

  assert.equal(recovery.action, 'fresh_chain_retry')
})

test('openai websocket reconnect policy retries safe transient pre-output failures up to the configured budget', () => {
  const retryable = classifyOpenAIWebSocketRecovery({
    error: {
      code: 'websocket_connection_limit_reached',
      openaiWebSocketReconnectRecommended: true,
      openaiWebSocketEmittedAnyChunk: false,
    },
    reconnectAttempt: 2,
    fallbackEnabled: true,
  })
  const exhausted = classifyOpenAIWebSocketRecovery({
    error: {
      code: 'websocket_connection_limit_reached',
      openaiWebSocketReconnectRecommended: true,
      openaiWebSocketEmittedAnyChunk: false,
    },
    reconnectAttempt: OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
    fallbackEnabled: true,
  })

  assert.equal(retryable.action, 'retryable_pre_output')
  assert.equal(exhausted.action, 'fallback_to_legacy')
  assert.equal(exhausted.exhausted, true)
})

test('openai websocket reconnect policy fails truthfully after partial output and treats aborts as user cancellation', () => {
  const partialOutput = classifyOpenAIWebSocketRecovery({
    error: {
      code: 'websocket_connection_closed',
      openaiWebSocketReconnectRecommended: true,
      openaiWebSocketEmittedAnyChunk: true,
    },
    reconnectAttempt: 0,
    fallbackEnabled: true,
  })
  const cancelled = classifyOpenAIWebSocketRecovery({
    error: {
      name: 'AbortError',
      message: 'aborted',
    },
    reconnectAttempt: 0,
    fallbackEnabled: true,
  })

  assert.equal(partialOutput.action, 'fail_truthfully')
  assert.equal(cancelled.action, 'user_cancelled')
})

test('openai websocket reconnect policy fails truthfully when the turn deadline is exhausted', () => {
  const recovery = classifyOpenAIWebSocketRecovery({
    error: {
      code: 'openai_websocket_turn_timeout',
      openaiWebSocketDeadlineExceeded: true,
      openaiWebSocketEmittedAnyChunk: false,
    },
    reconnectAttempt: 2,
    fallbackEnabled: true,
  })

  assert.equal(recovery.action, 'fail_truthfully')
})
