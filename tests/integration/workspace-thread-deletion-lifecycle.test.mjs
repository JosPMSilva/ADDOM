import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-thread-delete-data-'))
const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-thread-delete-project-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb, getDb } = await import('../../src/main/memory/db.mjs')
const { addNode } = await import('../../src/main/memory/memory-store.mjs')
const { recordWrite } = await import('../../src/main/memory/artifact-store.mjs')
const { archiveTerminalSession } = await import('../../src/main/terminal/terminal-session-archive-store.mjs')
const { persistThreadContinuityTurn } = await import('../../src/main/chat/continuity/continuity-store.mjs')
const { upsertOpenAIThreadState } = await import('../../src/main/api-clients/openai-thread-state-service.mjs')
const { upsertOpenAIBackgroundJob } = await import('../../src/main/api-clients/openai-background-job-store.mjs')
const {
  appendEvents,
  createThread,
  deleteThread,
  registerProject,
} = await import('../../src/main/workspace/workspace-store.mjs')

function count(sql, ...params) {
  return Number(getDb().prepare(sql).get(...params)?.count || 0)
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function seedThreadOwnedRows({ projectId, threadId, suffix }) {
  const db = getDb()
  const timestamp = Date.now()
  const turnId = `turn_${suffix}`

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
    VALUES (?, ?, ?, ?)
  `).run(`legacy_${suffix}`, threadId, turnId, timestamp)
  db.prepare(`
    INSERT INTO agent_runs (
      id, project_id, thread_id, turn_id, root_node_id, status, contract_json,
      last_run_sequence, recovery_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'completed', '{}', 0, '{}', ?, ?)
  `).run(
    `agent_run_${suffix}`,
    projectId,
    threadId,
    turnId,
    `agent_root_${suffix}`,
    timestamp,
    timestamp,
  )

  persistThreadContinuityTurn({
    threadId,
    turnId,
    project: projectPath,
    userMessage: `Question ${suffix}`,
    assistantText: `Answer ${suffix}`,
    toolResults: [],
  })
  archiveTerminalSession({
    id: `archive_${suffix}`,
    sessionId: `session_${suffix}`,
    project: projectPath,
    threadId,
    turnId,
    cwd: projectPath,
    shell: 'powershell.exe',
    shellKind: 'powershell',
    openedAt: timestamp - 10,
    closedAt: timestamp,
    closeReason: 'close_after_exit',
    outputTail: [{ sequence: 1, at: timestamp, data: suffix }],
  })
  upsertOpenAIThreadState({ threadId, projectId, model: 'gpt-5.4' })
  upsertOpenAIBackgroundJob({
    id: `job_${suffix}`,
    projectId,
    threadId,
    model: 'gpt-5.4',
    status: 'queued',
  })
  db.prepare(`
    INSERT INTO chat_attachments (
      id, project_id, thread_id, turn_id, kind, media_type, file_name,
      size_bytes, sha256, relative_path, created_at, last_accessed_at
    ) VALUES (?, ?, ?, ?, 'file', 'text/plain', ?, 4, ?, ?, ?, ?)
  `).run(
    `attachment_${suffix}`,
    projectId,
    threadId,
    turnId,
    `${suffix}.txt`,
    `hash_${suffix}`,
    `projects/${projectId}/threads/${threadId}/${suffix}.txt`,
    timestamp,
    timestamp,
  )
  db.prepare(`
    INSERT INTO provider_files (
      id, provider_id, project_id, thread_id, attachment_id, local_path,
      sha256, file_name, mime_type, size_bytes, created_at, updated_at, last_used_at
    ) VALUES (?, 'openai', ?, ?, ?, ?, ?, ?, 'text/plain', 4, ?, ?, ?)
  `).run(
    `provider_file_${suffix}`,
    projectId,
    threadId,
    `attachment_${suffix}`,
    path.join(projectPath, `${suffix}.txt`),
    `hash_${suffix}`,
    `${suffix}.txt`,
    timestamp,
    timestamp,
    timestamp,
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort cleanup */ }
  fs.rmSync(projectPath, { recursive: true, force: true })
  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('deleteThread removes only thread-owned state and preserves recovery provenance and project files', async () => {
  const sentinelPath = path.join(projectPath, 'user-owned.txt')
  fs.writeFileSync(sentinelPath, 'This file must survive thread deletion.\n')
  const sentinelHash = hashFile(sentinelPath)

  const opened = registerProject(projectPath)
  const projectId = opened.project.id
  const deletedThreadId = opened.activeThread.id
  const deletedThreadTitle = 'Lifecycle source thread'
  getDb().prepare('UPDATE chat_threads SET title = ? WHERE id = ?')
    .run(deletedThreadTitle, deletedThreadId)
  const survivingThread = createThread(projectId, 'Surviving thread').thread

  appendEvents(deletedThreadId, [{
    turnId: 'turn_deleted',
    kind: 'user_message',
    role: 'user',
    content: 'Delete this transcript only.',
  }])
  appendEvents(survivingThread.id, [{
    turnId: 'turn_surviving',
    kind: 'user_message',
    role: 'user',
    content: 'Keep this transcript.',
  }])
  seedThreadOwnedRows({ projectId, threadId: deletedThreadId, suffix: 'deleted' })
  seedThreadOwnedRows({ projectId, threadId: survivingThread.id, suffix: 'surviving' })

  const memoryIds = await Promise.all([
    addNode({
      project: projectPath,
      scope: 'thread',
      threadId: deletedThreadId,
      topic: 'Thread memory',
      content: 'Preserve but archive this memory.',
    }),
    addNode({
      project: projectPath,
      scope: 'project',
      originThreadId: deletedThreadId,
      topic: 'Project memory',
      content: 'Keep this project memory active.',
    }),
    addNode({
      project: projectPath,
      scope: 'global',
      originThreadId: deletedThreadId,
      topic: 'Global memory',
      content: 'Keep this global memory active.',
    }),
  ])
  const artifact = recordWrite({
    project: projectPath,
    filePath: 'user-owned.txt',
    newContent: fs.readFileSync(sentinelPath, 'utf8'),
    threadId: deletedThreadId,
    turnId: 'turn_deleted',
  })

  const result = await deleteThread(deletedThreadId)

  assert.equal(result.ok, true)
  assert.equal(result.activeThread.id, survivingThread.id)
  assert.equal(count('SELECT COUNT(*) AS count FROM chat_threads WHERE id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM chat_events WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM chat_attachments WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM openai_thread_state WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM openai_background_jobs WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM continuity_snapshots WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM continuity_facts WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM continuity_invariants WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM thread_continuity_state WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM thread_continuity_turns WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM terminal_session_archive WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(count('SELECT COUNT(*) AS count FROM agent_runs WHERE thread_id = ?', deletedThreadId), 0)
  assert.equal(
    count('SELECT COUNT(*) AS count FROM moa_transactions_legacy_backup_v21 WHERE thread_id = ?', deletedThreadId),
    0,
  )

  const providerFile = getDb().prepare('SELECT thread_id, attachment_id FROM provider_files WHERE id = ?')
    .get('provider_file_deleted')
  assert.deepEqual(providerFile, { thread_id: '', attachment_id: '' })

  const preservedMemory = getDb().prepare(`
    SELECT id, scope, origin_thread_title, origin_thread_state, origin_thread_deleted_at,
           compressed, invalidated_at
    FROM nodes
    WHERE id IN (?, ?, ?)
    ORDER BY scope
  `).all(...memoryIds)
  assert.equal(preservedMemory.length, 3)
  for (const node of preservedMemory) {
    assert.equal(node.origin_thread_title, deletedThreadTitle)
    assert.equal(node.origin_thread_state, 'deleted')
    assert.ok(Number(node.origin_thread_deleted_at) > 0)
    assert.equal(Number(node.compressed), 0)
    assert.equal(node.invalidated_at, null)
  }
  assert.equal(new Set(preservedMemory.map((node) => node.origin_thread_deleted_at)).size, 1)

  const preservedArtifact = getDb().prepare(`
    SELECT origin_thread_title, origin_thread_state, origin_thread_deleted_at
    FROM artifacts
    WHERE id = ?
  `).get(artifact.newRevId)
  assert.equal(preservedArtifact.origin_thread_title, deletedThreadTitle)
  assert.equal(preservedArtifact.origin_thread_state, 'deleted')
  assert.equal(preservedArtifact.origin_thread_deleted_at, preservedMemory[0].origin_thread_deleted_at)

  assert.equal(count('SELECT COUNT(*) AS count FROM chat_threads WHERE id = ?', survivingThread.id), 1)
  assert.equal(count('SELECT COUNT(*) AS count FROM chat_events WHERE thread_id = ?', survivingThread.id), 1)
  assert.equal(count('SELECT COUNT(*) AS count FROM openai_background_jobs WHERE thread_id = ?', survivingThread.id), 1)
  assert.equal(count('SELECT COUNT(*) AS count FROM agent_runs WHERE thread_id = ?', survivingThread.id), 1)
  assert.equal(
    count('SELECT COUNT(*) AS count FROM moa_transactions_legacy_backup_v21 WHERE thread_id = ?', survivingThread.id),
    1,
  )
  assert.equal(hashFile(sentinelPath), sentinelHash)
})
