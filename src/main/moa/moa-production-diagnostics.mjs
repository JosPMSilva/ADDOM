function clean(value) {
  return String(value ?? '').trim()
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasMoaPolicyOverlay(overlay = {}) {
  if (!isPlainObject(overlay)) return false
  return (
    Object.prototype.hasOwnProperty.call(overlay, 'moaUserTier')
    || isPlainObject(overlay.moaPolicy)
    || isPlainObject(overlay.moaBudgetPolicy)
  )
}

function hasCustomPipelinesOverlay(overlay = {}) {
  return isPlainObject(overlay) && Object.prototype.hasOwnProperty.call(overlay, 'customPipelinesEnabled')
}

export function resolveMoaAdvancedOverlayState(overlay = {}) {
  const source = isPlainObject(overlay) ? overlay : {}
  return {
    moaPolicyAdvanced: hasMoaPolicyOverlay(source),
    customPipelinesEnabled: hasCustomPipelinesOverlay(source) && source.customPipelinesEnabled === true,
  }
}

export function collectMoaProductionDiagnostics(rawSettings = {}, overlay = {}) {
  const raw = isPlainObject(rawSettings) ? rawSettings : {}
  const advanced = resolveMoaAdvancedOverlayState(overlay)
  const warnings = []
  const roles = Array.isArray(raw.moaRoles) ? raw.moaRoles : []
  const budget = isPlainObject(raw.moaBudgetPolicy) ? raw.moaBudgetPolicy : {}
  const policy = isPlainObject(raw.moaPolicy) ? raw.moaPolicy : {}
  const customPipelines = Array.isArray(raw.customPipelines) ? raw.customPipelines : []

  if (!advanced.moaPolicyAdvanced && clean(raw.moaUserTier).toLowerCase() === 'developer') {
    warnings.push({
      code: 'legacy_developer_tier_shadowed',
      message: 'Legacy developer Subagents tier in settings.json is shadowed by production guardrails.',
    })
  }
  if (!advanced.moaPolicyAdvanced && roles.some((role) => role?.canWriteFiles === true)) {
    warnings.push({
      code: 'legacy_write_roles_shadowed',
      message: 'Write-capable Subagents roles in settings.json are shadowed by production guardrails.',
    })
  }
  if (!advanced.moaPolicyAdvanced && policy.agentWriteAccessEnabled === true) {
    warnings.push({
      code: 'legacy_agent_write_policy_shadowed',
      message: 'Agent write access in settings.json is shadowed by production guardrails.',
    })
  }
  if (!advanced.moaPolicyAdvanced && budget.highCostConfirmEnabled === false) {
    warnings.push({
      code: 'legacy_budget_confirm_disabled_shadowed',
      message: 'Disabled high-cost confirmation in settings.json is shadowed by production guardrails.',
    })
  }
  if (!advanced.moaPolicyAdvanced && Array.isArray(budget.pricingProfiles) && budget.pricingProfiles.length > 0) {
    warnings.push({
      code: 'legacy_pricing_profiles_shadowed',
      message: 'Custom Subagents pricing profiles in settings.json are shadowed by production guardrails.',
    })
  }
  if (!advanced.customPipelinesEnabled && customPipelines.length > 0) {
    warnings.push({
      code: 'legacy_custom_pipelines_shadowed',
      message: 'Custom pipelines in settings.json are hidden until advanced config enables custom pipelines.',
    })
  }

  return {
    schemaVersion: 1,
    moaPolicyAdvanced: advanced.moaPolicyAdvanced,
    customPipelinesEnabled: advanced.customPipelinesEnabled,
    warnings,
  }
}
