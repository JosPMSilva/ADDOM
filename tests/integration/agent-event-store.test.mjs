import test from 'node:test'
import assert from 'node:assert/strict'

import Database from 'better-sqlite3'

import { runMigrations, SCHEMA_VERSION } from '../../src/main/memory/db-migrations.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import {
  makeAgentAttempt,
  makeAgentArtifact,
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

function runCreatedDraft(overrides = {}) {
  return makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high',
    run: makeAgentRun(),
    rootNode: makeAgentNode(),
  }, {
    attemptId: null,
    ...overrides,
  })
}

test('current schema retains canonical agent ownership, conversations, migration forensics, and recovery journals', () => {
  const db = createDatabase()
  try {
    assert.equal(Number(db.pragma('user_version', { simple: true })), SCHEMA_VERSION)
    assert.equal(SCHEMA_VERSION, 29)

    const tables = new Set(db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table'
    `).all().map((row) => row.name))
    for (const table of [
      'agent_runs',
      'agent_conversations',
      'agent_turns',
      'agent_messages',
      'agent_mailbox_entries',
      'agent_promotion_snapshots',
      'project_thread_origins',
      'agent_node_conversation_bindings',
      'agent_attempt_turn_bindings',
      'agent_conversation_legacy_forensics',
      'agent_nodes',
      'agent_attempts',
      'agent_events',
      'agent_transcript_segments',
      'agent_approval_projections',
      'agent_artifact_projections',
      'agent_usage_projections',
      'agent_event_compactions',
      'agent_event_receipts',
      'agent_provider_diagnostics',
      'agent_scheduler_entries',
      'agent_scheduler_state',
      'agent_completion_leases',
      'agent_merge_operations',
      'moa_transactions_legacy_backup_v21',
    ]) {
      assert.equal(tables.has(table), true, `missing ${table}`)
    }
    assert.equal(tables.has('moa_transactions'), false)

    const indexes = new Set(db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'index'
    `).all().map((row) => row.name))
    for (const index of [
      'idx_agent_events_run_sequence',
      'idx_agent_events_node_sequence',
      'idx_agent_event_receipts_provider_identity',
      'idx_agent_runs_thread_status',
      'idx_agent_nodes_run_parent',
      'idx_agent_attempts_run_node',
      'idx_agent_provider_diagnostics_expiry',
      'idx_agent_scheduler_status_eligible',
      'idx_agent_completion_leases_run',
    ]) {
      assert.equal(indexes.has(index), true, `missing ${index}`)
    }
  } finally {
    db.close()
  }
})

test('event store allocates monotonic run/node sequences and persists projections transactionally', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)

    const created = store.append(runCreatedDraft())
    assert.equal(created.inserted, true)
    assert.equal(created.event.runSequence, 1)
    assert.equal(created.event.nodeSequence, 1)

    const runningRun = makeAgentRun({
      status: 'running',
      startedAt: 1_752_600_000_001,
      queuedNodeCount: 0,
    })
    const started = store.append(makeAgentEventDraft('agent_run_started', { run: runningRun }, {
      eventId: 'event_run_started',
      idempotencyKey: 'run_01:started',
      attemptId: null,
    }))
    assert.equal(started.event.runSequence, 2)
    assert.equal(started.event.nodeSequence, 2)

    const runningNode = makeAgentNode({ status: 'running' })
    const attempt = makeAgentAttempt()
    const agentStarted = store.append(makeAgentEventDraft('agent_started', {
      attemptId: attempt.id,
      node: runningNode,
      attempt,
    }, {
      eventId: 'event_agent_started',
      idempotencyKey: 'run_01:agent-started',
    }))
    assert.equal(agentStarted.event.runSequence, 3)
    assert.equal(agentStarted.event.nodeSequence, 3)

    const graph = repository.getRunGraph('run_01')
    assert.equal(graph.run.status, 'running')
    assert.equal(graph.nodes[0].status, 'running')
    assert.equal(graph.attempts[0].status, 'running')
    assert.equal(graph.lastRunSequence, 3)
    assert.deepEqual(graph.nodeSequences, { agent_root: 3 })
  } finally {
    db.close()
  }
})

test('provider-event and IPC idempotency do not duplicate events or consume sequences', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    store.append(runCreatedDraft())

    const firstDraft = makeAgentEventDraft('agent_commentary_delta', { delta: 'Inspecting the store.' }, {
      eventId: 'event_commentary_01',
      idempotencyKey: 'run_01:commentary:01',
      providerEventId: 'provider_event_01',
      providerCorrelationKey: 'openai-account:response_01',
    })
    const first = store.append(firstDraft)
    const providerDuplicate = store.append({
      ...firstDraft,
      eventId: 'event_commentary_provider_duplicate',
      idempotencyKey: 'run_01:commentary:provider-duplicate',
    })
    const ipcDuplicate = store.append(firstDraft)

    assert.equal(first.inserted, true)
    assert.equal(providerDuplicate.inserted, false)
    assert.equal(providerDuplicate.deduplicatedBy, 'provider_event')
    assert.equal(ipcDuplicate.inserted, false)
    assert.equal(ipcDuplicate.deduplicatedBy, 'event_id')

    const next = store.append(makeAgentEventDraft('agent_reasoning_delta', { delta: 'Checking ordering.' }, {
      eventId: 'event_reasoning_01',
      idempotencyKey: 'run_01:reasoning:01',
    }))
    assert.equal(next.event.runSequence, 3)
    assert.equal(next.event.nodeSequence, 3)
    assert.equal(repository.listEvents('run_01').length, 3)
  } finally {
    db.close()
  }
})

test('event persistence keeps stream chunk boundary whitespace intact', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    store.append(runCreatedDraft())

    const chunks = ['The first ', 'word stays ', 'separated.\n']
    chunks.forEach((delta, index) => {
      store.append(makeAgentEventDraft('agent_reasoning_delta', { delta }, {
        eventId: `event_reasoning_whitespace_${index}`,
        idempotencyKey: `run_01:reasoning-whitespace:${index}`,
      }))
    })

    const persisted = repository.listEvents('run_01')
      .filter((entry) => entry.kind === 'agent_reasoning_delta')
      .map((entry) => entry.payload.delta)
    assert.deepEqual(persisted, chunks)
    assert.equal(persisted.join(''), 'The first word stays separated.\n')
  } finally {
    db.close()
  }
})

test('provider dedupe cannot duplicate nodes, usage, artifacts, or transcript projections', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    store.append(runCreatedDraft())

    const childDraft = makeAgentEventDraft('agent_spawned', {
      spawnRequestId: 'spawn_child',
      childNodeId: 'agent_child',
      node: makeAgentNode({ id: 'agent_child' }),
    }, {
      nodeId: 'agent_child',
      attemptId: null,
      eventId: 'event_child_spawned',
      idempotencyKey: 'run_01:child-spawned',
      providerEventId: 'provider_child_spawned',
    })
    store.append(childDraft)
    store.append({
      ...childDraft,
      eventId: 'event_child_spawned_duplicate',
      idempotencyKey: 'run_01:child-spawned-duplicate',
    })

    store.append(makeAgentEventDraft('agent_started', {
      attemptId: 'attempt_agent_root_1',
      node: makeAgentNode({ status: 'running' }),
      attempt: makeAgentAttempt(),
    }, {
      eventId: 'event_root_started_for_artifact',
      idempotencyKey: 'run_01:root-started-for-artifact',
    }))

    const artifact = makeAgentArtifact({
      id: 'artifact_deduped',
      path: 'src/deduped.mjs',
      digest: 'sha256:deduped',
      sizeBytes: 10,
    })
    const artifactDraft = makeAgentEventDraft('agent_artifact_staged', {
      artifactId: artifact.id,
      workspaceMode: artifact.workspaceMode,
      path: artifact.path,
      artifact,
    }, {
      eventId: 'event_artifact_deduped',
      idempotencyKey: 'run_01:artifact-deduped',
      providerEventId: 'provider_artifact_deduped',
    })
    store.append(artifactDraft)
    store.append({
      ...artifactDraft,
      eventId: 'event_artifact_deduped_duplicate',
      idempotencyKey: 'run_01:artifact-deduped-duplicate',
    })

    const graph = repository.getRunGraph('run_01')
    assert.deepEqual(graph.nodes.map((node) => node.id), ['agent_root', 'agent_child'])
    assert.equal(graph.artifacts.length, 1)
    assert.equal(graph.usage.filter((usage) => usage.ownerType === 'node').length, 2)
    assert.equal(graph.usage.filter((usage) => usage.ownerType === 'attempt').length, 1)
    assert.equal(graph.transcript.length, 0)
    assert.equal(repository.listEvents('run_01').length, 4)
  } finally {
    db.close()
  }
})

test('appendMany rolls back events, projections, receipts, and allocated sequences on failure', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    store.append(runCreatedDraft())

    const valid = makeAgentEventDraft('agent_commentary_delta', { delta: 'This must roll back.' }, {
      eventId: 'event_rollback_valid',
      idempotencyKey: 'run_01:rollback:valid',
    })
    const invalid = makeAgentEventDraft('agent_spawned', {
      spawnRequestId: 'spawn_invalid',
      childNodeId: 'agent_invalid',
      node: makeAgentNode({
        id: 'agent_invalid',
        depth: 2,
        branchPath: ['agent_root', 'agent_invalid'],
      }),
    }, {
      eventId: 'event_rollback_invalid',
      idempotencyKey: 'run_01:rollback:invalid',
      nodeId: 'agent_invalid',
      attemptId: null,
    })

    assert.throws(() => store.appendMany([valid, invalid]), /branchPath/i)
    assert.equal(repository.listEvents('run_01').length, 1)
    assert.equal(repository.getRunGraph('run_01').lastRunSequence, 1)

    const afterRollback = store.append(makeAgentEventDraft('agent_commentary_delta', { delta: 'After rollback.' }, {
      eventId: 'event_after_rollback',
      idempotencyKey: 'run_01:after-rollback',
    }))
    assert.equal(afterRollback.event.runSequence, 2)
    assert.equal(afterRollback.event.nodeSequence, 2)
  } finally {
    db.close()
  }
})

test('a fresh store instance reseeds run and per-node sequences from durable state', () => {
  const db = createDatabase()
  try {
    const firstStore = createAgentEventStore(db)
    firstStore.append(runCreatedDraft())
    firstStore.append(makeAgentEventDraft('agent_spawned', {
      spawnRequestId: 'spawn_restart_child',
      childNodeId: 'agent_restart_child',
      node: makeAgentNode({ id: 'agent_restart_child' }),
    }, {
      nodeId: 'agent_restart_child',
      attemptId: null,
      eventId: 'event_restart_child_spawned',
      idempotencyKey: 'run_01:restart-child-spawned',
    }))
    firstStore.append(makeAgentEventDraft('agent_commentary_delta', { delta: 'Child before restart.' }, {
      nodeId: 'agent_restart_child',
      eventId: 'event_child_before_restart',
      idempotencyKey: 'run_01:child-before-restart',
    }))
    firstStore.append(makeAgentEventDraft('agent_commentary_delta', { delta: 'Root before restart.' }, {
      eventId: 'event_root_before_restart',
      idempotencyKey: 'run_01:root-before-restart',
    }))

    const restartedStore = createAgentEventStore(db)
    const rootAfterRestart = restartedStore.append(makeAgentEventDraft('agent_reasoning_delta', { delta: 'Root after restart.' }, {
      eventId: 'event_root_after_restart',
      idempotencyKey: 'run_01:root-after-restart',
    }))
    const childAfterRestart = restartedStore.append(makeAgentEventDraft('agent_reasoning_delta', { delta: 'Child after restart.' }, {
      nodeId: 'agent_restart_child',
      eventId: 'event_child_after_restart',
      idempotencyKey: 'run_01:child-after-restart',
    }))
    assert.equal(rootAfterRestart.event.runSequence, 5)
    assert.equal(rootAfterRestart.event.nodeSequence, 3)
    assert.equal(childAfterRestart.event.runSequence, 6)
    assert.equal(childAfterRestart.event.nodeSequence, 3)
  } finally {
    db.close()
  }
})

test('workspace thread deletion cascades through the complete agent graph', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    store.append(runCreatedDraft())
    store.append(makeAgentEventDraft('agent_commentary_delta', {
      delta: 'Owned by the thread.',
      providerMetadata: { trace: 'expires-separately' },
    }, {
      eventId: 'event_owned_commentary',
      idempotencyKey: 'run_01:owned-commentary',
    }))

    db.prepare('DELETE FROM chat_threads WHERE id = ?').run('thread_01')
    for (const table of [
      'agent_runs',
      'agent_nodes',
      'agent_attempts',
      'agent_events',
      'agent_transcript_segments',
      'agent_event_receipts',
      'agent_provider_diagnostics',
    ]) {
      assert.equal(Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count), 0, table)
    }
  } finally {
    db.close()
  }
})

test('workspace project deletion cascades through its thread-owned agent graph', () => {
  const db = createDatabase()
  try {
    createAgentEventStore(db).append(runCreatedDraft())
    db.prepare('DELETE FROM workspace_projects WHERE id = ?').run('project_01')
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chat_threads').get().count, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_runs').get().count, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_event_receipts').get().count, 0)
  } finally {
    db.close()
  }
})

test('subscriber failures cannot invalidate committed agent events or block other subscribers', () => {
  const db = createDatabase()
  const warnings = []
  try {
    const store = createAgentEventStore(db, {
      warn: (...args) => warnings.push(args),
    })
    const delivered = []
    store.subscribe(() => {
      throw new Error('renderer listener failed')
    })
    store.subscribe((events) => delivered.push(...events))

    const result = store.append(runCreatedDraft())

    assert.equal(result.inserted, true)
    assert.deepEqual(delivered.map((event) => event.eventId), [result.event.eventId])
    assert.equal(warnings.length, 1)
    assert.match(String(warnings[0][0]), /subscriber/i)
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM agent_events').get().count,
      1,
    )
  } finally {
    db.close()
  }
})
