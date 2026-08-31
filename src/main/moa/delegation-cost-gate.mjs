function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function evaluateDelegationCostGate(plannerPacket = {}, budgetPolicy = {}) {
  const estimatedTokens = asNumber(plannerPacket?.estimatedTokens, 0)
  const estimatedUsd = asNumber(plannerPacket?.estimatedUsd, 0)
  const usdAvailable = !!plannerPacket?.usdAvailable
  const estimateConfidence = String(plannerPacket?.estimateConfidence || '').trim().toLowerCase() || 'token_only'
  const partialRequestFee = estimateConfidence === 'partial_request_fee'
  const softTokenWarnThreshold = asNumber(budgetPolicy?.softTokenWarnThreshold, 0)
  const softUsdWarnThreshold = asNumber(budgetPolicy?.softUsdWarnThreshold, 0)
  const shouldWarn = (
    (softTokenWarnThreshold > 0 && estimatedTokens >= softTokenWarnThreshold)
    || (softUsdWarnThreshold > 0 && usdAvailable && estimatedUsd >= softUsdWarnThreshold)
  )

  return {
    estimatedTokens,
    estimatedUsd: usdAvailable ? estimatedUsd : null,
    usdAvailable,
    estimateConfidence,
    partialRequestFee,
    shouldWarn,
  }
}

