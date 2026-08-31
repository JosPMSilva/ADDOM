import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __resetOpenAICompactionClientFactoryForTests,
  __setOpenAICompactionClientFactoryForTests,
} from '../../src/main/chat/continuity/provider-native/openai-compaction-adapter.mjs'
import {
  resolveOpenAIProviderNativeCompactionEligibility,
  tryOpenAIProviderNativeCompaction,
} from '../../src/main/chat/continuity/provider-native/openai-provider-native-compaction.mjs'

test.beforeEach(() => {
  __resetOpenAICompactionClientFactoryForTests()
})

test.after(() => {
  __resetOpenAICompactionClientFactoryForTests()
})

test('openai provider-native compaction rejects chains without previous_response_id before calling the adapter', async () => {
  let called = false
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        called = true
        throw new Error('should not be called')
      },
    },
  }))

  const result = await tryOpenAIProviderNativeCompaction({
    providerId: 'openai',
    policy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    history: [
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
    ],
    model: 'gpt-5.2',
    previousResponseId: '',
    historyTokenEstimate: 9000,
  })

  assert.equal(called, false)
  assert.equal(result.used, false)
  assert.equal(result.reason, 'missing_previous_response_id')
})

test('openai provider-native compaction stays inert below the configured threshold', async () => {
  let called = false
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        called = true
        throw new Error('should not be called')
      },
    },
  }))

  const result = await tryOpenAIProviderNativeCompaction({
    providerId: 'openai',
    policy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
      maxContinuityPacketTokens: 7000,
    },
    history: [
      { role: 'user', content: 'Short turn' },
      { role: 'assistant', content: 'Short reply' },
    ],
    model: 'gpt-5.2',
    previousResponseId: 'resp_prev_2',
    historyTokenEstimate: 800,
    packetTokens: 120,
  })

  assert.equal(called, false)
  assert.equal(result.used, false)
  assert.equal(result.reason, 'below_threshold')
  assert.equal(result.reference?.stage, 'candidate')
  assert.equal(result.reference?.threshold, 7000)
})

test('openai provider-native compaction keeps policy-disabled decisions above the adapter', () => {
  const result = resolveOpenAIProviderNativeCompactionEligibility({
    providerId: 'openai',
    policy: {
      providerChainCompactionEnabled: false,
      providerTruncationEnabled: true,
      providerCompactionAllowlist: ['openai'],
    },
    history: [
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
    ],
    model: 'gpt-5.2',
    previousResponseId: 'resp_prev_policy_disabled',
    historyTokenEstimate: 9000,
  })

  assert.equal(result.eligible, false)
  assert.equal(result.reason, 'policy_disabled')
})
