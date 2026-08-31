import {
  canonicalizeRegistryModelSelection,
  getRegistryProvider,
  listRegistryModelsForProvider,
  resolveRegistryModel,
} from '../../common/api-clients/model-registry.mjs'
import {
  resolveAttachmentSupportFamily,
  resolveModelAttachmentSupport,
} from '../../common/attachments/attachment-support-policy.mjs'
import {
  createUnsupportedOpenAIModelRuntimeSupport,
  resolveOpenAIModelRuntimeSupport,
} from './openai-model-runtime-support.mjs'
import { isLikelyOllamaThinkingModelId } from './ai-provider-model-utils.mjs'

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeModelId(value = '') {
  return String(value || '').trim()
}

function normalizeLowerModelId(value = '') {
  return normalizeModelId(value).toLowerCase()
}

function uniqueStrings(values = []) {
  const source = Array.isArray(values) ? values : []
  const seen = new Set()
  const out = []
  for (const rawValue of source) {
    const value = String(rawValue || '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function resolveReasoningProviderControls(curatedModel = null) {
  return uniqueStrings(
    Array.isArray(curatedModel?.capabilities?.reasoning?.providerControls)
      ? curatedModel.capabilities.reasoning.providerControls
      : [],
  )
}

export function normalizeAdapterAvailabilityStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'configured') return 'configured'
  if (normalized === 'curated') return 'curated'
  if (normalized === 'verified') return 'verified'
  if (normalized === 'unsupported') return 'unsupported'
  return 'unknown'
}

function isOpenAISnapshotAlias(modelId = '', canonicalModelId = '') {
  const requested = normalizeLowerModelId(modelId)
  const canonical = normalizeLowerModelId(canonicalModelId)
  if (!requested || !canonical) return false
  if (!requested.startsWith(`${canonical}-`)) return false
  const suffix = requested.slice(canonical.length + 1)
  return /^\d{4}-\d{2}-\d{2}$/.test(suffix)
}

function resolveCuratedModelMatch(providerId = '', modelId = '') {
  const provider = normalizeProviderId(providerId)
  const model = normalizeModelId(modelId)
  if (!provider || !model) return null

  const canonicalized = canonicalizeRegistryModelSelection(provider, model)
  const canonicalCandidateModelId = String(canonicalized?.modelId || '').trim()
  if (
    canonicalized
    && canonicalized.changed === true
    && canonicalCandidateModelId
  ) {
    const migrated = resolveRegistryModel(provider, canonicalCandidateModelId)
    if (migrated?.model) {
      return {
        providerId: provider,
        canonicalModelId: String(migrated.canonicalModelId || canonicalCandidateModelId),
        matchedBy: String(canonicalized.reason || '').startsWith('curated_remap')
          ? 'registry_remap'
          : 'registry_migrated',
        model: migrated.model,
      }
    }
  }

  const exact = resolveRegistryModel(provider, model)
  if (exact?.model) {
    return {
      providerId: provider,
      canonicalModelId: String(exact.canonicalModelId || model),
      matchedBy: exact.matchedBy === 'alias' ? 'registry_alias' : 'registry_exact',
      model: exact.model,
    }
  }

  if (provider !== 'openai') return null
  const curatedModels = listRegistryModelsForProvider(provider, { includeDeprecated: true })
    .sort((left, right) => String(right?.id || '').length - String(left?.id || '').length)
  for (const row of curatedModels) {
    const canonicalModelId = String(row?.id || '').trim()
    if (!canonicalModelId) continue
    if (!isOpenAISnapshotAlias(model, canonicalModelId)) continue
    return {
      providerId: provider,
      canonicalModelId,
      matchedBy: 'registry_snapshot',
      model: row,
    }
  }
  return null
}

function resolveWireApi(providerId = '', { backgroundQueued = false } = {}) {
  const provider = normalizeProviderId(providerId)
  if (backgroundQueued && provider === 'openai') return 'openai_background_response'
  switch (provider) {
    case 'openai':
      return 'ai_sdk_stream_text:openai'
    case 'deepseek':
    case 'moonshot':
    case 'openrouter':
    case 'ollama':
    case 'lmstudio':
      return 'ai_sdk_stream_text:openai_compatible'
    case 'anthropic':
      return 'ai_sdk_stream_text:anthropic'
    case 'gemini':
      return 'ai_sdk_stream_text:google'
    case 'grok':
      return 'ai_sdk_stream_text:xai'
    case 'groq':
      return 'ai_sdk_stream_text:groq'
    case 'mistral':
      return 'ai_sdk_stream_text:mistral'
    case 'perplexity':
      return 'ai_sdk_stream_text:perplexity'
    default:
      return provider ? `ai_sdk_stream_text:${provider}` : 'ai_sdk_stream_text:unknown'
  }
}

function resolveTransportFamily(providerId = '', { backgroundQueued = false } = {}) {
  const provider = normalizeProviderId(providerId)
  if (backgroundQueued && provider === 'openai') return 'openai_background_response'
  switch (provider) {
    case 'openai':
      return 'openai_responses'
    case 'deepseek':
    case 'moonshot':
    case 'openrouter':
    case 'ollama':
    case 'lmstudio':
      return 'openai_compatible'
    case 'anthropic':
      return 'anthropic_messages'
    case 'gemini':
      return 'google_generate_content'
    case 'grok':
      return 'xai_responses'
    case 'groq':
      return 'groq_chat'
    case 'mistral':
      return 'mistral_chat'
    case 'perplexity':
      return 'perplexity_chat'
    default:
      return 'unknown'
  }
}

function resolveCapabilityFamily(providerId = '', adapterSelection = '') {
  const provider = normalizeProviderId(providerId)
  const selection = String(adapterSelection || '').trim().toLowerCase()
  if (selection !== 'curated') return 'generic_unknown'
  switch (provider) {
    case 'openai':
      return 'openai_curated'
    case 'anthropic':
      return 'anthropic_curated'
    case 'gemini':
      return 'gemini_curated'
    case 'deepseek':
    case 'moonshot':
    case 'openrouter':
    case 'ollama':
    case 'lmstudio':
      return provider === 'openrouter' ? 'openrouter_curated' : 'openai_compatible_curated'
    case 'grok':
      return 'xai_curated'
    case 'groq':
      return 'groq_curated'
    case 'mistral':
      return 'mistral_curated'
    case 'perplexity':
      return 'perplexity_curated'
    default:
      return 'curated_unknown_family'
  }
}

function resolveOptionFamily({
  providerId = '',
  adapterModelId = '',
  requestedModelId = '',
  curatedModel = null,
} = {}) {
  const provider = normalizeProviderId(providerId)
  const effectiveModelId = normalizeModelId(adapterModelId || requestedModelId)
  if (!provider) return 'none'
  if (provider === 'openai') return 'openai_responses'
  if (provider === 'anthropic' && curatedModel?.reasoning === true) {
    return 'anthropic_thinking_budget'
  }
  if (provider === 'gemini' && curatedModel?.reasoning === true) {
    return 'google_thinking_config'
  }
  if (provider === 'groq' && curatedModel?.reasoning === true) {
    return 'groq_reasoning_effort'
  }
  if (provider === 'ollama' && isLikelyOllamaThinkingModelId(effectiveModelId)) {
    return 'openai_compatible_thinking_toggle'
  }
  return 'none'
}

function resolveAttachmentDescriptor({
  adapterSelection = '',
  curatedModel = null,
} = {}) {
  const selection = String(adapterSelection || '').trim().toLowerCase()
  if (selection !== 'curated') {
    return {
      family: 'unknown',
      supported: null,
      supportsVision: null,
      supportsPdf: null,
      inputModalities: ['text'],
    }
  }

  const attachmentSupport = resolveModelAttachmentSupport(curatedModel)
  const supportsVision = attachmentSupport.supportsVision === true
  const supportsPdf = attachmentSupport.supportsPdf === true
  const inputModalities = uniqueStrings([
    'text',
    ...(Array.isArray(attachmentSupport.inputModalities) ? attachmentSupport.inputModalities : []),
  ])

  return {
    family: resolveAttachmentSupportFamily(attachmentSupport),
    supported: supportsVision || supportsPdf,
    supportsVision,
    supportsPdf,
    inputModalities,
  }
}

function resolveProviderNativeRuntimeDescriptor({
  adapterSelection = '',
  curatedModel = null,
} = {}) {
  if (String(adapterSelection || '').trim().toLowerCase() !== 'curated') {
    return {
      family: 'none',
      supported: false,
      surfaces: [],
      mode: null,
      availabilityStatus: 'unsupported',
      notes: null,
    }
  }

  const source = curatedModel?.capabilities?.providerNativeRuntime
  if (!source || typeof source !== 'object' || Array.isArray(source) || source.supported !== true) {
    return {
      family: 'none',
      supported: false,
      surfaces: [],
      mode: null,
      availabilityStatus: String(curatedModel?.availability?.status || '').trim().toLowerCase() || 'unknown',
      notes: null,
    }
  }

  return {
    family: String(source.family || '').trim().toLowerCase() || 'custom',
    supported: true,
    surfaces: Array.isArray(source.surfaces)
      ? source.surfaces.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [],
    mode: String(source.mode || '').trim().toLowerCase() || null,
    availabilityStatus: String(curatedModel?.availability?.status || '').trim().toLowerCase() || 'unknown',
    notes: String(source.notes || '').trim() || null,
  }
}

function resolveToolFamily({
  providerId = '',
  adapterModelId = '',
  adapterSelection = '',
  providerNativeRuntime = null,
} = {}) {
  const provider = String(providerId || '').trim().toLowerCase()
  const modelId = normalizeLowerModelId(adapterModelId)
  const selection = String(adapterSelection || '').trim().toLowerCase()
  if (selection !== 'curated') return 'generic_addom_native'
  if (provider === 'openai' && modelId.includes('codex')) return 'openai_codex_local'
  if (provider === 'openai') return 'openai_hosted'
  const providerNativeFamily = String(providerNativeRuntime?.family || '').trim().toLowerCase()
  if (providerNativeRuntime?.supported === true && providerNativeFamily) {
    return providerNativeFamily
  }
  return 'addom_native_curated'
}

function resolveAvailabilitySummary({
  providerEntry = null,
  curatedModel = null,
  adapterSelection = '',
  apiKeyConfigured = null,
} = {}) {
  const providerAvailability = providerEntry?.availability && typeof providerEntry.availability === 'object'
    ? providerEntry.availability
    : {}
  const modelAvailability = curatedModel?.availability && typeof curatedModel.availability === 'object'
    ? curatedModel.availability
    : {}
  const providerProvenance = providerEntry?.provenance && typeof providerEntry.provenance === 'object'
    ? providerEntry.provenance
    : {}
  const modelProvenance = curatedModel?.provenance && typeof curatedModel.provenance === 'object'
    ? curatedModel.provenance
    : {}
  const selectionState = String(adapterSelection || '').trim().toLowerCase() === 'curated'
    ? 'curated'
    : 'generic'
  const metadataStatus = normalizeAdapterAvailabilityStatus(modelAvailability.status || providerAvailability.status || 'unknown')
  const verified = Boolean(
    String(modelProvenance.verifiedAt || providerProvenance.verifiedAt || '').trim(),
  )
  const requiresKey = modelAvailability.requiresKey !== false && providerAvailability.requiresKey !== false
  const configured = requiresKey
    ? (typeof apiKeyConfigured === 'boolean' ? apiKeyConfigured : null)
    : true
  const status = selectionState === 'generic'
    ? 'unknown'
    : metadataStatus

  return {
    selectionState,
    status,
    verified,
    requiresKey,
    configured,
    localAvailable: modelAvailability.localAvailable ?? providerAvailability.localAvailable ?? null,
    gates: uniqueStrings([
      ...(Array.isArray(providerAvailability.gates) ? providerAvailability.gates : []),
      ...(Array.isArray(modelAvailability.gates) ? modelAvailability.gates : []),
    ]),
    notes: String(modelAvailability.notes || providerAvailability.notes || '').trim() || null,
  }
}

function resolveAvailabilityFamily(availability = null) {
  const status = String(availability?.status || '').trim().toLowerCase()
  const selectionState = String(availability?.selectionState || '').trim().toLowerCase()
  if (selectionState === 'unsupported' || status === 'unsupported') return 'unsupported'
  if (selectionState === 'generic') return 'generic_unknown'
  if (status === 'verified') return 'curated_verified'
  if (status === 'configured') return 'curated_configured'
  if (status === 'curated') return 'curated_unverified'
  if (status === 'unknown') return 'curated_unknown'
  return 'unknown'
}

function resolveProvenanceSummary({
  providerEntry = null,
  curatedModel = null,
  availability = null,
} = {}) {
  const providerProvenance = providerEntry?.provenance && typeof providerEntry.provenance === 'object'
    ? providerEntry.provenance
    : {}
  const modelProvenance = curatedModel?.provenance && typeof curatedModel.provenance === 'object'
    ? curatedModel.provenance
    : {}

  return {
    source: String(modelProvenance.source || providerProvenance.source || '').trim() || 'unknown',
    sourceUrl: String(modelProvenance.sourceUrl || providerProvenance.sourceUrl || '').trim() || null,
    verifiedAt: String(modelProvenance.verifiedAt || providerProvenance.verifiedAt || '').trim() || null,
    providerTrustLevel: String(providerProvenance.trustLevel || '').trim() || 'unknown',
    modelTrustLevel: String(modelProvenance.trustLevel || '').trim() || 'unknown',
    availabilityStatus: String(availability?.status || '').trim().toLowerCase() || 'unknown',
  }
}

export function resolveProviderModelAdapter(providerId = '', modelId = '', {
  backgroundQueued = false,
  apiKeyConfigured = null,
  authMethod = 'api_key',
} = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const requestedModelId = normalizeModelId(modelId)
  const providerEntry = getRegistryProvider(normalizedProviderId)
  const curatedMatch = resolveCuratedModelMatch(normalizedProviderId, requestedModelId)
  const adapterSelection = curatedMatch ? 'curated' : 'generic'
  const adapterReason = curatedMatch ? curatedMatch.matchedBy : 'unknown_or_non_curated'
  const adapterModelId = curatedMatch?.canonicalModelId || requestedModelId
  const openaiRuntimeSupport = normalizedProviderId === 'openai'
    ? (adapterSelection === 'curated'
        ? resolveOpenAIModelRuntimeSupport(adapterModelId, { authMethod })
        : createUnsupportedOpenAIModelRuntimeSupport(requestedModelId || adapterModelId))
    : null
  const optionFamily = resolveOptionFamily({
    providerId: normalizedProviderId,
    adapterModelId,
    requestedModelId,
    curatedModel: curatedMatch?.model || null,
  })
  const transportFamily = resolveTransportFamily(normalizedProviderId, { backgroundQueued })
  const capabilityFamily = resolveCapabilityFamily(normalizedProviderId, adapterSelection)
  const attachment = resolveAttachmentDescriptor({
    adapterSelection,
    curatedModel: curatedMatch?.model || null,
  })
  const providerNativeRuntime = resolveProviderNativeRuntimeDescriptor({
    adapterSelection,
    curatedModel: curatedMatch?.model || null,
  })
  const availability = resolveAvailabilitySummary({
    providerEntry,
    curatedModel: curatedMatch?.model || null,
    adapterSelection,
    apiKeyConfigured,
  })
  const availabilityFamily = resolveAvailabilityFamily(availability)
  const toolFamily = resolveToolFamily({
    providerId: normalizedProviderId,
    adapterModelId,
    adapterSelection,
    providerNativeRuntime,
  })
  const provenanceSummary = resolveProvenanceSummary({
    providerEntry,
    curatedModel: curatedMatch?.model || null,
    availability,
  })
  const reasoningProviderControls = resolveReasoningProviderControls(curatedMatch?.model || null)

  return {
    providerId: normalizedProviderId,
    requestedModelId,
    adapterModelId,
    adapterId: normalizedProviderId
      ? `${normalizedProviderId}:${adapterSelection === 'curated' ? (adapterModelId || 'model') : 'generic'}`
      : 'unknown:generic',
    adapterSelection,
    adapterReason,
    wireApi: resolveWireApi(normalizedProviderId, { backgroundQueued }),
    transportFamily,
    capabilityFamily,
    optionFamily,
    attachmentFamily: attachment.family,
    toolFamily,
    availability,
    availabilityFamily,
    attachment,
    reasoningProviderControls,
    providerNativeRuntime,
    provenanceSummary,
    allowProviderNativeTools: (
      toolFamily === 'openai_hosted'
      || toolFamily === 'openai_codex_local'
      || String(providerNativeRuntime.mode || '').trim().toLowerCase() === 'remote_tool_bundle'
    ),
    promptPolicy: {
      commentaryStyle: (
        normalizedProviderId === 'openai'
        && openaiRuntimeSupport?.supportsAssistantPhase === true
      )
        ? 'phase_commentary'
        : 'standard',
      assistantPhase: (
        normalizedProviderId === 'openai'
        && openaiRuntimeSupport?.supportsAssistantPhase === true
      )
        ? 'recommended'
        : 'unsupported',
    },
    renderer: {
      selectedModelLabel: adapterSelection === 'generic' ? 'Generic adapter' : '',
      showGenericBadge: adapterSelection === 'generic',
    },
    openaiRuntimeSupport,
  }
}

export function resolveAdapterToolSurfaceMode(adapterProfile = {}) {
  const toolFamily = String(adapterProfile?.toolFamily || '').trim().toLowerCase()
  const providerId = String(adapterProfile?.providerId || '').trim().toLowerCase()
  const authMethod = String(
    adapterProfile?.openaiRuntimeSupport?.authMethod
    || adapterProfile?.authMethod
    || '',
  ).trim().toLowerCase()
  const providerOwnedRuntimeMode = String(
    adapterProfile?.openaiRuntimeSupport?.providerNativeRuntimeMode
    || adapterProfile?.providerNativeRuntime?.mode
    || '',
  ).trim().toLowerCase()

  if (toolFamily === 'openai_codex_local') return 'openai_codex_local'
  if (
    providerId === 'openai'
    && authMethod === 'account'
    && adapterProfile?.openaiRuntimeSupport?.supportsProviderNativeRuntime === true
    && providerOwnedRuntimeMode === 'provider_owned_runtime'
  ) {
    return 'provider_owned_runtime'
  }
  if (toolFamily === 'openai_hosted') return 'openai_hosted'
  if (
    adapterProfile?.providerNativeRuntime?.supported === true
    && toolFamily
  ) {
    const runtimeMode = String(adapterProfile?.providerNativeRuntime?.mode || '').trim().toLowerCase()
    if (runtimeMode === 'provider_owned_runtime') return 'provider_owned_runtime'
    if (runtimeMode === 'remote_tool_bundle') return 'remote_tool_bundle'
  }
  return 'addom_native'
}

export function resolveAdapterToolSurfaceKind(adapterProfile = {}, providerToolNames = []) {
  const toolFamily = String(adapterProfile?.toolFamily || '').trim().toLowerCase()
  const surfaceMode = resolveAdapterToolSurfaceMode(adapterProfile)
  if (surfaceMode === 'openai_codex_local') return 'openai_codex_local'
  if (surfaceMode === 'provider_owned_runtime' && toolFamily) {
    return toolFamily
  }
  const providerNames = Array.isArray(providerToolNames)
    ? providerToolNames.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : []
  if (providerNames.length === 0) return 'addom_native'
  if (surfaceMode === 'remote_tool_bundle' && toolFamily) return toolFamily
  if (surfaceMode === 'openai_hosted') {
    return providerNames.some((name) => name === 'local_shell' || name === 'apply_patch')
      ? 'openai_local_runtime'
      : 'openai_hosted'
  }
  return 'addom_native'
}
