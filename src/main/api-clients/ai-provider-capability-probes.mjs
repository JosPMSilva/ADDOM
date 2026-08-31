import {
  PROVIDER_POLICY,
  fetchJsonWithPolicy,
} from './provider-policy.mjs'
import {
  buildStaticProviderManifest,
} from './model-registry.mjs'
import {
  normalizeOpenRouterLiveModelRow,
} from '../../common/api-clients/openrouter-live-models.mjs'
import {
  applyContextMetadataToEntry,
  canonicalizeRequestedModel,
  cloneManifestEntry,
  cloneModels,
  inferReasoning,
  isLikelyOllamaThinkingModelId,
  isOllamaCloudAliasModelId,
  normalizeModelList,
} from './ai-provider-model-utils.mjs'
import {
  buildMergedCatalogCapabilities,
  buildOpenRouterLiveCapabilities,
  buildUnknownModelCapabilities,
  canExecuteResolvedToolSurface,
  dynamicModelCacheKey,
  mergeDynamicDiscoveredModels,
  modelCapabilityCacheKey,
  normalizeCapabilities,
  readCachedCapabilities,
  readDynamicRemoteModels,
} from './ai-provider-capability-probes-support.mjs'

const CURATED_MANIFEST = buildStaticProviderManifest()
const dynamicRemoteModelCache = new Map()
const modelCapabilityCache = new Map()
const MODEL_CAPABILITY_CACHE_TTL_MS = 10 * 60 * 1000

export { canExecuteResolvedToolSurface }

export function __resetDynamicModelCache() {
  dynamicRemoteModelCache.clear()
  modelCapabilityCache.clear()
}

async function resolveOpenRouterLiveCapabilities({
  apiKey = '',
  modelId = '',
  forceRefresh = false,
} = {}) {
  const normalizedModelId = String(modelId || '').trim()
  if (!normalizedModelId) return null

  const cachedModels = readDynamicRemoteModels(dynamicRemoteModelCache, 'openrouter', apiKey, { forceRefresh: false })
  let models = forceRefresh ? [] : cachedModels
  if (models.length === 0) {
    try {
      models = await fetchOpenRouterManifestModels()
      if (models.length > 0) {
        dynamicRemoteModelCache.set(dynamicModelCacheKey('openrouter', apiKey), {
          models: cloneModels(models),
          fetchedAt: Date.now(),
        })
      }
    } catch {
      models = cachedModels
    }
  }

  if (models.length === 0) return null
  let match = models.find((row) => String(row?.id || '').trim().toLowerCase() === normalizedModelId.toLowerCase())
  if (!match && cachedModels.length > 0) {
    match = cachedModels.find((row) => String(row?.id || '').trim().toLowerCase() === normalizedModelId.toLowerCase())
  }
  if (!match) return null
  return buildOpenRouterLiveCapabilities(normalizedModelId, match)
}

function resolveDefaultCapabilities(providerId, modelId, authMethod = 'api_key') {
  return buildMergedCatalogCapabilities(providerId, modelId, authMethod)
    || buildUnknownModelCapabilities(providerId, modelId, authMethod)
}

export function getCachedModelCapabilities(providerId, modelId, { allowExpired = false, authMethod = 'api_key' } = {}) {
  const canonical = canonicalizeRequestedModel(providerId, modelId)
  if (!canonical.providerId || !canonical.effectiveModelId) return null
  if (allowExpired) {
    const key = modelCapabilityCacheKey(canonical.providerId, canonical.effectiveModelId, authMethod)
    const cached = modelCapabilityCache.get(key)
    return cached && typeof cached === 'object' ? { ...cached } : null
  }
  return readCachedCapabilities(modelCapabilityCache, canonical.providerId, canonical.effectiveModelId, {
    forceRefresh: false,
    authMethod,
    ttlMs: MODEL_CAPABILITY_CACHE_TTL_MS,
  })
}

function writeCachedCapabilities(providerId, modelId, capabilities, { authMethod = 'api_key' } = {}) {
  const cacheKey = modelCapabilityCacheKey(providerId, modelId, authMethod)
  const normalized = normalizeCapabilities(capabilities, resolveDefaultCapabilities(providerId, modelId, authMethod))
  modelCapabilityCache.set(cacheKey, normalized)
  return normalized
}

export async function applyDynamicRemoteModels(entry, {
  apiKey = '',
  forceRefresh = false,
  fetcher = null,
} = {}) {
  if (!entry || typeof entry !== 'object') return
  if (typeof fetcher !== 'function') return

  const providerId = String(entry.id || '').trim()
  if (!providerId) return

  const fallbackModels = normalizeModelList(entry.models)
  const cacheKey = dynamicModelCacheKey(providerId, apiKey)
  const cached = dynamicRemoteModelCache.get(cacheKey)

  if (!forceRefresh && cached && Array.isArray(cached.models) && cached.models.length > 0) {
    entry.models = mergeDynamicDiscoveredModels(
      providerId,
      cloneModels(cached.models),
      fallbackModels,
    )
    entry.modelSource = 'dynamic'
    entry.modelsFetchedAt = Number(cached.fetchedAt || 0) || Date.now()
    applyContextMetadataToEntry(entry)
    return
  }

  try {
    const rawModels = await Promise.resolve(fetcher({
      providerId,
      apiKey,
      forceRefresh: !!forceRefresh,
      entry,
    }))
    const discoveredModels = normalizeModelList(Array.isArray(rawModels) ? rawModels : [])
    if (discoveredModels.length > 0) {
      const fetchedAt = Date.now()
      dynamicRemoteModelCache.set(cacheKey, {
        models: cloneModels(discoveredModels),
        fetchedAt,
      })
      entry.models = mergeDynamicDiscoveredModels(
        providerId,
        discoveredModels,
        fallbackModels,
      )
      entry.modelSource = 'dynamic'
      entry.modelsFetchedAt = fetchedAt
      applyContextMetadataToEntry(entry)
      return
    }
  } catch {
    // Non-fatal: keep curated fallback.
  }

  entry.models = fallbackModels
  entry.modelSource = 'static'
  entry.modelsFetchedAt = null
  applyContextMetadataToEntry(entry)
}

export async function __testApplyDynamicRemoteModels(entry, options = {}) {
  await applyDynamicRemoteModels(entry, options)
}

async function fetchJson(url, init = {}) {
  return fetchJsonWithPolicy(url, init, PROVIDER_POLICY.modelFetch)
}

export async function probeOllamaModelCapabilities(modelId) {
  const model = String(modelId || '').trim()
  if (!model) return null
  try {
    const data = await fetchJson('http://localhost:11434/api/show', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: model }),
    })
    const rawCaps = Array.isArray(data?.capabilities) ? data.capabilities : []
    const caps = rawCaps.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    if (!caps.length) return null
    const supportsTools = caps.includes('tools')
    const supportsReasoning = caps.includes('thinking') || inferReasoning('ollama', model) || isLikelyOllamaThinkingModelId(model)
    return {
      providerId: 'ollama',
      modelId: model,
      supportsTools,
      supportsReasoning,
      source: 'provider_probe',
      checkedAt: Date.now(),
      note: `Ollama capabilities: ${caps.join(', ')}`,
    }
  } catch (err) {
    if (!isOllamaCloudAliasModelId(model)) throw err
    return {
      providerId: 'ollama',
      modelId: model,
      supportsTools: false,
      supportsReasoning: isLikelyOllamaThinkingModelId(model),
      source: 'unknown',
      checkedAt: Date.now(),
      note: 'Ollama cloud alias detected via local Ollama; /api/show probe unavailable, tool support left unverified.',
    }
  }
}

export async function probeLMStudioModelCapabilities(modelId) {
  const model = String(modelId || '').trim()
  if (!model) return null
  const data = await fetchJson('http://localhost:1234/v1/models')
  const rows = Array.isArray(data?.data) ? data.data : []
  const match = rows.find((row) => String(row?.id || '').trim().toLowerCase() === model.toLowerCase())
  if (!match || !Array.isArray(match.capabilities)) {
    return {
      providerId: 'lmstudio',
      modelId: model,
      supportsTools: true,
      supportsReasoning: inferReasoning('lmstudio', model),
      source: 'provider_default',
      checkedAt: Date.now(),
      note: 'LM Studio docs state all models support at least some degree of tool use, but this model did not expose a capabilities array; tool quality remains unverified.',
    }
  }
  const caps = match.capabilities.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
  const supportsTools = caps.includes('tools')
  const supportsReasoning = caps.includes('thinking') || inferReasoning('lmstudio', model)
  return {
    providerId: 'lmstudio',
    modelId: model,
    supportsTools,
    supportsReasoning,
    source: 'provider_probe',
    checkedAt: Date.now(),
    note: `LM Studio capabilities: ${caps.join(', ')}`,
  }
}

export async function resolveProviderCapabilities({
  providerId,
  apiKey = '',
  modelId,
  authMethod = 'api_key',
  forceRefresh = false,
  failOnProbeError = false,
  probeCapabilities = null,
} = {}) {
  void apiKey
  const canonical = canonicalizeRequestedModel(providerId, modelId)
  const provider = canonical.providerId
  const model = canonical.effectiveModelId
  const fallback = resolveDefaultCapabilities(provider, model, authMethod)
  if (!provider || !model) return fallback

  const cached = readCachedCapabilities(modelCapabilityCache, provider, model, {
    forceRefresh,
    authMethod,
    ttlMs: MODEL_CAPABILITY_CACHE_TTL_MS,
  })
  if (cached) {
    if (failOnProbeError && cached.probeFailed === true) {
      throw new Error(String(cached.note || `Capability probe failed for ${provider}:${model}.`))
    }
    return cached
  }

  try {
    const probe = typeof probeCapabilities === 'function'
      ? await probeCapabilities(model)
      : (
        provider === 'openrouter' && fallback.source !== 'merged_catalog'
          ? await resolveOpenRouterLiveCapabilities({
            apiKey,
            modelId: model,
            forceRefresh,
          })
          : null
      )
    return writeCachedCapabilities(provider, model, {
      ...(probe || fallback),
      authMethod,
    }, { authMethod })
  } catch (err) {
    if (failOnProbeError) {
      throw new Error(String(err?.message || `Capability probe failed for ${provider}:${model}.`))
    }
    return writeCachedCapabilities(provider, model, {
      ...fallback,
      authMethod,
      source: fallback.source,
      checkedAt: Date.now(),
      note: String(
        err?.message
        || (
          fallback.source === 'merged_catalog'
            ? 'Capability probe failed; using merged catalog capabilities.'
            : 'Capability probe failed; leaving capability state unknown.'
        )
      ),
      probeFailed: true,
    }, { authMethod })
  }
}

export function markToolsUnsupported(providerId, modelId, err = null, { authMethod = 'api_key' } = {}) {
  const canonical = canonicalizeRequestedModel(providerId, modelId)
  const fallback = resolveDefaultCapabilities(canonical.providerId, canonical.effectiveModelId, authMethod)
  const existing = readCachedCapabilities(modelCapabilityCache, canonical.providerId, canonical.effectiveModelId, {
    authMethod,
    ttlMs: MODEL_CAPABILITY_CACHE_TTL_MS,
  }) || fallback
  return writeCachedCapabilities(canonical.providerId, canonical.effectiveModelId, {
    ...existing,
    authMethod,
    supportsTools: false,
    source: 'runtime_error',
    checkedAt: Date.now(),
    note: String(err?.message || err || existing.note || 'Provider rejected tool-calling for this model.'),
  }, { authMethod })
}

async function probeOllamaManifestEntry(entry) {
  if (!entry) return
  try {
    const data = await fetchJson('http://localhost:11434/api/tags')
    entry.localAvailable = true
    entry.models = normalizeModelList((data.models || []).map((row) => ({ id: row.name, label: row.name })))
    applyContextMetadataToEntry(entry)
    entry.modelSource = 'dynamic'
    entry.modelsFetchedAt = Date.now()
    if (entry.models.length > 0) entry.defaultModel = entry.models[0].id
  } catch {
    entry.localAvailable = false
  }
}

async function probeLMStudioManifestEntry(entry) {
  if (!entry) return
  try {
    const data = await fetchJson('http://localhost:1234/v1/models')
    entry.localAvailable = true
    entry.models = normalizeModelList((data.data || []).map((row) => ({ id: row.id, label: row.id })))
    applyContextMetadataToEntry(entry)
    entry.modelSource = 'dynamic'
    entry.modelsFetchedAt = Date.now()
    if (entry.models.length > 0) entry.defaultModel = entry.models[0].id
  } catch {
    entry.localAvailable = false
  }
}

async function fetchOpenRouterManifestModels() {
  const data = await fetchJson('https://openrouter.ai/api/v1/models')
  const rows = Array.isArray(data?.data) ? data.data : []
  return normalizeModelList(
    rows
      .map((row) => normalizeOpenRouterLiveModelRow(row))
      .filter(Boolean),
  )
}

async function fetchOpenAIManifestModels(apiKey = '') {
  const normalizedApiKey = String(apiKey || '').trim()
  if (!normalizedApiKey) {
    throw new Error('An OpenAI API key is required to discover model eligibility.')
  }
  const data = await fetchJson('https://api.openai.com/v1/models', {
    headers: {
      authorization: `Bearer ${normalizedApiKey}`,
    },
  })
  const rows = Array.isArray(data?.data) ? data.data : []
  return normalizeModelList(rows.map((row) => ({
    id: String(row?.id || '').trim(),
    label: String(row?.id || '').trim(),
  })))
}

export async function getProviderManifest({ forceRefresh = false } = {}) {
  const manifest = CURATED_MANIFEST.map(cloneManifestEntry)
  const openrouterEntry = manifest.find((provider) => provider.id === 'openrouter')
  const ollamaEntry = manifest.find((provider) => provider.id === 'ollama')
  const lmstudioEntry = manifest.find((provider) => provider.id === 'lmstudio')

  await Promise.all([
    applyDynamicRemoteModels(openrouterEntry, {
      forceRefresh,
      fetcher: fetchOpenRouterManifestModels,
    }),
    probeOllamaManifestEntry(ollamaEntry),
    probeLMStudioManifestEntry(lmstudioEntry),
  ])

  for (const entry of manifest) {
    applyContextMetadataToEntry(entry)
  }

  return manifest
}

export async function getProviderModels({
  providerId = '',
  apiKey = '',
  forceRefresh = false,
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  if (!normalizedProviderId) return []

  const entry = CURATED_MANIFEST.find((provider) => String(provider?.id || '').trim().toLowerCase() === normalizedProviderId)
  if (!entry) return []

  const clonedEntry = cloneManifestEntry(entry)

  if (normalizedProviderId === 'openrouter') {
    await applyDynamicRemoteModels(clonedEntry, {
      forceRefresh,
      fetcher: fetchOpenRouterManifestModels,
    })
  } else if (normalizedProviderId === 'openai') {
    await applyDynamicRemoteModels(clonedEntry, {
      apiKey,
      forceRefresh,
      fetcher: () => fetchOpenAIManifestModels(apiKey),
    })
  } else if (normalizedProviderId === 'ollama') {
    await probeOllamaManifestEntry(clonedEntry)
  } else if (normalizedProviderId === 'lmstudio') {
    await probeLMStudioManifestEntry(clonedEntry)
  }

  applyContextMetadataToEntry(clonedEntry)
  return cloneModels(Array.isArray(clonedEntry.models) ? clonedEntry.models : [])
}
