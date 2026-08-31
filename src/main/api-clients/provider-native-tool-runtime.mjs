import {
  buildMoonshotFormulaToolBundle,
  executeMoonshotFormulaToolCall,
} from './moonshot-formula-runtime.mjs'

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveProviderScopedRuntimeSettings(providerId = '', runtimeSettings = null) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const source = runtimeSettings && typeof runtimeSettings === 'object' && !Array.isArray(runtimeSettings)
    ? runtimeSettings
    : null
  if (!source) return null
  const scoped = source[normalizedProviderId]
  if (scoped && typeof scoped === 'object' && !Array.isArray(scoped)) return scoped
  return source
}

function createEmptyProviderNativeToolBundle() {
  return {
    tools: {},
    toolRuntimeContext: null,
    notices: [],
    enabledToolIds: [],
    excludedToolReasons: [],
  }
}

async function buildMoonshotFormulaRuntimeBundle({
  providerId = '',
  apiKey = '',
  runtimeSettings = null,
  fetchImpl = null,
  abortSignal = null,
} = {}) {
  const bundle = await buildMoonshotFormulaToolBundle({
    apiKey,
    runtimeSettings: resolveProviderScopedRuntimeSettings(providerId, runtimeSettings),
    fetchImpl,
    abortSignal,
  })
  return {
    tools: bundle.tools || {},
    toolRuntimeContext: {
      family: 'moonshot_formula',
      toolMap: bundle.toolMap instanceof Map ? bundle.toolMap : new Map(),
    },
    notices: Array.isArray(bundle.notices) ? bundle.notices : [],
    enabledToolIds: Object.keys(bundle.tools || {}),
    excludedToolReasons: [],
  }
}

async function buildProviderOwnedSemanticBundle() {
  return createEmptyProviderNativeToolBundle()
}

async function executeMoonshotFormulaRuntimeCall({
  toolName = '',
  toolInput = {},
  toolRuntimeContext = null,
  apiKey = '',
  abortSignal = null,
} = {}) {
  const mapping = toolRuntimeContext?.toolMap instanceof Map
    ? toolRuntimeContext.toolMap.get(String(toolName || '').trim())
    : null
  if (!mapping) return null
  return executeMoonshotFormulaToolCall({
    apiKey,
    mapping,
    toolInput,
    abortSignal,
  })
}

const PROVIDER_NATIVE_RUNTIME_FAMILIES = Object.freeze({
  moonshot_formula: Object.freeze({
    buildBundle: buildMoonshotFormulaRuntimeBundle,
    executeToolCall: executeMoonshotFormulaRuntimeCall,
  }),
  perplexity_search: Object.freeze({
    buildBundle: buildProviderOwnedSemanticBundle,
  }),
  perplexity_research: Object.freeze({
    buildBundle: buildProviderOwnedSemanticBundle,
  }),
})

function resolveProviderNativeRuntimeFamilyHandler(family = '') {
  const normalizedFamily = String(family || '').trim().toLowerCase()
  return normalizedFamily ? (PROVIDER_NATIVE_RUNTIME_FAMILIES[normalizedFamily] || null) : null
}

export async function buildProviderNativeToolBundle({
  providerId = '',
  apiKey = '',
  runtimeSettings = null,
  adapterProfile = null,
  fetchImpl = null,
  abortSignal = null,
} = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const providerNativeRuntime = adapterProfile?.providerNativeRuntime
    && typeof adapterProfile.providerNativeRuntime === 'object'
    ? adapterProfile.providerNativeRuntime
    : {}
  const family = String(providerNativeRuntime.family || '').trim().toLowerCase()
  if (providerNativeRuntime.supported !== true || !family) {
    return createEmptyProviderNativeToolBundle()
  }
  const familyHandler = resolveProviderNativeRuntimeFamilyHandler(family)
  if (!familyHandler?.buildBundle) {
    throw new Error(`Unsupported provider-native runtime family: ${family}`)
  }

  return familyHandler.buildBundle({
    providerId: normalizedProviderId,
    apiKey,
    runtimeSettings,
    adapterProfile,
    fetchImpl,
    abortSignal,
  })
}

export async function executeProviderNativeToolCall({
  providerId = '',
  apiKey = '',
  toolName = '',
  toolInput = {},
  toolRuntimeContext = null,
  abortSignal = null,
} = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const context = toolRuntimeContext && typeof toolRuntimeContext === 'object'
    ? toolRuntimeContext
    : null
  const family = String(context?.family || '').trim().toLowerCase()
  if (!family) return null
  const familyHandler = resolveProviderNativeRuntimeFamilyHandler(family)
  if (!familyHandler) {
    throw new Error(`Unsupported provider-native runtime family: ${family}`)
  }
  if (typeof familyHandler.executeToolCall !== 'function') return null
  return familyHandler.executeToolCall({
    providerId: normalizedProviderId,
    apiKey,
    toolName,
    toolInput,
    toolRuntimeContext: context,
    abortSignal,
  })
}
