import { getModelCatalogProvider, getModelCatalogProviderLogo } from './model-catalog.mjs'
import { findOpenRouterCompatibilityByRouteId } from './openrouter-compatibility-data.mjs'
import { buildOpenRouterRouteFieldProvenance } from './model-catalog-provenance.mjs'
import {
  DEFAULT_OPENROUTER_MODEL_CATALOG_VISIBILITY,
  cloneJson,
  normalizeLowerRouteId,
  normalizeNamespace,
  normalizeOpenRouterModelCatalogVisibility,
  normalizeRouteId,
} from './model-catalog-visibility-settings.mjs'

export {
  DEFAULT_MODEL_CATALOG_VISIBILITY,
  DEFAULT_OPENROUTER_MODEL_CATALOG_VISIBILITY,
  areModelCatalogVisibilityEqual,
  areOpenRouterModelCatalogVisibilityEqual,
  normalizeModelCatalogVisibility,
  normalizeOpenRouterModelCatalogVisibility,
} from './model-catalog-visibility-settings.mjs'

const OPENROUTER_NAMESPACE_LABELS = Object.freeze({
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  google: 'Google',
  'meta-llama': 'Meta Llama',
  mistralai: 'Mistral',
  moonshotai: 'Moonshot AI',
  openai: 'OpenAI',
  perplexity: 'Perplexity',
  qwen: 'Qwen',
  'x-ai': 'xAI',
})

const OPENROUTER_NAMESPACE_TO_CATALOG_PROVIDER_ID = Object.freeze({
  google: 'gemini',
  moonshotai: 'moonshot',
  'x-ai': 'grok',
})

const OPENROUTER_NAMESPACE_TO_VENDOR_LOGO_ALIAS = Object.freeze({
  amazon: 'amazon-bedrock',
  cloudflare: 'cloudflare-ai-gateway',
  cohere: 'cohere',
  databricks: 'databricks',
  google: 'google', // some may fallback to google if gemini lacks logo
  liquid: 'liquid',
  meta: 'meta-llama',
  'meta-llama': 'meta-llama',
  mistralai: 'mistral',
  nvidia: 'nvidia',
  openai: 'openai',
  perplexity: 'perplexity',
  qwen: 'qwen',
  snowflake: 'snowflake',
  together: 'togetherai',
  'x-ai': 'xai',
})

const OPENROUTER_NAMESPACE_LABEL_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: 'base',
})
const OPENROUTER_VISIBILITY_METADATA_CACHE = new WeakMap()
const OPENROUTER_SEARCH_HAYSTACK_CACHE = new WeakMap()

function normalizeSearchQuery(value = '') {
  return String(value || '').trim().toLowerCase()
}

function getCatalogProviderIdForOpenRouterNamespace(namespace = '') {
  const normalized = normalizeNamespace(namespace)
  return OPENROUTER_NAMESPACE_TO_CATALOG_PROVIDER_ID[normalized] || normalized
}

function findCatalogModelForOpenRouterRoute(routeId = '') {
  const normalizedRouteId = normalizeRouteId(routeId)
  if (!normalizedRouteId.includes('/')) return null
  const [namespace, ...rest] = normalizedRouteId.split('/')
  const modelId = rest.join('/').trim()
  if (!namespace || !modelId) return null
  const provider = getModelCatalogProvider(getCatalogProviderIdForOpenRouterNamespace(namespace))
  if (!provider) return null
  return (
    provider.models?.find((entry) => normalizeLowerRouteId(entry?.id) === modelId.toLowerCase())
    || null
  )
}

function catalogModelSupportsTools(model = {}) {
  return model?.capabilities?.toolCall?.supported === true
}

function catalogModelSupportsProviderOwnedRuntime(model = {}) {
  return model?.capabilities?.providerNativeRuntime?.supported === true
}

function catalogModelHasAnyToolSurface(model = {}) {
  return catalogModelSupportsTools(model) || catalogModelSupportsProviderOwnedRuntime(model)
}

function catalogModelSupportsReasoning(model = {}) {
  return model?.capabilities?.reasoning?.supported === true
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

function resolveReviewedToolsSupport(model = {}, catalogModel = null) {
  const toolSupportMode = String(model?.toolSupportMode || '').trim().toLowerCase()
  if (model?.supportsTools === true) return true
  if (toolSupportMode === 'provider_owned_runtime_only' || toolSupportMode === 'provider_owned_runtime') {
    return true
  }
  if (model?.capabilities?.toolCall?.supported === false) {
    return model?.capabilities?.providerNativeRuntime?.supported === true
  }
  if (model?.supportsTools === false) {
    return model?.capabilities?.providerNativeRuntime?.supported === true
  }
  return model?.capabilities?.toolCall?.supported === true
    || model?.capabilities?.providerNativeRuntime?.supported === true
    || catalogModelHasAnyToolSurface(catalogModel)
}

function resolveReviewedReasoningSupport(model = {}) {
  return model?.reasoning === true || model?.capabilities?.reasoning?.supported === true
}

function resolveReviewedVisionSupport(model = {}) {
  if (model?.vision === true) return true
  const kinds = Array.isArray(model?.capabilities?.attachment?.kinds)
    ? model.capabilities.attachment.kinds
    : []
  return kinds.includes('image')
}

function resolveOpenRouterInferredCapabilities(model = {}) {
  const source = model?.openrouterInferredCapabilities && typeof model.openrouterInferredCapabilities === 'object'
    ? model.openrouterInferredCapabilities
    : null
  if (!source) {
    return {
      hasEvidence: false,
      supportsTools: false,
      supportsReasoning: false,
      supportsVision: false,
    }
  }
  return {
    hasEvidence: (
      source.supportsTools === true
      || source.supportsReasoning === true
      || source.supportsReasoningEffort === true
      || source.supportsVision === true
    ),
    supportsTools: source.supportsTools === true,
    supportsReasoning: source.supportsReasoning === true || source.supportsReasoningEffort === true,
    supportsVision: source.supportsVision === true,
  }
}

export function getOpenRouterNamespace(routeId = '') {
  const normalized = normalizeRouteId(routeId)
  if (!normalized.includes('/')) return ''
  return normalizeNamespace(normalized.split('/')[0])
}

export function formatOpenRouterNamespaceLabel(namespace = '') {
  const normalized = normalizeNamespace(namespace)
  if (!normalized) return 'OpenRouter'
  return OPENROUTER_NAMESPACE_LABELS[normalized] || normalized.replace(/[-_]/g, ' ')
}

export function resolveOpenRouterNamespaceVisibility(visibility = null, namespace = '') {
  const normalizedVisibility = normalizeOpenRouterModelCatalogVisibility(visibility)
  const normalizedNamespace = normalizeNamespace(namespace)
  if (!normalizedNamespace) return normalizedVisibility.defaultVisible
  const namespaceOverride = normalizedVisibility.namespaceVisibility[normalizedNamespace]
  return typeof namespaceOverride === 'boolean'
    ? namespaceOverride
    : normalizedVisibility.defaultVisible
}

export function resolveOpenRouterModelBaseVisibility(visibility = null, routeId = '', namespace = '') {
  const normalizedVisibility = normalizeOpenRouterModelCatalogVisibility(visibility)
  const normalizedRouteId = normalizeRouteId(routeId)
  const namespaceDefaultVisible = resolveOpenRouterNamespaceVisibility(normalizedVisibility, namespace)
  const modelOverride = normalizedVisibility.modelOverrides[normalizedRouteId]
  return typeof modelOverride === 'boolean' ? modelOverride : namespaceDefaultVisible
}

export function resolveOpenRouterVisibilityMetadata(model = {}) {
  if (model && typeof model === 'object') {
    const cached = OPENROUTER_VISIBILITY_METADATA_CACHE.get(model)
    if (cached) return cached
  }
  const routeId = normalizeRouteId(model?.id)
  const namespace = getOpenRouterNamespace(routeId)
  const reviewedEntry = findOpenRouterCompatibilityByRouteId(routeId)
  const catalogModel = findCatalogModelForOpenRouterRoute(routeId)
  const inferred = resolveOpenRouterInferredCapabilities(model)
  const fieldProvenance = buildOpenRouterRouteFieldProvenance({
    reviewedEntry,
    catalogModel,
    liveModel: model,
  })
  const reviewState = reviewedEntry
    ? 'reviewed'
    : (catalogModel ? 'catalog-derived' : (inferred.hasEvidence ? 'estimated' : 'unknown'))
  const supportsTools = reviewedEntry
    ? resolveReviewedToolsSupport(model, catalogModel)
    : (catalogModel ? catalogModelHasAnyToolSurface(catalogModel) : inferred.supportsTools)
  const supportsReasoning = reviewedEntry
    ? resolveReviewedReasoningSupport(model)
    : (catalogModel ? catalogModelSupportsReasoning(catalogModel) : inferred.supportsReasoning)
  const supportsVision = reviewedEntry
    ? resolveReviewedVisionSupport(model)
    : (catalogModel ? catalogModelSupportsVision(catalogModel) : inferred.supportsVision)
  const metadata = {
    routeId,
    namespace,
    namespaceLabel: formatOpenRouterNamespaceLabel(namespace),
    reviewState,
    supportsTools,
    supportsReasoning,
    supportsVision,
    fieldProvenance,
    catalogModel: catalogModel ? cloneJson(catalogModel) : null,
    reviewedEntry: reviewedEntry ? { ...reviewedEntry } : null,
    providerLogoPath: getModelCatalogProvider(getCatalogProviderIdForOpenRouterNamespace(namespace))?.logoPath
      || getModelCatalogProviderLogo(OPENROUTER_NAMESPACE_TO_VENDOR_LOGO_ALIAS[namespace] || namespace)?.path
      || null,
  }
  if (model && typeof model === 'object') {
    OPENROUTER_VISIBILITY_METADATA_CACHE.set(model, metadata)
  }
  return metadata
}

function buildOpenRouterModelSearchHaystack(model = {}, metadata = null) {
  if (model && typeof model === 'object') {
    const cached = OPENROUTER_SEARCH_HAYSTACK_CACHE.get(model)
    if (typeof cached === 'string' && cached) return cached
  }
  const routeId = normalizeRouteId(model?.id)
  const resolvedMetadata = metadata && typeof metadata === 'object'
    ? metadata
    : resolveOpenRouterVisibilityMetadata(model)
  const haystack = [
    routeId,
    String(model?.label || ''),
    String(model?.group || ''),
    resolvedMetadata.namespace,
    resolvedMetadata.namespaceLabel,
  ].join(' ').toLowerCase()
  if (model && typeof model === 'object') {
    OPENROUTER_SEARCH_HAYSTACK_CACHE.set(model, haystack)
  }
  return haystack
}

export function buildOpenRouterVisibilityView({
  models = [],
  visibility = null,
  selectedModel = '',
  search = '',
} = {}) {
  const normalizedVisibility = normalizeOpenRouterModelCatalogVisibility(visibility)
  const selectedRouteId = normalizeLowerRouteId(selectedModel)
  const searchQuery = normalizeSearchQuery(search)
  const activeFilters = normalizedVisibility.filters || DEFAULT_OPENROUTER_MODEL_CATALOG_VISIBILITY.filters
  const rows = []
  const visibleModels = []
  let baseVisibleCount = 0
  const namespaceOrder = []
  const namespaceMap = new Map()

  for (const inputModel of Array.isArray(models) ? models : []) {
    const routeId = normalizeRouteId(inputModel?.id)
    if (!routeId) continue
    const metadata = resolveOpenRouterVisibilityMetadata(inputModel)
    const namespace = metadata.namespace
    const baseVisible = resolveOpenRouterModelBaseVisibility(normalizedVisibility, routeId, namespace)
    const passesFilters = (
      (!activeFilters.reviewedOnly || metadata.reviewState === 'reviewed')
      && (!activeFilters.toolsOnly || metadata.supportsTools === true)
      && (!activeFilters.reasoningOnly || metadata.supportsReasoning === true)
      && (!activeFilters.visionOnly || metadata.supportsVision === true)
    )
    const searchHaystack = buildOpenRouterModelSearchHaystack(inputModel, metadata)
    const matchesSearch = !searchQuery || searchHaystack.includes(searchQuery)
    const isSelected = !!selectedRouteId && normalizeLowerRouteId(routeId) === selectedRouteId
    const visible = isSelected || (baseVisible && passesFilters && matchesSearch)
    const row = {
      ...inputModel,
      visibilityNamespace: namespace,
      visibilityNamespaceLabel: metadata.namespaceLabel,
      visibilityReviewState: metadata.reviewState,
      visibilitySupportsTools: metadata.supportsTools,
      visibilitySupportsReasoning: metadata.supportsReasoning,
      visibilitySupportsVision: metadata.supportsVision,
      visibilityFieldProvenance: metadata.fieldProvenance,
      visibilityCatalogModel: metadata.catalogModel,
      visibilityReviewedEntry: metadata.reviewedEntry,
      visibilityBaseVisible: baseVisible,
      visibilityPassesFilters: passesFilters,
      visibilityMatchesSearch: matchesSearch,
      visibilitySelected: isSelected,
      visibilityVisible: visible,
      visibilityProviderLogoPath: metadata.providerLogoPath,
    }
    rows.push(row)
    if (visible) visibleModels.push(row)
    if (baseVisible) baseVisibleCount += 1

    if (!namespaceMap.has(namespace)) {
      namespaceMap.set(namespace, {
        namespace,
        label: metadata.namespaceLabel,
        totalCount: 0,
        visibleCount: 0,
        baseVisibleCount: 0,
        models: [],
      })
      namespaceOrder.push(namespace)
    }
    const namespaceBucket = namespaceMap.get(namespace)
    namespaceBucket.totalCount += 1
    if (visible) namespaceBucket.visibleCount += 1
    if (baseVisible) namespaceBucket.baseVisibleCount += 1
    namespaceBucket.models.push(row)
  }

  const namespaceRows = namespaceOrder.map((namespace) => {
    const namespaceBucket = namespaceMap.get(namespace) || {
      namespace,
      label: formatOpenRouterNamespaceLabel(namespace),
      totalCount: 0,
      visibleCount: 0,
      baseVisibleCount: 0,
      models: [],
    }
    const namespaceMatchesSearch = !searchQuery || namespaceBucket.label.toLowerCase().includes(searchQuery)
    const filteredModels = namespaceBucket.models.filter((row) => {
      const passesDisplayFilters = row.visibilityPassesFilters || row.visibilitySelected
      if (!passesDisplayFilters) return false
      if (!searchQuery) return true
      return namespaceMatchesSearch || row.visibilityMatchesSearch || row.visibilitySelected
    })
    return {
      namespace: namespaceBucket.namespace,
      label: namespaceBucket.label,
      effectiveVisible: resolveOpenRouterNamespaceVisibility(normalizedVisibility, namespace),
      totalCount: namespaceBucket.totalCount,
      visibleCount: namespaceBucket.visibleCount,
      baseVisibleCount: namespaceBucket.baseVisibleCount,
      shownCount: filteredModels.length,
      models: filteredModels,
      matchesSearch: namespaceMatchesSearch || filteredModels.length > 0,
    }
  })
    .filter((row) => row.matchesSearch)
    .sort((left, right) => {
      const labelComparison = OPENROUTER_NAMESPACE_LABEL_COLLATOR.compare(left.label, right.label)
      if (labelComparison !== 0) return labelComparison
      return OPENROUTER_NAMESPACE_LABEL_COLLATOR.compare(left.namespace, right.namespace)
    })

  return {
    visibility: normalizedVisibility,
    modelRows: rows,
    visibleModels,
    baseVisibleCount,
    namespaceRows,
  }
}

export function buildProviderModelSelectionList({
  providerId = '',
  models = [],
  modelCatalogVisibility = null,
  selectedModel = '',
  search = '',
} = {}) {
  const normalizedProviderId = normalizeNamespace(providerId)
  if (normalizedProviderId !== 'openrouter') {
    return Array.isArray(models) ? models.map((model) => ({ ...model })) : []
  }
  return buildOpenRouterVisibilityView({
    models,
    visibility: modelCatalogVisibility?.openrouter,
    selectedModel,
    search,
  }).visibleModels
}
