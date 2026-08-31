import {
  canonicalizeRegistryModelSelection,
  listRegistryProviders,
  listRegistryModelsForProvider,
  resolveRegistryModel,
} from './model-registry.mjs'

const DEFAULT_FALLBACK_LIMIT = 128_000
const MIN_PREFIX_LENGTH = 6
const VERIFIED_FALLBACK_DATE = '2026-03-06'
const REGISTERED_PROVIDER_IDS = new Set(
  listRegistryProviders()
    .map((provider) => String(provider?.id || provider?.providerId || '').trim().toLowerCase())
    .filter(Boolean),
)

function normalizeProvenance(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeModelId(value = '') {
  return String(value || '').trim()
}

function buildEstimatedPrefixCandidates(providerId = '') {
  const models = listRegistryModelsForProvider(providerId, { includeDeprecated: true })
  const candidates = []
  const seen = new Set()

  for (const model of models) {
    const limitTokens = Number.isFinite(model?.contextWindowTokens)
      ? Math.max(0, Math.round(Number(model.contextWindowTokens)))
      : null
    if (!Number.isFinite(limitTokens) || limitTokens <= 0) continue

    const maxOutputTokens = Number.isFinite(model?.maxOutputTokens)
      ? Math.max(0, Math.round(Number(model.maxOutputTokens)))
      : null
    const verifiedAt = String(model?.verifiedAt || '').trim() || VERIFIED_FALLBACK_DATE
    const prefixes = [
      normalizeModelId(model?.id),
      ...(Array.isArray(model?.aliases) ? model.aliases.map((alias) => normalizeModelId(alias)) : []),
    ]

    for (const prefix of prefixes) {
      if (!prefix || prefix.length < MIN_PREFIX_LENGTH) continue
      const normalizedPrefix = prefix.toLowerCase()
      if (seen.has(normalizedPrefix)) continue
      seen.add(normalizedPrefix)
      candidates.push({
        prefix,
        limitTokens,
        ...(Number.isFinite(maxOutputTokens) ? { maxOutputTokens } : {}),
        verifiedAt,
      })
    }
  }

  return candidates.sort((left, right) => String(right.prefix).length - String(left.prefix).length)
}

const PREFIX_LIMIT_CACHE = new Map()

function resolveEstimatedPrefixCandidates(providerId = '') {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  if (!normalizedProviderId) return []
  if (PREFIX_LIMIT_CACHE.has(normalizedProviderId)) {
    return PREFIX_LIMIT_CACHE.get(normalizedProviderId)
  }
  const candidates = REGISTERED_PROVIDER_IDS.has(normalizedProviderId)
    ? buildEstimatedPrefixCandidates(normalizedProviderId)
    : []
  PREFIX_LIMIT_CACHE.set(normalizedProviderId, candidates)
  return candidates
}

export function deriveContextLimitPrecision(provenance = '') {
  const p = normalizeProvenance(provenance)
  if (p === 'exact') return 'exact'
  if (p === 'provider') return 'exact'
  if (p === 'openrouter_fallback' || p === 'verified_fallback') return 'verified_fallback'
  return 'estimated'
}

export function resolveModelContextLimit(providerId, modelId, {
  fallbackLimit = DEFAULT_FALLBACK_LIMIT,
} = {}) {
  const provider = String(providerId ?? '').trim().toLowerCase()
  const model = String(modelId ?? '').trim()
  const modelKey = model.toLowerCase()
  const safeFallback = Number.isFinite(fallbackLimit)
    ? Math.max(8_000, Math.round(fallbackLimit))
    : DEFAULT_FALLBACK_LIMIT

  if (!provider || !model) {
    const source = 'estimated'
    return {
      limitTokens: safeFallback,
      source,
      provenance: source,
      precision: deriveContextLimitPrecision(source),
      lastVerified: null,
      note: 'Missing provider/model; using conservative fallback.',
    }
  }

  const canonicalSelection = canonicalizeRegistryModelSelection(provider, model)
  const resolvedProvider = String(canonicalSelection.providerId || provider).trim().toLowerCase()
  const resolvedModel = String(canonicalSelection.modelId || model).trim()
  const registry = resolveRegistryModel(resolvedProvider, resolvedModel)
  if (Number.isFinite(registry?.model?.contextWindowTokens)) {
    const source = String(registry?.model?.contextSource || 'registry')
    return {
      limitTokens: registry.model.contextWindowTokens,
      ...(Number.isFinite(registry?.model?.maxOutputTokens) ? { maxOutputTokens: registry.model.maxOutputTokens } : {}),
      source,
      provenance: source,
      precision: deriveContextLimitPrecision(source),
      lastVerified: registry?.model?.verifiedAt || null,
      note: canonicalSelection.reason === 'deprecated_replacement' || registry?.isDeprecated
        ? `Curated model registry (deprecated; replacement: ${resolvedModel || registry?.replacementModelId || 'n/a'}).`
        : (canonicalSelection.changed || registry?.matchedBy === 'alias'
            ? `Curated model registry via alias -> ${registry?.canonicalModelId || resolvedModel}.`
            : 'Curated model registry.'),
    }
  }

  const resolvedModelKey = resolvedModel.toLowerCase() || modelKey
  const prefixHit = resolveEstimatedPrefixCandidates(resolvedProvider).find((entry) => (
    resolvedModelKey.startsWith(String(entry.prefix).toLowerCase())
  ))
  if (prefixHit) {
    const source = 'estimated'
    return {
      limitTokens: prefixHit.limitTokens,
      ...(Number.isFinite(prefixHit.maxOutputTokens) ? { maxOutputTokens: prefixHit.maxOutputTokens } : {}),
      source,
      provenance: source,
      precision: deriveContextLimitPrecision(source),
      lastVerified: prefixHit.verifiedAt || VERIFIED_FALLBACK_DATE,
      note: `Estimated from generated catalog family prefix (${resolvedProvider}:${prefixHit.prefix || '*'})`,
    }
  }

  const source = 'estimated'
  return {
    limitTokens: safeFallback,
    maxOutputTokens: null,
    source,
    provenance: source,
    precision: deriveContextLimitPrecision(source),
    lastVerified: VERIFIED_FALLBACK_DATE,
    note: 'Unknown custom model; using conservative fallback.',
  }
}

export function attachModelContextMetadata(providerId, model = {}) {
  const resolved = resolveModelContextLimit(providerId, model.id)
  return {
    ...model,
    contextWindow: resolved.limitTokens,
    contextWindowSource: resolved.source,
    contextWindowProvenance: resolved.provenance,
    contextWindowPrecision: resolved.precision,
    contextWindowLastVerified: resolved.lastVerified,
    ...(Number.isFinite(resolved.maxOutputTokens) ? { maxOutputTokens: resolved.maxOutputTokens } : {}),
  }
}
