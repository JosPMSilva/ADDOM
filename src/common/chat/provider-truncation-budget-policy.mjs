export const DEFAULT_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT = 85
export const MIN_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT = 1
export const MAX_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT = 100
export const PROVIDER_TRUNCATION_FORCED_TRIGGER_PERCENT = 100
export const DEFAULT_PROVIDER_TRUNCATION_CRITICAL_TASK_ALLOWANCE_PERCENT = 15
export const MAX_PROVIDER_TRUNCATION_CRITICAL_TASK_ALLOWANCE_PERCENT = 30
export const MIN_PROVIDER_TRUNCATION_TRIGGER_TOKENS = 4_096
export const DEFAULT_PROVIDER_TRUNCATION_ESTIMATE_SAFETY_MULTIPLIER = 1.15
export const DEFAULT_PROVIDER_TRUNCATION_FIXED_OVERHEAD_TOKENS = 512
export const DEFAULT_PROVIDER_TRUNCATION_OUTPUT_RESERVE_RATIO = 0.2
export const DEFAULT_PROVIDER_TRUNCATION_SAFETY_RESERVE_RATIO = 0.03
export const MIN_PROVIDER_TRUNCATION_OUTPUT_RESERVE_TOKENS = 512
export const MIN_PROVIDER_TRUNCATION_SAFETY_RESERVE_TOKENS = 256

function clampInt(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function resolveSoftTriggerPercentFallback(fallback = DEFAULT_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT) {
  return clampInt(
    fallback,
    DEFAULT_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT,
    MIN_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT,
    MAX_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT,
  )
}

function deriveTriggerTokens(limitTokens = 0, triggerPercent = DEFAULT_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT) {
  const normalizedLimitTokens = Math.max(0, Math.round(Number(limitTokens || 0) || 0))
  if (normalizedLimitTokens <= 0) return 0
  const derivedTokens = Math.floor(normalizedLimitTokens * (Number(triggerPercent || 0) / 100))
  const minimumTokens = Math.min(normalizedLimitTokens, MIN_PROVIDER_TRUNCATION_TRIGGER_TOKENS)
  return Math.min(normalizedLimitTokens, Math.max(minimumTokens, derivedTokens))
}

function normalizePositiveInt(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.max(0, Math.round(Number(fallback || 0) || 0))
  return Math.max(0, Math.round(numeric))
}

function normalizeRatio(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return numeric
}

export function normalizeProviderTruncationSoftTriggerPercent(
  value,
  fallback = DEFAULT_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT,
) {
  const normalizedFallback = resolveSoftTriggerPercentFallback(fallback)
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return normalizedFallback
  return clampInt(
    numeric,
    normalizedFallback,
    MIN_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT,
    MAX_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT,
  )
}

export function buildProviderTruncationBudget({
  modelContextLimitTokens = 0,
  softTriggerPercent = DEFAULT_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT,
} = {}) {
  const normalizedSoftTriggerPercent = normalizeProviderTruncationSoftTriggerPercent(softTriggerPercent)
  const remainingPercent = Math.max(
    0,
    PROVIDER_TRUNCATION_FORCED_TRIGGER_PERCENT - normalizedSoftTriggerPercent,
  )
  const criticalTaskAllowanceFloorPercent = Math.min(
    remainingPercent,
    DEFAULT_PROVIDER_TRUNCATION_CRITICAL_TASK_ALLOWANCE_PERCENT,
  )
  const criticalTaskAllowanceCeilingPercent = Math.min(
    remainingPercent,
    MAX_PROVIDER_TRUNCATION_CRITICAL_TASK_ALLOWANCE_PERCENT,
  )
  const criticalTaskTriggerFloorPercent = Math.min(
    PROVIDER_TRUNCATION_FORCED_TRIGGER_PERCENT,
    normalizedSoftTriggerPercent + criticalTaskAllowanceFloorPercent,
  )
  const criticalTaskTriggerCeilingPercent = Math.min(
    PROVIDER_TRUNCATION_FORCED_TRIGGER_PERCENT,
    normalizedSoftTriggerPercent + criticalTaskAllowanceCeilingPercent,
  )

  return {
    softTriggerPercent: normalizedSoftTriggerPercent,
    softTriggerTokens: deriveTriggerTokens(modelContextLimitTokens, normalizedSoftTriggerPercent),
    criticalTaskAllowanceFloorPercent,
    criticalTaskAllowanceCeilingPercent,
    criticalTaskTriggerFloorPercent,
    criticalTaskTriggerFloorTokens: deriveTriggerTokens(modelContextLimitTokens, criticalTaskTriggerFloorPercent),
    criticalTaskTriggerCeilingPercent,
    criticalTaskTriggerCeilingTokens: deriveTriggerTokens(modelContextLimitTokens, criticalTaskTriggerCeilingPercent),
    forcedTriggerPercent: PROVIDER_TRUNCATION_FORCED_TRIGGER_PERCENT,
    forcedTriggerTokens: deriveTriggerTokens(
      modelContextLimitTokens,
      PROVIDER_TRUNCATION_FORCED_TRIGGER_PERCENT,
    ),
  }
}

export function buildProviderTruncationEffectivePromptBudget({
  modelContextLimitTokens = 0,
  maxOutputTokens = null,
  outputReserveRatio = DEFAULT_PROVIDER_TRUNCATION_OUTPUT_RESERVE_RATIO,
  safetyReserveRatio = DEFAULT_PROVIDER_TRUNCATION_SAFETY_RESERVE_RATIO,
} = {}) {
  const limitTokens = normalizePositiveInt(modelContextLimitTokens, 0)
  if (limitTokens <= 0) {
    return {
      limitTokens: 0,
      outputReserveTokens: 0,
      safetyReserveTokens: 0,
      effectivePromptBudgetTokens: 0,
    }
  }
  const outputRatio = normalizeRatio(
    outputReserveRatio,
    DEFAULT_PROVIDER_TRUNCATION_OUTPUT_RESERVE_RATIO,
  )
  const reserveByRatio = Math.max(
    MIN_PROVIDER_TRUNCATION_OUTPUT_RESERVE_TOKENS,
    Math.floor(limitTokens * outputRatio),
  )
  const explicitMaxOutputTokens = normalizePositiveInt(maxOutputTokens, 0)
  const outputReserveTokens = explicitMaxOutputTokens > 0
    ? Math.max(256, Math.min(reserveByRatio, explicitMaxOutputTokens))
    : reserveByRatio
  const safetyRatio = normalizeRatio(
    safetyReserveRatio,
    DEFAULT_PROVIDER_TRUNCATION_SAFETY_RESERVE_RATIO,
  )
  const safetyReserveTokens = Math.max(
    MIN_PROVIDER_TRUNCATION_SAFETY_RESERVE_TOKENS,
    Math.floor(limitTokens * safetyRatio),
  )
  const effectivePromptBudgetTokens = Math.max(
    MIN_PROVIDER_TRUNCATION_TRIGGER_TOKENS,
    limitTokens - outputReserveTokens - safetyReserveTokens,
  )
  return {
    limitTokens,
    outputReserveTokens,
    safetyReserveTokens,
    effectivePromptBudgetTokens: Math.min(limitTokens, effectivePromptBudgetTokens),
  }
}

export function buildSafeProviderTruncationOccupancyEstimate(
  occupancyTokens = 0,
  {
    multiplier = DEFAULT_PROVIDER_TRUNCATION_ESTIMATE_SAFETY_MULTIPLIER,
    fixedOverheadTokens = DEFAULT_PROVIDER_TRUNCATION_FIXED_OVERHEAD_TOKENS,
  } = {},
) {
  const baseTokens = Math.max(0, Number(occupancyTokens || 0) || 0)
  if (baseTokens <= 0) return 0
  const normalizedMultiplier = normalizeRatio(
    multiplier,
    DEFAULT_PROVIDER_TRUNCATION_ESTIMATE_SAFETY_MULTIPLIER,
  )
  const overheadTokens = normalizePositiveInt(
    fixedOverheadTokens,
    DEFAULT_PROVIDER_TRUNCATION_FIXED_OVERHEAD_TOKENS,
  )
  return Math.max(
    0,
    Math.round((baseTokens * normalizedMultiplier) + overheadTokens),
  )
}

export function resolveProviderTruncationTriggerTokens({
  budget = null,
  criticalTaskState = null,
  fallbackTokens = 0,
} = {}) {
  const resolvedBudget = budget && typeof budget === 'object' ? budget : {}
  const state = criticalTaskState && typeof criticalTaskState === 'object'
    ? criticalTaskState
    : {}
  if (state.active === true) {
    const allowanceLevel = String(state.allowanceLevel || '').trim().toLowerCase()
    if (allowanceLevel === 'ceiling') {
      return normalizePositiveInt(
        resolvedBudget.criticalTaskTriggerCeilingTokens,
        fallbackTokens,
      )
    }
    return normalizePositiveInt(
      resolvedBudget.criticalTaskTriggerFloorTokens,
      fallbackTokens,
    )
  }
  return normalizePositiveInt(resolvedBudget.softTriggerTokens, fallbackTokens)
}
