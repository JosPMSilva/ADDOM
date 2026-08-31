import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CONTINUITY_POLICY,
  normalizeContinuityPolicy,
  resolveContinuityProfile,
  isProviderChainCompactionAllowed,
  isProviderTruncationAllowed,
} from '../../src/main/chat/continuity/continuity-policy.mjs'

test('normalizeContinuityPolicy clamps and defaults invalid fields', () => {
  const normalized = normalizeContinuityPolicy({
    enabled: true,
    architecture: 'invalid_arch',
    defaultScope: 'bad_scope',
    latencyP95TargetMs: -10,
    activeProfile: 'unknown',
    maxContinuityPacketTokens: 999_999_999,
    maxInjectedFacts: 0,
    providerChainCompactionEnabled: true,
    providerTruncationEnabled: true,
    providerCompactionAllowlist: ['OpenAI', '', 'openai', 'anthropic'],
    profiles: {
      balanced: {
        packetTokensRatio: 99,
        outputReserveRatio: 0,
        toolReserveRatio: -1,
        maxInjectedFacts: 999,
        maxSourceRefs: 0,
        injectEveryRound: true,
      },
    },
  })

  assert.equal(normalized.architecture, DEFAULT_CONTINUITY_POLICY.architecture)
  assert.equal(normalized.defaultScope, DEFAULT_CONTINUITY_POLICY.defaultScope)
  assert.equal(normalized.latencyP95TargetMs, 50)
  assert.equal(normalized.activeProfile, DEFAULT_CONTINUITY_POLICY.activeProfile)
  assert.equal(normalized.maxContinuityPacketTokens, 64_000)
  assert.equal(normalized.maxInjectedFacts, 2)
  assert.equal(normalized.providerChainCompactionEnabled, true)
  assert.equal(normalized.providerTruncationEnabled, true)
  assert.deepEqual(normalized.providerCompactionAllowlist, ['openai', 'anthropic'])
  assert.equal(normalized.profiles.balanced.packetTokensRatio, 0.8)
  assert.equal(normalized.profiles.balanced.outputReserveRatio, 0.01)
  assert.equal(normalized.profiles.balanced.toolReserveRatio, 0.01)
  assert.equal(normalized.profiles.balanced.maxInjectedFacts, 80)
  assert.equal(normalized.profiles.balanced.maxSourceRefs, 2)
  assert.equal(normalized.profiles.balanced.injectEveryRound, true)
})

test('resolveContinuityProfile returns active profile and provider-native checks obey allowlist', () => {
  const policy = normalizeContinuityPolicy({
    activeProfile: 'deep',
    providerChainCompactionEnabled: true,
    providerTruncationEnabled: false,
    providerCompactionAllowlist: ['openai', 'azure-openai'],
  })
  const resolved = resolveContinuityProfile(policy)
  assert.equal(resolved.key, 'deep')
  assert.equal(resolved.profile.injectEveryRound, true)

  assert.equal(isProviderChainCompactionAllowed('openai', policy), true)
  assert.equal(isProviderChainCompactionAllowed('azure-openai', policy), true)
  assert.equal(isProviderChainCompactionAllowed('anthropic', policy), false)
  assert.equal(isProviderTruncationAllowed('openai', policy), false)
})

test('normalizeContinuityPolicy migrates legacy provider-native compaction fields', () => {
  const normalized = normalizeContinuityPolicy({
    providerNativeCompactionEnabled: true,
    providerNativeAllowlist: ['OpenAI', 'azure-openai'],
  })

  assert.equal(normalized.providerChainCompactionEnabled, true)
  assert.equal(normalized.providerTruncationEnabled, false)
  assert.deepEqual(normalized.providerCompactionAllowlist, ['openai', 'azure-openai'])
})

test('default continuity policy is thread-local by default', () => {
  assert.equal(DEFAULT_CONTINUITY_POLICY.defaultScope, 'thread_only')
  assert.equal(normalizeContinuityPolicy({}).defaultScope, 'thread_only')
})
