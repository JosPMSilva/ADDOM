import test from 'node:test'
import assert from 'node:assert/strict'

import { getModelCatalogProvider } from '../../src/common/api-clients/model-catalog.mjs'
import { resolveProviderModelTransform } from '../../src/main/api-clients/provider-model-transform.mjs'

function getCatalogModel(provider, modelId) {
  return (provider?.models || []).find((model) => model.id === modelId) || null
}

test('groq family catalog resolution keeps curated defaults and provenance', () => {
  const provider = getModelCatalogProvider('groq')
  const reasoningModel = getCatalogModel(provider, 'qwen/qwen3.6-27b')

  assert.ok(provider)
  assert.equal(provider.defaultModel, 'openai/gpt-oss-120b')
  assert.ok(reasoningModel)
  assert.equal(reasoningModel.capabilities.reasoning.supported, true)
  assert.equal(reasoningModel.provenance.fields.limits.trustLevel, 'override')
})

test('groq family transform derives reasoning defaults and variants from curated metadata', () => {
  const qwen = resolveProviderModelTransform({
    providerId: 'groq',
    modelId: 'qwen/qwen3.6-27b',
  })
  const reasoning = resolveProviderModelTransform({
    providerId: 'groq',
    modelId: 'openai/gpt-oss-120b',
  })
  const deepConfig = reasoning.resolveInvocationConfig({
    requestContext: {
      variantId: 'deep',
    },
  })

  assert.deepEqual(reasoning.buildProviderOptions(), {
    groq: {
      reasoningEffort: 'medium',
    },
  })
  assert.equal(reasoning.registryModel?.capabilities?.reasoning?.providerControls?.includes('groq:reasoningEffort'), true)
  assert.equal(reasoning.registryModel?.variants?.some((variant) => variant.id === 'fast'), true)
  assert.deepEqual(deepConfig.providerOptions, {
    groq: {
      reasoningEffort: 'high',
    },
  })
  assert.deepEqual(qwen.buildProviderOptions(), {
    groq: { reasoningEffort: 'default' },
  })
  assert.equal(qwen.registryModel?.variants?.some((variant) => variant.id === 'deep'), false)
  assert.equal(qwen.registryModel?.variants?.some((variant) => variant.id === 'fast'), true)
  assert.equal(reasoning.attachment.supportsVision, false)
  assert.deepEqual(reasoning.attachment.inputModalities, ['text'])
})

test('groq family transform flattens only user content and preserves structured assistant tool history', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'groq',
    modelId: 'qwen/qwen3.6-27b',
  })
  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect these artifacts.' },
          { type: 'image', filename: 'diagram.png' },
          { type: 'file', filename: 'spec.pdf', mediaType: 'application/pdf' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Working on it.' },
          { type: 'tool-call', toolCallId: 'call_search_1', toolName: 'search_code', input: { query: 'provider transform' } },
        ],
      },
    ],
  })

  assert.equal(typeof normalized[0].content, 'string')
  assert.match(String(normalized[0].content), /Inspect these artifacts\./)
  assert.match(String(normalized[0].content), /Image attachment omitted/i)
  assert.match(String(normalized[0].content), /File attachment omitted/i)
  assert.ok(Array.isArray(normalized[1].content))
  assert.deepEqual(normalized[1].content[1], {
    type: 'tool-call',
    toolCallId: 'call_search_1',
    toolName: 'search_code',
    input: { query: 'provider transform' },
  })
})

test('groq family transform does not retain removed image-capable models as curated rows', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'groq',
    modelId: 'meta-llama/llama-4-scout-17b-16e-instruct',
  })
  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image.' },
          { type: 'image', filename: 'diagram.png', mediaType: 'image/png' },
        ],
      },
    ],
  })

  assert.equal(transform.registryModel, null)
  assert.equal(typeof normalized[0].content, 'string')
  assert.match(normalized[0].content, /Image attachment omitted/i)
})
