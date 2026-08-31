function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function hasNegation(text) {
  return /\b(no|not|never|cannot|can't|must not|should not|do not|don't)\b/i.test(text)
}

function contradictionPair(invariantText, factText) {
  const inv = normalize(invariantText)
  const fact = normalize(factText)
  if (!inv || !fact) return false

  const invNeg = hasNegation(inv)
  const factNeg = hasNegation(fact)
  if (invNeg === factNeg) return false

  const invTokens = inv.split(/\s+/).filter((t) => t.length >= 4)
  const overlap = invTokens.filter((token) => fact.includes(token))
  return overlap.length >= 2
}

export function evaluateContinuityDrift({
  invariants = [],
  facts = [],
  contradictionChecksEnabled = true,
} = {}) {
  const invRows = Array.isArray(invariants) ? invariants : []
  const factRows = Array.isArray(facts) ? facts : []

  const violations = []
  if (contradictionChecksEnabled) {
    for (const inv of invRows) {
      for (const fact of factRows) {
        if (!contradictionPair(inv?.invariantText, fact?.factText)) continue
        violations.push({
          invariantId: String(inv?.id || ''),
          factId: String(fact?.id || ''),
          invariantText: String(inv?.invariantText || ''),
          factText: String(fact?.factText || ''),
        })
        if (violations.length >= 12) break
      }
      if (violations.length >= 12) break
    }
  }

  const risk = violations.length >= 4 ? 'high' : violations.length > 0 ? 'medium' : 'low'
  return {
    driftRisk: risk,
    violationCount: violations.length,
    violations,
  }
}
