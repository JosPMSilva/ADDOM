import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { validateAgentPermissionSnapshot } from '../../../common/agents/agent-permissions.mjs'
import { validateAgentCapabilities } from '../../../common/agents/agent-capabilities.mjs'
import { recordAgentRuntimeDiagnostic } from '../agent-runtime-diagnostics.mjs'
import { createAgentStagedOverlay } from './agent-staged-overlay.mjs'
import { createAgentWorkspaceArtifacts } from './agent-workspace-artifacts.mjs'
import { createAgentWorktreeManager } from './agent-worktree-manager.mjs'

const WRITE_PERMISSION_LEVELS = new Set(['read_write', 'all'])
const LOCAL_WRITE_MODES = new Set(['local_overlay', 'local_worktree'])

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function text(value, field, maxLength = 2_000) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new TypeError(`${field} is required`)
  if (normalized.length > maxLength) throw new TypeError(`${field} exceeds ${maxLength} characters`)
  return normalized
}

function normalizeRecord(row) {
  if (!row) return null
  return {
    id: row.id,
    runId: row.run_id,
    nodeId: row.node_id,
    attemptId: row.attempt_id,
    projectId: row.project_id,
    mode: row.mode,
    status: row.status,
    sourceRoot: row.source_root,
    workspaceRoot: row.workspace_root,
    projectViewRoot: row.project_view_root,
    baseRevision: row.base_revision,
    leaseExpiresAt: Number(row.lease_expires_at || 0),
    ownership: parseJson(row.ownership_json),
    recovery: parseJson(row.recovery_json),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  }
}

function capabilityMode(value) {
  return String(value?.mode || '').trim()
}

/**
 * A Git worktree materializes only tracked files, so it is both the cheapest and the best isolated
 * writable surface. The full-tree overlay copy exists solely for projects Git cannot serve.
 */
export function resolveAgentWorkspaceMode({
  permissionSnapshot,
  capabilitySnapshot,
  providerWorkspaceId = null,
  gitEligible = false,
} = {}) {
  const permission = validateAgentPermissionSnapshot(permissionSnapshot)
  const capability = validateAgentCapabilities(capabilitySnapshot)
  if (['provider_opaque', 'contract_only'].includes(capabilityMode(capability))) {
    return 'opaque_no_write_surface'
  }
  if (String(providerWorkspaceId || '').trim()) return 'remote_provider_workspace'
  if (!WRITE_PERMISSION_LEVELS.has(permission.level)) return 'local_shared_read'
  return gitEligible ? 'local_worktree' : 'local_overlay'
}

function assertOwnership(db, { runId, nodeId, attemptId, projectId }) {
  const row = db.prepare(`
    SELECT
      attempts.contract_json AS attempt_json,
      nodes.contract_json AS node_json,
      runs.project_id AS run_project_id
    FROM agent_attempts attempts
    INNER JOIN agent_nodes nodes
      ON nodes.id = attempts.node_id AND nodes.run_id = attempts.run_id
    INNER JOIN agent_runs runs
      ON runs.id = attempts.run_id
    WHERE attempts.id = ? AND attempts.run_id = ? AND attempts.node_id = ?
  `).get(attemptId, runId, nodeId)
  if (!row) throw new TypeError('Workspace owner must be an existing node attempt')
  if (row.run_project_id !== projectId) {
    throw new TypeError('Workspace project does not match the owning run')
  }
  const attempt = parseJson(row.attempt_json)
  const node = parseJson(row.node_json)
  return {
    attempt,
    node,
    permissionSnapshot: validateAgentPermissionSnapshot(
      attempt.permissionSnapshot || node.permissionSnapshot,
    ),
    capabilitySnapshot: validateAgentCapabilities(
      attempt.capabilitySnapshot || node.capabilitySnapshot,
    ),
  }
}

export function createAgentWorkspaceManager({
  db,
  eventStore = null,
  storageRoot,
  now = Date.now,
  idFactory = () => `workspace_${randomUUID()}`,
  artifactIdFactory = () => `artifact_${randomUUID()}`,
  worktreeManager = null,
  overlayManager = null,
  diagnostics = null,
  monotonicNow = performance.now.bind(performance),
  warn = console.warn,
} = {}) {
  if (!db) throw new TypeError('Agent workspace manager requires db')
  const root = path.resolve(
    String(storageRoot || path.join(os.tmpdir(), 'addom-agent-workspaces')).trim(),
  )
  const worktrees = worktreeManager || createAgentWorktreeManager({
    storageRoot: path.join(root, 'worktrees'),
  })
  const overlays = overlayManager || createAgentStagedOverlay({
    storageRoot: path.join(root, 'overlays'),
  })
  const artifacts = createAgentWorkspaceArtifacts({
    db,
    eventStore,
    now,
    idFactory: artifactIdFactory,
  })
  const preparedSurfaces = new Map()
  const inFlightPreparations = new Set()
  let closing = false

  function get(workspaceId) {
    return normalizeRecord(db.prepare(`
      SELECT * FROM agent_workspaces WHERE id = ?
    `).get(String(workspaceId || '').trim()))
  }

  function list({ runId = null, status = null } = {}) {
    const clauses = []
    const args = []
    if (runId) {
      clauses.push('run_id = ?')
      args.push(String(runId))
    }
    if (status) {
      clauses.push('status = ?')
      args.push(String(status))
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    return db.prepare(`
      SELECT * FROM agent_workspaces
      ${where}
      ORDER BY created_at ASC, id ASC
    `).all(...args).map(normalizeRecord)
  }

  function emitReady(workspace) {
    if (!eventStore) return
    eventStore.append({
      runId: workspace.runId,
      nodeId: workspace.nodeId,
      parentNodeId: workspace.ownership.parentNodeId || null,
      attemptId: workspace.attemptId,
      providerEventId: null,
      providerCorrelationKey: null,
      idempotencyKey: `${workspace.runId}:agent_workspace_ready:${workspace.id}`,
      kind: 'agent_workspace_ready',
      payload: {
        workspaceId: workspace.id,
        workspaceMode: workspace.mode,
        baseRevision: workspace.baseRevision,
        leaseExpiresAt: workspace.leaseExpiresAt,
      },
      createdAt: workspace.updatedAt,
    })
  }

  async function discardPrepared(prepared) {
    if (prepared?.id) preparedSurfaces.delete(prepared.id)
    if (!prepared?.workspaceRoot) return
    if (prepared.mode === 'local_worktree') {
      await worktrees.remove({
        workspaceRoot: prepared.workspaceRoot,
        ownership: { repoRoot: prepared.repoRoot },
      })
      return
    }
    if (prepared.mode === 'local_overlay') {
      await overlays.remove(prepared.workspaceRoot)
    }
  }

  async function createPrepared(input = {}) {
    const permissionSnapshot = validateAgentPermissionSnapshot(input.permissionSnapshot)
    const capabilitySnapshot = validateAgentCapabilities(input.capabilitySnapshot)
    const projectRoot = input.projectRoot
      ? path.resolve(text(input.projectRoot, 'projectRoot'))
      : null
    const expiresAt = Number(input.expiresAt)
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now()) {
      throw new TypeError('Workspace lease expiry must be later than acquisition time')
    }
    const providerWorkspaceId = String(input.providerWorkspaceId || '').trim() || null
    const probe = projectRoot && WRITE_PERMISSION_LEVELS.has(permissionSnapshot.level)
      ? await worktrees.probe(projectRoot)
      : { eligible: false }
    const mode = resolveAgentWorkspaceMode({
      permissionSnapshot,
      capabilitySnapshot,
      providerWorkspaceId,
      gitEligible: probe.eligible,
    })
    const workspaceId = text(input.workspaceId || idFactory(), 'workspaceId', 256)
    let surface = {
      sourceRoot: projectRoot,
      workspaceRoot: null,
      projectViewRoot: mode === 'local_shared_read' ? projectRoot : null,
      baseRevision: mode === 'remote_provider_workspace'
        ? `provider:${providerWorkspaceId}`
        : mode === 'opaque_no_write_surface'
          ? `opaque:${workspaceId}`
          : `shared:${createHash('sha256').update(projectRoot || workspaceId).digest('hex')}`,
    }
    if (mode === 'local_worktree') {
      surface = await worktrees.create({ workspaceId, projectRoot })
    } else if (mode === 'local_overlay') {
      surface = await overlays.create({ workspaceId, projectRoot })
    }
    const prepared = {
      id: workspaceId,
      mode,
      sourceRoot: surface.sourceRoot,
      repoRoot: surface.repoRoot || null,
      workspaceRoot: surface.workspaceRoot,
      projectViewRoot: surface.projectViewRoot,
      baseRevision: surface.baseRevision,
      leaseExpiresAt: expiresAt,
      providerWorkspaceId,
      permissionSnapshot,
      capabilitySnapshot,
    }
    preparedSurfaces.set(prepared.id, prepared)
    if (closing) {
      await discardPrepared(prepared)
      throw new TypeError('Agent workspace manager is shutting down')
    }
    return prepared
  }

  function prepare(input = {}) {
    if (closing) return Promise.reject(new TypeError('Agent workspace manager is shutting down'))
    let preparation = null
    preparation = createPrepared(input).finally(() => inFlightPreparations.delete(preparation))
    inFlightPreparations.add(preparation)
    return preparation
  }

  async function activate(prepared, input = {}) {
    const allocationStartedAt = monotonicNow()
    if (!prepared || typeof prepared !== 'object') {
      throw new TypeError('Prepared workspace surface is required')
    }
    if (closing) {
      await discardPrepared(prepared)
      throw new TypeError('Agent workspace manager is shutting down')
    }
    const runId = text(input.runId, 'runId', 256)
    const nodeId = text(input.nodeId, 'nodeId', 256)
    const attemptId = text(input.attemptId, 'attemptId', 256)
    const projectId = text(input.projectId, 'projectId', 256)
    if (db.prepare('SELECT 1 FROM agent_workspaces WHERE attempt_id = ?').get(attemptId)) {
      throw new TypeError(`Attempt ${attemptId} already owns a workspace`)
    }
    const owner = assertOwnership(db, { runId, nodeId, attemptId, projectId })
    if (
      owner.attempt.workspaceId !== prepared.id
      || owner.attempt.workspaceMode !== prepared.mode
      || owner.node.workspaceId !== prepared.id
      || owner.node.workspaceMode !== prepared.mode
    ) {
      throw new TypeError('Prepared workspace must match the queued node attempt contract')
    }
    const createdAt = now()
    const ownership = {
      parentNodeId: owner.node.parentNodeId || null,
      providerWorkspaceId: prepared.providerWorkspaceId,
      repoRoot: prepared.repoRoot,
      writeScope: LOCAL_WRITE_MODES.has(prepared.mode) ? prepared.workspaceRoot : null,
    }
    db.prepare(`
      INSERT INTO agent_workspaces (
        id, run_id, node_id, attempt_id, project_id, mode, status, source_root,
        workspace_root, project_view_root, base_revision, lease_expires_at,
        ownership_json, recovery_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, '{}', ?, ?)
    `).run(
      prepared.id,
      runId,
      nodeId,
      attemptId,
      projectId,
      prepared.mode,
      prepared.sourceRoot,
      prepared.workspaceRoot,
      prepared.projectViewRoot,
      prepared.baseRevision,
      prepared.leaseExpiresAt,
      JSON.stringify(ownership),
      createdAt,
      createdAt,
    )
    const workspace = get(prepared.id)
    try {
      await artifacts.snapshotBase(workspace.id)
      emitReady(workspace)
      preparedSurfaces.delete(prepared.id)
      recordAgentRuntimeDiagnostic(diagnostics, {
        kind: 'workspace_allocation',
        runId,
        nodeId,
        attemptId,
        providerClass: owner.capabilitySnapshot.mode,
        monotonicAt: allocationStartedAt,
        durationMs: Math.max(0, monotonicNow() - allocationStartedAt),
        outcome: 'active',
        attributes: { workspace_mode: workspace.mode },
      }, warn)
      return workspace
    } catch (error) {
      db.prepare('DELETE FROM agent_workspaces WHERE id = ?').run(workspace.id)
      await discardPrepared(prepared).catch(() => {})
      throw error
    }
  }

  async function acquire(input = {}) {
    const runId = text(input.runId, 'runId', 256)
    const nodeId = text(input.nodeId, 'nodeId', 256)
    const attemptId = text(input.attemptId, 'attemptId', 256)
    const projectId = text(input.projectId, 'projectId', 256)
    if (db.prepare('SELECT 1 FROM agent_workspaces WHERE attempt_id = ?').get(attemptId)) {
      throw new TypeError(`Attempt ${attemptId} already owns a workspace`)
    }
    const owner = assertOwnership(db, { runId, nodeId, attemptId, projectId })
    const prepared = await prepare({
      ...input,
      workspaceId: owner.attempt.workspaceId,
      permissionSnapshot: owner.permissionSnapshot,
      capabilitySnapshot: owner.capabilitySnapshot,
    })
    try {
      return await activate(prepared, { runId, nodeId, attemptId, projectId })
    } catch (error) {
      await discardPrepared(prepared).catch(() => {})
      throw error
    }
  }

  function markTerminal({ attemptId, status = 'terminal' } = {}) {
    const workspace = normalizeRecord(db.prepare(`
      SELECT * FROM agent_workspaces WHERE attempt_id = ?
    `).get(String(attemptId || '').trim()))
    if (!workspace) return null
    const reviewable = db.prepare(`
      SELECT 1 FROM agent_artifact_projections
      WHERE json_extract(projection_json, '$.workspaceId') = ?
        AND status IN ('staged', 'conflicted')
      LIMIT 1
    `).get(workspace.id)
    const nextStatus = reviewable ? 'reviewable' : status
    db.prepare(`
      UPDATE agent_workspaces SET status = ?, updated_at = ? WHERE id = ?
    `).run(nextStatus, now(), workspace.id)
    return get(workspace.id)
  }

  function markInterrupted({ workspaceId, reason = 'runtime_interrupted' } = {}) {
    const workspace = get(text(workspaceId, 'workspaceId', 256))
    if (!workspace) return null
    db.prepare(`
      UPDATE agent_workspaces
      SET status = 'interrupted', recovery_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify({
        ...workspace.recovery,
        interruptedAt: now(),
        reason: String(reason || 'runtime_interrupted').slice(0, 1_000),
      }),
      now(),
      workspace.id,
    )
    return get(workspace.id)
  }

  async function beginShutdown() {
    closing = true
    await Promise.allSettled([...inFlightPreparations])
    const pending = [...preparedSurfaces.values()]
    await Promise.allSettled(pending.map((prepared) => discardPrepared(prepared)))
    return {
      discardedWorkspaceIds: pending.map((prepared) => prepared.id).sort(),
    }
  }

  return Object.freeze({
    acquire,
    activate,
    beginShutdown,
    captureArtifacts({ workspaceId } = {}) {
      return artifacts.capture(text(workspaceId, 'workspaceId', 256))
    },
    get,
    importProviderArtifact({ workspaceId, artifact } = {}) {
      return artifacts.importProviderArtifact(
        text(workspaceId, 'workspaceId', 256),
        artifact,
      )
    },
    list,
    markTerminal,
    markInterrupted,
    overlayManager: overlays,
    storageRoot: root,
    prepare,
    discardPrepared,
    worktreeManager: worktrees,
  })
}
