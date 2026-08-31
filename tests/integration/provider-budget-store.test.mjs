import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-provider-budget-store-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getDb, closeDb } = await import('../../src/main/memory/db.mjs')
const { SCHEMA_VERSION } = await import('../../src/main/memory/db-migrations.mjs')
const {
  cleanupProviderBudgetProfiles,
  clearAllProviderBudgetProfiles,
  getProviderBudgetProfile,
  resetProviderBudgetProfiles,
  summarizeProviderBudgetProfiles,
  touchProviderBudgetProfileResolution,
  upsertProviderBudgetObservation,
} = await import('../../src/main/api-clients/provider-budget-store.mjs')
const {
  resolveLearnedProviderBudgetProfile,
} = await import('../../src/main/chat/provider-prompt-budget-profile.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('provider budget store migrates schema and merges repeated observations per credential identity', async (t) => {
  try {
    const db = getDb()
    assert.equal(Number(db.pragma('user_version', { simple: true }) || 0), SCHEMA_VERSION)

    clearAllProviderBudgetProfiles()

    const first = upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_store',
      workspaceId: '',
      credentialFingerprint: 'sha256:storefingerprint',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: 1_000,
      inputTpmLimit: 30_000,
      outputTpmLimit: 8_000,
      requestsPerMinuteLimit: 50,
      retryAfterSeconds: 0,
      rawHeaders: {
        'anthropic-organization-id': 'org_store',
        'anthropic-ratelimit-input-tokens-limit': '30000',
      },
    })

    const second = upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_store',
      workspaceId: '',
      credentialFingerprint: 'sha256:storefingerprint',
      observationSource: 'rate_limit_error',
      modelId: 'claude-sonnet-4-6',
      observedAt: 2_000,
      inputTpmLimit: 30_000,
      outputTpmLimit: 8_000,
      requestsPerMinuteLimit: 50,
      retryAfterSeconds: 9,
      rawHeaders: {
        'anthropic-organization-id': 'org_store',
        'anthropic-ratelimit-input-tokens-limit': '30000',
        'retry-after': '9',
      },
    })

    assert.equal(first?.confidence, 'observed_once')
    assert.equal(second?.confidence, 'observed_stable')
    assert.equal(second?.observationCount, 2)
    assert.equal(second?.firstObservedAt, 1_000)
    assert.equal(second?.lastObservedAt, 2_000)
    assert.equal(second?.lastSuccessObservedAt, 1_000)
    assert.equal(second?.lastRateLimitObservedAt, 2_000)
    assert.equal(second?.retryAfterSeconds, 9)
    assert.equal(second?.inputTpmLimit, 30_000)
    assert.equal(second?.lastObservationSource, 'rate_limit_error')
    assert.deepEqual(second?.lastResponseHeaders, {
      'anthropic-organization-id': 'org_store',
      'anthropic-ratelimit-input-tokens-limit': '30000',
      'retry-after': '9',
    })

    const fetched = getProviderBudgetProfile({
      providerId: 'anthropic',
      organizationId: 'org_store',
      credentialFingerprint: 'sha256:storefingerprint',
    })

    assert.deepEqual(fetched, second)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('learned budget resolution skips expired rows and cleanup preserves recently resolved scoped rows', async (t) => {
  try {
    clearAllProviderBudgetProfiles()
    const nowMs = Date.UTC(2026, 3, 16, 12, 0, 0)
    const expiredObservedAt = nowMs - (120 * 24 * 60 * 60 * 1000)

    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_keep',
      workspaceId: 'ws_keep',
      credentialFingerprint: 'sha256:keep',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: expiredObservedAt,
      inputTpmLimit: 30_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_keep',
        'anthropic-workspace-id': 'ws_keep',
        'anthropic-ratelimit-input-tokens-limit': '30000',
      },
    })
    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_drop',
      workspaceId: 'ws_drop',
      credentialFingerprint: 'sha256:drop',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: expiredObservedAt,
      inputTpmLimit: 30_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_drop',
        'anthropic-workspace-id': 'ws_drop',
        'anthropic-ratelimit-input-tokens-limit': '30000',
      },
    })

    const keptBeforeCleanup = getProviderBudgetProfile({
      providerId: 'anthropic',
      organizationId: 'org_keep',
      workspaceId: 'ws_keep',
      credentialFingerprint: 'sha256:keep',
    })
    assert.equal(touchProviderBudgetProfileResolution(keptBeforeCleanup, { resolvedAt: nowMs }), 1)

    const cleanup = cleanupProviderBudgetProfiles({
      providerId: 'anthropic',
      nowMs,
    })

    assert.equal(cleanup.deletedCount, 1)
    assert.equal(cleanup.expiredUnusedDeletedCount, 1)
    assert.equal(getProviderBudgetProfile({
      providerId: 'anthropic',
      organizationId: 'org_keep',
      workspaceId: 'ws_keep',
      credentialFingerprint: 'sha256:keep',
    })?.lastResolvedAt, nowMs)
    assert.equal(getProviderBudgetProfile({
      providerId: 'anthropic',
      organizationId: 'org_drop',
      workspaceId: 'ws_drop',
      credentialFingerprint: 'sha256:drop',
    }), null)

    const resolved = await resolveLearnedProviderBudgetProfile({
      providerId: 'anthropic',
      credentialFingerprint: 'sha256:keep',
      organizationId: 'org_keep',
      workspaceId: 'ws_keep',
    })
    assert.equal(resolved, null)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('provider budget reset can target one scoped identity without clearing sibling rows', async (t) => {
  try {
    clearAllProviderBudgetProfiles()

    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_reset',
      workspaceId: 'ws_one',
      credentialFingerprint: 'sha256:reset',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: 1_000,
      inputTpmLimit: 30_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_reset',
        'anthropic-workspace-id': 'ws_one',
        'anthropic-ratelimit-input-tokens-limit': '30000',
      },
    })
    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_reset',
      workspaceId: 'ws_two',
      credentialFingerprint: 'sha256:reset',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: 2_000,
      inputTpmLimit: 80_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_reset',
        'anthropic-workspace-id': 'ws_two',
        'anthropic-ratelimit-input-tokens-limit': '80000',
      },
    })

    assert.equal(resetProviderBudgetProfiles({
      providerId: 'anthropic',
      organizationId: 'org_reset',
      workspaceId: 'ws_one',
      credentialFingerprint: 'sha256:reset',
    }), 1)

    assert.equal(getProviderBudgetProfile({
      providerId: 'anthropic',
      organizationId: 'org_reset',
      workspaceId: 'ws_one',
      credentialFingerprint: 'sha256:reset',
    }), null)
    assert.equal(getProviderBudgetProfile({
      providerId: 'anthropic',
      organizationId: 'org_reset',
      workspaceId: 'ws_two',
      credentialFingerprint: 'sha256:reset',
    })?.inputTpmLimit, 80_000)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('provider budget summary stays renderer-safe while surfacing lifecycle counts and timestamps', async (t) => {
  try {
    clearAllProviderBudgetProfiles()
    const nowMs = Date.UTC(2026, 3, 17, 12, 0, 0)
    const staleObservedAt = nowMs - (10 * 24 * 60 * 60 * 1000)
    const expiredObservedAt = nowMs - (45 * 24 * 60 * 60 * 1000)

    const activeProfile = upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_live',
      workspaceId: 'ws_live',
      credentialFingerprint: 'sha256:live',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: nowMs - (2 * 60 * 60 * 1000),
      inputTpmLimit: 40_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_live',
        'anthropic-workspace-id': 'ws_live',
        'anthropic-ratelimit-input-tokens-limit': '40000',
      },
    })
    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_stale',
      workspaceId: 'ws_stale',
      credentialFingerprint: 'sha256:stale',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: staleObservedAt,
      inputTpmLimit: 30_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_stale',
        'anthropic-workspace-id': 'ws_stale',
        'anthropic-ratelimit-input-tokens-limit': '30000',
      },
    })
    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_expired',
      workspaceId: 'ws_expired',
      credentialFingerprint: 'sha256:expired',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: expiredObservedAt,
      inputTpmLimit: 20_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_expired',
        'anthropic-workspace-id': 'ws_expired',
        'anthropic-ratelimit-input-tokens-limit': '20000',
      },
    })

    assert.equal(touchProviderBudgetProfileResolution(activeProfile, {
      resolvedAt: nowMs - (30 * 60 * 1000),
    }), 1)

    const summary = summarizeProviderBudgetProfiles({
      providerId: 'anthropic',
      nowMs,
    })

    assert.deepEqual(summary, {
      providerId: 'anthropic',
      totalCount: 3,
      activeCount: 1,
      staleCount: 1,
      expiredCount: 1,
      pruneEligibleCount: 0,
      invalidCount: 0,
      manualOverrideCount: 0,
      lastObservedAt: nowMs - (2 * 60 * 60 * 1000),
      lastResolvedAt: nowMs - (30 * 60 * 1000),
    })
    assert.equal('credentialFingerprint' in summary, false)
    assert.equal('lastResponseHeaders' in summary, false)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('learned budget profile does not borrow another scoped row when credential scope is ambiguous', async (t) => {
  try {
    clearAllProviderBudgetProfiles()

    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_alpha',
      workspaceId: '',
      credentialFingerprint: 'sha256:ambiguous',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: 1_000,
      inputTpmLimit: 30_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_alpha',
        'anthropic-ratelimit-input-tokens-limit': '30000',
      },
    })
    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_beta',
      workspaceId: '',
      credentialFingerprint: 'sha256:ambiguous',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: 2_000,
      inputTpmLimit: 80_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_beta',
        'anthropic-ratelimit-input-tokens-limit': '80000',
      },
    })

    const resolved = await resolveLearnedProviderBudgetProfile({
      providerId: 'anthropic',
      credentialFingerprint: 'sha256:ambiguous',
    })

    assert.equal(resolved, null)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('learned budget profile returns the exact scoped row when org/workspace are provided', async (t) => {
  try {
    clearAllProviderBudgetProfiles()
    const recentObservedAtTwo = Date.now() - (60 * 60 * 1000)
    const recentObservedAtOne = recentObservedAtTwo - (24 * 60 * 60 * 1000)

    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_alpha',
      workspaceId: 'ws_one',
      credentialFingerprint: 'sha256:scoped',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: recentObservedAtOne,
      inputTpmLimit: 30_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_alpha',
        'anthropic-workspace-id': 'ws_one',
        'anthropic-ratelimit-input-tokens-limit': '30000',
      },
    })
    upsertProviderBudgetObservation({
      providerId: 'anthropic',
      organizationId: 'org_alpha',
      workspaceId: 'ws_two',
      credentialFingerprint: 'sha256:scoped',
      observationSource: 'success_response',
      modelId: 'claude-sonnet-4-6',
      observedAt: recentObservedAtTwo,
      inputTpmLimit: 80_000,
      rawHeaders: {
        'anthropic-organization-id': 'org_alpha',
        'anthropic-workspace-id': 'ws_two',
        'anthropic-ratelimit-input-tokens-limit': '80000',
      },
    })

    const resolved = await resolveLearnedProviderBudgetProfile({
      providerId: 'anthropic',
      credentialFingerprint: 'sha256:scoped',
      organizationId: 'org_alpha',
      workspaceId: 'ws_one',
    })

    assert.equal(resolved?.organizationId, 'org_alpha')
    assert.equal(resolved?.workspaceId, 'ws_one')
    assert.equal(resolved?.inputTpmLimit, 30_000)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
