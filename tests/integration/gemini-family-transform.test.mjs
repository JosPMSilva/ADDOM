import test from 'node:test'
import assert from 'node:assert/strict'

import { getModelCatalogProvider } from '../../src/common/api-clients/model-catalog.mjs'
import { resolveProviderModelTransform } from '../../src/main/api-clients/provider-model-transform.mjs'

function getCatalogModel(provider, modelId) {
  return (provider?.models || []).find((model) => model.id === modelId) || null
}

test('gemini family catalog resolution keeps the curated default and generated provenance', () => {
  const provider = getModelCatalogProvider('gemini')
  const model = getCatalogModel(provider, 'gemini-2.5-pro')

  assert.ok(provider)
  assert.equal(provider.defaultModel, 'gemini-3.5-flash')
  assert.ok(model)
  assert.equal(model.capabilities.reasoning.supported, true)
  assert.equal(model.provenance.source, 'models.dev')
  assert.equal(model.provenance.trustLevel, 'estimated')
  assert.equal(model.provenance.verifiedAt, '2025-06-17')
})

test('gemini family transform derives reasoning defaults and attachment truth from curated metadata', () => {
  const pro = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
  })
  const flash = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-3.5-flash',
  })

  assert.deepEqual(pro.buildProviderOptions(), {
    google: { thinkingConfig: { includeThoughts: true } },
  })
  assert.equal(pro.registryModel?.capabilities?.reasoning?.providerControls?.includes('google:thinkingConfig.includeThoughts'), true)
  assert.equal(pro.registryModel?.variants?.some((variant) => variant.id === 'low'), true)
  assert.deepEqual(flash.buildProviderOptions(), {
    google: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'medium' } },
  })
  assert.equal(flash.registryModel?.id, 'gemini-3.5-flash')
  assert.equal(pro.attachment.supportsVision, true)
  assert.equal(pro.attachment.supportsPdf, true)
  assert.equal(pro.attachment.inputModalities.includes('image'), true)
})

test('gemini 3.x models expose provider-supported thinking levels', () => {
  const flash = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-3.5-flash',
  })
  const high = flash.resolveInvocationConfig({ requestContext: { variantId: 'high' } })
  const minimal = flash.resolveInvocationConfig({ requestContext: { variantId: 'minimal' } })

  assert.deepEqual(flash.buildProviderOptions(), {
    google: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'medium' } },
  })
  assert.deepEqual(high.providerOptions, {
    google: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' } },
  })
  assert.deepEqual(minimal.providerOptions, {
    google: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'minimal' } },
  })
})

test('gemini 3.1 Pro omits the unsupported minimal thinking level', () => {
  const pro = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-3.1-pro-preview',
  })

  assert.equal(pro.registryModel?.variants?.some((variant) => variant.id === 'minimal'), false)
  assert.equal(pro.registryModel?.variants?.some((variant) => variant.id === 'low'), true)
})

test('gemini 2.5 variants change thinking effort rather than only summary visibility', () => {
  const pro = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
  })
  const low = pro.resolveInvocationConfig({ requestContext: { variantId: 'low' } })

  assert.equal(pro.registryModel?.variants?.some((variant) => variant.id === 'lean'), false)
  assert.deepEqual(low.providerOptions, {
    google: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'low' } },
  })
})

test('gemini family transform keeps multimodal message shape unchanged', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-3.1-pro-preview',
  })
  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Summarize both attachments.' },
          { type: 'image', filename: 'diagram.png' },
          { type: 'file', filename: 'notes.pdf' },
        ],
      },
    ],
  })

  assert.ok(Array.isArray(normalized[0].content))
  assert.deepEqual(
    normalized[0].content.map((part) => part.type),
    ['text', 'image', 'file'],
  )
})
