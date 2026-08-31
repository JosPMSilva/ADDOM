import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProviderModelSelectorViewModel } from '../../src/renderer/components/chat/provider-model-selector-view-model.mjs'

const providers = [
  {
    id: 'openai',
    name: 'OpenAI',
    hasKey: true,
    defaultModel: 'gpt-5.4',
    models: [
      { id: 'gpt-5.4', label: 'GPT-5.4', group: 'GPT-5' },
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', group: 'Codex' },
    ],
  },
]

test('provider model selector view model keeps canonical migrated model without adding custom duplicate', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers,
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })

  assert.equal(vm.configuredProviders.length, 1)
  assert.equal(vm.activeProvider?.id, 'openai')
  assert.equal(vm.activeProvider?.logoPath, 'provider-logos/openai.svg')
  assert.equal(vm.configuredProviders[0]?.logoPath, 'provider-logos/openai.svg')
  assert.equal(vm.selectedExists, true)
  assert.equal(vm.selectedAdapterSelection, 'curated')
  assert.equal(vm.selectedCanonicalModelId, 'gpt-5.4')
  assert.equal(vm.modelList.filter((m) => m.id === 'gpt-5.4').length, 1)
  assert.equal(vm.modelList.some((m) => String(m.label || '').startsWith('Custom:')), false)
})

test('provider model selector view model does not silently migrate removed aliases', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'codex-mini-latest',
  })

  assert.equal(vm.activeProvider?.id, 'openai')
  assert.equal(vm.selectedExists, false)
  assert.equal(vm.selectedAdapterSelection, 'generic')
  assert.equal(vm.selectedAdapterLabel, 'Generic adapter')
  assert.equal(vm.selectedCanonicalModelId, 'codex-mini-latest')
  assert.equal(vm.modelList.some((m) => m.id === 'gpt-5.3-codex'), true)
  assert.equal(vm.modelList.some((m) => m.id === 'codex-mini-latest'), true)
})

test('provider model selector view model treats removed Codex Spark as a custom selection', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.3-codex-spark',
  })

  assert.equal(vm.activeProvider?.id, 'openai')
  assert.equal(vm.selectedExists, false)
  assert.equal(vm.selectedAdapterSelection, 'generic')
  assert.equal(vm.selectedAdapterLabel, 'Generic adapter')
  assert.equal(vm.selectedCanonicalModelId, 'gpt-5.3-codex-spark')
  assert.equal(vm.modelList.some((m) => m.id === 'gpt-5.3-codex'), true)
  assert.equal(vm.modelList.some((m) => m.id === 'gpt-5.3-codex-spark'), true)
})

test('provider model selector view model falls back to curated provider metadata when the live provider row is missing', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })

  assert.equal(vm.configuredProviders.length, 0)
  assert.equal(vm.activeProvider?.id, 'openai')
  assert.equal(vm.activeProvider?.logoPath, 'provider-logos/openai.svg')
  assert.equal(vm.selectedExists, true)
  assert.equal(vm.selectedAdapterSelection, 'curated')
  assert.ok(vm.modelList.some((m) => m.id === 'gpt-5.4'))
})

test('provider model selector view model accepts auth-aware configured providers without hasKey', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasKey: false,
      hasCredential: true,
      authMethod: 'account',
      defaultModel: 'gpt-5.4',
      models: [
        { id: 'gpt-5.4', label: 'GPT-5.4', group: 'GPT-5' },
      ],
    }],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })

  assert.equal(vm.configuredProviders.length, 1)
  assert.equal(vm.configuredProviders[0]?.id, 'openai')
  assert.equal(vm.activeProvider?.id, 'openai')
  const model = vm.modelList.find((entry) => entry.id === 'gpt-5.4')
  assert.equal(model?.authMethod, 'account')
  assert.equal(model?.supportsChatToolSurface, true)
  assert.equal(model?.supportsDelegatedToolSurface, true)
  assert.equal(model?.supportsCollabAgentActivities, true)
  assert.equal(model?.supportsAddomMoaDelegation, true)
  assert.deepEqual(model?.delegationBackends, ['openai_native', 'addom_moa'])
  assert.equal(model?.preferredDelegationBackend, 'addom_moa')
  assert.equal(model?.toolSupportMode, 'provider_owned_runtime')
  assert.equal(model?.supportsProviderNativeRuntime, true)
  assert.equal(model?.providerNativeRuntimeMode, 'provider_owned_runtime')
  assert.equal(model?.providerNativeRuntimeFamily, 'openai_codex_app_server')
  assert.equal(model?.accountRuntimeStatus, 'parity')
  assert.equal(Array.isArray(model?.accountCapabilityExceptions), true)
  assert.equal(model?.accountCapabilityExceptions?.length, 0)
  assert.equal(model?.accountCapabilityContract?.exceptions?.length, 0)
})

test('provider model selector omits account-unsupported OpenAI models', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      ...providers[0],
      hasKey: false,
      hasCredential: true,
      authMethod: 'account',
    }],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })

  assert.equal(vm.activeModels.some((entry) => entry.id === 'gpt-5.3-codex'), false)
  assert.equal(vm.modelList.some((entry) => entry.id === 'gpt-5.3-codex'), false)
})

test('provider model selector does not restore an account-unsupported OpenAI selection as custom', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      ...providers[0],
      hasKey: false,
      hasCredential: true,
      authMethod: 'account',
    }],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.3-codex',
  })

  assert.equal(vm.selectedExists, false)
  assert.equal(vm.modelList.some((entry) => entry.id === 'gpt-5.3-codex'), false)
  assert.equal(vm.modelList.some((entry) => entry.label === 'Custom: gpt-5.3-codex'), false)
})

test('provider model selector keeps GPT-5.3 Codex available for OpenAI API-key access', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers,
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })

  assert.equal(vm.modelList.some((entry) => entry.id === 'gpt-5.3-codex'), true)
})

test('Cursor is omitted until its selected credential and managed runtime are ready', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      id: 'cursor',
      name: 'Cursor',
      providerClass: 'agent_runtime',
      hasCredential: true,
      ready: false,
      authMethod: 'account',
      models: [{ id: 'composer-2.5', label: 'Composer 2.5' }],
    }],
    loaded: true,
    selectedProvider: 'cursor',
    selectedModel: 'composer-2.5',
  })

  assert.deepEqual(vm.configuredProviders, [])
  assert.equal(vm.activeProvider, null)
  assert.deepEqual(vm.modelList, [])
})

test('ready Cursor exposes Composer 2.5 and Grok 4.5 High Fast', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      id: 'cursor',
      name: 'Cursor',
      providerClass: 'agent_runtime',
      hasCredential: true,
      ready: true,
      authMethod: 'account',
      models: [
        { id: 'composer-2.5', label: 'Composer 2.5' },
        { id: 'cursor-grok-4.5-high-fast', label: 'Grok 4.5 High Fast' },
      ],
    }],
    loaded: true,
    selectedProvider: 'cursor',
    selectedModel: 'composer-2.5',
  })

  assert.equal(vm.configuredProviders.length, 1)
  assert.equal(vm.activeProvider?.id, 'cursor')
  assert.deepEqual(vm.modelList.map((model) => model.id), [
    'composer-2.5',
    'cursor-grok-4.5-high-fast',
  ])
})

test('provider model selector view model keeps parity metadata on curated fallback rows for account auth', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasKey: false,
      hasCredential: true,
      authMethod: 'account',
      defaultModel: 'gpt-5.4',
      models: [],
    }],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })

  const model = vm.modelList.find((entry) => entry.id === 'gpt-5.4')
  assert.ok(model)
  assert.equal(model?.authMethod, 'account')
  assert.equal(model?.toolSupportMode, 'provider_owned_runtime')
  assert.equal(model?.supportsProviderNativeRuntime, true)
  assert.equal(model?.accountRuntimeStatus, 'parity')
  assert.equal(model?.accountCapabilityExceptions?.length, 0)
  assert.equal(model?.accountCapabilityContract?.exceptions?.length, 0)
})

test('provider model selector view model falls back to curated model rows when the live provider has no models', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasKey: true,
      defaultModel: 'gpt-5.4',
      models: [],
    }],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })

  assert.equal(vm.configuredProviders.length, 1)
  assert.equal(vm.activeProvider?.id, 'openai')
  assert.equal(vm.selectedExists, true)
  assert.equal(vm.selectedAdapterSelection, 'curated')
  assert.ok(vm.modelList.some((m) => m.id === 'gpt-5.4'))
})

test('provider model selector view model preserves a custom selection on top of the curated fallback model list', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'custom-openai-model',
  })

  assert.equal(vm.selectedExists, false)
  assert.equal(vm.selectedAdapterSelection, 'generic')
  assert.equal(vm.selectedAdapterLabel, 'Generic adapter')
  assert.ok(vm.modelList.some((m) => m.id === 'gpt-5.4'))
  const custom = vm.modelList.find((m) => m.id === 'custom-openai-model')
  assert.ok(custom)
  assert.equal(custom.label, 'Custom: custom-openai-model')
})

test('provider model selector view model exposes reviewed openrouter routes and keeps custom route ids generic', () => {
  const reviewedVm = buildProviderModelSelectorViewModel({
    providers: [{
      id: 'openrouter',
      name: 'OpenRouter',
      hasKey: true,
      defaultModel: 'openai/gpt-5-mini',
      models: [],
    }],
    loaded: true,
    selectedProvider: 'openrouter',
    selectedModel: 'openai/gpt-5.4',
  })

  assert.equal(reviewedVm.activeProvider?.id, 'openrouter')
  assert.equal(reviewedVm.selectedExists, true)
  assert.equal(reviewedVm.selectedAdapterSelection, 'curated')
  assert.equal(reviewedVm.selectedCanonicalModelId, 'openai/gpt-5.4')
  assert.equal(reviewedVm.modelList.some((m) => m.id === 'openai/gpt-5.4'), true)
  assert.equal(
    reviewedVm.modelList.find((m) => m.id === 'openai/gpt-5.4')?.supportsAnyToolSurface,
    true,
  )

  const customVm = buildProviderModelSelectorViewModel({
    providers: [],
    loaded: true,
    selectedProvider: 'openrouter',
    selectedModel: 'some-vendor/some-custom-model',
  })

  assert.equal(customVm.selectedExists, false)
  assert.equal(customVm.selectedAdapterSelection, 'generic')
  assert.equal(customVm.selectedAdapterLabel, 'Generic adapter')
  assert.equal(customVm.modelList.some((m) => m.id === 'openai/gpt-5.4'), true)
  assert.equal(customVm.modelList.some((m) => m.id === 'some-vendor/some-custom-model'), true)
})

test('provider model selector view model carries provider-native runtime fields for native providers', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [],
    loaded: true,
    selectedProvider: 'perplexity',
    selectedModel: 'sonar-pro',
  })

  const sonar = vm.modelList.find((model) => model.id === 'sonar-pro')
  assert.ok(sonar)
  assert.equal(sonar.supportsTools, false)
  assert.equal(sonar.supportsProviderNativeRuntime, true)
  assert.equal(sonar.supportsAnyToolSurface, true)
  assert.equal(sonar.providerNativeRuntimeFamily, 'perplexity_search')
  assert.equal(sonar.providerNativeRuntimeMode, 'provider_owned_runtime')
})

test('provider model selector view model enriches live provider rows with registry runtime fields', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      id: 'perplexity',
      name: 'Perplexity',
      hasKey: true,
      defaultModel: 'sonar-pro',
      models: [
        { id: 'sonar-pro', label: 'Sonar Pro', group: 'Search' },
      ],
    }],
    loaded: true,
    selectedProvider: 'perplexity',
    selectedModel: 'sonar-pro',
  })

  const sonar = vm.modelList.find((model) => model.id === 'sonar-pro')
  assert.ok(sonar)
  assert.equal(sonar.supportsTools, false)
  assert.equal(sonar.supportsProviderNativeRuntime, true)
  assert.equal(sonar.supportsAnyToolSurface, true)
  assert.equal(sonar.providerNativeRuntimeFamily, 'perplexity_search')
  assert.equal(sonar.providerNativeRuntimeMode, 'provider_owned_runtime')
})

test('provider model selector preserves OpenAI live eligibility blockers for the model menu', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      authMethod: 'api_key',
      hasKey: true,
      defaultModel: 'gpt-5.4',
      models: [
        {
          id: 'gpt-5.4',
          label: 'GPT-5.4',
          selectable: true,
          modelEligibility: { status: 'provider_listed', eligible: true },
        },
        {
          id: 'gpt-5.5',
          label: 'GPT-5.5',
          selectable: false,
          unavailableReason: 'GPT-5.5 is not listed for the configured OpenAI key.',
          modelEligibility: { status: 'not_listed', eligible: false },
        },
      ],
    }],
    loaded: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })

  const unavailable = vm.modelList.find((model) => model.id === 'gpt-5.5')
  assert.ok(unavailable)
  assert.equal(unavailable.selectable, false)
  assert.match(unavailable.unavailableReason, /not listed.*configured OpenAI key/i)
})

test('provider model selector view model respects openrouter visibility preferences but keeps the selected hidden route visible', () => {
  const vm = buildProviderModelSelectorViewModel({
    providers: [{
      id: 'openrouter',
      name: 'OpenRouter',
      hasKey: true,
      defaultModel: 'openai/gpt-5.4',
      models: [
        { id: 'openai/gpt-5.4', label: 'openai/gpt-5.4', group: 'OpenAI' },
        { id: 'openai/gpt-5', label: 'openai/gpt-5', group: 'OpenAI' },
        { id: 'perplexity/sonar', label: 'perplexity/sonar', group: 'Perplexity' },
      ],
    }],
    loaded: true,
    selectedProvider: 'openrouter',
    selectedModel: 'openai/gpt-5.4',
    modelCatalogVisibility: {
      openrouter: {
        namespaceVisibility: {
          openai: false,
        },
        modelOverrides: {},
        filters: {},
      },
    },
  })

  assert.deepEqual(
    vm.modelList.map((model) => model.id),
    ['openai/gpt-5.4', 'perplexity/sonar'],
  )
  assert.equal(vm.selectedExists, true)
})
