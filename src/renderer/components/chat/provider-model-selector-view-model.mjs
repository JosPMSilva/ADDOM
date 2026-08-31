import {
  getRegistryProvider,
  resolveRegistryModel,
  listRegistryModelsForProvider,
} from '../../../common/api-clients/model-registry.mjs'
import { buildProviderModelSelectionList } from '../../../common/api-clients/model-catalog-visibility.mjs'
import { providerHasCredential } from '../../../common/api-clients/provider-credential-state.mjs'
import { resolveProviderModelAdapter } from '../../../main/api-clients/provider-model-adapters.mjs'

function mergeModelWithRegistry(providerId = '', model = null, authMethod = 'api_key') {
  const modelId = String(model?.id || '').trim()
  if (!providerId || !modelId) return model
  const registryMatch = resolveRegistryModel(providerId, modelId)?.model || null
  const merged = registryMatch
    ? {
        ...registryMatch,
        ...model,
      }
    : model
  if (String(providerId || '').trim().toLowerCase() !== 'openai' || String(authMethod || '').trim().toLowerCase() !== 'account') {
    return merged
  }
  const adapter = resolveProviderModelAdapter(providerId, modelId, { authMethod })
  const runtimeSupport = adapter?.openaiRuntimeSupport && typeof adapter.openaiRuntimeSupport === 'object'
    ? adapter.openaiRuntimeSupport
    : null
  if (!runtimeSupport) return merged
  const delegationBackends = Array.isArray(runtimeSupport.delegationBackends)
    ? [...runtimeSupport.delegationBackends]
    : []
  const supportsDelegatedToolSurface = (
    runtimeSupport.supportsCollabAgentActivities === true
    || runtimeSupport.supportsAddomMoaDelegation === true
    || delegationBackends.length > 0
  )
  const supportsProviderNativeRuntime = runtimeSupport.supportsProviderNativeRuntime === true
  const providerNativeRuntimeMode = String(runtimeSupport.providerNativeRuntimeMode || '').trim().toLowerCase() || 'provider_owned_runtime'
  const providerNativeRuntimeFamily = String(runtimeSupport.providerNativeRuntimeFamily || '').trim().toLowerCase() || 'openai_codex_app_server'
  const supportsAnyAccountToolSurface = (
    supportsProviderNativeRuntime
    || runtimeSupport.supportsChatToolSurface === true
    || runtimeSupport.supportsDelegatedToolSurface === true
    || supportsDelegatedToolSurface
  )
  const accountRuntimeStatus = String(runtimeSupport.accountRuntimeStatus || '').trim().toLowerCase() || 'parity'
  const accountRuntimeMessage = String(runtimeSupport.accountRuntimeMessage || '').trim()
  return {
    ...merged,
    authMethod: 'account',
    toolSupportMode: supportsAnyAccountToolSurface ? providerNativeRuntimeMode : 'unsupported',
    toolSurfaceMode: supportsAnyAccountToolSurface ? providerNativeRuntimeMode : 'addom_native',
    supportsTools: supportsAnyAccountToolSurface,
    supportsAnyToolSurface: supportsAnyAccountToolSurface,
    supportsChatToolSurface: runtimeSupport.supportsChatToolSurface === true,
    supportsDelegatedToolSurface,
    supportsCollabAgentActivities: runtimeSupport.supportsCollabAgentActivities === true,
    supportsAddomMoaDelegation: runtimeSupport.supportsAddomMoaDelegation === true,
    delegationBackends,
    preferredDelegationBackend: String(runtimeSupport.preferredDelegationBackend || '').trim().toLowerCase() || 'none',
    accountRuntimeStatus,
    accountRuntimeMessage,
    selectable: accountRuntimeStatus !== 'unsupported',
    unavailableReason: accountRuntimeStatus === 'unsupported'
      ? (accountRuntimeMessage || `${modelId} is not supported with OpenAI account authentication.`)
      : '',
    supportsProviderNativeRuntime,
    providerNativeRuntimeMode,
    providerNativeRuntimeFamily,
    accountCapabilityContract: runtimeSupport.accountCapabilityContract || null,
    accountCapabilityExceptions: Array.isArray(runtimeSupport.accountCapabilityExceptions)
      ? [...runtimeSupport.accountCapabilityExceptions]
      : [],
  }
}

function mergeModelsWithRegistry(providerId = '', models = [], authMethod = 'api_key') {
  if (!providerId || !Array.isArray(models)) return []
  const mergedModels = models.map((model) => mergeModelWithRegistry(providerId, model, authMethod))
  if (String(providerId).trim().toLowerCase() !== 'openai' || String(authMethod).trim().toLowerCase() !== 'account') {
    return mergedModels
  }
  return mergedModels.filter((model) => model?.selectable !== false)
}

function mergeProviderWithRegistry(provider = null) {
  const providerId = String(provider?.id || provider?.providerId || '').trim()
  const authMethod = String(provider?.authMethod || '').trim().toLowerCase() || 'api_key'
  if (!providerId) return provider
  const registryProvider = getRegistryProvider(providerId)
  if (!registryProvider) return provider

  const liveModels = Array.isArray(provider?.models) ? provider.models : null
  return {
    ...registryProvider,
    ...provider,
    models: liveModels && liveModels.length > 0
      ? mergeModelsWithRegistry(providerId, liveModels, authMethod)
      : mergeModelsWithRegistry(providerId, registryProvider.models, authMethod),
  }
}

export function providerIsSelectable(provider = null) {
  if (!providerHasCredential(provider)) return false
  return provider?.providerClass !== 'agent_runtime' || provider?.ready === true
}

export function buildProviderModelSelectorViewModel({
  providers = [],
  loaded = false,
  selectedProvider = '',
  selectedModel = '',
  modelCatalogVisibility = null,
} = {}) {
  const rows = Array.isArray(providers) ? providers : []
  if (!loaded) {
    return {
      loaded: false,
      configuredProviders: [],
      activeProvider: null,
      activeModels: [],
      selectedExists: false,
      modelList: [],
    }
  }

  const configuredProviders = rows.filter((provider) => providerIsSelectable(provider))
    .map((provider) => mergeProviderWithRegistry(provider))
  const liveProvider = rows.find((p) => p?.id === selectedProvider) || null
  const liveActiveProvider = providerIsSelectable(liveProvider)
    ? mergeProviderWithRegistry(liveProvider)
    : null
  const activeProvider = liveActiveProvider || (
    liveProvider?.providerClass === 'agent_runtime'
      ? null
      : getRegistryProvider(selectedProvider)
  )
  if (!activeProvider) {
    return {
      loaded: true,
      configuredProviders,
      activeProvider: null,
      activeModels: [],
      selectedExists: false,
      selectedAdapterSelection: '',
      selectedAdapterLabel: '',
      selectedCanonicalModelId: '',
      modelList: [],
    }
  }
  const selectedAuthMethod = String(liveActiveProvider?.authMethod || activeProvider?.authMethod || '').trim().toLowerCase() || 'api_key'
  const providerModels = Array.isArray(liveActiveProvider?.models) && liveActiveProvider.models.length > 0
    ? liveActiveProvider.models
    : listRegistryModelsForProvider(selectedProvider)
  const rawActiveModels = mergeModelsWithRegistry(selectedProvider, providerModels, selectedAuthMethod)
  const selectedModelValue = String(selectedModel || activeProvider?.defaultModel || '').trim()
  const selectedAdapter = resolveProviderModelAdapter(selectedProvider, selectedModelValue, {
    authMethod: selectedAuthMethod,
  })
  const selectedUnavailableForAuth = (
    selectedProvider === 'openai'
    && selectedAuthMethod === 'account'
    && selectedAdapter?.openaiRuntimeSupport?.accountRuntimeStatus === 'unsupported'
  )
  const selectedCanonicalModelId = String(selectedAdapter?.adapterModelId || selectedModelValue || '').trim()
  const activeModels = buildProviderModelSelectionList({
    providerId: selectedProvider,
    models: rawActiveModels,
    modelCatalogVisibility,
    selectedModel: selectedCanonicalModelId || selectedModelValue,
  })
  const selectedExists = !!selectedCanonicalModelId && rawActiveModels.some((m) => m?.id === selectedCanonicalModelId)
  const selectedVisible = !!selectedCanonicalModelId && activeModels.some((m) => m?.id === selectedCanonicalModelId)
  const selectedModelEntry = selectedExists
    ? rawActiveModels.find((m) => m?.id === selectedCanonicalModelId) || null
    : null
  const modelList = selectedUnavailableForAuth
    ? activeModels
    : selectedVisible || !selectedModel
    ? activeModels
    : (
      selectedModelEntry
        ? [...activeModels, selectedModelEntry]
        : [...activeModels, { id: selectedModel, label: `Custom: ${selectedModel}`, group: 'Custom' }]
    )

  return {
    loaded: true,
    configuredProviders,
    activeProvider,
    activeModels,
    selectedExists,
    selectedAdapterSelection: selectedAdapter.adapterSelection,
    selectedAdapterLabel: selectedAdapter.renderer?.selectedModelLabel || '',
    selectedCanonicalModelId,
    modelList,
  }
}
