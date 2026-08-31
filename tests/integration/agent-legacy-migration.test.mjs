import test from 'node:test'
import assert from 'node:assert/strict'

import Database from 'better-sqlite3'

import { runMigrations, SCHEMA_VERSION } from '../../src/main/memory/db-migrations.mjs'
import { ensureLegacyMoaTransactionTable } from '../../src/main/memory/db-schema-workspace.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { seedAgentWorkspace } from '../helpers/agent-runtime-fixtures.mjs'

function tableExists(db, name) {
  return !!db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(name)
}

function legacyDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  db.exec('DROP TABLE IF EXISTS moa_transactions_legacy_backup_v21')
  ensureLegacyMoaTransactionTable(db)
  db.pragma('user_version = 20')
  return db
}

test('v21 migration backs up and converts a legacy transaction into one canonical root-only run', () => {
  const db = legacyDatabase()
  try {
    db.prepare(`
      INSERT INTO moa_transactions (
        id, thread_id, turn_id, delegation_id, timestamp, task_manifest,
        agent_outputs, token_cost_estimate, started_at, finished_at,
        duration_ms, policy_snapshot, status_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy_moa_01',
      'thread_01',
      'turn_legacy',
      'delegation_legacy',
      1_752_600_000_000,
      JSON.stringify([{ task_id: 'review', instruction: 'Review the implementation.' }]),
      JSON.stringify([{ role: 'Reviewer', status: 'completed', output: 'No critical issues found.' }]),
      250,
      1_752_600_000_000,
      1_752_600_000_100,
      100,
      JSON.stringify({ maxTasksPerDelegation: 6 }),
      JSON.stringify({ status: 'completed', completed: 1, failed: 0 }),
    )

    runMigrations(db)

    assert.equal(SCHEMA_VERSION, 29)
    assert.equal(tableExists(db, 'moa_transactions'), false)
    assert.equal(tableExists(db, 'moa_transactions_legacy_backup_v21'), true)
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM moa_transactions_legacy_backup_v21').get().count,
      1,
    )
    const runRow = db.prepare(`
      SELECT id FROM agent_runs WHERE turn_id = 'turn_legacy'
    `).get()
    assert.ok(runRow?.id)
    const graph = createAgentRunRepository(db).getRunGraph(runRow.id)
    assert.equal(graph.run.status, 'completed')
    assert.equal(graph.run.finalAuthorityNodeId, graph.run.rootNodeId)
    assert.equal(graph.nodes.length, 1)
    assert.equal(graph.nodes[0].parentNodeId, null)
    assert.equal(graph.nodes[0].status, 'completed')
    assert.equal(graph.transcript.length, 1)
    assert.equal(graph.transcript[0].kind, 'agent_final_message')
    assert.match(graph.transcript[0].payload.text, /Imported legacy Agents record/i)
    assert.match(graph.transcript[0].payload.text, /No critical issues found/i)
  } finally {
    db.close()
  }
})

test('v21 migration retains orphaned records only in the exact backup', () => {
  const db = legacyDatabase()
  try {
    db.prepare(`
      INSERT INTO moa_transactions (id, thread_id, turn_id, timestamp)
      VALUES (?, ?, ?, ?)
    `).run('legacy_orphan', 'missing_thread', 'turn_orphan', 1_752_600_000_000)

    runMigrations(db)

    assert.equal(tableExists(db, 'moa_transactions'), false)
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM moa_transactions_legacy_backup_v21').get().count,
      1,
    )
    assert.equal(
      db.prepare(`SELECT COUNT(*) AS count FROM agent_runs WHERE turn_id = 'turn_orphan'`).get().count,
      0,
    )
  } finally {
    db.close()
  }
})

test('v21 legacy conversion is idempotent', () => {
  const db = legacyDatabase()
  try {
    db.prepare(`
      INSERT INTO moa_transactions (id, thread_id, turn_id, timestamp)
      VALUES (?, ?, ?, ?)
    `).run('legacy_idempotent', 'thread_01', 'turn_idempotent', 1_752_600_000_000)

    runMigrations(db)
    db.pragma('user_version = 20')
    runMigrations(db)

    assert.equal(
      db.prepare(`SELECT COUNT(*) AS count FROM agent_runs WHERE turn_id = 'turn_idempotent'`).get().count,
      1,
    )
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM moa_transactions_legacy_backup_v21').get().count,
      1,
    )
  } finally {
    db.close()
  }
})
