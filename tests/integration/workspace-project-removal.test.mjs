import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-project-removal-userdata-'))
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-project-removal-fixtures-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb, getDb } = await import('../../src/main/memory/db.mjs')
const { addNode, getNode, promoteNode } = await import('../../src/main/memory/memory-store.mjs')
const { recordWrite } = await import('../../src/main/memory/artifact-store.mjs')
const {
  __resetOpenAIAssetClientFactoryForTests,
  __setOpenAIAssetClientFactoryForTests,
} = await import('../../src/main/api-clients/openai-asset-service.mjs')
const {
  registerProject,
  removeProject,
} = await import('../../src/main/workspace/workspace-store.mjs')

function isNativeDbLoadError(error) {
  const message = String(error?.message || '')
  return String(error?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION|better[-_ ]sqlite3/i.test(message)
}

function createProjectFixture(name) {
  const projectPath = path.join(fixtureRoot, name)
  fs.mkdirSync(path.join(projectPath, '.addom', 'agent-memory'), { recursive: true })
  fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true })
  fs.writeFileSync(path.join(projectPath, 'README.md'), `# ${name}\n`, 'utf8')
  fs.writeFileSync(path.join(projectPath, 'src', 'index.js'), 'export const answer = 42\n', 'utf8')
  fs.writeFileSync(
    path.join(projectPath, '.addom', 'agent-memory', 'legacy.json'),
    JSON.stringify({ summary: 'Legacy project-local memory must stay on disk but remain inert.' }),
    'utf8',
  )
  return projectPath
}

function hashDirectory(rootPath) {
  const hash = crypto.createHash('sha256')
  const visit = (currentPath, relativePath = '') => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const nextRelative = path.posix.join(relativePath, entry.name)
      const nextPath = path.join(currentPath, entry.name)
      hash.update(`${entry.isDirectory() ? 'd' : 'f'}:${nextRelative}\0`)
      if (entry.isDirectory()) visit(nextPath, nextRelative)
      else hash.update(fs.readFileSync(nextPath))
    }
  }
  visit(rootPath)
  return hash.digest('hex')
}

function insertProjectRows({ projectId, projectPath, threadId }) {
  const db = getDb()
  const timestamp = Date.now()
  db.exec(`
    CREATE TABLE IF NOT EXISTS moa_transactions_legacy_backup_v21 (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      turn_id TEXT,
      timestamp INTEGER
    )
  `)
  db.prepare(`
    INSERT INTO moa_transactions_legacy_backup_v21 (id, thread_id, turn_id, timestamp)
    VALUES (?, ?, 'turn_remove', ?)
  `).run(`legacy_${projectId}`, threadId, timestamp)
  db.prepare(`
    INSERT INTO agent_runs (
      id, project_id, thread_id, turn_id, root_node_id, status, contract_json,
      last_run_sequence, recovery_json, created_at, updated_at
    ) VALUES (?, ?, ?, 'turn_remove', ?, 'completed', '{}', 0, '{}', ?, ?)
  `).run(`agent_run_${projectId}`, projectId, threadId, `agent_root_${projectId}`, timestamp, timestamp)
  db.prepare(`
    INSERT INTO chat_events (thread_id, turn_id, kind, role, content, meta_json, created_at)
    VALUES (?, 'turn_remove', 'assistant_message', 'assistant', 'Project-owned transcript', '{}', ?)
  `).run(threadId, timestamp)
  db.prepare(`
    INSERT INTO chat_attachments (
      id, project_id, thread_id, turn_id, kind, media_type, file_name,
      size_bytes, sha256, relative_path, created_at, last_accessed_at
    ) VALUES (?, ?, ?, 'turn_remove', 'file', 'text/plain', 'fixture.txt', 7, 'hash', 'fixture.txt', ?, ?)
  `).run(`attachment_${projectId}`, projectId, threadId, timestamp, timestamp)
  db.prepare(`
    INSERT INTO openai_thread_state (
      thread_id, project_id, provider_id, model, created_at, updated_at, last_used_at
    ) VALUES (?, ?, 'openai', 'gpt-5.4', ?, ?, ?)
  `).run(threadId, projectId, timestamp, timestamp, timestamp)
  db.prepare(`
    INSERT INTO openai_background_jobs (
      id, project_id, thread_id, assistant_message_id, model, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'assistant_remove', 'gpt-5.4', 'queued', ?, ?)
  `).run(`job_${projectId}`, projectId, threadId, timestamp, timestamp)
  db.prepare(`
    INSERT INTO terminal_session_archive (
      id, project, thread_id, turn_id, session_id, opened_at
    ) VALUES (?, ?, ?, 'turn_remove', ?, ?)
  `).run(`terminal_${projectId}`, projectPath, threadId, `session_${projectId}`, timestamp)
  db.prepare(`
    INSERT INTO moa_agent_memory (
      id, entry_id, project_id, scope_key, timestamp, summary, context,
      task_instruction, created_at
    ) VALUES (?, 'entry_remove', ?, 'role__reviewer', ?, 'Agent memory', 'Context', 'Review', ?)
  `).run(`agent_memory_${projectId}`, projectId, String(timestamp), timestamp)
  db.prepare(`
    INSERT INTO continuity_snapshots (
      id, thread_id, turn_id, project, created_at
    ) VALUES (?, ?, 'turn_remove', ?, ?)
  `).run(`snapshot_${projectId}`, threadId, projectPath, timestamp)
  db.prepare(`
    INSERT INTO continuity_facts (
      id, thread_id, project, fact_key, fact_text, source_turn_id,
      created_at, updated_at, last_used_at
    ) VALUES (?, ?, ?, 'remove', 'Project fact', 'turn_remove', ?, ?, ?)
  `).run(`fact_${projectId}`, threadId, projectPath, timestamp, timestamp, timestamp)
  db.prepare(`
    INSERT INTO continuity_invariants (
      id, thread_id, project, invariant_key, invariant_text, source_turn_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'remove', 'Project invariant', 'turn_remove', ?, ?)
  `).run(`invariant_${projectId}`, threadId, projectPath, timestamp, timestamp)
  db.prepare(`
    INSERT INTO thread_continuity_state (thread_id, project, updated_at)
    VALUES (?, ?, ?)
  `).run(threadId, projectPath, timestamp)
  db.prepare(`
    INSERT INTO thread_continuity_turns (id, thread_id, turn_id, project, created_at)
    VALUES (?, ?, 'turn_remove', ?, ?)
  `).run(`continuity_turn_${projectId}`, threadId, projectPath, timestamp)
  db.prepare(`
    INSERT INTO provider_files (
      id, provider_id, project_id, thread_id, file_name, remote_file_id,
      created_at, updated_at, last_used_at
    ) VALUES (?, 'openai', ?, ?, 'remote.txt', ?, ?, ?, ?)
  `).run(`provider_file_${projectId}`, projectId, threadId, `file_${projectId}`, timestamp, timestamp, timestamp)
  db.prepare(`
    INSERT INTO provider_vector_stores (
      id, provider_id, project_id, scope, name, remote_vector_store_id,
      created_at, updated_at, last_used_at
    ) VALUES (?, 'openai', ?, 'project', 'Project store', ?, ?, ?, ?)
  `).run(`provider_store_${projectId}`, projectId, `vs_${projectId}`, timestamp, timestamp, timestamp)
  db.prepare(`
    INSERT INTO provider_vector_store_files (
      id, provider_id, vector_store_record_id, provider_file_record_id,
      remote_vector_store_file_id, created_at, updated_at, last_used_at
    ) VALUES (?, 'openai', ?, ?, ?, ?, ?, ?)
  `).run(
    `provider_link_${projectId}`,
    `provider_store_${projectId}`,
    `provider_file_${projectId}`,
    `vsf_${projectId}`,
    timestamp,
    timestamp,
    timestamp,
  )
}

async function seedProject(name) {
  const projectPath = createProjectFixture(name)
  const opened = registerProject(projectPath)
  const projectId = String(opened.project.id)
  const threadId = String(opened.activeThread.id)
  insertProjectRows({ projectId, projectPath, threadId })
  await addNode({
    project: projectPath,
    scope: 'project',
    topic: 'Project memory',
    content: 'Remove this project-owned memory.',
  })
  const globalSourceId = await addNode({
    project: projectPath,
    scope: 'thread',
    threadId,
    topic: 'Global memory',
    content: 'Preserve this promoted global memory.',
  })
  const globalNode = promoteNode(globalSourceId, { targetScope: 'global' })
  recordWrite({
    project: projectPath,
    filePath: 'src/index.js',
    newContent: 'export const answer = 42\n',
    source: 'ai_write',
    threadId,
    turnId: 'turn_remove',
  })
  return {
    beforeHash: hashDirectory(projectPath),
    globalNodeId: globalNode.id,
    projectId,
    projectPath,
    threadId,
  }
}

function count(db, table, where = '', params = []) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ''}`).get(...params)?.count || 0)
}

function assertProjectStatePresent(seed) {
  const db = getDb()
  assert.equal(count(db, 'workspace_projects', 'id = ?', [seed.projectId]), 1)
  assert.equal(count(db, 'chat_threads', 'project_id = ?', [seed.projectId]), 1)
  assert.equal(count(db, 'provider_files', 'project_id = ?', [seed.projectId]), 1)
  assert.equal(count(db, 'provider_vector_stores', 'project_id = ?', [seed.projectId]), 1)
  assert.equal(count(db, 'artifacts', 'project = ?', [seed.projectPath]) > 0, true)
  assert.equal(count(db, 'nodes', 'project = ? AND scope != ?', [seed.projectPath, 'global']) > 0, true)
}

function assertProjectStateRemoved(seed) {
  const db = getDb()
  const threadParams = [seed.threadId]
  const projectParams = [seed.projectId]
  const pathParams = [seed.projectPath]
  assert.equal(count(db, 'workspace_projects', 'id = ?', projectParams), 0)
  assert.equal(count(db, 'chat_threads', 'project_id = ?', projectParams), 0)
  assert.equal(count(db, 'chat_events', 'thread_id = ?', threadParams), 0)
  assert.equal(count(db, 'chat_attachments', 'project_id = ? OR thread_id = ?', [seed.projectId, seed.threadId]), 0)
  assert.equal(count(db, 'provider_files', 'project_id = ?', projectParams), 0)
  assert.equal(count(db, 'provider_vector_stores', 'project_id = ?', projectParams), 0)
  assert.equal(count(db, 'provider_vector_store_files', 'provider_file_record_id = ?', [`provider_file_${seed.projectId}`]), 0)
  assert.equal(count(db, 'openai_thread_state', 'project_id = ? OR thread_id = ?', [seed.projectId, seed.threadId]), 0)
  assert.equal(count(db, 'openai_background_jobs', 'project_id = ? OR thread_id = ?', [seed.projectId, seed.threadId]), 0)
  assert.equal(count(db, 'nodes', 'project = ? AND scope != ?', [seed.projectPath, 'global']), 0)
  assert.equal(count(db, 'artifacts', 'project = ?', pathParams), 0)
  for (const table of ['continuity_snapshots', 'continuity_facts', 'continuity_invariants', 'thread_continuity_state', 'thread_continuity_turns', 'terminal_session_archive']) {
    assert.equal(count(db, table, 'project = ? OR thread_id = ?', [seed.projectPath, seed.threadId]), 0, `${table} should be purged`)
  }
  assert.equal(count(db, 'moa_agent_memory', 'project_id = ?', projectParams), 0)
  assert.equal(count(db, 'agent_runs', 'project_id = ?', projectParams), 0)
  assert.equal(
    count(db, 'moa_transactions_legacy_backup_v21', 'thread_id = ?', threadParams),
    0,
  )
}

function createRemoteClient({ failFileOnce = false, onDelete = null } = {}) {
  const deleted = { files: new Set(), vectorStores: new Set() }
  let shouldFailFile = failFileOnce
  const notFound = () => Object.assign(new Error('not found'), { status: 404 })
  return {
    deleted,
    client: {
      files: {
        async delete(id) {
          onDelete?.('file', id)
          if (shouldFailFile) {
            shouldFailFile = false
            throw Object.assign(new Error('temporary remote file failure'), { status: 503 })
          }
          if (deleted.files.has(id)) throw notFound()
          deleted.files.add(id)
          return { id, deleted: true }
        },
      },
      vectorStores: {
        async delete(id) {
          onDelete?.('vector_store', id)
          if (deleted.vectorStores.has(id)) throw notFound()
          deleted.vectorStores.add(id)
          return { id, deleted: true }
        },
      },
    },
  }
}

test.beforeEach(() => {
  __resetOpenAIAssetClientFactoryForTests()
})

test.after(() => {
  __resetOpenAIAssetClientFactoryForTests()
  try { closeDb() } catch { /* best-effort cleanup */ }
  try { fs.rmSync(fixtureRoot, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('removeProject deletes remote assets first, purges project state, preserves Global Memory, and never changes project files', async (t) => {
  try {
    const seed = await seedProject('success')
    const db = getDb()
    const remote = createRemoteClient({
      onDelete() {
        assert.equal(count(db, 'workspace_projects', 'id = ?', [seed.projectId]), 1)
      },
    })
    __setOpenAIAssetClientFactoryForTests(() => remote.client)

    const result = await removeProject(seed.projectId)

    assert.equal(result.ok, true)
    assert.deepEqual([...remote.deleted.files], [`file_${seed.projectId}`])
    assert.deepEqual([...remote.deleted.vectorStores], [`vs_${seed.projectId}`])
    assertProjectStateRemoved(seed)
    assert.equal(hashDirectory(seed.projectPath), seed.beforeHash)
    const globalNode = getNode(seed.globalNodeId)
    assert.equal(globalNode.scope, 'global')
    assert.equal(globalNode.originProjectId, null)
    assert.equal(globalNode.originProjectName, 'success')
    assert.equal(globalNode.originProjectPath, seed.projectPath)
    assert.equal(globalNode.originProjectState, 'removed')
    assert.equal(Number(globalNode.originProjectRemovedAt) > 0, true)

    const reopened = registerProject(seed.projectPath)
    assert.notEqual(reopened.project.id, seed.projectId)
    assert.equal(count(db, 'chat_events', 'thread_id = ?', [reopened.activeThread.id]), 0)
    assert.equal(count(db, 'moa_agent_memory', 'project_id = ?', [reopened.project.id]), 0)
    assert.equal(count(db, 'artifacts', 'project = ?', [seed.projectPath]), 0)
    assert.equal(hashDirectory(seed.projectPath), seed.beforeHash)
  } catch (error) {
    if (isNativeDbLoadError(error)) return t.skip('better-sqlite3 native binding is unavailable')
    throw error
  }
})

test('remote partial failure leaves all local state retryable and treats prior remote success as idempotent on retry', async (t) => {
  try {
    const seed = await seedProject('remote-retry')
    const remote = createRemoteClient({ failFileOnce: true })
    __setOpenAIAssetClientFactoryForTests(() => remote.client)

    const failed = await removeProject(seed.projectId)

    assert.equal(failed.ok, false)
    assert.equal(failed.retryable, true)
    assert.equal(failed.errorCode, 'remote_cleanup_failed')
    assert.equal(failed.remoteFailures.length, 1)
    assertProjectStatePresent(seed)
    assert.equal(hashDirectory(seed.projectPath), seed.beforeHash)

    const retried = await removeProject(seed.projectId)
    assert.equal(retried.ok, true)
    assertProjectStateRemoved(seed)
    assert.equal(hashDirectory(seed.projectPath), seed.beforeHash)
  } catch (error) {
    if (isNativeDbLoadError(error)) return t.skip('better-sqlite3 native binding is unavailable')
    throw error
  }
})

test('local transaction failure rolls back every project-owned database change', async (t) => {
  try {
    const seed = await seedProject('local-rollback')
    const remote = createRemoteClient()
    __setOpenAIAssetClientFactoryForTests(() => remote.client)
    const db = getDb()
    db.exec(`
      CREATE TRIGGER fail_project_removal
      BEFORE DELETE ON workspace_projects
      WHEN OLD.id = '${seed.projectId}'
      BEGIN
        SELECT RAISE(ABORT, 'forced project removal rollback');
      END;
    `)

    const failed = await removeProject(seed.projectId)

    assert.equal(failed.ok, false)
    assert.equal(failed.retryable, true)
    assert.equal(failed.errorCode, 'local_cleanup_failed')
    assertProjectStatePresent(seed)
    assert.equal(getNode(seed.globalNodeId).originProjectState, 'active')
    assert.equal(hashDirectory(seed.projectPath), seed.beforeHash)
    db.exec('DROP TRIGGER fail_project_removal')

    const retried = await removeProject(seed.projectId)
    assert.equal(retried.ok, true)
    assertProjectStateRemoved(seed)
  } catch (error) {
    if (isNativeDbLoadError(error)) return t.skip('better-sqlite3 native binding is unavailable')
    throw error
  }
})
