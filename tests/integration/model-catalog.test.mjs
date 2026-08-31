import test from 'node:test'
import assert from 'node:assert/strict'

const MODULE_PATH = '../../src/common/api-clients/model-catalog.mjs'

const GENERATED_SNAPSHOT_FIXTURE = Object.freeze([
  {
    providerId: 'gemini',
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-pro-exp',
    availability: {
      status: 'unknown',
      requiresKey: true,
      gates: ['upstream:google'],
    },
    provenance: {
      source: 'models.dev',
      sourceUrl: 'https://models.dev/google',
      verifiedAt: null,
      trustLevel: 'estimated',
      fields: {
        defaultModel: {
          state: 'placeholder',
          trustLevel: 'unknown',
          requiresOverride: true,
          reason: 'curated_default_model_required',
        },
      },
    },
    models: [
      {
        id: 'gemini-2.5-pro-exp',
        label: 'Gemini 2.5 Pro Experimental',
        group: 'Gemini 2.5',
        limits: { context: 1048576, output: 65536 },
        pricing: { inputUsdPer1M: 1.3, outputUsdPer1M: 10.5 },
        capabilities: {
          reasoning: { supported: true },
          toolCall: { supported: true },
          attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
          interleavedReasoning: { supported: false },
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
        availability: { status: 'unknown', requiresKey: true, gates: ['upstream:google'] },
        provenance: {
          source: 'models.dev',
          sourceUrl: 'https://models.dev/google/gemini-2.5-pro-exp',
          verifiedAt: '2026-03-01',
          trustLevel: 'estimated',
          fields: {
            pricing: { state: 'generated', trustLevel: 'estimated', reason: 'generated_from_models_dev' },
            limits: { state: 'generated', trustLevel: 'estimated', reason: 'generated_from_models_dev' },
          },
        },
      },
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        group: 'Gemini 2.5',
        limits: { context: 1048576, output: 65536 },
        defaultProviderOptions: {
          google: {
            responseModalities: ['TEXT'],
            safetySettings: {
              level: 'default',
            },
          },
        },
        variants: [
          {
            id: 'balanced',
            label: 'Balanced',
            default: true,
            providerOptions: {
              google: {
                thinkingConfig: {
                  budgetTokens: 2048,
                },
              },
            },
          },
        ],
        pricing: { inputUsdPer1M: 1.25, outputUsdPer1M: 10 },
        capabilities: {
          reasoning: { supported: true },
          toolCall: { supported: true },
          attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
          interleavedReasoning: { supported: false },
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
        availability: { status: 'unknown', requiresKey: true, gates: ['upstream:google'] },
        provenance: {
          source: 'models.dev',
          sourceUrl: 'https://models.dev/google/gemini-2.5-pro',
          verifiedAt: '2026-03-01',
          trustLevel: 'estimated',
          fields: {
            pricing: { state: 'generated', trustLevel: 'estimated', reason: 'generated_from_models_dev' },
            limits: { state: 'generated', trustLevel: 'estimated', reason: 'generated_from_models_dev' },
          },
        },
      },
    ],
  },
  {
    providerId: 'grok',
    id: 'grok',
    name: 'xAI Grok',
    defaultModel: 'grok-4',
    availability: {
      status: 'unknown',
      requiresKey: true,
      gates: ['upstream:xai'],
    },
    provenance: {
      source: 'models.dev',
      sourceUrl: 'https://models.dev/xai',
      verifiedAt: null,
      trustLevel: 'estimated',
    },
    models: [
      {
        id: 'grok-4',
        label: 'Grok 4',
        group: 'Grok 4',
        limits: { context: 256000, output: 65536 },
        pricing: { inputUsdPer1M: 3, outputUsdPer1M: 15 },
        capabilities: {
          reasoning: { supported: true },
          toolCall: { supported: true },
          attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
          interleavedReasoning: { supported: false },
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
        availability: { status: 'unknown', requiresKey: true, gates: ['upstream:xai'] },
        provenance: {
          source: 'models.dev',
          sourceUrl: 'https://models.dev/xai/grok-4',
          verifiedAt: '2026-03-01',
          trustLevel: 'estimated',
        },
      },
    ],
  },
  {
    providerId: 'openai',
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-5',
    availability: {
      status: 'unknown',
      requiresKey: true,
      gates: ['upstream:openai'],
    },
    provenance: {
      source: 'models.dev',
      sourceUrl: 'https://models.dev/openai',
      verifiedAt: null,
      trustLevel: 'estimated',
    },
    models: [
      {
        id: 'gpt-5',
        label: 'GPT-5',
        group: 'GPT-5',
        limits: { context: 400000, output: 128000 },
        pricing: { inputUsdPer1M: 1.25, outputUsdPer1M: 10 },
        capabilities: {
          reasoning: { supported: true },
          toolCall: { supported: true },
          attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
          interleavedReasoning: { supported: true },
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
        availability: { status: 'unknown', requiresKey: true, gates: ['upstream:openai'] },
        provenance: {
          source: 'models.dev',
          sourceUrl: 'https://models.dev/openai/gpt-5',
          verifiedAt: '2026-03-01',
          trustLevel: 'estimated',
          fields: {
            pricing: { state: 'generated', trustLevel: 'estimated', reason: 'generated_from_models_dev' },
          },
        },
      },
    ],
  },
])

const MERGE_OVERRIDES_FIXTURE = Object.freeze({
  providerAliases: {
    google: 'gemini',
    xai: 'grok',
  },
  providers: {
    gemini: {
      include: true,
      name: 'Gemini (Curated)',
      defaultModel: 'gemini-2.5-pro',
      notes: 'Wave 1 curated provider notes.',
      models: {
        'gemini-2.5-pro-exp': {
          include: false,
        },
        'gemini-2.5-pro': {
          include: true,
          label: 'Gemini 2.5 Pro (Curated)',
          defaultProviderOptions: {
            google: {
              safetySettings: {
                level: 'strict',
              },
            },
          },
          variants: [
            {
              id: 'balanced',
              providerOptions: {
                google: {
                  thinkingConfig: {
                    includeThoughts: true,
                  },
                },
              },
            },
            {
              id: 'fast',
              label: 'Fast',
              providerOptions: {
                google: {
                  thinkingConfig: {
                    budgetTokens: 256,
                  },
                },
              },
            },
          ],
          availability: {
            status: 'curated',
          },
        },
      },
    },
    grok: {
      include: false,
    },
  },
})

const LOOKUP_OVERRIDES_FIXTURE = Object.freeze({
  providerAliases: {
    google: 'gemini',
    xai: 'grok',
  },
  providers: {},
})

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

async function loadModuleContract() {
  let loaded
  try {
    loaded = await import(MODULE_PATH)
  } catch (error) {
    assert.fail(`Expected merged catalog module at ${MODULE_PATH}: ${error?.message || String(error)}`)
  }

  assert.equal(typeof loaded.mergeModelCatalog, 'function', 'model-catalog must export mergeModelCatalog')
  assert.equal(typeof loaded.getMergedCatalogProvider, 'function', 'model-catalog must export getMergedCatalogProvider')
  return loaded
}

function buildMergedCatalog(moduleExports, overrides) {
  const merged = moduleExports.mergeModelCatalog({
    generatedSnapshot: cloneJson(GENERATED_SNAPSHOT_FIXTURE),
    overrides: cloneJson(overrides),
  })

  assert.ok(merged && typeof merged === 'object', 'mergeModelCatalog must return an object')
  assert.ok(Array.isArray(merged.providers), 'mergeModelCatalog must return { providers: [] }')
  return merged
}

function findProvider(catalog, providerId) {
  return catalog.providers.find((entry) => entry.providerId === providerId) || null
}

function findModel(provider, modelId) {
  if (!provider) return null
  return provider.models.find((entry) => entry.id === modelId) || null
}

test('mergeModelCatalog applies override precedence over generated metadata and uses curated defaultModel', async () => {
  const moduleExports = await loadModuleContract()
  const merged = buildMergedCatalog(moduleExports, MERGE_OVERRIDES_FIXTURE)
  const gemini = findProvider(merged, 'gemini')
  const curatedModel = findModel(gemini, 'gemini-2.5-pro')

  assert.ok(gemini, 'gemini provider must exist after merge')
  assert.equal(gemini.name, 'Gemini (Curated)')
  assert.equal(gemini.defaultModel, 'gemini-2.5-pro')
  assert.ok(curatedModel, 'curated default model must exist')
  assert.equal(curatedModel.label, 'Gemini 2.5 Pro (Curated)')
  assert.equal(curatedModel.availability.status, 'curated')
})

test('mergeModelCatalog deep-merges defaultProviderOptions and variants by id', async () => {
  const moduleExports = await loadModuleContract()
  const merged = buildMergedCatalog(moduleExports, MERGE_OVERRIDES_FIXTURE)
  const gemini = findProvider(merged, 'gemini')
  const curatedModel = findModel(gemini, 'gemini-2.5-pro')

  assert.deepEqual(curatedModel.defaultProviderOptions, {
    google: {
      responseModalities: ['TEXT'],
      safetySettings: {
        level: 'strict',
      },
    },
  })
  assert.deepEqual(curatedModel.variants, [
    {
      id: 'balanced',
      label: 'Balanced',
      default: true,
      providerOptions: {
        google: {
          thinkingConfig: {
            budgetTokens: 2048,
            includeThoughts: true,
          },
        },
      },
    },
    {
      id: 'fast',
      label: 'Fast',
      providerOptions: {
        google: {
          thinkingConfig: {
            budgetTokens: 256,
          },
        },
      },
    },
  ])
})

test('mergeModelCatalog keeps provider-native runtime metadata separate from generic tool support in merged overrides', async () => {
  const moduleExports = await loadModuleContract()
  const merged = buildMergedCatalog(moduleExports, {
    providerAliases: {
      google: 'gemini',
    },
    providers: {
      gemini: {
        include: true,
        defaultModel: 'gemini-2.5-pro',
        models: {
          'gemini-2.5-pro': {
            include: true,
            capabilities: {
              toolCall: { supported: true },
              providerNativeRuntime: {
                supported: true,
                family: 'perplexity_research',
                surfaces: ['research'],
                mode: 'provider_owned_runtime',
                notes: 'Fixture-only provider runtime ownership.',
              },
            },
          },
        },
      },
    },
  })
  const gemini = findProvider(merged, 'gemini')
  const model = findModel(gemini, 'gemini-2.5-pro')

  assert.ok(model, 'merged model must exist')
  assert.equal(model.capabilities.toolCall.supported, true)
  assert.deepEqual(model.capabilities.providerNativeRuntime, {
    supported: true,
    family: 'perplexity_research',
    surfaces: ['research'],
    mode: 'provider_owned_runtime',
    notes: 'Fixture-only provider runtime ownership.',
  })
})

test('mergeModelCatalog supports provider/model inclusion-exclusion overrides', async () => {
  const moduleExports = await loadModuleContract()
  const merged = buildMergedCatalog(moduleExports, MERGE_OVERRIDES_FIXTURE)
  const providerIds = merged.providers.map((provider) => provider.providerId).sort()
  const gemini = findProvider(merged, 'gemini')
  const excludedExperimental = findModel(gemini, 'gemini-2.5-pro-exp')

  assert.deepEqual(providerIds, ['gemini', 'openai'])
  assert.equal(excludedExperimental, null)
})

test('mergeModelCatalog preserves generated provenance while applying overrides', async () => {
  const moduleExports = await loadModuleContract()
  const merged = buildMergedCatalog(moduleExports, MERGE_OVERRIDES_FIXTURE)
  const gemini = findProvider(merged, 'gemini')
  const curatedModel = findModel(gemini, 'gemini-2.5-pro')

  assert.ok(gemini, 'gemini provider must exist after merge')
  assert.ok(curatedModel, 'curated model must exist after merge')
  assert.equal(gemini.provenance.source, 'models.dev')
  assert.equal(curatedModel.provenance.source, 'models.dev')
  assert.deepEqual(curatedModel.provenance.fields.pricing, {
    state: 'generated',
    trustLevel: 'estimated',
    reason: 'generated_from_models_dev',
  })
})

test('getMergedCatalogProvider resolves canonical and alias provider ids', async () => {
  const moduleExports = await loadModuleContract()
  const merged = buildMergedCatalog(moduleExports, LOOKUP_OVERRIDES_FIXTURE)

  const geminiCanonical = moduleExports.getMergedCatalogProvider(merged, 'gemini')
  const geminiAlias = moduleExports.getMergedCatalogProvider(merged, 'google')
  const grokCanonical = moduleExports.getMergedCatalogProvider(merged, 'grok')
  const grokAlias = moduleExports.getMergedCatalogProvider(merged, 'xai')
  const unknown = moduleExports.getMergedCatalogProvider(merged, 'not-a-provider')

  assert.ok(geminiCanonical)
  assert.equal(geminiCanonical.providerId, 'gemini')
  assert.ok(geminiAlias)
  assert.equal(geminiAlias.providerId, 'gemini')

  assert.ok(grokCanonical)
  assert.equal(grokCanonical.providerId, 'grok')
  assert.ok(grokAlias)
  assert.equal(grokAlias.providerId, 'grok')

  assert.equal(unknown, null)
})
