import { isOllamaCloudAliasModelId } from './ai-provider-model-utils.mjs'

function asNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function toCamelCase(value = '') {
  return String(value || '')
    .trim()
    .replace(/[_-]+([a-z0-9])/gi, (_, char) => String(char || '').toUpperCase())
}

function pickFirstNumber(...values) {
  for (const value of values) {
    const numberValue = asNumber(value)
    if (numberValue !== undefined) return numberValue
  }
  return undefined
}

function normalizeNumericDetailSource(source = null) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  const normalized = {}
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = toCamelCase(key)
    if (!normalizedKey) continue
    const numberValue = asNumber(value)
    if (numberValue === undefined) continue
    normalized[normalizedKey] = numberValue
  }
  return Object.keys(normalized).length > 0 ? normalized : null
}

function mergeNumericDetailSources(...sources) {
  const merged = {}
  for (const source of sources) {
    const normalizedSource = normalizeNumericDetailSource(source)
    if (!normalizedSource) continue
    Object.assign(merged, normalizedSource)
  }
  return Object.keys(merged).length > 0 ? merged : null
}

function hasAnyPositiveNumber(source = null) {
  if (!source || typeof source !== 'object') return false
  return Object.values(source).some((value) => Number.isFinite(Number(value)) && Number(value) > 0)
}

function applyDetailAlias(target, key, ...values) {
  const numberValue = pickFirstNumber(target?.[key], ...values)
  if (numberValue === undefined) return
  target[key] = numberValue
}

function extractInputTokenDetails(raw = {}) {
  const details = mergeNumericDetailSources(
    raw.inputTokenDetails,
    raw.input_tokens_details,
    raw.promptTokenDetails,
    raw.prompt_tokens_details,
  ) || {}

  applyDetailAlias(
    details,
    'noCacheTokens',
    raw.noCacheTokens,
    raw.no_cache_tokens,
    raw.noCacheInputTokens,
    raw.no_cache_input_tokens,
  )
  applyDetailAlias(
    details,
    'cachedTokens',
    raw.cachedInputTokens,
    raw.cached_input_tokens,
    raw.cachedTokens,
    raw.cached_tokens,
    raw.cacheReadTokens,
    raw.cache_read_tokens,
    raw.cacheReadInputTokens,
    raw.cache_read_input_tokens,
    raw.cachedContentTokenCount,
    raw.cached_content_token_count,
  )
  applyDetailAlias(
    details,
    'cacheReadTokens',
    details.cachedTokens,
    raw.cachedInputTokens,
    raw.cached_input_tokens,
    raw.cachedTokens,
    raw.cached_tokens,
    raw.cacheReadTokens,
    raw.cache_read_tokens,
    raw.cacheReadInputTokens,
    raw.cache_read_input_tokens,
    raw.cachedContentTokenCount,
    raw.cached_content_token_count,
  )
  applyDetailAlias(
    details,
    'cacheWriteTokens',
    raw.cacheWriteTokens,
    raw.cache_write_tokens,
    raw.cacheWriteInputTokens,
    raw.cache_write_input_tokens,
    raw.cacheCreationInputTokens,
    raw.cache_creation_input_tokens,
  )

  return Object.keys(details).length > 0 ? details : null
}

function extractOutputTokenDetails(raw = {}, {
  outputTokens = 0,
  reasoningTokens = 0,
} = {}) {
  const details = mergeNumericDetailSources(
    raw.outputTokenDetails,
    raw.output_tokens_details,
    raw.completionTokenDetails,
    raw.completion_tokens_details,
  ) || {}

  applyDetailAlias(
    details,
    'textTokens',
    raw.textTokens,
    raw.text_tokens,
    raw.candidatesTokenCount,
    raw.candidates_token_count,
  )
  applyDetailAlias(
    details,
    'reasoningTokens',
    raw.reasoningTokens,
    raw.reasoning_tokens,
    raw.thinkingTokens,
    raw.thinking_tokens,
    raw.thoughtsTokenCount,
    raw.thoughts_token_count,
  )

  if (
    details.textTokens === undefined
    && Number.isFinite(outputTokens)
    && Number.isFinite(reasoningTokens)
    && (outputTokens > 0 || reasoningTokens > 0)
    && reasoningTokens >= 0
    && reasoningTokens <= outputTokens
  ) {
    details.textTokens = outputTokens - reasoningTokens
  }

  return Object.keys(details).length > 0 ? details : null
}

export function normalizeUsage(raw = {}) {
  if (!raw || typeof raw !== 'object') return null

  const reasoningTokens = pickFirstNumber(
    raw.reasoningTokens,
    raw.reasoning_tokens,
    raw.thinkingTokens,
    raw.thinking_tokens,
    raw.outputTokenDetails?.reasoningTokens,
    raw.output_tokens_details?.reasoning_tokens,
    raw.completionTokenDetails?.reasoningTokens,
    raw.completion_tokens_details?.reasoning_tokens,
    raw.thoughtsTokenCount,
    raw.thoughts_token_count,
  ) ?? 0
  const inputTokens = pickFirstNumber(
    raw.inputTokens
    ?? raw.promptTokens
    ?? raw.prompt_tokens
    ?? raw.input_tokens,
    raw.promptTokenCount,
    raw.prompt_token_count,
  )
  const outputTokens = pickFirstNumber(
    raw.outputTokens
    ?? raw.completionTokens
    ?? raw.completion_tokens
    ?? raw.output_tokens,
    (
      asNumber(raw.candidatesTokenCount)
      ?? asNumber(raw.candidates_token_count)
      ?? undefined
    ) !== undefined || reasoningTokens > 0
      ? (
        (asNumber(raw.candidatesTokenCount) ?? asNumber(raw.candidates_token_count) ?? 0)
        + reasoningTokens
      )
      : undefined,
  )
  const inputTokenDetails = extractInputTokenDetails(raw)
  const outputTokenDetails = extractOutputTokenDetails(raw, {
    outputTokens: inputTokens === undefined && outputTokens === undefined ? 0 : (outputTokens ?? 0),
    reasoningTokens,
  })
  const cachedInputTokens = pickFirstNumber(
    raw.cachedInputTokens,
    raw.cached_input_tokens,
    raw.cachedTokens,
    raw.cached_tokens,
    inputTokenDetails?.cacheReadTokens,
    inputTokenDetails?.cachedTokens,
  )
  const totalTokens = pickFirstNumber(
    raw.totalTokens
    ?? raw.total_tokens
    ?? raw.totalTokenCount
    ?? raw.total_token_count,
    (
      (inputTokens ?? 0) > 0 || (outputTokens ?? 0) > 0
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined
    ),
  )

  if (
    (inputTokens ?? 0) <= 0
    && (outputTokens ?? 0) <= 0
    && (totalTokens ?? 0) <= 0
    && reasoningTokens <= 0
    && !hasAnyPositiveNumber(inputTokenDetails)
    && !hasAnyPositiveNumber(outputTokenDetails)
  ) {
    return null
  }

  const normalized = {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    reasoningTokens,
    totalTokens: totalTokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0)),
  }

  if (cachedInputTokens !== undefined) {
    normalized.cachedInputTokens = cachedInputTokens
  }
  if (inputTokenDetails) {
    normalized.inputTokenDetails = inputTokenDetails
  }
  if (outputTokenDetails) {
    normalized.outputTokenDetails = outputTokenDetails
  }

  const rawUsage = raw.raw && typeof raw.raw === 'object' ? raw.raw : raw
  if (rawUsage && typeof rawUsage === 'object' && !Array.isArray(rawUsage)) {
    normalized.raw = rawUsage
  }

  return normalized
}

export function extractReasoningTextFromParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return ''

  const chunks = []
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue

    const text = String(part.text ?? '').trim()
    if (text) {
      chunks.push(text)
      continue
    }

    const summaryParts = Array.isArray(part.summary) ? part.summary : []
    for (const summaryPart of summaryParts) {
      const summaryText = String(summaryPart?.text ?? '').trim()
      if (summaryText) chunks.push(summaryText)
    }
  }

  return chunks.join('\n').trim()
}

async function readUsageCandidate(result, fieldName) {
  if (!result || typeof result !== 'object') return null
  const candidate = result[fieldName]
  if (!candidate) return null
  try {
    if (typeof candidate === 'function') {
      return await candidate.call(result)
    }
    return await Promise.resolve(candidate)
  } catch {
    return null
  }
}

export async function resolveResultUsage(result) {
  const [usage, totalUsage, providerMetadata] = await Promise.all([
    readUsageCandidate(result, 'usage'),
    readUsageCandidate(result, 'totalUsage'),
    readUsageCandidate(result, 'providerMetadata'),
  ])

  const normalizedUsage = normalizeUsage(usage)
  const normalizedTotalUsage = normalizeUsage(totalUsage)

  if (normalizedUsage) {
    return {
      ...normalizedUsage,
      usageSource: 'usage',
      usageSourcePath: 'usage',
      ...(normalizedTotalUsage
        ? {
          aggregateUsage: normalizedTotalUsage,
          aggregateUsageSource: 'totalUsage',
          aggregateUsagePath: 'totalUsage',
        }
        : {}),
    }
  }

  if (normalizedTotalUsage) {
    return {
      ...normalizedTotalUsage,
      usageSource: 'totalUsage',
      usageSourcePath: 'totalUsage',
    }
  }

  // Some providers include token usage in provider metadata.
  if (providerMetadata && typeof providerMetadata === 'object') {
    for (const [key, value] of Object.entries(providerMetadata)) {
      const fromMeta = normalizeUsage(value)
      if (fromMeta) {
        return {
          ...fromMeta,
          usageSource: 'providerMetadata',
          usageSourcePath: `providerMetadata.${String(key || '').trim()}`,
        }
      }
    }
  }
  return null
}

export function isToolsUnsupportedError(err) {
  const text = [
    String(err?.message || ''),
    String(err?.responseBody || ''),
  ].join('\n').toLowerCase()
  if (!text) return false
  return (
    text.includes('does not support tools')
    || text.includes('tool use is not supported')
    || text.includes('tools are not supported')
    || text.includes("tool '") && text.includes('is not supported')
    || text.includes('tool "') && text.includes('is not supported')
    || text.includes('mutually_exclusive_parameters')
    || text.includes('cannot be used together at the same time')
    || (text.includes('unsupported') && text.includes('tools'))
    || (text.includes('invalid') && text.includes('tools'))
  )
}

export function isNoOutputGeneratedStreamError(err) {
  const text = [
    String(err?.message || ''),
    String(err?.responseBody || ''),
  ].join('\n').toLowerCase()
  return text.includes('no output generated')
}

export function resolveStreamRecoveryAction({
  providerId = '',
  effectiveModelId = '',
  hasTools = false,
  activeProviderOptions = undefined,
  err = null,
} = {}) {
  const provider = String(providerId || '').trim().toLowerCase()
  if (
    provider === 'ollama'
    && isOllamaCloudAliasModelId(effectiveModelId)
    && isNoOutputGeneratedStreamError(err)
    && (hasTools || activeProviderOptions)
  ) {
    return 'minimal_ollama_alias_retry'
  }
  return 'none'
}
