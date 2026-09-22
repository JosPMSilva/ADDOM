import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getRegistryProvider,
  listRegistryModelsForProvider,
  listRegistryProviders,
  resolveRegistryModelAlias,
  canonicalizeRegistryModelSelection,
  buildStaticProviderManifest,
} from '../../src/main/api-clients/model-registry.mjs'
import { OPENROUTER_SUPPORTED_ROUTE_IDS } from '../../src/common/api-clients/openrouter-compatibility-data.mjs'

function findProvider(list, id) {
  return list.find((row) => String(row?.id || row?.providerId) === id)
}

function modelIds(provider) {
  return (Array.isArray(provider?.models) ? provider.models : []).map((row) => String(row?.id || ''))
}

const APPROVED_DIRECT_PROVIDER_MODELS = Object.freeze({
  anthropic: [
    'claude-sonnet-5',
    'claude-opus-5',
    'claude-fable-5-1',
    'claude-opus-4-8',
    'claude-haiku-4-5',
  ],
  openai: [
    'gpt-6-astra',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.3-codex',
    'gpt-5.5',
    'gpt-5.4',
  ],
  gemini: [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-2.5-pro',
  ],
  groq: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.6-27b',
    'groq/compound',
    'groq/compound-mini',
  ],
  grok: [
    'grok-4.6',
    'grok-4.5',
    'grok-4.3',
    'grok-4.20-multi-agent-0309',
  ],
  mistral: [
    'mistral-medium-2604',
    'mistral-small-2603',
    'mistral-large-2512',
  ],
  deepseek: [
    'deepseek-flash',
    'deepseek-v4-pro',
  ],
  moonshot: [
    'kimi-k3',
    'kimi-k2.7-code',
    'kimi-k2.6',
  ],
  perplexity: [
    'sonar-pro',
    'sonar',
    'sonar-reasoning-pro',
    'sonar-deep-research',
  ],
})

test('direct provider registry contains exactly the approved 39 models', () => {
  const directModelIds = []

  for (const [providerId, expectedModelIds] of Object.entries(APPROVED_DIRECT_PROVIDER_MODELS)) {
    const provider = getRegistryProvider(providerId)
    assert.ok(provider, `missing direct provider ${providerId}`)
    assert.deepEqual(modelIds(provider), expectedModelIds, `${providerId} catalog drifted from the approved matrix`)
    assert.equal(provider.models.some((model) => model.deprecated), false, `${providerId} retains deprecated rows`)
    directModelIds.push(...modelIds(provider))
  }

  assert.equal(directModelIds.length, 39)
})

test('canonical registry providers/models expose normalized schema fields', () => {
  const providers = listRegistryProviders()
  assert.ok(Array.isArray(providers))
  assert.ok(providers.length >= 8)

  const providerIds = new Set()
  for (const provider of providers) {
    assert.ok(provider.id)
    assert.ok(provider.providerId)
    assert.equal(provider.id, String(provider.id).toLowerCase())
    assert.ok(Array.isArray(provider.models))
    assert.equal(providerIds.has(provider.id), false, `duplicate provider id ${provider.id}`)
    providerIds.add(provider.id)

    const seenModels = new Set()
    for (const model of provider.models) {
      assert.ok(model.id)
      assert.ok(model.label)
      assert.ok(model.group)
      assert.ok(model.contextSource)
      assert.ok(model.pricingSource)
      assert.equal(typeof model.defaultProviderOptions, 'object')
      assert.equal(Array.isArray(model.variants), true)
      assert.equal(seenModels.has(model.id.toLowerCase()), false, `duplicate model ${provider.id}:${model.id}`)
      seenModels.add(model.id.toLowerCase())
      if (!model.deprecated) {
        assert.ok(
          Number.isFinite(Number(model.contextWindowTokens))
          || provider.id === 'ollama'
          || provider.id === 'lmstudio'
          || model.contextSource === 'provider',
        )
      }
    }
  }
})

test('registry preserves generated factual release, knowledge, and structured-output fields', () => {
  const gemini = getRegistryProvider('gemini')
  const openai = getRegistryProvider('openai')
  const pro = gemini.models.find((model) => model.id === 'gemini-2.5-pro')
  const flashLite = gemini.models.find((model) => model.id === 'gemini-3.1-flash-lite')
  const gpt54 = openai.models.find((model) => model.id === 'gpt-5.4')

  assert.ok(pro)
  assert.equal(pro.releaseDate, '2025-06-17')
  assert.equal(pro.knowledge, '2025-01')
  assert.equal(pro.structuredOutput, true)
  assert.equal(pro.pricing?.inputUsdPer1M, 1.25)
  assert.equal(pro.pricing?.outputUsdPer1M, 10)
  assert.equal(pro.pricing?.cacheReadUsdPer1M, 0.125)

  assert.ok(flashLite)
  assert.equal(flashLite.releaseDate, '2026-05-07')
  assert.equal(flashLite.knowledge, '2025-01')
  assert.equal(flashLite.structuredOutput, true)
  assert.equal(flashLite.capabilities.reasoning.providerControls.includes('google:thinkingConfig.includeThoughts'), true)

  assert.ok(gpt54)
  assert.equal(gpt54.inputLimit, 922000)
  assert.equal(gpt54.inputLimitTokens, 922000)
})

test('getRegistryProvider returns the normalized provider entry for curated providers', () => {
  const provider = getRegistryProvider(' openai ')

  assert.ok(provider)
  assert.equal(provider.id, 'openai')
  assert.equal(provider.providerId, 'openai')
  assert.equal(provider.defaultModel, 'gpt-5.6-sol')
  assert.equal(provider.logoPath, 'provider-logos/openai.svg')
  assert.equal(provider.sourceFile, 'providers/openai/provider.toml')
  assert.equal(provider.generatedProvenance?.source, 'models.dev')
  assert.ok(Array.isArray(provider.models))
  assert.ok(provider.models.length > 0)
})

test('curated remote providers use the approved defaults and high-value capability metadata', () => {
  const anthropic = getRegistryProvider('anthropic')
  const openai = getRegistryProvider('openai')
  const gemini = getRegistryProvider('gemini')
  const moonshot = getRegistryProvider('moonshot')
  const grok = getRegistryProvider('grok')
  const groq = getRegistryProvider('groq')
  const mistral = getRegistryProvider('mistral')
  const deepseek = getRegistryProvider('deepseek')

  assert.equal(anthropic.defaultModel, 'claude-sonnet-5')
  assert.equal(openai.defaultModel, 'gpt-5.6-sol')
  for (const modelId of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
    const currentModel = openai.models.find((model) => model.id === modelId)
    assert.equal(currentModel.contextWindowTokens, 1_050_000)
    assert.equal(currentModel.maxOutputTokens, 128_000)
  }
  const astra = openai.models.find((model) => model.id === 'gpt-6-astra')
  assert.ok(astra)
  assert.equal(astra.contextWindowTokens, 1_050_000)
  assert.equal(astra.maxOutputTokens, 128_000)
  assert.equal(astra.structuredOutput, true)
  assert.equal(astra.knowledge, '2026-04')
  assert.equal(astra.pricing.inputUsdPer1M, 10)
  assert.equal(astra.pricing.cacheReadUsdPer1M, 1)
  assert.equal(astra.pricing.cacheWriteUsdPer1M, 12.5)
  assert.equal(astra.pricing.outputUsdPer1M, 50)
  assert.deepEqual(astra.pricing.tiers[0], {
    id: 'long-context',
    sizeUsdPer1M: 272_000,
    inputUsdPer1M: 20,
    outputUsdPer1M: 75,
    cacheReadUsdPer1M: 2,
    cacheWriteUsdPer1M: 25,
    notes: 'Requests with more than 272K input tokens use long-context rates for the full request.',
  })

  assert.equal(gemini.defaultModel, 'gemini-3.8-flash')
  assert.equal(moonshot.defaultModel, 'kimi-k3')
  const kimiK3 = moonshot.models.find((model) => model.id === 'kimi-k3')
  assert.equal(kimiK3.reasoning, true)
  assert.equal(kimiK3.structuredOutput, true)
  assert.equal(kimiK3.openWeights, true)
  assert.equal(kimiK3.releaseDate, '2026-07-16')
  assert.equal(kimiK3.contextWindowTokens, 1_000_000)
  assert.equal(kimiK3.maxOutputTokens, 1_048_576)
  assert.equal(kimiK3.pricing.inputUsdPer1M, 3)
  assert.equal(kimiK3.pricing.cacheReadUsdPer1M, 0.3)
  assert.equal(kimiK3.pricing.outputUsdPer1M, 15)
  assert.deepEqual(kimiK3.variants.map((variant) => variant.id), ['low', 'high', 'max'])
  assert.equal(kimiK3.variants.find((variant) => variant.id === 'max')?.default, true)
  assert.equal(kimiK3.capabilities.interleavedReasoning.supported, true)
  assert.equal(grok.defaultModel, 'grok-4.6')
  assert.equal(grok.models.find((model) => model.id === 'grok-4.6').contextWindowTokens, 500_000)
  assert.equal(grok.models.find((model) => model.id === 'grok-4.5').contextWindowTokens, 500_000)
  assert.equal(grok.models.find((model) => model.id === 'grok-4.20-multi-agent-0309').supportsTools, false)
  for (const modelId of ['grok-4.3', 'grok-4.20-multi-agent-0309']) {
    assert.equal(grok.models.find((model) => model.id === modelId).contextWindowTokens, 1_000_000)
  }
  assert.equal(groq.defaultModel, 'openai/gpt-oss-120b')
  for (const compoundId of ['groq/compound', 'groq/compound-mini']) {
    const compound = groq.models.find((model) => model.id === compoundId)
    assert.equal(compound.capabilities.toolCall.supported, false)
    assert.equal(compound.supportsTools, false)
  }
  assert.equal(mistral.defaultModel, 'mistral-medium-2604')
  assert.equal(deepseek.defaultModel, 'deepseek-flash')
  const deepseekFlash = deepseek.models.find((model) => model.id === 'deepseek-flash')
  const deepseekPro = deepseek.models.find((model) => model.id === 'deepseek-v4-pro')
  for (const currentModel of [deepseekFlash, deepseekPro]) {
    assert.equal(currentModel.reasoning, true)
    assert.equal(currentModel.structuredOutput, true)
    assert.equal(currentModel.maxOutputTokens, 393_216)
    assert.deepEqual(currentModel.variants.map((variant) => variant.id), ['none', 'low', 'high', 'max'])
  }
  assert.equal(deepseekFlash.releaseDate, '2026-09-10')
  assert.equal(deepseekPro.releaseDate, '2026-08-13')
  assert.equal(deepseekFlash.vision, true)
  assert.equal(deepseekFlash.contextWindowTokens, 1_000_000)
  assert.equal(deepseekFlash.capabilities.interleavedReasoning.supported, true)
  assert.deepEqual(deepseekFlash.pricing, {
    inputUsdPer1M: 0.3,
    outputUsdPer1M: 1.2,
    cacheReadUsdPer1M: 0.006,
    tiers: [
      {
        id: 'off-peak',
        inputUsdPer1M: 0.15,
        outputUsdPer1M: 0.6,
        cacheReadUsdPer1M: 0.003,
        notes: 'Outside weekday peak hours (01:00-04:00 and 06:00-10:00 UTC).',
      },
      {
        id: 'peak',
        inputUsdPer1M: 0.3,
        outputUsdPer1M: 1.2,
        cacheReadUsdPer1M: 0.006,
        notes: 'Weekdays 01:00-04:00 and 06:00-10:00 UTC.',
      },
    ],
    notes: 'Base prices use peak rates; off-peak rates apply outside the listed weekday windows.',
  })
  assert.equal(deepseekPro.pricing.inputUsdPer1M, 1.32)
  assert.equal(deepseekPro.pricing.outputUsdPer1M, 3.96)
  assert.equal(deepseekPro.pricing.cacheReadUsdPer1M, 0.044)
  assert.equal(deepseekPro.pricing.tiers[0].id, 'off-peak')
  assert.notEqual(deepseekPro.vision, true)
})

test('removed direct-provider models are absent from normal and migration/debug registry views', () => {
  const retiredByProvider = {
    anthropic: ['claude-opus-4-0', 'claude-sonnet-4-0', 'claude-opus-4-1', 'claude-mythos-5'],
    openai: ['gpt-6-astra-pro'],
    gemini: ['gemini-3-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    grok: ['grok-4-fast-reasoning', 'grok-4-fast-non-reasoning', 'grok-4-1-fast-reasoning', 'grok-4-1-fast-non-reasoning', 'grok-code-fast-1', 'grok-3'],
    groq: ['qwen/qwen3.8-27b'],
    mistral: ['mistral-medium-2508', 'mistral-small-2506', 'magistral-medium-2509'],
  }

  for (const [providerId, modelIdsToRetire] of Object.entries(retiredByProvider)) {
    const visibleIds = new Set(listRegistryModelsForProvider(providerId).map((model) => model.id))
    const allRegistryIds = new Set(listRegistryModelsForProvider(providerId, { includeDeprecated: true }).map((model) => model.id))
    for (const modelId of modelIdsToRetire) {
      assert.equal(visibleIds.has(modelId), false, `${providerId}/${modelId} should be absent`)
      assert.equal(allRegistryIds.has(modelId), false, `${providerId}/${modelId} should not remain configured`)
    }
  }
})

test('openrouter provider exposes reviewed route ids without inheriting native-provider runtime semantics', () => {
  const provider = getRegistryProvider('openrouter')
  const claudeOpus = provider.models.find((model) => model.id === 'anthropic/claude-opus-4.7')
  const gpt54 = provider.models.find((model) => model.id === 'openai/gpt-5.4')
  const kimi = provider.models.find((model) => model.id === 'moonshotai/kimi-k2.5')
  const deepseekChat = provider.models.find((model) => model.id === 'deepseek/deepseek-chat-v3.1')
  const deepseekV32 = provider.models.find((model) => model.id === 'deepseek/deepseek-v3.2')
  const deepseekFlash = provider.models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash')
  const grokMultiAgent = provider.models.find((model) => model.id === 'x-ai/grok-4.20-multi-agent')
  const sonar = provider.models.find((model) => model.id === 'perplexity/sonar-pro')

  assert.ok(provider)
  assert.equal(provider.defaultModel, 'openai/gpt-5.6-sol')
  assert.ok(claudeOpus)
  assert.equal(claudeOpus.group, 'Anthropic')
  assert.equal(claudeOpus.contextSource, 'verified_fallback')
  assert.equal(claudeOpus.reasoning, true)
  assert.equal(claudeOpus.contextWindowTokens, 1_000_000)
  assert.equal(claudeOpus.maxOutputTokens, 128_000)
  assert.ok(gpt54)
  assert.equal(gpt54.label, 'openai/gpt-5.4')
  assert.equal(gpt54.contextSource, 'verified_fallback')
  assert.equal(gpt54.capabilities.toolCall.supported, true)
  assert.equal(gpt54.vision, true)
  assert.equal(gpt54.supportsPdf, true)
  assert.equal(gpt54.supportsTools, true)
  assert.equal(gpt54.releaseDate, '2026-03-05')
  assert.equal(gpt54.knowledge, '2025-08-31')
  assert.equal(gpt54.structuredOutput, true)
  assert.equal(gpt54.inputLimit, 922000)
  assert.equal(gpt54.inputLimitTokens, 922000)
  assert.deepEqual(gpt54.capabilities.inputModalities, ['text', 'image', 'pdf'])
  assert.deepEqual(gpt54.capabilities.outputModalities, ['text'])
  assert.equal(gpt54.pricing.inputUsdPer1M, 2.5)
  assert.notEqual(gpt54.supportsProviderNativeRuntime, true)
  assert.equal(gpt54.supportsAnyToolSurface, true)
  assert.ok(kimi)
  assert.equal(kimi.capabilities.toolCall.supported, false)
  assert.notEqual(kimi.supportsProviderNativeRuntime, true)
  assert.notEqual(kimi.supportsAnyToolSurface, true)
  assert.ok(deepseekChat)
  assert.equal(deepseekChat.capabilities.toolCall.supported, true)
  assert.equal(deepseekChat.supportsTools, true)
  assert.equal(deepseekChat.supportsAnyToolSurface, true)
  assert.ok(deepseekV32)
  assert.equal(deepseekV32.capabilities.toolCall.supported, true)
  assert.equal(deepseekV32.supportsTools, true)
  assert.equal(deepseekV32.supportsAnyToolSurface, true)
  assert.equal(deepseekV32.contextSource, 'verified_fallback')
  assert.ok(deepseekFlash)
  assert.equal(deepseekFlash.reasoning, true)
  assert.equal(deepseekFlash.maxOutputTokens, 393_216)
  assert.equal(deepseekFlash.vision, true)
  assert.equal(deepseekFlash.capabilities.interleavedReasoning.supported, true)
  assert.ok(grokMultiAgent)
  assert.equal(grokMultiAgent.capabilities.toolCall.supported, false)
  assert.equal(grokMultiAgent.supportsTools, false)
  assert.equal(sonar, undefined)
})

test('OpenRouter reviewed routes track the verified September 2026 catalog', () => {
  const routeIds = new Set(OPENROUTER_SUPPORTED_ROUTE_IDS)
  for (const routeId of [
    'openai/gpt-6-astra',
    'anthropic/claude-opus-5',
    'anthropic/claude-fable-5.1',
    'anthropic/claude-sonnet-5',
    'openai/gpt-5.6-sol',
    'google/gemini-3.8-flash',
    'google/gemini-3.5-flash',
    'google/gemini-3.5-flash-lite',
    'moonshotai/kimi-k3',
    'moonshotai/kimi-k2.6',
    'x-ai/grok-4.6',
    'x-ai/grok-4.5',
    'mistralai/mistral-medium-3-5',
    'deepseek/deepseek-v4.1-flash',
  ]) {
    assert.equal(routeIds.has(routeId), true, `missing current OpenRouter route ${routeId}`)
  }

  for (const routeId of [
    'google/gemini-3-pro-preview',
    'google/gemini-2.0-flash-001',
    'x-ai/grok-4',
    'x-ai/grok-4-fast',
    'x-ai/grok-4.1-fast',
    'x-ai/grok-code-fast-1',
    'x-ai/grok-3',
    'x-ai/grok-3-mini',
    'mistralai/devstral-medium-2507',
    'mistralai/devstral-small-2507',
    'deepseek/deepseek-v4-flash',
    'groq/compound-mini',
  ]) {
    assert.equal(routeIds.has(routeId), false, `retired OpenRouter route remains reviewed ${routeId}`)
  }
})

test('native provider registry rows expose provider-owned runtime support separately from generic tool calling', () => {
  const moonshot = getRegistryProvider('moonshot')
  const perplexity = getRegistryProvider('perplexity')
  const kimi = moonshot.models.find((model) => model.id === 'kimi-k2.6')
  const sonar = perplexity.models.find((model) => model.id === 'sonar-pro')

  assert.ok(kimi)
  assert.equal(kimi.supportsTools, true)
  assert.equal(kimi.supportsProviderNativeRuntime, true)
  assert.equal(kimi.supportsAnyToolSurface, true)
  assert.equal(kimi.providerNativeRuntimeFamily, 'moonshot_formula')
  assert.equal(kimi.providerNativeRuntimeMode, 'remote_tool_bundle')

  assert.ok(sonar)
  assert.equal(sonar.supportsTools, false)
  assert.equal(sonar.supportsProviderNativeRuntime, true)
  assert.equal(sonar.supportsAnyToolSurface, true)
  assert.equal(sonar.providerNativeRuntimeFamily, 'perplexity_search')
  assert.equal(sonar.providerNativeRuntimeMode, 'provider_owned_runtime')
})

test('curated registry preserves provider defaults, controls, and variants for non-openai families', () => {
  const anthropic = getRegistryProvider('anthropic')
  const gemini = getRegistryProvider('gemini')
  const grok = getRegistryProvider('grok')
  const groq = getRegistryProvider('groq')

  const claudeOpus = anthropic.models.find((model) => model.id === 'claude-opus-4-8')
  const claudeOpus5 = anthropic.models.find((model) => model.id === 'claude-opus-5')
  const claudeFable51 = anthropic.models.find((model) => model.id === 'claude-fable-5-1')
  const claude = anthropic.models.find((model) => model.id === 'claude-sonnet-5')
  const claudeHaiku = anthropic.models.find((model) => model.id === 'claude-haiku-4-5')
  const geminiPro = gemini.models.find((model) => model.id === 'gemini-2.5-pro')
  const geminiFlashLite = gemini.models.find((model) => model.id === 'gemini-3.1-flash-lite')
  const gemini38Flash = gemini.models.find((model) => model.id === 'gemini-3.8-flash')
  const gemini35FlashLite = gemini.models.find((model) => model.id === 'gemini-3.5-flash-lite')
  const grok46 = grok.models.find((model) => model.id === 'grok-4.6')
  const grokReasoning = grok.models.find((model) => model.id === 'grok-4.3')
  const groqReasoning = groq.models.find((model) => model.id === 'qwen/qwen3.6-27b')

  assert.ok(claudeOpus)
  assert.equal(claudeOpus.label, 'Claude Opus 4.8')
  assert.equal(claudeOpus.group, 'Claude 4')
  assert.equal(claudeOpus.reasoning, true)
  assert.equal(claudeOpus.contextWindowTokens, 1_000_000)
  assert.equal(claudeOpus.maxOutputTokens, 128_000)
  assert.deepEqual(claudeOpus.defaultProviderOptions, {
    anthropic: {
      thinking: { type: 'adaptive' },
      effort: 'high',
    },
  })
  assert.equal(claudeOpus.capabilities.reasoning.providerControls.includes('anthropic:effort'), true)
  assert.equal(claudeOpus.variants.some((variant) => variant.id === 'deep'), true)

  for (const model of [claudeOpus5, claudeFable51]) {
    assert.ok(model)
    assert.equal(model.contextWindowTokens, 1_000_000)
    assert.equal(model.maxOutputTokens, 128_000)
    assert.equal(model.structuredOutput, true)
    assert.deepEqual(model.capabilities.inputModalities, ['text', 'image', 'file'])
    assert.deepEqual(model.capabilities.outputModalities, ['text'])
    assert.deepEqual(
      model.variants.map((variant) => variant.providerOptions?.anthropic?.effort),
      ['low', 'medium', 'high', 'xhigh', 'max'],
    )
    assert.equal(model.variants.find((variant) => variant.providerOptions?.anthropic?.effort === 'high')?.default, true)
  }
  assert.equal(claudeOpus5.releaseDate, '2026-07-24')
  assert.equal(claudeOpus5.knowledge, '2026-05')
  assert.equal(claudeOpus5.pricing.inputUsdPer1M, 5)
  assert.equal(claudeOpus5.pricing.outputUsdPer1M, 25)
  assert.equal(claudeOpus5.pricing.cacheReadUsdPer1M, 0.5)
  assert.equal(claudeFable51.releaseDate, '2026-09-01')
  assert.equal(claudeFable51.knowledge, '2026-06')
  assert.equal(claudeFable51.pricing.inputUsdPer1M, 10)
  assert.equal(claudeFable51.pricing.outputUsdPer1M, 50)
  assert.equal(claudeFable51.pricing.cacheReadUsdPer1M, 0.25)

  assert.deepEqual(claude.defaultProviderOptions, {
    anthropic: {
      effort: 'high',
    },
  })
  assert.equal(claude.capabilities.reasoning.providerControls.includes('anthropic:thinking.type'), false)
  assert.equal(claude.capabilities.reasoning.providerControls.includes('anthropic:effort'), true)
  assert.equal(claude.variants.some((variant) => variant.id === 'deep'), true)

  assert.ok(claudeHaiku)
  assert.equal(claudeHaiku.capabilities.reasoning.providerControls.includes('anthropic:thinking.type'), true)
  assert.equal(claudeHaiku.capabilities.reasoning.providerControls.includes('anthropic:effort'), false)

  assert.deepEqual(geminiPro.defaultProviderOptions, {
    google: {
      thinkingConfig: {
        includeThoughts: true,
      },
    },
  })
  assert.equal(geminiPro.capabilities.reasoning.providerControls.includes('google:thinkingConfig.includeThoughts'), true)
  assert.equal(geminiPro.capabilities.reasoning.providerControls.includes('google:thinkingConfig.thinkingLevel'), true)
  assert.equal(geminiPro.variants.some((variant) => variant.id === 'low'), true)

  assert.deepEqual(geminiFlashLite.defaultProviderOptions, {
    google: {
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: 'minimal',
      },
    },
  })
  assert.equal(geminiFlashLite.capabilities.reasoning.providerControls.includes('google:thinkingConfig.includeThoughts'), true)
  assert.equal(geminiFlashLite.variants.some((variant) => variant.id === 'minimal'), true)

  assert.ok(gemini38Flash)
  assert.deepEqual(gemini38Flash.variants.map((variant) => variant.id), ['low', 'medium', 'high'])
  assert.equal(gemini38Flash.variants.some((variant) => variant.id === 'minimal'), false)
  assert.equal(gemini38Flash.variants.find((variant) => variant.id === 'medium')?.default, true)

  assert.ok(gemini35FlashLite)
  assert.deepEqual(gemini35FlashLite.variants.map((variant) => variant.id), ['minimal', 'low', 'medium', 'high'])
  assert.equal(gemini35FlashLite.variants.find((variant) => variant.id === 'minimal')?.default, true)

  assert.ok(grok46)
  assert.deepEqual(
    grok46.variants.map((variant) => variant.providerOptions?.xai?.reasoningEffort),
    ['low', 'medium', 'high', 'xhigh'],
  )
  assert.equal(grok46.variants.find((variant) => variant.providerOptions?.xai?.reasoningEffort === 'high')?.default, true)

  assert.deepEqual(grokReasoning.defaultProviderOptions, {
    xai: {
      reasoningEffort: 'high',
    },
  })
  assert.equal(grokReasoning.contextSource, 'verified_fallback')
  assert.equal(grokReasoning.capabilities.reasoning.providerControls.includes('xai:reasoningEffort'), true)
  assert.equal(grokReasoning.variants.some((variant) => variant.id === 'fast'), true)

  assert.deepEqual(groqReasoning.defaultProviderOptions, {
    groq: {
      reasoningEffort: 'default',
    },
  })
  assert.equal(groqReasoning.contextSource, 'provider')
  assert.equal(groqReasoning.capabilities.reasoning.providerControls.includes('groq:reasoningEffort'), true)
  assert.equal(groqReasoning.variants.some((variant) => variant.id === 'thinking'), true)
})

test('listRegistryModelsForProvider exposes the same curated rows in normal and debug views', () => {
  const curated = listRegistryModelsForProvider('openai')
  const debug = listRegistryModelsForProvider('openai', { includeDeprecated: true })

  assert.deepEqual(modelIds({ models: curated }), APPROVED_DIRECT_PROVIDER_MODELS.openai)
  assert.deepEqual(modelIds({ models: debug }), APPROVED_DIRECT_PROVIDER_MODELS.openai)
})

test('canonicalizeRegistryModelSelection keeps approved models and leaves removed ids unknown', () => {
  const approved = canonicalizeRegistryModelSelection('openai', 'gpt-5.4')
  assert.equal(approved.changed, false)
  assert.equal(approved.modelId, 'gpt-5.4')
  assert.equal(approved.reason, 'exact')

  for (const [providerId, removedModelId] of [
    ['openai', 'gpt-5.4-pro'],
    ['openai', 'gpt-5.3-codex-spark'],
    ['grok', 'grok-4-0709'],
    ['mistral', 'codestral-latest'],
    ['gemini', 'gemini-2.0-flash-001'],
  ]) {
    const removed = canonicalizeRegistryModelSelection(providerId, removedModelId)
    assert.equal(removed.changed, false)
    assert.equal(removed.modelId, removedModelId)
    assert.equal(removed.reason, 'unknown')
  }
})

test('canonicalizeRegistryModelSelection migrates superseded curated ids without losing provider selection', () => {
  for (const [providerId, legacyModelId, replacementModelId] of [
    ['anthropic', 'claude-fable-5', 'claude-fable-5-1'],
    ['deepseek', 'deepseek-v4-flash', 'deepseek-flash'],
  ]) {
    const migrated = canonicalizeRegistryModelSelection(providerId, legacyModelId)
    assert.equal(migrated.changed, true)
    assert.equal(migrated.modelId, replacementModelId)
    assert.equal(migrated.reason, 'alias')

    const alias = resolveRegistryModelAlias(providerId, legacyModelId)
    assert.ok(alias)
    assert.equal(alias.replacementModelId, replacementModelId)
    assert.equal(alias.reason, 'alias')
  }
})

test('resolveRegistryModelAlias returns exact metadata only for approved rows', () => {
  const approved = resolveRegistryModelAlias('openai', 'gpt-5.3-codex')
  assert.ok(approved)
  assert.equal(approved.reason, 'exact')
  assert.equal(approved.replacementModelId, null)

  assert.equal(resolveRegistryModelAlias('openai', 'gpt-5.3-codex-spark'), null)
})

test('buildStaticProviderManifest exposes only the approved direct-provider matrix', () => {
  const manifest = buildStaticProviderManifest()

  for (const [providerId, expectedModelIds] of Object.entries(APPROVED_DIRECT_PROVIDER_MODELS)) {
    const provider = findProvider(manifest, providerId)
    assert.ok(provider, `missing manifest provider ${providerId}`)
    assert.deepEqual(modelIds(provider), expectedModelIds)
  }

  const openai = findProvider(manifest, 'openai')
  const gpt54 = openai.models.find((m) => m.id === 'gpt-5.4')
  const gpt55 = openai.models.find((m) => m.id === 'gpt-5.5')
  assert.ok(gpt55)
  assert.equal(Number(gpt55.contextWindowTokens), 1050000)
  assert.equal(String(gpt55.contextWindowSource), 'verified_fallback')
  const registryGpt55 = getRegistryProvider('openai').models.find((m) => m.id === 'gpt-5.5')
  assert.equal(registryGpt55?.availability?.gates?.includes('openai_account'), false)
  assert.ok(gpt54)
  assert.equal(Number(gpt54.contextWindowTokens), 1050000)
  assert.equal(String(gpt54.contextWindowSource), 'verified_fallback')
  assert.equal(String(gpt54.contextWindowProvenance), 'verified_fallback')
  assert.equal(String(gpt54.contextWindowPrecision), 'verified_fallback')
  assert.equal(Array.isArray(gpt54.capabilities?.inputModalities), true)
  assert.equal(typeof gpt54.defaultProviderOptions, 'object')
  assert.equal(Array.isArray(gpt54.variants), true)

  const moonshot = findProvider(manifest, 'moonshot')
  assert.ok(moonshot)
  assert.equal(moonshot.defaultModel, 'kimi-k3')
  const kimiK3 = moonshot.models.find((row) => row.id === 'kimi-k3')
  assert.equal(kimiK3.vision, true)
  assert.equal(kimiK3.reasoning, true)
  assert.equal(kimiK3.structuredOutput, true)
  assert.equal(kimiK3.maxOutputTokens, 1_048_576)
  assert.equal(kimiK3.supportsPdf, false)
  assert.equal(kimiK3.supportsProviderNativeRuntime, false)
  assert.equal(kimiK3.supportsAnyToolSurface, true)
  assert.equal(kimiK3.providerNativeRuntimeFamily, undefined)
  assert.equal(kimiK3.providerNativeRuntimeMode, undefined)
  assert.equal(Array.isArray(kimiK3.capabilities?.inputModalities), true)

  const perplexity = findProvider(manifest, 'perplexity')
  const sonar = perplexity.models.find((row) => row.id === 'sonar-pro')
  assert.ok(sonar)
  assert.equal(sonar.supportsTools, false)
  assert.equal(sonar.supportsProviderNativeRuntime, true)
  assert.equal(sonar.supportsAnyToolSurface, true)
  assert.equal(sonar.providerNativeRuntimeFamily, 'perplexity_search')
  assert.equal(sonar.providerNativeRuntimeMode, 'provider_owned_runtime')

  const openrouter = findProvider(manifest, 'openrouter')
  assert.ok(openrouter)
  assert.equal(openrouter.defaultModel, 'openai/gpt-5.6-sol')
  assert.equal(modelIds(openrouter).includes('openai/gpt-5.4'), true)
  assert.equal(modelIds(openrouter).includes('anthropic/claude-sonnet-4.6'), true)
  assert.equal(modelIds(openrouter).includes('moonshotai/kimi-k2-turbo-preview'), false)
  const reviewed = openrouter.models.find((row) => row.id === 'openai/gpt-5.4')
  assert.equal(reviewed.contextWindowPrecision, 'verified_fallback')
})

test('buildStaticProviderManifest debug mode does not restore removed direct models', () => {
  const manifest = buildStaticProviderManifest({ includeDeprecatedModels: true })

  for (const [providerId, expectedModelIds] of Object.entries(APPROVED_DIRECT_PROVIDER_MODELS)) {
    assert.deepEqual(modelIds(findProvider(manifest, providerId)), expectedModelIds)
  }
})
