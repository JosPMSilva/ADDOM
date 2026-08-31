import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-settings-moa-tier-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const settingsPath = path.join(userDataPath, 'settings.json')
const {
  getSettings,
  getEffectiveSettingsDiagnostics,
  applyAdvancedOverlay,
  setSettingsPatch,
} = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('settings strips legacy fallback fields and does not infer developer tier from them alone', () => {
  const legacy = {
    moaEnabled: true,
    moaRoles: [
      {
        id: 'role_dev',
        name: 'Dev Agent',
        providerId: 'openai',
        model: 'gpt-4o',
        fallbackEnabled: true,
        fallbackProviderId: 'openai',
        fallbackModel: 'gpt-4o-mini',
        fallbackTriggers: ['rate_limit'],
      },
    ],
    moaBudgetPolicy: {
      highCostConfirmEnabled: true,
      pricingProfiles: [],
    },
  }
  fs.writeFileSync(settingsPath, JSON.stringify(legacy, null, 2), 'utf8')

  const settings = getSettings()
  assert.equal(settings.moaUserTier, 'basic')
  assert.equal(settings.moaRoles.length, 1)
  assert.equal(settings.moaRoles[0].canWriteFiles, false)
  assert.equal('fallbackEnabled' in settings.moaRoles[0], false)
  assert.equal('fallbackProviderId' in settings.moaRoles[0], false)
  assert.equal('fallbackModel' in settings.moaRoles[0], false)
})

test('settings still infers developer tier from active developer-only budget controls', () => {
  const legacy = {
    moaEnabled: true,
    moaRoles: [
      {
        id: 'role_dev_budget',
        name: 'Budget Agent',
        providerId: 'openai',
        model: 'gpt-4o',
        fallbackEnabled: true,
        fallbackProviderId: 'moonshot',
        fallbackModel: 'kimi-k2',
      },
    ],
    moaBudgetPolicy: {
      highCostConfirmEnabled: false,
      pricingProfiles: [
        { providerId: 'openai', model: 'gpt-4o', inputUsdPer1kTokens: 5, outputUsdPer1kTokens: 10 },
      ],
    },
  }
  fs.writeFileSync(settingsPath, JSON.stringify(legacy, null, 2), 'utf8')

  const settings = getSettings()
  assert.equal(settings.moaUserTier, 'basic')
  assert.equal(settings.moaBudgetPolicy.highCostConfirmEnabled, true)
  assert.ok(Array.isArray(settings.moaBudgetPolicy.pricingProfiles))
  assert.equal(settings.moaBudgetPolicy.pricingProfiles.length, 0)
  assert.equal('fallbackEnabled' in settings.moaRoles[0], false)
  const diagnostics = getEffectiveSettingsDiagnostics()
  const warningCodes = new Set(diagnostics.moaProductionDiagnostics.warnings.map((row) => row.code))
  assert.equal(warningCodes.has('legacy_budget_confirm_disabled_shadowed'), true)
  assert.equal(warningCodes.has('legacy_pricing_profiles_shadowed'), true)
})

test('settings:set enforces production guardrails and strips legacy fallback fields', async () => {
  const next = await setSettingsPatch({
    moaUserTier: 'basic',
    moaEnabled: true,
    moaRoles: Array.from({ length: 7 }).map((_, idx) => ({
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
      maxTasksPerDelegation: 20,
    },
    moaBudgetPolicy: {
      highCostConfirmEnabled: false,
      pricingProfiles: [
        { providerId: 'openai', model: 'gpt-4o', inputUsdPer1kTokens: 5, outputUsdPer1kTokens: 10 },
      ],
    },
  })

  assert.equal(next.moaUserTier, 'basic')
  assert.equal(next.moaRoles.length, 7)
  assert.ok(next.moaRoles.every((row) => row.canWriteFiles === false))
  assert.ok(next.moaRoles.every((row) => !('fallbackEnabled' in row)))
  assert.equal(next.moaPolicy.agentWriteAccessEnabled, false)
  assert.equal('runtimeRoleAllowedToolClasses' in next.moaPolicy, false)
  assert.equal(next.moaPolicy.requireConfiguredApiKey, true)
  assert.equal(next.moaBudgetPolicy.highCostConfirmEnabled, true)
  assert.equal(next.moaBudgetPolicy.pricingProfiles.length, 0)
})

test('settings:set shadows advanced tier role writes without advanced config', async () => {
  const next = await setSettingsPatch({
    moaUserTier: 'advanced',
    moaRoles: [
      {
        id: 'role_adv',
        name: 'Advanced Agent',
        providerId: 'openai',
        model: 'gpt-4o',
        canWriteFiles: true,
        fallbackEnabled: true,
        fallbackProviderId: 'openai',
        fallbackModel: 'gpt-4o-mini',
        fallbackTriggers: ['rate_limit'],
      },
    ],
    moaBudgetPolicy: {
      highCostConfirmEnabled: false,
      pricingProfiles: [
        { providerId: 'openai', model: 'gpt-4o', inputUsdPer1kTokens: 5, outputUsdPer1kTokens: 10 },
      ],
    },
  })

  assert.equal(next.moaUserTier, 'basic')
  assert.equal(next.moaRoles.length, 1)
  assert.equal(next.moaRoles[0].canWriteFiles, false)
  assert.equal('fallbackEnabled' in next.moaRoles[0], false)
  assert.equal(next.moaBudgetPolicy.highCostConfirmEnabled, true)
  assert.equal(next.moaBudgetPolicy.pricingProfiles.length, 0)
})

test('settings:set shadows developer controls without advanced config', async () => {
  const next = await setSettingsPatch({
    moaUserTier: 'developer',
    moaRoles: [
      {
        id: 'role_dev2',
        name: 'Developer Agent',
        providerId: 'openai',
        model: 'gpt-4o',
        canWriteFiles: true,
        fallbackEnabled: true,
        fallbackProviderId: 'openai',
        fallbackModel: 'gpt-4o-mini',
        fallbackTriggers: ['rate_limit'],
      },
    ],
    moaBudgetPolicy: {
      highCostConfirmEnabled: false,
      pricingProfiles: [
        { providerId: 'openai', model: 'gpt-4o', inputUsdPer1kTokens: 5, outputUsdPer1kTokens: 10 },
      ],
    },
  })

  assert.equal(next.moaUserTier, 'basic')
  assert.equal(next.moaRoles[0].canWriteFiles, false)
  assert.equal('fallbackEnabled' in next.moaRoles[0], false)
  assert.equal(next.moaBudgetPolicy.highCostConfirmEnabled, true)
  assert.equal(next.moaBudgetPolicy.pricingProfiles.length, 0)
})

test('advanced overlay is required to activate developer write policy', () => {
  const effective = applyAdvancedOverlay({
    moaEnabled: true,
    moaUserTier: 'developer',
    moaRoles: [{
      id: 'role_overlay',
      name: 'Overlay Agent',
      providerId: 'openai',
      model: 'gpt-4o',
      canWriteFiles: true,
    }],
    moaPolicy: {
      agentWriteAccessEnabled: true,
    },
    moaBudgetPolicy: {
      highCostConfirmEnabled: false,
      pricingProfiles: [
        { providerId: 'openai', model: 'gpt-4o', inputUsdPer1kTokens: 5, outputUsdPer1kTokens: 10 },
      ],
    },
  }, {
    moaUserTier: 'developer',
    moaPolicy: {
      agentWriteAccessEnabled: true,
    },
    moaBudgetPolicy: {
      highCostConfirmEnabled: false,
      pricingProfiles: [
        { providerId: 'openai', model: 'gpt-4o', inputUsdPer1kTokens: 5, outputUsdPer1kTokens: 10 },
      ],
    },
  })

  assert.equal(effective.moaUserTier, 'developer')
  assert.equal(effective.moaRoles[0].canWriteFiles, true)
  assert.equal(effective.moaPolicy.agentWriteAccessEnabled, true)
  assert.equal('runtimeRoleAllowedToolClasses' in effective.moaPolicy, false)
  assert.equal(effective.moaBudgetPolicy.highCostConfirmEnabled, false)
  assert.ok(effective.moaBudgetPolicy.pricingProfiles.length >= 1)
})
