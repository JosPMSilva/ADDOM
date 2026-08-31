import assert from 'node:assert/strict'
import test from 'node:test'

import Database from 'better-sqlite3'

import { createAgentControlService } from '../../src/main/agents/agent-control-service.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentOrphanReaper } from '../../src/main/agents/agent-orphan-reaper.mjs'
import { recoverAgentRunProjections } from '../../src/main/agents/agent-recovery.mjs'
import { createAgentRunQueryService } from '../../src/main/agents/agent-run-query-service.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { createAgentScheduler } from '../../src/main/agents/agent-scheduler.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
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

function collectingDiagnostics() {
  const records = []
  return {
    records,
    record(input) {
      records.push(input)
      return input
    },
  }
}

test('event store and renderer queries emit content-free projection, dedupe, hydration, and reconciliation diagnostics', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  const diagnostics = collectingDiagnostics()
  let monotonic = 0
  try {
    const store = createAgentEventStore(db, {
      diagnostics,
      monotonicNow: () => ++monotonic,
    })
    const created = makeAgentEventDraft('agent_run_created', {
      policyProfileId: 'high',
      run: makeAgentRun(),
      rootNode: makeAgentNode(),
    }, {
      eventId: 'event_created',
      idempotencyKey: 'run_01:created',
      attemptId: null,
    })
    store.append(created)
    store.append(created)
    store.append(makeAgentEventDraft('agent_commentary_delta', {
      delta: 'private transcript content',
    }, {
      eventId: 'event_commentary',
      idempotencyKey: 'run_01:commentary',
    }))

    const query = createAgentRunQueryService({
      db,
      repository: createAgentRunRepository(db),
      diagnostics,
      monotonicNow: () => ++monotonic,
    })
    query.getRun({
      projectId: 'project_01',
      threadId: 'thread_01',
      runId: 'run_01',
      reconciliationReason: 'sequence_gap',
    })
    query.getTranscriptPage({
      projectId: 'project_01',
      threadId: 'thread_01',
      runId: 'run_01',
      nodeId: 'agent_root',
    })

    assert.deepEqual(
      new Set(diagnostics.records.map((record) => record.kind)),
      new Set([
        'projection_replay',
        'dedupe',
        'renderer_reconciliation',
        'sequence_gap',
        'transcript_hydration',
      ]),
    )
    assert.doesNotMatch(JSON.stringify(diagnostics.records), /private transcript content/)
  } finally {
    db.close()
  }
})

test('scheduler emits admission rejection and queue latency diagnostics', () => {
  const rejectedDb = createSchedulerDatabase()
  const rejectedDiagnostics = collectingDiagnostics()
  try {
    const entry = makeSchedulerEntry()
    insertSchedulerOwnership(rejectedDb, entry)
    const scheduler = createAgentScheduler(rejectedDb, {
      diagnostics: rejectedDiagnostics,
      governor: {
        evaluateAdmission: () => ({ admitted: false, reason: 'max_depth' }),
        evaluateExecution: () => ({ granted: false, reason: 'blocked' }),
      },
      now: () => 2_000,
    })
    assert.equal(scheduler.enqueue(entry).admitted, false)
    assert.equal(rejectedDiagnostics.records[0].kind, 'admission_rejection')
    assert.equal(rejectedDiagnostics.records[0].attributes.reason_code, 'max_depth')
  } finally {
    rejectedDb.close()
  }

  const admittedDb = createSchedulerDatabase()
  const admittedDiagnostics = collectingDiagnostics()
  try {
    const entry = makeSchedulerEntry({ createdAt: 1_000 })
    insertSchedulerOwnership(admittedDb, entry)
    const scheduler = createAgentScheduler(admittedDb, {
      diagnostics: admittedDiagnostics,
      governor: {
        evaluateAdmission: () => ({ admitted: true, reason: null }),
        evaluateExecution: () => ({ granted: true, reason: null }),
      },
      now: () => 2_000,
    })
    scheduler.enqueue(entry)
    scheduler.claimNext()
    const queue = admittedDiagnostics.records.find((record) => record.kind === 'queue_latency')
    assert.equal(queue.durationMs, 1_000)
  } finally {
    admittedDb.close()
  }
})

test('control, orphan, and recovery boundaries emit their canonical diagnostics', () => {
  const controlDiagnostics = collectingDiagnostics()
  const control = createAgentControlService({
    diagnostics: controlDiagnostics,
    registry: {
      cancel: () => ({ cancelledAttemptIds: ['attempt_01'], unsupportedAttemptIds: [] }),
    },
    runService: {
      listCancellableAttemptIds: () => ['attempt_01'],
      cancelAttempts: (attemptIds) => attemptIds,
    },
  })
  control.stopRun({ runId: 'run_01', reason: 'user_stop' })
  assert.equal(controlDiagnostics.records[0].kind, 'cancellation')

  const orphanDiagnostics = collectingDiagnostics()
  const reaper = createAgentOrphanReaper({
    diagnostics: orphanDiagnostics,
    now: () => 2_000,
    scheduler: {
      listExpiredLeases: () => [{
        attemptId: 'attempt_01',
        runId: 'run_01',
        nodeId: 'node_01',
        leaseExpiresAt: 1_000,
      }],
      get: () => ({ status: 'leased', leaseExpiresAt: 1_000 }),
      complete: () => true,
    },
    registry: {
      get: () => null,
      unregister: () => true,
    },
    runService: { orphanAttempt: () => true },
  })
  reaper.reap()
  assert.equal(orphanDiagnostics.records[0].kind, 'orphan')

  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  const recoveryDiagnostics = collectingDiagnostics()
  try {
    const store = createAgentEventStore(db)
    store.append(makeAgentEventDraft('agent_run_created', {
      policyProfileId: 'high',
      run: makeAgentRun(),
      rootNode: makeAgentNode(),
    }, { attemptId: null }))
    recoverAgentRunProjections(db, { diagnostics: recoveryDiagnostics })
    assert.equal(recoveryDiagnostics.records[0].kind, 'reconciliation')
  } finally {
    db.close()
  }
})
