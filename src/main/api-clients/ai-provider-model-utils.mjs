import { attachModelContextMetadata } from './model-context-limits.mjs'
import { canonicalizeRegistryModelSelection } from './model-registry.mjs'

export function cloneManifestEntry(entry) {
  return {
    ...entry,
    models: (entry.models || []).map((m) => attachModelContextMetadata(entry.id, m)),
    modelSource: 'static',
    modelsFetchedAt: null,
  }
}

export function inferModelGroup(modelId) {
  const id = String(modelId || '').toLowerCase()
  if (
    /(^|[-_:])vl($|[-_:])/.test(id)
    || id.includes('vision')
    || id.includes('llava')
    || id.includes('bakllava')
    || id.includes('moondream')
    || id.includes('minicpm-v')
  ) return 'Vision'
  if (id.startsWith('gpt-5')) return 'GPT-5'
  if (id.startsWith('codex')) return 'Codex'
  if (id.startsWith('gpt-4.1')) return 'GPT-4.1'
  if (id.startsWith('gpt-4o')) return 'GPT-4o'
  if (id.startsWith('o4') || id.startsWith('o3') || id.startsWith('o1')) return 'Reasoning'
  // Claude ï¿½ match on both hyphen forms: claude-4, claude-opus-4, claude-sonnet-4, etc.
  if (id.startsWith('claude-opus-4') || id.startsWith('claude-sonnet-4') || id.startsWith('claude-haiku-4') || id.startsWith('claude-4')) return 'Claude 4'
  if (id.startsWith('claude-3-7')) return 'Claude 3.7'
  if (id.startsWith('claude-3-5')) return 'Claude 3.5'
  if (id.startsWith('claude-3')) return 'Claude 3'
  if (id.startsWith('gemini-3.1')) return 'Gemini 3.1'
  if (id.startsWith('gemini-3')) return 'Gemini 3'
  if (id.startsWith('gemini-2.5')) return 'Gemini 2.5'
  if (id.startsWith('gemini-2.0')) return 'Gemini 2.0'
  if (id.startsWith('gemini-1.5')) return 'Gemini 1.5'
  if (id.startsWith('grok-4')) return 'Grok 4'
  if (id.startsWith('grok-3')) return 'Grok 3'
  if (id.startsWith('grok-2')) return 'Grok 2'
  if (id.startsWith('kimi-k2.5')) return 'Kimi K2.5'
  if (id.startsWith('kimi-k2-thinking')) return 'Reasoning'
  if (id.startsWith('kimi-k2')) return 'Kimi K2'
  if (id.startsWith('sonar-reasoning') || id.startsWith('sonar-deep')) return 'Reasoning'
  if (id.startsWith('sonar')) return 'Sonar'
  if (id.includes('magistral')) return 'Reasoning'
  if (id.includes('codestral') || id.includes('devstral')) return 'Code'
  if (id.includes('mistral')) return 'Mistral'
  if (id.includes('deepseek-r') || id.includes('deepseek-reason')) return 'Reasoning'
  if (id.includes('deepseek')) return 'DeepSeek'
  if (id.includes('r1') || id.includes('qwq') || id.includes('qwen3') || id.includes('reason')) return 'Reasoning'
  if (id.includes('llama')) return 'Llama'
  if (id.includes('kimi')) return 'Other'
  if (id.includes('gemma')) return 'Gemma'
  if (id.includes('mixtral')) return 'Mixtral'
  return 'Other'
}

export function isOllamaCloudAliasModelId(modelId) {
  return /(?:^|[-_:])cloud(?:$|[-_:])/.test(String(modelId || '').trim().toLowerCase())
}

export function isLikelyVisionModelId(modelId) {
  return inferModelGroup(modelId) === 'Vision'
}

export function isLikelyOllamaThinkingModelId(modelId) {
  const lower = String(modelId || '').trim().toLowerCase()
  if (!lower || isLikelyVisionModelId(lower)) return false
  return (
    lower.includes('qwen3')
    || lower.includes('deepseek-r')
    || lower.includes('qwq')
  )
}

// Returns true for model IDs that natively stream reasoning-delta chunks
// or support a reasoning summary option, so the UI can show the reasoning badge.
export function inferReasoning(providerId, modelId) {
  const id = String(modelId || '').toLowerCase()
  // Anthropic extended thinking ï¿½ Claude 4+ and claude-3-7 all support it
  if (providerId === 'anthropic') {
    if (id.startsWith('claude-4') || id.startsWith('claude-opus-4') || id.startsWith('claude-sonnet-4')
      || id.startsWith('claude-haiku-4') || id.startsWith('claude-3-7') || id.includes('opus')) return true
  }
  // OpenAI GPT-5 with reasoningSummary (not chat variants)
  if (providerId === 'openai' && id.startsWith('gpt-5') && !id.includes('chat')) return true
  // OpenAI o-series and codex
  if (providerId === 'openai' && (id.startsWith('o4') || id.startsWith('o3') || id.startsWith('o1') || id.startsWith('codex'))) return true
  // Gemini 2.5+ with includeThoughts (Gemini 3.x and 2.5.x all support thinking)
  if (providerId === 'gemini' && (id.startsWith('gemini-3') || id.startsWith('gemini-2.5'))) return true
  // Grok reasoning variants
  if (providerId === 'grok' && (id.includes('reasoning') || id.includes('mini') || id === 'grok-4-0709')) return true
  // Groq-hosted reasoning models
  if (providerId === 'groq' && (id.includes('deepseek-r') || id.includes('r1') || id.includes('qwq') || id.includes('qwen3'))) return true
  // DeepSeek native
  if (providerId === 'deepseek' && (id.includes('reason') || id.includes('r1'))) return true
  // Moonshot Kimi K2.5 + explicit thinking models.
  if (providerId === 'moonshot' && (
    id === 'kimi-k2.5'
    || id === 'kimi-k2-thinking'
    || id === 'kimi-k2-thinking-turbo'
  )) return true
  // Mistral reasoning ï¿½ magistral streams reasoning-delta natively
  if (id.includes('magistral')) return true
  // Perplexity reasoning
  if (id.includes('sonar-reasoning') || id.includes('sonar-deep')) return true
  return false
}

export function normalizeModelList(rawModels) {
  const seen = new Set()
  const out = []
  for (const m of rawModels || []) {
    const id = String(m.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      ...m,
      id,
      label: m.label || id,
      group: m.group || inferModelGroup(id),
    })
  }
  return out
}

export function applyContextMetadataToEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry
  entry.models = normalizeModelList(entry.models).map((model) => attachModelContextMetadata(entry.id, model))
  return entry
}

export function cloneModels(models = []) {
  return (Array.isArray(models) ? models : []).map((model) => ({ ...model }))
}

export function canonicalizeRequestedModel(providerId, modelId) {
  const provider = String(providerId || '').trim().toLowerCase()
  const requested = String(modelId || '').trim()
  if (!provider || !requested) {
    return {
      providerId: provider,
      requestedModelId: requested,
      effectiveModelId: requested,
      changed: false,
      reason: 'missing',
    }
  }

  const normalized = canonicalizeRegistryModelSelection(provider, requested)
  const effectiveModelId = String(normalized.modelId || requested).trim() || requested
  return {
    providerId: String(normalized.providerId || provider).trim().toLowerCase() || provider,
    requestedModelId: requested,
    effectiveModelId,
    changed: !!normalized.changed,
    reason: String(normalized.reason || 'unknown'),
  }
}

