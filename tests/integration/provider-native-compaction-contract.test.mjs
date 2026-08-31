import test from 'node:test'
import assert from 'node:assert/strict'

import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import {
  createProviderNativeCompactionEligibility,
  createProviderNativeCompactionReference,
  createProviderNativeCompactionResult,
  listProviderNativeCompactionModes,
  normalizeProviderNativeCompactionFailureReason,
  resolveProviderNativeCompactionAdapter,
} from '../../src/main/chat/continuity/provider-native/provider-native-compaction-contract.mjs'

test('provider-native compaction contract normalizes eligibility, references, and results without continuity concerns', () => {
  const eligibility = createProviderNativeCompactionEligibility({
    providerId: 'openai',
    compactionMode: 'unexpected_mode',
    reason: 'below_threshold',
    reference: createProviderNativeCompactionReference({
      providerId: 'openai',
      stage: 'candidate',
      at: 123,
      threshold: 7000,
    }),
  })
  const result = createProviderNativeCompactionResult({
    used: true,
    providerId: 'openai',
    reason: 'unexpected_success_reason',
    compactionIds: ['cmp_1', 'cmp_1', 'cmp_2'],
    compactedWindow: [
      { type: 'message', id: 'msg_1' },
      null,
      { type: 'compaction', id: 'cmp_1' },
    ],
    responseId: 'resp_cmp_1',
    reference: createProviderNativeCompactionReference({
      providerId: 'openai',
      stage: 'applied',
      at: 456,
      usage: { totalTokens: 10 },
    }),
  })

  assert.equal(eligibility.eligible, false)
  assert.equal(eligibility.reason, 'below_threshold')
  assert.equal(eligibility.compactionMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(eligibility.reference?.provider, 'openai')
  assert.equal(eligibility.reference?.stage, 'candidate')
  assert.equal(eligibility.reference?.threshold, 7000)

  assert.equal(result.used, true)
  assert.equal(result.reason, 'compacted')
  assert.equal(result.compactionMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(result.compactionId, 'cmp_1')
  assert.deepEqual(result.compactionIds, ['cmp_1', 'cmp_2'])
  assert.deepEqual(result.compactedWindow, [
    { type: 'message', id: 'msg_1' },
    { type: 'compaction', id: 'cmp_1' },
  ])
  assert.equal(result.responseId, 'resp_cmp_1')
  assert.equal(result.reference?.provider, 'openai')
  assert.equal(result.reference?.stage, 'applied')
})

test('provider-native compaction contract keeps non-openai providers on explicit local-summary-only defaults until an adapter exists', () => {
  const openai = resolveProviderNativeCompactionAdapter('openai')
  const curatedNonOpenAIProviders = [
    'anthropic',
    'gemini',
    'grok',
    'groq',
    'mistral',
    'deepseek',
    'moonshot',
    'openrouter',
    'perplexity',
    'ollama',
    'lmstudio',
  ]

  assert.equal(openai.supported, true)
  assert.equal(openai.providerId, 'openai')
  assert.equal(openai.preferredMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.deepEqual(listProviderNativeCompactionModes('openai'), [
    COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
  ])
  assert.equal(openai.requiresPreviousResponseId, true)

  for (const providerId of curatedNonOpenAIProviders) {
    const adapter = resolveProviderNativeCompactionAdapter(providerId)
    assert.equal(adapter.providerId, providerId)
    assert.equal(adapter.supported, false)
    assert.deepEqual(adapter.supportedModes, [])
    assert.equal(adapter.preferredMode, COMPACTION_MODES.NONE)
    assert.equal(adapter.requiresPreviousResponseId, false)
    assert.equal(adapter.evidenceStatus, 'not_implemented')
  }
})

test('provider-native compaction contract normalizes failure reasons to the shared vocabulary', () => {
  assert.equal(
    normalizeProviderNativeCompactionFailureReason('provider_error'),
    'provider_error',
  )
  assert.equal(
    normalizeProviderNativeCompactionFailureReason('not_a_known_reason'),
    'unknown_reason',
  )
})
