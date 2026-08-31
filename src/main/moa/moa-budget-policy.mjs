import { canonicalizeRegistryModelSelection, listRegistryProviders } from '../api-clients/model-registry.mjs'

const MAX_PROFILES = 200

export const DEFAULT_MOA_BUDGET_POLICY = Object.freeze({
  softTokenWarnThreshold: 40_000,
  softUsdWarnThreshold: 2.5,
  highCostConfirmEnabled: true,
  highCostConfirmTokenThreshold: 80_000,
  highCostConfirmUsdThreshold: 5,
  showLeanAlternative: true,
  pricingProfiles: [],
})

function clampInteger(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function clean(value) {
  return String(value ?? '').trim()
}

function toPer1k(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n / 1000
}

function normalizePricingProfile(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const inputProviderId = clean(source.providerId).slice(0, 80)
  const inputModel = clean(source.model).slice(0, 120)
  if (!inputProviderId || !inputModel) return null
  const normalizedSelection = canonicalizeRegistryModelSelection(inputProviderId, inputModel)
  const providerId = String(normalizedSelection.providerId || inputProviderId).slice(0, 80)
  const model = String(normalizedSelection.modelId || inputModel).slice(0, 120)
  return {
    providerId,
    model,
    inputUsdPer1kTokens: clampNumber(source.inputUsdPer1kTokens, 0, 0, 100),
    outputUsdPer1kTokens: clampNumber(source.outputUsdPer1kTokens, 0, 0, 100),
    reasoningUsdPer1kTokens: clampNumber(
      source.reasoningUsdPer1kTokens,
      0,
      0,
      100,
    ),
  }
}

export function normalizePricingProfiles(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const row of raw) {
    if (out.length >= MAX_PROFILES) break
    const profile = normalizePricingProfile(row)
    if (!profile) continue
    const key = `${profile.providerId.toLowerCase()}:${profile.model.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(profile)
  }
  return out
}

export function deriveRegistryPricingProfiles() {
  const out = []
  const seen = new Set()
  const providers = listRegistryProviders()
  for (const provider of providers) {
    const providerId = clean(provider?.id || provider?.providerId).toLowerCase()
    if (!providerId) continue
    const models = Array.isArray(provider?.models) ? provider.models : []
    for (const model of models) {
      if (out.length >= MAX_PROFILES) return out
      if (model?.deprecated) continue
      const modelId = clean(model?.id)
      if (!modelId) continue
      const pricing = model?.pricing && typeof model.pricing === 'object' ? model.pricing : null
      if (!pricing) continue
      const key = `${providerId}:${modelId.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        providerId,
        model: modelId,
        inputUsdPer1kTokens: toPer1k(pricing.inputUsdPer1M),
        outputUsdPer1kTokens: toPer1k(pricing.outputUsdPer1M),
        reasoningUsdPer1kTokens: 0,
      })
    }
  }
  return out
}

function mergePricingProfilesWithRegistry(rawProfiles) {
  const registryDefaults = deriveRegistryPricingProfiles()
  const userProfiles = normalizePricingProfiles(rawProfiles)
  if (!userProfiles.length) return registryDefaults
  const merged = []
  const byKey = new Map()
  for (const row of registryDefaults) {
    const key = `${row.providerId.toLowerCase()}:${row.model.toLowerCase()}`
    byKey.set(key, { ...row })
  }
  for (const row of userProfiles) {
    const key = `${row.providerId.toLowerCase()}:${row.model.toLowerCase()}`
    byKey.set(key, { ...(byKey.get(key) || {}), ...row })
  }
  for (const value of byKey.values()) {
    if (merged.length >= MAX_PROFILES) break
    merged.push(value)
  }
  return merged
}

export function resolveEffectivePricingProfiles(rawProfiles) {
  return mergePricingProfilesWithRegistry(rawProfiles)
}

export function normalizeMoaBudgetPolicy(raw = {}, fallback = DEFAULT_MOA_BUDGET_POLICY) {
  const base = fallback && typeof fallback === 'object'
    ? { ...DEFAULT_MOA_BUDGET_POLICY, ...fallback }
    : { ...DEFAULT_MOA_BUDGET_POLICY }
  const input = raw && typeof raw === 'object' ? raw : {}

  const softTokenWarnThreshold = clampInteger(
    input.softTokenWarnThreshold,
    base.softTokenWarnThreshold,
    1_000,
    10_000_000,
  )
  const highCostConfirmTokenThreshold = clampInteger(
    input.highCostConfirmTokenThreshold,
    base.highCostConfirmTokenThreshold,
    1_000,
    10_000_000,
  )
  const softUsdWarnThreshold = clampNumber(
    input.softUsdWarnThreshold,
    base.softUsdWarnThreshold,
    0,
    10_000,
  )
  const highCostConfirmUsdThreshold = clampNumber(
    input.highCostConfirmUsdThreshold,
    base.highCostConfirmUsdThreshold,
    0,
    10_000,
  )

  return {
    softTokenWarnThreshold,
    softUsdWarnThreshold,
    highCostConfirmEnabled: input.highCostConfirmEnabled !== false,
    highCostConfirmTokenThreshold: Math.max(
      softTokenWarnThreshold,
      highCostConfirmTokenThreshold,
    ),
    highCostConfirmUsdThreshold: Math.max(
      softUsdWarnThreshold,
      highCostConfirmUsdThreshold,
    ),
    showLeanAlternative: input.showLeanAlternative !== false,
    pricingProfiles: normalizePricingProfiles(
      Array.isArray(input.pricingProfiles) ? input.pricingProfiles : base.pricingProfiles,
    ),
  }
}

