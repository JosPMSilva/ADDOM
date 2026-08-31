import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __resetDynamicModelCache,
  __testApplyDynamicRemoteModels,
} from '../../src/main/api-clients/ai-provider-capability-probes.mjs'
import { normalizeOpenRouterLiveModelRow } from '../../src/common/api-clients/openrouter-live-models.mjs'

test.beforeEach(() => {
  __resetDynamicModelCache()
})

test('applyDynamicRemoteModels deep-merges openrouter live rows instead of letting degraded rows win', async () => {
  const entry = {
    id: 'openrouter',
    models: [
      {
        id: 'openai/gpt-5.4',
        label: 'openai/gpt-5.4',
        group: 'OpenAI',
        supportsTools: false,
        reasoning: true,
        contextWindowTokens: 922000,
      },
    ],
  }

  await __testApplyDynamicRemoteModels(entry, {
    fetcher: async () => [
      normalizeOpenRouterLiveModelRow({
        id: 'openai/gpt-5.4',
        context_length: 200000,
        supported_parameters: ['tools', 'tool_choice', 'reasoning'],
        architecture: {
          input_modalities: ['text', 'image'],
        },
      }),
      normalizeOpenRouterLiveModelRow({
        id: 'vendor/new-dynamic-route',
        supported_parameters: ['tools', 'tool_choice'],
      }),
    ],
  })

  const reviewed = entry.models.find((model) => model.id === 'openai/gpt-5.4')
  const dynamicOnly = entry.models.find((model) => model.id === 'vendor/new-dynamic-route')

  assert.ok(reviewed)
  assert.equal(reviewed.supportsTools, false)
  assert.equal(reviewed.reasoning, true)
  assert.equal(reviewed.contextWindowTokens, 922000)
  assert.equal(reviewed.openrouterInferredCapabilities?.supportsTools, true)
  assert.equal(reviewed.openrouterInferredCapabilities?.supportsReasoning, true)
  assert.equal(reviewed.openrouterInferredCapabilities?.supportsVision, true)

  assert.ok(dynamicOnly)
  assert.equal(dynamicOnly.label, 'vendor/new-dynamic-route')
  assert.equal(dynamicOnly.openrouterInferredCapabilities?.supportsTools, true)
  assert.equal(dynamicOnly.openrouterInferredCapabilities?.supportsReasoning, null)
  assert.equal(entry.modelSource, 'dynamic')
  assert.equal(Number.isFinite(Number(entry.modelsFetchedAt || 0)), true)
})
