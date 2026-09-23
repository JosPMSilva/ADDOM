import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeProviderProcessingMode,
  resolveProviderProcessingMode,
} from '../../src/common/api-clients/provider-processing-mode.mjs'

test('processing mode defaults to standard and rejects unknown values', () => {
  assert.equal(normalizeProviderProcessingMode(), 'standard')
  assert.equal(normalizeProviderProcessingMode('FAST'), 'fast')
  assert.equal(normalizeProviderProcessingMode('turbo'), 'standard')
})

test('OpenAI Fast uses the auth-specific API priority or account fast service tier', () => {
  const supported = resolveProviderProcessingMode({
    providerId: 'openai',
    modelId: 'gpt-5.6-sol',
    authMethod: 'api_key',
    providerConfigured: true,
    requestedMode: 'fast',
  })
  const account = resolveProviderProcessingMode({
    providerId: 'openai',
    modelId: 'gpt-5.6-sol',
    authMethod: 'account',
    providerConfigured: true,
    requestedMode: 'fast',
  })
  const codex = resolveProviderProcessingMode({
    providerId: 'openai',
    modelId: 'gpt-5.3-codex',
    authMethod: 'api_key',
    providerConfigured: true,
    requestedMode: 'fast',
  })

  assert.deepEqual(supported.availableModes, ['standard', 'fast'])
  assert.equal(supported.requestedMode, 'fast')
  assert.deepEqual(supported.request, { serviceTier: 'priority' })
  assert.equal(supported.premiumPricing, true)
  assert.deepEqual(account.availableModes, ['standard', 'fast'])
  assert.equal(account.requestedMode, 'fast')
  assert.deepEqual(account.request, { serviceTier: 'fast' })
  assert.deepEqual(codex.availableModes, ['standard'])
})

test('GPT-6 Fast preserves auth-specific OpenAI service tiers', () => {
  for (const modelId of ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna']) {
    for (const [authMethod, serviceTier] of [['api_key', 'priority'], ['account', 'fast']]) {
      const processing = resolveProviderProcessingMode({
        providerId: 'openai',
        modelId,
        authMethod,
        providerConfigured: true,
        requestedMode: 'fast',
      })

      assert.deepEqual(processing.availableModes, ['standard', 'fast'])
      assert.deepEqual(processing.request, { serviceTier })
      assert.equal(processing.premiumPricing, true)
    }
  }
})

test('Anthropic Fast is available only for qualified Opus API-key requests', () => {
  for (const modelId of ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8']) {
    const processing = resolveProviderProcessingMode({
      providerId: 'anthropic',
      modelId,
      authMethod: 'api_key',
      providerConfigured: true,
      requestedMode: 'fast',
      returnedProviderMode: 'fast',
    })

    assert.deepEqual(processing.availableModes, ['standard', 'fast'])
    assert.deepEqual(processing.request, { speed: 'fast' })
    assert.equal(processing.returnedMode, 'fast')
    assert.equal(processing.effectiveMode, 'fast')
  }

  const fable = resolveProviderProcessingMode({
    providerId: 'anthropic',
    modelId: 'claude-fable-5-1',
    authMethod: 'api_key',
    providerConfigured: true,
    requestedMode: 'fast',
  })
  assert.deepEqual(fable.availableModes, ['standard'])
})

test('Moonshot Fast selects the K2.7 Code HighSpeed route without changing catalog identity', () => {
  const supported = resolveProviderProcessingMode({
    providerId: 'moonshot',
    modelId: 'kimi-k2.7-code',
    authMethod: 'api_key',
    providerConfigured: true,
    requestedMode: 'fast',
  })
  const unrelated = resolveProviderProcessingMode({
    providerId: 'moonshot',
    modelId: 'kimi-k2.6',
    authMethod: 'api_key',
    providerConfigured: true,
    requestedMode: 'fast',
  })
  const kimiK3 = resolveProviderProcessingMode({
    providerId: 'moonshot',
    modelId: 'kimi-k3',
    authMethod: 'api_key',
    providerConfigured: true,
    requestedMode: 'fast',
  })

  assert.equal(supported.modelId, 'kimi-k2.7-code')
  assert.deepEqual(supported.request, { modelId: 'kimi-k2.7-code-highspeed' })
  assert.equal(supported.requestedMode, 'fast')
  assert.deepEqual(unrelated.availableModes, ['standard'])
  assert.equal(unrelated.requestedMode, 'standard')
  assert.equal(kimiK3.modelId, 'kimi-k3')
  assert.deepEqual(kimiK3.availableModes, ['standard'])
  assert.equal(kimiK3.request, null)
})

test('returned provider state takes precedence over the requested processing mode', () => {
  const returnedDefault = resolveProviderProcessingMode({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    authMethod: 'api_key',
    providerConfigured: true,
    requestedMode: 'fast',
    returnedProviderMode: 'default',
  })
  const returnedPriority = resolveProviderProcessingMode({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    authMethod: 'api_key',
    providerConfigured: true,
    requestedMode: 'standard',
    returnedProviderMode: 'priority',
  })

  assert.equal(returnedDefault.returnedMode, 'standard')
  assert.equal(returnedDefault.effectiveMode, 'standard')
  assert.equal(returnedPriority.returnedMode, 'fast')
  assert.equal(returnedPriority.effectiveMode, 'fast')
})
