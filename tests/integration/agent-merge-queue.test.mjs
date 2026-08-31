import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

import { insertAgentWorkspaceOwnership } from '../helpers/agent-workspace-fixtures.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentMergeQueue } from '../../src/main/agents/workspaces/agent-merge-queue.mjs'

function digest(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function insertWorkspace(db, {
  workspaceId = 'workspace_01',
  runId = 'run_01',
  nodeId = 'node_01',
  attemptId = 'attempt_01',
  projectId = 'project_01',
  projectRoot,
  workspaceRoot,
  mode = 'local_overlay',
  status = 'reviewable',
}) {
  const now = 1_752_600_000_000
  insertAgentWorkspaceOwnership(db, {
    projectId,
    threadId: `thread_${runId}`,
    runId,
    nodeId,
    attemptId,
    projectRoot,
    workspaceId,
    workspaceMode: mode,
    now,
  })
  db.prepare(`
    INSERT INTO agent_workspaces (
      id, run_id, node_id, attempt_id, project_id, mode, status, source_root,
      workspace_root, project_view_root, base_revision, lease_expires_at,
      ownership_json, recovery_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?)
  `).run(
    workspaceId,
    runId,
    nodeId,
    attemptId,
    projectId,
    mode,
    status,
    projectRoot,
    workspaceRoot,
    workspaceRoot,
    'snapshot:base',
    now + 60_000,
    now,
    now,
  )
}

function artifact({
  id,
  path: filePath,
  content,
  baseContent,
  dependencies = [],
  operationType = 'write_file',
  originalPath = null,
  workspaceMode = 'local_overlay',
  provenance = null,
  metadata = null,
}) {
  return {
    schemaVersion: 1,
    id,
    runId: 'run_01',
    nodeId: 'node_01',
    attemptId: 'attempt_01',
    workspaceId: 'workspace_01',
    workspaceMode,
    baseRevision: 'snapshot:base',
    baseContentDigest: digest(baseContent),
    kind: 'file_patch',
    operationType,
    path: filePath,
    originalPath,
    digest: digest(content),
    sizeBytes: Buffer.byteLength(content),
    dependencies,
    provenance: provenance || {
      origin: 'local_workspace',
      verifiedLocalImport: false,
      providerArtifactId: null,
    },
    createdAt: 1_752_600_000_000,
    metadata: metadata || { content },
  }
}

function createDirectoryLink(target, linkPath) {
  fs.symlinkSync(
    target,
    linkPath,
    process.platform === 'win32' ? 'junction' : 'dir',
  )
}

function insertArtifact(db, value, status = 'staged') {
  db.prepare(`
    INSERT INTO agent_artifact_projections (
      artifact_id, run_id, node_id, attempt_id, status, projection_json,
      updated_sequence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    value.id,
    value.runId,
    value.nodeId,
    value.attemptId,
    status,
    JSON.stringify(value),
    value.createdAt,
    value.createdAt,
  )
}

test('merge queue applies dependency-ordered artifacts and never changes unrelated project files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-merge-'))
  const projectRoot = path.join(root, 'project')
  const otherProjectRoot = path.join(root, 'other-project')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(otherProjectRoot)
  fs.mkdirSync(workspaceRoot)
  fs.writeFileSync(path.join(projectRoot, 'app.txt'), 'base\n', 'utf8')
  fs.writeFileSync(path.join(otherProjectRoot, 'app.txt'), 'other\n', 'utf8')
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, { projectRoot, workspaceRoot })
    const first = artifact({
      id: 'artifact_01',
      path: 'app.txt',
      content: 'first\n',
      baseContent: 'base\n',
    })
    const second = artifact({
      id: 'artifact_02',
      path: 'app.txt',
      content: 'second\n',
      baseContent: 'first\n',
      dependencies: ['artifact_01'],
    })
    insertArtifact(db, first)
    insertArtifact(db, second)
    db.prepare("UPDATE agent_runs SET status = 'completed' WHERE id = 'run_01'").run()
    const eventStore = createAgentEventStore(db)
    const queue = createAgentMergeQueue({
      db,
      eventStore,
      now: () => 1_752_600_000_100,
    })

    const secondEntry = queue.enqueue({
      runId: 'run_01',
      artifactId: 'artifact_02',
      operation: 'apply',
    })
    const firstEntry = queue.enqueue({
      runId: 'run_01',
      artifactId: 'artifact_01',
      operation: 'apply',
    })
    assert.equal(queue.get(secondEntry.id).status, 'blocked')
    assert.equal((await queue.processNext()).entry.id, firstEntry.id)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'app.txt'), 'utf8'), 'first\n')
    assert.equal((await queue.processNext()).entry.id, secondEntry.id)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'app.txt'), 'utf8'), 'second\n')
    assert.equal(fs.readFileSync(path.join(otherProjectRoot, 'app.txt'), 'utf8'), 'other\n')
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count FROM agent_events
        WHERE kind IN ('agent_merge_requested', 'agent_merge_completed')
      `).get().count,
      4,
    )
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('conflicting sibling artifacts stay reviewable and discard never mutates disk', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-conflict-'))
  const projectRoot = path.join(root, 'project')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(workspaceRoot)
  fs.writeFileSync(path.join(projectRoot, 'app.txt'), 'user-change\n', 'utf8')
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, { projectRoot, workspaceRoot })
    const conflicting = artifact({
      id: 'artifact_conflict',
      path: 'app.txt',
      content: 'agent-change\n',
      baseContent: 'base\n',
    })
    const discarded = artifact({
      id: 'artifact_discard',
      path: 'discard.txt',
      content: 'never-written\n',
      baseContent: '',
    })
    insertArtifact(db, conflicting)
    insertArtifact(db, discarded)
    const queue = createAgentMergeQueue({ db })
    queue.enqueue({ runId: 'run_01', artifactId: conflicting.id, operation: 'apply' })
    const conflict = await queue.processNext()
    assert.equal(conflict.entry.status, 'conflicted')
    assert.equal(conflict.conflict.reason, 'base_content_changed')
    assert.equal(fs.readFileSync(path.join(projectRoot, 'app.txt'), 'utf8'), 'user-change\n')
    assert.equal(JSON.parse(db.prepare(`
      SELECT projection_json FROM agent_artifact_projections WHERE artifact_id = ?
    `).get(conflicting.id).projection_json).conflict.reason, 'base_content_changed')

    queue.enqueue({ runId: 'run_01', artifactId: discarded.id, operation: 'discard' })
    const result = await queue.processNext()
    assert.equal(result.entry.status, 'discarded')
    assert.equal(fs.existsSync(path.join(projectRoot, 'discard.txt')), false)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('merge queue validates move sources and refuses to overwrite an occupied target', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-move-'))
  const projectRoot = path.join(root, 'project')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(workspaceRoot)
  fs.writeFileSync(path.join(projectRoot, 'original.txt'), 'base\n', 'utf8')
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, { projectRoot, workspaceRoot })
    const moved = artifact({
      id: 'artifact_move',
      path: 'moved.txt',
      originalPath: 'original.txt',
      operationType: 'move_file',
      content: 'base\n',
      baseContent: 'base\n',
    })
    insertArtifact(db, moved)
    const queue = createAgentMergeQueue({ db })
    queue.enqueue({ runId: 'run_01', artifactId: moved.id, operation: 'apply' })
    const applied = await queue.processNext()

    assert.equal(applied.entry.status, 'applied')
    assert.equal(fs.existsSync(path.join(projectRoot, 'original.txt')), false)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'moved.txt'), 'utf8'), 'base\n')

    const blocked = artifact({
      id: 'artifact_move_blocked',
      path: 'occupied.txt',
      originalPath: 'moved.txt',
      operationType: 'move_file',
      content: 'base\n',
      baseContent: 'base\n',
    })
    fs.writeFileSync(path.join(projectRoot, 'occupied.txt'), 'user file\n', 'utf8')
    insertArtifact(db, blocked)
    queue.enqueue({ runId: 'run_01', artifactId: blocked.id, operation: 'apply' })
    const conflict = await queue.processNext()

    assert.equal(conflict.entry.status, 'conflicted')
    assert.equal(conflict.conflict.reason, 'move_target_occupied')
    assert.equal(fs.readFileSync(path.join(projectRoot, 'moved.txt'), 'utf8'), 'base\n')
    assert.equal(fs.readFileSync(path.join(projectRoot, 'occupied.txt'), 'utf8'), 'user file\n')
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('remote and opaque artifacts require an explicit verified local import before enqueue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-remote-artifact-'))
  const projectRoot = path.join(root, 'project')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(workspaceRoot)
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, {
      projectRoot,
      workspaceRoot,
      mode: 'remote_provider_workspace',
    })
    const unverified = artifact({
      id: 'artifact_remote',
      path: 'remote.txt',
      content: 'remote\n',
      baseContent: '',
      workspaceMode: 'remote_provider_workspace',
      provenance: {
        origin: 'provider_reference',
        verifiedLocalImport: false,
        providerArtifactId: 'provider-artifact-1',
      },
    })
    insertArtifact(db, unverified)
    const queue = createAgentMergeQueue({ db })
    assert.throws(
      () => queue.enqueue({
        runId: 'run_01',
        artifactId: unverified.id,
        operation: 'apply',
      }),
      /verified local import/i,
    )

    const verified = {
      ...unverified,
      id: 'artifact_imported',
      provenance: {
        ...unverified.provenance,
        verifiedLocalImport: true,
        importedAt: 1_752_600_000_100,
        importDigest: unverified.digest,
      },
    }
    insertArtifact(db, verified)
    assert.equal(queue.enqueue({
      runId: 'run_01',
      artifactId: verified.id,
      operation: 'apply',
    }).status, 'queued')
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('merge queue fails closed when a write target traverses a project junction', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-merge-junction-'))
  const projectRoot = path.join(root, 'project')
  const workspaceRoot = path.join(root, 'workspace')
  const outsideRoot = path.join(root, 'outside')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(workspaceRoot)
  fs.mkdirSync(outsideRoot)
  createDirectoryLink(outsideRoot, path.join(projectRoot, 'escape'))
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, { projectRoot, workspaceRoot })
    const escaped = artifact({
      id: 'artifact_escape_write',
      path: 'escape/owned.txt',
      content: 'outside write\n',
      baseContent: '',
    })
    insertArtifact(db, escaped)
    const queue = createAgentMergeQueue({ db })
    queue.enqueue({ runId: 'run_01', artifactId: escaped.id, operation: 'apply' })

    const result = await queue.processNext()

    assert.equal(result.entry.status, 'failed')
    assert.equal(result.error.reason, 'path_boundary_violation')
    assert.equal(fs.existsSync(path.join(outsideRoot, 'owned.txt')), false)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('merge queue does not read or remove a move source through a project junction', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-move-junction-'))
  const projectRoot = path.join(root, 'project')
  const workspaceRoot = path.join(root, 'workspace')
  const outsideRoot = path.join(root, 'outside')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(workspaceRoot)
  fs.mkdirSync(outsideRoot)
  fs.writeFileSync(path.join(outsideRoot, 'source.txt'), 'outside source\n', 'utf8')
  createDirectoryLink(outsideRoot, path.join(projectRoot, 'escape'))
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, { projectRoot, workspaceRoot })
    const escaped = artifact({
      id: 'artifact_escape_move',
      path: 'moved.txt',
      originalPath: 'escape/source.txt',
      operationType: 'move_file',
      content: 'outside source\n',
      baseContent: 'outside source\n',
    })
    insertArtifact(db, escaped)
    const queue = createAgentMergeQueue({ db })
    queue.enqueue({ runId: 'run_01', artifactId: escaped.id, operation: 'apply' })

    const result = await queue.processNext()

    assert.equal(result.entry.status, 'failed')
    assert.equal(result.error.reason, 'path_boundary_violation')
    assert.equal(
      fs.readFileSync(path.join(outsideRoot, 'source.txt'), 'utf8'),
      'outside source\n',
    )
    assert.equal(fs.existsSync(path.join(projectRoot, 'moved.txt')), false)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('merge queue rejects retained artifact content reached through a workspace junction', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-content-junction-'))
  const projectRoot = path.join(root, 'project')
  const workspaceRoot = path.join(root, 'workspace')
  const outsideRoot = path.join(root, 'outside')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(workspaceRoot)
  fs.mkdirSync(outsideRoot)
  fs.writeFileSync(path.join(outsideRoot, 'payload.txt'), 'outside payload\n', 'utf8')
  createDirectoryLink(outsideRoot, path.join(workspaceRoot, 'escape'))
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, { projectRoot, workspaceRoot })
    const escaped = artifact({
      id: 'artifact_escape_content',
      path: 'imported.txt',
      content: 'outside payload\n',
      baseContent: '',
      metadata: { contentPath: 'escape/payload.txt' },
    })
    insertArtifact(db, escaped)
    const queue = createAgentMergeQueue({ db })
    queue.enqueue({ runId: 'run_01', artifactId: escaped.id, operation: 'apply' })

    const result = await queue.processNext()

    assert.equal(result.entry.status, 'failed')
    assert.equal(result.error.reason, 'path_boundary_violation')
    assert.equal(fs.existsSync(path.join(projectRoot, 'imported.txt')), false)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('merge queue recognizes an already-written target after an interrupted apply', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-merge-recover-write-'))
  const projectRoot = path.join(root, 'project')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(workspaceRoot)
  fs.writeFileSync(path.join(projectRoot, 'app.txt'), 'base\n', 'utf8')
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, { projectRoot, workspaceRoot })
    const changed = artifact({
      id: 'artifact_recover_write',
      path: 'app.txt',
      content: 'agent change\n',
      baseContent: 'base\n',
    })
    insertArtifact(db, changed)
    const crashingQueue = createAgentMergeQueue({
      db,
      operationCheckpoint({ checkpoint }) {
        if (checkpoint === 'after_target_mutation') {
          throw new Error('simulated process interruption')
        }
      },
    })
    crashingQueue.enqueue({
      runId: 'run_01',
      artifactId: changed.id,
      operation: 'apply',
    })

    await assert.rejects(
      crashingQueue.processNext(),
      /simulated process interruption/,
    )
    assert.equal(crashingQueue.list()[0].status, 'applying')
    assert.equal(
      db.prepare('SELECT phase FROM agent_merge_operations').get().phase,
      'prepared',
    )
    assert.equal(
      fs.readFileSync(path.join(projectRoot, 'app.txt'), 'utf8'),
      'agent change\n',
    )

    const recoveredResults = await createAgentMergeQueue({ db }).recoverInterrupted()
    const [recovered] = recoveredResults

    assert.equal(recovered.entry.status, 'applied')
    assert.equal(recovered.decision.recovered, true)
    assert.equal(
      db.prepare('SELECT phase FROM agent_merge_operations').get().phase,
      'completed',
    )
    assert.equal(
      fs.readFileSync(path.join(projectRoot, 'app.txt'), 'utf8'),
      'agent change\n',
    )
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('merge queue resumes an interrupted move without overwriting or duplicating content', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-merge-recover-move-'))
  const projectRoot = path.join(root, 'project')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(workspaceRoot)
  fs.writeFileSync(path.join(projectRoot, 'original.txt'), 'base\n', 'utf8')
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, { projectRoot, workspaceRoot })
    const moved = artifact({
      id: 'artifact_recover_move',
      path: 'moved.txt',
      originalPath: 'original.txt',
      operationType: 'move_file',
      content: 'base\n',
      baseContent: 'base\n',
    })
    insertArtifact(db, moved)
    const crashingQueue = createAgentMergeQueue({
      db,
      operationCheckpoint({ checkpoint }) {
        if (checkpoint === 'after_target_mutation') {
          throw new Error('simulated move interruption')
        }
      },
    })
    crashingQueue.enqueue({
      runId: 'run_01',
      artifactId: moved.id,
      operation: 'apply',
    })

    await assert.rejects(crashingQueue.processNext(), /simulated move interruption/)
    assert.equal(fs.existsSync(path.join(projectRoot, 'original.txt')), true)
    assert.equal(fs.existsSync(path.join(projectRoot, 'moved.txt')), true)

    const [recovered] = await createAgentMergeQueue({ db }).recoverInterrupted()

    assert.equal(recovered.entry.status, 'applied')
    assert.equal(recovered.decision.recovered, true)
    assert.equal(fs.existsSync(path.join(projectRoot, 'original.txt')), false)
    assert.equal(
      fs.readFileSync(path.join(projectRoot, 'moved.txt'), 'utf8'),
      'base\n',
    )
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('merge recovery reports external divergence instead of overwriting it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-merge-diverged-'))
  const projectRoot = path.join(root, 'project')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(workspaceRoot)
  fs.writeFileSync(path.join(projectRoot, 'app.txt'), 'base\n', 'utf8')
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    insertWorkspace(db, { projectRoot, workspaceRoot })
    const changed = artifact({
      id: 'artifact_recover_diverged',
      path: 'app.txt',
      content: 'agent change\n',
      baseContent: 'base\n',
    })
    insertArtifact(db, changed)
    const crashingQueue = createAgentMergeQueue({
      db,
      operationCheckpoint({ checkpoint }) {
        if (checkpoint === 'after_target_mutation') {
          throw new Error('simulated divergence window')
        }
      },
    })
    crashingQueue.enqueue({
      runId: 'run_01',
      artifactId: changed.id,
      operation: 'apply',
    })
    await assert.rejects(crashingQueue.processNext(), /simulated divergence window/)
    fs.writeFileSync(path.join(projectRoot, 'app.txt'), 'user follow-up\n', 'utf8')

    const [recovered] = await createAgentMergeQueue({ db }).recoverInterrupted()

    assert.equal(recovered.entry.status, 'conflicted')
    assert.equal(recovered.conflict.reason, 'merge_recovery_diverged')
    assert.equal(
      fs.readFileSync(path.join(projectRoot, 'app.txt'), 'utf8'),
      'user follow-up\n',
    )
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
