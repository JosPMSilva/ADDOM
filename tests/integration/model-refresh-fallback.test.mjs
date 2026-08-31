import test from 'node:test'
import assert from 'node:assert/strict'
import {
  __resetDynamicModelCache,
  __testApplyDynamicRemoteModels,
} from '../../src/main/api-clients/ai-provider.mjs'

function baseEntry() {
  return {
    id: 'gemini',
    noKeyRequired: false,
    defaultModel: 'gemini-static',
    models: [
      { id: 'gemini-static', label: 'Gemini Static', group: 'Gemini' },
    ],
    modelSource: 'static',
    modelsFetchedAt: null,
  }
}

test('dynamic model discovery enriches provider models', async () => {
  __resetDynamicModelCache()
  const entry = baseEntry()

  await __testApplyDynamicRemoteModels(entry, {
    apiKey: 'sk-test-1',
    forceRefresh: true,
    fetcher: async () => ([
      { id: 'gemini-live', label: 'Gemini Live', group: 'Gemini' },
    ]),
  })

  assert.equal(entry.modelSource, 'dynamic')
  assert.ok(Number.isFinite(entry.modelsFetchedAt))
  assert.ok(entry.models.some((m) => m.id === 'gemini-live'))
  assert.ok(entry.models.some((m) => m.id === 'gemini-static'))
})

test('dynamic fetch failure keeps static fallback models', async () => {
  __resetDynamicModelCache()
  const entry = baseEntry()

  await __testApplyDynamicRemoteModels(entry, {
    apiKey: 'sk-test-2',
    forceRefresh: true,
    fetcher: async () => { throw new Error('network down') },
  })

  assert.equal(entry.modelSource, 'static')
  assert.equal(entry.modelsFetchedAt, null)
  assert.deepEqual(
    entry.models.map((m) => m.id),
    ['gemini-static'],
  )
})

test('OpenAI model discovery qualifies only curated models visible to the configured key', async () => {
  __resetDynamicModelCache()
  const entry = {
    id: 'openai',
    models: [
      { id: 'gpt-5.4', label: 'GPT-5.4', group: 'GPT-5', contextWindowTokens: 400_000 },
      { id: 'gpt-5.5', label: 'GPT-5.5', group: 'GPT-5' },
    ],
  }

  await __testApplyDynamicRemoteModels(entry, {
    apiKey: 'sk-test',
    fetcher: async () => [
      { id: 'gpt-5.4', label: 'gpt-5.4' },
      { id: 'text-embedding-4-large', label: 'text-embedding-4-large' },
    ],
  })

  assert.deepEqual(entry.models.map((model) => model.id), ['gpt-5.4', 'gpt-5.5'])
  assert.equal(entry.models[0].contextWindowTokens, 400_000)
  assert.equal(entry.models[0].selectable, true)
  assert.equal(entry.models[0].modelEligibility.status, 'provider_listed')
  assert.equal(entry.models[0].modelEligibility.eligible, true)
  assert.equal(entry.models[1].selectable, false)
  assert.equal(entry.models[1].modelEligibility.status, 'not_listed')
  assert.match(entry.models[1].unavailableReason, /not listed.*configured OpenAI key/i)
})
