import { buildOpenRouterRouteFieldProvenance } from '../../common/api-clients/model-catalog-provenance.mjs'
import { findOpenRouterCompatibilityByRouteId } from '../../common/api-clients/openrouter-compatibility-data.mjs'
import { resolveModelAttachmentSupport } from '../../common/attachments/attachment-support-policy.mjs'
import { mergeOpenRouterManifestModels } from '../../common/api-clients/openrouter-live-models.mjs'
import { resolveRegistryModel } from './model-registry.mjs'
import {
  cloneModels,
  normalizeModelList,
} from './ai-provider-model-utils.mjs'
import {
  resolveAdapterToolSurfaceMode,
  resolveProviderModelAdapter,
} from './provider-model-adapters.mjs'

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function uniqueStrings(values = []) {
  const seen = new Set()
  const out = []
  for (const rawValue of Array.isArray(values) ? values : []) {
    const value = String(rawValue || '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

export function normalizeLowerString(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function dynamicModelCacheKey(providerId, apiKey = '') {
  return `${String(providerId || '').trim()}::${String(apiKey || '').trim()}`
}

export function modelCapabilityCacheKey(providerId, modelId = '', authMethod = 'api_key') {
  const provider = String(providerId || '').trim().toLowerCase()
  const model = String(modelId || '').trim().toLowerCase()
  const auth = String(authMethod || '').trim().toLowerCase() || 'api_key'
  return `${provider}::${model}::${auth}`
}

export function mergeDynamicDiscoveredModels(providerId = '', discoveredModels = [], fallbackModels = []) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  if (normalizedProviderId === 'openrouter') {
    return normalizeModelList(
      mergeOpenRouterManifestModels(discoveredModels, fallbackModels),
    )
  }
  if (normalizedProviderId === 'openai') {
    const listedIds = new Set(
      normalizeModelList(discoveredModels)
        .map((model) => String(model?.id || '').trim().toLowerCase())
        .filter(Boolean),
    )
    return normalizeModelList(fallbackModels).map((model) => {
      const listed = listedIds.has(String(model?.id || '').trim().toLowerCase())
      return {
        ...model,
        selectable: listed,
        unavailableReason: listed
          ? ''
          : `${String(model?.label || model?.id || 'This model').trim()} is not listed for the configured OpenAI key.`,
        modelEligibility: {
          status: listed ? 'provider_listed' : 'not_listed',
          eligible: listed,
          source: 'openai_models_api',
          reason: listed
            ? ''
            : 'The OpenAI models endpoint did not list this curated model for the configured key.',
        },
        availability: {
          ...(model?.availability && typeof model.availability === 'object' ? model.availability : {}),
          status: listed ? 'verified' : 'unsupported',
          requiresKey: true,
        },
      }
    })
  }
  return normalizeModelList([...discoveredModels, ...fallbackModels])
}

export function readDynamicRemoteModels(dynamicRemoteModelCache, providerId = '', apiKey = '', { forceRefresh = false } = {}) {
  if (forceRefresh) return []
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  if (!normalizedProviderId) return []

  const exact = dynamicRemoteModelCache.get(dynamicModelCacheKey(normalizedProviderId, apiKey))
  if (Array.isArray(exact?.models) && exact.models.length > 0) {
    return cloneModels(exact.models)
  }

  if (normalizedProviderId !== 'openrouter') return []

  for (const [cacheKey, value] of dynamicRemoteModelCache.entries()) {
    if (!String(cacheKey || '').toLowerCase().startsWith('openrouter::')) continue
    if (!Array.isArray(value?.models) || value.models.length === 0) continue
    return cloneModels(value.models)
  }

  return []
}

export function canExecuteResolvedToolSurface(capabilities = null) {
  const source = capabilities && typeof capabilities === 'object' ? capabilities : {}
  const toolSupportMode = normalizeLowerString(source.toolSupportMode)
  if (source.supportsTools !== false) return true
  return toolSupportMode === 'provider_owned_runtime_only' || toolSupportMode === 'provider_owned_runtime'
}

function resolveCapabilityToolSemantics(providerId, modelId, {
  supportsTools = false,
  source = 'unknown',
  authMethod = 'api_key',
} = {}) {
  const normalizedAuthMethod = String(authMethod || '').trim().toLowerCase() || 'api_key'
  const adapterProfile = resolveProviderModelAdapter(providerId, modelId, { authMethod: normalizedAuthMethod })
  const toolSurfaceMode = resolveAdapterToolSurfaceMode(adapterProfile)
  const providerNativeRuntime = adapterProfile?.providerNativeRuntime
    && typeof adapterProfile.providerNativeRuntime === 'object'
    ? adapterProfile.providerNativeRuntime
    : {}
  const rawProviderNativeRuntimeMode = normalizeLowerString(providerNativeRuntime.mode)
  const rawProviderNativeRuntimeFamily = normalizeLowerString(providerNativeRuntime.family)

  let toolSupportMode = 'unknown'
  let resolvedToolSurfaceMode = normalizeLowerString(toolSurfaceMode) || 'addom_native'
  let toolFamily = normalizeLowerString(adapterProfile?.toolFamily) || 'generic_addom_native'
  let providerNativeRuntimeFamily = rawProviderNativeRuntimeFamily || 'none'
  let providerNativeRuntimeMode = rawProviderNativeRuntimeMode || 'none'
  let allowProviderNativeTools = adapterProfile?.allowProviderNativeTools === true
  let supportsChatToolSurface = supportsTools === true
  let supportsDelegatedToolSurface = supportsTools === true
  let supportsCollabAgentActivities = adapterProfile?.openaiRuntimeSupport?.supportsCollabAgentActivities === true
  let supportsAddomMoaDelegation = adapterProfile?.openaiRuntimeSupport?.supportsAddomMoaDelegation !== false
  let delegationBackends = Array.isArray(adapterProfile?.openaiRuntimeSupport?.delegationBackends)
    ? adapterProfile.openaiRuntimeSupport.delegationBackends.map((value) => normalizeLowerString(value)).filter(Boolean)
    : []
  let preferredDelegationBackend = normalizeLowerString(adapterProfile?.openaiRuntimeSupport?.preferredDelegationBackend) || 'none'
  let accountRuntimeStatus = normalizedAuthMethod === 'account' ? 'parity' : 'not_applicable'
  let accountCapabilityContract = adapterProfile?.openaiRuntimeSupport?.accountCapabilityContract
    && typeof adapterProfile.openaiRuntimeSupport.accountCapabilityContract === 'object'
    ? cloneJson(adapterProfile.openaiRuntimeSupport.accountCapabilityContract)
    : null
  let accountCapabilityExceptions = Array.isArray(adapterProfile?.openaiRuntimeSupport?.accountCapabilityExceptions)
    ? cloneJson(adapterProfile.openaiRuntimeSupport.accountCapabilityExceptions)
    : []

  if (normalizeLowerString(source) !== 'unknown') {
    if (String(providerId || '').trim().toLowerCase() === 'openai' && normalizedAuthMethod === 'account') {
      const runtimeSupport = adapterProfile?.openaiRuntimeSupport && typeof adapterProfile.openaiRuntimeSupport === 'object'
        ? adapterProfile.openaiRuntimeSupport
        : {}
      const hasAccountNativeToolSurface = (
        runtimeSupport.supportsProviderNativeRuntime === true
        || runtimeSupport.supportsChatToolSurface === true
        || runtimeSupport.supportsDelegatedToolSurface === true
      )
      providerNativeRuntimeFamily = normalizeLowerString(runtimeSupport.providerNativeRuntimeFamily) || 'openai_codex_app_server'
      providerNativeRuntimeMode = normalizeLowerString(runtimeSupport.providerNativeRuntimeMode) || 'provider_owned_runtime'
      toolSupportMode = hasAccountNativeToolSurface ? providerNativeRuntimeMode : 'unsupported'
      resolvedToolSurfaceMode = providerNativeRuntimeMode || 'provider_owned_runtime'
      toolFamily = providerNativeRuntimeFamily || 'openai_codex_app_server'
      allowProviderNativeTools = runtimeSupport.supportsProviderNativeRuntime === true
      supportsChatToolSurface = runtimeSupport.supportsChatToolSurface === true
      supportsDelegatedToolSurface = runtimeSupport.supportsDelegatedToolSurface === true
      supportsCollabAgentActivities = runtimeSupport.supportsCollabAgentActivities === true
      supportsAddomMoaDelegation = runtimeSupport.supportsAddomMoaDelegation === true
      delegationBackends = Array.isArray(runtimeSupport.delegationBackends)
        ? runtimeSupport.delegationBackends.map((value) => normalizeLowerString(value)).filter(Boolean)
        : []
      preferredDelegationBackend = normalizeLowerString(runtimeSupport.preferredDelegationBackend) || (delegationBackends[0] || 'none')
      accountRuntimeStatus = normalizeLowerString(runtimeSupport.accountRuntimeStatus) || 'parity'
      accountCapabilityContract = runtimeSupport.accountCapabilityContract
        && typeof runtimeSupport.accountCapabilityContract === 'object'
        ? cloneJson(runtimeSupport.accountCapabilityContract)
        : accountCapabilityContract
      accountCapabilityExceptions = Array.isArray(runtimeSupport.accountCapabilityExceptions)
        ? cloneJson(runtimeSupport.accountCapabilityExceptions)
        : accountCapabilityExceptions
    } else if (toolSurfaceMode === 'provider_owned_runtime' && supportsTools !== true) {
      toolSupportMode = 'provider_owned_runtime_only'
    } else if (supportsTools !== true) {
      toolSupportMode = 'unsupported'
      supportsCollabAgentActivities = false
      supportsAddomMoaDelegation = false
      delegationBackends = []
      preferredDelegationBackend = 'none'
    } else if (toolSurfaceMode === 'openai_hosted') {
      toolSupportMode = 'openai_hosted'
    } else if (toolSurfaceMode === 'openai_codex_local') {
      toolSupportMode = 'openai_codex_local'
    } else if (toolSurfaceMode === 'remote_tool_bundle') {
      toolSupportMode = 'remote_tool_bundle'
    } else if (toolSurfaceMode === 'provider_owned_runtime') {
      toolSupportMode = 'provider_owned_runtime'
    } else {
      toolSupportMode = 'local_tool_calls'
    }
  }
  if (!(String(providerId || '').trim().toLowerCase() === 'openai' && normalizedAuthMethod === 'account')) {
    resolvedToolSurfaceMode = normalizeLowerString(toolSurfaceMode) || 'addom_native'
  }

  return {
    toolSupportMode,
    toolSurfaceMode: resolvedToolSurfaceMode,
    toolFamily,
    providerNativeRuntimeFamily,
    providerNativeRuntimeMode,
    allowProviderNativeTools,
    supportsChatToolSurface,
    supportsDelegatedToolSurface,
    supportsCollabAgentActivities,
    supportsAddomMoaDelegation,
    delegationBackends,
    preferredDelegationBackend,
    accountRuntimeStatus,
    accountCapabilityContract,
    accountCapabilityExceptions,
  }
}

export function buildUnknownModelCapabilities(providerId, modelId, authMethod = 'api_key') {
  const provider = String(providerId || '').trim().toLowerCase()
  const model = String(modelId || '').trim()
  const toolSemantics = resolveCapabilityToolSemantics(provider, model, {
    supportsTools: false,
    source: 'unknown',
    authMethod,
  })
  return {
    providerId: provider,
    modelId: model,
    authMethod,
    supportsTools: false,
    supportsAnyToolSurface: canExecuteResolvedToolSurface({
      supportsTools: false,
      ...toolSemantics,
    }),
    ...toolSemantics,
    supportsReasoning: false,
    supportsVision: false,
    source: 'unknown',
    checkedAt: Date.now(),
    note: 'Model is not present in the merged catalog. Capability support remains unknown until ADDOM verifies it explicitly.',
  }
}

export function buildMergedCatalogCapabilities(providerId, modelId, authMethod = 'api_key') {
  const provider = String(providerId || '').trim().toLowerCase()
  const model = String(modelId || '').trim()
  const registryResolved = resolveRegistryModel(provider, model)
  if (!registryResolved?.model) return null
  const attachment = resolveModelAttachmentSupport(registryResolved.model)
  const supportsTools = registryResolved.model.supportsTools === true
  const toolSemantics = resolveCapabilityToolSemantics(provider, model, {
    supportsTools,
    source: 'merged_catalog',
    authMethod,
  })
  const fieldProvenance = provider === 'openrouter'
    ? buildOpenRouterRouteFieldProvenance({
      reviewedEntry: findOpenRouterCompatibilityByRouteId(model),
      catalogModel: registryResolved.model,
      liveModel: null,
    })
    : null
  return {
    providerId: provider,
    modelId: model,
    authMethod,
    supportsTools,
    supportsAnyToolSurface: canExecuteResolvedToolSurface({
      supportsTools,
      ...toolSemantics,
    }),
    ...toolSemantics,
    supportsReasoning: registryResolved.model.reasoning === true,
    supportsVision: attachment.supportsVision === true,
    supportsPdf: attachment.supportsPdf === true,
    source: 'merged_catalog',
    checkedAt: Date.now(),
    note: 'Capabilities resolved from the merged model catalog; runtime/provider probes may refine them.',
    ...(fieldProvenance ? { fieldProvenance } : {}),
  }
}

export function buildOpenRouterLiveCapabilities(modelId = '', liveModel = null) {
  const model = String(modelId || '').trim()
  const source = liveModel && typeof liveModel === 'object' ? liveModel : null
  if (!model || !source) return null
  const inferred = source.openrouterInferredCapabilities && typeof source.openrouterInferredCapabilities === 'object'
    ? source.openrouterInferredCapabilities
    : {}
  const supportsTools = inferred.supportsTools === true
  const supportsReasoning = inferred.supportsReasoning === true || inferred.supportsReasoningEffort === true
  const supportsVision = inferred.supportsVision === true
  const supportedParameters = Array.isArray(source.openrouterLive?.supportedParameters)
    ? source.openrouterLive.supportedParameters
    : []
  const architectureInputModalities = Array.isArray(source.openrouterLive?.architecture?.inputModalities)
    ? source.openrouterLive.architecture.inputModalities
    : []
  const noteParts = [
    'Capabilities inferred from live OpenRouter route metadata.',
    supportedParameters.length > 0 ? `supportedParameters=${supportedParameters.join(', ')}` : '',
    architectureInputModalities.length > 0 ? `inputModalities=${architectureInputModalities.join(', ')}` : '',
  ].filter(Boolean)
  const toolSemantics = resolveCapabilityToolSemantics('openrouter', model, {
    supportsTools,
    source: 'openrouter_live',
  })
  const fieldProvenance = buildOpenRouterRouteFieldProvenance({
    reviewedEntry: null,
    catalogModel: null,
    liveModel: source,
  })
  return {
    providerId: 'openrouter',
    modelId: model,
    supportsTools,
    supportsAnyToolSurface: canExecuteResolvedToolSurface({
      supportsTools,
      ...toolSemantics,
    }),
    ...toolSemantics,
    supportsReasoning,
    supportsVision,
    supportsPdf: false,
    source: 'openrouter_live',
    checkedAt: Date.now(),
    note: noteParts.join(' '),
    fieldProvenance,
  }
}

export function normalizeCapabilities(raw = {}, fallback = {}) {
  const supportsTools = raw.supportsTools === true
    || (raw.supportsTools !== false && fallback.supportsTools === true)
  const supportsReasoning = raw.supportsReasoning === true
    || (raw.supportsReasoning !== false && !!fallback.supportsReasoning)
  const supportsVision = raw.supportsVision === true
    || (raw.supportsVision !== false && !!fallback.supportsVision)
  const normalized = {
    providerId: String(raw.providerId || fallback.providerId || '').trim().toLowerCase(),
    modelId: String(raw.modelId || fallback.modelId || '').trim(),
    authMethod: String(raw.authMethod || fallback.authMethod || 'api_key').trim().toLowerCase() || 'api_key',
    supportsTools,
    supportsReasoning,
    supportsVision,
    source: String(raw.source || fallback.source || 'unknown'),
    checkedAt: Number(raw.checkedAt || fallback.checkedAt || Date.now()),
    note: String(raw.note || fallback.note || '').trim(),
  }
  const toolSemantics = resolveCapabilityToolSemantics(normalized.providerId, normalized.modelId, {
    supportsTools: normalized.supportsTools === true,
    source: normalized.source,
    authMethod: normalized.authMethod,
  })
  normalized.toolSupportMode = normalizeLowerString(raw.toolSupportMode || fallback.toolSupportMode || toolSemantics.toolSupportMode || 'unknown') || 'unknown'
  normalized.toolSurfaceMode = normalizeLowerString(raw.toolSurfaceMode || fallback.toolSurfaceMode || toolSemantics.toolSurfaceMode || 'addom_native') || 'addom_native'
  normalized.toolFamily = normalizeLowerString(raw.toolFamily || fallback.toolFamily || toolSemantics.toolFamily || 'generic_addom_native') || 'generic_addom_native'
  normalized.providerNativeRuntimeFamily = normalizeLowerString(
    raw.providerNativeRuntimeFamily
    || fallback.providerNativeRuntimeFamily
    || toolSemantics.providerNativeRuntimeFamily
    || 'none'
  ) || 'none'
  normalized.providerNativeRuntimeMode = normalizeLowerString(
    raw.providerNativeRuntimeMode
    || fallback.providerNativeRuntimeMode
    || toolSemantics.providerNativeRuntimeMode
    || 'none'
  ) || 'none'
  normalized.allowProviderNativeTools = raw.allowProviderNativeTools === true
    || (raw.allowProviderNativeTools !== false && fallback.allowProviderNativeTools === true)
  normalized.supportsChatToolSurface = raw.supportsChatToolSurface === true
    || (raw.supportsChatToolSurface !== false && fallback.supportsChatToolSurface === true)
    || toolSemantics.supportsChatToolSurface === true
  normalized.supportsDelegatedToolSurface = raw.supportsDelegatedToolSurface === true
    || (raw.supportsDelegatedToolSurface !== false && fallback.supportsDelegatedToolSurface === true)
    || toolSemantics.supportsDelegatedToolSurface === true
  normalized.supportsCollabAgentActivities = raw.supportsCollabAgentActivities === true
    || (raw.supportsCollabAgentActivities !== false && fallback.supportsCollabAgentActivities === true)
    || toolSemantics.supportsCollabAgentActivities === true
  normalized.supportsAddomMoaDelegation = raw.supportsAddomMoaDelegation === true
    || (raw.supportsAddomMoaDelegation !== false && fallback.supportsAddomMoaDelegation === true)
    || toolSemantics.supportsAddomMoaDelegation === true
  normalized.delegationBackends = uniqueStrings([
    ...(Array.isArray(raw.delegationBackends) ? raw.delegationBackends : []),
    ...(Array.isArray(fallback.delegationBackends) ? fallback.delegationBackends : []),
    ...(Array.isArray(toolSemantics.delegationBackends) ? toolSemantics.delegationBackends : []),
  ].map((value) => normalizeLowerString(value)).filter(Boolean))
  normalized.preferredDelegationBackend = normalizeLowerString(
    raw.preferredDelegationBackend
    || fallback.preferredDelegationBackend
    || toolSemantics.preferredDelegationBackend
    || (normalized.delegationBackends[0] || 'none')
  ) || 'none'
  normalized.accountRuntimeStatus = String(
    raw.accountRuntimeStatus
    || fallback.accountRuntimeStatus
    || toolSemantics.accountRuntimeStatus
    || (normalized.authMethod === 'account' ? 'parity' : 'not_applicable')
  ).trim().toLowerCase()
  if (raw.accountCapabilityContract && typeof raw.accountCapabilityContract === 'object') {
    normalized.accountCapabilityContract = cloneJson(raw.accountCapabilityContract)
  } else if (fallback.accountCapabilityContract && typeof fallback.accountCapabilityContract === 'object') {
    normalized.accountCapabilityContract = cloneJson(fallback.accountCapabilityContract)
  } else if (toolSemantics.accountCapabilityContract && typeof toolSemantics.accountCapabilityContract === 'object') {
    normalized.accountCapabilityContract = cloneJson(toolSemantics.accountCapabilityContract)
  }
  const rawExceptions = Array.isArray(raw.accountCapabilityExceptions)
    ? raw.accountCapabilityExceptions
    : (
        Array.isArray(fallback.accountCapabilityExceptions)
          ? fallback.accountCapabilityExceptions
          : toolSemantics.accountCapabilityExceptions
      )
  if (Array.isArray(rawExceptions)) {
    normalized.accountCapabilityExceptions = cloneJson(rawExceptions)
  }
  normalized.supportsAnyToolSurface = raw.supportsAnyToolSurface === true
    || (
      raw.supportsAnyToolSurface !== false
      && fallback.supportsAnyToolSurface === true
    )
    || canExecuteResolvedToolSurface(normalized)
  if (Object.prototype.hasOwnProperty.call(raw, 'supportsPdf') || Object.prototype.hasOwnProperty.call(fallback, 'supportsPdf')) {
    normalized.supportsPdf = raw.supportsPdf === true
      || (raw.supportsPdf !== false && fallback.supportsPdf === true)
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'probeFailed')) {
    normalized.probeFailed = raw.probeFailed === true
  }
  if (raw.fieldProvenance && typeof raw.fieldProvenance === 'object') {
    normalized.fieldProvenance = cloneJson(raw.fieldProvenance)
  } else if (fallback.fieldProvenance && typeof fallback.fieldProvenance === 'object') {
    normalized.fieldProvenance = cloneJson(fallback.fieldProvenance)
  }
  return normalized
}

export function readCachedCapabilities(modelCapabilityCache, providerId, modelId, {
  forceRefresh = false,
  authMethod = 'api_key',
  ttlMs = 0,
} = {}) {
  if (forceRefresh) return null
  const cacheKey = modelCapabilityCacheKey(providerId, modelId, authMethod)
  const cached = modelCapabilityCache.get(cacheKey)
  if (!cached || typeof cached !== 'object') return null
  if (ttlMs > 0 && (Date.now() - Number(cached.checkedAt || 0)) > ttlMs) {
    modelCapabilityCache.delete(cacheKey)
    return null
  }
  return cached
}
