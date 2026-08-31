import test from 'node:test'
import assert from 'node:assert/strict'

import { buildChatUsagePayload } from '../../src/main/chat/chat-usage-payload.mjs'

test('chat usage payload prefers provider-backed account context telemetry over registry limit and local estimate', () => {
  const payload = buildChatUsagePayload({
    threadId: 'thread_1',
    turnId: 'turn_1',
    providerId: 'openai',
    usage: {
      inputTokens: 2048,
      outputTokens: 256,
      totalTokens: 2304,
    },
    providerResponseMeta: {
      authMethod: 'account',
      inputLimitTokens: 8192,
      remainingContextTokens: 3072,
      threadOccupancyTokens: 5120,
      providerUsageSemantics: 'openai_account_provider_context',
    },
    modelContext: {
      limitTokens: 1114112,
      source: 'registry',
      provenance: 'registry',
      precision: 'estimated',
    },
    promptOccupancyEstimateTokens: 144,
    promptOccupancyEstimateConfidence: 'rough_estimate',
    promptOccupancyEstimateMethod: 'history_estimate',
    authMethod: 'account',
  })

  assert.equal(payload.modelLimit, 8192)
  assert.equal(payload.contextOccupancyTokens, 5120)
  assert.equal(payload.contextRemainingTokens, 3072)
  assert.equal(payload.remainingTokens, 3072)
  assert.equal(payload.occupancySource, 'provider_thread_context')
  assert.equal(payload.occupancyConfidence, 'provider_verified')
  assert.equal(payload.occupancyMethod, 'provider_remaining_tokens')
  assert.equal(payload.providerUsageSemantics, 'openai_account_provider_context')
  assert.equal(payload.source, 'provider')
  assert.equal(payload.limitProvenance, 'provider_response_meta')
  assert.equal(payload.limitPrecision, 'exact')
})
