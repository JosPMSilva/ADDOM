import test from 'node:test'
import assert from 'node:assert/strict'

import { mapProviderContextUsage } from '../../src/main/chat/context-usage-provider-mapping.mjs'
import { getProviderUsageFixture } from '../fixtures/provider-usage-fixtures.mjs'

test('provider occupancy mapping uses provider-backed semantics for verified and mapped provider buckets', () => {
  const cases = [
    {
      providerId: 'openai',
      usage: getProviderUsageFixture('openai')?.expected,
      expected: {
        providerOccupancyTokens: 150,
        providerInputNoCacheTokens: 80,
        providerCachedReadTokens: 40,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
      },
    },
    {
      providerId: 'gemini',
      usage: getProviderUsageFixture('gemini')?.expected,
      expected: {
        providerOccupancyTokens: 1650,
        providerInputNoCacheTokens: 1000,
        providerCachedReadTokens: 200,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
      },
    },
    {
      providerId: 'grok',
      usage: getProviderUsageFixture('xai')?.expected,
      expected: {
        providerOccupancyTokens: 160,
        providerInputNoCacheTokens: 60,
        providerCachedReadTokens: 40,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_mapped',
      },
    },
    {
      providerId: 'groq',
      usage: getProviderUsageFixture('groq')?.expected,
      expected: {
        providerOccupancyTokens: 110,
        providerInputNoCacheTokens: 78,
        providerCachedReadTokens: 10,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
      },
    },
    {
      providerId: 'mistral',
      usage: getProviderUsageFixture('mistral')?.expected,
      expected: {
        providerOccupancyTokens: 100,
        providerInputNoCacheTokens: 75,
        providerCachedReadTokens: null,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
      },
    },
    {
      providerId: 'perplexity',
      usage: getProviderUsageFixture('perplexity')?.expected,
      expected: {
        providerOccupancyTokens: 79,
        providerInputNoCacheTokens: 55,
        providerCachedReadTokens: null,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
      },
    },
    {
      providerId: 'openrouter',
      usage: getProviderUsageFixture('openaiCompatible')?.expected,
      expected: {
        providerOccupancyTokens: 108,
        providerInputNoCacheTokens: 75,
        providerCachedReadTokens: 15,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_mapped',
      },
    },
    {
      providerId: 'moonshot',
      usage: getProviderUsageFixture('openaiCompatible')?.expected,
      expected: {
        providerOccupancyTokens: 108,
        providerInputNoCacheTokens: 75,
        providerCachedReadTokens: 15,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_mapped',
      },
    },
  ]

  for (const { providerId, usage, expected } of cases) {
    const mapped = mapProviderContextUsage({
      providerId,
      usage,
      promptOccupancyEstimateTokens: 9999,
    })

    assert.equal(mapped.providerOccupancyTokens, expected.providerOccupancyTokens, providerId)
    assert.equal(mapped.providerInputNoCacheTokens, expected.providerInputNoCacheTokens, providerId)
    assert.equal(mapped.providerCachedReadTokens, expected.providerCachedReadTokens, providerId)
    assert.equal(mapped.effectiveOccupancyTokens, expected.providerOccupancyTokens, providerId)
    assert.equal(mapped.occupancySource, expected.occupancySource, providerId)
    assert.equal(mapped.occupancyConfidence, expected.occupancyConfidence, providerId)
    assert.equal(mapped.providerUsageAvailable, true, providerId)
  }
})

test('anthropic occupancy mapping separates current-turn occupancy from billed totals', () => {
  const anthropic = getProviderUsageFixture('anthropic')
  const mapped = mapProviderContextUsage({
    providerId: 'anthropic',
    usage: anthropic?.expected,
    providerResponseMeta: {
      usageSemantics: {
        currentTurnInputMayExcludeCompaction: true,
        billedTotalsDerivedFromIterations: true,
      },
    },
    promptOccupancyEstimateTokens: 9999,
  })

  assert.equal(mapped.providerInputTokens, 1050)
  assert.equal(mapped.providerInputNoCacheTokens, 700)
  assert.equal(mapped.providerCachedReadTokens, 250)
  assert.equal(mapped.providerCachedWriteTokens, 100)
  assert.equal(mapped.providerOutputTokens, 110)
  assert.equal(mapped.providerTotalTokens, 1160)
  assert.equal(mapped.providerOccupancyTokens, 1160)
  assert.equal(mapped.providerBilledInputTokens, 2050)
  assert.equal(mapped.providerBilledTotalTokens, 2190)
  assert.equal(mapped.effectiveOccupancyTokens, 1160)
  assert.equal(mapped.occupancySource, 'provider_last_request')
  assert.equal(mapped.occupancyConfidence, 'provider_mapped')
})

test('estimate-backed compatible providers do not promote provider usage into occupancy', () => {
  const deepseekMapped = mapProviderContextUsage({
    providerId: 'deepseek',
    usage: getProviderUsageFixture('openaiCompatible')?.expected,
    promptOccupancyEstimateTokens: 4321,
  })

  assert.equal(deepseekMapped.providerOccupancyTokens, null)
  assert.equal(deepseekMapped.effectiveOccupancyTokens, 4321)
  assert.equal(deepseekMapped.occupancySource, 'estimated_history')
  assert.equal(deepseekMapped.occupancyConfidence, 'rough_estimate')
  assert.equal(deepseekMapped.providerUsageAvailable, true)
})

test('openai account mapping uses provider-backed thread context when token usage telemetry supplies current occupancy', () => {
  const mapped = mapProviderContextUsage({
    providerId: 'openai',
    usage: getProviderUsageFixture('openai')?.expected,
    authMethod: 'account',
    providerResponseMeta: {
      authMethod: 'account',
      inputLimitTokens: 8192,
      threadOccupancyTokens: 2304,
      providerUsageSemantics: 'openai_account_provider_context',
    },
    promptOccupancyEstimateTokens: 5432,
  })

  assert.equal(mapped.providerOccupancyTokens, 2304)
  assert.equal(mapped.effectiveOccupancyTokens, 2304)
  assert.equal(mapped.occupancySource, 'provider_thread_context')
  assert.equal(mapped.occupancyConfidence, 'provider_verified')
  assert.equal(mapped.providerUsageSemantics, 'openai_account_provider_context')
})

test('openai account mapping does not promote last-request or cumulative totals into context occupancy', () => {
  const mapped = mapProviderContextUsage({
    providerId: 'openai',
    usage: getProviderUsageFixture('openai')?.expected,
    authMethod: 'account',
    providerResponseMeta: {
      authMethod: 'account',
      inputLimitTokens: 8192,
      threadCumulativeTotalTokens: 5120,
      providerUsageSemantics: 'openai_account_provider_context_unavailable',
    },
    promptOccupancyEstimateTokens: 5432,
  })

  assert.equal(mapped.providerOccupancyTokens, null)
  assert.equal(mapped.estimatedOccupancyTokens, 5432)
  assert.equal(mapped.effectiveOccupancyTokens, 5432)
  assert.equal(mapped.occupancySource, 'thread_local_estimate')
  assert.equal(mapped.occupancyConfidence, 'rough_estimate')
  assert.equal(mapped.occupancyMethod, 'history_estimate')
  assert.equal(mapped.providerUsageSemantics, 'openai_account_provider_context_unavailable')
})

test('estimate-backed providers can surface calibrated estimate confidence without inventing provider occupancy', () => {
  const mapped = mapProviderContextUsage({
    providerId: 'deepseek',
    usage: getProviderUsageFixture('openaiCompatible')?.expected,
    promptOccupancyEstimateTokens: 2400,
    promptOccupancyEstimateConfidence: 'calibrated_estimate',
    promptOccupancyEstimateMethod: 'transformed_history_plus_tool_schema',
  })

  assert.equal(mapped.providerOccupancyTokens, null)
  assert.equal(mapped.estimatedOccupancyTokens, 2400)
  assert.equal(mapped.effectiveOccupancyTokens, 2400)
  assert.equal(mapped.occupancySource, 'estimated_history')
  assert.equal(mapped.occupancyConfidence, 'calibrated_estimate')
  assert.equal(mapped.occupancyMethod, 'transformed_history_plus_tool_schema')
})
