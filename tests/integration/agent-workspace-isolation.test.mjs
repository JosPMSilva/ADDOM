import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

import {
  makeAgentCapabilities,
  makeAgentPermission,
  makeAgentRun,
  makeAgentNode,
  makeAgentAttempt,
  makeAgentEventDraft,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'
import { insertAgentWorkspaceOwnership } from '../helpers/agent-workspace-fixtures.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import {
  createAgentWorkspaceManager,
  resolveAgentWorkspaceMode,
} from '../../src/main/agents/workspaces/agent-workspace-manager.mjs'
import {
  assertWorkspaceSymlinksOwned,
} from '../../src/main/agents/workspaces/agent-workspace-path-safety.mjs'

function hasGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function createRepo(root, name = 'project') {
  const projectRoot = path.join(root, name)
  fs.mkdirSync(projectRoot, { recursive: true })
  runGit(projectRoot, ['init'])
  runGit(projectRoot, ['config', 'user.email', 'test@addom.local'])
  runGit(projectRoot, ['config', 'user.name', 'ADDOM Test'])
  fs.writeFileSync(path.join(projectRoot, 'shared.txt'), 'base\n', 'utf8')
  runGit(projectRoot, ['add', '--all'])
  runGit(projectRoot, ['commit', '-m', 'base'])
  return projectRoot
}

test('workspace mode classification is capability-based and never inferred from provider/model names', () => {
  const write = makeAgentPermission('read_write')
  const read = makeAgentPermission('read_only')
  const managed = makeAgentCapabilities()
  const opaque = makeAgentCapabilities({
    mode: 'provider_opaque',
    recursiveAgents: false,
    childStreams: false,
    addressableChildren: false,
    childMessaging: false,
    childCancellation: false,
    childRetry: false,
    resumableChildren: false,
    perNodeUsage: false,
    approvalAttribution: false,
    workspaceIsolation: false,
    maxDepthHint: null,
    maxConcurrencyHint: null,
    visibilityReason: 'No write surface.',
    capabilityKey: 'provider_managed_partial_visibility',
  })

  assert.equal(resolveAgentWorkspaceMode({
    permissionSnapshot: read,
    capabilitySnapshot: managed,
    gitEligible: true,
  }), 'local_shared_read')
  assert.equal(resolveAgentWorkspaceMode({
    permissionSnapshot: write,
    capabilitySnapshot: managed,
    gitEligible: true,
  }), 'local_worktree')
  assert.equal(resolveAgentWorkspaceMode({
    permissionSnapshot: write,
    capabilitySnapshot: managed,
    gitEligible: false,
  }), 'local_overlay')
  assert.equal(resolveAgentWorkspaceMode({
    permissionSnapshot: write,
    capabilitySnapshot: managed,
    providerWorkspaceId: 'remote-workspace',
  }), 'remote_provider_workspace')
  assert.equal(resolveAgentWorkspaceMode({
    permissionSnapshot: write,
    capabilitySnapshot: opaque,
    providerWorkspaceId: 'untrusted-claim',
  }), 'opaque_no_write_surface')
})

test('isolated writable surfaces reject symbolic links that escape their owned project view', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-symlink-'))
  const projectRoot = path.join(root, 'project')
  const externalRoot = path.join(root, 'external')
  fs.mkdirSync(projectRoot)
  fs.mkdirSync(externalRoot)
  fs.writeFileSync(path.join(externalRoot, 'protected.txt'), 'protected\n', 'utf8')
  try {
    fs.symlinkSync(externalRoot, path.join(projectRoot, 'escape'), 'junction')
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true })
    t.skip(`Symbolic links are unavailable: ${error.code || error.message}`)
    return
  }
  try {
    await assert.rejects(
      assertWorkspaceSymlinksOwned(projectRoot),
      /symbolic link escapes/i,
    )
    assert.equal(fs.readFileSync(path.join(externalRoot, 'protected.txt'), 'utf8'), 'protected\n')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('every Git-backed writer receives its own worktree, not a full-tree copy', {
  skip: !hasGit(),
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-isolation-'))
  const storageRoot = path.join(root, 'workspaces')
  const projectRoot = createRepo(root)
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  try {
    insertAgentWorkspaceOwnership(db, {
      projectId: 'project_a',
      threadId: 'thread_a',
      runId: 'run_a',
      nodeId: 'node_a',
      attemptId: 'attempt_a',
      projectRoot,
      permissionSnapshot: makeAgentPermission('read_write'),
      workspaceId: 'workspace_1',
      workspaceMode: 'local_worktree',
    })
    insertAgentWorkspaceOwnership(db, {
      projectId: 'project_a',
      threadId: 'thread_b',
      runId: 'run_b',
      nodeId: 'node_b',
      attemptId: 'attempt_b',
      projectRoot,
      permissionSnapshot: makeAgentPermission('read_write'),
      workspaceId: 'workspace_2',
      workspaceMode: 'local_worktree',
    })
    const manager = createAgentWorkspaceManager({
      db,
      storageRoot,
      now: () => 1_752_600_000_100,
      idFactory: (() => {
        let id = 0
        return () => `workspace_${++id}`
      })(),
    })

    const first = await manager.acquire({
      runId: 'run_a',
      nodeId: 'node_a',
      attemptId: 'attempt_a',
      projectId: 'project_a',
      projectRoot,
      expiresAt: 1_752_600_100_000,
    })
    const second = await manager.acquire({
      runId: 'run_b',
      nodeId: 'node_b',
      attemptId: 'attempt_b',
      projectId: 'project_a',
      projectRoot,
      expiresAt: 1_752_600_100_000,
    })

    assert.equal(first.mode, 'local_worktree')
    assert.equal(second.mode, 'local_worktree')
    assert.notEqual(first.projectViewRoot, second.projectViewRoot)
    fs.writeFileSync(path.join(first.projectViewRoot, 'shared.txt'), 'first\n', 'utf8')
    fs.writeFileSync(path.join(second.projectViewRoot, 'shared.txt'), 'second\n', 'utf8')
    assert.equal(fs.readFileSync(path.join(projectRoot, 'shared.txt'), 'utf8'), 'base\n')
    assert.equal(fs.readFileSync(path.join(first.projectViewRoot, 'shared.txt'), 'utf8'), 'first\n')
    assert.equal(fs.readFileSync(path.join(second.projectViewRoot, 'shared.txt'), 'utf8'), 'second\n')
    assert.match(first.baseRevision, /^git:[a-f0-9]{40}(?:\+dirty:[a-f0-9]{64})?$/)
    assert.match(second.baseRevision, /^git:[a-f0-9]{40}(?:\+dirty:[a-f0-9]{64})?$/)
    assert.equal(manager.list({ status: 'active' }).length, 2)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('non-Git writers receive isolated overlay snapshots and write scopes cannot be duplicated', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-overlay-'))
  const projectRoot = path.join(root, 'project')
  const storageRoot = path.join(root, 'workspaces')
  fs.mkdirSync(projectRoot)
  fs.writeFileSync(path.join(projectRoot, 'shared.txt'), 'base\n', 'utf8')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  try {
    insertAgentWorkspaceOwnership(db, {
      projectId: 'project_a',
      threadId: 'thread_a',
      runId: 'run_a',
      nodeId: 'node_a',
      attemptId: 'attempt_a',
      projectRoot,
      permissionSnapshot: makeAgentPermission('read_write'),
      workspaceId: 'workspace_overlay',
      workspaceMode: 'local_overlay',
    })
    const manager = createAgentWorkspaceManager({
      db,
      storageRoot,
      idFactory: () => 'workspace_overlay',
    })
    const workspace = await manager.acquire({
      runId: 'run_a',
      nodeId: 'node_a',
      attemptId: 'attempt_a',
      projectId: 'project_a',
      projectRoot,
      expiresAt: Date.now() + 60_000,
    })

    assert.equal(workspace.mode, 'local_overlay')
    assert.notEqual(workspace.projectViewRoot, projectRoot)
    fs.writeFileSync(path.join(workspace.projectViewRoot, 'shared.txt'), 'overlay\n', 'utf8')
    assert.equal(fs.readFileSync(path.join(projectRoot, 'shared.txt'), 'utf8'), 'base\n')
    await assert.rejects(
      manager.acquire({
        runId: 'run_a',
        nodeId: 'node_a',
        attemptId: 'attempt_a',
        projectId: 'project_a',
        projectRoot,
        expiresAt: Date.now() + 60_000,
      }),
      /already owns a workspace/i,
    )
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('Git worktrees never materialize ignored dependency or build directories', {
  skip: !hasGit(),
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-worktree-ignore-'))
  const projectRoot = createRepo(root)
  fs.writeFileSync(path.join(projectRoot, '.gitignore'), 'node_modules/\ndist/\n', 'utf8')
  runGit(projectRoot, ['add', '--all'])
  runGit(projectRoot, ['commit', '-m', 'ignore heavy directories'])
  fs.mkdirSync(path.join(projectRoot, 'node_modules', 'left-pad'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, 'node_modules', 'left-pad', 'index.js'), 'x\n', 'utf8')
  fs.mkdirSync(path.join(projectRoot, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, 'dist', 'bundle.js'), 'y\n', 'utf8')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  try {
    insertAgentWorkspaceOwnership(db, {
      projectId: 'project_a',
      threadId: 'thread_a',
      runId: 'run_a',
      nodeId: 'node_a',
      attemptId: 'attempt_a',
      projectRoot,
      permissionSnapshot: makeAgentPermission('read_write'),
      workspaceId: 'workspace_worktree_ignore',
      workspaceMode: 'local_worktree',
    })
    const manager = createAgentWorkspaceManager({
      db,
      storageRoot: path.join(root, 'workspaces'),
      idFactory: () => 'workspace_worktree_ignore',
    })
    const workspace = await manager.acquire({
      runId: 'run_a',
      nodeId: 'node_a',
      attemptId: 'attempt_a',
      projectId: 'project_a',
      projectRoot,
      expiresAt: Date.now() + 60_000,
    })

    assert.equal(workspace.mode, 'local_worktree')
    assert.equal(fs.existsSync(path.join(workspace.projectViewRoot, 'shared.txt')), true)
    assert.equal(fs.existsSync(path.join(workspace.projectViewRoot, 'node_modules')), false)
    assert.equal(fs.existsSync(path.join(workspace.projectViewRoot, 'dist')), false)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('the non-Git overlay fallback excludes dependency and build directories from its copy', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-overlay-ignore-'))
  const projectRoot = path.join(root, 'project')
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, 'src', 'app.js'), 'source\n', 'utf8')
  fs.mkdirSync(path.join(projectRoot, 'node_modules', 'left-pad'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, 'node_modules', 'left-pad', 'index.js'), 'dep\n', 'utf8')
  fs.mkdirSync(path.join(projectRoot, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, 'dist', 'bundle.js'), 'built\n', 'utf8')
  fs.mkdirSync(path.join(projectRoot, '__pycache__'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '__pycache__', 'mod.pyc'), 'cached\n', 'utf8')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  try {
    insertAgentWorkspaceOwnership(db, {
      projectId: 'project_a',
      threadId: 'thread_a',
      runId: 'run_a',
      nodeId: 'node_a',
      attemptId: 'attempt_a',
      projectRoot,
      permissionSnapshot: makeAgentPermission('read_write'),
      workspaceId: 'workspace_overlay_ignore',
      workspaceMode: 'local_overlay',
    })
    const manager = createAgentWorkspaceManager({
      db,
      storageRoot: path.join(root, 'workspaces'),
      idFactory: () => 'workspace_overlay_ignore',
    })
    const workspace = await manager.acquire({
      runId: 'run_a',
      nodeId: 'node_a',
      attemptId: 'attempt_a',
      projectId: 'project_a',
      projectRoot,
      expiresAt: Date.now() + 60_000,
    })

    assert.equal(workspace.mode, 'local_overlay')
    assert.equal(fs.existsSync(path.join(workspace.projectViewRoot, 'src', 'app.js')), true)
    assert.equal(fs.existsSync(path.join(workspace.projectViewRoot, 'node_modules')), false)
    assert.equal(fs.existsSync(path.join(workspace.projectViewRoot, 'dist')), false)
    assert.equal(fs.existsSync(path.join(workspace.projectViewRoot, '__pycache__')), false)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'node_modules', 'left-pad', 'index.js'), 'utf8'), 'dep\n')
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('workspace shutdown removes prepared surfaces and rejects new acquisitions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-prepare-shutdown-'))
  const projectRoot = path.join(root, 'project')
  fs.mkdirSync(projectRoot)
  fs.writeFileSync(path.join(projectRoot, 'base.txt'), 'base\n', 'utf8')
  const db = new Database(':memory:')
  runMigrations(db)
  try {
    const manager = createAgentWorkspaceManager({
      db,
      storageRoot: path.join(root, 'workspaces'),
    })
    const prepared = await manager.prepare({
      workspaceId: 'workspace_prepared',
      projectRoot,
      permissionSnapshot: makeAgentPermission('read_write'),
      capabilitySnapshot: makeAgentCapabilities(),
      expiresAt: Date.now() + 60_000,
    })
    assert.equal(fs.existsSync(prepared.workspaceRoot), true)

    const shutdown = await manager.beginShutdown()

    assert.deepEqual(shutdown.discardedWorkspaceIds, ['workspace_prepared'])
    assert.equal(fs.existsSync(prepared.workspaceRoot), false)
    await assert.rejects(
      manager.prepare({
        workspaceId: 'workspace_too_late',
        projectRoot,
        permissionSnapshot: makeAgentPermission('read_write'),
        capabilitySnapshot: makeAgentCapabilities(),
        expiresAt: Date.now() + 60_000,
      }),
      /shutting down/i,
    )
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('workspace reconciliation captures direct tool writes as canonical owned artifacts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-capture-'))
  const projectRoot = path.join(root, 'project')
  const storageRoot = path.join(root, 'workspaces')
  fs.mkdirSync(projectRoot)
  fs.writeFileSync(path.join(projectRoot, 'updated.txt'), 'before\n', 'utf8')
  fs.writeFileSync(path.join(projectRoot, 'deleted.txt'), 'remove\n', 'utf8')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  try {
    seedAgentWorkspace(db)
    db.prepare('UPDATE workspace_projects SET path = ? WHERE id = ?')
      .run(projectRoot, 'project_01')
    const eventStore = createAgentEventStore(db, {
      idFactory: (() => {
        let id = 0
        return () => `event_capture_${++id}`
      })(),
    })
    eventStore.append(makeAgentEventDraft('agent_run_created', {
      policyProfileId: 'high',
      run: makeAgentRun({ status: 'created' }),
      rootNode: makeAgentNode({
        status: 'queued',
        workspaceId: 'workspace_capture',
        workspaceMode: 'local_overlay',
      }),
    }, {
      eventId: 'event_capture_run_created',
      idempotencyKey: 'run_01:capture:created',
    }))
    eventStore.append(makeAgentEventDraft('agent_started', {
      attemptId: 'attempt_agent_root_1',
      node: makeAgentNode({
        status: 'running',
        workspaceId: 'workspace_capture',
        workspaceMode: 'local_overlay',
      }),
      attempt: makeAgentAttempt('agent_root', {
        workspaceId: 'workspace_capture',
        workspaceMode: 'local_overlay',
      }),
    }, {
      eventId: 'event_capture_started',
      idempotencyKey: 'run_01:capture:started',
    }))
    const manager = createAgentWorkspaceManager({
      db,
      eventStore,
      storageRoot,
      idFactory: () => 'workspace_capture',
      artifactIdFactory: (() => {
        let id = 0
        return () => `artifact_capture_${++id}`
      })(),
    })
    const workspace = await manager.acquire({
      runId: 'run_01',
      nodeId: 'agent_root',
      attemptId: 'attempt_agent_root_1',
      projectId: 'project_01',
      projectRoot,
      expiresAt: Date.now() + 60_000,
    })
    fs.writeFileSync(path.join(workspace.projectViewRoot, 'updated.txt'), 'after\n', 'utf8')
    fs.writeFileSync(path.join(workspace.projectViewRoot, 'created.txt'), 'created\n', 'utf8')
    fs.rmSync(path.join(workspace.projectViewRoot, 'deleted.txt'))

    const artifacts = await manager.captureArtifacts({ workspaceId: workspace.id })

    assert.deepEqual(
      artifacts.map((artifact) => [artifact.path, artifact.operationType]),
      [
        ['created.txt', 'create_file'],
        ['deleted.txt', 'delete_file'],
        ['updated.txt', 'update_file'],
      ],
    )
    assert.equal(artifacts.every((artifact) => (
      artifact.runId === 'run_01'
      && artifact.nodeId === 'agent_root'
      && artifact.attemptId === 'attempt_agent_root_1'
      && artifact.workspaceId === workspace.id
      && artifact.baseRevision === workspace.baseRevision
    )), true)
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM agent_events WHERE kind = 'agent_artifact_staged'")
        .get().count,
      3,
    )
    assert.equal(fs.readFileSync(path.join(projectRoot, 'updated.txt'), 'utf8'), 'before\n')
    assert.equal(fs.existsSync(path.join(projectRoot, 'created.txt')), false)
    assert.equal(fs.existsSync(path.join(projectRoot, 'deleted.txt')), true)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('remote provider artifacts become mergeable only after local digest verification', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-provider-import-'))
  const projectRoot = path.join(root, 'project')
  fs.mkdirSync(projectRoot)
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  try {
    insertAgentWorkspaceOwnership(db, {
      projectId: 'project_remote',
      threadId: 'thread_remote',
      runId: 'run_remote',
      nodeId: 'node_remote',
      attemptId: 'attempt_remote',
      projectRoot,
      permissionSnapshot: makeAgentPermission('read_write'),
      workspaceId: 'workspace_remote',
      workspaceMode: 'remote_provider_workspace',
    })
    const manager = createAgentWorkspaceManager({
      db,
      eventStore: createAgentEventStore(db),
      storageRoot: path.join(root, 'workspaces'),
      idFactory: () => 'workspace_remote',
      artifactIdFactory: () => 'artifact_remote_import',
    })
    const workspace = await manager.acquire({
      runId: 'run_remote',
      nodeId: 'node_remote',
      attemptId: 'attempt_remote',
      projectId: 'project_remote',
      projectRoot,
      providerWorkspaceId: 'provider-workspace-01',
      expiresAt: Date.now() + 60_000,
    })
    const content = 'verified provider content\n'
    const contentDigest = `sha256:${createHash('sha256').update(content).digest('hex')}`
    assert.throws(() => manager.importProviderArtifact({
      workspaceId: workspace.id,
      artifact: {
        providerArtifactId: 'provider-artifact-01',
        path: 'provider.txt',
        content,
        contentDigest: 'sha256:not-verified',
        baseContentDigest: `sha256:${createHash('sha256').update('').digest('hex')}`,
      },
    }), /could not be verified locally/i)
    assert.throws(() => manager.importProviderArtifact({
      workspaceId: workspace.id,
      artifact: {
        providerArtifactId: 'provider-artifact-move',
        path: 'moved.txt',
        originalPath: 'original.txt',
        operationType: 'move_file',
        content,
        contentDigest,
        baseContentDigest: `sha256:${createHash('sha256').update('').digest('hex')}`,
      },
    }), /provider artifact operation/i)

    const artifact = manager.importProviderArtifact({
      workspaceId: workspace.id,
      artifact: {
        providerArtifactId: 'provider-artifact-01',
        path: 'provider.txt',
        content,
        contentDigest,
        baseContentDigest: `sha256:${createHash('sha256').update('').digest('hex')}`,
      },
    })
    assert.equal(artifact.provenance.verifiedLocalImport, true)
    assert.equal(artifact.provenance.providerArtifactId, 'provider-artifact-01')
    assert.equal(
      db.prepare('SELECT status FROM agent_artifact_projections WHERE artifact_id = ?')
        .get(artifact.id).status,
      'staged',
    )
    const managerWithoutEvents = createAgentWorkspaceManager({
      db,
      storageRoot: path.join(root, 'workspaces-no-events'),
    })
    assert.throws(() => managerWithoutEvents.importProviderArtifact({
      workspaceId: workspace.id,
      artifact: {
        providerArtifactId: 'provider-artifact-no-event',
        path: 'untracked.txt',
        content,
        contentDigest,
        baseContentDigest: `sha256:${createHash('sha256').update('').digest('hex')}`,
      },
    }), /canonical event store/i)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
