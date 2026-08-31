import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inferMoaUserTier,
  applyMoaTierDefaults,
  enforceMoaProductionGuardrails,
  enforceMoaTierGuardrails,
  normalizeMoaUserTier,
} from '../../src/common/moa/moa-tier-policy.mjs'

test('inferMoaUserTier returns basic with no roles or advanced budget configuration', () => {
  const tier = inferMoaUserTier({
    moaRoles: [],
    moaBudgetPolicy: {},
  })
  assert.equal(tier, 'basic')
})

test('inferMoaUserTier returns advanced for regular configured setups', () => {
  const tier = inferMoaUserTier({
    moaRoles: [{ id: 'r1', name: 'Reviewer', providerId: 'openai', model: 'gpt-4o' }],
    moaBudgetPolicy: {
      highCostConfirmEnabled: true,
      pricingProfiles: [],
    },
  })
  assert.equal(tier, 'advanced')
})

test('inferMoaUserTier ignores legacy fallback markers and still detects real developer controls', () => {
  const byLegacyFallback = inferMoaUserTier({
    moaRoles: [{ id: 'r1', fallbackEnabled: true, fallbackProviderId: 'moonshot', fallbackModel: 'kimi-k2' }],
    moaBudgetPolicy: {},
  })
  const byPricing = inferMoaUserTier({
    moaRoles: [],
    moaBudgetPolicy: { pricingProfiles: [{ providerId: 'openai', model: 'gpt-4o' }] },
  })
  const byHighCostOff = inferMoaUserTier({
    moaRoles: [],
    moaBudgetPolicy: { highCostConfirmEnabled: false },
  })

  assert.equal(byLegacyFallback, 'advanced')
  assert.equal(byPricing, 'developer')
  assert.equal(byHighCostOff, 'developer')
})

test('applyMoaTierDefaults returns expected baseline for each tier', () => {
  const basic = applyMoaTierDefaults('basic')
  const advanced = applyMoaTierDefaults('advanced')
  const developer = applyMoaTierDefaults('developer')

  assert.equal(basic.moaPolicy.maxTasksPerDelegation, 3)
  assert.equal(advanced.moaPolicy.maxTasksPerDelegation, 6)
  assert.equal(developer.moaPolicy.maxTasksPerDelegation, 6)
  assert.equal(basic.moaPolicy.maxDelegationDurationMs, 60_000)
  assert.equal(advanced.moaPolicy.maxDelegationDurationMs, 300_000)
  assert.equal(developer.moaPolicy.maxDelegationDurationMs, 600_000)
  assert.equal(basic.moaBudgetPolicy.highCostConfirmEnabled, true)
  assert.equal(advanced.moaBudgetPolicy.highCostConfirmEnabled, true)
  assert.equal(developer.moaBudgetPolicy.highCostConfirmEnabled, true)
})

test('enforceMoaTierGuardrails for basic strips legacy fallback fields and caps roles', () => {
  const guarded = enforceMoaTierGuardrails('basic', {
    moaRoles: Array.from({ length: 8 }).map((_, idx) => ({
      id: `role_${idx + 1}`,
      name: `Role ${idx + 1}`,
      providerId: 'openai',
      model: 'gpt-4o',
      canWriteFiles: true,
      fallbackEnabled: true,
      fallbackProviderId: 'openai',
      fallbackModel: 'gpt-4o-mini',
      fallbackTriggers: ['rate_limit'],
    })),
    moaPolicy: {
      agentWriteAccessEnabled: true,
      requireConfiguredApiKey: false,
      maxTasksPerDelegation: 999,
      maxAgentRounds: 999,
      maxTotalTokensPerDelegation: 99999999,
    },
    moaBudgetPolicy: {
      highCostConfirmEnabled: false,
      softTokenWarnThreshold: 1,
      softUsdWarnThreshold: 0.001,
      highCostConfirmTokenThreshold: 1,
      highCostConfirmUsdThreshold: 0.001,
      pricingProfiles: [{ providerId: 'openai', model: 'gpt-4o' }],
    },
  })

  assert.equal(guarded.moaRoles.length, 5)
  assert.ok(guarded.moaRoles.every((row) => row.canWriteFiles === false))
  assert.ok(guarded.moaRoles.every((row) => !('fallbackEnabled' in row)))
  assert.ok(guarded.moaRoles.every((row) => !('fallbackProviderId' in row)))
  assert.equal(guarded.moaPolicy.agentWriteAccessEnabled, false)
  assert.equal(guarded.moaPolicy.requireConfiguredApiKey, true)
  assert.equal(guarded.moaBudgetPolicy.highCostConfirmEnabled, true)
  assert.equal(Array.isArray(guarded.moaBudgetPolicy.pricingProfiles), true)
  assert.equal(guarded.moaBudgetPolicy.pricingProfiles.length, 0)
})

test('enforceMoaTierGuardrails for advanced strips legacy fallback fields and pricing profiles', () => {
  const guarded = enforceMoaTierGuardrails('advanced', {
    moaRoles: [{
      id: 'r1',
      name: 'Role',
      providerId: 'openai',
      model: 'gpt-4o',
      canWriteFiles: true,
      fallbackEnabled: true,
      fallbackProviderId: 'openai',
      fallbackModel: 'gpt-4o-mini',
      fallbackTriggers: ['rate_limit'],
    }],
    moaPolicy: {
      maxTasksPerDelegation: 99,
      maxAgentRounds: 99,
      agentWriteAccessEnabled: true,
    },
    moaBudgetPolicy: {
      highCostConfirmEnabled: false,
      pricingProfiles: [{ providerId: 'openai', model: 'gpt-4o' }],
    },
  })

  assert.equal(guarded.moaRoles.length, 1)
  assert.equal(guarded.moaRoles[0].canWriteFiles, true)
  assert.equal('fallbackEnabled' in guarded.moaRoles[0], false)
  assert.equal('fallbackProviderId' in guarded.moaRoles[0], false)
  assert.equal(guarded.moaBudgetPolicy.highCostConfirmEnabled, true)
  assert.equal(Array.isArray(guarded.moaBudgetPolicy.pricingProfiles), true)
  assert.equal(guarded.moaBudgetPolicy.pricingProfiles.length, 0)
  assert.ok(guarded.moaPolicy.maxTasksPerDelegation <= 12)
  assert.ok(guarded.moaPolicy.maxAgentRounds <= 12)
})

test('enforceMoaTierGuardrails for developer preserves developer controls but strips legacy fallback fields', () => {
  const guarded = enforceMoaTierGuardrails('developer', {
    moaRoles: [{
      id: 'r1',
      name: 'Role',
      providerId: 'openai',
      model: 'gpt-4o',
      canWriteFiles: true,
      fallbackEnabled: true,
      fallbackProviderId: 'openai',
      fallbackModel: 'gpt-4o-mini',
      fallbackTriggers: ['rate_limit'],
    }],
    moaPolicy: {
      agentWriteAccessEnabled: true,
      maxTasksPerDelegation: 999,
      maxAgentRounds: 999,
      maxDelegationDurationMs: 99999999,
      maxTotalTokensPerDelegation: 99999999,
      maxAgentOutputChars: 99999999,
      maxAgentStagedFilesPerTask: 999,
      maxAgentStagedFilesPerDelegation: 999,
      maxAgentStagedBytesPerFile: 10,
      maxAgentStagedTotalBytesPerDelegation: 100,
    },
    moaBudgetPolicy: {
      softTokenWarnThreshold: 0,
      softUsdWarnThreshold: -5,
      highCostConfirmEnabled: false,
      highCostConfirmTokenThreshold: 99999999,
      highCostConfirmUsdThreshold: 99999999,
      pricingProfiles: [{ providerId: 'openai', model: 'gpt-4o' }],
    },
  })

  assert.equal(guarded.moaRoles[0].canWriteFiles, true)
  assert.equal('fallbackEnabled' in guarded.moaRoles[0], false)
  assert.equal('fallbackProviderId' in guarded.moaRoles[0], false)
  assert.equal(guarded.moaBudgetPolicy.highCostConfirmEnabled, false)
  assert.equal(guarded.moaBudgetPolicy.pricingProfiles.length, 1)
  assert.equal(guarded.moaPolicy.maxTasksPerDelegation, 20)
  assert.equal(guarded.moaPolicy.maxAgentRounds, 20)
  assert.equal(guarded.moaPolicy.maxDelegationDurationMs, 600_000)
  assert.equal(guarded.moaPolicy.maxTotalTokensPerDelegation, 2_000_000)
  assert.equal(guarded.moaPolicy.maxAgentOutputChars, 500_000)
  assert.equal(guarded.moaPolicy.maxAgentStagedFilesPerTask, 20)
  assert.equal(guarded.moaPolicy.maxAgentStagedFilesPerDelegation, 100)
  assert.equal(guarded.moaPolicy.maxAgentStagedBytesPerFile, 1_024)
  assert.equal(guarded.moaPolicy.maxAgentStagedTotalBytesPerDelegation, 4_096)
  assert.equal(guarded.moaBudgetPolicy.softTokenWarnThreshold, 1_000)
  assert.equal(guarded.moaBudgetPolicy.softUsdWarnThreshold, 0)
  assert.equal(guarded.moaBudgetPolicy.highCostConfirmTokenThreshold, 10_000_000)
  assert.equal(guarded.moaBudgetPolicy.highCostConfirmUsdThreshold, 10_000)
})

test('enforceMoaProductionGuardrails keeps production Subagents read-only with useful caps', () => {
  const guarded = enforceMoaProductionGuardrails({
    moaRoles: Array.from({ length: 25 }).map((_, idx) => ({
      id: `role_${idx + 1}`,
      name: `Role ${idx + 1}`,
      providerId: 'openai',
      model: 'gpt-4o',
      canWriteFiles: true,
      fallbackEnabled: true,
    })),
    moaPolicy: {
      maxTasksPerDelegation: 20,
      maxAgentRounds: 20,
      maxTotalTokensPerDelegation: 2_000_000,
      agentWriteAccessEnabled: true,
    },
    moaBudgetPolicy: {
      highCostConfirmEnabled: false,
      softTokenWarnThreshold: 10_000_000,
      softUsdWarnThreshold: 10_000,
      pricingProfiles: [{ providerId: 'openai', model: 'gpt-4o' }],
    },
  })

  assert.equal(guarded.moaRoles.length, 20)
  assert.ok(guarded.moaRoles.every((row) => row.canWriteFiles === false))
  assert.ok(guarded.moaRoles.every((row) => !('fallbackEnabled' in row)))
  assert.equal(guarded.moaPolicy.maxTasksPerDelegation, 4)
  assert.equal(guarded.moaPolicy.maxAgentRounds, 6)
  assert.equal(guarded.moaPolicy.maxTotalTokensPerDelegation, 120_000)
  assert.equal(guarded.moaPolicy.agentWriteAccessEnabled, false)
  assert.equal('runtimeRoleAllowedToolClasses' in guarded.moaPolicy, false)
  assert.equal(guarded.moaBudgetPolicy.highCostConfirmEnabled, true)
  assert.equal(guarded.moaBudgetPolicy.pricingProfiles.length, 0)
})

test('normalizeMoaUserTier keeps valid values and falls back safely', () => {
  assert.equal(normalizeMoaUserTier('basic', 'developer'), 'basic')
  assert.equal(normalizeMoaUserTier('ADVANCED', 'developer'), 'advanced')
  assert.equal(normalizeMoaUserTier('nope', 'developer'), 'developer')
})
