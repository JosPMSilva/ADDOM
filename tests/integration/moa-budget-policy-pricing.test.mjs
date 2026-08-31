import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveRegistryPricingProfiles,
  resolveEffectivePricingProfiles,
} from '../../src/main/moa/moa-budget-policy.mjs'

function findProfile(list, providerId, model) {
  return (Array.isArray(list) ? list : []).find((row) => (
    String(row?.providerId || '').toLowerCase() === String(providerId).toLowerCase()
    && String(row?.model || '').toLowerCase() === String(model).toLowerCase()
  )) || null
}

test('deriveRegistryPricingProfiles seeds curated pricing rows from canonical model registry', () => {
  const profiles = deriveRegistryPricingProfiles()
  assert.ok(Array.isArray(profiles))
  assert.ok(profiles.length > 10)

  const gpt54 = findProfile(profiles, 'openai', 'gpt-5.4')
  assert.ok(gpt54)
  assert.ok(Number(gpt54.inputUsdPer1kTokens) > 0)
  assert.ok(Number(gpt54.outputUsdPer1kTokens) > 0)
})

test('resolveEffectivePricingProfiles merges user overrides for exact curated models', () => {
  const merged = resolveEffectivePricingProfiles([
    {
      providerId: 'grok',
      model: 'grok-4.3',
      inputUsdPer1kTokens: 9,
      outputUsdPer1kTokens: 19,
      reasoningUsdPer1kTokens: 0,
    },
  ])

  const canonical = findProfile(merged, 'grok', 'grok-4.3')
  assert.ok(canonical)
  assert.equal(canonical.inputUsdPer1kTokens, 9)
  assert.equal(canonical.outputUsdPer1kTokens, 19)
})

