import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { resolveToolReliabilityProfile } from '../../src/main/chat/tool-reliability-profile.mjs'

test('reliability profile marks Codex-local surfaces as high-confidence agentic runtimes', () => {
  const profile = resolveToolReliabilityProfile({
    providerId: 'openai',
    modelId: 'gpt-5.3-codex',
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.3-codex'),
    toolSurfaceKind: 'openai_codex_local',
  })

  assert.equal(profile.profileId, 'codex_local_agentic')
  assert.equal(profile.reliabilityTier, 'high')
  assert.equal(profile.patchExposure, 'normal')
})

test('reliability profile marks hosted OpenAI surfaces as patch-capable curated runtimes', () => {
  const profile = resolveToolReliabilityProfile({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
    toolSurfaceKind: 'openai_hosted',
  })

  assert.equal(profile.profileId, 'openai_hosted_general')
  assert.equal(profile.patchExposure, 'normal')
  assert.equal(profile.shellExposure, 'provider_hosted')
})

test('reliability profile marks provider-owned runtimes as constrained', () => {
  const profile = resolveToolReliabilityProfile({
    providerId: 'perplexity',
    modelId: 'sonar-pro',
    adapterProfile: resolveProviderModelAdapter('perplexity', 'sonar-pro'),
    toolSurfaceKind: 'perplexity_search',
  })

  assert.equal(profile.profileId, 'provider_owned_runtime')
  assert.equal(profile.reliabilityTier, 'constrained')
  assert.equal(profile.patchExposure, 'restricted')
  assert.equal(profile.shellExposure, 'not_available')
})

test('reliability profile keeps non-Codex ADDOM-native surfaces on safer write paths', () => {
  const curated = resolveToolReliabilityProfile({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    adapterProfile: resolveProviderModelAdapter('anthropic', 'claude-sonnet-4-6'),
    toolSurfaceKind: 'addom_native',
  })
  const generic = resolveToolReliabilityProfile({
    providerId: 'openai',
    modelId: 'custom-openai-model',
    adapterProfile: resolveProviderModelAdapter('openai', 'custom-openai-model'),
    toolSurfaceKind: 'addom_native',
  })

  assert.equal(curated.patchExposure, 'restricted')
  assert.equal(generic.patchExposure, 'restricted')
})
