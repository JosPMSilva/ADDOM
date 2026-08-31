import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-lifecycle-provenance-userdata-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getDb, closeDb } = await import('../../src/main/memory/db.mjs')
const { SCHEMA_VERSION } = await import('../../src/main/memory/db-migrations.mjs')
const { addNode, getNode, promoteNode } = await import('../../src/main/memory/memory-store.mjs')
const { recordWrite, listRevisions } = await import('../../src/main/memory/artifact-store.mjs')
const {
  buildMemoryContext,
  listMemoryRoles,
  readMemory,
  writeMemory,
} = await import('../../src/main/moa/agent-memory.mjs')
const { registerProject } = await import('../../src/main/workspace/workspace-store.mjs')

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

test('current schema persists lifecycle provenance and app-owned agent memory', async (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-lifecycle-provenance-project-'))
  try {
    const { project, activeThread } = registerProject(projectRoot)
    const db = getDb()

    assert.equal(Number(db.pragma('user_version', { simple: true }) || 0), SCHEMA_VERSION)

    const nodeColumns = new Set(
      db.prepare(`PRAGMA table_info('nodes')`).all().map((column) => String(column.name || '')),
    )
    for (const column of [
      'origin_thread_title',
      'origin_thread_state',
      'origin_thread_deleted_at',
      'origin_project_id',
      'origin_project_name',
      'origin_project_path',
      'origin_project_state',
      'origin_project_removed_at',
    ]) {
      assert.equal(nodeColumns.has(column), true, `missing nodes.${column}`)
    }

    const artifactColumns = new Set(
      db.prepare(`PRAGMA table_info('artifacts')`).all().map((column) => String(column.name || '')),
    )
    for (const column of [
      'origin_thread_id',
      'origin_thread_title',
      'origin_turn_id',
      'origin_thread_state',
      'origin_thread_deleted_at',
    ]) {
      assert.equal(artifactColumns.has(column), true, `missing artifacts.${column}`)
    }

    const table = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'moa_agent_memory'
    `).get()
    assert.equal(table?.name, 'moa_agent_memory')
    const indexes = new Set(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all()
        .map((row) => String(row.name || '')),
    )
    for (const index of [
      'idx_nodes_origin_thread_state_scope',
      'idx_nodes_origin_project_state',
      'idx_artifacts_origin_thread',
      'idx_moa_agent_memory_project_scope',
    ]) {
      assert.equal(indexes.has(index), true, `missing ${index}`)
    }

    const nodeId = await addNode({
      project: projectRoot,
      scope: 'thread',
      threadId: activeThread.id,
      topic: 'Lifecycle provenance',
      content: 'Retain the source identity when the thread later changes state.',
    })
    assert.deepEqual(getNode(nodeId), {
      ...getNode(nodeId),
      originThreadId: activeThread.id,
      originThreadTitle: activeThread.title,
      originThreadState: 'active',
      originThreadDeletedAt: null,
      originProjectId: project.id,
      originProjectName: project.name,
      originProjectPath: project.path,
      originProjectState: 'active',
      originProjectRemovedAt: null,
    })
    const promotedNode = promoteNode(nodeId, { targetScope: 'global' })
    assert.equal(promotedNode.scope, 'global')
    assert.equal(promotedNode.originThreadId, activeThread.id)
    assert.equal(promotedNode.originThreadTitle, activeThread.title)
    assert.equal(promotedNode.originProjectId, project.id)
    assert.equal(promotedNode.originProjectPath, project.path)

    recordWrite({
      project: projectRoot,
      filePath: 'src/example.txt',
      prevContent: 'before\n',
      newContent: 'after\n',
      threadId: activeThread.id,
      turnId: 'turn-origin-1',
    })
    const revisions = listRevisions(projectRoot, 'src/example.txt')
    assert.equal(revisions.length, 2)
    assert.deepEqual(revisions[0], {
      ...revisions[0],
      origin_thread_id: activeThread.id,
      origin_thread_title: activeThread.title,
      origin_turn_id: 'turn-origin-1',
      origin_thread_state: 'active',
      origin_thread_deleted_at: null,
    })
    assert.deepEqual(revisions[1], {
      ...revisions[1],
      origin_thread_id: null,
      origin_thread_title: '',
      origin_turn_id: null,
      origin_thread_state: 'active',
      origin_thread_deleted_at: null,
    })

    const descriptor = {
      roleId: 'security_reviewer',
      templateId: 'template_security',
      specialty: 'security',
    }
    for (let index = 0; index < 55; index += 1) {
      writeMemory(projectRoot, descriptor, {
        summary: `Observation ${index}`,
        context: `Context ${index}`,
        taskInstruction: 'Review the project.',
      })
    }

    assert.equal(fs.existsSync(path.join(projectRoot, '.addom', 'agent-memory')), false)
    assert.equal(readMemory(projectRoot, 'security_reviewer').length, 50)
    assert.match(buildMemoryContext(projectRoot, descriptor), /Observation 54/)
    assert.deepEqual(listMemoryRoles(projectRoot), [
      {
        roleId: 'family__template_security',
        entryCount: 50,
        lastUpdated: listMemoryRoles(projectRoot)[0].lastUpdated,
      },
      {
        roleId: 'security_reviewer',
        entryCount: 50,
        lastUpdated: listMemoryRoles(projectRoot)[1].lastUpdated,
      },
      {
        roleId: 'specialty__security',
        entryCount: 50,
        lastUpdated: listMemoryRoles(projectRoot)[2].lastUpdated,
      },
    ])

    db.prepare('DELETE FROM workspace_projects WHERE id = ?').run(project.id)
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM moa_agent_memory').get()?.count || 0), 0)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  } finally {
    try { fs.rmSync(projectRoot, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})
