import test from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeOpenRouterManifestModels,
  normalizeOpenRouterLiveModelRow,
} from '../../src/common/api-clients/openrouter-live-models.mjs'

test('normalizeOpenRouterLiveModelRow preserves live metadata and inferred capability signals', () => {
  const row = normalizeOpenRouterLiveModelRow({
    id: 'openai/gpt-5.4',
    name: 'GPT-5.4 via OpenRouter',
    description: 'Reviewed route',
    context_length: 200000,
    supported_parameters: ['tools', 'tool_choice', 'reasoning', 'reasoning_effort'],
    architecture: {
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
    },
    pricing: {
      prompt: 2.5,
      completion: 12.5,
    },
  })

  assert.equal(row.id, 'openai/gpt-5.4')
  assert.equal(row.label, 'openai/gpt-5.4')
  assert.equal(row.group, 'OpenAI')
  assert.equal(row.contextWindowTokens, 200000)
  assert.equal(row.openrouterLive?.name, 'GPT-5.4 via OpenRouter')
  assert.deepEqual(row.openrouterLive?.supportedParameters, [
    'tools',
    'tool_choice',
    'reasoning',
    'reasoning_effort',
  ])
  assert.deepEqual(row.openrouterLive?.architecture?.inputModalities, ['text', 'image'])
  assert.equal(row.openrouterInferredCapabilities?.supportsTools, true)
  assert.equal(row.openrouterInferredCapabilities?.supportsReasoning, true)
  assert.equal(row.openrouterInferredCapabilities?.supportsReasoningEffort, true)
  assert.equal(row.openrouterInferredCapabilities?.supportsVision, true)
  assert.equal(row.openrouterCapabilityProvenance?.tools, 'estimated_openrouter_supported_parameters')
  assert.equal(row.openrouterCapabilityProvenance?.vision, 'estimated_openrouter_architecture')
})

test('mergeOpenRouterManifestModels preserves richer reviewed/catalog fields while attaching live metadata', () => {
  const reviewed = {
    id: 'openai/gpt-5.4',
    label: 'openai/gpt-5.4',
    group: 'OpenAI',
    supportsTools: false,
    reasoning: true,
    contextWindowTokens: 922000,
    pricing: {
      inputUsdPer1M: 2.5,
    },
  }
  const live = normalizeOpenRouterLiveModelRow({
    id: 'openai/gpt-5.4',
    context_length: 200000,
    supported_parameters: ['tools', 'tool_choice'],
    architecture: {
      input_modalities: ['text', 'image'],
    },
    pricing: {
      prompt: 1.5,
    },
  })
  const [merged] = mergeOpenRouterManifestModels([live], [reviewed])

  assert.equal(merged.id, 'openai/gpt-5.4')
  assert.equal(merged.supportsTools, false)
  assert.equal(merged.reasoning, true)
  assert.equal(merged.contextWindowTokens, 922000)
  assert.equal(merged.pricing.inputUsdPer1M, 2.5)
  assert.equal(merged.pricing.prompt, 1.5)
  assert.equal(merged.openrouterInferredCapabilities?.supportsTools, true)
  assert.equal(merged.openrouterInferredCapabilities?.supportsVision, true)
  assert.equal(merged.openrouterLive?.contextLength, 200000)
})
