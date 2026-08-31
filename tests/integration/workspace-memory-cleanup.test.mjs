import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-workspace-memory-cleanup-'))
const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-workspace-memory-project-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb, getDb } = await import('../../src/main/memory/db.mjs')
const { addNode, buildContextBlock } = await import('../../src/main/memory/memory-store.mjs')
const { recordWrite } = await import('../../src/main/memory/artifact-store.mjs')
const { archiveTerminalSession } = await import('../../src/main/terminal/terminal-session-archive-store.mjs')
const { persistThreadContinuityTurn } = await import('../../src/main/chat/continuity/continuity-store.mjs')
const { upsertOpenAIThreadState } = await import('../../src/main/api-clients/openai-thread-state-service.mjs')
const { upsertOpenAIBackgroundJob } = await import('../../src/main/api-clients/openai-background-job-store.mjs')
const {
  clearAllWorkspaceData,
  removeProject,
  registerProject,
} = await import('../../src/main/workspace/workspace-store.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

function seedProjectScopedDatabaseRows({ projectId = '', projectPath = '', threadId = '' } = {}) {
  const db = getDb()
  const turnId = `turn_${Date.now()}`
  const createdAt = Date.now()

  persistThreadContinuityTurn({
    threadId,
    turnId,
    project: projectPath,
    userMessage: 'Remember the current rollout plan.',
    assistantText: 'Implemented the fix and left one follow-up open.',
    toolResults: [],
  })

  db.prepare(`
    INSERT INTO continuity_snapshots (
      id, thread_id, turn_id, project, profile, scope, token_budget, packet_tokens,
      packet_json, quality_meta_json, provider_native_meta_json, created_at
    ) VALUES (?, ?, ?, ?, 'balanced', 'thread_project', 128, 64, '{}', '{}', '{}', ?)
  `).run(`continuity_snapshot_${createdAt}`, threadId, turnId, projectPath, createdAt)

  db.prepare(`
    INSERT INTO continuity_facts (
      id, thread_id, project, fact_type, fact_key, fact_text, source_turn_id, source_ref,
      confidence, status, created_at, updated_at, last_used_at, metadata_json
    ) VALUES (?, ?, ?, 'decision', ?, 'Project scoped decision', ?, 'test', 0.9, 'active', ?, ?, ?, '{}')
  `).run(`continuity_fact_${createdAt}`, threadId, projectPath, `fact_key_${createdAt}`, turnId, createdAt, createdAt, createdAt)

  db.prepare(`
    INSERT INTO continuity_invariants (
      id, thread_id, project, invariant_type, invariant_key, invariant_text, status,
      confidence, source_turn_id, created_at, updated_at, metadata_json
    ) VALUES (?, ?, ?, 'goal', ?, 'Project scoped invariant', 'active', 0.9, ?, ?, ?, '{}')
  `).run(`continuity_invariant_${createdAt}`, threadId, projectPath, `invariant_key_${createdAt}`, turnId, createdAt, createdAt)

  archiveTerminalSession({
    id: `terminal_archive_${createdAt}`,
    sessionId: `session_${createdAt}`,
    project: projectPath,
    threadId,
    turnId,
    cwd: projectPath,
    shell: 'powershell.exe',
    shellKind: 'powershell',
    sessionTitle: 'Cleanup test terminal',
    closeReason: 'close_after_exit',
    openedAt: createdAt - 100,
    closedAt: createdAt,
    outputTail: [{ sequence: 1, at: createdAt, data: 'terminal output' }],
  })

  recordWrite({
    project: projectPath,
    filePath: 'src/example.js',
    newContent: 'console.log("cleanup");',
    source: 'ai_write',
  })

  upsertOpenAIThreadState({
    threadId,
    projectId,
    model: 'gpt-5.4',
    lastResponseId: `response_${createdAt}`,
  })

  upsertOpenAIBackgroundJob({
    id: `bg_job_${createdAt}`,
    projectId,
    threadId,
    assistantMessageId: `assistant_${createdAt}`,
    model: 'gpt-5.4',
    status: 'queued',
    remoteResponseId: `remote_${createdAt}`,
  })
}

function collectProjectScopedCounts({ projectId = '', projectPath = '', threadId = '' } = {}) {
  const db = getDb()
  const count = (sql, ...params) => Number(db.prepare(sql).get(...params)?.c || 0)
  return {
    nodes: count('SELECT COUNT(*) AS c FROM nodes WHERE project = ?', projectPath),
    artifacts: count('SELECT COUNT(*) AS c FROM artifacts WHERE project = ?', projectPath),
    continuitySnapshots: count('SELECT COUNT(*) AS c FROM continuity_snapshots WHERE project = ? OR thread_id = ?', projectPath, threadId),
    continuityFacts: count('SELECT COUNT(*) AS c FROM continuity_facts WHERE project = ? OR thread_id = ?', projectPath, threadId),
    continuityInvariants: count('SELECT COUNT(*) AS c FROM continuity_invariants WHERE project = ? OR thread_id = ?', projectPath, threadId),
    threadContinuityState: count('SELECT COUNT(*) AS c FROM thread_continuity_state WHERE project = ? OR thread_id = ?', projectPath, threadId),
    threadContinuityTurns: count('SELECT COUNT(*) AS c FROM thread_continuity_turns WHERE project = ? OR thread_id = ?', projectPath, threadId),
    terminalArchive: count('SELECT COUNT(*) AS c FROM terminal_session_archive WHERE project = ? OR thread_id = ?', projectPath, threadId),
    openAIThreadState: count('SELECT COUNT(*) AS c FROM openai_thread_state WHERE project_id = ? OR thread_id = ?', projectId, threadId),
    openAIBackgroundJobs: count('SELECT COUNT(*) AS c FROM openai_background_jobs WHERE project_id = ? OR thread_id = ?', projectId, threadId),
  }
}

function assertZeroProjectScopedCounts(counts = {}) {
  for (const [key, value] of Object.entries(counts)) {
    assert.equal(Number(value || 0), 0, `${key} should be fully purged`)
  }
}

test.after(() => {
  try { closeDb() } catch { /* best-effort cleanup */ }
  try { fs.rmSync(projectPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('removeProject clears project-scoped memory nodes for the removed path', async (t) => {
  try {
    const scopedProjectPath = path.join(projectPath, 'delete-project')
    fs.mkdirSync(scopedProjectPath, { recursive: true })
    const opened = registerProject(scopedProjectPath)
    const projectId = String(opened?.project?.id || '').trim()
    const threadId = String(opened?.activeThread?.id || '').trim()
    assert.ok(projectId)
    assert.ok(threadId)

    await addNode({
      project: scopedProjectPath,
      topic: 'Old memory',
      content: 'This should not survive deleting the workspace project.',
      source: 'assistant',
    })
    seedProjectScopedDatabaseRows({ projectId, projectPath: scopedProjectPath, threadId })
    const seededCounts = collectProjectScopedCounts({ projectId, projectPath: scopedProjectPath, threadId })
    assert.ok(Object.values(seededCounts).every((value) => Number(value) > 0))
    assert.match(await buildContextBlock(scopedProjectPath, 'old memory', 8), /Old memory/)

    await removeProject(projectId)

    assert.equal(await buildContextBlock(scopedProjectPath, 'old memory', 8), '')
    assertZeroProjectScopedCounts(collectProjectScopedCounts({ projectId, projectPath: scopedProjectPath, threadId }))
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('clearAllWorkspaceData clears all project-scoped memory nodes', async (t) => {
  try {
    const scopedProjectPath = path.join(projectPath, 'clear-all')
    fs.mkdirSync(scopedProjectPath, { recursive: true })
    const opened = registerProject(scopedProjectPath)
    const projectId = String(opened?.project?.id || '').trim()
    const threadId = String(opened?.activeThread?.id || '').trim()
    assert.ok(projectId)
    assert.ok(threadId)
    await addNode({
      project: scopedProjectPath,
      topic: 'Global reset memory',
      content: 'This should not survive a full workspace reset.',
      source: 'assistant',
    })
    seedProjectScopedDatabaseRows({ projectId, projectPath: scopedProjectPath, threadId })
    const seededCounts = collectProjectScopedCounts({ projectId, projectPath: scopedProjectPath, threadId })
    assert.ok(Object.values(seededCounts).every((value) => Number(value) > 0))
    assert.match(await buildContextBlock(scopedProjectPath, 'global reset memory', 8), /Global reset memory/)

    await clearAllWorkspaceData()

    assert.equal(await buildContextBlock(scopedProjectPath, 'global reset memory', 8), '')
    assertZeroProjectScopedCounts(collectProjectScopedCounts({ projectId, projectPath: scopedProjectPath, threadId }))
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})
