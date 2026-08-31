function trimString(value = '') {
  return String(value || '').trim()
}

export function toCamelCase(parts = []) {
  return parts
    .map((part) => trimString(part).toLowerCase())
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`))
    .join('')
}

export function mapCostFieldToPricingKey(fieldName = '') {
  const parts = trimString(fieldName).toLowerCase().split('_').filter(Boolean)
  if (parts.length === 0) return ''
  return `${toCamelCase(parts)}UsdPer1M`
}

export function parsePromptTierBounds(tierId = '') {
  const normalized = trimString(tierId).toLowerCase()
  const overMatch = normalized.match(/(?:^|_)over_(\d+)k(?:$|_)/)
  if (overMatch) {
    return {
      minPromptTokens: (Number(overMatch[1]) * 1000) + 1,
      maxPromptTokens: null,
    }
  }

  const upToMatch = normalized.match(/(?:^|_)(?:up_to|upto|under|through)_(\d+)k(?:$|_)/)
  if (upToMatch) {
    return {
      minPromptTokens: null,
      maxPromptTokens: Number(upToMatch[1]) * 1000,
    }
  }

  return {
    minPromptTokens: null,
    maxPromptTokens: null,
  }
}

export function buildBasePricing(cost = null) {
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return null
  const pricing = {}
  for (const [key, value] of Object.entries(cost)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) continue
    if (!Number.isFinite(value)) continue
    const pricingKey = mapCostFieldToPricingKey(key)
    if (!pricingKey) continue
    pricing[pricingKey] = Number(value)
  }
  return Object.keys(pricing).length > 0 ? pricing : null
}

export function buildPricingTiers(cost = null) {
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return []
  const tiers = []
  for (const [tierId, tierValue] of Object.entries(cost)) {
    if (!tierValue || typeof tierValue !== 'object' || Array.isArray(tierValue)) continue
    const tier = {
      id: trimString(tierId),
      ...parsePromptTierBounds(tierId),
    }
    for (const [key, value] of Object.entries(tierValue)) {
      if (key === 'notes') continue
      if (!Number.isFinite(value)) continue
      const pricingKey = mapCostFieldToPricingKey(key)
      if (!pricingKey) continue
      tier[pricingKey] = Number(value)
    }
    if (trimString(tierValue?.notes)) {
      tier.notes = trimString(tierValue.notes)
    }
    if (
      Object.keys(tier).some((key) => key !== 'id' && key !== 'minPromptTokens' && key !== 'maxPromptTokens' && key !== 'notes')
    ) {
      tiers.push(tier)
    }
  }

  return tiers.sort((left, right) => {
    const leftMin = Number.isFinite(left?.minPromptTokens) ? Number(left.minPromptTokens) : -1
    const rightMin = Number.isFinite(right?.minPromptTokens) ? Number(right.minPromptTokens) : -1
    return leftMin - rightMin
  })
}

export function buildPricingFromRawCost(cost = null) {
  const pricing = buildBasePricing(cost)
  const tiers = buildPricingTiers(cost)
  if (!pricing && tiers.length === 0) return null
  if (pricing && tiers.length > 0) {
    pricing.tiers = tiers
    return pricing
  }
  if (pricing) return pricing
  return { tiers }
}

export function normalizePricingShape(pricing = null) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return null

  const normalized = {}
  for (const [key, value] of Object.entries(pricing)) {
    if (key === 'tiers' || key === 'notes') continue
    if (!Number.isFinite(value)) continue
    normalized[key] = Number(value)
  }

  if (Array.isArray(pricing.tiers)) {
    const tiers = pricing.tiers
      .map((tier) => {
        if (!tier || typeof tier !== 'object' || Array.isArray(tier)) return null
        const normalizedTier = {
          id: trimString(tier.id),
        }
        if (!normalizedTier.id) return null
        if (Number.isFinite(tier.minPromptTokens)) normalizedTier.minPromptTokens = Number(tier.minPromptTokens)
        if (Number.isFinite(tier.maxPromptTokens)) normalizedTier.maxPromptTokens = Number(tier.maxPromptTokens)
        for (const [key, value] of Object.entries(tier)) {
          if (key === 'id' || key === 'minPromptTokens' || key === 'maxPromptTokens' || key === 'notes') continue
          if (!Number.isFinite(value)) continue
          normalizedTier[key] = Number(value)
        }
        if (trimString(tier.notes)) normalizedTier.notes = trimString(tier.notes)
        return Object.keys(normalizedTier).length > 1 ? normalizedTier : null
      })
      .filter(Boolean)
      .sort((left, right) => {
        const leftMin = Number.isFinite(left?.minPromptTokens) ? Number(left.minPromptTokens) : -1
        const rightMin = Number.isFinite(right?.minPromptTokens) ? Number(right.minPromptTokens) : -1
        return leftMin - rightMin
      })
    if (tiers.length > 0) normalized.tiers = tiers
  }

  if (trimString(pricing.notes)) normalized.notes = trimString(pricing.notes)
  return Object.keys(normalized).length > 0 ? normalized : null
}
