import test from 'node:test'
import assert from 'node:assert/strict'

import { getModelCatalogProvider } from '../../src/common/api-clients/model-catalog.mjs'
import { resolveProviderModelTransform } from '../../src/main/api-clients/provider-model-transform.mjs'

function getCatalogModel(provider, modelId) {
  return (provider?.models || []).find((model) => model.id === modelId) || null
}

test('mistral family catalog resolution keeps the approved models and generated provenance', () => {
  const provider = getModelCatalogProvider('mistral')
  const medium = getCatalogModel(provider, 'mistral-medium-2604')

  assert.ok(provider)
  assert.equal(provider.defaultModel, 'mistral-medium-2604')
  assert.ok(medium)
  assert.equal(medium.provenance.source, 'models.dev')
  assert.equal(medium.provenance.trustLevel, 'estimated')
  assert.ok(String(medium.provenance.verifiedAt || '').trim())
  assert.equal(getCatalogModel(provider, 'codestral-2508'), null)
  assert.equal(getCatalogModel(provider, 'magistral-medium-2509'), null)
})

test('mistral family transform stays generic for provider options while preserving attachment truth', () => {
  const medium = resolveProviderModelTransform({
    providerId: 'mistral',
    modelId: 'mistral-medium-2604',
  })
  const small = resolveProviderModelTransform({
    providerId: 'mistral',
    modelId: 'mistral-small-2603',
  })

  assert.equal(medium.buildProviderOptions(), undefined)
  assert.equal(small.buildProviderOptions(), undefined)
  assert.equal(medium.adapterProfile.optionFamily, 'none')
  assert.equal(small.registryModel?.capabilities?.reasoning?.supported, true)
  assert.equal(medium.attachment.supportsVision, true)
  assert.equal(medium.attachment.supportsPdf, false)
  assert.deepEqual(medium.attachment.inputModalities, ['text', 'image'])
  assert.equal(small.attachment.supportsVision, true)
})

test('mistral family transform repairs tool-call ids, sequence ordering, and keeps assistant phase out', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'mistral',
    modelId: 'mistral-medium-2604',
  })
  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'tool_call', call_id: 'call:1/with spaces', name: 'search_code', args: { query: 'provider transform' } },
        ],
        phase: 'commentary',
      },
      {
        role: 'tool',
        content: [
          { type: 'tool_result', call_id: 'call:1/with spaces', name: 'search_code', result: { ok: true } },
        ],
      },
      { role: 'user', content: 'continue' },
    ],
  })

  assert.equal(Object.prototype.hasOwnProperty.call(normalized[0], 'phase'), false)
  assert.equal(normalized[0].content[0].toolCallId.length, 9)
  assert.match(normalized[0].content[0].toolCallId, /^[a-z0-9]+$/i)
  assert.equal(normalized[1].content[0].toolCallId, normalized[0].content[0].toolCallId)
  assert.deepEqual(normalized[1].content[0].output, {
    type: 'json',
    value: { ok: true },
  })
  assert.deepEqual(normalized[2], {
    role: 'assistant',
    content: [{ type: 'text', text: 'Done.' }],
  })
  assert.equal(normalized[3].role, 'user')
})
