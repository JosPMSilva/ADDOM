import { resolveRegistryModel } from '../api-clients/model-registry.mjs'
import { estimateHistoryTokens } from './context-compaction.mjs'

function clean(value) {
  return String(value ?? '').trim()
}

function clampPositiveInt(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return Math.max(0, Number(fallback || 0) || 0)
  return Math.max(0, Math.round(n))
}

function resolveEstimatedOutputTokens({
  mode = 'execute',
  maxOutputTokens = 0,
  contextLimitTokens = 0,
} = {}) {
  const safeMode = clean(mode).toLowerCase() || 'execute'
  const baseByMode = safeMode === 'plan'
    ? 700
    : (safeMode === 'thinking' ? 1400 : 1100)
  const safeMaxOutput = clampPositiveInt(maxOutputTokens, 0)
  const safeContextLimit = clampPositiveInt(contextLimitTokens, 0)
  if (safeMaxOutput > 0) {
    const proportional = Math.floor(safeMaxOutput * 0.22)
    const estimate = Math.max(220, baseByMode, proportional)
    return Math.min(safeMaxOutput, estimate)
  }
  if (safeContextLimit > 0) {
    const proportional = Math.floor(safeContextLimit * 0.015)
    return Math.max(220, Math.min(4200, Math.max(baseByMode, proportional)))
  }
  return Math.max(220, baseByMode)
}

function resolvePricingMeta(providerId = '', model = '') {
  const resolved = resolveRegistryModel(providerId, model)
  const pricing = resolved?.model?.pricing && typeof resolved.model.pricing === 'object'
    ? resolved.model.pricing
    : null
  const notes = clean(pricing?.notes || resolved?.model?.notes)
  const providerKey = clean(providerId).toLowerCase()
  const hasRequestFeeCaveat = providerKey === 'perplexity' || notes.toLowerCase().includes('request-fee')
  return { pricing, notes, hasRequestFeeCaveat }
}

export function resolveEffectiveTokenPricing(pricing = null, estimatedInputTokens = 0) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return null
  const safeEstimatedInputTokens = clampPositiveInt(estimatedInputTokens, 0)
  const tiers = Array.isArray(pricing.tiers)
    ? pricing.tiers.filter((tier) => tier && typeof tier === 'object' && !Array.isArray(tier))
    : []

  const matchingTier = tiers
    .filter((tier) => {
      const min = Number.isFinite(tier.minPromptTokens) ? Number(tier.minPromptTokens) : null
      const max = Number.isFinite(tier.maxPromptTokens) ? Number(tier.maxPromptTokens) : null
      if (min != null && safeEstimatedInputTokens < min) return false
      if (max != null && safeEstimatedInputTokens > max) return false
      return true
    })
    .sort((left, right) => {
      const leftMin = Number.isFinite(left?.minPromptTokens) ? Number(left.minPromptTokens) : -1
      const rightMin = Number.isFinite(right?.minPromptTokens) ? Number(right.minPromptTokens) : -1
      return rightMin - leftMin
    })[0] || null

  if (!matchingTier) return pricing
  return {
    ...pricing,
    ...matchingTier,
    tiers,
    appliedTierId: String(matchingTier.id || '').trim() || null,
  }
}

export function estimateSingleTurnCost({
  providerId = '',
  model = '',
  mode = 'execute',
  history = [],
  modelContext = {},
} = {}) {
  const safeProviderId = clean(providerId)
  const safeModel = clean(model)
  const contextLimitTokens = clampPositiveInt(modelContext?.limitTokens, 0)
  const maxOutputTokens = clampPositiveInt(modelContext?.maxOutputTokens, 0)
  const estimatedInputTokens = clampPositiveInt(estimateHistoryTokens(history), 0)
  const estimatedOutputTokens = resolveEstimatedOutputTokens({
    mode,
    maxOutputTokens,
    contextLimitTokens,
  })
  const estimatedTotalTokens = clampPositiveInt(estimatedInputTokens + estimatedOutputTokens, 0)

  const pricingMeta = resolvePricingMeta(safeProviderId, safeModel)
  const effectivePricing = resolveEffectiveTokenPricing(pricingMeta?.pricing, estimatedInputTokens)
  const inputUsdPer1M = Number(effectivePricing?.inputUsdPer1M)
  const outputUsdPer1M = Number(effectivePricing?.outputUsdPer1M)
  const canPrice = Number.isFinite(inputUsdPer1M) && Number.isFinite(outputUsdPer1M)
  const estimatedUsd = canPrice
    ? (
        (estimatedInputTokens / 1_000_000) * inputUsdPer1M
        + (estimatedOutputTokens / 1_000_000) * outputUsdPer1M
      )
    : null
  const usdAvailable = estimatedUsd != null
  const estimateConfidence = pricingMeta.hasRequestFeeCaveat
    ? 'partial_request_fee'
    : (usdAvailable ? 'token_plus_pricing' : 'token_only')
  const pricingWarning = pricingMeta.hasRequestFeeCaveat
    ? (pricingMeta.notes || 'Provider uses request-fee components; token-only pricing is partial.')
    : ''

  return {
    providerId: safeProviderId,
    model: safeModel,
    mode: clean(mode) || 'execute',
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedUsd,
    usdAvailable,
    estimateConfidence,
    pricingWarning,
    source: 'pre_turn',
    contextLimitTokens,
    maxOutputTokens,
  }
}
