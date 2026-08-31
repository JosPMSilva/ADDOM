import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-terminal-archive-store-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getDb, closeDb } = await import('../../src/main/memory/db.mjs')
const { SCHEMA_VERSION } = await import('../../src/main/memory/db-migrations.mjs')
const {
  archiveTerminalSession,
  getTerminalSessionArchiveBySessionId,
  listTerminalSessionArchives,
  updateTerminalSessionArchiveCandidate,
  linkTerminalSessionArchiveMemoryNode,
} = await import('../../src/main/terminal/terminal-session-archive-store.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

function buildArchiveSnapshot(overrides = {}) {
  return {
    project: 'project-a',
    threadId: 'thread-a',
    turnId: 'turn-a',
    sessionId: `term_archive_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    cwd: path.join(process.cwd(), 'workspace', 'feature-a'),
    shell: 'bash',
    shellKind: 'bash',
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_000_010_000,
    openedBy: 'model',
    closedBy: 'model',
    sessionTitle: 'Investigate build',
    closeReason: 'reaped_after_exit',
    exitCode: 0,
    exitSignal: '',
    outputSequence: 3,
    outputTruncated: false,
    outputTail: [
      { sequence: 1, at: 1_700_000_000_100, data: 'npm install\n' },
      { sequence: 2, at: 1_700_000_000_200, data: 'npm test\n' },
      { sequence: 3, at: 1_700_000_000_300, data: 'done\n' },
    ],
    policy: {
      type: 'terminal_session_policy_v1',
      profileHint: 'workspace_terminal',
      hostAccessRequired: false,
    },
    ...overrides,
  }
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('terminal archive schema migrates on clean and upgrade paths', async (t) => {
  try {
    const db = getDb()
    const tableRow = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'terminal_session_archive'
    `).get()
    assert.equal(tableRow?.name, 'terminal_session_archive')
    assert.equal(Number(db.pragma('user_version', { simple: true }) || 0), SCHEMA_VERSION)

    closeDb()

    const dbPath = path.join(userDataPath, 'memory.db')
    const { default: Database } = await import('better-sqlite3')
    const legacyDb = new Database(dbPath)
    legacyDb.exec('DROP TABLE IF EXISTS terminal_session_archive')
    legacyDb.pragma('user_version = 11')
    legacyDb.close()

    const migrated = getDb()
    const migratedRow = migrated.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'terminal_session_archive'
    `).get()
    assert.equal(migratedRow?.name, 'terminal_session_archive')
    assert.equal(Number(migrated.pragma('user_version', { simple: true }) || 0), SCHEMA_VERSION)

    closeDb()

    const partialDb = new Database(dbPath)
    partialDb.exec('DROP TABLE IF EXISTS terminal_session_archive')
    partialDb.exec(`
      CREATE TABLE terminal_session_archive (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL DEFAULT ''
      )
    `)
    partialDb.pragma('user_version = 12')
    partialDb.close()

    const repaired = getDb()
    const repairedColumns = repaired.prepare(`PRAGMA table_info('terminal_session_archive')`).all()
    const repairedColumnNames = new Set(repairedColumns.map((column) => String(column.name || '')))
    assert.equal(repairedColumnNames.has('output_tail'), true)
    assert.equal(repairedColumnNames.has('session_title'), true)
    assert.equal(repairedColumnNames.has('failure_reason'), true)
    assert.equal(repairedColumnNames.has('metadata_json'), true)
    assert.equal(repairedColumnNames.has('memory_candidate_status'), true)
    assert.equal(Number(repaired.pragma('user_version', { simple: true }) || 0), SCHEMA_VERSION)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('terminal archive store supports archive, list, suggestion updates, link, and idempotent re-archive', (t) => {
  try {
    const snapshot = buildArchiveSnapshot({ sessionId: 'term_archive_store_1' })
    const archived = archiveTerminalSession(snapshot, {
      maxTailChars: 128,
      maxTailChunks: 8,
      maxPayloadRowsPerProject: 20,
      maxPayloadBytesPerProject: 100_000,
    })

    assert.equal(archived.sessionId, 'term_archive_store_1')
    assert.equal(archived.project, 'project-a')
    assert.equal(archived.status, 'ended')
    assert.equal(archived.failureReason, '')
    assert.equal(archived.sessionTitle, 'Investigate build')
    assert.equal(archived.outputTail.length, 3)
    assert.equal(archived.metadata?.retention?.payloadPresent, true)
    assert.equal(archived.displayLabelPrimary.includes('Investigate build'), true)

    const listed = listTerminalSessionArchives('project-a')
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.sessionId, 'term_archive_store_1')

    const pending = updateTerminalSessionArchiveCandidate('term_archive_store_1', {
      status: 'pending',
      summary: 'Remember the fixed install flow.',
      reason: 'This workflow is reusable for the workspace.',
    })
    assert.equal(pending.memoryCandidateStatus, 'pending')
    assert.equal(pending.memoryCandidateSummary, 'Remember the fixed install flow.')

    const linked = linkTerminalSessionArchiveMemoryNode('term_archive_store_1', {
      memoryNodeId: 'memory_node_1',
    })
    assert.equal(linked.memoryCandidateStatus, 'accepted')
    assert.equal(linked.memoryNodeId, 'memory_node_1')

    const reArchived = archiveTerminalSession({
      ...snapshot,
      sessionTitle: 'Updated title should not create duplicates',
      closeReason: 'close_after_exit',
    })
    assert.equal(reArchived.memoryCandidateStatus, 'accepted')
    assert.equal(reArchived.memoryNodeId, 'memory_node_1')

    const rowsAfterRearchive = listTerminalSessionArchives('project-a')
    assert.equal(rowsAfterRearchive.length, 1)
    assert.equal(rowsAfterRearchive[0]?.sessionId, 'term_archive_store_1')
    assert.equal(getTerminalSessionArchiveBySessionId('term_archive_store_1')?.closeReason, 'close_after_exit')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('terminal archive store bounds payload tails and prunes older payloads without dropping metadata rows', (t) => {
  try {
    const largeChunk = '1234567890ABCDEFGHIJ'
    archiveTerminalSession(buildArchiveSnapshot({
      project: 'project-retention',
      sessionId: 'term_archive_retention_1',
      closedAt: 10,
      outputTail: [
        { sequence: 1, at: 1, data: largeChunk },
        { sequence: 2, at: 2, data: 'older\n' },
      ],
    }), {
      maxTailChars: 10,
      maxTailChunks: 1,
      maxPayloadRowsPerProject: 1,
      maxPayloadBytesPerProject: 10_000,
    })

    archiveTerminalSession(buildArchiveSnapshot({
      project: 'project-retention',
      sessionId: 'term_archive_retention_2',
      closedAt: 20,
      outputTail: [
        { sequence: 1, at: 1, data: 'newest-payload\n' },
      ],
    }), {
      maxTailChars: 64,
      maxTailChunks: 4,
      maxPayloadRowsPerProject: 1,
      maxPayloadBytesPerProject: 10_000,
    })

    const newest = getTerminalSessionArchiveBySessionId('term_archive_retention_2')
    const older = getTerminalSessionArchiveBySessionId('term_archive_retention_1')

    assert.deepEqual(newest.outputTail.map((entry) => entry.data), ['newest-payload\n'])
    assert.equal(older.outputTail.length, 0)
    assert.equal(older.outputSequence, 2)
    assert.equal(older.outputMode, 'tail')
    assert.equal(older.metadata?.retention?.payloadPruned, true)
    assert.equal(older.metadata?.retention?.payloadPresent, false)
    assert.equal(older.metadata?.retention?.originalChunkCount, 2)
    assert.equal(older.metadata?.runtimeCloseReason, 'reaped_after_exit')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('terminal archive store preserves explicit failure taxonomy without requiring an explicit status', (t) => {
  try {
    const archived = archiveTerminalSession(buildArchiveSnapshot({
      project: 'project-failure-taxonomy',
      sessionId: 'term_archive_failure_reason_only',
      closeReason: '',
      exitCode: 0,
      exitSignal: '',
      failureReason: 'renderer_detached',
    }))

    assert.equal(archived.status, 'failed')
    assert.equal(archived.failureReason, 'renderer_detached')
    assert.equal(archived.metadata?.lifecycle?.failureReason, 'renderer_detached')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
