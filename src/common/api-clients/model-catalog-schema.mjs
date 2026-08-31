import {
  TRUST_LEVEL_ORDER,
  normalizeCatalogTrustLevel,
} from './model-catalog-provenance.mjs'

const DEFAULT_AVAILABILITY_STATUS = 'unknown'
const DEFAULT_TRUST_LEVEL = 'unknown'

export const CATALOG_AVAILABILITY_STATUSES = Object.freeze([
  'configured',
  'curated',
  'verified',
  'unsupported',
  'unknown',
])

export const CATALOG_TRUST_LEVELS = Object.freeze([...TRUST_LEVEL_ORDER].sort((left, right) => {
  const stableOrder = new Map([
    ['authoritative', 0],
    ['verified', 1],
    ['estimated', 2],
    ['override', 3],
    ['unknown', 4],
  ])
  return stableOrder.get(left) - stableOrder.get(right)
}))

function trimString(value = '') {
  return String(value || '').trim()
}

function normalizeProviderId(value = '') {
  return trimString(value).toLowerCase()
}

function normalizeModelId(value = '') {
  return trimString(value)
}

function normalizePositiveInteger(value) {
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.round(Number(value)))
}

function uniqueStrings(values, { lowercase = false } = {}) {
  if (!Array.isArray(values)) return []
  const seen = new Set()
  const result = []
  for (const entry of values) {
    const normalized = lowercase ? trimString(entry).toLowerCase() : trimString(entry)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function normalizeEnum(value, allowedValues, fallbackValue) {
  const normalized = trimString(value).toLowerCase()
  return allowedValues.includes(normalized) ? normalized : fallbackValue
}

function normalizeNotes(value = '') {
  const normalized = trimString(value)
  return normalized || null
}

function normalizeCapabilitySwitch(value, {
  defaultKinds = [],
  defaultModalities = [],
} = {}) {
  if (value === true || value === false) {
    return {
      supported: value,
      kinds: [...defaultKinds],
      modalities: [...defaultModalities],
      notes: null,
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      supported: null,
      kinds: [...defaultKinds],
      modalities: [...defaultModalities],
      notes: null,
    }
  }

  return {
    supported: value.supported === true ? true : value.supported === false ? false : null,
    kinds: uniqueStrings(value.kinds),
    modalities: uniqueStrings(value.modalities, { lowercase: true }),
    mode: trimString(value.mode) || null,
    providerControls: uniqueStrings(value.providerControls),
    notes: normalizeNotes(value.notes),
  }
}

function normalizeProviderNativeRuntimeCapability(value) {
  if (value === true || value === false) {
    return {
      supported: value,
      family: null,
      surfaces: [],
      mode: null,
      notes: null,
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      supported: null,
      family: null,
      surfaces: [],
      mode: null,
      notes: null,
    }
  }

  return {
    supported: value.supported === true ? true : value.supported === false ? false : null,
    family: trimString(value.family).toLowerCase() || null,
    surfaces: uniqueStrings(value.surfaces, { lowercase: true }),
    mode: trimString(value.mode).toLowerCase() || null,
    notes: normalizeNotes(value.notes),
  }
}

function deriveLegacyAttachmentKinds(model = {}) {
  const kinds = []
  if (model.vision === true) kinds.push('image')
  if (model.supportsPdf === true) kinds.push('pdf')
  return uniqueStrings(kinds)
}

function deriveLegacyInputModalities(model = {}) {
  const modalities = ['text']
  if (model.vision === true) modalities.push('image')
  if (model.supportsPdf === true) modalities.push('file')
  return uniqueStrings(modalities, { lowercase: true })
}

function deriveTrustLevel(model = {}, provenance = {}) {
  if (trimString(provenance.trustLevel)) {
    return normalizeCatalogTrustLevel(provenance.trustLevel)
  }
  if (trimString(model.pricingSource) === 'provider' || trimString(model.contextSource) === 'provider') {
    return 'verified'
  }
  return DEFAULT_TRUST_LEVEL
}

function normalizeAvailability(value = {}, {
  defaultRequiresKey = true,
  localAvailable = null,
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      status: DEFAULT_AVAILABILITY_STATUS,
      requiresKey: defaultRequiresKey,
      localAvailable,
      gates: [],
      notes: null,
    }
  }

  return {
    status: normalizeEnum(value.status, CATALOG_AVAILABILITY_STATUSES, DEFAULT_AVAILABILITY_STATUS),
    requiresKey: value.requiresKey !== false ? defaultRequiresKey : false,
    localAvailable: typeof value.localAvailable === 'boolean' ? value.localAvailable : localAvailable,
    gates: uniqueStrings(value.gates),
    notes: normalizeNotes(value.notes),
  }
}

function normalizeProvenance(value = {}, model = {}) {
  const provenance = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const fields = provenance.fields && typeof provenance.fields === 'object' && !Array.isArray(provenance.fields)
    ? Object.fromEntries(
        Object.entries(provenance.fields).map(([fieldPath, fieldValue]) => [
          trimString(fieldPath),
          fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)
            ? { ...fieldValue }
            : fieldValue,
        ]).filter(([fieldPath]) => Boolean(fieldPath)),
      )
    : null
  return {
    source: trimString(provenance.source || model.pricingSource || model.contextSource) || 'unknown',
    sourceUrl: trimString(provenance.sourceUrl) || null,
    sourceFile: trimString(provenance.sourceFile) || null,
    verifiedAt: trimString(provenance.verifiedAt || model.verifiedAt) || null,
    trustLevel: deriveTrustLevel(model, provenance),
    notes: normalizeNotes(provenance.notes),
    ...(fields ? { fields } : {}),
  }
}

function normalizePricing(pricing = null) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return null
  const normalized = {}
  if (Array.isArray(pricing.tiers)) {
    const tiers = pricing.tiers
      .map((tier) => {
        if (!tier || typeof tier !== 'object' || Array.isArray(tier)) return null
        const normalizedTier = {
          id: trimString(tier.id || ''),
        }
        if (!normalizedTier.id) return null
        if (Number.isFinite(tier.minPromptTokens)) normalizedTier.minPromptTokens = normalizePositiveInteger(tier.minPromptTokens)
        if (Number.isFinite(tier.maxPromptTokens)) normalizedTier.maxPromptTokens = normalizePositiveInteger(tier.maxPromptTokens)
        for (const [key, value] of Object.entries(tier)) {
          if (['id', 'minPromptTokens', 'maxPromptTokens', 'notes'].includes(key)) continue
          if (!Number.isFinite(value)) continue
          normalizedTier[key] = Number(value)
        }
        if (trimString(tier.notes)) normalizedTier.notes = trimString(tier.notes)
        return Object.keys(normalizedTier).length > 1 ? normalizedTier : null
      })
      .filter(Boolean)
    if (tiers.length > 0) normalized.tiers = tiers
  }
  for (const [key, value] of Object.entries(pricing)) {
    if (key === 'notes' || key === 'tiers') continue
    if (!Number.isFinite(value)) continue
    normalized[key] = Number(value)
  }
  if (trimString(pricing.notes)) normalized.notes = trimString(pricing.notes)
  return Object.keys(normalized).length > 0 ? normalized : null
}

function normalizeVariants(variants = []) {
  if (!Array.isArray(variants)) return []
  return variants
    .map((variant) => {
      if (!variant || typeof variant !== 'object' || Array.isArray(variant)) return null
      const id = trimString(variant.id)
      if (!id) return null
      return {
        id,
        label: trimString(variant.label || id),
        ...(variant.default === true ? { default: true } : {}),
        ...(variant.providerOptions && typeof variant.providerOptions === 'object' && !Array.isArray(variant.providerOptions)
          ? { providerOptions: { ...variant.providerOptions } }
          : {}),
      }
    })
    .filter(Boolean)
}

function normalizeProcessingCapability(value = null) {
  const fast = value?.fast
  if (!fast || typeof fast !== 'object' || Array.isArray(fast)) return null
  const request = fast.request && typeof fast.request === 'object' && !Array.isArray(fast.request)
    ? { ...fast.request }
    : null
  const requestByAuthMethod = fast.requestByAuthMethod
    && typeof fast.requestByAuthMethod === 'object'
    && !Array.isArray(fast.requestByAuthMethod)
    ? Object.fromEntries(
        Object.entries(fast.requestByAuthMethod)
          .filter(([, entry]) => entry && typeof entry === 'object' && !Array.isArray(entry))
          .map(([authMethod, entry]) => [trimString(authMethod).toLowerCase(), { ...entry }])
          .filter(([authMethod]) => Boolean(authMethod)),
      )
    : null
  if (!request && !requestByAuthMethod) return null
  return {
    fast: {
      authMethods: uniqueStrings(fast.authMethods, { lowercase: true }),
      ...(request ? { request } : {}),
      ...(requestByAuthMethod ? { requestByAuthMethod } : {}),
      pricing: trimString(fast.pricing).toLowerCase() || null,
    },
  }
}

export function normalizeCatalogModelEntry(model = {}) {
  const id = normalizeModelId(model.id)
  const limits = {
    context: normalizePositiveInteger(model?.limits?.context ?? model.contextWindowTokens),
    input: normalizePositiveInteger(model?.limits?.input ?? model.inputLimitTokens ?? model.inputLimit),
    output: normalizePositiveInteger(model?.limits?.output ?? model.maxOutputTokens),
  }
  const attachmentKinds = uniqueStrings([
    ...(Array.isArray(model?.capabilities?.attachment?.kinds) ? model.capabilities.attachment.kinds : []),
    ...deriveLegacyAttachmentKinds(model),
  ])
  const inputModalities = uniqueStrings([
    ...(Array.isArray(model?.capabilities?.inputModalities) ? model.capabilities.inputModalities : []),
    ...deriveLegacyInputModalities(model),
  ], { lowercase: true })
  const outputModalities = uniqueStrings(model?.capabilities?.outputModalities, { lowercase: true })

  return {
    id,
    label: trimString(model.label || id),
    group: trimString(model.group || 'Other'),
    aliases: uniqueStrings(model.aliases),
    ...(trimString(model.releaseDate) ? { releaseDate: trimString(model.releaseDate) } : {}),
    ...(trimString(model.lastUpdated) ? { lastUpdated: trimString(model.lastUpdated) } : {}),
    ...(trimString(model.knowledge) ? { knowledge: trimString(model.knowledge) } : {}),
    ...(typeof model.structuredOutput === 'boolean' ? { structuredOutput: model.structuredOutput } : {}),
    ...(typeof model.openWeights === 'boolean' ? { openWeights: model.openWeights } : {}),
    ...(model.deprecated === true ? { deprecated: true } : {}),
    ...(trimString(model.replacementModelId) ? { replacementModelId: trimString(model.replacementModelId) } : {}),
    limits,
    pricing: normalizePricing(model.pricing),
    capabilities: {
      reasoning: normalizeCapabilitySwitch(model?.capabilities?.reasoning ?? model.reasoning),
      toolCall: normalizeCapabilitySwitch(model?.capabilities?.toolCall),
      delegation: normalizeCapabilitySwitch(model?.capabilities?.delegation),
      attachment: normalizeCapabilitySwitch(model?.capabilities?.attachment, {
        defaultKinds: attachmentKinds,
        defaultModalities: inputModalities,
      }),
      providerNativeRuntime: normalizeProviderNativeRuntimeCapability(model?.capabilities?.providerNativeRuntime),
      interleavedReasoning: normalizeCapabilitySwitch(model?.capabilities?.interleavedReasoning),
      processing: normalizeProcessingCapability(model?.capabilities?.processing),
      inputModalities,
      outputModalities,
    },
    providerTransport: trimString(model.providerTransport) || null,
    defaultProviderOptions: model.defaultProviderOptions && typeof model.defaultProviderOptions === 'object' && !Array.isArray(model.defaultProviderOptions)
      ? { ...model.defaultProviderOptions }
      : {},
    variants: normalizeVariants(model.variants),
    availability: normalizeAvailability(model.availability),
    provenance: normalizeProvenance(model.provenance, model),
    notes: normalizeNotes(model.notes),
  }
}

export function normalizeCatalogProviderEntry(provider = {}) {
  const providerId = normalizeProviderId(provider.providerId || provider.id)
  const noKeyRequired = provider.noKeyRequired === true
  const localAvailable = typeof provider.localAvailable === 'boolean' ? provider.localAvailable : null

  return {
    providerId,
    id: providerId,
    name: trimString(provider.name || providerId),
    defaultModel: normalizeModelId(provider.defaultModel),
    ...(Array.isArray(provider.env) && provider.env.length > 0 ? { env: uniqueStrings(provider.env) } : {}),
    ...(trimString(provider.keyHint) ? { keyHint: trimString(provider.keyHint) } : {}),
    ...(trimString(provider.keyUrl) ? { keyUrl: trimString(provider.keyUrl) } : {}),
    ...(trimString(provider.baseUrl) ? { baseUrl: trimString(provider.baseUrl) } : {}),
    ...(trimString(provider.termsUrl) ? { termsUrl: trimString(provider.termsUrl) } : {}),
    ...(trimString(provider.termsVersion) ? { termsVersion: trimString(provider.termsVersion) } : {}),
    ...(noKeyRequired ? { noKeyRequired: true } : {}),
    ...(localAvailable !== null ? { localAvailable } : {}),
    availability: normalizeAvailability(provider.availability, {
      defaultRequiresKey: !noKeyRequired,
      localAvailable,
    }),
    provenance: normalizeProvenance(provider.provenance, provider),
    models: Array.isArray(provider.models) ? provider.models.map(normalizeCatalogModelEntry) : [],
  }
}

export function normalizeCatalog(catalog = []) {
  if (!Array.isArray(catalog)) return []
  return catalog.map(normalizeCatalogProviderEntry)
}
