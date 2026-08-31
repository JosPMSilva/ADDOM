import test from 'node:test'
import assert from 'node:assert/strict'

import { getModelCatalogProvider } from '../../src/common/api-clients/model-catalog.mjs'
import { resolveProviderModelTransform } from '../../src/main/api-clients/provider-model-transform.mjs'

function getCatalogModel(provider, modelId) {
  return (provider?.models || []).find((model) => model.id === modelId) || null
}

test('anthropic family catalog resolution keeps the curated default and generated provenance', () => {
  const provider = getModelCatalogProvider('anthropic')
  const model = getCatalogModel(provider, 'claude-sonnet-5')

  assert.ok(provider)
  assert.equal(provider.defaultModel, 'claude-sonnet-5')
  assert.ok(model)
  assert.equal(model.capabilities.reasoning.supported, true)
  assert.equal(model.provenance.source, 'models.dev')
  assert.equal(model.provenance.trustLevel, 'estimated')
  assert.ok(String(model.provenance.verifiedAt || '').trim())
})

test('anthropic adaptive-thinking models never emit legacy budget tokens', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-opus-4-8',
  })
  const deepConfig = transform.resolveInvocationConfig({
    requestContext: {
      variantId: 'deep',
    },
  })

  assert.deepEqual(transform.buildProviderOptions(), {
    anthropic: { thinking: { type: 'adaptive' }, effort: 'high' },
  })
  assert.equal(transform.registryModel?.capabilities?.reasoning?.providerControls?.includes('anthropic:thinking.budgetTokens'), false)
  assert.equal(transform.registryModel?.variants?.some((variant) => variant.id === 'deep'), true)
  assert.deepEqual(deepConfig.providerOptions, {
    anthropic: { thinking: { type: 'adaptive' }, effort: 'max' },
  })
  assert.equal(transform.attachment.supportsVision, true)
  assert.equal(transform.attachment.inputModalities.includes('image'), true)
})

test('anthropic family transform merges runtime compaction settings into Anthropic provider options', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
  })

  const config = transform.resolveInvocationConfig({
    runtimeSettings: {
      useContextManagementCompaction: true,
      contextManagementCompactionThresholdTokens: 50_000,
      contextManagementCompactionInstructions: 'Summarize older context and keep decisions.',
    },
  })

  assert.deepEqual(config.providerOptions, {
    anthropic: {
      effort: 'high',
      contextManagement: {
        edits: [{
          type: 'compact_20260112',
          trigger: {
            type: 'input_tokens',
            value: 50_000,
          },
          instructions: 'Summarize older context and keep decisions.',
        }],
      },
    },
  })
})

test('anthropic family transform merges runtime reasoning effort into Anthropic provider options', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
  })

  const config = transform.resolveInvocationConfig({
    runtimeSettings: {
      reasoningEffort: 'max',
    },
  })

  assert.deepEqual(config.providerOptions, {
    anthropic: {
      effort: 'max',
    },
  })
})

test('anthropic provider-default thinking models omit unnecessary thinking configuration', () => {
  const fableTransform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-fable-5',
  })
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
  })

  assert.deepEqual(fableTransform.buildProviderOptions(), {
    anthropic: { effort: 'high' },
  })
  assert.deepEqual(transform.buildProviderOptions(), {
    anthropic: { effort: 'high' },
  })

  const disabledConfig = transform.resolveInvocationConfig({
    runtimeSettings: {
      thinkingType: 'disabled',
    },
  })
  const enabledConfig = transform.resolveInvocationConfig({
    runtimeSettings: {
      thinkingType: 'enabled',
    },
  })

  assert.deepEqual(disabledConfig.providerOptions, {
    anthropic: {
      thinking: { type: 'disabled' },
      effort: 'high',
    },
  })
  assert.deepEqual(enabledConfig.providerOptions, {
    anthropic: { effort: 'high' },
  })
})

test('anthropic family transform does not send effort for Claude Haiku 4.5', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
  })

  const config = transform.resolveInvocationConfig({
    runtimeSettings: {
      reasoningEffort: 'high',
    },
  })

  assert.deepEqual(config.providerOptions, {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 16000 },
    },
  })
  assert.equal(transform.registryModel?.capabilities?.reasoning?.providerControls?.includes('anthropic:effort'), false)
})

test('anthropic manual-thinking models retain supported budget variants', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
  })
  const deepConfig = transform.resolveInvocationConfig({
    requestContext: { variantId: 'deep' },
  })

  assert.deepEqual(transform.buildProviderOptions(), {
    anthropic: { thinking: { type: 'enabled', budgetTokens: 16000 } },
  })
  assert.deepEqual(deepConfig.providerOptions, {
    anthropic: { thinking: { type: 'enabled', budgetTokens: 32000 } },
  })
})

test('anthropic family transform allows provider-scoped request overrides for compaction settings', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
  })

  const config = transform.resolveInvocationConfig({
    runtimeSettings: {
      useContextManagementCompaction: true,
      contextManagementCompactionThresholdTokens: 50_000,
      contextManagementCompactionInstructions: 'Keep defaults.',
    },
    requestContext: {
      anthropic: {
        contextManagementCompactionThresholdTokens: 80_000,
        contextManagementCompactionInstructions: 'Use the per-turn summary instructions.',
      },
    },
  })

  assert.deepEqual(config.providerOptions, {
    anthropic: {
      effort: 'high',
      contextManagement: {
        edits: [{
          type: 'compact_20260112',
          trigger: {
            type: 'input_tokens',
            value: 80_000,
          },
          instructions: 'Use the per-turn summary instructions.',
        }],
      },
    },
  })
})

test('anthropic family transform keeps assistant phase out of normalized messages', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
  })
  const normalized = transform.normalizeMessages({
    messages: [
      { role: 'assistant', content: 'Working...', phase: 'commentary' },
    ],
  })

  assert.equal(Object.prototype.hasOwnProperty.call(normalized[0], 'phase'), false)
})

test('anthropic family transform filters empty content, preserves supported file input, and sanitizes tool call ids', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
  })
  const normalized = transform.normalizeMessages({
    messages: [
      { role: 'user', content: '' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '' },
          { type: 'reasoning', text: '  ' },
          { type: 'file', fileName: 'spec.pdf', mimeType: 'application/pdf' },
          { type: 'image', fileName: 'diagram.png', mimeType: 'image/png' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'tool_call', call_id: 'call:1/with spaces', name: 'search', args: { q: 'docs' } },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool_result', call_id: 'call:1/with spaces', name: 'search', result: { ok: true } },
        ],
      },
    ],
  })

  assert.equal(normalized.length, 3)
  assert.deepEqual(normalized[0].content, [
    { type: 'file', fileName: 'spec.pdf', mimeType: 'application/pdf', filename: 'spec.pdf', mediaType: 'application/pdf' },
    { type: 'image', fileName: 'diagram.png', mimeType: 'image/png', filename: 'diagram.png', mediaType: 'image/png' },
  ])
  assert.deepEqual(normalized[1].content, [
    { type: 'tool-call', call_id: 'call:1/with spaces', name: 'search', args: { q: 'docs' }, toolCallId: 'call_1_with_spaces', toolName: 'search', input: { q: 'docs' } },
  ])
  assert.deepEqual(normalized[2].content, [
    { type: 'tool-result', call_id: 'call:1/with spaces', name: 'search', result: { ok: true }, toolCallId: 'call_1_with_spaces', toolName: 'search', output: { type: 'json', value: { ok: true } } },
  ])
})

test('anthropic family transform replays persisted providerHistoryParts and keeps redacted reasoning blocks', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
  })

  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'assistant',
        content: 'Visible assistant text for UI only.',
        providerHistoryParts: [
          {
            type: 'reasoning',
            text: 'Anthropic thinking block.',
            providerOptions: {
              anthropic: {
                signature: 'sig_123',
              },
            },
          },
          {
            type: 'reasoning',
            text: '',
            providerOptions: {
              anthropic: {
                redactedData: 'redacted_blob',
              },
            },
          },
          {
            type: 'text',
            text: 'Visible assistant text for replay.',
          },
        ],
      },
    ],
  })

  assert.deepEqual(normalized, [
    {
      role: 'assistant',
      providerHistoryParts: [
        {
          type: 'reasoning',
          text: 'Anthropic thinking block.',
          providerOptions: {
            anthropic: {
              signature: 'sig_123',
            },
          },
        },
        {
          type: 'reasoning',
          text: '',
          providerOptions: {
            anthropic: {
              redactedData: 'redacted_blob',
            },
          },
        },
        {
          type: 'text',
          text: 'Visible assistant text for replay.',
        },
      ],
      content: [
        {
          type: 'reasoning',
          text: 'Anthropic thinking block.',
          providerOptions: {
            anthropic: {
              signature: 'sig_123',
            },
          },
        },
        {
          type: 'reasoning',
          text: '',
          providerOptions: {
            anthropic: {
              redactedData: 'redacted_blob',
            },
          },
        },
        {
          type: 'text',
          text: 'Visible assistant text for replay.',
        },
      ],
    },
  ])
})
