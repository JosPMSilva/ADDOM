import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderModelTransform } from '../../src/main/api-clients/provider-model-transform.mjs'
import { resolveProviderPromptBudgetProfile } from '../../src/main/chat/provider-prompt-budget-profile.mjs'

function resolveAnthropicConfig(options = {}) {
  return resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
  }).resolveInvocationConfig(options)
}

test('Anthropic Sonnet gets a finite profile output cap when no explicit max is provided', () => {
  const config = resolveAnthropicConfig()

  assert.equal(config.promptBudgetProfile?.id, 'anthropic_strict')
  assert.equal(config.maxOutputTokens, 16_000)
  assert.equal(config.modelMaxOutputTokens, 128_000)
})

test('Anthropic Sonnet respects explicit lower request and runtime output caps', () => {
  const requestedConfig = resolveAnthropicConfig({
    requestedMaxOutputTokens: 4_096,
  })
  const runtimeConfig = resolveAnthropicConfig({
    runtimeSettings: {
      maxOutputTokens: 8_192,
    },
  })

  assert.equal(requestedConfig.maxOutputTokens, 4_096)
  assert.equal(runtimeConfig.maxOutputTokens, 8_192)
})

test('Anthropic Sonnet clamps explicit high output caps to the catalog max', () => {
  const config = resolveAnthropicConfig({
    requestedMaxOutputTokens: 256_000,
  })

  assert.equal(config.maxOutputTokens, 128_000)
  assert.equal(config.modelMaxOutputTokens, 128_000)
})

test('provider prompt budget profile resolver exposes non-Anthropic profiles without output caps', () => {
  assert.equal(resolveProviderPromptBudgetProfile({ providerId: 'openai' }).id, 'openai_moderate')
  assert.equal(resolveProviderPromptBudgetProfile({ providerId: 'openai' }).defaultMaxOutputTokens, null)
  assert.equal(resolveProviderPromptBudgetProfile({ providerId: 'ollama' }).id, 'local')
  assert.equal(resolveProviderPromptBudgetProfile({ providerId: 'openrouter' }).id, 'generic_remote')
})
