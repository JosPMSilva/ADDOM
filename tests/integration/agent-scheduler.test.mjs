import test from 'node:test'
import assert from 'node:assert/strict'

import { createAgentResourceGovernor } from '../../src/main/agents/agent-resource-governor.mjs'
import { createAgentScheduler } from '../../src/main/agents/agent-scheduler.mjs'
import { SCHEMA_VERSION } from '../../src/main/memory/db-migrations.mjs'
import {
  TEST_POLICY_LIMITS,
  createSchedulerDatabase,
  insertSchedulerOwnership,
  makeSchedulerEntry,
} from '../helpers/agent-scheduler-fixtures.mjs'

const EMPTY_ADMISSION_SNAPSHOT = Object.freeze({
  descendantCount: 0,
  parentChildCount: 0,
  queuedCount: 0,
  recentSpawnCount: 0,
  nodeAttemptCount: 0,
  reservedTokens: 0,
  reservedCostUsd: 0,
  reservedToolCalls: 0,
  runCreatedAt: 1_000,
})

test('current schema retains durable scheduler ownership alongside mailbox delivery leases', () => {
  const db = createSchedulerDatabase()
  try {
    assert.equal(SCHEMA_VERSION, 29)
    const tables = new Set(db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table'
    `).all().map((row) => row.name))
    assert.equal(tables.has('agent_scheduler_entries'), true)
    assert.equal(tables.has('agent_scheduler_state'), true)
    assert.equal(tables.has('agent_events'), true)
  } finally {
    db.close()
  }
})

test('resource governor rejects every structural, rate, budget, and duration limit deterministically', () => {
  const governor = createAgentResourceGovernor()
  const baseEntry = makeSchedulerEntry({ depth: 1, createdAt: 2_000 })
  const cases = [
    ['max_depth', { entry: { ...baseEntry, depth: 5 } }],
    ['max_descendants', { snapshot: { descendantCount: 12 } }],
    ['max_fan_out', { snapshot: { parentChildCount: 4 } }],
    ['max_queued_nodes', { snapshot: { queuedCount: 12 } }],
    ['spawn_rate', { snapshot: { recentSpawnCount: 12 } }],
    ['max_attempts', { snapshot: { nodeAttemptCount: 3 } }],
    ['token_budget', { entry: { ...baseEntry, tokenReservation: 101 }, snapshot: { reservedTokens: 9_900 } }],
    ['cost_budget', { entry: { ...baseEntry, costReservationUsd: 0.5 }, snapshot: { reservedCostUsd: 24.75 } }],
    ['tool_budget', { entry: { ...baseEntry, toolCallReservation: 2 }, snapshot: { reservedToolCalls: 99 } }],
    ['duration_budget', { now: 61_001 }],
  ]

  for (const [reason, overrides] of cases) {
    const result = governor.evaluateAdmission({
      entry: overrides.entry || baseEntry,
      limits: TEST_POLICY_LIMITS,
      snapshot: { ...EMPTY_ADMISSION_SNAPSHOT, ...overrides.snapshot },
      now: overrides.now ?? 2_000,
    })
    assert.deepEqual(result, { admitted: false, reason }, reason)
  }
})

test('root orchestrator fanout is bounded by run descendants instead of nested-parent fanout', () => {
  const governor = createAgentResourceGovernor()
  const entry = makeSchedulerEntry({ depth: 1, createdAt: 2_000 })

  assert.deepEqual(governor.evaluateAdmission({
    entry,
    limits: TEST_POLICY_LIMITS,
    snapshot: {
      ...EMPTY_ADMISSION_SNAPSHOT,
      parentChildCount: TEST_POLICY_LIMITS.maxFanOut,
      parentIsRoot: true,
    },
    now: 2_000,
  }), { admitted: true, reason: null })

  assert.deepEqual(governor.evaluateAdmission({
    entry,
    limits: TEST_POLICY_LIMITS,
    snapshot: {
      ...EMPTY_ADMISSION_SNAPSHOT,
      parentChildCount: TEST_POLICY_LIMITS.maxFanOut,
      parentIsRoot: false,
    },
    now: 2_000,
  }), { admitted: false, reason: 'max_fan_out' })
})

test('resource governor applies global, provider, project, thread, run, and parent execution scopes', () => {
  const governor = createAgentResourceGovernor({
    maxGlobalLiveAgents: 2,
    maxProviderLiveAgents: { 'openai-account': 1 },
    maxProjectLiveAgents: 1,
    maxThreadLiveAgents: 1,
    maxParentLiveAgents: 1,
  })
  const entry = makeSchedulerEntry()
  const empty = {
    globalLiveCount: 0,
    providerLiveCount: 0,
    projectLiveCount: 0,
    threadLiveCount: 0,
    runLiveCount: 0,
    parentLiveCount: 0,
  }
  const cases = [
    ['global_concurrency', { globalLiveCount: 2 }],
    ['provider_concurrency', { providerLiveCount: 1 }],
    ['project_concurrency', { projectLiveCount: 1 }],
    ['thread_concurrency', { threadLiveCount: 1 }],
    ['run_concurrency', { runLiveCount: TEST_POLICY_LIMITS.maxLiveAgents }],
    ['parent_concurrency', { parentLiveCount: 1 }],
  ]

  for (const [reason, snapshot] of cases) {
    assert.deepEqual(governor.evaluateExecution({
      entry,
      limits: TEST_POLICY_LIMITS,
      snapshot: { ...empty, ...snapshot },
    }), { granted: false, reason }, reason)
  }
  assert.deepEqual(governor.evaluateExecution({
    entry,
    limits: TEST_POLICY_LIMITS,
    snapshot: empty,
  }), { granted: true, reason: null })
})

test('resource governor honors a narrower provider cap captured in the run budget', () => {
  const governor = createAgentResourceGovernor()
  const entry = makeSchedulerEntry({ providerId: 'openai' })
  const limits = {
    ...TEST_POLICY_LIMITS,
    providerConcurrencyCaps: { openai: 2 },
  }
  assert.deepEqual(governor.evaluateExecution({
    entry,
    limits,
    snapshot: {
      globalLiveCount: 2,
      providerLiveCount: 2,
      projectLiveCount: 2,
      threadLiveCount: 2,
      runLiveCount: 2,
      parentLiveCount: 0,
    },
  }), { granted: false, reason: 'provider_concurrency' })
})

test('legacy run snapshots without a retry bound allow one attempt and fail closed on retry', () => {
  const governor = createAgentResourceGovernor()
  const legacyLimits = { ...TEST_POLICY_LIMITS }
  delete legacyLimits.maxAttemptsPerNode
  assert.deepEqual(governor.evaluateAdmission({
    entry: makeSchedulerEntry(),
    limits: legacyLimits,
    snapshot: { ...EMPTY_ADMISSION_SNAPSHOT, nodeAttemptCount: 0 },
    now: 2_000,
  }), { admitted: true, reason: null })
  assert.deepEqual(governor.evaluateAdmission({
    entry: makeSchedulerEntry(),
    limits: legacyLimits,
    snapshot: { ...EMPTY_ADMISSION_SNAPSHOT, nodeAttemptCount: 1 },
    now: 2_000,
  }), { admitted: false, reason: 'max_attempts' })
})

test('scheduler persists queued and leased attempts across fresh scheduler instances', () => {
  const db = createSchedulerDatabase()
  try {
    const entry = makeSchedulerEntry()
    insertSchedulerOwnership(db, entry)
    const first = createAgentScheduler(db, { now: () => 2_000 })
    assert.equal(first.enqueue(entry).admitted, true)

    const restarted = createAgentScheduler(db, { now: () => 2_100 })
    assert.equal(restarted.list().at(0).status, 'queued')
    const claimed = restarted.claimNext()
    assert.equal(claimed.attemptId, entry.attemptId)
    assert.equal(restarted.list().at(0).status, 'leased')
    assert.equal(restarted.list().at(0).leaseExpiresAt, 32_100)
  } finally {
    db.close()
  }
})

test('queue pause, lease heartbeat, and expired-lease discovery survive scheduler restart', () => {
  const db = createSchedulerDatabase()
  let currentTime = 2_000
  try {
    const entry = makeSchedulerEntry()
    insertSchedulerOwnership(db, entry)
    const scheduler = createAgentScheduler(db, {
      now: () => currentTime,
      leaseDurationMs: 100,
    })
    scheduler.enqueue(entry)
    scheduler.pauseQueue()
    assert.equal(scheduler.claimNext(), null)

    const restarted = createAgentScheduler(db, {
      now: () => currentTime,
      leaseDurationMs: 100,
    })
    assert.equal(restarted.isPaused(), true)
    restarted.resumeQueue()
    assert.equal(restarted.claimNext().attemptId, entry.attemptId)

    currentTime = 2_050
    assert.equal(restarted.heartbeat(entry.attemptId), true)
    currentTime = 2_120
    assert.deepEqual(restarted.listExpiredLeases(), [])
    currentTime = 2_151
    assert.deepEqual(
      restarted.listExpiredLeases().map((candidate) => candidate.attemptId),
      [entry.attemptId],
    )
  } finally {
    db.close()
  }
})

test('suspending a parent atomically reserves its child before releasing a saturated one-slot lease', () => {
  const db = createSchedulerDatabase()
  try {
    const governor = createAgentResourceGovernor({ maxGlobalLiveAgents: 1 })
    const scheduler = createAgentScheduler(db, { governor, now: () => 2_000 })
    const parent = makeSchedulerEntry()
    const child = makeSchedulerEntry({
      attemptId: 'attempt_child_1',
      nodeId: 'node_child',
      parentNodeId: 'node_root',
      depth: 1,
      createdAt: 2_000,
    })
    insertSchedulerOwnership(db, parent)
    insertSchedulerOwnership(db, child)
    scheduler.enqueue(parent)
    assert.equal(scheduler.claimNext().attemptId, parent.attemptId)

    assert.equal(scheduler.suspendForDescendant(parent.attemptId, child).admitted, true)
    assert.equal(scheduler.list().find((row) => row.attemptId === parent.attemptId).status, 'waiting')
    assert.equal(scheduler.claimNext().attemptId, child.attemptId)

    scheduler.complete(child.attemptId)
    scheduler.resumeWaiting(parent.attemptId)
    assert.equal(scheduler.claimNext().attemptId, parent.attemptId)
  } finally {
    db.close()
  }
})

test('failed descendant admission leaves the running parent lease untouched', () => {
  const db = createSchedulerDatabase()
  try {
    const scheduler = createAgentScheduler(db, { now: () => 2_000 })
    const parent = makeSchedulerEntry()
    const tooDeep = makeSchedulerEntry({
      attemptId: 'attempt_too_deep_1',
      nodeId: 'node_too_deep',
      parentNodeId: 'node_root',
      depth: TEST_POLICY_LIMITS.maxDepth + 1,
      createdAt: 2_000,
    })
    insertSchedulerOwnership(db, parent)
    insertSchedulerOwnership(db, tooDeep)
    scheduler.enqueue(parent)
    scheduler.claimNext()

    assert.deepEqual(scheduler.suspendForDescendant(parent.attemptId, tooDeep), {
      admitted: false,
      reason: 'max_depth',
    })
    assert.equal(scheduler.list().find((row) => row.attemptId === parent.attemptId).status, 'leased')
  } finally {
    db.close()
  }
})

test('scheduler excludes the root but retains completed children in the total descendant limit', () => {
  const db = createSchedulerDatabase()
  try {
    const limits = { ...TEST_POLICY_LIMITS, maxDescendants: 1 }
    const scheduler = createAgentScheduler(db, { now: () => 2_000 })
    const parent = makeSchedulerEntry()
    const firstChild = makeSchedulerEntry({
      attemptId: 'attempt_first_child_1',
      nodeId: 'node_first_child',
      parentNodeId: 'node_root',
      depth: 1,
      createdAt: 2_000,
    })
    const secondChild = makeSchedulerEntry({
      attemptId: 'attempt_second_child_1',
      nodeId: 'node_second_child',
      parentNodeId: 'node_root',
      depth: 1,
      createdAt: 2_001,
    })
    insertSchedulerOwnership(db, parent, { limits })
    scheduler.enqueue(parent)
    scheduler.claimNext()
    insertSchedulerOwnership(db, firstChild, { limits })
    assert.equal(scheduler.suspendForDescendant(parent.attemptId, firstChild).admitted, true)

    scheduler.complete(firstChild.attemptId)
    scheduler.resumeWaiting(parent.attemptId)
    scheduler.claimNext()
    insertSchedulerOwnership(db, secondChild, { limits })
    assert.deepEqual(scheduler.suspendForDescendant(parent.attemptId, secondChild), {
      admitted: false,
      reason: 'max_descendants',
    })
  } finally {
    db.close()
  }
})
