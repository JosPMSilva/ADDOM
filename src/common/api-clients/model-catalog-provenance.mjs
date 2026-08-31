function trimString(value = '') {
  return String(value || '').trim()
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return trimString(value).length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

export const TRUST_LEVEL_ORDER = Object.freeze([
  'unknown',
  'estimated',
  'verified',
  'authoritative',
  'override',
])

const TRUST_LEVEL_RANK = Object.freeze(
  Object.fromEntries(TRUST_LEVEL_ORDER.map((level, index) => [level, index])),
)

const GENERATED_POLICY_LIST = Object.freeze([
  {
    fieldPath: 'provider.defaultModel',
    owner: 'addom',
    category: 'routing',
    minimumTrustLevel: 'verified',
    allowUnknown: false,
    requiresOverride: true,
    placeholderReason: 'curated_default_model_required',
  },
  {
    fieldPath: 'model.pricing',
    owner: 'generated',
    category: 'financial',
    minimumTrustLevel: 'verified',
    allowUnknown: false,
    requiresOverride: false,
    generatedTrustLevel: 'estimated',
  },
  {
    fieldPath: 'model.limits',
    owner: 'generated',
    category: 'limits',
    minimumTrustLevel: 'verified',
    allowUnknown: false,
    requiresOverride: false,
    generatedTrustLevel: 'estimated',
  },
  {
    fieldPath: 'model.capabilities.reasoning',
    owner: 'generated',
    category: 'capability',
    minimumTrustLevel: 'estimated',
    allowUnknown: true,
    requiresOverride: false,
    generatedTrustLevel: 'estimated',
  },
  {
    fieldPath: 'model.capabilities.toolCall',
    owner: 'generated',
    category: 'capability',
    minimumTrustLevel: 'estimated',
    allowUnknown: true,
    requiresOverride: false,
    generatedTrustLevel: 'estimated',
  },
  {
    fieldPath: 'model.capabilities.attachment',
    owner: 'generated',
    category: 'capability',
    minimumTrustLevel: 'estimated',
    allowUnknown: true,
    requiresOverride: false,
    generatedTrustLevel: 'estimated',
  },
  {
    fieldPath: 'model.availability',
    owner: 'addom',
    category: 'availability',
    minimumTrustLevel: 'override',
    allowUnknown: true,
    requiresOverride: true,
    placeholderReason: 'availability_must_be_resolved_locally',
  },
])

const GENERATED_POLICY_MAP = Object.freeze(
  Object.fromEntries(GENERATED_POLICY_LIST.map((policy) => [policy.fieldPath, policy])),
)

const COMPAT_FIELD_MAP = Object.freeze({
  'provider.defaultModel': 'provider.defaultModel',
  'model.pricing': 'model.pricing',
  'model.limits.context': 'model.limits',
  'model.limits.output': 'model.limits',
  'model.capabilities.reasoning': 'model.capabilities.reasoning',
  'model.capabilities.toolCall': 'model.capabilities.toolCall',
  'model.capabilities.attachment': 'model.capabilities.attachment',
  'model.availability.status': 'model.availability',
})

function clonePolicy(policy) {
  return policy ? { ...policy } : null
}

function normalizeTrustLevel(value = '') {
  const normalized = trimString(value).toLowerCase()
  return Object.prototype.hasOwnProperty.call(TRUST_LEVEL_RANK, normalized) ? normalized : 'unknown'
}

function resolvePolicyPath(fieldPath = '') {
  const normalized = trimString(fieldPath)
  return COMPAT_FIELD_MAP[normalized] || normalized
}

export function normalizeCatalogTrustLevel(value = '') {
  return normalizeTrustLevel(value)
}

export function listModelCatalogFieldPolicies() {
  return GENERATED_POLICY_LIST.map(clonePolicy)
}

export function getModelCatalogFieldPolicy(fieldPath = '') {
  const resolved = resolvePolicyPath(fieldPath)
  return clonePolicy(GENERATED_POLICY_MAP[resolved] || null)
}

export function resolveGeneratedFieldProvenance(fieldPath = '', value) {
  const policy = getModelCatalogFieldPolicy(fieldPath)
  if (!policy) return null

  if (policy.requiresOverride) {
    return {
      fieldPath: policy.fieldPath,
      state: 'placeholder',
      trustLevel: 'unknown',
      requiresOverride: true,
      reason: policy.placeholderReason,
    }
  }

  if (!hasMeaningfulValue(value)) {
    return {
      fieldPath: policy.fieldPath,
      state: 'missing',
      trustLevel: 'unknown',
      requiresOverride: false,
      reason: 'missing_generated_value',
    }
  }

  return {
    fieldPath: policy.fieldPath,
    state: 'generated',
    trustLevel: policy.generatedTrustLevel || 'estimated',
    requiresOverride: false,
    reason: 'generated_from_models_dev',
  }
}

export function buildGeneratedProviderFieldProvenance(provider = {}) {
  return {
    defaultModel: resolveGeneratedFieldProvenance('provider.defaultModel', provider.defaultModel),
  }
}

export function buildGeneratedModelFieldProvenance(model = {}) {
  return {
    pricing: resolveGeneratedFieldProvenance('model.pricing', model.pricing),
    limits: resolveGeneratedFieldProvenance('model.limits', model.limits),
    reasoning: resolveGeneratedFieldProvenance('model.capabilities.reasoning', model?.capabilities?.reasoning),
    toolCall: resolveGeneratedFieldProvenance('model.capabilities.toolCall', model?.capabilities?.toolCall),
    attachment: resolveGeneratedFieldProvenance('model.capabilities.attachment', model?.capabilities?.attachment),
    availability: resolveGeneratedFieldProvenance('model.availability', model.availability),
  }
}

export function attachGeneratedSourceFileProvenance(provenance = {}, sourceFile = '') {
  const normalizedSourceFile = trimString(sourceFile)
  if (!normalizedSourceFile) return provenance
  return {
    ...provenance,
    sourceFile: normalizedSourceFile,
  }
}

export function listCatalogFieldPolicies() {
  return [
    'provider.defaultModel',
    'model.pricing',
    'model.limits.context',
    'model.limits.output',
    'model.capabilities.reasoning',
    'model.capabilities.attachment',
    'model.capabilities.toolCall',
    'model.availability.status',
  ]
    .map((fieldPath) => classifyCatalogFieldPolicy(fieldPath))
    .filter(Boolean)
}

export function classifyCatalogFieldPolicy(fieldPath = '') {
  const policy = getModelCatalogFieldPolicy(fieldPath)
  if (!policy) return null
  const resolvedFieldPath = trimString(fieldPath)
  return {
    fieldPath: resolvedFieldPath,
    category: policy.category,
    minimumTrustLevel: policy.minimumTrustLevel,
    allowUnknown: policy.allowUnknown,
  }
}

export function isCatalogFieldTrustSufficient(fieldPath = '', trustLevel = '') {
  const policy = classifyCatalogFieldPolicy(fieldPath)
  if (!policy) return false
  const normalizedTrustLevel = normalizeTrustLevel(trustLevel)
  if (normalizedTrustLevel === 'unknown' && policy.allowUnknown) return true
  return TRUST_LEVEL_RANK[normalizedTrustLevel] >= TRUST_LEVEL_RANK[policy.minimumTrustLevel]
}

function normalizeOpenRouterLiveReason(reason = '') {
  const normalized = trimString(reason)
  switch (normalized) {
    case 'estimated_openrouter_supported_parameters':
      return {
        source: 'openrouter_live',
        trustLevel: 'estimated',
        state: 'estimated',
        reason: 'inferred_from_openrouter_supported_parameters',
      }
    case 'estimated_openrouter_architecture':
      return {
        source: 'openrouter_live',
        trustLevel: 'estimated',
        state: 'estimated',
        reason: 'inferred_from_openrouter_architecture',
      }
    case 'openrouter_live':
      return {
        source: 'openrouter_live',
        trustLevel: 'estimated',
        state: 'live',
        reason: 'from_openrouter_live_payload',
      }
    default:
      return null
  }
}

function buildUnknownOpenRouterFieldProvenance(fieldPath = '') {
  return {
    fieldPath,
    source: 'unknown',
    trustLevel: 'unknown',
    state: 'unknown',
    reason: 'no_reviewed_catalog_or_live_evidence',
  }
}

function buildReviewedOpenRouterFieldProvenance(fieldPath = '', reviewedEntry = null) {
  return {
    fieldPath,
    source: 'addom_openrouter_reviewed_route',
    trustLevel: 'verified',
    state: 'reviewed',
    reason: 'resolved_from_addom_reviewed_openrouter_route',
    ...(trimString(reviewedEntry?.routeId) ? { routeId: trimString(reviewedEntry.routeId) } : {}),
  }
}

function buildCatalogOpenRouterFieldProvenance(fieldPath = '', catalogModel = null, fallbackReason = 'resolved_from_catalog_match') {
  const modelProvenance = catalogModel?.provenance && typeof catalogModel.provenance === 'object'
    ? catalogModel.provenance
    : {}
  const fieldKey = fieldPath === 'model.capabilities.toolCall'
    ? 'toolCall'
    : (fieldPath === 'model.capabilities.reasoning'
      ? 'reasoning'
      : (fieldPath === 'model.capabilities.vision'
        ? 'attachment'
        : (fieldPath === 'model.limits'
          ? 'limits'
          : (fieldPath === 'model.pricing' ? 'pricing' : ''))))
  const fieldProvenance = fieldKey && modelProvenance?.fields && typeof modelProvenance.fields === 'object'
    ? modelProvenance.fields[fieldKey]
    : null
  return {
    fieldPath,
    source: trimString(fieldProvenance?.source || modelProvenance?.source) || 'models.dev',
    trustLevel: normalizeTrustLevel(fieldProvenance?.trustLevel || modelProvenance?.trustLevel) || 'estimated',
    state: fieldProvenance?.state === 'generated' ? 'catalog' : (trimString(fieldProvenance?.state) || 'catalog'),
    reason: trimString(fieldProvenance?.reason) || fallbackReason,
    ...(trimString(catalogModel?.id) ? { catalogModelId: trimString(catalogModel.id) } : {}),
  }
}

function buildLiveOpenRouterFieldProvenance(fieldPath = '', liveReason = '') {
  const normalized = normalizeOpenRouterLiveReason(liveReason)
  if (!normalized) return buildUnknownOpenRouterFieldProvenance(fieldPath)
  return {
    fieldPath,
    ...normalized,
  }
}

function catalogModelHasToolEvidence(model = {}) {
  return (
    model?.capabilities?.toolCall?.supported === true
    || model?.capabilities?.providerNativeRuntime?.supported === true
  )
}

function catalogModelHasReasoningEvidence(model = {}) {
  return model?.capabilities?.reasoning?.supported === true
}

function catalogModelHasVisionEvidence(model = {}) {
  const inputModalities = Array.isArray(model?.capabilities?.inputModalities)
    ? model.capabilities.inputModalities
    : []
  const attachmentKinds = Array.isArray(model?.capabilities?.attachment?.kinds)
    ? model.capabilities.attachment.kinds
    : []
  return inputModalities.includes('image') || attachmentKinds.includes('image')
}

export function buildOpenRouterRouteFieldProvenance({
  reviewedEntry = null,
  catalogModel = null,
  liveModel = null,
} = {}) {
  const liveProvenance = liveModel?.openrouterCapabilityProvenance && typeof liveModel.openrouterCapabilityProvenance === 'object'
    ? liveModel.openrouterCapabilityProvenance
    : {}
  const liveContextLength = Number(liveModel?.openrouterLive?.contextLength || 0)
  const livePricing = liveModel?.openrouterLive?.pricing && typeof liveModel.openrouterLive.pricing === 'object'
    ? liveModel.openrouterLive.pricing
    : null
  const catalogHasLimits = Number.isFinite(catalogModel?.limits?.context) || Number.isFinite(catalogModel?.contextWindowTokens)
  const catalogHasPricing = catalogModel?.pricing && typeof catalogModel.pricing === 'object' && Object.keys(catalogModel.pricing).length > 0

  return {
    tools: reviewedEntry
      ? buildReviewedOpenRouterFieldProvenance('model.capabilities.toolCall', reviewedEntry)
      : (catalogModelHasToolEvidence(catalogModel)
        ? buildCatalogOpenRouterFieldProvenance('model.capabilities.toolCall', catalogModel)
        : buildLiveOpenRouterFieldProvenance('model.capabilities.toolCall', liveProvenance.tools)),
    reasoning: reviewedEntry
      ? buildReviewedOpenRouterFieldProvenance('model.capabilities.reasoning', reviewedEntry)
      : (catalogModelHasReasoningEvidence(catalogModel)
        ? buildCatalogOpenRouterFieldProvenance('model.capabilities.reasoning', catalogModel)
        : buildLiveOpenRouterFieldProvenance('model.capabilities.reasoning', liveProvenance.reasoning)),
    reasoningEffort: reviewedEntry
      ? buildReviewedOpenRouterFieldProvenance('model.capabilities.reasoningEffort', reviewedEntry)
      : buildLiveOpenRouterFieldProvenance('model.capabilities.reasoningEffort', liveProvenance.reasoningEffort),
    vision: reviewedEntry
      ? buildReviewedOpenRouterFieldProvenance('model.capabilities.vision', reviewedEntry)
      : (catalogModelHasVisionEvidence(catalogModel)
        ? buildCatalogOpenRouterFieldProvenance('model.capabilities.vision', catalogModel, 'resolved_from_catalog_modalities')
        : buildLiveOpenRouterFieldProvenance('model.capabilities.vision', liveProvenance.vision)),
    limits: catalogHasLimits
      ? buildCatalogOpenRouterFieldProvenance('model.limits', catalogModel)
      : (liveContextLength > 0
        ? buildLiveOpenRouterFieldProvenance('model.limits', liveProvenance.limits)
        : buildUnknownOpenRouterFieldProvenance('model.limits')),
    pricing: catalogHasPricing
      ? buildCatalogOpenRouterFieldProvenance('model.pricing', catalogModel)
      : (livePricing
        ? buildLiveOpenRouterFieldProvenance('model.pricing', liveProvenance.pricing)
        : buildUnknownOpenRouterFieldProvenance('model.pricing')),
  }
}
