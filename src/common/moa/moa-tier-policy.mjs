const MOA_USER_TIERS = Object.freeze(['basic', 'advanced', 'developer'])

export const MOA_PRODUCTION_USER_TIER = 'production'

export const MOA_TIER_LABELS = Object.freeze({
  basic: 'Basic',
  advanced: 'Advanced',
  developer: 'Developer',
})

export const MOA_TIER_DESCRIPTIONS = Object.freeze({
  basic: 'Simplified and safety-first defaults for non-technical usage.',
  advanced: 'Balanced controls for regular tuning with strong safeguards.',
  developer: 'Full controls for expert workflows and custom policy tuning.',
})

function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function clampFloat(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function normalizeTier(value, fallback = 'basic') {
  const key = String(value || '').trim().toLowerCase()
  if (MOA_USER_TIERS.includes(key)) return key
  return fallback
}

function stripLegacyRoleFields(role = {}) {
  const next = { ...role }
  delete next.fallbackEnabled
  delete next.fallbackProviderId
  delete next.fallbackModel
  delete next.fallbackTriggers
  return next
}

function sanitizeRolesForTier(tier, rolesInput = []) {
  const rows = Array.isArray(rolesInput) ? rolesInput.filter((row) => row && typeof row === 'object') : []
  if (tier === 'basic') {
    return rows.slice(0, 5).map((row) => {
      const next = stripLegacyRoleFields(row)
      next.canWriteFiles = false
      return next
    })
  }
  if (tier === 'advanced') {
    return rows.slice(0, 20).map((row) => stripLegacyRoleFields(row))
  }
  return rows.slice(0, 20).map((row) => stripLegacyRoleFields(row))
}

function sanitizeRolesForProduction(rolesInput = []) {
  const rows = Array.isArray(rolesInput) ? rolesInput.filter((row) => row && typeof row === 'object') : []
  return rows.slice(0, 20).map((row) => {
    const next = stripLegacyRoleFields(row)
    next.canWriteFiles = false
    return next
  })
}

function enforceProductionPolicy(policy = {}) {
  const maxAgentStagedBytesPerFile = clampInt(
    policy.maxAgentStagedBytesPerFile,
    1_048_576,
    65_536,
    5_242_880,
  )
  const maxAgentStagedTotalBytesPerDelegation = clampInt(
    policy.maxAgentStagedTotalBytesPerDelegation,
    2_097_152,
    262_144,
    20_971_520,
  )
  return {
    maxTasksPerDelegation: clampInt(policy.maxTasksPerDelegation, 4, 1, 4),
    maxAgentRounds: clampInt(policy.maxAgentRounds, 6, 1, 6),
    maxConsecutiveIdenticalToolRounds: clampInt(policy.maxConsecutiveIdenticalToolRounds, 3, 2, 12),
    maxConsecutiveNearDuplicateExplorationRounds: clampInt(policy.maxConsecutiveNearDuplicateExplorationRounds, 4, 2, 12),
    maxLoopRecoveryAttempts: clampInt(policy.maxLoopRecoveryAttempts, 1, 0, 3),
    maxDelegationDurationMs: clampInt(policy.maxDelegationDurationMs, 600_000, 10_000, 600_000),
    agentStreamIdleTimeoutMs: clampInt(policy.agentStreamIdleTimeoutMs, 30_000, 5_000, 300_000),
    localAgentStreamIdleTimeoutMs: clampInt(policy.localAgentStreamIdleTimeoutMs, 180_000, 5_000, 300_000),
    maxTotalTokensPerDelegation: clampInt(policy.maxTotalTokensPerDelegation, 120_000, 1_000, 120_000),
    maxAgentOutputChars: clampInt(policy.maxAgentOutputChars, 100_000, 500, 100_000),
    requireConfiguredApiKey: true,
    agentWriteAccessEnabled: false,
    agentWriteMode: 'staged',
    maxAgentStagedFilesPerTask: clampInt(policy.maxAgentStagedFilesPerTask, 4, 1, 20),
    maxAgentStagedFilesPerDelegation: clampInt(policy.maxAgentStagedFilesPerDelegation, 12, 1, 100),
    maxAgentStagedBytesPerFile,
    maxAgentStagedTotalBytesPerDelegation: Math.max(
      maxAgentStagedBytesPerFile,
      maxAgentStagedTotalBytesPerDelegation,
    ),
    promptEnhancementEnabled: policy.promptEnhancementEnabled !== false,
    agentMemoryEnabled: policy.agentMemoryEnabled !== false,
  }
}

function enforceProductionBudget(budget = {}) {
  const softTokenWarnThreshold = clampInt(
    budget.softTokenWarnThreshold,
    80_000,
    1_000,
    80_000,
  )
  const softUsdWarnThreshold = clampFloat(
    budget.softUsdWarnThreshold,
    5,
    0,
    5,
  )
  const highCostConfirmTokenThreshold = clampInt(
    budget.highCostConfirmTokenThreshold,
    160_000,
    1_000,
    160_000,
  )
  const highCostConfirmUsdThreshold = clampFloat(
    budget.highCostConfirmUsdThreshold,
    10,
    0,
    10,
  )
  return {
    softTokenWarnThreshold,
    softUsdWarnThreshold,
    highCostConfirmEnabled: true,
    highCostConfirmTokenThreshold: Math.max(softTokenWarnThreshold, highCostConfirmTokenThreshold),
    highCostConfirmUsdThreshold: Math.max(softUsdWarnThreshold, highCostConfirmUsdThreshold),
    showLeanAlternative: budget.showLeanAlternative !== false,
    pricingProfiles: [],
  }
}

function enforceBasicPolicy(policy = {}) {
  const maxAgentStagedBytesPerFile = clampInt(
    policy.maxAgentStagedBytesPerFile,
    262_144,
    65_536,
    1_048_576,
  )
  const maxAgentStagedTotalBytesPerDelegation = clampInt(
    policy.maxAgentStagedTotalBytesPerDelegation,
    786_432,
    262_144,
    3_145_728,
  )
  return {
    maxTasksPerDelegation: clampInt(policy.maxTasksPerDelegation, 3, 1, 5),
    maxAgentRounds: clampInt(policy.maxAgentRounds, 4, 1, 6),
    maxDelegationDurationMs: clampInt(policy.maxDelegationDurationMs, 60_000, 20_000, 90_000),
    maxTotalTokensPerDelegation: clampInt(policy.maxTotalTokensPerDelegation, 30_000, 5_000, 60_000),
    maxAgentOutputChars: clampInt(policy.maxAgentOutputChars, 20_000, 1_000, 100_000),
    requireConfiguredApiKey: true,
    agentWriteAccessEnabled: false,
    agentWriteMode: 'staged',
    maxAgentStagedFilesPerTask: clampInt(policy.maxAgentStagedFilesPerTask, 1, 1, 3),
    maxAgentStagedFilesPerDelegation: clampInt(policy.maxAgentStagedFilesPerDelegation, 3, 1, 6),
    maxAgentStagedBytesPerFile,
    maxAgentStagedTotalBytesPerDelegation: Math.max(
      maxAgentStagedBytesPerFile,
      maxAgentStagedTotalBytesPerDelegation,
    ),
  }
}

function enforceAdvancedPolicy(policy = {}) {
  const maxAgentStagedBytesPerFile = clampInt(
    policy.maxAgentStagedBytesPerFile,
    1_048_576,
    65_536,
    2_097_152,
  )
  const maxAgentStagedTotalBytesPerDelegation = clampInt(
    policy.maxAgentStagedTotalBytesPerDelegation,
    2_097_152,
    524_288,
    6_291_456,
  )
  return {
    maxTasksPerDelegation: clampInt(policy.maxTasksPerDelegation, 6, 1, 12),
    maxAgentRounds: clampInt(policy.maxAgentRounds, 8, 1, 12),
    maxDelegationDurationMs: clampInt(policy.maxDelegationDurationMs, 300_000, 30_000, 300_000),
    maxTotalTokensPerDelegation: clampInt(policy.maxTotalTokensPerDelegation, 120_000, 10_000, 500_000),
    maxAgentOutputChars: clampInt(policy.maxAgentOutputChars, 60_000, 2_000, 100_000),
    requireConfiguredApiKey: policy.requireConfiguredApiKey !== false,
    agentWriteAccessEnabled: !!policy.agentWriteAccessEnabled,
    agentWriteMode: 'staged',
    maxAgentStagedFilesPerTask: clampInt(policy.maxAgentStagedFilesPerTask, 4, 1, 12),
    maxAgentStagedFilesPerDelegation: clampInt(policy.maxAgentStagedFilesPerDelegation, 12, 1, 40),
    maxAgentStagedBytesPerFile,
    maxAgentStagedTotalBytesPerDelegation: Math.max(
      maxAgentStagedBytesPerFile,
      maxAgentStagedTotalBytesPerDelegation,
    ),
  }
}

function enforceBasicBudget(budget = {}) {
  const softTokenWarnThreshold = clampInt(
    budget.softTokenWarnThreshold,
    15_000,
    5_000,
    50_000,
  )
  const softUsdWarnThreshold = clampFloat(
    budget.softUsdWarnThreshold,
    1,
    0.1,
    3,
  )
  const highCostConfirmTokenThreshold = clampInt(
    budget.highCostConfirmTokenThreshold,
    30_000,
    10_000,
    100_000,
  )
  const highCostConfirmUsdThreshold = clampFloat(
    budget.highCostConfirmUsdThreshold,
    2.5,
    0.5,
    10,
  )
  return {
    softTokenWarnThreshold,
    softUsdWarnThreshold,
    highCostConfirmEnabled: true,
    highCostConfirmTokenThreshold: Math.max(softTokenWarnThreshold, highCostConfirmTokenThreshold),
    highCostConfirmUsdThreshold: Math.max(softUsdWarnThreshold, highCostConfirmUsdThreshold),
    showLeanAlternative: true,
    pricingProfiles: [],
  }
}

function enforceAdvancedBudget(budget = {}) {
  const softTokenWarnThreshold = clampInt(
    budget.softTokenWarnThreshold,
    40_000,
    10_000,
    200_000,
  )
  const softUsdWarnThreshold = clampFloat(
    budget.softUsdWarnThreshold,
    2.5,
    0.5,
    20,
  )
  const highCostConfirmTokenThreshold = clampInt(
    budget.highCostConfirmTokenThreshold,
    80_000,
    20_000,
    500_000,
  )
  const highCostConfirmUsdThreshold = clampFloat(
    budget.highCostConfirmUsdThreshold,
    5,
    1,
    50,
  )
  return {
    softTokenWarnThreshold,
    softUsdWarnThreshold,
    highCostConfirmEnabled: true,
    highCostConfirmTokenThreshold: Math.max(softTokenWarnThreshold, highCostConfirmTokenThreshold),
    highCostConfirmUsdThreshold: Math.max(softUsdWarnThreshold, highCostConfirmUsdThreshold),
    showLeanAlternative: budget.showLeanAlternative !== false,
    pricingProfiles: [],
  }
}

function enforceDeveloperPolicy(policy = {}) {
  const maxAgentStagedBytesPerFile = clampInt(
    policy.maxAgentStagedBytesPerFile,
    1_048_576,
    1_024,
    5_242_880,
  )
  const maxAgentStagedTotalBytesPerDelegation = clampInt(
    policy.maxAgentStagedTotalBytesPerDelegation,
    2_097_152,
    4_096,
    20_971_520,
  )
  return {
    maxTasksPerDelegation: clampInt(policy.maxTasksPerDelegation, 6, 1, 20),
    maxAgentRounds: clampInt(policy.maxAgentRounds, 8, 1, 20),
    maxDelegationDurationMs: clampInt(policy.maxDelegationDurationMs, 600_000, 10_000, 600_000),
    maxTotalTokensPerDelegation: clampInt(policy.maxTotalTokensPerDelegation, 120_000, 1_000, 2_000_000),
    maxAgentOutputChars: clampInt(policy.maxAgentOutputChars, 100_000, 500, 500_000),
    requireConfiguredApiKey: policy.requireConfiguredApiKey !== false,
    agentWriteAccessEnabled: !!policy.agentWriteAccessEnabled,
    agentWriteMode: 'staged',
    maxAgentStagedFilesPerTask: clampInt(policy.maxAgentStagedFilesPerTask, 4, 1, 20),
    maxAgentStagedFilesPerDelegation: clampInt(policy.maxAgentStagedFilesPerDelegation, 12, 1, 100),
    maxAgentStagedBytesPerFile,
    maxAgentStagedTotalBytesPerDelegation: Math.max(
      maxAgentStagedBytesPerFile,
      maxAgentStagedTotalBytesPerDelegation,
    ),
  }
}

function enforceDeveloperBudget(budget = {}) {
  const softTokenWarnThreshold = clampInt(
    budget.softTokenWarnThreshold,
    40_000,
    1_000,
    10_000_000,
  )
  const softUsdWarnThreshold = clampFloat(
    budget.softUsdWarnThreshold,
    2.5,
    0,
    10_000,
  )
  const highCostConfirmTokenThreshold = clampInt(
    budget.highCostConfirmTokenThreshold,
    80_000,
    1_000,
    10_000_000,
  )
  const highCostConfirmUsdThreshold = clampFloat(
    budget.highCostConfirmUsdThreshold,
    5,
    0,
    10_000,
  )
  return {
    softTokenWarnThreshold,
    softUsdWarnThreshold,
    highCostConfirmEnabled: budget.highCostConfirmEnabled !== false,
    highCostConfirmTokenThreshold: Math.max(softTokenWarnThreshold, highCostConfirmTokenThreshold),
    highCostConfirmUsdThreshold: Math.max(softUsdWarnThreshold, highCostConfirmUsdThreshold),
    showLeanAlternative: budget.showLeanAlternative !== false,
    pricingProfiles: Array.isArray(budget.pricingProfiles)
      ? budget.pricingProfiles.filter((row) => row && typeof row === 'object').slice(0, 200)
      : [],
  }
}

export function applyMoaTierDefaults(inputTier = 'basic') {
  const tier = normalizeTier(inputTier, 'basic')
  if (tier === 'basic') {
    return {
      moaPolicy: enforceBasicPolicy({}),
      moaBudgetPolicy: enforceBasicBudget({}),
    }
  }
  if (tier === 'advanced') {
    return {
      moaPolicy: enforceAdvancedPolicy({}),
      moaBudgetPolicy: enforceAdvancedBudget({}),
    }
  }
  return {
    moaPolicy: {
      maxTasksPerDelegation: 6,
      maxAgentRounds: 8,
      maxDelegationDurationMs: 600_000,
      maxTotalTokensPerDelegation: 120_000,
      maxAgentOutputChars: 100_000,
      requireConfiguredApiKey: true,
      agentWriteAccessEnabled: false,
      agentWriteMode: 'staged',
      maxAgentStagedFilesPerTask: 4,
      maxAgentStagedFilesPerDelegation: 12,
      maxAgentStagedBytesPerFile: 1_048_576,
      maxAgentStagedTotalBytesPerDelegation: 2_097_152,
    },
    moaBudgetPolicy: {
      softTokenWarnThreshold: 40_000,
      softUsdWarnThreshold: 2.5,
      highCostConfirmEnabled: true,
      highCostConfirmTokenThreshold: 80_000,
      highCostConfirmUsdThreshold: 5,
      showLeanAlternative: true,
      pricingProfiles: [],
    },
  }
}

export function inferMoaUserTier(settingsSlice = {}) {
  const source = settingsSlice && typeof settingsSlice === 'object' ? settingsSlice : {}
  const roles = Array.isArray(source.moaRoles) ? source.moaRoles : []
  const budget = source.moaBudgetPolicy && typeof source.moaBudgetPolicy === 'object'
    ? source.moaBudgetPolicy
    : {}

  const hasPricingProfiles = Array.isArray(budget.pricingProfiles) && budget.pricingProfiles.length > 0
  const hasHighCostDisabled = budget.highCostConfirmEnabled === false
  if (hasPricingProfiles || hasHighCostDisabled) return 'developer'

  if (roles.length === 0) return 'basic'

  return 'advanced'
}

export function enforceMoaTierGuardrails(inputTier = 'basic', settingsSlice = {}) {
  const tier = normalizeTier(inputTier, 'basic')
  const source = settingsSlice && typeof settingsSlice === 'object' ? settingsSlice : {}
  const roles = Array.isArray(source.moaRoles) ? source.moaRoles : []
  const policy = source.moaPolicy && typeof source.moaPolicy === 'object' ? source.moaPolicy : {}
  const budget = source.moaBudgetPolicy && typeof source.moaBudgetPolicy === 'object' ? source.moaBudgetPolicy : {}

  if (tier === 'basic') {
    return {
      moaRoles: sanitizeRolesForTier('basic', roles),
      moaPolicy: enforceBasicPolicy(policy),
      moaBudgetPolicy: enforceBasicBudget(budget),
    }
  }

  if (tier === 'advanced') {
    return {
      moaRoles: sanitizeRolesForTier('advanced', roles),
      moaPolicy: enforceAdvancedPolicy(policy),
      moaBudgetPolicy: enforceAdvancedBudget(budget),
    }
  }

  return {
    moaRoles: sanitizeRolesForTier('developer', roles),
    moaPolicy: enforceDeveloperPolicy(policy),
    moaBudgetPolicy: enforceDeveloperBudget(budget),
  }
}

export function enforceMoaProductionGuardrails(settingsSlice = {}) {
  const source = settingsSlice && typeof settingsSlice === 'object' ? settingsSlice : {}
  const roles = Array.isArray(source.moaRoles) ? source.moaRoles : []
  const policy = source.moaPolicy && typeof source.moaPolicy === 'object' ? source.moaPolicy : {}
  const budget = source.moaBudgetPolicy && typeof source.moaBudgetPolicy === 'object' ? source.moaBudgetPolicy : {}
  return {
    moaRoles: sanitizeRolesForProduction(roles),
    moaPolicy: enforceProductionPolicy(policy),
    moaBudgetPolicy: enforceProductionBudget(budget),
  }
}

export function normalizeMoaUserTier(inputTier = '', fallback = 'basic') {
  return normalizeTier(inputTier, fallback)
}
