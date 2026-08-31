import test from 'node:test'
import assert from 'node:assert/strict'

import Database from 'better-sqlite3'

import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import {
  classifyAgentRunRecovery,
  recoverAgentRunProjections,
} from '../../src/main/agents/agent-recovery.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  AGENT_TEST_TIMESTAMP,
  makeAgentAttempt,
  makeAgentCapabilities,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentRun,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'

function createDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  return db
}

function appendRun(store, { capabilitySnapshot = makeAgentCapabilities(), withAttempt = true } = {}) {
  store.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high',
    run: makeAgentRun(),
    rootNode: makeAgentNode({ capabilitySnapshot }),
  }, {
    attemptId: null,
    eventId: 'event_run_created',
    idempotencyKey: 'run_01:created',
  }))
  store.append(makeAgentEventDraft('agent_run_started', {
    run: makeAgentRun({ status: 'running', startedAt: AGENT_TEST_TIMESTAMP + 1, queuedNodeCount: 0 }),
  }, {
    attemptId: null,
    eventId: 'event_run_started',
    idempotencyKey: 'run_01:started',
  }))
  if (withAttempt) {
    store.append(makeAgentEventDraft('agent_started', {
      attemptId: 'attempt_agent_root_1',
      node: makeAgentNode({ status: 'running', capabilitySnapshot }),
      attempt: makeAgentAttempt('agent_root', { capabilitySnapshot }),
    }, {
      eventId: 'event_agent_started',
      idempotencyKey: 'run_01:agent-started',
    }))
  }
}

test('restart classification distinguishes resumable, interrupted, terminal, and orphaned runs', () => {
  const interrupted = classifyAgentRunRecovery({
    run: makeAgentRun({ status: 'running', startedAt: AGENT_TEST_TIMESTAMP + 1 }),
    nodes: [makeAgentNode({ status: 'running', capabilitySnapshot: makeAgentCapabilities({ resumableChildren: false }) })],
    attempts: [makeAgentAttempt('agent_root', { capabilitySnapshot: makeAgentCapabilities({ resumableChildren: false }) })],
  })
  assert.equal(interrupted.classification, 'interrupted')

  const resumable = classifyAgentRunRecovery({
    run: makeAgentRun({ status: 'running', startedAt: AGENT_TEST_TIMESTAMP + 1 }),
    nodes: [makeAgentNode({ status: 'running' })],
    attempts: [makeAgentAttempt()],
  }, {
    providerEvidenceByAttempt: {
      attempt_agent_root_1: { status: 'active', correlationVerified: true },
    },
  })
  assert.equal(resumable.classification, 'resumable')

  const terminal = classifyAgentRunRecovery({
    run: makeAgentRun({ status: 'completed', finishedAt: AGENT_TEST_TIMESTAMP + 10 }),
    nodes: [],
    attempts: [],
  })
  assert.equal(terminal.classification, 'terminal')

  const orphaned = classifyAgentRunRecovery({
    run: makeAgentRun({ status: 'running', startedAt: AGENT_TEST_TIMESTAMP + 1 }),
    nodes: [makeAgentNode({ status: 'running' })],
    attempts: [],
  })
  assert.equal(orphaned.classification, 'orphaned')
})

test('fresh repository hydration restores an active recursive graph from SQLite alone', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    appendRun(store)
    store.append(makeAgentEventDraft('agent_spawned', {
      spawnRequestId: 'spawn_agent_child',
      childNodeId: 'agent_child',
      node: makeAgentNode({ id: 'agent_child' }),
    }, {
      nodeId: 'agent_child',
      attemptId: null,
      eventId: 'event_child_spawned',
      idempotencyKey: 'run_01:child-spawned',
    }))

    const beforeRestart = createAgentRunRepository(db).getRunGraph('run_01')
    const afterRestart = createAgentRunRepository(db).getRunGraph('run_01')
    assert.equal(JSON.stringify(afterRestart), JSON.stringify(beforeRestart))
    assert.deepEqual(afterRestart.nodes.map((node) => node.id), ['agent_root', 'agent_child'])
    assert.equal(afterRestart.run.status, 'running')
  } finally {
    db.close()
  }
})

test('native provider-ahead and unverified terminal evidence remains degraded before terminal projection', () => {
  const db = createDatabase()
  try {
    const nativeCapabilities = makeAgentCapabilities({
      mode: 'native_hierarchy',
      nativeAgents: true,
      capabilityKey: 'native_hierarchy',
    })
    const store = createAgentEventStore(db)
    appendRun(store, { capabilitySnapshot: nativeCapabilities })
    const recovery = recoverAgentRunProjections(db, {
      providerEvidenceByAttempt: {
        attempt_agent_root_1: { status: 'ahead', correlationVerified: true },
      },
    })
    assert.equal(recovery[0].classification, 'interrupted')
    assert.equal(recovery[0].reconciliationStatus, 'provider_ahead')
    assert.equal(recovery[0].requiresProviderReconciliation, true)

    const unverifiedAttempt = makeAgentAttempt('agent_root', {
      status: 'completed',
      finishedAt: AGENT_TEST_TIMESTAMP + 100,
      capabilitySnapshot: nativeCapabilities,
      reconciliationState: 'provider_unverified_terminal',
    })
    assert.throws(() => store.append(makeAgentEventDraft('agent_completed', {
      resultSummary: 'Provider claims completion.',
      node: makeAgentNode({
        status: 'completed',
        finishedAt: AGENT_TEST_TIMESTAMP + 100,
        capabilitySnapshot: nativeCapabilities,
      }),
      attempt: unverifiedAttempt,
    }, {
      eventId: 'event_unverified_complete',
      idempotencyKey: 'run_01:unverified-complete',
    })), /reconciliation/i)

    assert.throws(() => store.append(makeAgentEventDraft('agent_status_changed', {
      entity: 'attempt',
      from: 'running',
      to: 'completed',
      snapshot: unverifiedAttempt,
    }, {
      eventId: 'event_unverified_status_change',
      idempotencyKey: 'run_01:unverified-status-change',
    })), /reconciliation/i)

    assert.throws(() => store.append(makeAgentEventDraft('agent_run_completed', {
      finalAuthorityNodeId: 'agent_root',
      completionReason: 'provider_claimed_completion',
      run: makeAgentRun({
        status: 'completed',
        finishedAt: AGENT_TEST_TIMESTAMP + 101,
        reconciliationStatus: 'provider_ahead',
      }),
    }, {
      attemptId: null,
      eventId: 'event_unverified_run_complete',
      idempotencyKey: 'run_01:unverified-run-complete',
    })), /reconciliation/i)

    const graph = createAgentRunRepository(db).getRunGraph('run_01')
    assert.equal(graph.run.status, 'running')
    assert.equal(graph.attempts[0].status, 'running')
  } finally {
    db.close()
  }
})

test('archiving a thread retains its graph while explicit deletion remains the cascade boundary', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    appendRun(store)
    db.prepare('UPDATE chat_threads SET archived = 1 WHERE id = ?').run('thread_01')
    assert.equal(createAgentRunRepository(db).getRunGraph('run_01').run.id, 'run_01')
  } finally {
    db.close()
  }
})
