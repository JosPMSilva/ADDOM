import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

import { insertAgentWorkspaceOwnership } from '../helpers/agent-workspace-fixtures.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  createAgentWorkspaceCleanup,
  resolveOwnedWorkspacePath,
} from '../../src/main/agents/workspaces/agent-workspace-cleanup.mjs'

function insertWorkspace(db, {
  id,
  storageRoot,
  status = 'active',
  artifactStatus = null,
}) {
  const workspaceRoot = path.join(storageRoot, id)
  const projectId = `project_${id}`
  const runId = `run_${id}`
  const nodeId = `node_${id}`
  const attemptId = `attempt_${id}`
  const sourceRoot = path.join(storageRoot, `source_${id}`)
  fs.mkdirSync(sourceRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })
  fs.writeFileSync(path.join(workspaceRoot, 'evidence.txt'), id, 'utf8')
  insertAgentWorkspaceOwnership(db, {
    projectId,
    threadId: `thread_${id}`,
    runId,
    nodeId,
    attemptId,
    projectRoot: sourceRoot,
    workspaceId: id,
    workspaceMode: 'local_overlay',
  })
  db.prepare(`
    INSERT INTO agent_workspaces (
      id, run_id, node_id, attempt_id, project_id, mode, status, source_root,
      workspace_root, project_view_root, base_revision, lease_expires_at,
      ownership_json, recovery_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'local_overlay', ?, ?, ?, ?, 'snapshot:base', ?, '{}', '{}', ?, ?)
  `).run(
    id,
    runId,
    nodeId,
    attemptId,
    projectId,
    status,
    sourceRoot,
    workspaceRoot,
    workspaceRoot,
    Date.now() + 60_000,
    Date.now(),
    Date.now(),
  )
  if (artifactStatus) {
    db.prepare(`
      INSERT INTO agent_artifact_projections (
        artifact_id, run_id, node_id, attempt_id, status, projection_json,
        updated_sequence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      `artifact_${id}`,
      runId,
      nodeId,
      attemptId,
      artifactStatus,
      JSON.stringify({ workspaceId: id }),
      Date.now(),
      Date.now(),
    )
  }
  return workspaceRoot
}

test('cleanup retains reviewable artifacts but removes terminal decided workspaces', async () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-cleanup-'))
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    const retainedRoot = insertWorkspace(db, {
      id: 'workspace_retained',
      storageRoot,
      status: 'interrupted',
      artifactStatus: 'staged',
    })
    const removableRoot = insertWorkspace(db, {
      id: 'workspace_removable',
      storageRoot,
      status: 'terminal',
      artifactStatus: 'applied',
    })
    const cleanup = createAgentWorkspaceCleanup({ db, storageRoot })

    const retained = await cleanup.cleanupWorkspace('workspace_retained')
    const removed = await cleanup.cleanupWorkspace('workspace_removable')

    assert.equal(retained.retained, true)
    assert.equal(fs.existsSync(retainedRoot), true)
    assert.equal(removed.cleaned, true)
    assert.equal(fs.existsSync(removableRoot), false)
    assert.equal(cleanup.get('workspace_removable').status, 'cleaned')
  } finally {
    db.close()
    fs.rmSync(storageRoot, { recursive: true, force: true })
  }
})

test('restart recovery marks missing active roots interrupted and preserves existing review roots', async () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-recovery-'))
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    const existingRoot = insertWorkspace(db, {
      id: 'workspace_existing',
      storageRoot,
      status: 'active',
      artifactStatus: 'staged',
    })
    const missingRoot = insertWorkspace(db, {
      id: 'workspace_missing',
      storageRoot,
      status: 'active',
    })
    fs.rmSync(missingRoot, { recursive: true, force: true })
    const cleanup = createAgentWorkspaceCleanup({ db, storageRoot })

    const result = await cleanup.recoverInterrupted()

    assert.deepEqual(result.recoveredWorkspaceIds, ['workspace_existing'])
    assert.deepEqual(result.interruptedWorkspaceIds, ['workspace_missing'])
    assert.equal(cleanup.get('workspace_existing').status, 'reviewable')
    assert.equal(cleanup.get('workspace_missing').status, 'interrupted')
    assert.equal(fs.existsSync(existingRoot), true)
  } finally {
    db.close()
    fs.rmSync(storageRoot, { recursive: true, force: true })
  }
})

test('owned workspace path validation rejects root, sibling, traversal, and absolute escape targets', () => {
  const storageRoot = path.resolve('C:/temp/addom-owned-workspaces')
  assert.equal(
    resolveOwnedWorkspacePath(storageRoot, 'workspace_01'),
    path.join(storageRoot, 'workspace_01'),
  )
  for (const target of ['', '.', '..', '../outside', 'C:/temp/outside']) {
    assert.throws(
      () => resolveOwnedWorkspacePath(storageRoot, target),
      /owned workspace root/i,
    )
  }
})
