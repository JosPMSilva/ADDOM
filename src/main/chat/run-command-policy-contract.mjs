function normalizeDecision(value) {
  const v = String(value || '').trim().toLowerCase()
  if (
    v === 'allow'
    || v === 'allow_with_warning'
    || v === 'require_elevation'
    || v === 'route_to_sandbox'
    || v === 'deny'
  ) {
    return v
  }
  return 'deny'
}

function normalizeExecutionTarget(value, decision) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'host' || v === 'install_sandbox') return v
  return decision === 'route_to_sandbox' ? 'install_sandbox' : 'host'
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ))
}

export function normalizeRunCommandPolicyDecisionResult(input = {}) {
  const src = input && typeof input === 'object' ? input : {}
  const decision = normalizeDecision(src.decision || src.policyDecision)
  const executionTarget = normalizeExecutionTarget(src.executionTarget, decision)
  return {
    decision,
    executionTarget,
    elevationRequired: src.elevationRequired === true || decision === 'require_elevation',
    reasons: normalizeStringList(src.reasons || src.policyReasons),
    hints: normalizeStringList(src.hints),
  }
}
