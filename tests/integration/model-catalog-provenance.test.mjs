import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildOpenRouterRouteFieldProvenance,
  buildGeneratedModelFieldProvenance,
  buildGeneratedProviderFieldProvenance,
  getModelCatalogFieldPolicy,
  listModelCatalogFieldPolicies,
  resolveGeneratedFieldProvenance,
} from '../../src/common/api-clients/model-catalog-provenance.mjs'

test('model catalog provenance policies expose the expected high-impact field set', () => {
  const policies = listModelCatalogFieldPolicies()
  const fieldPaths = policies.map((policy) => policy.fieldPath)

  assert.deepEqual(fieldPaths, [
    'provider.defaultModel',
    'model.pricing',
    'model.limits',
    'model.capabilities.reasoning',
    'model.capabilities.toolCall',
    'model.capabilities.attachment',
    'model.availability',
  ])
})

test('default model policy requires an ADDOM override and is not treated as generated truth', () => {
  const policy = getModelCatalogFieldPolicy('provider.defaultModel')
  const resolved = resolveGeneratedFieldProvenance('provider.defaultModel', 'gpt-5.4')

  assert.ok(policy)
  assert.equal(policy.owner, 'addom')
  assert.equal(policy.requiresOverride, true)
  assert.equal(resolved.state, 'placeholder')
  assert.equal(resolved.trustLevel, 'unknown')
  assert.equal(resolved.reason, 'curated_default_model_required')
})

test('pricing, limits, and capability fields are accepted as estimated generated input', () => {
  const pricing = resolveGeneratedFieldProvenance('model.pricing', { inputUsdPer1M: 1.25, outputUsdPer1M: 10 })
  const limits = resolveGeneratedFieldProvenance('model.limits', { context: 1048576, output: 65536 })
  const toolCall = resolveGeneratedFieldProvenance('model.capabilities.toolCall', { supported: true })

  assert.equal(pricing.state, 'generated')
  assert.equal(pricing.trustLevel, 'estimated')
  assert.equal(pricing.requiresOverride, false)

  assert.equal(limits.state, 'generated')
  assert.equal(limits.trustLevel, 'estimated')

  assert.equal(toolCall.state, 'generated')
  assert.equal(toolCall.trustLevel, 'estimated')
})

test('availability remains a local-resolution placeholder even when generated data exists', () => {
  const availability = resolveGeneratedFieldProvenance('model.availability', { status: 'unknown' })

  assert.equal(availability.state, 'placeholder')
  assert.equal(availability.trustLevel, 'unknown')
  assert.equal(availability.requiresOverride, true)
  assert.equal(availability.reason, 'availability_must_be_resolved_locally')
})

test('generated provenance reports summarize provider and model high-impact fields', () => {
  const providerFields = buildGeneratedProviderFieldProvenance({
    defaultModel: 'gemini-2.5-pro',
  })
  const modelFields = buildGeneratedModelFieldProvenance({
    pricing: { inputUsdPer1M: 1.25, outputUsdPer1M: 10 },
    limits: { context: 1048576, output: 65536 },
    capabilities: {
      reasoning: { supported: true },
      toolCall: { supported: true },
      attachment: { supported: true, kinds: ['image', 'file'] },
    },
    availability: { status: 'unknown' },
  })

  assert.equal(providerFields.defaultModel.requiresOverride, true)
  assert.equal(modelFields.pricing.trustLevel, 'estimated')
  assert.equal(modelFields.limits.trustLevel, 'estimated')
  assert.equal(modelFields.reasoning.trustLevel, 'estimated')
  assert.equal(modelFields.toolCall.trustLevel, 'estimated')
  assert.equal(modelFields.attachment.trustLevel, 'estimated')
  assert.equal(modelFields.availability.requiresOverride, true)
})

test('openrouter route field provenance prefers reviewed, then catalog, then live evidence', () => {
  const reviewed = buildOpenRouterRouteFieldProvenance({
    reviewedEntry: {
      routeId: 'openai/gpt-5.4',
    },
    catalogModel: {
      id: 'gpt-5.4',
      provenance: {
        source: 'models.dev',
        trustLevel: 'estimated',
        fields: {
          limits: {
            trustLevel: 'estimated',
          },
          pricing: {
            trustLevel: 'estimated',
          },
        },
      },
      pricing: {
        inputUsdPer1M: 1.25,
      },
      limits: {
        context: 200000,
      },
    },
    liveModel: {
      openrouterCapabilityProvenance: {
        tools: 'estimated_openrouter_supported_parameters',
      },
      openrouterLive: {
        contextLength: 200000,
        pricing: {
          prompt: 2,
        },
      },
    },
  })

  const estimated = buildOpenRouterRouteFieldProvenance({
    liveModel: {
      openrouterCapabilityProvenance: {
        tools: 'estimated_openrouter_supported_parameters',
        vision: 'estimated_openrouter_architecture',
        limits: 'openrouter_live',
      },
      openrouterLive: {
        contextLength: 64000,
      },
    },
  })

  assert.equal(reviewed.tools.source, 'addom_openrouter_reviewed_route')
  assert.equal(reviewed.tools.trustLevel, 'verified')
  assert.equal(reviewed.limits.source, 'models.dev')
  assert.equal(reviewed.pricing.source, 'models.dev')

  assert.equal(estimated.tools.source, 'openrouter_live')
  assert.equal(estimated.tools.reason, 'inferred_from_openrouter_supported_parameters')
  assert.equal(estimated.vision.reason, 'inferred_from_openrouter_architecture')
  assert.equal(estimated.limits.reason, 'from_openrouter_live_payload')
  assert.equal(estimated.pricing.source, 'unknown')
})
