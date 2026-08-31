import test from 'node:test'
import assert from 'node:assert/strict'

import { getRegistryProvider } from '../../src/common/api-clients/model-registry.mjs'
import {
  __testApplyDynamicRemoteModels,
  __resetDynamicModelCache,
  resolveProviderCapabilities,
} from '../../src/main/api-clients/ai-provider-capability-probes.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import {
  getChatStreamPrereqError,
  getChatStreamPrereqFailure,
} from '../../src/main/chat/chat-stream-guards.mjs'
import { normalizeOpenRouterLiveModelRow } from '../../src/common/api-clients/openrouter-live-models.mjs'

function findModel(provider = null, modelId = '') {
  return (provider?.models || []).find((model) => model.id === modelId) || null
}

test('capability and availability matrix keeps registry provenance separate from adapter support claims', async () => {
  __resetDynamicModelCache()

  const provider = getRegistryProvider('openai')
  const model = findModel(provider, 'gpt-5.4')
  const capabilities = await resolveProviderCapabilities({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    forceRefresh: true,
  })
  const adapter = resolveProviderModelAdapter('openai', 'gpt-5.4', {
    apiKeyConfigured: true,
  })

  assert.equal(provider?.availability?.status, 'unknown')
  assert.deepEqual(provider?.availability?.gates, ['upstream:openai'])
  assert.equal(model?.availability?.status, 'unknown')
  assert.deepEqual(model?.availability?.gates, ['upstream:openai'])

  assert.equal(capabilities.source, 'merged_catalog')
  assert.equal(capabilities.supportsTools, true)
  assert.equal(capabilities.supportsAnyToolSurface, true)
  assert.equal(capabilities.supportsVision, true)
  assert.equal(capabilities.toolSupportMode, 'openai_hosted')
  assert.equal(capabilities.toolSurfaceMode, 'openai_hosted')

  assert.equal(adapter.adapterSelection, 'curated')
  assert.equal(adapter.availability.status, 'unknown')
  assert.equal(adapter.availability.verified, true)
  assert.equal(adapter.availability.selectionState, 'curated')
  assert.equal(adapter.availability.configured, true)
  assert.equal(adapter.availabilityFamily, 'curated_unknown')
  assert.deepEqual(adapter.availability.gates, ['upstream:openai'])
})

test('capability and availability matrix distinguishes curated configured and unconfigured states', () => {
  const configured = resolveProviderModelAdapter('gemini', 'gemini-2.5-pro', {
    apiKeyConfigured: true,
  })
  const unconfigured = resolveProviderModelAdapter('gemini', 'gemini-2.5-pro', {
    apiKeyConfigured: false,
  })

  assert.equal(configured.adapterSelection, 'curated')
  assert.equal(configured.availability.status, 'unknown')
  assert.equal(configured.availability.verified, true)
  assert.equal(configured.availability.configured, true)
  assert.equal(configured.availabilityFamily, 'curated_unknown')
  assert.deepEqual(configured.availability.gates, ['upstream:google'])

  assert.equal(unconfigured.adapterSelection, 'curated')
  assert.equal(unconfigured.availability.status, 'unknown')
  assert.equal(unconfigured.availability.verified, true)
  assert.equal(unconfigured.availability.configured, false)
  assert.equal(unconfigured.availabilityFamily, 'curated_unknown')
  assert.deepEqual(unconfigured.availability.gates, ['upstream:google'])

  assert.equal(getChatStreamPrereqError({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: '',
    isLocal: false,
    adapterProfile: unconfigured,
  }), 'No API key for gemini. Add it in Settings.')
  assert.equal(getChatStreamPrereqFailure({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: '',
    isLocal: false,
    adapterProfile: unconfigured,
  })?.canonicalErrorClass, 'missing_prerequisite')
})

test('capability and availability matrix distinguishes merged-catalog truth from unknown and unsupported states', async () => {
  __resetDynamicModelCache()

  const unknownCapabilities = await resolveProviderCapabilities({
    providerId: 'openai',
    modelId: 'unknown-model-xyz',
    forceRefresh: true,
  })
  const unsupportedAdapter = resolveProviderModelAdapter('openai', 'unknown-model-xyz', {
    apiKeyConfigured: true,
  })

  assert.equal(unknownCapabilities.source, 'unknown')
  assert.equal(unknownCapabilities.supportsTools, false)
  assert.equal(unknownCapabilities.supportsAnyToolSurface, false)
  assert.equal(unknownCapabilities.toolSupportMode, 'unknown')
  assert.equal(unknownCapabilities.supportsReasoning, false)
  assert.equal(unknownCapabilities.supportsVision, false)

  assert.equal(unsupportedAdapter.adapterSelection, 'generic')
  assert.equal(unsupportedAdapter.adapterReason, 'unknown_or_non_curated')
  assert.equal(unsupportedAdapter.availability.status, 'unknown')
  assert.equal(unsupportedAdapter.availability.selectionState, 'generic')
  assert.equal(unsupportedAdapter.availabilityFamily, 'generic_unknown')
  assert.deepEqual(unsupportedAdapter.availability.gates, ['upstream:openai'])

  assert.equal(getChatStreamPrereqError({
    providerId: 'openai',
    modelId: 'unknown-model-xyz',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'sk-test',
    isLocal: false,
    adapterProfile: unsupportedAdapter,
  }), '')
})

test('capability and availability matrix lets auth-blocked account mode override API-key-only prereq messaging', () => {
  const adapter = resolveProviderModelAdapter('openai', 'gpt-5.4', {
    apiKeyConfigured: false,
  })

  const input = {
    providerId: 'openai',
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: '',
    isLocal: false,
    authMethod: 'account',
    authBlockedReason: 'bridge_unavailable',
    authBlockedMessage: 'OpenAI authentication is currently unavailable. Retry or reconnect in Settings.',
    authBlockedClass: 'provider_transport_error',
    authDiagnosticMessage: 'OpenAI account auth is unavailable because the local account bridge is not ready.',
    adapterProfile: adapter,
  }

  const failure = getChatStreamPrereqFailure(input)
  assert.equal(getChatStreamPrereqError(input), 'OpenAI authentication is currently unavailable. Retry or reconnect in Settings.')
  assert.equal(failure?.errorClass, 'provider_transport_error')
  assert.equal(failure?.canonicalErrorClass, 'provider_transport_error')
  assert.equal(failure?.diagnosticReason, 'bridge_unavailable')
  assert.match(String(failure?.diagnosticMessage || ''), /bridge is not ready/i)
})

test('capability and availability matrix exposes auth-aware OpenAI account runtime support separately from API-key support without drifting the canonical delegation default', async () => {
  __resetDynamicModelCache()

  const capabilities = await resolveProviderCapabilities({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    authMethod: 'account',
    forceRefresh: true,
  })
  const adapter = resolveProviderModelAdapter('openai', 'gpt-5.4', {
    authMethod: 'account',
    apiKeyConfigured: true,
  })

  assert.equal(capabilities.authMethod, 'account')
  assert.equal(capabilities.supportsChatToolSurface, true)
  assert.equal(capabilities.supportsDelegatedToolSurface, true)
  assert.equal(capabilities.supportsCollabAgentActivities, true)
  assert.equal(capabilities.supportsAddomMoaDelegation, true)
  assert.deepEqual(capabilities.delegationBackends, ['openai_native', 'addom_moa'])
  assert.equal(capabilities.preferredDelegationBackend, 'addom_moa')
  assert.equal(capabilities.toolSupportMode, 'provider_owned_runtime')
  assert.equal(capabilities.toolSurfaceMode, 'provider_owned_runtime')
  assert.equal(capabilities.providerNativeRuntimeFamily, 'openai_codex_app_server')
  assert.equal(capabilities.providerNativeRuntimeMode, 'provider_owned_runtime')
  assert.equal(capabilities.allowProviderNativeTools, true)
  assert.equal(capabilities.accountRuntimeStatus, 'parity')
  assert.equal(Array.isArray(capabilities.accountCapabilityExceptions), true)
  assert.equal(capabilities.accountCapabilityExceptions.length, 0)
  assert.equal(capabilities.accountCapabilityContract?.capabilities?.approvals?.status, 'parity')
  assert.equal(capabilities.accountCapabilityContract?.capabilities?.compaction?.status, 'parity')
  assert.equal(capabilities.accountCapabilityContract?.capabilities?.question_user?.status, 'parity')
  assert.equal(adapter.openaiRuntimeSupport?.authMethod, 'account')
  assert.equal(adapter.openaiRuntimeSupport?.supportsChatToolSurface, true)
  assert.equal(adapter.openaiRuntimeSupport?.supportsDelegatedToolSurface, true)
  assert.equal(adapter.openaiRuntimeSupport?.supportsCollabAgentActivities, true)
  assert.equal(adapter.openaiRuntimeSupport?.supportsAddomMoaDelegation, true)
  assert.deepEqual(adapter.openaiRuntimeSupport?.delegationBackends, ['openai_native', 'addom_moa'])
  assert.equal(adapter.openaiRuntimeSupport?.preferredDelegationBackend, 'addom_moa')
  assert.equal(adapter.openaiRuntimeSupport?.hostedToolSupport?.web_search, true)
  assert.equal(adapter.openaiRuntimeSupport?.providerNativeRuntimeFamily, 'openai_codex_app_server')
  assert.equal(adapter.openaiRuntimeSupport?.providerNativeRuntimeMode, 'provider_owned_runtime')
})

test('capability and availability matrix keeps provider-owned runtime models distinct from generic tool absence', async () => {
  __resetDynamicModelCache()

  const capabilities = await resolveProviderCapabilities({
    providerId: 'perplexity',
    modelId: 'sonar-pro',
    forceRefresh: true,
  })

  assert.equal(capabilities.source, 'merged_catalog')
  assert.equal(capabilities.supportsTools, false)
  assert.equal(capabilities.supportsAnyToolSurface, true)
  assert.equal(capabilities.toolSupportMode, 'provider_owned_runtime_only')
  assert.equal(capabilities.toolSurfaceMode, 'provider_owned_runtime')
  assert.equal(capabilities.providerNativeRuntimeMode, 'provider_owned_runtime')
  assert.equal(capabilities.providerNativeRuntimeFamily, 'perplexity_search')
})

test('capability and availability matrix uses enriched openrouter live metadata for dynamic-only routes', async () => {
  __resetDynamicModelCache()

  await __testApplyDynamicRemoteModels({
    id: 'openrouter',
    models: [],
  }, {
    fetcher: async () => [
      normalizeOpenRouterLiveModelRow({
        id: 'vendor/live-only-route',
        supported_parameters: ['tools', 'tool_choice', 'reasoning'],
        architecture: {
          input_modalities: ['text', 'image'],
        },
      }),
    ],
  })

  const capabilities = await resolveProviderCapabilities({
    providerId: 'openrouter',
    modelId: 'vendor/live-only-route',
    apiKey: 'sk-or-v1-test',
    forceRefresh: true,
  })

  assert.equal(capabilities.source, 'openrouter_live')
  assert.equal(capabilities.supportsTools, true)
  assert.equal(capabilities.supportsAnyToolSurface, true)
  assert.equal(capabilities.supportsReasoning, true)
  assert.equal(capabilities.supportsVision, true)
  assert.equal(capabilities.supportsPdf, false)
  assert.equal(capabilities.toolSupportMode, 'local_tool_calls')
  assert.equal(capabilities.toolSurfaceMode, 'addom_native')
  assert.match(String(capabilities.note || ''), /live OpenRouter route metadata/i)
  assert.equal(capabilities.fieldProvenance.tools.source, 'openrouter_live')
  assert.equal(capabilities.fieldProvenance.reasoning.reason, 'inferred_from_openrouter_supported_parameters')
  assert.equal(capabilities.fieldProvenance.vision.reason, 'inferred_from_openrouter_architecture')
})
