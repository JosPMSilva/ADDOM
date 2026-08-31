import test from 'node:test'
import assert from 'node:assert/strict'

import { runProviderNativeCompactionForPacket } from '../../src/main/chat/continuity/continuity-runtime.mjs'
import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'

test('continuity runtime forwards normalized provider-native compaction inputs through the injected hook', async () => {
  let capturedPayload = null
  const result = await runProviderNativeCompactionForPacket({
    providerId: 'openai',
    policy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    history: [
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Turn 2' },
    ],
    historyTokenEstimate: 12_000,
    packetTokens: 2_500,
    providerNativeContext: {
      compactionStrategy: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      runProviderNativeCompaction: async (payload = {}) => {
        capturedPayload = payload
        return {
          used: true,
          compactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
          compactionId: 'cmp_runtime_1',
          compactionIds: ['cmp_runtime_1'],
        }
      },
    },
  })

  assert.equal(Array.isArray(capturedPayload?.history), true)
  assert.equal(capturedPayload?.providerId, 'openai')
  assert.equal(capturedPayload?.policy?.providerChainCompactionEnabled, true)
  assert.equal(capturedPayload?.historyTokenEstimate, 12_000)
  assert.equal(capturedPayload?.packetTokens, 2_500)
  assert.equal(result.used, true)
  assert.equal(result.compactionId, 'cmp_runtime_1')
})

test('continuity runtime stays inert when no provider-native compaction hook is supplied', async () => {
  const result = await runProviderNativeCompactionForPacket({
    providerId: 'openai',
    policy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    history: [
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Turn 2' },
    ],
    historyTokenEstimate: 12_000,
    packetTokens: 2_500,
    providerNativeContext: {
      compactionStrategy: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    },
  })

  assert.deepEqual(result, {})
})
