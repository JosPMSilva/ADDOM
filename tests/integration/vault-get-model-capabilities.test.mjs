import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

import { __testVaultHandlerInternals } from '../../src/main/ipc-handlers/vault-handler-helpers.mjs'
import {
  __resetDynamicModelCache,
  __testApplyDynamicRemoteModels,
} from '../../src/main/api-clients/ai-provider-capability-probes.mjs'
import { normalizeOpenRouterLiveModelRow } from '../../src/common/api-clients/openrouter-live-models.mjs'

const ORIGINAL_ADDOM_USER_DATA_PATH = process.env.ADDOM_USER_DATA_PATH
process.env.ADDOM_USER_DATA_PATH ||= path.join(os.tmpdir(), 'addom-test-user-data')

test.after(() => {
  if (ORIGINAL_ADDOM_USER_DATA_PATH === undefined) {
    delete process.env.ADDOM_USER_DATA_PATH
  } else {
    process.env.ADDOM_USER_DATA_PATH = ORIGINAL_ADDOM_USER_DATA_PATH
  }
})

test.beforeEach(() => {
  __resetDynamicModelCache()
})

test('vault:getModelCapabilities returns the explicit unknown fallback for missing provider/model input', async () => {
  const before = Date.now()
  const result = await __testVaultHandlerInternals.resolveVaultGetModelCapabilitiesResponse({
    providerId: ' OpenAI ',
    modelId: '',
  })
  const after = Date.now()

  assert.equal(result.providerId, 'openai')
  assert.equal(result.modelId, '')
  assert.equal(result.supportsTools, false)
  assert.equal(result.supportsAnyToolSurface, false)
  assert.equal(result.toolSupportMode, 'unknown')
  assert.equal(result.toolSurfaceMode, 'unknown')
  assert.equal(result.supportsReasoning, false)
  assert.equal(result.source, 'unknown')
  assert.ok(Number.isFinite(result.checkedAt))
  assert.ok(result.checkedAt >= before && result.checkedAt <= after)
  assert.match(String(result.note || ''), /missing provider\/model/i)
})

test('vault:getModelCapabilities resolves through injected deps with normalized payload values', async () => {
  const calls = []
  const result = await __testVaultHandlerInternals.resolveVaultGetModelCapabilitiesResponse({
    providerId: ' OpenAI ',
    modelId: ' gpt-5 ',
    forceRefresh: 1,
  }, {
    getSettings() {
      return {
        providerAuthSettings: {
          openai: {
            authMethod: 'api_key',
          },
        },
      }
    },
    getKey(provider) {
      calls.push({ kind: 'getKey', provider })
      return 'secret-key'
    },
    resolveModelCapabilities(provider, apiKey, model, options) {
      calls.push({
        kind: 'resolve',
        provider,
        apiKey,
        model,
        options,
      })
      return {
        ok: true,
        providerId: provider,
        modelId: model,
        supportsTools: true,
        supportsReasoning: true,
        source: 'test_probe',
        checkedAt: 123,
      }
    },
  })

  assert.deepEqual(calls, [
    { kind: 'getKey', provider: 'OpenAI' },
    {
      kind: 'resolve',
      provider: 'OpenAI',
      apiKey: 'secret-key',
      model: 'gpt-5',
      options: { authMethod: 'api_key', forceRefresh: true },
    },
  ])
  assert.equal(result.source, 'test_probe')
  assert.equal(result.providerId, 'OpenAI')
  assert.equal(result.modelId, 'gpt-5')
})

test('vault:getModelCapabilities coerces missing vault keys to an empty string', async () => {
  let receivedApiKey = 'not-set'
  await __testVaultHandlerInternals.resolveVaultGetModelCapabilitiesResponse({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
  }, {
    getKey() {
      return undefined
    },
    resolveModelCapabilities(_provider, apiKey) {
      receivedApiKey = apiKey
      return {
        providerId: 'anthropic',
        modelId: 'claude-sonnet-5',
        supportsTools: true,
        supportsReasoning: true,
        source: 'test_probe',
        checkedAt: Date.now(),
      }
    },
  })

  assert.equal(receivedApiKey, '')
})

test('vault:getModelCapabilities surfaces Moonshot reasoning defaults from the curated registry', async () => {
  const result = await __testVaultHandlerInternals.resolveVaultGetModelCapabilitiesResponse({
    providerId: 'moonshot',
    modelId: 'kimi-k2.6',
    forceRefresh: true,
  })

  assert.equal(result.providerId, 'moonshot')
  assert.equal(result.modelId, 'kimi-k2.6')
  assert.equal(result.supportsTools, true)
  assert.equal(result.supportsAnyToolSurface, true)
  assert.equal(result.supportsReasoning, true)
  assert.equal(result.supportsVision, true)
  assert.equal(result.supportsPdf, false)
  assert.equal(result.source, 'merged_catalog')
})

test('vault:getModelCapabilities surfaces reviewed openrouter route capabilities from the curated registry', async () => {
  const result = await __testVaultHandlerInternals.resolveVaultGetModelCapabilitiesResponse({
    providerId: 'openrouter',
    modelId: 'openai/gpt-5.4',
    forceRefresh: true,
  })

  assert.equal(result.providerId, 'openrouter')
  assert.equal(result.modelId, 'openai/gpt-5.4')
  assert.equal(result.supportsTools, true)
  assert.equal(result.supportsAnyToolSurface, true)
  assert.equal(result.supportsReasoning, true)
  assert.equal(result.supportsVision, true)
  assert.equal(result.supportsPdf, true)
  assert.equal(result.source, 'merged_catalog')
  assert.equal(result.fieldProvenance.tools.source, 'addom_openrouter_reviewed_route')
})

test('vault:getModelCapabilities keeps provider-owned runtime routes distinguishable from generic no-tools models', async () => {
  const result = await __testVaultHandlerInternals.resolveVaultGetModelCapabilitiesResponse({
    providerId: 'perplexity',
    modelId: 'sonar-pro',
    forceRefresh: true,
  })

  assert.equal(result.providerId, 'perplexity')
  assert.equal(result.modelId, 'sonar-pro')
  assert.equal(result.supportsTools, false)
  assert.equal(result.supportsAnyToolSurface, true)
  assert.equal(result.toolSupportMode, 'provider_owned_runtime_only')
  assert.equal(result.toolSurfaceMode, 'provider_owned_runtime')
  assert.equal(result.providerNativeRuntimeMode, 'provider_owned_runtime')
})

test('vault:getModelCapabilities uses cached openrouter live metadata for dynamic-only routes across key scopes', async () => {
  await __testApplyDynamicRemoteModels({
    id: 'openrouter',
    models: [],
  }, {
    fetcher: async () => [
      normalizeOpenRouterLiveModelRow({
        id: 'vendor/live-only-route',
        supported_parameters: ['tools', 'tool_choice'],
      }),
    ],
  })

  const result = await __testVaultHandlerInternals.resolveVaultGetModelCapabilitiesResponse({
    providerId: 'openrouter',
    modelId: 'vendor/live-only-route',
    forceRefresh: true,
  }, {
    getKey() {
      return 'sk-or-v1-live'
    },
  })

  assert.equal(result.providerId, 'openrouter')
  assert.equal(result.modelId, 'vendor/live-only-route')
  assert.equal(result.source, 'openrouter_live')
  assert.equal(result.supportsTools, true)
  assert.equal(result.supportsAnyToolSurface, true)
  assert.equal(result.supportsReasoning, false)
  assert.equal(result.supportsVision, false)
  assert.equal(result.supportsPdf, false)
  assert.equal(result.fieldProvenance.tools.source, 'openrouter_live')
  assert.equal(result.fieldProvenance.tools.reason, 'inferred_from_openrouter_supported_parameters')
})

test('vault:getProviderModels delegates through injected deps and returns arrays only', async () => {
  const calls = []
  const result = await __testVaultHandlerInternals.resolveVaultGetProviderModelsResponse({
    providerId: ' openrouter ',
    forceRefresh: 1,
  }, {
    async getProviderModels(options) {
      calls.push(options)
      return [{ id: 'openai/gpt-5.4' }]
    },
  })

  assert.deepEqual(calls, [{
    providerId: 'openrouter',
    forceRefresh: true,
  }])
  assert.deepEqual(result, [{ id: 'openai/gpt-5.4' }])
})

test('vault:getProviderModels returns an empty array for missing provider id', async () => {
  let called = false
  const result = await __testVaultHandlerInternals.resolveVaultGetProviderModelsResponse({
    providerId: '   ',
  }, {
    async getProviderModels() {
      called = true
      return [{ id: 'should-not-run' }]
    },
  })

  assert.equal(called, false)
  assert.deepEqual(result, [])
})
