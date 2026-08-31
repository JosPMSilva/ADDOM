import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  resolveAgentPolicyFromSettings,
} from '../../src/common/agents/agent-settings.mjs'
import {
  AGENT_POLICY_HARD_CEILINGS,
  resolveAgentPolicyProfile,
} from '../../src/common/agents/agent-policy-profile.mjs'

test('Agents settings default to the existing balanced policy with required write isolation', () => {
  const settings = normalizeAgentSettings()
  const balanced = resolveAgentPolicyProfile('balanced')

  assert.equal(settings.enabled, true)
  assert.equal(settings.defaultProfile, 'balanced')
  assert.equal(settings.writeIsolation, 'required')
  assert.equal(settings.fanoutConfirmationThreshold, 5)
  assert.deepEqual(settings.limits, {
    maxLiveAgents: balanced.limits.maxLiveAgents,
    maxDepth: balanced.limits.maxDepth,
    maxDescendants: balanced.limits.maxDescendants,
    maxTotalTokens: balanced.limits.maxTotalTokens,
    maxCostUsd: balanced.limits.maxCostUsd,
    maxDurationMs: balanced.limits.maxDurationMs,
  })
  assert.deepEqual(settings.providerConcurrencyCaps, {})
  assert.deepEqual(DEFAULT_AGENT_SETTINGS, settings)
})

test('Agents settings clamp every editable limit and provider cap to hard ceilings', () => {
  const settings = normalizeAgentSettings({
    enabled: false,
    defaultProfile: 'ultra',
    writeIsolation: 'none',
    fanoutConfirmationThreshold: 999_999,
    limits: {
      maxLiveAgents: 999,
      maxDepth: 999,
      maxDescendants: 999_999,
      maxTotalTokens: 999_999_999,
      maxCostUsd: 999_999,
      maxDurationMs: 999_999_999,
    },
    providerConcurrencyCaps: {
      openai: 999,
      cursor: 0,
      '': 5,
    },
  })

  assert.equal(settings.enabled, false)
  assert.equal(settings.writeIsolation, 'required')
  assert.equal(settings.fanoutConfirmationThreshold, AGENT_POLICY_HARD_CEILINGS.maxDescendants)
  for (const field of Object.keys(settings.limits)) {
    assert.equal(settings.limits[field], AGENT_POLICY_HARD_CEILINGS[field], field)
  }
  assert.deepEqual(settings.providerConcurrencyCaps, {
    openai: AGENT_POLICY_HARD_CEILINGS.maxLiveAgents,
    cursor: 1,
  })
})

test('resolved Agents policy combines selected limits with narrower provider hints and caps', () => {
  const policy = resolveAgentPolicyFromSettings({
    defaultProfile: 'high',
    limits: {
      maxLiveAgents: 20,
      maxDepth: 5,
      maxDescendants: 120,
      maxTotalTokens: 750_000,
      maxCostUsd: 125,
      maxDurationMs: 3_600_000,
    },
    providerConcurrencyCaps: {
      openai: 8,
      anthropic: 6,
    },
  }, {
    maxDepthHint: 3,
    maxConcurrencyHint: 12,
  })

  assert.equal(policy.id, 'high')
  assert.equal(policy.limits.maxDepth, 5)
  assert.equal(policy.effectiveLimits.maxDepth, 3)
  assert.equal(policy.effectiveLimits.maxLiveAgents, 12)
  assert.deepEqual(policy.effectiveLimits.providerConcurrencyCaps, {
    openai: 8,
    anthropic: 6,
  })
})
