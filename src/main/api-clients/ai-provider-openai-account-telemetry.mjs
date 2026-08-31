export function asTokenCountOrNull(value = null) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.max(0, Math.round(n))
}

function pickTokenCount(...values) {
  for (const value of values) {
    const tokenCount = asTokenCountOrNull(value)
    if (tokenCount !== null) return tokenCount
  }
  return null
}

function extractOpenAIAccountUsageRecord(usage = null) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null

  const inputTokens = pickTokenCount(
    usage?.inputTokens,
    usage?.input_tokens,
    usage?.promptTokens,
    usage?.prompt_tokens,
  )
  const outputTokens = pickTokenCount(
    usage?.outputTokens,
    usage?.output_tokens,
    usage?.completionTokens,
    usage?.completion_tokens,
  )
  const reasoningTokens = pickTokenCount(
    usage?.reasoningTokens,
    usage?.reasoning_tokens,
    usage?.reasoningOutputTokens,
    usage?.reasoning_output_tokens,
    usage?.outputTokenDetails?.reasoningTokens,
    usage?.output_token_details?.reasoning_tokens,
  )
  const totalTokens = pickTokenCount(
    usage?.totalTokens,
    usage?.total_tokens,
  )
  const cacheReadTokens = pickTokenCount(
    usage?.inputTokenDetails?.cacheReadTokens,
    usage?.input_token_details?.cache_read_tokens,
    usage?.cachedInputTokens,
    usage?.cacheReadTokens,
    usage?.cache_read_input_tokens,
  )
  const cacheWriteTokens = pickTokenCount(
    usage?.inputTokenDetails?.cacheWriteTokens,
    usage?.input_token_details?.cache_write_tokens,
    usage?.cacheWriteTokens,
    usage?.cache_write_input_tokens,
  )

  if (
    inputTokens === null
    && outputTokens === null
    && reasoningTokens === null
    && totalTokens === null
    && cacheReadTokens === null
    && cacheWriteTokens === null
  ) {
    return null
  }

  return {
    ...(inputTokens !== null ? { inputTokens } : {}),
    ...(outputTokens !== null ? { outputTokens } : {}),
    ...(reasoningTokens !== null ? { reasoningTokens } : {}),
    ...(totalTokens !== null ? { totalTokens } : {}),
    ...(
      cacheReadTokens !== null || cacheWriteTokens !== null
        ? {
            inputTokenDetails: {
              ...(cacheReadTokens !== null ? { cacheReadTokens } : {}),
              ...(cacheWriteTokens !== null ? { cacheWriteTokens } : {}),
            },
          }
        : {}
    ),
  }
}

export function mergeOpenAIAccountUsage(primaryUsage = null, fallbackUsage = null) {
  const primary = primaryUsage && typeof primaryUsage === 'object' ? primaryUsage : null
  const fallback = fallbackUsage && typeof fallbackUsage === 'object' ? fallbackUsage : null
  if (!primary && !fallback) return null

  const inputTokenDetails = {
    ...(fallback?.inputTokenDetails && typeof fallback.inputTokenDetails === 'object' ? fallback.inputTokenDetails : {}),
    ...(primary?.inputTokenDetails && typeof primary.inputTokenDetails === 'object' ? primary.inputTokenDetails : {}),
  }

  const merged = {
    ...(fallback ? { ...fallback } : {}),
    ...(primary ? { ...primary } : {}),
  }
  if (Object.keys(inputTokenDetails).length > 0) {
    merged.inputTokenDetails = inputTokenDetails
  }
  return extractOpenAIAccountUsageRecord(merged)
}

export function extractOpenAIAccountTurnUsage(turn = null) {
  const usage = [
    turn?.usage,
    turn?.tokenUsage,
    turn?.metrics?.usage,
    turn?.result?.usage,
    turn?.response?.usage,
  ].find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))

  return extractOpenAIAccountUsageRecord(usage)
}

export function extractOpenAIAccountTurnContextTelemetry(turn = null) {
  const limitTokens = pickTokenCount(
    turn?.inputLimitTokens,
    turn?.limits?.inputLimitTokens,
    turn?.limits?.inputTokens,
    turn?.limits?.input,
    turn?.contextUsage?.inputLimitTokens,
    turn?.contextUsage?.limitTokens,
    turn?.context?.inputLimitTokens,
    turn?.context?.limitTokens,
    turn?.metrics?.context?.inputLimitTokens,
    turn?.metrics?.context?.limitTokens,
    turn?.usage?.context?.inputLimitTokens,
  )
  const remainingContextTokens = pickTokenCount(
    turn?.remainingContextTokens,
    turn?.contextRemainingTokens,
    turn?.remainingTokens,
    turn?.contextUsage?.remainingContextTokens,
    turn?.contextUsage?.contextRemainingTokens,
    turn?.context?.remainingContextTokens,
    turn?.context?.contextRemainingTokens,
    turn?.metrics?.context?.remainingContextTokens,
    turn?.usage?.context?.remainingContextTokens,
  )
  const explicitThreadOccupancyTokens = pickTokenCount(
    turn?.threadOccupancyTokens,
    turn?.contextOccupancyTokens,
    turn?.occupancyTokens,
    turn?.contextUsage?.threadOccupancyTokens,
    turn?.contextUsage?.contextOccupancyTokens,
    turn?.context?.threadOccupancyTokens,
    turn?.context?.contextOccupancyTokens,
    turn?.metrics?.context?.threadOccupancyTokens,
    turn?.usage?.context?.threadOccupancyTokens,
  )
  const threadOccupancyTokens = explicitThreadOccupancyTokens !== null
    ? explicitThreadOccupancyTokens
    : (
        limitTokens !== null && remainingContextTokens !== null
          ? Math.max(0, limitTokens - remainingContextTokens)
          : null
      )

  if (limitTokens === null && remainingContextTokens === null && threadOccupancyTokens === null) {
    return null
  }

  return {
    ...(limitTokens !== null ? { inputLimitTokens: limitTokens } : {}),
    ...(remainingContextTokens !== null ? { remainingContextTokens } : {}),
    ...(threadOccupancyTokens !== null ? { threadOccupancyTokens } : {}),
    providerUsageSemantics: 'openai_account_provider_context',
  }
}

export function extractOpenAIAccountThreadTokenUsageTelemetry(params = null) {
  const tokenUsage = [
    params?.tokenUsage,
    params?.usage,
    params?.metrics?.tokenUsage,
  ].find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))

  if (!tokenUsage) return null

  const usage = extractOpenAIAccountUsageRecord(tokenUsage?.last)
  const threadCumulativeTotalTokens = pickTokenCount(tokenUsage?.total?.totalTokens)
  const inputLimitTokens = pickTokenCount(
    tokenUsage?.modelContextWindow,
    tokenUsage?.contextWindow,
    tokenUsage?.inputLimitTokens,
    tokenUsage?.limitTokens,
  )
  const explicitRemainingContextTokens = pickTokenCount(
    tokenUsage?.remainingContextTokens,
    tokenUsage?.contextRemainingTokens,
    tokenUsage?.remainingTokens,
  )
  const explicitThreadOccupancyTokens = pickTokenCount(
    tokenUsage?.threadOccupancyTokens,
    tokenUsage?.contextOccupancyTokens,
    tokenUsage?.occupancyTokens,
  )
  const lastTotalTokens = pickTokenCount(
    tokenUsage?.last?.totalTokens,
    tokenUsage?.last?.total_tokens,
  )
  const threadOccupancyTokens = explicitThreadOccupancyTokens !== null
    ? explicitThreadOccupancyTokens
    : (
        inputLimitTokens !== null && explicitRemainingContextTokens !== null
          ? Math.max(0, inputLimitTokens - explicitRemainingContextTokens)
          : lastTotalTokens
      )
  const remainingContextTokens = explicitRemainingContextTokens !== null
    ? explicitRemainingContextTokens
    : (
        inputLimitTokens !== null && threadOccupancyTokens !== null
          ? Math.max(0, inputLimitTokens - threadOccupancyTokens)
          : null
      )
  const hasProviderContext = remainingContextTokens !== null || threadOccupancyTokens !== null

  if (
    !usage
    && inputLimitTokens === null
    && remainingContextTokens === null
    && threadOccupancyTokens === null
    && threadCumulativeTotalTokens === null
  ) {
    return null
  }

  return {
    ...(usage ? { usage } : {}),
    ...(inputLimitTokens !== null ? { inputLimitTokens } : {}),
    ...(remainingContextTokens !== null ? { remainingContextTokens } : {}),
    ...(threadOccupancyTokens !== null ? { threadOccupancyTokens } : {}),
    ...(threadCumulativeTotalTokens !== null ? { threadCumulativeTotalTokens } : {}),
    providerUsageSemantics: hasProviderContext
      ? 'openai_account_provider_context'
      : '',
  }
}

export function mergeOpenAIAccountContextTelemetry(primaryTelemetry = null, fallbackTelemetry = null) {
  const primary = primaryTelemetry && typeof primaryTelemetry === 'object' ? primaryTelemetry : null
  const fallback = fallbackTelemetry && typeof fallbackTelemetry === 'object' ? fallbackTelemetry : null
  if (!primary && !fallback) return null

  const inputLimitTokens = pickTokenCount(primary?.inputLimitTokens, fallback?.inputLimitTokens)
  const threadCumulativeTotalTokens = pickTokenCount(
    primary?.threadCumulativeTotalTokens,
    fallback?.threadCumulativeTotalTokens,
  )
  const remainingContextTokens = pickTokenCount(primary?.remainingContextTokens, fallback?.remainingContextTokens)
  const threadOccupancyTokens = pickTokenCount(
    primary?.threadOccupancyTokens,
    fallback?.threadOccupancyTokens,
  )
  const providerUsageSemantics = String(
    primary?.providerUsageSemantics
    || fallback?.providerUsageSemantics
    || '',
  ).trim()

  if (
    inputLimitTokens === null
    && threadCumulativeTotalTokens === null
    && remainingContextTokens === null
    && threadOccupancyTokens === null
    && !providerUsageSemantics
  ) {
    return null
  }

  return {
    ...(inputLimitTokens !== null ? { inputLimitTokens } : {}),
    ...(remainingContextTokens !== null ? { remainingContextTokens } : {}),
    ...(threadOccupancyTokens !== null ? { threadOccupancyTokens } : {}),
    ...(threadCumulativeTotalTokens !== null ? { threadCumulativeTotalTokens } : {}),
    ...(providerUsageSemantics ? { providerUsageSemantics } : {}),
  }
}

export function resolveOpenAIAccountUsageRefreshTelemetry({
  completedTurn = null,
  threadTokenUsageTelemetry = null,
} = {}) {
  const normalizedThreadTokenUsageTelemetry = (
    threadTokenUsageTelemetry
    && typeof threadTokenUsageTelemetry === 'object'
    && !Array.isArray(threadTokenUsageTelemetry)
  )
    ? threadTokenUsageTelemetry
    : null

  return {
    usage: mergeOpenAIAccountUsage(
      extractOpenAIAccountTurnUsage(completedTurn),
      normalizedThreadTokenUsageTelemetry?.usage,
    ),
    contextTelemetry: mergeOpenAIAccountContextTelemetry(
      extractOpenAIAccountTurnContextTelemetry(completedTurn),
      normalizedThreadTokenUsageTelemetry,
    ),
  }
}
