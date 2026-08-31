import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChatUsagePayload } from '../../src/main/chat/chat-usage-payload.mjs'
import { getProviderUsageFixture } from '../fixtures/provider-usage-fixtures.mjs'

test('buildChatUsagePayload uses prompt occupancy estimate for context remaining (not rolling spend)', () => {
  const payload = buildChatUsagePayload({
    threadId: 'thread_1',
    turnId: 'turn_1',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    modelContext: { limitTokens: 400000, maxOutputTokens: 128000, source: 'provider', lastVerified: '2026-02-24' },
    promptOccupancyEstimateTokens: 1200,
    rollingUsage: { inputTokens: 1000, outputTokens: 2000, reasoningTokens: 300, totalTokens: 3300 },
    round: 2,
  })

  assert.equal(payload.threadId, 'thread_1')
  assert.equal(payload.turnId, 'turn_1')
  assert.equal(payload.modelLimit, 400000)
  assert.equal(payload.maxOutputTokens, 128000)
  assert.equal(payload.source, 'provider')
  assert.equal(payload.limitProvenance, 'provider')
  assert.equal(payload.limitPrecision, 'exact')
  assert.equal(payload.limitLastVerified, '2026-02-24')
  assert.equal(payload.occupancySource, 'estimated_history')
  assert.equal(payload.contextOccupancyTokens, 1200)
  assert.equal(payload.contextRemainingTokens, 398800)
  assert.equal(payload.remainingTokens, 398800)
  assert.equal(payload.rollingTotalTokens, 3300)
  assert.equal(payload.round, 2)
})

test('buildChatUsagePayload omits reasoningTokens when zero and clamps invalid values safely', () => {
  const payload = buildChatUsagePayload({
    usage: { inputTokens: '20', outputTokens: '10', reasoningTokens: 0, totalTokens: 0 },
    modelContext: { limitTokens: '128000', source: 'estimated' },
    promptOccupancyEstimateTokens: 'not-a-number',
    rollingUsage: { totalTokens: -50 },
    round: 0,
  })

  assert.deepEqual(payload.usage, {
    inputTokens: 20,
    outputTokens: 10,
    totalTokens: 30,
  })
  assert.equal(payload.contextOccupancyTokens, 0)
  assert.equal(payload.contextRemainingTokens, 128000)
  assert.equal(payload.rollingTotalTokens, 0)
  assert.equal(payload.round, 1)
  assert.equal(payload.limitProvenance, 'estimated')
  assert.equal(payload.limitPrecision, 'estimated')
  assert.equal('reasoningTokens' in payload.usage, false)
})

test('buildChatUsagePayload supports explicit account-thread estimate metadata when provider usage is unavailable', () => {
  const payload = buildChatUsagePayload({
    threadId: 'thread_account_1',
    turnId: 'turn_account_1',
    usage: {},
    modelContext: { limitTokens: 400000, source: 'verified_fallback' },
    promptOccupancyEstimateTokens: 12345,
    rollingUsage: { totalTokens: 0 },
    sourceOverride: 'account_thread_local_estimate',
    limitProvenanceOverride: 'account_thread_local_estimate',
    limitPrecisionOverride: 'estimated',
    occupancySourceOverride: 'thread_local_estimate',
    providerUsageAvailable: false,
    authMethod: 'account',
    transportMode: 'codex_app_server_chatgpt',
  })

  assert.equal(payload.source, 'account_thread_local_estimate')
  assert.equal(payload.limitProvenance, 'account_thread_local_estimate')
  assert.equal(payload.limitPrecision, 'estimated')
  assert.equal(payload.occupancySource, 'thread_local_estimate')
  assert.equal(payload.contextOccupancyTokens, 12345)
  assert.equal(payload.contextRemainingTokens, 387655)
  assert.equal(payload.providerUsageAvailable, false)
  assert.equal(payload.authMethod, 'account')
  assert.equal(payload.transportMode, 'codex_app_server_chatgpt')
  assert.equal(payload.usagePlane, 'thread_context')
  assert.deepEqual(payload.usage, {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  })
})

test('buildChatUsagePayload uses normalized OpenAI account thread occupancy and keeps cumulative totals out of the ring', () => {
  const payload = buildChatUsagePayload({
    threadId: 'thread_account_old_payload',
    turnId: 'turn_account_old_payload',
    providerId: 'openai',
    usage: {
      inputTokens: 2048,
      outputTokens: 256,
      totalTokens: 2304,
    },
    providerResponseMeta: {
      authMethod: 'account',
      inputLimitTokens: 8192,
      threadOccupancyTokens: 2304,
      remainingContextTokens: 5888,
      threadCumulativeTotalTokens: 5120,
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
  assert.equal(payload.contextOccupancyTokens, 2304)
  assert.equal(payload.contextRemainingTokens, 5888)
  assert.equal(payload.remainingTokens, 5888)
  assert.equal(payload.occupancySource, 'provider_thread_context')
  assert.equal(payload.occupancyConfidence, 'provider_verified')
  assert.equal(payload.occupancyMethod, 'provider_remaining_tokens')
  assert.equal(payload.providerOccupancyTokens, 2304)
  assert.equal(payload.providerUsageSemantics, 'openai_account_provider_context')
})

test('buildChatUsagePayload keeps normalized OpenAI account occupancy separate from cumulative totals across compacted windows', () => {
  const payload = buildChatUsagePayload({
    threadId: 'thread_account_compacted_window',
    turnId: 'turn_account_compacted_window',
    providerId: 'openai',
    usage: {
      inputTokens: 23147,
      outputTokens: 539,
      totalTokens: 23686,
    },
    providerResponseMeta: {
      authMethod: 'account',
      inputLimitTokens: 258400,
      threadOccupancyTokens: 23686,
      remainingContextTokens: 234714,
      threadCumulativeTotalTokens: 686322,
      providerUsageSemantics: 'openai_account_provider_context',
    },
    modelContext: {
      limitTokens: 258400,
      source: 'registry',
      provenance: 'registry',
      precision: 'estimated',
    },
    promptOccupancyEstimateTokens: 5704,
    promptOccupancyEstimateConfidence: 'calibrated_estimate',
    promptOccupancyEstimateMethod: 'transformed_history_plus_tool_schema',
    authMethod: 'account',
  })

  assert.equal(payload.modelLimit, 258400)
  assert.equal(payload.contextOccupancyTokens, 23686)
  assert.equal(payload.contextRemainingTokens, 234714)
  assert.equal(payload.occupancySource, 'provider_thread_context')
  assert.equal(payload.occupancyConfidence, 'provider_verified')
  assert.equal(payload.providerOccupancyTokens, 23686)
})

test('buildChatUsagePayload prefers mapped provider occupancy over estimates and keeps rolling spend separate', () => {
  const payload = buildChatUsagePayload({
    threadId: 'thread_provider_1',
    turnId: 'turn_provider_1',
    providerId: 'openai',
    usage: getProviderUsageFixture('openai')?.expected,
    modelContext: { limitTokens: 400000, source: 'provider', provenance: 'provider' },
    promptOccupancyEstimateTokens: 1200,
    rollingUsage: { inputTokens: 1000, outputTokens: 2000, reasoningTokens: 300, totalTokens: 3300 },
    round: 2,
  })

  assert.equal(payload.providerInputTokens, 120)
  assert.equal(payload.providerInputNoCacheTokens, 80)
  assert.equal(payload.providerCachedReadTokens, 40)
  assert.equal(payload.providerBilledInputTokens, 120)
  assert.equal(payload.providerOccupancyTokens, 150)
  assert.equal(payload.estimatedOccupancyTokens, 1200)
  assert.equal(payload.effectiveOccupancyTokens, 150)
  assert.equal(payload.contextOccupancyTokens, 150)
  assert.equal(payload.contextRemainingTokens, 399850)
  assert.equal(payload.rollingTotalTokens, 3300)
  assert.equal(payload.occupancySource, 'provider_last_request')
  assert.equal(payload.occupancyConfidence, 'provider_verified')
})

test('buildChatUsagePayload keeps Anthropic billed totals separate from mapped occupancy', () => {
  const payload = buildChatUsagePayload({
    threadId: 'thread_anthropic_1',
    turnId: 'turn_anthropic_1',
    providerId: 'anthropic',
    usage: getProviderUsageFixture('anthropic')?.expected,
    modelContext: { limitTokens: 400000, source: 'provider', provenance: 'provider' },
    promptOccupancyEstimateTokens: 15000,
    rollingUsage: { totalTokens: 2190 },
    round: 1,
  })

  assert.equal(payload.providerInputTokens, 1050)
  assert.equal(payload.providerOutputTokens, 110)
  assert.equal(payload.providerTotalTokens, 1160)
  assert.equal(payload.providerBilledInputTokens, 2050)
  assert.equal(payload.providerBilledTotalTokens, 2190)
  assert.equal(payload.providerOccupancyTokens, 1160)
  assert.equal(payload.effectiveOccupancyTokens, 1160)
  assert.equal(payload.contextOccupancyTokens, 1160)
  assert.equal(payload.rollingTotalTokens, 2190)
  assert.equal(payload.occupancySource, 'provider_last_request')
  assert.equal(payload.occupancyConfidence, 'provider_mapped')
})

test('buildChatUsagePayload clamps measured context occupancy to the model window', () => {
  const payload = buildChatUsagePayload({
    threadId: 'thread_over_window_1',
    turnId: 'turn_over_window_1',
    providerId: 'openai',
    usage: {
      inputTokens: 7000,
      outputTokens: 2500,
      totalTokens: 9500,
    },
    modelContext: {
      limitTokens: 8192,
      source: 'provider',
      provenance: 'provider',
    },
    promptOccupancyEstimateTokens: 1000,
  })

  assert.equal(payload.providerOccupancyTokens, 9500)
  assert.equal(payload.effectiveOccupancyTokens, 9500)
  assert.equal(payload.contextOccupancyTokens, 8192)
  assert.equal(payload.contextRemainingTokens, 0)
})
