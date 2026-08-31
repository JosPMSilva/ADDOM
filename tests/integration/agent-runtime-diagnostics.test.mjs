import assert from 'node:assert/strict'
import test from 'node:test'

import Database from 'better-sqlite3'

import {
  AGENT_RUNTIME_DIAGNOSTIC_KINDS,
  AGENT_RUNTIME_DIAGNOSTIC_RETENTION_MS,
  createAgentRuntimeDiagnostics,
} from '../../src/main/agents/agent-runtime-diagnostics.mjs'
import { runMigrations, SCHEMA_VERSION } from '../../src/main/memory/db-migrations.mjs'

const REQUIRED_KINDS = [
  'spawn_latency',
  'queue_latency',
  'admission_rejection',
  'cancellation',
  'reconnect',
  'reconciliation',
  'orphan',
  'dedupe',
  'sequence_gap',
  'projection_replay',
  'approval_age',
  'workspace_allocation',
  'workspace_cleanup',
  'merge_conflict',
  'transcript_hydration',
  'renderer_reconciliation',
]

function openDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

test('current schema retains a local content-free agent runtime diagnostic store', () => {
  const db = openDatabase()
  try {
    assert.equal(SCHEMA_VERSION, 29)
    assert.deepEqual([...AGENT_RUNTIME_DIAGNOSTIC_KINDS].sort(), [...REQUIRED_KINDS].sort())
    assert.ok(db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'agent_runtime_diagnostics'
    `).get())
    assert.ok(db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_agent_runtime_diagnostics_expiry'
    `).get())
  } finally {
    db.close()
  }
})

test('runtime diagnostics retain detailed local rows but export aggregates without content or identity', () => {
  const db = openDatabase()
  let nextId = 0
  const now = 1_752_700_000_000
  const diagnostics = createAgentRuntimeDiagnostics(db, {
    idFactory: () => `diag_${++nextId}`,
    now: () => now,
    monotonicNow: () => 120.5 + nextId,
  })
  try {
    for (const [index, kind] of REQUIRED_KINDS.entries()) {
      diagnostics.record({
        kind,
        runId: 'run_private',
        nodeId: 'node_private',
        attemptId: 'attempt_private',
        providerClass: index % 2 === 0 ? 'managed_hierarchy' : 'provider_opaque',
        durationMs: index + 1,
        outcome: index % 3 === 0 ? 'rejected' : 'success',
        correlationId: `correlation_private_${index}`,
        attributes: { count: index, recovered: index % 2 === 0, reason_code: 'budget_limit' },
      })
    }

    const localRows = diagnostics.listDetailed({ limit: 100 })
    assert.equal(localRows.length, REQUIRED_KINDS.length)
    assert.equal(localRows[0].runId, 'run_private')
    assert.equal(localRows[0].expiresAt, now + AGENT_RUNTIME_DIAGNOSTIC_RETENTION_MS)

    const exported = diagnostics.exportAggregates()
    const serialized = JSON.stringify(exported)
    assert.equal(exported.totalCount, REQUIRED_KINDS.length)
    assert.equal(exported.rows.length, REQUIRED_KINDS.length)
    assert.doesNotMatch(serialized, /run_private|node_private|attempt_private|correlation_private/)
    assert.doesNotMatch(serialized, /attributes|budget_limit/)
    assert.match(serialized, /managed_hierarchy/)
    assert.match(serialized, /provider_opaque/)
  } finally {
    db.close()
  }
})

test('runtime diagnostics reject prose-bearing or malformed records and prune after fourteen days', () => {
  const db = openDatabase()
  let now = 1_752_700_000_000
  const diagnostics = createAgentRuntimeDiagnostics(db, {
    idFactory: () => 'diag_01',
    now: () => now,
    monotonicNow: () => 42,
  })
  try {
    assert.throws(() => diagnostics.record({
      kind: 'unknown_kind',
      runId: 'run_01',
      providerClass: 'managed_hierarchy',
      outcome: 'success',
    }), /kind/i)
    assert.throws(() => diagnostics.record({
      kind: 'spawn_latency',
      runId: 'run_01',
      providerClass: 'managed hierarchy',
      outcome: 'success',
    }), /provider class/i)
    assert.throws(() => diagnostics.record({
      kind: 'spawn_latency',
      runId: 'run_01',
      providerClass: 'managed_hierarchy',
      outcome: 'success',
      attributes: { promptText: 'private prompt' },
    }), /content-bearing/i)
    assert.throws(() => diagnostics.record({
      kind: 'spawn_latency',
      runId: 'run_01',
      providerClass: 'managed_hierarchy',
      outcome: 'success',
      attributes: { reason_code: 'contains user prose' },
    }), /attribute value/i)

    diagnostics.record({
      kind: 'spawn_latency',
      runId: 'run_01',
      providerClass: 'managed_hierarchy',
      outcome: 'success',
    })
    now += AGENT_RUNTIME_DIAGNOSTIC_RETENTION_MS
    assert.deepEqual(diagnostics.pruneExpired(), { deleted: 1 })
    assert.equal(diagnostics.listDetailed().length, 0)
  } finally {
    db.close()
  }
})
