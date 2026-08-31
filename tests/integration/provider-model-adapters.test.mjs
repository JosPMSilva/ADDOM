import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeAdapterAvailabilityStatus,
  resolveAdapterToolSurfaceMode,
  resolveAdapterToolSurfaceKind,
  resolveProviderModelAdapter,
} from '../../src/main/api-clients/provider-model-adapters.mjs'
import {
  resolveAttachmentSupportFamily,
} from '../../src/common/attachments/attachment-support-policy.mjs'

test('provider model adapter resolves curated OpenAI families and dated snapshots centrally', () => {
  const curated = resolveProviderModelAdapter('openai', 'gpt-5.4')
  const snapshot = resolveProviderModelAdapter('openai', 'gpt-5.4-2026-03-05')
  const accountOnly = resolveProviderModelAdapter('openai', 'gpt-5.5', { authMethod: 'account' })

  assert.equal(curated.adapterSelection, 'curated')
  assert.equal(curated.adapterReason, 'registry_exact')
  assert.equal(curated.adapterModelId, 'gpt-5.4')
  assert.equal(curated.transportFamily, 'openai_responses')
  assert.equal(curated.capabilityFamily, 'openai_curated')
  assert.equal(curated.optionFamily, 'openai_responses')
  assert.equal(curated.attachmentFamily, 'image_and_file_input')
  assert.equal(curated.toolFamily, 'openai_hosted')
  assert.equal(curated.providerNativeRuntime.family, 'none')
  assert.equal(curated.providerNativeRuntime.supported, false)
  assert.equal(curated.availability.status, 'unknown')
  assert.equal(curated.availability.verified, true)
  assert.equal(curated.availabilityFamily, 'curated_unknown')
  assert.equal(curated.availability.selectionState, 'curated')
  assert.equal(curated.availability.requiresKey, true)
  assert.equal(curated.availability.configured, null)
  assert.equal(curated.attachment.supported, true)
  assert.equal(curated.attachment.supportsVision, true)
  assert.equal(curated.attachment.supportsPdf, true)
  assert.deepEqual(curated.attachment.inputModalities, ['text', 'image', 'pdf', 'file'])
  assert.equal(curated.provenanceSummary.source, 'models.dev')
  assert.equal(curated.provenanceSummary.modelTrustLevel, 'estimated')
  assert.equal(curated.promptPolicy.assistantPhase, 'recommended')

  assert.equal(snapshot.adapterSelection, 'curated')
  assert.equal(snapshot.adapterReason, 'registry_snapshot')
  assert.equal(snapshot.adapterModelId, 'gpt-5.4')
  assert.equal(snapshot.openaiRuntimeSupport?.supportsBackgroundMode, true)
  assert.equal(accountOnly.adapterSelection, 'curated')
  assert.equal(accountOnly.adapterModelId, 'gpt-5.5')
  assert.equal(accountOnly.openaiRuntimeSupport?.authMethod, 'account')
  assert.equal(accountOnly.openaiRuntimeSupport?.accountRuntimeStatus, 'parity')
})

test('provider model adapter routes unknown OpenAI models through the conservative generic profile', () => {
  const generic = resolveProviderModelAdapter('openai', 'gpt-5-unknown-lab-build')

  assert.equal(generic.adapterSelection, 'generic')
  assert.equal(generic.adapterReason, 'unknown_or_non_curated')
  assert.equal(generic.transportFamily, 'openai_responses')
  assert.equal(generic.capabilityFamily, 'generic_unknown')
  assert.equal(generic.optionFamily, 'openai_responses')
  assert.equal(generic.attachmentFamily, 'unknown')
  assert.equal(generic.toolFamily, 'generic_addom_native')
  assert.equal(generic.providerNativeRuntime.family, 'none')
  assert.equal(generic.providerNativeRuntime.supported, false)
  assert.equal(generic.availability.status, 'unknown')
  assert.equal(generic.availabilityFamily, 'generic_unknown')
  assert.equal(generic.availability.selectionState, 'generic')
  assert.equal(generic.availability.requiresKey, true)
  assert.deepEqual(generic.attachment.inputModalities, ['text'])
  assert.equal(generic.attachment.supported, null)
  assert.equal(generic.attachment.supportsVision, null)
  assert.equal(generic.attachment.supportsPdf, null)
  assert.equal(generic.promptPolicy.assistantPhase, 'unsupported')
  assert.equal(generic.openaiRuntimeSupport?.supportsBackgroundMode, false)
  assert.equal(generic.openaiRuntimeSupport?.hostedToolSupport?.web_search, false)
})

test('provider model adapter keeps curated providers on explicit tool families', () => {
  const anthropic = resolveProviderModelAdapter('anthropic', 'claude-sonnet-5')
  const gemini = resolveProviderModelAdapter('gemini', 'gemini-2.5-pro')
  const groq = resolveProviderModelAdapter('groq', 'openai/gpt-oss-120b')
  const groqCompound = resolveProviderModelAdapter('groq', 'groq/compound')
  const mistral = resolveProviderModelAdapter('mistral', 'mistral-medium-2604')
  const moonshot = resolveProviderModelAdapter('moonshot', 'kimi-k2.6')
  const openrouter = resolveProviderModelAdapter('openrouter', 'openai/gpt-5.4')
  const perplexitySearch = resolveProviderModelAdapter('perplexity', 'sonar-pro')
  const perplexityResearch = resolveProviderModelAdapter('perplexity', 'sonar-deep-research')

  assert.equal(anthropic.adapterSelection, 'curated')
  assert.equal(anthropic.transportFamily, 'anthropic_messages')
  assert.equal(anthropic.capabilityFamily, 'anthropic_curated')
  assert.equal(anthropic.optionFamily, 'anthropic_thinking_budget')
  assert.equal(anthropic.attachmentFamily, 'image_and_file_input')
  assert.equal(anthropic.toolFamily, 'addom_native_curated')
  assert.equal(anthropic.allowProviderNativeTools, false)

  assert.equal(gemini.adapterSelection, 'curated')
  assert.equal(gemini.transportFamily, 'google_generate_content')
  assert.equal(gemini.capabilityFamily, 'gemini_curated')
  assert.equal(gemini.optionFamily, 'google_thinking_config')
  assert.equal(gemini.attachmentFamily, 'image_and_file_input')

  assert.equal(groq.adapterSelection, 'curated')
  assert.equal(groq.transportFamily, 'groq_chat')
  assert.equal(groq.capabilityFamily, 'groq_curated')
  assert.equal(groq.optionFamily, 'groq_reasoning_effort')
  assert.equal(groq.attachmentFamily, 'text_only')
  assert.equal(groqCompound.optionFamily, 'none')
  assert.equal(mistral.optionFamily, 'none')

  assert.equal(moonshot.adapterSelection, 'curated')
  assert.equal(moonshot.transportFamily, 'openai_compatible')
  assert.equal(moonshot.capabilityFamily, 'openai_compatible_curated')
  assert.equal(moonshot.optionFamily, 'none')
  assert.equal(moonshot.attachmentFamily, 'image_input')
  assert.equal(moonshot.toolFamily, 'moonshot_formula')
  assert.equal(moonshot.allowProviderNativeTools, true)
  assert.equal(moonshot.providerNativeRuntime.supported, true)
  assert.equal(moonshot.providerNativeRuntime.family, 'moonshot_formula')
  assert.deepEqual(moonshot.providerNativeRuntime.surfaces, ['formula'])

  assert.equal(openrouter.adapterSelection, 'curated')
  assert.equal(openrouter.transportFamily, 'openai_compatible')
  assert.equal(openrouter.capabilityFamily, 'openrouter_curated')
  assert.equal(openrouter.optionFamily, 'none')
  assert.equal(openrouter.toolFamily, 'addom_native_curated')
  assert.equal(openrouter.allowProviderNativeTools, false)
  assert.equal(openrouter.providerNativeRuntime.supported, false)
  assert.equal(openrouter.attachmentFamily, 'image_and_file_input')

  assert.equal(perplexitySearch.adapterSelection, 'curated')
  assert.equal(perplexitySearch.transportFamily, 'perplexity_chat')
  assert.equal(perplexitySearch.capabilityFamily, 'perplexity_curated')
  assert.equal(perplexitySearch.toolFamily, 'perplexity_search')
  assert.equal(perplexitySearch.providerNativeRuntime.supported, true)
  assert.equal(perplexitySearch.providerNativeRuntime.family, 'perplexity_search')
  assert.equal(perplexitySearch.providerNativeRuntime.mode, 'provider_owned_runtime')
  assert.deepEqual(perplexitySearch.providerNativeRuntime.surfaces, ['search'])
  assert.equal(perplexitySearch.allowProviderNativeTools, false)

  assert.equal(perplexityResearch.toolFamily, 'perplexity_research')
  assert.equal(perplexityResearch.providerNativeRuntime.supported, true)
  assert.equal(perplexityResearch.providerNativeRuntime.family, 'perplexity_research')
  assert.equal(perplexityResearch.providerNativeRuntime.mode, 'provider_owned_runtime')
  assert.deepEqual(perplexityResearch.providerNativeRuntime.surfaces, ['research'])
  assert.equal(perplexityResearch.allowProviderNativeTools, false)
})

test('provider model adapter keeps custom openrouter routes on the conservative generic profile', () => {
  const generic = resolveProviderModelAdapter('openrouter', 'vendor/custom-lab-model')

  assert.equal(generic.adapterSelection, 'generic')
  assert.equal(generic.transportFamily, 'openai_compatible')
  assert.equal(generic.capabilityFamily, 'generic_unknown')
  assert.equal(generic.optionFamily, 'none')
  assert.equal(generic.toolFamily, 'generic_addom_native')
  assert.equal(generic.providerNativeRuntime.supported, false)
})

test('provider model adapter assigns only the retained Codex model to the local execution profile', () => {
  const codex = resolveProviderModelAdapter('openai', 'gpt-5.3-codex')
  const codexSnapshot = resolveProviderModelAdapter('openai', 'gpt-5.1-codex-max')

  assert.equal(codex.adapterSelection, 'curated')
  assert.equal(codex.toolFamily, 'openai_codex_local')

  assert.equal(codexSnapshot.adapterSelection, 'generic')
  assert.equal(codexSnapshot.toolFamily, 'generic_addom_native')
})

test('provider model adapter derives configuration-aware availability when API key state is known', () => {
  const configured = resolveProviderModelAdapter('gemini', 'gemini-2.5-pro', {
    apiKeyConfigured: true,
  })
  const unconfigured = resolveProviderModelAdapter('gemini', 'gemini-2.5-pro', {
    apiKeyConfigured: false,
  })

  assert.equal(configured.availability.status, 'unknown')
  assert.equal(configured.availability.verified, true)
  assert.equal(configured.availability.configured, true)
  assert.equal(configured.availabilityFamily, 'curated_unknown')
  assert.equal(unconfigured.availability.status, 'unknown')
  assert.equal(unconfigured.availability.verified, true)
  assert.equal(unconfigured.availability.configured, false)
  assert.equal(unconfigured.availabilityFamily, 'curated_unknown')
})

test('adapter availability status normalizer preserves configured and unknown states', () => {
  assert.equal(normalizeAdapterAvailabilityStatus('configured'), 'configured')
  assert.equal(normalizeAdapterAvailabilityStatus('unknown'), 'unknown')
  assert.equal(normalizeAdapterAvailabilityStatus('verified'), 'verified')
  assert.equal(normalizeAdapterAvailabilityStatus('unexpected-custom-state'), 'unknown')
})

test('attachment family helper classifies shared attachment support consistently', () => {
  assert.equal(resolveAttachmentSupportFamily({ supportsVision: false, supportsPdf: false }), 'text_only')
  assert.equal(resolveAttachmentSupportFamily({ supportsVision: true, supportsPdf: false }), 'image_input')
  assert.equal(resolveAttachmentSupportFamily({ supportsVision: false, supportsPdf: true }), 'file_input')
  assert.equal(resolveAttachmentSupportFamily({ supportsVision: true, supportsPdf: true }), 'image_and_file_input')
})

test('adapter tool surface kind resolves from the adapter tool family instead of raw provider ids', () => {
  const openaiHosted = resolveAdapterToolSurfaceKind(
    resolveProviderModelAdapter('openai', 'gpt-5.4'),
    ['web_search'],
  )
  const openaiLocalRuntime = resolveAdapterToolSurfaceKind(
    resolveProviderModelAdapter('openai', 'gpt-5.3-codex'),
    ['apply_patch'],
  )
  const genericOpenAI = resolveAdapterToolSurfaceKind(
    resolveProviderModelAdapter('openai', 'custom-openai-model'),
    ['web_search'],
  )
  const curatedMoonshot = resolveAdapterToolSurfaceKind(
    resolveProviderModelAdapter('moonshot', 'kimi-k2.6'),
    ['moonshot_formula__web_search__search'],
  )
  const curatedPerplexity = resolveAdapterToolSurfaceKind(
    resolveProviderModelAdapter('perplexity', 'sonar-pro'),
    [],
  )

  assert.equal(openaiHosted, 'openai_hosted')
  assert.equal(openaiLocalRuntime, 'openai_codex_local')
  assert.equal(genericOpenAI, 'addom_native')
  assert.equal(curatedMoonshot, 'moonshot_formula')
  assert.equal(curatedPerplexity, 'perplexity_search')
})

test('adapter tool surface mode resolves from explicit runtime semantics instead of family-specific switch logic', () => {
  assert.equal(
    resolveAdapterToolSurfaceMode(resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' })),
    'provider_owned_runtime',
  )
  assert.equal(
    resolveAdapterToolSurfaceMode(resolveProviderModelAdapter('openai', 'gpt-5.4')),
    'openai_hosted',
  )
  assert.equal(
    resolveAdapterToolSurfaceMode(resolveProviderModelAdapter('openai', 'gpt-5.3-codex')),
    'openai_codex_local',
  )
  assert.equal(
    resolveAdapterToolSurfaceMode(resolveProviderModelAdapter('moonshot', 'kimi-k2.6')),
    'remote_tool_bundle',
  )
  assert.equal(
    resolveAdapterToolSurfaceMode(resolveProviderModelAdapter('perplexity', 'sonar-pro')),
    'provider_owned_runtime',
  )
  assert.equal(
    resolveAdapterToolSurfaceMode(resolveProviderModelAdapter('openrouter', 'openai/gpt-5.4')),
    'addom_native',
  )
})
