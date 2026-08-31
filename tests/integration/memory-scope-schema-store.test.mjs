import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-memory-scope-schema-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getDb, closeDb } = await import('../../src/main/memory/db.mjs')
const { SCHEMA_VERSION } = await import('../../src/main/memory/db-migrations.mjs')
const { addNode, listNodes } = await import('../../src/main/memory/memory-store.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('memory node schema migration backfills scope metadata safely for legacy rows', async (t) => {
  try {
    closeDb()

    const dbPath = path.join(userDataPath, 'memory.db')
    const { default: Database } = await import('better-sqlite3')
    const legacyDb = new Database(dbPath)
    legacyDb.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        sort_id INTEGER,
        project TEXT NOT NULL DEFAULT '',
        topic TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        pinned INTEGER NOT NULL DEFAULT 0,
        data_policy TEXT NOT NULL DEFAULT 'standard',
        source TEXT NOT NULL DEFAULT 'user',
        compressed INTEGER NOT NULL DEFAULT 0,
        compressed_into TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 1,
        last_accessed INTEGER NOT NULL,
        embedding BLOB
      )
    `)
    legacyDb.prepare(`
      INSERT INTO nodes (
        id, sort_id, project, topic, content, tags, pinned, data_policy, source,
        compressed, compressed_into, created_at, updated_at, access_count, last_accessed, embedding
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, 'standard', ?, 0, NULL, ?, ?, 1, ?, NULL)
    `).run(
      'legacy_project_node',
      1,
      'project-legacy',
      'Project fact',
      'A project-scoped fact.',
      '[]',
      'user_memory',
      1000,
      2000,
      3000,
    )
    legacyDb.prepare(`
      INSERT INTO nodes (
        id, sort_id, project, topic, content, tags, pinned, data_policy, source,
        compressed, compressed_into, created_at, updated_at, access_count, last_accessed, embedding
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, 'standard', ?, 0, NULL, ?, ?, 1, ?, NULL)
    `).run(
      'legacy_global_node',
      2,
      '__addom_global__',
      'Global fact',
      'A global fact.',
      '[]',
      'user_memory',
      1000,
      2000,
      3000,
    )
    legacyDb.prepare(`
      INSERT INTO nodes (
        id, sort_id, project, topic, content, tags, pinned, data_policy, source,
        compressed, compressed_into, created_at, updated_at, access_count, last_accessed, embedding
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, 'standard', ?, 0, NULL, ?, ?, 1, ?, NULL)
    `).run(
      'legacy_terminal_node',
      3,
      'project-legacy',
      'Terminal note',
      'A terminal summary.',
      JSON.stringify([
        'terminal_summary',
        'terminal_session',
        'terminal_thread:thread-legacy-42',
      ]),
      'terminal_summary',
      1000,
      2000,
      4321,
    )
    legacyDb.pragma('user_version = 13')
    legacyDb.close()

    const db = getDb()
    assert.equal(Number(db.pragma('user_version', { simple: true }) || 0), SCHEMA_VERSION)

    const columns = db.prepare(`PRAGMA table_info('nodes')`).all()
    const columnNames = new Set(columns.map((column) => String(column.name || '')))
    for (const requiredColumn of [
      'scope',
      'thread_id',
      'origin_thread_id',
      'origin_thread_title',
      'origin_thread_state',
      'origin_thread_deleted_at',
      'origin_project_id',
      'origin_project_name',
      'origin_project_path',
      'origin_project_state',
      'origin_project_removed_at',
      'durability',
      'confidence',
      'promoted_at',
      'invalidated_at',
      'superseded_by',
      'last_used_at',
    ]) {
      assert.equal(columnNames.has(requiredColumn), true, `missing migrated nodes.${requiredColumn}`)
    }

    const indexes = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index' AND tbl_name = 'nodes'
    `).all().map((row) => String(row.name || ''))
    for (const requiredIndex of [
      'idx_nodes_project_scope_updated',
      'idx_nodes_thread_scope_updated',
      'idx_nodes_project_scope_source_compressed_pinned',
      'idx_nodes_scope_last_used',
      'idx_nodes_origin_thread_promoted',
      'idx_nodes_origin_thread_state_scope',
      'idx_nodes_origin_project_state',
    ]) {
      assert.ok(indexes.includes(requiredIndex), `missing migrated index ${requiredIndex}`)
    }

    const rows = db.prepare(`
      SELECT id, project, scope, origin_thread_id, durability, confidence, last_used_at
      FROM nodes
      WHERE id IN ('legacy_project_node', 'legacy_global_node', 'legacy_terminal_node')
      ORDER BY sort_id ASC
    `).all()

    assert.deepEqual(rows, [
      {
        id: 'legacy_project_node',
        project: 'project-legacy',
        scope: 'project',
        origin_thread_id: null,
        durability: 'standard',
        confidence: 0.5,
        last_used_at: 3000,
      },
      {
        id: 'legacy_global_node',
        project: '__addom_global__',
        scope: 'global',
        origin_thread_id: null,
        durability: 'standard',
        confidence: 0.5,
        last_used_at: 3000,
      },
      {
        id: 'legacy_terminal_node',
        project: 'project-legacy',
        scope: 'project',
        origin_thread_id: 'thread-legacy-42',
        durability: 'standard',
        confidence: 0.5,
        last_used_at: 4321,
      },
    ])
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('idempotent schema safety canonicalizes dirty scoped metadata on partially migrated rows', async (t) => {
  try {
    closeDb()

    const dbPath = path.join(userDataPath, 'memory.db')
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(`${dbPath}${suffix}`, { force: true }) } catch { /* best-effort reset */ }
    }

    const { default: Database } = await import('better-sqlite3')
    const partialDb = new Database(dbPath)
    partialDb.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        sort_id INTEGER,
        project TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT 'project',
        thread_id TEXT,
        origin_thread_id TEXT,
        topic TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        pinned INTEGER NOT NULL DEFAULT 0,
        data_policy TEXT NOT NULL DEFAULT 'standard',
        source TEXT NOT NULL DEFAULT 'user',
        durability TEXT NOT NULL DEFAULT 'standard',
        confidence REAL NOT NULL DEFAULT 0.5,
        compressed INTEGER NOT NULL DEFAULT 0,
        compressed_into TEXT,
        promoted_at INTEGER,
        invalidated_at INTEGER,
        superseded_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 1,
        last_accessed INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL DEFAULT 0,
        embedding BLOB
      )
    `)
    const insert = partialDb.prepare(`
      INSERT INTO nodes (
        id, sort_id, project, scope, thread_id, origin_thread_id, topic, content, tags, pinned,
        data_policy, source, durability, confidence, compressed, compressed_into, promoted_at,
        invalidated_at, superseded_by, created_at, updated_at, access_count, last_accessed, last_used_at, embedding
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'standard', ?, 'standard', 0.5, 0, NULL, NULL, NULL, NULL, ?, ?, 1, ?, ?, NULL)
    `)
    insert.run(
      'dirty_thread_node',
      1,
      'project-canonical',
      ' THREAD ',
      ' thread-canonical ',
      ' origin-explicit ',
      'Thread fact',
      'Canonical thread metadata should be queryable.',
      '[]',
      'validated_decision',
      1000,
      2000,
      3456,
      0,
    )
    insert.run(
      'dirty_global_node',
      2,
      '__addom_global__',
      ' Global ',
      '   ',
      '   ',
      'Global fact',
      'Canonical global scope should match exact retrieval clauses.',
      '[]',
      'user_memory',
      1000,
      2000,
      4567,
      0,
    )
    insert.run(
      'terminal_preserve_origin_node',
      3,
      'project-canonical',
      ' PROJECT ',
      '   ',
      ' preserved-origin ',
      'Terminal fact',
      'Explicit origin ids should win over tag-derived backfills.',
      JSON.stringify([
        'terminal_summary',
        'terminal_session',
        'terminal_thread:derived-origin',
      ]),
      'terminal_summary',
      1000,
      2000,
      5678,
      0,
    )
    partialDb.pragma('user_version = 14')
    partialDb.close()

    const db = getDb()
    const rows = db.prepare(`
      SELECT id, scope, thread_id, origin_thread_id, last_used_at
      FROM nodes
      WHERE id IN ('dirty_thread_node', 'dirty_global_node', 'terminal_preserve_origin_node')
      ORDER BY sort_id ASC
    `).all()

    assert.deepEqual(rows, [
      {
        id: 'dirty_thread_node',
        scope: 'thread',
        thread_id: 'thread-canonical',
        origin_thread_id: 'origin-explicit',
        last_used_at: 3456,
      },
      {
        id: 'dirty_global_node',
        scope: 'global',
        thread_id: null,
        origin_thread_id: null,
        last_used_at: 4567,
      },
      {
        id: 'terminal_preserve_origin_node',
        scope: 'project',
        thread_id: null,
        origin_thread_id: 'preserved-origin',
        last_used_at: 5678,
      },
    ])
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('memory store round-trips scoped node fields while preserving legacy defaults', async (t) => {
  try {
    const project = 'memory-scope-project'

    const legacyNodeId = await addNode({
      project,
      topic: 'Legacy caller',
      content: 'No scope metadata provided.',
      source: 'user_memory',
    })

    const threadNodeId = await addNode({
      project,
      topic: 'Thread-scoped note',
      content: 'Scoped to the active thread.',
      source: 'validated_decision',
      scope: 'thread',
      threadId: 'thread-roundtrip-1',
      durability: 'ephemeral',
      confidence: 0.85,
    })

    const projectScopedNodeId = await addNode({
      project,
      topic: 'Promoted project note',
      content: 'Keeps provenance from the original thread.',
      source: 'reference_note',
      scope: 'project',
      originThreadId: 'thread-origin-77',
      durability: 'promoted',
      confidence: 0.95,
    })

    const globalNodeId = await addNode({
      project,
      topic: 'Global note',
      content: 'Visible through the global project key.',
      source: 'user_memory',
      scope: 'global',
      durability: 'pinned',
      confidence: 0.7,
    })

    const listedProject = listNodes(project, { includeCompressed: true, includeGlobal: true })
    const listedThread = listNodes(project, {
      includeCompressed: true,
      includeGlobal: true,
      includeProject: false,
      threadId: 'thread-roundtrip-1',
    })
    const byId = new Map([...listedProject, ...listedThread].map((node) => [node.id, node]))

    assert.deepEqual(byId.get(legacyNodeId), {
      ...byId.get(legacyNodeId),
      scope: 'project',
      threadId: null,
      originThreadId: null,
      durability: 'standard',
      confidence: 0.5,
      invalidatedAt: null,
      supersededBy: null,
    })

    assert.deepEqual(byId.get(threadNodeId), {
      ...byId.get(threadNodeId),
      scope: 'thread',
      threadId: 'thread-roundtrip-1',
      originThreadId: 'thread-roundtrip-1',
      durability: 'ephemeral',
      confidence: 0.85,
      invalidatedAt: null,
      supersededBy: null,
    })

    assert.deepEqual(byId.get(projectScopedNodeId), {
      ...byId.get(projectScopedNodeId),
      scope: 'project',
      threadId: null,
      originThreadId: 'thread-origin-77',
      durability: 'promoted',
      confidence: 0.95,
      invalidatedAt: null,
      supersededBy: null,
    })

    assert.deepEqual(byId.get(globalNodeId), {
      ...byId.get(globalNodeId),
      scope: 'global',
      isGlobal: true,
      project: '',
      projectKey: '__addom_global__',
      threadId: null,
      originThreadId: null,
      durability: 'pinned',
      confidence: 0.7,
      invalidatedAt: null,
      supersededBy: null,
    })
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
