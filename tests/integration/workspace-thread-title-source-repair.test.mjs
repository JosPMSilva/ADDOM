import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'

import {
  ensureWorkspaceTables,
  ensureWorkspaceThreadColumns,
} from '../../src/main/memory/db-schema-workspace.mjs'

test('workspace schema repair makes only legacy New Thread placeholders auto-titleable', () => {
  const db = new Database(':memory:')
  try {
    ensureWorkspaceTables(db)
    db.prepare(`
      INSERT INTO workspace_projects (
        id, path, name, created_at, last_opened_at, last_worked_at,
        last_provider, last_model, active_thread_id
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', ?)
    `).run('project-1', 'C:/project-1', 'project-1', 1, 1, 1, 'thread-placeholder')
    const insertThread = db.prepare(`
      INSERT INTO chat_threads (
        id, project_id, title, title_source, created_at, updated_at, last_viewed_at, archived
      ) VALUES (?, 'project-1', ?, 'manual', 1, 1, 1, 0)
    `)
    insertThread.run('thread-placeholder', 'New Thread')
    insertThread.run('thread-manual', 'Release investigation')

    ensureWorkspaceThreadColumns(db)

    const rows = db.prepare(`
      SELECT id, title_source AS titleSource
      FROM chat_threads
      ORDER BY id
    `).all()
    assert.deepEqual(rows, [
      { id: 'thread-manual', titleSource: 'manual' },
      { id: 'thread-placeholder', titleSource: 'default' },
    ])
  } finally {
    db.close()
  }
})
