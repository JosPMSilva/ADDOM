import test from 'node:test'
import assert from 'node:assert/strict'

import {
  listPreReleaseModelCatalogResetRules,
  resolvePreReleaseModelCatalogReset,
} from '../../src/common/api-clients/model-catalog-reset-rules.mjs'

test('pre-release model catalog reset rules explicitly prefer reset over legacy migration', () => {
  const rules = listPreReleaseModelCatalogResetRules()
  const ruleIds = rules.map((rule) => rule.id)

  assert.deepEqual(ruleIds, [
    'canonicalize_known_alias_or_replacement',
    'clear_unknown_or_removed_selection',
    'keep_exact_curated_selection',
  ])
  assert.match(rules[1].notes, /clear/i)
})

test('removed aliases are cleared instead of silently remapped', () => {
  const result = resolvePreReleaseModelCatalogReset({
    providerId: 'openai',
    modelId: 'codex-mini-latest',
  })

  assert.equal(result.action, 'clear_selection')
  assert.equal(result.reason, 'unknown_model')
  assert.equal(result.nextProviderId, '')
  assert.equal(result.nextModelId, '')
  assert.deepEqual(result.invalidate, [
    'provider_manifest',
    'dynamic_remote_models',
    'model_capabilities',
    'chat_model_selection',
    'project_model_selection',
    'session_model_selection',
    'memory_model_selection',
  ])
})

test('unknown or removed selections are cleared instead of migrated', () => {
  const unknownProvider = resolvePreReleaseModelCatalogReset({
    providerId: 'not-real',
    modelId: 'whatever',
  })
  const unknownModel = resolvePreReleaseModelCatalogReset({
    providerId: 'openai',
    modelId: 'definitely-not-a-real-model',
  })

  assert.equal(unknownProvider.action, 'clear_selection')
  assert.equal(unknownProvider.reason, 'unknown_provider')
  assert.equal(unknownProvider.nextProviderId, '')
  assert.equal(unknownProvider.nextModelId, '')

  assert.equal(unknownModel.action, 'clear_selection')
  assert.equal(unknownModel.reason, 'unknown_model')
  assert.deepEqual(unknownModel.invalidate, [
    'provider_manifest',
    'dynamic_remote_models',
    'model_capabilities',
    'chat_model_selection',
    'project_model_selection',
    'session_model_selection',
    'memory_model_selection',
  ])
})

test('exact curated selections are left untouched', () => {
  const result = resolvePreReleaseModelCatalogReset({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
  })

  assert.equal(result.action, 'keep_selection')
  assert.equal(result.reason, 'exact')
  assert.equal(result.nextProviderId, 'gemini')
  assert.equal(result.nextModelId, 'gemini-2.5-pro')
  assert.deepEqual(result.invalidate, [])
})
