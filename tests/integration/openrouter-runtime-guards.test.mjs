import test from 'node:test'
import assert from 'node:assert/strict'

import { prepareOpenAIBackgroundTurn } from '../../src/main/api-clients/ai-provider.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'

function buildTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

test('openrouter background preparation stays explicitly ineligible', async () => {
  const payload = await prepareOpenAIBackgroundTurn(
    'openrouter',
    'sk-or-v1-test',
    [{ role: 'user', content: 'hello' }],
    { model: 'openai/gpt-5.4' },
  )

  assert.equal(payload.eligible, false)
  assert.equal(payload.reason, 'not_openai')
  assert.equal(payload.modelId, 'openai/gpt-5.4')
})

test('openrouter runtime surface does not build provider-native tool bundles for routed source families', async () => {
  const moonshot = await resolveRuntimeToolSurface({
    providerId: 'openrouter',
    modelId: 'moonshotai/kimi-k2.5',
    apiKey: 'sk-or-v1-test',
    addomTools: buildTools(['read_file']),
    providerRuntimeSettings: {
      moonshot: {
        enabledFormulaUris: ['moonshot/web-search:latest'],
      },
    },
    adapterProfile: resolveProviderModelAdapter('openrouter', 'moonshotai/kimi-k2.5'),
  })
  const perplexity = await resolveRuntimeToolSurface({
    providerId: 'openrouter',
    modelId: 'perplexity/sonar-pro',
    apiKey: 'sk-or-v1-test',
    addomTools: buildTools(['read_file']),
    providerRuntimeSettings: {
      perplexity: {
        searchMode: 'web',
      },
    },
    adapterProfile: resolveProviderModelAdapter('openrouter', 'perplexity/sonar-pro'),
  })

  assert.deepEqual(Object.keys(moonshot.providerSurfaceTools), [])
  assert.equal(moonshot.providerToolExecutionContext, null)
  assert.equal(moonshot.resolvedToolSurface.toolSurfaceKind, 'addom_native')

  assert.deepEqual(Object.keys(perplexity.providerSurfaceTools), [])
  assert.equal(perplexity.providerToolExecutionContext, null)
  assert.equal(perplexity.resolvedToolSurface.toolSurfaceKind, 'addom_native')
})
