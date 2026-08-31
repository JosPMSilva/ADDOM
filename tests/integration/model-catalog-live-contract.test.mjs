import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getGeneratedModelCatalogModelLookup,
  getGeneratedModelCatalogModelProvenance,
  getGeneratedModelCatalogProviderLookup,
  getGeneratedModelCatalogProviderProvenance,
  getMergedModelCatalogSnapshot,
  getModelCatalogProvider,
  getModelCatalogProviderLogo,
  listModelCatalogProviders,
} from '../../src/common/api-clients/model-catalog.mjs'

test('real merged model catalog keeps curated defaults for remote providers', () => {
  const openai = getModelCatalogProvider('openai')
  const anthropic = getModelCatalogProvider('anthropic')
  const gemini = getModelCatalogProvider('google')
  const openrouter = getModelCatalogProvider('openrouter')

  assert.ok(openai)
  assert.equal(openai.defaultModel, 'gpt-5.6-sol')
  assert.ok(anthropic)
  assert.equal(anthropic.defaultModel, 'claude-sonnet-5')
  assert.ok(gemini)
  assert.equal(gemini.defaultModel, 'gemini-3.5-flash')
  assert.ok(openrouter)
  assert.equal(openrouter.defaultModel, 'openai/gpt-5.6-sol')
})

test('real merged model catalog keeps local providers in the provider list', () => {
  const providers = listModelCatalogProviders()
  const providerIds = providers.map((provider) => provider.providerId)
  const ollama = getModelCatalogProvider('ollama')
  const lmstudio = getModelCatalogProvider('lmstudio')

  assert.equal(providerIds.includes('ollama'), true)
  assert.equal(providerIds.includes('lmstudio'), true)
  assert.ok(ollama)
  assert.equal(ollama.noKeyRequired, true)
  assert.equal(ollama.availability.requiresKey, false)
  assert.ok(lmstudio)
  assert.equal(lmstudio.noKeyRequired, true)
  assert.equal(lmstudio.availability.requiresKey, false)
  assert.ok(getMergedModelCatalogSnapshot().length >= 10)
})

test('real generated catalog artifacts resolve provider/model lookup, logo, and provenance entries', () => {
  const openaiLookup = getGeneratedModelCatalogProviderLookup('openai')
  const geminiAliasLookup = getGeneratedModelCatalogProviderLookup('google')
  const openaiLogo = getModelCatalogProviderLogo('openai')
  const geminiLogo = getModelCatalogProviderLogo('google')
  const openaiProvenance = getGeneratedModelCatalogProviderProvenance('openai')
  const gpt54Lookup = getGeneratedModelCatalogModelLookup('openai', 'gpt-5.4')
  const gpt54Provenance = getGeneratedModelCatalogModelProvenance('openai', 'gpt-5.4')

  assert.equal(openaiLookup?.sourceFile, 'providers/openai/provider.toml')
  assert.equal(geminiAliasLookup?.sourceFile, 'providers/google/provider.toml')
  assert.equal(openaiLogo?.path, 'provider-logos/openai.svg')
  assert.equal(geminiLogo?.path, 'provider-logos/gemini.svg')
  assert.equal(openaiProvenance?.source, 'models.dev')
  assert.equal(openaiProvenance?.sourceFile, 'providers/openai/provider.toml')
  assert.equal(gpt54Lookup?.sourceFile, 'providers/openai/models/gpt-5.4.toml')
  assert.equal(gpt54Provenance?.source, 'models.dev')
  assert.equal(gpt54Provenance?.sourceFile, 'providers/openai/models/gpt-5.4.toml')
})
