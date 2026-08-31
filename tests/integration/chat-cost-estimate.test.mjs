import test from 'node:test'
import assert from 'node:assert/strict'
import {
  estimateSingleTurnCost,
  resolveEffectiveTokenPricing,
} from '../../src/main/chat/chat-cost-estimator.mjs'

test('estimateSingleTurnCost returns pricing-backed USD estimate for curated models', () => {
  const estimate = estimateSingleTurnCost({
    providerId: 'openai',
    model: 'gpt-5.4',
    mode: 'execute',
    history: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Refactor src/main/ipc-handlers/chat.mjs into modules.' },
    ],
    modelContext: {
      limitTokens: 400000,
      maxOutputTokens: 128000,
    },
  })

  assert.equal(estimate.providerId, 'openai')
  assert.equal(estimate.model, 'gpt-5.4')
  assert.ok(estimate.estimatedInputTokens > 0)
  assert.ok(estimate.estimatedOutputTokens > 0)
  assert.ok(estimate.estimatedTotalTokens >= estimate.estimatedInputTokens)
  assert.equal(estimate.usdAvailable, true)
  assert.ok(Number(estimate.estimatedUsd) > 0)
  assert.equal(estimate.estimateConfidence, 'token_plus_pricing')
  assert.equal(estimate.pricingWarning, '')
})

test('estimateSingleTurnCost falls back to token-only estimate for unknown model pricing', () => {
  const estimate = estimateSingleTurnCost({
    providerId: 'openai',
    model: 'custom-dev-model',
    mode: 'plan',
    history: [{ role: 'user', content: 'Generate a plan only.' }],
    modelContext: {
      limitTokens: 64000,
      maxOutputTokens: null,
    },
  })

  assert.ok(estimate.estimatedTotalTokens > 0)
  assert.equal(estimate.usdAvailable, false)
  assert.equal(estimate.estimatedUsd, null)
  assert.equal(estimate.estimateConfidence, 'token_only')
})

test('estimateSingleTurnCost marks Perplexity pricing as partial request-fee estimate', () => {
  const estimate = estimateSingleTurnCost({
    providerId: 'perplexity',
    model: 'sonar-pro',
    mode: 'execute',
    history: [{ role: 'user', content: 'Summarize latest AI policy changes.' }],
    modelContext: {
      limitTokens: 200000,
      maxOutputTokens: 8000,
    },
  })

  assert.equal(estimate.usdAvailable, true)
  assert.ok(Number(estimate.estimatedUsd) > 0)
  assert.equal(estimate.estimateConfidence, 'partial_request_fee')
  assert.match(String(estimate.pricingWarning), /request-fee/i)
})

test('resolveEffectiveTokenPricing picks the matching prompt-size pricing tier', () => {
  const pricing = resolveEffectiveTokenPricing({
    inputUsdPer1M: 2,
    outputUsdPer1M: 12,
    cacheReadUsdPer1M: 0.2,
    tiers: [
      {
        id: 'context_over_200k',
        minPromptTokens: 200001,
        inputUsdPer1M: 4,
        outputUsdPer1M: 18,
        cacheReadUsdPer1M: 0.4,
      },
    ],
  }, 250000)

  assert.equal(pricing.appliedTierId, 'context_over_200k')
  assert.equal(pricing.inputUsdPer1M, 4)
  assert.equal(pricing.outputUsdPer1M, 18)
  assert.equal(pricing.cacheReadUsdPer1M, 0.4)
})
