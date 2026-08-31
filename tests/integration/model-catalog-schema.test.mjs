import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CATALOG_AVAILABILITY_STATUSES,
  CATALOG_TRUST_LEVELS,
  normalizeCatalog,
  normalizeCatalogModelEntry,
  normalizeCatalogProviderEntry,
} from '../../src/common/api-clients/model-catalog-schema.mjs'

test('catalog schema exposes explicit availability and trust enums', () => {
  assert.deepEqual(CATALOG_AVAILABILITY_STATUSES, [
    'configured',
    'curated',
    'verified',
    'unsupported',
    'unknown',
  ])
  assert.deepEqual(CATALOG_TRUST_LEVELS, [
    'authoritative',
    'verified',
    'estimated',
    'override',
    'unknown',
  ])
})

test('normalizeCatalogModelEntry maps current flat registry fields into the new nested catalog shape', () => {
  const normalized = normalizeCatalogModelEntry({
    id: ' gemini-2.5-pro ',
    label: ' Gemini 2.5 Pro ',
    group: ' Gemini 2.5 ',
    aliases: ['gemini-2.5-pro-preview', ' gemini-2.5-pro-preview ', '', 'gemini-2.5-pro-preview'],
    reasoning: true,
    vision: true,
    supportsPdf: false,
    contextWindowTokens: 1048576,
    inputLimit: 272000,
    maxOutputTokens: 65536,
    pricing: {
      inputUsdPer1M: 1.25,
      outputUsdPer1M: 10,
      notes: 'provider verified',
    },
    pricingSource: 'provider',
    contextSource: 'provider',
    verifiedAt: '2026-03-14',
    releaseDate: '2025-03-25',
    lastUpdated: '2025-09-01',
    knowledge: '2025-01',
    structuredOutput: true,
    openWeights: false,
    provenance: {
      sourceFile: 'providers/google/models/gemini-2.5-pro.toml',
    },
  })

  assert.equal(normalized.id, 'gemini-2.5-pro')
  assert.equal(normalized.label, 'Gemini 2.5 Pro')
  assert.equal(normalized.group, 'Gemini 2.5')
  assert.deepEqual(normalized.aliases, ['gemini-2.5-pro-preview'])
  assert.deepEqual(normalized.limits, {
    context: 1048576,
    input: 272000,
    output: 65536,
  })
  assert.equal(normalized.capabilities.reasoning.supported, true)
  assert.equal(normalized.capabilities.toolCall.supported, null)
  assert.deepEqual(normalized.capabilities.inputModalities, ['text', 'image'])
  assert.deepEqual(normalized.capabilities.outputModalities, [])
  assert.deepEqual(normalized.capabilities.attachment.kinds, ['image'])
  assert.deepEqual(normalized.capabilities.attachment.modalities, ['text', 'image'])
  assert.equal(normalized.availability.status, 'unknown')
  assert.equal(normalized.availability.requiresKey, true)
  assert.equal(normalized.provenance.source, 'provider')
  assert.equal(normalized.provenance.sourceFile, 'providers/google/models/gemini-2.5-pro.toml')
  assert.equal(normalized.provenance.verifiedAt, '2026-03-14')
  assert.equal(normalized.provenance.trustLevel, 'verified')
  assert.equal(normalized.releaseDate, '2025-03-25')
  assert.equal(normalized.lastUpdated, '2025-09-01')
  assert.equal(normalized.knowledge, '2025-01')
  assert.equal(normalized.structuredOutput, true)
  assert.equal(normalized.openWeights, false)
})

test('normalizeCatalogModelEntry preserves tiered pricing metadata', () => {
  const normalized = normalizeCatalogModelEntry({
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    group: 'Gemini 3.1',
    pricing: {
      inputUsdPer1M: 2,
      outputUsdPer1M: 12,
      cacheReadUsdPer1M: 0.2,
      tiers: [
        {
          id: 'context_over_200k',
          minPromptTokens: 200001,
          inputUsdPer1M: 4,
          outputUsdPer1M: 18,
          cacheReadUsdPer1M: 0.4,
        },
      ],
    },
  })

  assert.deepEqual(normalized.pricing, {
    inputUsdPer1M: 2,
    outputUsdPer1M: 12,
    cacheReadUsdPer1M: 0.2,
    tiers: [
      {
        id: 'context_over_200k',
        minPromptTokens: 200001,
        inputUsdPer1M: 4,
        outputUsdPer1M: 18,
        cacheReadUsdPer1M: 0.4,
      },
    ],
  })
})

test('normalizeCatalogModelEntry preserves explicit provider-native runtime metadata separately from generic tool support', () => {
  const normalized = normalizeCatalogModelEntry({
    id: 'moonshot-kimi-formula',
    label: 'Moonshot Kimi Formula',
    group: 'Moonshot',
    capabilities: {
      toolCall: { supported: true, mode: 'function_calling' },
      providerNativeRuntime: {
        supported: true,
        family: 'moonshot_formula',
        surfaces: ['formula', 'search'],
        mode: 'provider_owned_runtime',
        notes: 'Formula ownership is model-specific.',
      },
    },
  })

  assert.equal(normalized.capabilities.toolCall.supported, true)
  assert.deepEqual(normalized.capabilities.providerNativeRuntime, {
    supported: true,
    family: 'moonshot_formula',
    surfaces: ['formula', 'search'],
    mode: 'provider_owned_runtime',
    notes: 'Formula ownership is model-specific.',
  })
})

test('normalizeCatalogProviderEntry normalizes provider metadata and nested models', () => {
  const normalized = normalizeCatalogProviderEntry({
    providerId: ' GEMINI ',
    name: ' Google Gemini ',
    defaultModel: ' gemini-2.5-pro ',
    env: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
    keyHint: ' AIza... ',
    keyUrl: ' https://aistudio.google.com/app/apikey ',
    termsUrl: ' https://ai.google.dev/gemini-api/terms ',
    termsVersion: ' 2026-03-14 ',
    models: [
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        group: 'Gemini 2.5',
        reasoning: true,
        contextWindowTokens: 1048576,
      },
    ],
  })

  assert.equal(normalized.providerId, 'gemini')
  assert.equal(normalized.id, 'gemini')
  assert.equal(normalized.name, 'Google Gemini')
  assert.equal(normalized.defaultModel, 'gemini-2.5-pro')
  assert.deepEqual(normalized.env, ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'])
  assert.equal(normalized.availability.status, 'unknown')
  assert.equal(normalized.availability.requiresKey, true)
  assert.equal(normalized.models.length, 1)
  assert.equal(normalized.models[0].id, 'gemini-2.5-pro')
  assert.equal(normalized.models[0].capabilities.reasoning.supported, true)
})

test('normalizeCatalog preserves provider order and handles local providers without keys', () => {
  const normalized = normalizeCatalog([
    {
      providerId: 'ollama',
      name: 'Ollama',
      noKeyRequired: true,
      localAvailable: false,
      models: [],
    },
    {
      providerId: 'anthropic',
      name: 'Anthropic',
      defaultModel: 'claude-sonnet-4-6',
      models: [
        {
          id: 'claude-sonnet-4-6',
          label: 'Claude Sonnet 4.6',
          group: 'Claude 4',
          capabilities: {
            toolCall: { supported: true, mode: 'function_calling' },
            attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
          },
          availability: { status: 'curated', notes: 'wave-1 family' },
          provenance: { source: 'override', trustLevel: 'override' },
          limits: { context: 200000, output: 64000 },
        },
      ],
    },
  ])

  assert.equal(normalized.length, 2)
  assert.equal(normalized[0].providerId, 'ollama')
  assert.equal(normalized[0].availability.requiresKey, false)
  assert.equal(normalized[0].availability.localAvailable, false)
  assert.equal(normalized[1].providerId, 'anthropic')
  assert.equal(normalized[1].models[0].availability.status, 'curated')
  assert.equal(normalized[1].models[0].provenance.trustLevel, 'override')
  assert.equal(normalized[1].models[0].capabilities.toolCall.supported, true)
  assert.deepEqual(normalized[1].models[0].capabilities.attachment.kinds, ['image', 'pdf'])
  assert.deepEqual(normalized[1].models[0].capabilities.attachment.modalities, ['text', 'image', 'file'])
})
