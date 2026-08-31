function trimString(value = '') {
  return String(value || '').trim()
}

function normalizeLowerString(value = '') {
  return trimString(value).toLowerCase()
}

function normalizePositiveInt(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.max(0, Math.round(Number(fallback || 0) || 0))
  return Math.max(0, Math.round(numeric))
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeStringList(values = []) {
  const source = Array.isArray(values) ? values : []
  const seen = new Set()
  const out = []
  for (const value of source) {
    const normalized = trimString(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

function normalizeArchitecture(rawValue = null) {
  const source = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {}
  const inputModalities = normalizeStringList(source.input_modalities || source.inputModalities)
  const outputModalities = normalizeStringList(source.output_modalities || source.outputModalities)
  return {
    ...(trimString(source.modality) ? { modality: trimString(source.modality) } : {}),
    ...(trimString(source.tokenizer) ? { tokenizer: trimString(source.tokenizer) } : {}),
    ...(trimString(source.instruct_type || source.instructType) ? { instructType: trimString(source.instruct_type || source.instructType) } : {}),
    ...(inputModalities.length > 0 ? { inputModalities } : {}),
    ...(outputModalities.length > 0 ? { outputModalities } : {}),
  }
}

function normalizePlainObject(rawValue = null) {
  return rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
    ? cloneJson(rawValue)
    : null
}

function normalizePricing(rawValue = null) {
  const source = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {}
  const out = {}
  for (const [key, value] of Object.entries(source)) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric < 0) continue
    out[key] = numeric
  }
  return Object.keys(out).length > 0 ? out : null
}

function inferOpenRouterGroup(modelId = '') {
  const route = normalizeLowerString(modelId)
  const namespace = route.split('/')[0] || ''
  switch (namespace) {
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Anthropic'
    case 'google':
      return 'Google Gemini'
    case 'moonshotai':
      return 'Moonshot AI'
    case 'x-ai':
      return 'xAI'
    case 'meta-llama':
      return 'Meta Llama'
    case 'mistralai':
      return 'Mistral'
    case 'deepseek':
      return 'DeepSeek'
    case 'perplexity':
      return 'Perplexity'
    case 'qwen':
      return 'Qwen'
    default:
      return namespace ? namespace.replace(/[-_]/g, ' ') : 'OpenRouter'
  }
}

export function inferOpenRouterLiveCapabilities({
  supportedParameters = [],
  architecture = null,
} = {}) {
  const normalizedSupportedParameters = normalizeStringList(supportedParameters).map((value) => value.toLowerCase())
  const inputModalities = normalizeStringList(
    architecture?.inputModalities || architecture?.input_modalities || [],
  ).map((value) => value.toLowerCase())

  const supportsTools = normalizedSupportedParameters.includes('tools')
    && normalizedSupportedParameters.includes('tool_choice')
  const supportsReasoning = normalizedSupportedParameters.includes('reasoning')
    || normalizedSupportedParameters.includes('include_reasoning')
  const supportsReasoningEffort = normalizedSupportedParameters.includes('reasoning_effort')
  const supportsVision = inputModalities.includes('image')

  return {
    supportsTools: supportsTools ? true : null,
    supportsReasoning: supportsReasoning ? true : null,
    supportsReasoningEffort: supportsReasoningEffort ? true : null,
    reasoningEffortLevels: supportsReasoningEffort ? null : null,
    supportsVision: supportsVision ? true : null,
  }
}

export function normalizeOpenRouterLiveModelRow(rawRow = {}) {
  const routeId = trimString(rawRow?.id)
  if (!routeId) return null

  const supportedParameters = normalizeStringList(rawRow?.supported_parameters || rawRow?.supportedParameters)
  const architecture = normalizeArchitecture(rawRow?.architecture)
  const inferredCapabilities = inferOpenRouterLiveCapabilities({
    supportedParameters,
    architecture,
  })
  const contextLength = normalizePositiveInt(rawRow?.context_length || rawRow?.contextLength, 0)
  const pricing = normalizePricing(rawRow?.pricing)
  const topProvider = normalizePlainObject(rawRow?.top_provider || rawRow?.topProvider)
  const perRequestLimits = normalizePlainObject(rawRow?.per_request_limits || rawRow?.perRequestLimits)
  const defaultParameters = normalizePlainObject(rawRow?.default_parameters || rawRow?.defaultParameters)
  const provenance = {
    tools: inferredCapabilities.supportsTools === true ? 'estimated_openrouter_supported_parameters' : 'unknown',
    reasoning: inferredCapabilities.supportsReasoning === true ? 'estimated_openrouter_supported_parameters' : 'unknown',
    reasoningEffort: inferredCapabilities.supportsReasoningEffort === true ? 'estimated_openrouter_supported_parameters' : 'unknown',
    vision: inferredCapabilities.supportsVision === true ? 'estimated_openrouter_architecture' : 'unknown',
    limits: contextLength > 0 ? 'openrouter_live' : 'unknown',
    pricing: pricing ? 'openrouter_live' : 'unknown',
  }

  return {
    id: routeId,
    label: routeId,
    group: inferOpenRouterGroup(routeId),
    ...(contextLength > 0 ? { contextWindowTokens: contextLength } : {}),
    ...(pricing ? { pricing } : {}),
    openrouterLive: {
      ...(trimString(rawRow?.canonical_slug || rawRow?.canonicalSlug) ? { canonicalSlug: trimString(rawRow?.canonical_slug || rawRow?.canonicalSlug) } : {}),
      ...(trimString(rawRow?.hugging_face_id || rawRow?.huggingFaceId) ? { huggingFaceId: trimString(rawRow?.hugging_face_id || rawRow?.huggingFaceId) } : {}),
      ...(trimString(rawRow?.name) ? { name: trimString(rawRow?.name) } : {}),
      ...(trimString(rawRow?.description) ? { description: trimString(rawRow?.description) } : {}),
      ...(trimString(rawRow?.created) ? { createdAt: trimString(rawRow?.created) } : {}),
      ...(contextLength > 0 ? { contextLength } : {}),
      ...(pricing ? { pricing } : {}),
      ...(Object.keys(architecture).length > 0 ? { architecture } : {}),
      ...(topProvider ? { topProvider } : {}),
      ...(perRequestLimits ? { perRequestLimits } : {}),
      ...(supportedParameters.length > 0 ? { supportedParameters } : {}),
      ...(defaultParameters ? { defaultParameters } : {}),
      ...(trimString(rawRow?.permalink) ? { permalink: trimString(rawRow?.permalink) } : {}),
      ...(trimString(rawRow?.description_short || rawRow?.descriptionShort) ? { descriptionShort: trimString(rawRow?.description_short || rawRow?.descriptionShort) } : {}),
      ...(trimString(rawRow?.created_at || rawRow?.createdAt) ? { createdAtIso: trimString(rawRow?.created_at || rawRow?.createdAt) } : {}),
      ...(trimString(rawRow?.updated_at || rawRow?.updatedAt) ? { updatedAtIso: trimString(rawRow?.updated_at || rawRow?.updatedAt) } : {}),
      ...(trimString(rawRow?.expires_at || rawRow?.expiresAt) ? { expirationDate: trimString(rawRow?.expires_at || rawRow?.expiresAt) } : {}),
    },
    openrouterInferredCapabilities: inferredCapabilities,
    openrouterCapabilityProvenance: provenance,
  }
}

function mergeMissingObjectFields(preferred = null, fallback = null) {
  const preferredObject = preferred && typeof preferred === 'object' && !Array.isArray(preferred) ? preferred : null
  const fallbackObject = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : null
  if (!preferredObject && !fallbackObject) return null
  if (!preferredObject) return cloneJson(fallbackObject)
  if (!fallbackObject) return cloneJson(preferredObject)
  return {
    ...cloneJson(fallbackObject),
    ...cloneJson(preferredObject),
  }
}

export function mergeOpenRouterManifestModels(liveModels = [], fallbackModels = []) {
  const mergedById = new Map()

  for (const row of Array.isArray(fallbackModels) ? fallbackModels : []) {
    const routeId = trimString(row?.id)
    if (!routeId) continue
    mergedById.set(routeId.toLowerCase(), { ...cloneJson(row), id: routeId })
  }

  for (const row of Array.isArray(liveModels) ? liveModels : []) {
    const routeId = trimString(row?.id)
    if (!routeId) continue
    const key = routeId.toLowerCase()
    const existing = mergedById.get(key)
    if (!existing) {
      mergedById.set(key, { ...cloneJson(row), id: routeId })
      continue
    }

    mergedById.set(key, {
      ...existing,
      id: routeId,
      label: trimString(row?.label) || trimString(existing?.label) || routeId,
      group: trimString(row?.group) || trimString(existing?.group) || inferOpenRouterGroup(routeId),
      ...(existing.contextWindowTokens ? {} : (row.contextWindowTokens ? { contextWindowTokens: row.contextWindowTokens } : {})),
      pricing: mergeMissingObjectFields(existing.pricing, row.pricing),
      openrouterLive: mergeMissingObjectFields(row.openrouterLive, existing.openrouterLive),
      openrouterInferredCapabilities: mergeMissingObjectFields(row.openrouterInferredCapabilities, existing.openrouterInferredCapabilities),
      openrouterCapabilityProvenance: mergeMissingObjectFields(row.openrouterCapabilityProvenance, existing.openrouterCapabilityProvenance),
    })
  }

  return [...mergedById.values()]
}
