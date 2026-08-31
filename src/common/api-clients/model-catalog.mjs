import { GENERATED_MODEL_CATALOG_SNAPSHOT } from './generated/model-catalog.snapshot.mjs'
import { GENERATED_MODEL_CATALOG_LOOKUP } from './generated/model-catalog.lookup.mjs'
import { GENERATED_MODEL_CATALOG_PROVIDER_LOGOS } from './generated/model-catalog.provider-logos.mjs'
import { GENERATED_MODEL_CATALOG_PROVENANCE_MAP } from './generated/model-catalog.provenance-map.mjs'
import { normalizeCatalog } from './model-catalog-schema.mjs'
import { MODEL_CATALOG_OVERRIDES } from './model-catalog-overrides.mjs'

const DEFAULT_PROVIDER_ID_ALIASES = Object.freeze({
  google: 'gemini',
  moonshotai: 'moonshot',
  xai: 'grok',
})

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function trimString(value = '') {
  return String(value || '').trim()
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function mergePlainObjects(base = {}, override = {}) {
  const left = isPlainObject(base) ? base : {}
  const right = isPlainObject(override) ? override : {}
  const merged = { ...left }

  for (const [key, value] of Object.entries(right)) {
    if (isPlainObject(value) && isPlainObject(left[key])) {
      merged[key] = mergePlainObjects(left[key], value)
      continue
    }
    merged[key] = value
  }

  return merged
}

function mergeVariants(base = [], override = []) {
  const baseVariants = Array.isArray(base) ? base : []
  const overrideVariants = Array.isArray(override) ? override : []
  const variantMap = new Map()
  const orderedIds = []

  for (const variant of baseVariants) {
    const id = trimString(variant?.id)
    if (!id || variantMap.has(id)) continue
    orderedIds.push(id)
    variantMap.set(id, cloneJson(variant))
  }

  for (const variant of overrideVariants) {
    const id = trimString(variant?.id)
    if (!id) continue
    const existing = variantMap.get(id) || {}
    if (!variantMap.has(id)) orderedIds.push(id)
    variantMap.set(id, {
      ...existing,
      ...cloneJson(variant),
      providerOptions: mergePlainObjects(existing.providerOptions, variant?.providerOptions),
    })
  }

  return orderedIds.map((id) => variantMap.get(id)).filter(Boolean)
}

function normalizeAliasMap(aliases = {}) {
  const normalized = { ...DEFAULT_PROVIDER_ID_ALIASES }
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) {
    return normalized
  }
  for (const [sourceId, targetId] of Object.entries(aliases)) {
    const from = trimString(sourceId).toLowerCase()
    const to = trimString(targetId).toLowerCase()
    if (!from || !to) continue
    normalized[from] = to
  }
  return normalized
}

function normalizeProviderId(value = '', aliases = DEFAULT_PROVIDER_ID_ALIASES) {
  const normalized = trimString(value).toLowerCase()
  return aliases[normalized] || normalized
}

function mergeProviderMetadata(base = {}, override = {}) {
  return {
    ...base,
    ...override,
    availability: {
      ...(base.availability || {}),
      ...(override.availability || {}),
    },
    provenance: {
      ...(base.provenance || {}),
      ...(override.provenance || {}),
      fields: {
        ...(base.provenance?.fields || {}),
        ...(override.provenance?.fields || {}),
      },
    },
  }
}

function mergeModelMetadata(base = {}, override = {}) {
  return {
    ...base,
    ...override,
    limits: {
      ...(base.limits || {}),
      ...(override.limits || {}),
    },
    pricing: override.pricing || base.pricing || null,
    capabilities: {
      ...(base.capabilities || {}),
      ...(override.capabilities || {}),
      reasoning: {
        ...(base.capabilities?.reasoning || {}),
        ...(override.capabilities?.reasoning || {}),
      },
      toolCall: {
        ...(base.capabilities?.toolCall || {}),
        ...(override.capabilities?.toolCall || {}),
      },
      delegation: {
        ...(base.capabilities?.delegation || {}),
        ...(override.capabilities?.delegation || {}),
      },
      attachment: {
        ...(base.capabilities?.attachment || {}),
        ...(override.capabilities?.attachment || {}),
      },
      providerNativeRuntime: {
        ...(base.capabilities?.providerNativeRuntime || {}),
        ...(override.capabilities?.providerNativeRuntime || {}),
      },
      interleavedReasoning: {
        ...(base.capabilities?.interleavedReasoning || {}),
        ...(override.capabilities?.interleavedReasoning || {}),
      },
      processing: mergePlainObjects(
        base.capabilities?.processing,
        override.capabilities?.processing,
      ),
    },
    defaultProviderOptions: mergePlainObjects(
      base.defaultProviderOptions,
      override.defaultProviderOptions,
    ),
    variants: mergeVariants(base.variants, override.variants),
    availability: {
      ...(base.availability || {}),
      ...(override.availability || {}),
    },
    provenance: {
      ...(base.provenance || {}),
      ...(override.provenance || {}),
      fields: {
        ...(base.provenance?.fields || {}),
        ...(override.provenance?.fields || {}),
      },
    },
  }
}

function createEmptyProvider(providerId = '') {
  return {
    providerId,
    id: providerId,
    name: providerId,
    defaultModel: '',
    availability: {
      status: 'unknown',
      requiresKey: true,
      localAvailable: null,
      gates: [],
      notes: null,
    },
    provenance: {
      source: 'addom_curated_registry',
      sourceUrl: null,
      verifiedAt: null,
      trustLevel: 'override',
      notes: null,
    },
    models: [],
  }
}

function normalizeArrayOverrides(overrides = []) {
  return {
    providerAliases: { ...DEFAULT_PROVIDER_ID_ALIASES },
    providers: Array.isArray(overrides)
      ? overrides.map((override) => ({
          providerId: trimString(override?.providerId),
          includeProvider: true,
          defaultModel: trimString(override?.defaultModel),
          includeModelIds: Array.isArray(override?.includeModelIds)
            ? override.includeModelIds.map((entry) => trimString(entry)).filter(Boolean)
            : null,
          excludeModelIds: new Set(),
          providerMetadata: override?.provider && typeof override.provider === 'object' && !Array.isArray(override.provider)
            ? { ...override.provider }
            : {},
          modelOverrides: override?.models && typeof override.models === 'object' && !Array.isArray(override.models)
            ? Object.fromEntries(
                Object.entries(override.models)
                  .map(([modelId, modelOverride]) => [trimString(modelId), modelOverride])
                  .filter(([modelId, modelOverride]) => Boolean(modelId) && modelOverride && typeof modelOverride === 'object'),
              )
            : {},
        }))
      : [],
  }
}

function normalizeObjectOverrides(overrides = {}) {
  const providerAliases = normalizeAliasMap(overrides?.providerAliases)
  const providers = []
  for (const [rawProviderId, rawOverride] of Object.entries(overrides?.providers || {})) {
    const override = rawOverride && typeof rawOverride === 'object' && !Array.isArray(rawOverride)
      ? rawOverride
      : {}
    const providerId = normalizeProviderId(rawProviderId, providerAliases)
    if (!providerId) continue

    const modelOverrides = {}
    const excludeModelIds = new Set()
    for (const [rawModelId, rawModelOverride] of Object.entries(override.models || {})) {
      const modelId = trimString(rawModelId)
      if (!modelId) continue
      const modelOverride = rawModelOverride && typeof rawModelOverride === 'object' && !Array.isArray(rawModelOverride)
        ? rawModelOverride
        : {}
      if (modelOverride.include === false) {
        excludeModelIds.add(modelId)
        continue
      }
      const nextModelOverride = { ...modelOverride }
      delete nextModelOverride.include
      modelOverrides[modelId] = nextModelOverride
    }

    const providerMetadata = {}
    for (const key of ['name', 'keyHint', 'keyUrl', 'termsUrl', 'termsVersion', 'baseUrl', 'noKeyRequired', 'localAvailable', 'availability', 'provenance']) {
      if (Object.prototype.hasOwnProperty.call(override, key)) {
        providerMetadata[key] = override[key]
      }
    }

    providers.push({
      providerId,
      includeProvider: override.include !== false,
      defaultModel: trimString(override.defaultModel),
      includeModelIds: null,
      excludeModelIds,
      providerMetadata,
      modelOverrides,
    })
  }

  return {
    providerAliases,
    providers,
  }
}

function normalizeMergeOverrides(overrides = MODEL_CATALOG_OVERRIDES) {
  if (Array.isArray(overrides)) return normalizeArrayOverrides(overrides)
  if (overrides && typeof overrides === 'object') return normalizeObjectOverrides(overrides)
  return normalizeArrayOverrides([])
}

function buildOrderedModels(existingModels = [], modelMap = new Map(), {
  includeModelIds = null,
  excludeModelIds = new Set(),
} = {}) {
  if (Array.isArray(includeModelIds) && includeModelIds.length > 0) {
    return includeModelIds
      .map((modelId) => modelMap.get(modelId))
      .filter(Boolean)
  }

  const ordered = []
  const seen = new Set()
  for (const model of existingModels) {
    const modelId = trimString(model?.id)
    if (!modelId || seen.has(modelId) || excludeModelIds.has(modelId)) continue
    const nextModel = modelMap.get(modelId)
    if (!nextModel) continue
    seen.add(modelId)
    ordered.push(nextModel)
  }

  const appended = Array.from(modelMap.values())
    .filter((model) => {
      const modelId = trimString(model?.id)
      return modelId && !seen.has(modelId) && !excludeModelIds.has(modelId)
    })
    .sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')))

  return [...ordered, ...appended]
}

export function mergeModelCatalog({
  generatedSnapshot = GENERATED_MODEL_CATALOG_SNAPSHOT,
  overrides = MODEL_CATALOG_OVERRIDES,
} = {}) {
  const normalizedOverrides = normalizeMergeOverrides(overrides)
  const providerAliases = normalizeAliasMap(normalizedOverrides.providerAliases)
  const providerMap = new Map(
    normalizeCatalog(generatedSnapshot).map((provider) => {
      const providerId = normalizeProviderId(provider.providerId, providerAliases)
      return [providerId, {
        ...provider,
        providerId,
        id: providerId,
      }]
    }),
  )

  for (const override of normalizedOverrides.providers) {
    const providerId = normalizeProviderId(override.providerId, providerAliases)
    if (!providerId) continue
    if (override.includeProvider === false) {
      providerMap.delete(providerId)
      continue
    }

    const existing = providerMap.get(providerId) || createEmptyProvider(providerId)
    const mergedProvider = mergeProviderMetadata(existing, override.providerMetadata)
    mergedProvider.providerId = providerId
    mergedProvider.id = providerId
    mergedProvider.defaultModel = override.defaultModel || existing.defaultModel

    const existingModels = Array.isArray(existing.models) ? existing.models : []
    const modelMap = new Map(existingModels.map((model) => [trimString(model.id), model]))

    for (const modelId of override.excludeModelIds || []) {
      modelMap.delete(modelId)
    }

    for (const [modelId, modelOverride] of Object.entries(override.modelOverrides || {})) {
      const currentModel = modelMap.get(modelId) || { id: modelId, label: modelId, group: 'Other' }
      modelMap.set(modelId, mergeModelMetadata(currentModel, modelOverride))
    }

    mergedProvider.models = buildOrderedModels(existingModels, modelMap, override)
    providerMap.set(providerId, mergedProvider)
  }

  return {
    providerAliases,
    providers: normalizeCatalog(
      Array.from(providerMap.values()).sort((left, right) => left.providerId.localeCompare(right.providerId)),
    ),
  }
}

export function getMergedCatalogProvider(mergedCatalog = null, providerId = '') {
  const providerAliases = normalizeAliasMap(mergedCatalog?.providerAliases)
  const normalized = normalizeProviderId(providerId, providerAliases)
  const provider = Array.isArray(mergedCatalog?.providers)
    ? mergedCatalog.providers.find((entry) => entry.providerId === normalized)
    : null
  return provider ? cloneJson(provider) : null
}

const MERGED_MODEL_CATALOG = Object.freeze(mergeModelCatalog())

export function listModelCatalogProviders() {
  return cloneJson(MERGED_MODEL_CATALOG.providers)
}

export function getModelCatalogProvider(providerId = '') {
  return getMergedCatalogProvider(MERGED_MODEL_CATALOG, providerId)
}

export function listModelCatalogModelsForProvider(providerId = '', { includeDeprecated = false } = {}) {
  const provider = getModelCatalogProvider(providerId)
  if (!provider) return []
  return (provider.models || []).filter((model) => includeDeprecated || model.deprecated !== true)
}

export function getMergedModelCatalogSnapshot() {
  return cloneJson(MERGED_MODEL_CATALOG.providers)
}

export function getGeneratedModelCatalogProviderLookup(providerId = '') {
  const normalized = normalizeProviderId(providerId)
  const entry = GENERATED_MODEL_CATALOG_LOOKUP?.providersById?.[normalized]
  return entry ? cloneJson(entry) : null
}

export function getGeneratedModelCatalogModelLookup(providerId = '', modelId = '') {
  const normalizedProviderId = normalizeProviderId(providerId)
  const normalizedModelId = trimString(modelId)
  if (!normalizedProviderId || !normalizedModelId) return null
  const entry = GENERATED_MODEL_CATALOG_LOOKUP?.modelsByProviderId?.[normalizedProviderId]?.[normalizedModelId]
  return entry ? cloneJson(entry) : null
}

export function getModelCatalogProviderLogo(providerId = '') {
  const normalized = normalizeProviderId(providerId)
  const entry = GENERATED_MODEL_CATALOG_PROVIDER_LOGOS?.[normalized]
  return entry ? cloneJson(entry) : null
}

export function getGeneratedModelCatalogProviderProvenance(providerId = '') {
  const normalized = normalizeProviderId(providerId)
  const entry = GENERATED_MODEL_CATALOG_PROVENANCE_MAP?.providersById?.[normalized]
  return entry ? cloneJson(entry) : null
}

export function getGeneratedModelCatalogModelProvenance(providerId = '', modelId = '') {
  const normalizedProviderId = normalizeProviderId(providerId)
  const normalizedModelId = trimString(modelId)
  if (!normalizedProviderId || !normalizedModelId) return null
  const entry = GENERATED_MODEL_CATALOG_PROVENANCE_MAP?.modelsByProviderId?.[normalizedProviderId]?.[normalizedModelId]
  return entry ? cloneJson(entry) : null
}
