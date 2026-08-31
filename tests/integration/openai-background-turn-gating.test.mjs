import test from 'node:test'
import assert from 'node:assert/strict'

import { prepareOpenAIBackgroundTurnPayload } from '../../src/main/api-clients/ai-provider-openai-runtime.mjs'

function buildStoreEnabledProviderOptions() {
  return {
    openai: {
      store: true,
    },
  }
}

test('openai background helper does not re-probe capabilities when caller already supplied resolved tool state', async () => {
  let probeCalls = 0
  const payload = await prepareOpenAIBackgroundTurnPayload({
    apiKey: 'sk-test',
    modelId: 'gpt-5.4',
    originalMessages: [{ role: 'user', content: 'hello' }],
    tools: { web_search: { description: 'Search', inputSchema: {} } },
    activeTools: { web_search: { description: 'Search', inputSchema: {} } },
    hasTools: true,
    providerRuntimeSettings: {
      enableBackgroundMode: true,
    },
    providerOptions: buildStoreEnabledProviderOptions(),
    resolveCapabilities: async () => {
      probeCalls += 1
      return { supportsTools: false }
    },
  })

  assert.equal(probeCalls, 0)
  assert.equal(payload.eligible, false)
  assert.equal(payload.reason, 'tools_present')
})

test('openai background helper still probes capabilities for direct callers without resolved tool state', async () => {
  let probeCalls = 0
  const payload = await prepareOpenAIBackgroundTurnPayload({
    apiKey: 'sk-test',
    modelId: 'gpt-5.4',
    originalMessages: [{ role: 'user', content: 'hello' }],
    tools: { web_search: { description: 'Search', inputSchema: {} } },
    providerRuntimeSettings: {
      enableBackgroundMode: true,
    },
    providerOptions: buildStoreEnabledProviderOptions(),
    resolveCapabilities: async () => {
      probeCalls += 1
      return { supportsTools: false }
    },
  })

  assert.equal(probeCalls, 1)
  assert.equal(payload.eligible, true)
  assert.equal(payload.reason, '')
})

test('openai background helper keeps tools active for provider-owned-runtime-only capability results', async () => {
  let probeCalls = 0
  const payload = await prepareOpenAIBackgroundTurnPayload({
    apiKey: 'sk-test',
    modelId: 'gpt-5.4',
    originalMessages: [{ role: 'user', content: 'hello' }],
    tools: { web_search: { description: 'Search', inputSchema: {} } },
    providerRuntimeSettings: {
      enableBackgroundMode: true,
    },
    providerOptions: buildStoreEnabledProviderOptions(),
    resolveCapabilities: async () => {
      probeCalls += 1
      return {
        supportsTools: false,
        toolSupportMode: 'provider_owned_runtime_only',
      }
    },
  })

  assert.equal(probeCalls, 1)
  assert.equal(payload.eligible, false)
  assert.equal(payload.reason, 'tools_present')
})
