function asTokenCountOrNull(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.max(0, Math.round(n))
}

function deriveThreadOccupancyProvenance({
  occupancySource = '',
  occupancyConfidence = '',
} = {}) {
  const normalizedSource = String(occupancySource || '').trim().toLowerCase()
  const normalizedConfidence = String(occupancyConfidence || '').trim().toLowerCase()
  if (normalizedSource === 'provider_thread_context' && normalizedConfidence === 'provider_verified') {
    return 'provider_verified'
  }
  if (normalizedConfidence === 'provider_mapped') return 'provider_mapped'
  if (normalizedConfidence === 'calibrated_estimate') return 'calibrated_estimate'
  if (normalizedConfidence === 'rough_estimate') return 'rough_estimate'
  return 'unavailable'
}

function pickTokenCount(...values) {
  for (const value of values) {
    const n = asTokenCountOrNull(value)
    if (n !== null) return n
  }
  return null
}

function deriveNoCacheTokens({
  inputTokens = null,
  noCacheTokens = null,
  cacheReadTokens = null,
  cacheWriteTokens = null,
} = {}) {
  const explicitNoCacheTokens = asTokenCountOrNull(noCacheTokens)
  if (explicitNoCacheTokens !== null) return explicitNoCacheTokens
  const totalInputTokens = asTokenCountOrNull(inputTokens)
  if (totalInputTokens === null) return null
  const cacheRead = asTokenCountOrNull(cacheReadTokens) ?? 0
  const cacheWrite = asTokenCountOrNull(cacheWriteTokens) ?? 0
  return Math.max(0, totalInputTokens - cacheRead - cacheWrite)
}

function hasProviderUsage(base = {}) {
  return [
    base.providerInputTokens,
    base.providerOutputTokens,
    base.providerReasoningTokens,
    base.providerTotalTokens,
    base.providerCachedReadTokens,
    base.providerCachedWriteTokens,
    base.providerBilledInputTokens,
    base.providerBilledTotalTokens,
    base.providerOccupancyTokens,
  ].some((value) => Number.isFinite(value) && value >= 0)
}

function buildBaseProviderUsage(usage = null) {
  const providerInputTokens = pickTokenCount(usage?.inputTokens)
  const providerCachedReadTokens = pickTokenCount(
    usage?.inputTokenDetails?.cacheReadTokens,
    usage?.cachedInputTokens,
    usage?.inputTokenDetails?.cachedTokens,
  )
  const providerCachedWriteTokens = pickTokenCount(usage?.inputTokenDetails?.cacheWriteTokens)
  const providerInputNoCacheTokens = deriveNoCacheTokens({
    inputTokens: providerInputTokens,
    noCacheTokens: usage?.inputTokenDetails?.noCacheTokens,
    cacheReadTokens: providerCachedReadTokens,
    cacheWriteTokens: providerCachedWriteTokens,
  })
  const providerReasoningTokens = pickTokenCount(
    usage?.reasoningTokens,
    usage?.outputTokenDetails?.reasoningTokens,
  )
  const providerOutputTokens = pickTokenCount(usage?.outputTokens)
  const providerTotalTokens = pickTokenCount(
    usage?.totalTokens,
    providerInputTokens !== null || providerOutputTokens !== null
      ? (providerInputTokens ?? 0) + (providerOutputTokens ?? 0)
      : null,
  )

  return {
    providerInputTokens,
    providerInputNoCacheTokens,
    providerCachedReadTokens,
    providerCachedWriteTokens,
    providerOutputTokens,
    providerReasoningTokens,
    providerTotalTokens,
    providerBilledInputTokens: providerInputTokens,
    providerBilledTotalTokens: providerTotalTokens,
    providerUsageAvailable: false,
    providerOccupancyTokens: null,
    occupancySource: 'estimated_history',
    occupancyConfidence: 'rough_estimate',
    occupancyMethod: 'history_estimate',
    providerUsageSemantics: 'estimate_only',
  }
}

function buildOccupancyTelemetry({
  base = {},
  estimatedOccupancyTokens = 0,
  providerOccupancyTokens = null,
  providerInputTokens = base.providerInputTokens ?? null,
  providerInputNoCacheTokens = base.providerInputNoCacheTokens ?? null,
  providerCachedReadTokens = base.providerCachedReadTokens ?? null,
  providerCachedWriteTokens = base.providerCachedWriteTokens ?? null,
  providerOutputTokens = base.providerOutputTokens ?? null,
  providerReasoningTokens = base.providerReasoningTokens ?? null,
  providerTotalTokens = base.providerTotalTokens ?? null,
  providerBilledInputTokens = base.providerBilledInputTokens ?? null,
  providerBilledTotalTokens = base.providerBilledTotalTokens ?? null,
  occupancySource = 'estimated_history',
  occupancyConfidence = 'rough_estimate',
  occupancyMethod = 'history_estimate',
  providerUsageSemantics = 'estimate_only',
} = {}) {
  const effectiveProviderOccupancyTokens = asTokenCountOrNull(providerOccupancyTokens)
  const normalizedEstimatedTokens = asTokenCountOrNull(estimatedOccupancyTokens)
  const effectiveEstimateTokens = normalizedEstimatedTokens ?? 0
  const effectiveOccupancyTokens = effectiveProviderOccupancyTokens ?? effectiveEstimateTokens
  const normalizedOccupancySource = String(occupancySource || 'estimated_history')
  const normalizedOccupancyConfidence = String(occupancyConfidence || 'rough_estimate')
  const normalizedOccupancyMethod = String(occupancyMethod || 'history_estimate')
  const threadOccupancyProvenance = deriveThreadOccupancyProvenance({
    occupancySource: normalizedOccupancySource,
    occupancyConfidence: normalizedOccupancyConfidence,
  })
  const providerVerifiedThreadOccupancyTokens = (
    normalizedOccupancySource === 'provider_thread_context'
    && normalizedOccupancyConfidence === 'provider_verified'
  )
    ? effectiveOccupancyTokens
    : null

  const providerUsage = {
    providerInputTokens: asTokenCountOrNull(providerInputTokens),
    providerInputNoCacheTokens: asTokenCountOrNull(providerInputNoCacheTokens),
    providerCachedReadTokens: asTokenCountOrNull(providerCachedReadTokens),
    providerCachedWriteTokens: asTokenCountOrNull(providerCachedWriteTokens),
    providerOutputTokens: asTokenCountOrNull(providerOutputTokens),
    providerReasoningTokens: asTokenCountOrNull(providerReasoningTokens),
    providerTotalTokens: asTokenCountOrNull(providerTotalTokens),
    providerBilledInputTokens: asTokenCountOrNull(providerBilledInputTokens),
    providerBilledTotalTokens: asTokenCountOrNull(providerBilledTotalTokens),
    providerOccupancyTokens: effectiveProviderOccupancyTokens,
  }

  return {
    ...providerUsage,
    estimatedOccupancyTokens: normalizedEstimatedTokens,
    effectiveOccupancyTokens,
    occupancySource: normalizedOccupancySource,
    occupancyConfidence: normalizedOccupancyConfidence,
    occupancyMethod: normalizedOccupancyMethod,
    providerUsageSemantics: String(providerUsageSemantics || 'estimate_only'),
    providerUsageAvailable: hasProviderUsage(providerUsage),
    threadOccupancyTokens: effectiveOccupancyTokens,
    threadOccupancyAvailable: effectiveProviderOccupancyTokens !== null || normalizedEstimatedTokens !== null,
    threadOccupancySource: normalizedOccupancySource,
    threadOccupancyConfidence: normalizedOccupancyConfidence,
    threadOccupancyMethod: normalizedOccupancyMethod,
    threadOccupancyProvenance,
    estimatedThreadOccupancyTokens: normalizedEstimatedTokens,
    providerVerifiedThreadOccupancyTokens,
  }
}

function extractProviderResponseContextTelemetry(providerResponseMeta = null) {
  const responseMeta = providerResponseMeta && typeof providerResponseMeta === 'object'
    ? providerResponseMeta
    : null
  if (!responseMeta) {
    return {
      inputLimitTokens: null,
      remainingContextTokens: null,
      threadOccupancyTokens: null,
    }
  }

  const inputLimitTokens = pickTokenCount(responseMeta?.inputLimitTokens)
  const remainingContextTokens = pickTokenCount(
    responseMeta?.remainingContextTokens,
    responseMeta?.contextRemainingTokens,
    responseMeta?.remainingTokens,
  )
  const explicitThreadOccupancyTokens = pickTokenCount(
    responseMeta?.threadOccupancyTokens,
    responseMeta?.contextOccupancyTokens,
    responseMeta?.occupancyTokens,
  )
  const threadOccupancyTokens = explicitThreadOccupancyTokens !== null
    ? explicitThreadOccupancyTokens
    : (
        inputLimitTokens !== null && remainingContextTokens !== null
          ? Math.max(0, inputLimitTokens - remainingContextTokens)
          : null
      )
  const threadCumulativeTotalTokens = pickTokenCount(responseMeta?.threadCumulativeTotalTokens)

  return {
    inputLimitTokens,
    remainingContextTokens,
    threadOccupancyTokens,
    threadCumulativeTotalTokens,
  }
}

function mapAnthropicUsage({
  usage = null,
  base = {},
  estimatedOccupancyTokens = 0,
  estimatedOccupancyConfidence = 'rough_estimate',
  estimatedOccupancyMethod = 'history_estimate',
} = {}) {
  const raw = usage?.raw && typeof usage.raw === 'object' ? usage.raw : null
  const rawInputTokens = pickTokenCount(raw?.input_tokens, raw?.inputTokens)
  const rawCacheReadTokens = pickTokenCount(
    raw?.cache_read_input_tokens,
    raw?.cacheReadInputTokens,
    raw?.cacheReadTokens,
  )
  const rawCacheWriteTokens = pickTokenCount(
    raw?.cache_creation_input_tokens,
    raw?.cacheCreationInputTokens,
    raw?.cacheWriteTokens,
  )
  const rawOutputTokens = pickTokenCount(raw?.output_tokens, raw?.outputTokens)
  const providerOccupancyTokens = rawInputTokens === null
    ? null
    : rawInputTokens + (rawCacheReadTokens ?? 0) + (rawCacheWriteTokens ?? 0)
  const providerInputNoCacheTokens = rawInputTokens
  const providerOutputTokens = rawOutputTokens ?? base.providerOutputTokens
  const providerTotalTokens = providerOccupancyTokens === null && providerOutputTokens === null
    ? null
    : (providerOccupancyTokens ?? 0) + (providerOutputTokens ?? 0)
  const providerContextOccupancyTokens = providerTotalTokens ?? providerOccupancyTokens

  return buildOccupancyTelemetry({
    base,
    estimatedOccupancyTokens,
    providerOccupancyTokens: providerContextOccupancyTokens,
    providerInputTokens: providerOccupancyTokens,
    providerInputNoCacheTokens,
    providerCachedReadTokens: rawCacheReadTokens ?? base.providerCachedReadTokens,
    providerCachedWriteTokens: rawCacheWriteTokens ?? base.providerCachedWriteTokens,
    providerOutputTokens,
    providerReasoningTokens: base.providerReasoningTokens,
    providerTotalTokens,
    providerBilledInputTokens: base.providerBilledInputTokens,
    providerBilledTotalTokens: base.providerBilledTotalTokens,
    occupancySource: providerContextOccupancyTokens !== null ? 'provider_last_request' : 'estimated_history',
    occupancyConfidence: providerContextOccupancyTokens !== null ? 'provider_mapped' : estimatedOccupancyConfidence,
    occupancyMethod: providerContextOccupancyTokens !== null
      ? 'anthropic_current_turn_total_raw_plus_cache'
      : estimatedOccupancyMethod,
    providerUsageSemantics: 'anthropic_top_level_current_turn_plus_cache_vs_billed_iterations',
  })
}

export function mapProviderContextUsage({
  providerId = '',
  usage = null,
  providerResponseMeta = null,
  promptOccupancyEstimateTokens = 0,
  promptOccupancyEstimateConfidence = 'rough_estimate',
  promptOccupancyEstimateMethod = 'history_estimate',
  authMethod = '',
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const normalizedAuthMethod = String(
    authMethod || providerResponseMeta?.authMethod || ''
  ).trim().toLowerCase()
  const estimatedOccupancyTokens = asTokenCountOrNull(promptOccupancyEstimateTokens) ?? 0
  const estimatedOccupancyConfidence = String(promptOccupancyEstimateConfidence || 'rough_estimate')
  const estimatedOccupancyMethod = String(promptOccupancyEstimateMethod || 'history_estimate')
  const providerResponseContext = extractProviderResponseContextTelemetry(providerResponseMeta)
  const base = buildBaseProviderUsage(usage)

  if (normalizedProviderId === 'anthropic') {
    return mapAnthropicUsage({
      usage,
      base,
      estimatedOccupancyTokens,
      estimatedOccupancyConfidence,
      estimatedOccupancyMethod,
    })
  }

  const providerLastRequestTokens = base.providerTotalTokens ?? base.providerInputTokens
  const directProviderOccupancy = buildOccupancyTelemetry({
    base,
    estimatedOccupancyTokens,
    providerOccupancyTokens: providerLastRequestTokens,
    providerInputTokens: base.providerInputTokens,
    providerInputNoCacheTokens: base.providerInputNoCacheTokens,
    providerCachedReadTokens: base.providerCachedReadTokens,
    providerCachedWriteTokens: base.providerCachedWriteTokens,
    providerOutputTokens: base.providerOutputTokens,
    providerReasoningTokens: base.providerReasoningTokens,
    providerTotalTokens: base.providerTotalTokens,
    providerBilledInputTokens: base.providerBilledInputTokens,
    providerBilledTotalTokens: base.providerBilledTotalTokens,
  })

  switch (normalizedProviderId) {
    case 'openai':
      if (normalizedAuthMethod === 'account') {
        if (providerResponseContext.threadOccupancyTokens !== null) {
          return buildOccupancyTelemetry({
            base,
            estimatedOccupancyTokens,
            providerOccupancyTokens: providerResponseContext.threadOccupancyTokens,
            providerInputTokens: base.providerInputTokens,
            providerInputNoCacheTokens: base.providerInputNoCacheTokens,
            providerCachedReadTokens: base.providerCachedReadTokens,
            providerCachedWriteTokens: base.providerCachedWriteTokens,
            providerOutputTokens: base.providerOutputTokens,
            providerReasoningTokens: base.providerReasoningTokens,
            providerTotalTokens: base.providerTotalTokens,
            providerBilledInputTokens: base.providerBilledInputTokens,
            providerBilledTotalTokens: base.providerBilledTotalTokens,
            occupancySource: 'provider_thread_context',
            occupancyConfidence: 'provider_verified',
            occupancyMethod: providerResponseContext.remainingContextTokens !== null
              ? 'provider_remaining_tokens'
              : 'provider_thread_occupancy_tokens',
            providerUsageSemantics: String(providerResponseMeta?.providerUsageSemantics || 'openai_account_provider_context'),
          })
        }
        return buildOccupancyTelemetry({
          base,
          estimatedOccupancyTokens,
          providerInputTokens: base.providerInputTokens,
          providerInputNoCacheTokens: base.providerInputNoCacheTokens,
          providerCachedReadTokens: base.providerCachedReadTokens,
          providerCachedWriteTokens: base.providerCachedWriteTokens,
          providerOutputTokens: base.providerOutputTokens,
          providerReasoningTokens: base.providerReasoningTokens,
          providerTotalTokens: base.providerTotalTokens,
          providerBilledInputTokens: base.providerBilledInputTokens,
          providerBilledTotalTokens: base.providerBilledTotalTokens,
          occupancySource: 'thread_local_estimate',
          occupancyConfidence: estimatedOccupancyConfidence,
          occupancyMethod: estimatedOccupancyMethod,
          providerUsageSemantics: String(
            providerResponseMeta?.providerUsageSemantics || 'openai_account_provider_context_unavailable'
          ),
        })
      }
      return {
        ...directProviderOccupancy,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
        occupancyMethod: 'provider_last_total_tokens',
        providerUsageSemantics: 'openai_last_request_total_tokens',
      }
    case 'gemini':
      return {
        ...directProviderOccupancy,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
        occupancyMethod: 'provider_last_total_tokens',
        providerUsageSemantics: 'gemini_last_request_total_tokens',
      }
    case 'groq':
      return {
        ...directProviderOccupancy,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
        occupancyMethod: 'provider_last_total_tokens',
        providerUsageSemantics: 'groq_last_request_total_tokens',
      }
    case 'mistral':
      return {
        ...directProviderOccupancy,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
        occupancyMethod: 'provider_last_total_tokens',
        providerUsageSemantics: 'mistral_last_request_total_tokens',
      }
    case 'perplexity':
      return {
        ...directProviderOccupancy,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_verified',
        occupancyMethod: 'provider_last_total_tokens',
        providerUsageSemantics: 'perplexity_last_request_total_tokens',
      }
    case 'grok':
      return {
        ...directProviderOccupancy,
        occupancySource: 'provider_last_request',
        occupancyConfidence: 'provider_mapped',
        occupancyMethod: 'provider_last_total_tokens',
        providerUsageSemantics: 'xai_last_request_total_tokens_cache_heuristic',
      }
    case 'openrouter':
    case 'moonshot':
      if (directProviderOccupancy.providerUsageAvailable) {
        return {
          ...directProviderOccupancy,
          occupancySource: 'provider_last_request',
          occupancyConfidence: 'provider_mapped',
          occupancyMethod: 'provider_last_total_tokens',
          providerUsageSemantics: 'openai_compatible_last_request_total_tokens',
        }
      }
      return {
        ...directProviderOccupancy,
        providerOccupancyTokens: null,
        effectiveOccupancyTokens: estimatedOccupancyTokens,
        occupancySource: 'estimated_history',
        occupancyConfidence: estimatedOccupancyConfidence,
        occupancyMethod: estimatedOccupancyMethod,
        providerUsageSemantics: 'openai_compatible_usage_missing',
      }
    case 'deepseek':
    case 'lmstudio':
    case 'ollama':
      return buildOccupancyTelemetry({
        base,
        estimatedOccupancyTokens,
        providerInputTokens: base.providerInputTokens,
        providerInputNoCacheTokens: base.providerInputNoCacheTokens,
        providerCachedReadTokens: base.providerCachedReadTokens,
        providerCachedWriteTokens: base.providerCachedWriteTokens,
        providerOutputTokens: base.providerOutputTokens,
        providerReasoningTokens: base.providerReasoningTokens,
        providerTotalTokens: base.providerTotalTokens,
        providerBilledInputTokens: base.providerBilledInputTokens,
        providerBilledTotalTokens: base.providerBilledTotalTokens,
        occupancySource: 'estimated_history',
        occupancyConfidence: estimatedOccupancyConfidence,
        occupancyMethod: estimatedOccupancyMethod,
        providerUsageSemantics: 'provider_estimate_only',
      })
    default:
      return buildOccupancyTelemetry({
        base,
        estimatedOccupancyTokens,
        providerInputTokens: base.providerInputTokens,
        providerInputNoCacheTokens: base.providerInputNoCacheTokens,
        providerCachedReadTokens: base.providerCachedReadTokens,
        providerCachedWriteTokens: base.providerCachedWriteTokens,
        providerOutputTokens: base.providerOutputTokens,
        providerReasoningTokens: base.providerReasoningTokens,
        providerTotalTokens: base.providerTotalTokens,
        providerBilledInputTokens: base.providerBilledInputTokens,
        providerBilledTotalTokens: base.providerBilledTotalTokens,
        occupancySource: 'estimated_history',
        occupancyConfidence: estimatedOccupancyConfidence,
        occupancyMethod: estimatedOccupancyMethod,
        providerUsageSemantics: base.providerUsageAvailable ? 'provider_usage_unclassified_estimate_backed' : 'estimate_only',
      })
  }
}
