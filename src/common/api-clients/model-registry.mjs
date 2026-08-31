import {
  getGeneratedModelCatalogModelLookup,
  getGeneratedModelCatalogModelProvenance,
  getGeneratedModelCatalogProviderLookup,
  getGeneratedModelCatalogProviderProvenance,
  getMergedModelCatalogSnapshot,
  getModelCatalogProviderLogo,
} from './model-catalog.mjs'

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeModelId(value = '') {
  return String(value || '').trim()
}

function normalizeLowerModelId(value = '') {
  return normalizeModelId(value).toLowerCase()
}

function deriveContextPrecisionFromSource(source = '') {
  const value = String(source || '').trim().toLowerCase()
  if (value === 'provider' || value === 'exact') return 'exact'
  if (value === 'openrouter_fallback' || value === 'verified_fallback') return 'verified_fallback'
  return 'estimated'
}

function deriveCatalogFieldSource(field = null, provenance = null, fallback = 'estimated') {
  if (field && typeof field === 'object') {
    const trustLevel = String(field.trustLevel || '').trim().toLowerCase()
    if (trustLevel === 'authoritative' || trustLevel === 'verified' || trustLevel === 'override') return 'provider'
    if (field.state === 'generated') return 'verified_fallback'
  }
  const source = String(provenance?.source || '').trim().toLowerCase()
  if (source === 'addom_curated_registry') return 'provider'
  if (source === 'models.dev') return 'verified_fallback'
  return fallback
}

function catalogModelSupportsVision(model = {}) {
  const inputModalities = Array.isArray(model?.capabilities?.inputModalities)
    ? model.capabilities.inputModalities
    : []
  const attachmentKinds = Array.isArray(model?.capabilities?.attachment?.kinds)
    ? model.capabilities.attachment.kinds
    : []
  return inputModalities.includes('image') || attachmentKinds.includes('image')
}

function catalogModelSupportsPdf(model = {}) {
  const inputModalities = Array.isArray(model?.capabilities?.inputModalities)
    ? model.capabilities.inputModalities
    : []
  const attachmentKinds = Array.isArray(model?.capabilities?.attachment?.kinds)
    ? model.capabilities.attachment.kinds
    : []
  return attachmentKinds.includes('pdf') || inputModalities.includes('file') || inputModalities.includes('pdf')
}

function catalogModelSupportsTools(model = {}) {
  if (model?.capabilities?.toolCall?.supported === true) return true
  if (model?.capabilities?.toolCall?.supported === false) return false
  return null
}

function catalogModelSupportsProviderNativeRuntime(model = {}) {
  if (model?.capabilities?.providerNativeRuntime?.supported === true) return true
  if (model?.capabilities?.providerNativeRuntime?.supported === false) return false
  return null
}

function normalizeRegistryModelFromCatalog(providerId = '', model = {}) {
  const generatedLookup = getGeneratedModelCatalogModelLookup(providerId, model.id)
  const generatedProvenance = getGeneratedModelCatalogModelProvenance(providerId, model.id)
  const normalized = {
    id: normalizeModelId(model.id),
    label: String(model.label || model.id || '').trim(),
    group: String(model.group || 'Other').trim(),
    ...(String(model.releaseDate || '').trim() ? { releaseDate: String(model.releaseDate).trim() } : {}),
    ...(String(model.lastUpdated || '').trim() ? { lastUpdated: String(model.lastUpdated).trim() } : {}),
    ...(String(model.knowledge || '').trim() ? { knowledge: String(model.knowledge).trim() } : {}),
    ...(typeof model.structuredOutput === 'boolean' ? { structuredOutput: model.structuredOutput === true } : {}),
    ...(typeof model.openWeights === 'boolean' ? { openWeights: model.openWeights === true } : {}),
    contextSource: deriveCatalogFieldSource(model?.provenance?.fields?.limits, model?.provenance),
    pricingSource: deriveCatalogFieldSource(model?.provenance?.fields?.pricing, model?.provenance, 'none'),
    verifiedAt: String(model?.provenance?.verifiedAt || '').trim() || null,
    aliases: Array.isArray(model.aliases) ? model.aliases.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
    availability: model?.availability && typeof model.availability === 'object' ? cloneJson(model.availability) : null,
    provenance: model?.provenance && typeof model.provenance === 'object' ? cloneJson(model.provenance) : null,
    ...(generatedLookup?.sourceFile ? { sourceFile: String(generatedLookup.sourceFile).trim() } : {}),
    ...(generatedProvenance ? { generatedProvenance: cloneJson(generatedProvenance) } : {}),
    capabilities: model?.capabilities && typeof model.capabilities === 'object' ? cloneJson(model.capabilities) : null,
    defaultProviderOptions: model?.defaultProviderOptions && typeof model.defaultProviderOptions === 'object' && !Array.isArray(model.defaultProviderOptions)
      ? cloneJson(model.defaultProviderOptions)
      : {},
    variants: Array.isArray(model?.variants) ? cloneJson(model.variants) : [],
  }

  if (model?.capabilities?.reasoning?.supported === true) {
    normalized.reasoning = true
  }
  if (Number.isFinite(model?.limits?.context)) {
    normalized.contextWindowTokens = Math.max(0, Math.round(Number(model.limits.context)))
  }
  if (Number.isFinite(model?.limits?.input)) {
    normalized.inputLimitTokens = Math.max(0, Math.round(Number(model.limits.input)))
    normalized.inputLimit = Math.max(0, Math.round(Number(model.limits.input)))
  }
  if (Number.isFinite(model?.limits?.output)) {
    normalized.maxOutputTokens = Math.max(0, Math.round(Number(model.limits.output)))
  }
  if (model.pricing && typeof model.pricing === 'object') {
    normalized.pricing = { ...model.pricing }
  }
  if (model.deprecated === true) {
    normalized.deprecated = true
  }
  if (model.replacementModelId) {
    normalized.replacementModelId = String(model.replacementModelId).trim()
  }
  if (model.notes) {
    normalized.notes = String(model.notes)
  }
  if (catalogModelSupportsVision(model)) {
    normalized.vision = true
  }
  normalized.supportsPdf = catalogModelSupportsPdf(model)
  if (catalogModelSupportsTools(model) !== null) {
    normalized.supportsTools = catalogModelSupportsTools(model) === true
  }
  if (typeof model?.capabilities?.delegation?.supported === 'boolean') {
    normalized.supportsDelegation = model.capabilities.delegation.supported === true
  }
  if (catalogModelSupportsProviderNativeRuntime(model) !== null) {
    normalized.supportsProviderNativeRuntime = catalogModelSupportsProviderNativeRuntime(model) === true
  }
  const providerNativeRuntimeFamily = String(model?.capabilities?.providerNativeRuntime?.family || '').trim().toLowerCase()
  if (providerNativeRuntimeFamily) {
    normalized.providerNativeRuntimeFamily = providerNativeRuntimeFamily
  }
  const providerNativeRuntimeMode = String(model?.capabilities?.providerNativeRuntime?.mode || '').trim().toLowerCase()
  if (providerNativeRuntimeMode) {
    normalized.providerNativeRuntimeMode = providerNativeRuntimeMode
  }
  if (
    Object.prototype.hasOwnProperty.call(normalized, 'supportsTools')
    || Object.prototype.hasOwnProperty.call(normalized, 'supportsProviderNativeRuntime')
  ) {
    normalized.supportsAnyToolSurface = (
      normalized.supportsTools === true
      || normalized.supportsProviderNativeRuntime === true
    )
  }

  return normalized
}

function normalizeRegistryProviderFromCatalog(provider = {}) {
  const providerId = normalizeProviderId(provider.providerId || provider.id)
  const generatedLookup = getGeneratedModelCatalogProviderLookup(providerId)
  const generatedProvenance = getGeneratedModelCatalogProviderProvenance(providerId)
  const logo = getModelCatalogProviderLogo(providerId)
  return {
    providerId,
    id: providerId,
    name: String(provider.name || providerId).trim(),
    defaultModel: String(provider.defaultModel || '').trim(),
    ...(provider.keyHint ? { keyHint: String(provider.keyHint) } : {}),
    ...(provider.keyUrl ? { keyUrl: String(provider.keyUrl) } : {}),
    ...(provider.baseUrl ? { baseUrl: String(provider.baseUrl).trim() } : {}),
    ...(provider.termsUrl ? { termsUrl: String(provider.termsUrl).trim() } : {}),
    ...(provider.termsVersion ? { termsVersion: String(provider.termsVersion).trim() } : {}),
    ...(provider.noKeyRequired ? { noKeyRequired: true } : {}),
    ...(Object.prototype.hasOwnProperty.call(provider, 'localAvailable') ? { localAvailable: provider.localAvailable === true } : {}),
    ...(provider.availability && typeof provider.availability === 'object' ? { availability: cloneJson(provider.availability) } : {}),
    ...(provider.provenance && typeof provider.provenance === 'object' ? { provenance: cloneJson(provider.provenance) } : {}),
    ...(generatedLookup?.sourceFile ? { sourceFile: String(generatedLookup.sourceFile).trim() } : {}),
    ...(logo?.path ? { logoPath: String(logo.path).trim() } : {}),
    ...(generatedProvenance ? { generatedProvenance: cloneJson(generatedProvenance) } : {}),
    models: Array.isArray(provider.models)
      ? provider.models.map((model) => normalizeRegistryModelFromCatalog(providerId, model))
      : [],
  }
}

function buildNormalizedRegistry() {
  return getMergedModelCatalogSnapshot()
    .map(normalizeRegistryProviderFromCatalog)
    .sort((left, right) => left.id.localeCompare(right.id))
}

const NORMALIZED_REGISTRY = buildNormalizedRegistry()

function getProviderEntry(providerId) {
  const pid = normalizeProviderId(providerId)
  return NORMALIZED_REGISTRY.find((entry) => entry.id === pid) || null
}

function findModelMatch(providerEntry, modelId) {
  const target = normalizeLowerModelId(modelId)
  if (!providerEntry || !target) return null
  for (const model of providerEntry.models || []) {
    if (normalizeLowerModelId(model.id) === target) {
      return { model, matchedBy: 'id', matchedId: model.id }
    }
    for (const alias of model.aliases || []) {
      if (normalizeLowerModelId(alias) === target) {
        return { model, matchedBy: 'alias', matchedId: alias }
      }
    }
  }
  return null
}

export function listRegistryProviders() {
  return cloneJson(NORMALIZED_REGISTRY)
}

export function getRegistryProvider(providerId) {
  const entry = getProviderEntry(providerId)
  return entry ? cloneJson(entry) : null
}

export function resolveRegistryModel(providerId, modelId) {
  const provider = getProviderEntry(providerId)
  if (!provider) return null
  const match = findModelMatch(provider, modelId)
  if (!match) return null
  return {
    providerId: provider.id,
    providerName: provider.name,
    canonicalModelId: match.model.id,
    matchedBy: match.matchedBy,
    matchedId: match.matchedId,
    model: cloneJson(match.model),
    isDeprecated: !!match.model.deprecated,
    replacementModelId: String(match.model.replacementModelId || '').trim() || null,
  }
}

export function resolveRegistryModelAlias(providerId, modelId) {
  const resolved = resolveRegistryModel(providerId, modelId)
  if (!resolved) return null
  const requested = String(modelId || '').trim()
  const canonical = String(resolved.canonicalModelId || '').trim()
  const replacement = String(resolved.replacementModelId || '').trim()
  if (requested && canonical && requested.toLowerCase() !== canonical.toLowerCase()) {
    return {
      providerId: resolved.providerId,
      requestedModelId: requested,
      canonicalModelId: canonical,
      migrated: true,
      reason: resolved.isDeprecated ? 'deprecated_alias' : 'alias',
      replacementModelId: replacement || canonical,
      source: 'registry',
    }
  }
  if (resolved.isDeprecated && replacement) {
    return {
      providerId: resolved.providerId,
      requestedModelId: requested || canonical,
      canonicalModelId: canonical,
      migrated: false,
      reason: 'deprecated_model',
      replacementModelId: replacement,
      source: 'registry',
    }
  }
  return {
    providerId: resolved.providerId,
    requestedModelId: requested || canonical,
    canonicalModelId: canonical,
    migrated: false,
    reason: 'exact',
    replacementModelId: replacement || null,
    source: 'registry',
  }
}

export function canonicalizeRegistryModelSelection(providerId, modelId) {
  const requestedProviderId = normalizeProviderId(providerId)
  const requestedModelId = String(modelId || '').trim()
  if (!requestedProviderId || !requestedModelId) {
    return {
      providerId: requestedProviderId,
      modelId: requestedModelId,
      changed: false,
      source: 'input',
      reason: 'missing',
    }
  }

  const alias = resolveRegistryModelAlias(requestedProviderId, requestedModelId)
  if (!alias) {
    return {
      providerId: requestedProviderId,
      modelId: requestedModelId,
      changed: false,
      source: 'input',
      reason: 'unknown',
    }
  }

  const nextProviderId = String(alias.providerId || requestedProviderId).trim() || requestedProviderId
  let nextModelId = String(alias.canonicalModelId || requestedModelId).trim() || requestedModelId
  let reason = String(alias.reason || 'exact')

  if ((reason === 'deprecated_model' || reason === 'deprecated_alias') && alias.replacementModelId) {
    nextModelId = String(alias.replacementModelId).trim() || nextModelId
    reason = 'deprecated_replacement'
  }

  return {
    providerId: nextProviderId,
    modelId: nextModelId,
    changed: (
      nextProviderId.toLowerCase() !== requestedProviderId.toLowerCase()
      || nextModelId.toLowerCase() !== requestedModelId.toLowerCase()
    ),
    source: 'registry',
    reason,
    requestedProviderId,
    requestedModelId,
  }
}

export function buildStaticProviderManifest({
  includeDeprecatedModels = false,
} = {}) {
  return NORMALIZED_REGISTRY.map((entry) => {
    const models = (entry.models || [])
      .filter((model) => includeDeprecatedModels || !model.deprecated)
      .map((model) => ({
        id: model.id,
        label: model.label,
        group: model.group,
        ...(model.capabilities && typeof model.capabilities === 'object' ? { capabilities: cloneJson(model.capabilities) } : {}),
        ...(model.defaultProviderOptions && typeof model.defaultProviderOptions === 'object' && !Array.isArray(model.defaultProviderOptions)
          ? { defaultProviderOptions: cloneJson(model.defaultProviderOptions) }
          : {}),
        ...(Array.isArray(model.variants) ? { variants: cloneJson(model.variants) } : {}),
        ...(model.reasoning ? { reasoning: true } : {}),
        ...(model.releaseDate ? { releaseDate: String(model.releaseDate) } : {}),
        ...(model.lastUpdated ? { lastUpdated: String(model.lastUpdated) } : {}),
        ...(model.knowledge ? { knowledge: String(model.knowledge) } : {}),
        ...(typeof model.structuredOutput === 'boolean' ? { structuredOutput: model.structuredOutput === true } : {}),
        ...(typeof model.openWeights === 'boolean' ? { openWeights: model.openWeights === true } : {}),
        ...(Number.isFinite(model.contextWindowTokens) ? { contextWindowTokens: Math.max(0, Math.round(model.contextWindowTokens)) } : {}),
        ...(Number.isFinite(model.inputLimitTokens) ? { inputLimitTokens: Math.max(0, Math.round(model.inputLimitTokens)) } : {}),
        ...(Number.isFinite(model.inputLimit) ? { inputLimit: Math.max(0, Math.round(model.inputLimit)) } : {}),
        ...(Number.isFinite(model.maxOutputTokens) ? { maxOutputTokens: Math.max(0, Math.round(model.maxOutputTokens)) } : {}),
        ...(model.contextSource ? { contextWindowSource: String(model.contextSource) } : {}),
        ...(model.contextSource ? { contextWindowProvenance: String(model.contextSource) } : {}),
        ...(model.contextSource ? { contextWindowPrecision: deriveContextPrecisionFromSource(model.contextSource) } : {}),
        ...(model.verifiedAt ? { contextWindowVerifiedAt: String(model.verifiedAt) } : {}),
        ...(model.deprecated ? { deprecated: true } : {}),
        ...(model.replacementModelId ? { replacementModelId: String(model.replacementModelId) } : {}),
        ...(model.vision ? { vision: true } : {}),
        ...(Object.prototype.hasOwnProperty.call(model, 'supportsTools') ? { supportsTools: model.supportsTools === true } : {}),
        ...(Object.prototype.hasOwnProperty.call(model, 'supportsProviderNativeRuntime')
          ? { supportsProviderNativeRuntime: model.supportsProviderNativeRuntime === true }
          : {}),
        ...(model.providerNativeRuntimeFamily ? { providerNativeRuntimeFamily: String(model.providerNativeRuntimeFamily) } : {}),
        ...(model.providerNativeRuntimeMode ? { providerNativeRuntimeMode: String(model.providerNativeRuntimeMode) } : {}),
        ...(Object.prototype.hasOwnProperty.call(model, 'supportsAnyToolSurface')
          ? { supportsAnyToolSurface: model.supportsAnyToolSurface === true }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(model, 'supportsPdf') ? { supportsPdf: model.supportsPdf === true } : {}),
      }))
    const defaultModel = models.some((model) => model.id === entry.defaultModel)
      ? entry.defaultModel
      : (models[0]?.id || '')
    return {
      id: entry.id,
      name: entry.name,
      defaultModel,
      ...(entry.keyHint ? { keyHint: entry.keyHint } : {}),
      ...(entry.keyUrl ? { keyUrl: entry.keyUrl } : {}),
      ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
      ...(entry.termsUrl ? { termsUrl: entry.termsUrl } : {}),
      ...(entry.termsVersion ? { termsVersion: entry.termsVersion } : {}),
      ...(entry.noKeyRequired ? { noKeyRequired: true } : {}),
      ...(Object.prototype.hasOwnProperty.call(entry, 'localAvailable') ? { localAvailable: !!entry.localAvailable } : {}),
      ...(entry.logoPath ? { logoPath: entry.logoPath } : {}),
      models,
    }
  })
}

export function listRegistryModelsForProvider(providerId, {
  includeDeprecated = false,
} = {}) {
  const entry = getProviderEntry(providerId)
  if (!entry) return []
  return cloneJson((entry.models || []).filter((model) => includeDeprecated || !model.deprecated))
}
