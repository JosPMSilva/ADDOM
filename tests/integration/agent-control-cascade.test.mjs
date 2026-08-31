import test from 'node:test'
import assert from 'node:assert/strict'

import Database from 'better-sqlite3'

import { createAgentControllerRegistry } from '../../src/main/agents/agent-controller-registry.mjs'
import { createAgentControlService } from '../../src/main/agents/agent-control-service.mjs'
import {
  createAgentCompletionLeaseStore,
  createAgentRunService,
} from '../../src/main/agents/agent-run-service.mjs'
import { createAgentOrphanReaper } from '../../src/main/agents/agent-orphan-reaper.mjs'
import { createAgentScheduler } from '../../src/main/agents/agent-scheduler.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  makeAgentAttempt,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentRun,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'
import {
  createSchedulerDatabase,
  insertSchedulerOwnership,
  makeSchedulerEntry,
} from '../helpers/agent-scheduler-fixtures.mjs'

const TS = 1_752_600_000_000

function registerTree(registry) {
  const entries = [
    ['attempt_root', 'node_root', null, 'foreground', true],
    ['attempt_fg', 'node_fg', 'node_root', 'foreground', true],
    ['attempt_native_bg', 'node_native_bg', 'node_root', 'native_background', true],
    ['attempt_auto_bg', 'node_auto_bg', 'node_root', 'auto_backgrounded', true],
    ['attempt_detached', 'node_detached', 'node_root', 'explicitly_detached', true],
    ['attempt_sibling', 'node_sibling', null, 'foreground', true],
  ]
  for (const [attemptId, nodeId, parentNodeId, backgroundKind, supportsCancellation] of entries) {
    registry.register({
      attemptId,
      runId: 'run_01',
      nodeId,
      parentNodeId,
      backgroundKind,
      supportsCancellation,
    })
  }
}

function createRuntimeDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  return db
}

function seedRunningRun(store) {
  store.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high',
    run: makeAgentRun(),
    rootNode: makeAgentNode(),
  }, { attemptId: null }))
  store.append(makeAgentEventDraft('agent_run_started', {
    run: makeAgentRun({
      status: 'running',
      startedAt: TS + 1,
      queuedNodeCount: 0,
    }),
  }, {
    eventId: 'event_run_started_control',
    idempotencyKey: 'run_01:started:control',
    attemptId: null,
  }))
}

function queuedRoot() {
  const attempt = makeAgentAttempt('agent_root', {
    status: 'queued',
    reconciliationState: 'pending_match',
    providerRequestId: null,
    providerCorrelationKey: null,
    startedAt: null,
    usage: null,
  })
  const node = makeAgentNode({
    status: 'queued',
    attemptId: attempt.id,
    startedAt: null,
  })
  const schedulerEntry = makeSchedulerEntry({
    attemptId: attempt.id,
    runId: 'run_01',
    nodeId: 'agent_root',
    rootNodeId: 'agent_root',
    projectId: 'project_01',
    threadId: 'thread_01',
    providerId: node.providerId,
    createdAt: TS + 2,
  })
  return { attempt, node, schedulerEntry }
}

test('parent-turn cancellation preserves all background kinds while subtree cancellation is isolated', () => {
  const registry = createAgentControllerRegistry()
  registerTree(registry)

  const parentTurn = registry.cancel({
    scope: 'parent_turn',
    runId: 'run_01',
    targetNodeId: 'node_root',
    reason: 'parent_turn_ended',
  })
  assert.deepEqual(parentTurn.cancelledAttemptIds.sort(), ['attempt_fg', 'attempt_root'])
  assert.equal(registry.get('attempt_native_bg').signal.aborted, false)
  assert.equal(registry.get('attempt_auto_bg').signal.aborted, false)
  assert.equal(registry.get('attempt_detached').signal.aborted, false)
  assert.equal(registry.get('attempt_sibling').signal.aborted, false)

  const second = createAgentControllerRegistry()
  registerTree(second)
  const subtree = second.cancel({
    scope: 'subtree',
    runId: 'run_01',
    targetNodeId: 'node_root',
    reason: 'user_stop',
  })
  assert.deepEqual(subtree.cancelledAttemptIds.sort(), [
    'attempt_auto_bg',
    'attempt_detached',
    'attempt_fg',
    'attempt_native_bg',
    'attempt_root',
  ])
  assert.equal(second.get('attempt_sibling').signal.aborted, false)
})

test('unsupported provider cancellation is explicit and control cleanup never reports false success', () => {
  const registry = createAgentControllerRegistry()
  registry.register({
    attemptId: 'attempt_opaque',
    runId: 'run_opaque',
    nodeId: 'node_opaque',
    parentNodeId: null,
    backgroundKind: 'foreground',
    supportsCancellation: false,
  })
  const persisted = []
  const control = createAgentControlService({
    registry,
    runService: {
      cancelAttempts(attemptIds, input) {
        persisted.push({ attemptIds, input })
      },
    },
  })

  const result = control.stopNode({
    runId: 'run_opaque',
    nodeId: 'node_opaque',
    reason: 'user_stop',
  })
  assert.deepEqual(result.cancelledAttemptIds, [])
  assert.deepEqual(result.unsupportedAttemptIds, ['attempt_opaque'])
  assert.deepEqual(persisted, [])
  assert.equal(registry.get('attempt_opaque').signal.aborted, false)
})

test('run cancellation reaches every supported live attempt, persists once, and clears controllers', () => {
  const registry = createAgentControllerRegistry()
  registerTree(registry)
  const persisted = []
  const control = createAgentControlService({
    registry,
    runService: {
      cancelAttempts(attemptIds, input) {
        persisted.push({ attemptIds, input })
      },
    },
  })

  const result = control.stopRun({ runId: 'run_01', reason: 'user_stop' })
  assert.equal(result.cancelledAttemptIds.length, 6)
  assert.equal(registry.list({ runId: 'run_01' }).length, 0)
  assert.equal(persisted.length, 1)
  assert.deepEqual(persisted[0].attemptIds.sort(), result.cancelledAttemptIds.toSorted())
})

test('control cancellation persists cancelling and terminal evidence before removing scheduler ownership', () => {
  const db = createRuntimeDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedRunningRun(store)
    const scheduler = createAgentScheduler(db, { now: () => TS + 2 })
    const runService = createAgentRunService(db, {
      eventStore: store,
      repository,
      scheduler,
      now: () => TS + 2,
    })
    const queued = queuedRoot()
    runService.queueAttempt(queued)
    runService.claimNext()
    const registry = createAgentControllerRegistry()
    registry.register({
      attemptId: queued.attempt.id,
      runId: queued.attempt.runId,
      nodeId: queued.node.id,
      parentNodeId: queued.node.parentNodeId,
      backgroundKind: queued.attempt.backgroundKind,
      supportsCancellation: true,
    })
    const control = createAgentControlService({ registry, runService, scheduler })

    assert.deepEqual(control.stopNode({
      runId: 'run_01',
      nodeId: 'agent_root',
      reason: 'user_stop',
    }).cancelledAttemptIds, [queued.attempt.id])
    const graph = repository.getRunGraph('run_01')
    assert.equal(graph.nodes[0].status, 'cancelled')
    assert.equal(graph.attempts[0].status, 'cancelled')
    assert.equal(scheduler.list().length, 0)
    assert.deepEqual(
      repository.listEvents('run_01').slice(-3).map((event) => event.kind),
      ['agent_status_changed', 'agent_status_changed', 'agent_cancelled'],
    )
  } finally {
    db.close()
  }
})

test('successful attempt completion is durable without completing the owning run', () => {
  const db = createRuntimeDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedRunningRun(store)
    const scheduler = createAgentScheduler(db, { now: () => TS + 20 })
    const runService = createAgentRunService(db, {
      eventStore: store,
      repository,
      scheduler,
      now: () => TS + 20,
    })
    const queued = queuedRoot()
    runService.queueAttempt(queued)
    runService.claimNext()

    const multilineSummary = 'Managed agent completed.\nSecond line with tab\there.'
    assert.deepEqual(runService.completeAttempt({
      attemptId: queued.attempt.id,
      resultSummary: multilineSummary,
      usage: null,
    }), {
      completed: true,
    })

    const graph = repository.getRunGraph('run_01')
    assert.equal(graph.run.status, 'running')
    assert.equal(graph.run.finalAuthorityNodeId, 'agent_root')
    assert.equal(graph.nodes[0].status, 'completed')
    assert.equal(graph.nodes[0].resultSummary, multilineSummary)
    assert.equal(graph.attempts[0].status, 'completed')
    assert.equal(scheduler.get(queued.attempt.id), null)
    assert.equal(
      repository.listEvents('run_01').filter((event) => event.kind === 'agent_completed').length,
      1,
    )
    assert.equal(
      repository.listEvents('run_01').some((event) => event.kind === 'agent_run_completed'),
      false,
    )
  } finally {
    db.close()
  }
})

test('run cancellation also reaches durable queued attempts that have no provider controller yet', () => {
  const db = createRuntimeDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedRunningRun(store)
    const scheduler = createAgentScheduler(db, { now: () => TS + 2 })
    const runService = createAgentRunService(db, {
      eventStore: store,
      repository,
      scheduler,
      now: () => TS + 2,
    })
    const queued = queuedRoot()
    runService.queueAttempt(queued)
    const control = createAgentControlService({
      registry: createAgentControllerRegistry(),
      runService,
      scheduler,
    })

    assert.deepEqual(control.stopRun({
      runId: 'run_01',
      reason: 'user_stop',
    }).cancelledAttemptIds, [queued.attempt.id])
    const graph = repository.getRunGraph('run_01')
    assert.equal(graph.run.status, 'cancelled')
    assert.equal(graph.nodes[0].status, 'cancelled')
    assert.equal(graph.attempts[0].status, 'cancelled')
    assert.equal(scheduler.list().length, 0)
  } finally {
    db.close()
  }
})

test('queued and starting attempts are durable before provider creation, including across restart', () => {
  const db = createRuntimeDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedRunningRun(store)
    const scheduler = createAgentScheduler(db, { now: () => TS + 2 })
    const service = createAgentRunService(db, {
      eventStore: store,
      repository,
      scheduler,
      now: () => TS + 2,
    })
    const queued = queuedRoot()

    assert.deepEqual(service.queueAttempt(queued), { admitted: true, reason: null })
    let graph = repository.getRunGraph('run_01')
    assert.equal(graph.nodes[0].status, 'queued')
    assert.equal(graph.attempts[0].status, 'queued')
    assert.equal(graph.attempts[0].providerRequestId, null)

    const restarted = createAgentRunService(db, {
      eventStore: createAgentEventStore(db),
      repository: createAgentRunRepository(db),
      scheduler: createAgentScheduler(db, { now: () => TS + 3 }),
      now: () => TS + 3,
    })
    assert.equal(restarted.claimNext().attemptId, queued.attempt.id)
    graph = repository.getRunGraph('run_01')
    assert.equal(graph.nodes[0].status, 'starting')
    assert.equal(graph.attempts[0].status, 'starting')
    assert.equal(graph.attempts[0].providerRequestId, null)
  } finally {
    db.close()
  }
})

test('rejected admission leaves no attempt projection, event, or scheduler residue', () => {
  const db = createRuntimeDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedRunningRun(store)
    const scheduler = createAgentScheduler(db, { now: () => TS + 2 })
    const service = createAgentRunService(db, {
      eventStore: store,
      repository,
      scheduler,
      now: () => TS + 2,
    })
    const queued = queuedRoot()
    queued.schedulerEntry.tokenReservation = 2_000_000

    assert.deepEqual(service.queueAttempt(queued), {
      admitted: false,
      reason: 'token_budget',
    })
    assert.equal(repository.getRunGraph('run_01').attempts.length, 0)
    assert.equal(repository.listEvents('run_01').length, 2)
    assert.equal(scheduler.list().length, 0)
  } finally {
    db.close()
  }
})

test('retry creates a new inspectable attempt under the stable logical node', () => {
  const db = createRuntimeDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedRunningRun(store)
    const scheduler = createAgentScheduler(db, { now: () => TS + 2 })
    const service = createAgentRunService(db, {
      eventStore: store,
      repository,
      scheduler,
      now: () => TS + 2,
      attemptIdFactory: () => 'attempt_agent_root_2',
    })
    const queued = queuedRoot()
    service.queueAttempt(queued)
    service.claimNext()
    service.failAttempt({
      attemptId: queued.attempt.id,
      errorSummary: 'Transient provider failure',
      errorCode: 'TRANSIENT',
      retryable: true,
    })

    const retried = service.retryNode({
      runId: 'run_01',
      nodeId: 'agent_root',
      reservations: {
        tokenReservation: 100,
        costReservationUsd: 0.25,
        toolCallReservation: 2,
      },
    })
    assert.equal(retried.admitted, true)
    const graph = repository.getRunGraph('run_01')
    assert.equal(graph.nodes.length, 1)
    assert.equal(graph.nodes[0].id, 'agent_root')
    assert.deepEqual(graph.attempts.map((attempt) => attempt.attemptNumber), [1, 2])
    assert.equal(graph.attempts[0].status, 'failed')
    assert.equal(graph.attempts[1].status, 'queued')
    assert.equal(graph.attempts[1].recoveryOfAttemptId, queued.attempt.id)
  } finally {
    db.close()
  }
})

test('completion delivery has one durable decision-time consumer across store restarts', () => {
  const db = createRuntimeDatabase()
  try {
    const store = createAgentEventStore(db)
    seedRunningRun(store)
    const queued = queuedRoot()
    const scheduler = createAgentScheduler(db, { now: () => TS + 2 })
    const service = createAgentRunService(db, {
      eventStore: store,
      repository: createAgentRunRepository(db),
      scheduler,
      now: () => TS + 2,
    })
    service.queueAttempt(queued)

    const first = createAgentCompletionLeaseStore(db, { now: () => TS + 3 })
    assert.deepEqual(first.acquire({
      attemptId: queued.attempt.id,
      consumer: 'blocking_waiter',
    }), {
      acquired: true,
      consumer: 'blocking_waiter',
    })
    const restarted = createAgentCompletionLeaseStore(db, { now: () => TS + 4 })
    assert.deepEqual(restarted.acquire({
      attemptId: queued.attempt.id,
      consumer: 'automatic_wake',
    }), {
      acquired: false,
      consumer: 'blocking_waiter',
    })
  } finally {
    db.close()
  }
})

test('orphan reaper uses the lease clock, aborts local work, persists failure, and is idempotent', () => {
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
    scheduler.claimNext()
    const registry = createAgentControllerRegistry()
    registry.register({
      attemptId: entry.attemptId,
      runId: entry.runId,
      nodeId: entry.nodeId,
      parentNodeId: null,
      backgroundKind: 'foreground',
      supportsCancellation: true,
    })
    const orphaned = []
    const reaper = createAgentOrphanReaper({
      scheduler,
      registry,
      runService: {
        orphanAttempt(attemptId, input) {
          orphaned.push({ attemptId, input })
        },
      },
      now: () => currentTime,
    })

    currentTime = 2_050
    scheduler.heartbeat(entry.attemptId)
    currentTime = 2_120
    assert.deepEqual(reaper.reap(), [])
    currentTime = 2_151
    assert.deepEqual(reaper.reap().map((result) => result.attemptId), [entry.attemptId])
    assert.equal(registry.get(entry.attemptId), null)
    assert.equal(scheduler.list().length, 0)
    assert.equal(orphaned.length, 1)
    assert.deepEqual(reaper.reap(), [])
  } finally {
    db.close()
  }
})

test('startup orphan reaping immediately clears durable reservations without live ownership', () => {
  const db = createSchedulerDatabase()
  try {
    const leasedEntry = makeSchedulerEntry()
    const queuedEntry = makeSchedulerEntry({
      attemptId: 'attempt_agent_child_2',
      nodeId: 'agent_child_2',
    })
    insertSchedulerOwnership(db, leasedEntry)
    insertSchedulerOwnership(db, queuedEntry)
    const scheduler = createAgentScheduler(db, {
      now: () => 2_000,
      leaseDurationMs: 30_000,
    })
    scheduler.enqueue(leasedEntry)
    scheduler.claimNext()
    scheduler.enqueue(queuedEntry)
    const orphaned = []
    const reaper = createAgentOrphanReaper({
      scheduler,
      registry: createAgentControllerRegistry(),
      runService: {
        orphanAttempt(attemptId) {
          orphaned.push(attemptId)
        },
      },
      now: () => 2_001,
    })

    assert.deepEqual(
      reaper.reap({ includeUnregisteredReservations: true })
        .map((candidate) => candidate.attemptId),
      [leasedEntry.attemptId, queuedEntry.attemptId],
    )
    assert.deepEqual(orphaned, [leasedEntry.attemptId, queuedEntry.attemptId])
    assert.equal(scheduler.list().length, 0)
  } finally {
    db.close()
  }
})
