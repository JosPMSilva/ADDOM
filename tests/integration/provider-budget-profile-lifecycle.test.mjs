import test from 'node:test'
import assert from 'node:assert/strict'

const {
  getProviderBudgetProfileLifecycle,
} = await import('../../src/main/api-clients/provider-budget-store.mjs')

const DAY_MS = 24 * 60 * 60 * 1000

test('provider budget lifecycle marks stale and expired observations without pruning recently active rows', () => {
  const nowMs = Date.UTC(2026, 3, 16, 12, 0, 0)
  const lifecycle = getProviderBudgetProfileLifecycle({
    id: 'pbp_recently_used',
    providerId: 'anthropic',
    credentialFingerprint: 'sha256:recent',
    lastObservedAt: nowMs - (35 * DAY_MS),
    lastResolvedAt: nowMs - (2 * DAY_MS),
    createdAt: nowMs - (35 * DAY_MS),
    updatedAt: nowMs - (2 * DAY_MS),
  }, { nowMs })

  assert.equal(lifecycle.stale, true)
  assert.equal(lifecycle.expired, true)
  assert.equal(lifecycle.pruneEligible, false)
})

test('provider budget lifecycle marks long-unused expired rows as prune eligible', () => {
  const nowMs = Date.UTC(2026, 3, 16, 12, 0, 0)
  const lifecycle = getProviderBudgetProfileLifecycle({
    id: 'pbp_unused',
    providerId: 'anthropic',
    credentialFingerprint: 'sha256:unused',
    lastObservedAt: nowMs - (120 * DAY_MS),
    createdAt: nowMs - (120 * DAY_MS),
    updatedAt: nowMs - (120 * DAY_MS),
  }, { nowMs })

  assert.equal(lifecycle.stale, true)
  assert.equal(lifecycle.expired, true)
  assert.equal(lifecycle.pruneEligible, true)
})

test('provider budget lifecycle protects manual overrides and invalid rows are removable', () => {
  const nowMs = Date.UTC(2026, 3, 16, 12, 0, 0)
  const manualOverrideLifecycle = getProviderBudgetProfileLifecycle({
    id: 'pbp_manual',
    providerId: 'anthropic',
    credentialFingerprint: 'sha256:manual',
    profileSource: 'manual_override',
    manualOverride: {
      localPreflightInputCeilingTokens: 72_000,
    },
    lastObservedAt: nowMs - (365 * DAY_MS),
    createdAt: nowMs - (365 * DAY_MS),
    updatedAt: nowMs - (365 * DAY_MS),
  }, { nowMs })
  const invalidLifecycle = getProviderBudgetProfileLifecycle({
    id: 'pbp_invalid',
    providerId: '',
    credentialFingerprint: '',
    lastObservedAt: nowMs - (365 * DAY_MS),
    createdAt: nowMs - (365 * DAY_MS),
    updatedAt: nowMs - (365 * DAY_MS),
  }, { nowMs })

  assert.equal(manualOverrideLifecycle.stale, false)
  assert.equal(manualOverrideLifecycle.expired, false)
  assert.equal(manualOverrideLifecycle.pruneEligible, false)

  assert.equal(invalidLifecycle.invalid, true)
  assert.equal(invalidLifecycle.pruneEligible, true)
})
