import { GENERATED_MODEL_CATALOG_SNAPSHOT } from './generated/model-catalog.snapshot.mjs'
import { MODEL_PROVIDER_REGISTRY_DATA } from './model-registry-data.mjs'

function trimString(value = '') {
  return String(value || '').trim()
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

const PROVIDER_ID_ALIASES = Object.freeze({
  google: 'gemini',
  moonshotai: 'moonshot',
  xai: 'grok',
})

function normalizeProviderId(value = '') {
  const normalized = trimString(value).toLowerCase()
  return PROVIDER_ID_ALIASES[normalized] || normalized
}

const GENERATED_MODEL_INDEX = Object.freeze(
  Object.fromEntries(
    (Array.isArray(GENERATED_MODEL_CATALOG_SNAPSHOT) ? GENERATED_MODEL_CATALOG_SNAPSHOT : [])
      .map((provider) => [
        normalizeProviderId(provider?.providerId),
        Object.fromEntries(
          (Array.isArray(provider?.models) ? provider.models : [])
            .map((model) => [trimString(model?.id), model])
            .filter(([modelId]) => Boolean(modelId)),
        ),
      ]),
  ),
)

function getGeneratedModel(providerId = '', modelId = '') {
  const normalizedProviderId = normalizeProviderId(providerId)
  const normalizedModelId = trimString(modelId)
  if (!normalizedProviderId || !normalizedModelId) return null
  return GENERATED_MODEL_INDEX[normalizedProviderId]?.[normalizedModelId] || null
}

function hasGeneratedLimits(model = null) {
  return Number.isFinite(model?.limits?.context) || Number.isFinite(model?.limits?.output)
}

function hasGeneratedPricing(model = null) {
  const pricing = model?.pricing
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return false
  return Object.keys(pricing).some((key) => Number.isFinite(pricing[key]))
}

function hasGeneratedReasoning(model = null) {
  return typeof model?.capabilities?.reasoning?.supported === 'boolean'
}

function hasGeneratedAttachment(model = null) {
  const attachment = model?.capabilities?.attachment
  const inputModalities = Array.isArray(model?.capabilities?.inputModalities)
    ? model.capabilities.inputModalities
    : []
  return typeof attachment?.supported === 'boolean'
    || attachment?.kinds?.length > 0
    || attachment?.modalities?.length > 0
    || inputModalities.length > 0
}

function normalizeModelOverride(providerId = '', model = {}) {
  const normalizedProviderId = trimString(providerId).toLowerCase()
  const generatedModel = getGeneratedModel(providerId, model.id)
  const preserveLegacyFactualFields = normalizedProviderId === 'openrouter' && !generatedModel
  const preserveLimits = preserveLegacyFactualFields || !hasGeneratedLimits(generatedModel)
  const preservePricing = preserveLegacyFactualFields || !hasGeneratedPricing(generatedModel)
  const preserveReasoning = (model.reasoning === true) && (preserveLegacyFactualFields || !hasGeneratedReasoning(generatedModel))
  const preserveAttachment = (model.vision === true || model.supportsPdf === true)
    && (preserveLegacyFactualFields || !hasGeneratedAttachment(generatedModel))
  const rawCapabilities = isPlainObject(model.capabilities) ? cloneJson(model.capabilities) : {}
  const rawReasoning = isPlainObject(rawCapabilities.reasoning) ? rawCapabilities.reasoning : {}
  const rawAttachment = isPlainObject(rawCapabilities.attachment) ? rawCapabilities.attachment : {}
  const rawProviderNativeRuntime = isPlainObject(rawCapabilities.providerNativeRuntime)
    ? rawCapabilities.providerNativeRuntime
    : {}
  const provenanceFields = {}

  if (preserveLimits) {
    provenanceFields.limits = {
      state: 'override',
      trustLevel: 'override',
      reason: 'retained_curated_limit_until_toml_migration',
    }
  }
  if (preservePricing) {
    provenanceFields.pricing = {
      state: 'override',
      trustLevel: 'override',
      reason: 'retained_curated_pricing_until_toml_migration',
    }
  }
  if (preserveReasoning) {
    provenanceFields.reasoning = {
      state: 'override',
      trustLevel: 'override',
      reason: 'retained_curated_reasoning_until_toml_migration',
    }
  }
  if (preserveAttachment) {
    provenanceFields.attachment = {
      state: 'override',
      trustLevel: 'override',
      reason: 'retained_curated_attachment_until_toml_migration',
    }
  }

  return {
    id: trimString(model.id),
    label: trimString(model.label || model.id),
    group: trimString(model.group || 'Other'),
    ...(Array.isArray(model.aliases) && model.aliases.length > 0 ? { aliases: model.aliases.map((entry) => trimString(entry)).filter(Boolean) } : {}),
    ...(model.deprecated === true ? { deprecated: true } : {}),
    ...(trimString(model.replacementModelId) ? { replacementModelId: trimString(model.replacementModelId) } : {}),
    ...(preserveLegacyFactualFields && trimString(model.releaseDate) ? { releaseDate: trimString(model.releaseDate) } : {}),
    ...(preserveLegacyFactualFields && trimString(model.lastUpdated) ? { lastUpdated: trimString(model.lastUpdated) } : {}),
    ...(preserveLegacyFactualFields && trimString(model.knowledge) ? { knowledge: trimString(model.knowledge) } : {}),
    ...(preserveLegacyFactualFields && typeof model.structuredOutput === 'boolean' ? { structuredOutput: model.structuredOutput === true } : {}),
    ...(preserveAttachment && model.vision === true ? { vision: true } : {}),
    ...(preserveAttachment && model.supportsPdf === true ? { supportsPdf: true } : {}),
    ...(preserveLimits
      ? {
          limits: {
            ...(Number.isFinite(model.contextWindowTokens) ? { context: Number(model.contextWindowTokens) } : {}),
            ...(Number.isFinite(model.inputLimitTokens) ? { input: Number(model.inputLimitTokens) } : {}),
            ...(Number.isFinite(model.inputLimit) && !Number.isFinite(model.inputLimitTokens) ? { input: Number(model.inputLimit) } : {}),
            ...(Number.isFinite(model.maxOutputTokens) ? { output: Number(model.maxOutputTokens) } : {}),
          },
        }
      : {}),
    ...(preservePricing && model.pricing && typeof model.pricing === 'object' ? { pricing: { ...model.pricing } } : {}),
    capabilities: {
      ...rawCapabilities,
      reasoning: {
        ...rawReasoning,
        ...(preserveReasoning ? { supported: true } : {}),
      },
      attachment: {
        ...rawAttachment,
        ...(preserveAttachment ? { supported: true } : {}),
      },
      providerNativeRuntime: model.providerNativeRuntime && typeof model.providerNativeRuntime === 'object' && !Array.isArray(model.providerNativeRuntime)
        ? {
            ...rawProviderNativeRuntime,
            supported: model.providerNativeRuntime.supported === true
              ? true
              : (model.providerNativeRuntime.supported === false ? false : null),
            ...(trimString(model.providerNativeRuntime.family)
              ? { family: trimString(model.providerNativeRuntime.family).toLowerCase() }
              : {}),
            ...(Array.isArray(model.providerNativeRuntime.surfaces)
              ? { surfaces: model.providerNativeRuntime.surfaces.map((entry) => trimString(entry).toLowerCase()).filter(Boolean) }
              : {}),
            ...(trimString(model.providerNativeRuntime.mode)
              ? { mode: trimString(model.providerNativeRuntime.mode).toLowerCase() }
              : {}),
            ...(trimString(model.providerNativeRuntime.notes)
              ? { notes: trimString(model.providerNativeRuntime.notes) }
              : {}),
          }
        : (Object.keys(rawProviderNativeRuntime).length > 0 ? rawProviderNativeRuntime : undefined),
      },
    ...(trimString(model.providerTransport) ? { providerTransport: trimString(model.providerTransport) } : {}),
    ...(model.defaultProviderOptions && typeof model.defaultProviderOptions === 'object' && !Array.isArray(model.defaultProviderOptions)
      ? { defaultProviderOptions: cloneJson(model.defaultProviderOptions) }
      : {}),
    ...(Array.isArray(model.variants) ? { variants: cloneJson(model.variants) } : {}),
    ...(model.availability && typeof model.availability === 'object' && !Array.isArray(model.availability)
      ? { availability: cloneJson(model.availability) }
      : {}),
    ...(trimString(model.notes) ? { notes: trimString(model.notes) } : {}),
    ...(preserveLegacyFactualFields
      ? {
          provenance: {
            source: 'addom_curated_registry',
            verifiedAt: trimString(model.verifiedAt) || null,
            trustLevel: 'override',
          },
        }
      : (Object.keys(provenanceFields).length > 0
          ? {
              provenance: {
                fields: provenanceFields,
              },
            }
          : {})),
  }
}

function normalizeProviderOverride(provider = {}) {
  const includeModelIds = Array.isArray(provider.models)
    ? provider.models.map((model) => trimString(model.id)).filter(Boolean)
    : []
  const models = Object.fromEntries(
    (provider.models || [])
      .map((model) => normalizeModelOverride(provider.providerId, model))
      .filter((model) => model.id)
      .map((model) => [model.id, model]),
  )

  return {
    providerId: trimString(provider.providerId).toLowerCase(),
    defaultModel: trimString(provider.defaultModel),
    includeModelIds,
    provider: {
      name: trimString(provider.name),
      ...(trimString(provider.keyHint) ? { keyHint: trimString(provider.keyHint) } : {}),
      ...(trimString(provider.keyUrl) ? { keyUrl: trimString(provider.keyUrl) } : {}),
      ...(trimString(provider.termsUrl) ? { termsUrl: trimString(provider.termsUrl) } : {}),
      ...(trimString(provider.termsVersion) ? { termsVersion: trimString(provider.termsVersion) } : {}),
      ...(trimString(provider.baseUrl) ? { baseUrl: trimString(provider.baseUrl) } : {}),
      ...(provider.noKeyRequired === true ? { noKeyRequired: true } : {}),
      ...(Object.prototype.hasOwnProperty.call(provider, 'localAvailable') ? { localAvailable: provider.localAvailable === true } : {}),
    },
    models,
  }
}

export const MODEL_CATALOG_OVERRIDES = Object.freeze(
  MODEL_PROVIDER_REGISTRY_DATA
    .map(normalizeProviderOverride),
)
