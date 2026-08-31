import { promises as fs } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { recordAgentRuntimeDiagnostic } from '../agent-runtime-diagnostics.mjs'

const REVIEWABLE_ARTIFACT_STATUSES = new Set(['staged', 'conflicted'])
const RECOVERABLE_WORKSPACE_STATUSES = new Set(['preparing', 'active', 'interrupted'])

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
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

function pathKey(value) {
  const resolved = path.resolve(String(value || '').trim() || '.')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function resolveOwnedWorkspacePath(storageRoot, target) {
  const root = path.resolve(String(storageRoot || '').trim() || '.')
  const rawTarget = String(target || '').trim()
  if (!rawTarget || rawTarget === '.' || rawTarget === '..' || path.isAbsolute(rawTarget)) {
    throw new TypeError('Target must identify one owned workspace root')
  }
  const resolved = path.resolve(root, rawTarget)
  const relative = path.relative(root, resolved)
  if (
    !relative
    || relative.startsWith('..')
    || path.isAbsolute(relative)
    || pathKey(resolved) === pathKey(root)
  ) {
    throw new TypeError('Target must stay inside one owned workspace root')
  }
  return resolved
}

function assertStoredRootOwned(storageRoot, workspaceRoot) {
  const root = path.resolve(String(storageRoot || '').trim() || '.')
  const target = path.resolve(String(workspaceRoot || '').trim() || '.')
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new TypeError('Stored path is not an owned workspace root')
  }
  return target
}

export function createAgentWorkspaceCleanup({
  db,
  storageRoot,
  now = Date.now,
  removeWorktree = null,
  diagnostics = null,
  monotonicNow = performance.now.bind(performance),
  warn = console.warn,
} = {}) {
  if (!db) throw new TypeError('Workspace cleanup requires db')
  const ownedRoot = path.resolve(String(storageRoot || '').trim() || '.')

  function get(workspaceId) {
    return normalizeRecord(db.prepare(`
      SELECT * FROM agent_workspaces WHERE id = ?
    `).get(String(workspaceId || '').trim()))
  }

  function updateStatus(workspaceId, status, recovery = null) {
    const updatedAt = now()
    const existing = get(workspaceId)
    if (!existing) throw new TypeError(`Agent workspace ${workspaceId} was not found`)
    db.prepare(`
      UPDATE agent_workspaces
      SET status = ?, recovery_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status,
      JSON.stringify(recovery ?? existing.recovery ?? {}),
      updatedAt,
      workspaceId,
    )
    return get(workspaceId)
  }

  function hasReviewableArtifacts(workspaceId) {
    const rows = db.prepare(`
      SELECT status FROM agent_artifact_projections
      WHERE json_extract(projection_json, '$.workspaceId') = ?
    `).all(workspaceId)
    return rows.some((row) => REVIEWABLE_ARTIFACT_STATUSES.has(row.status))
  }

  async function removeOwnedRoot(workspace) {
    if (!workspace.workspaceRoot) return
    const target = assertStoredRootOwned(ownedRoot, workspace.workspaceRoot)
    if (workspace.mode === 'local_worktree' && typeof removeWorktree === 'function') {
      await removeWorktree(workspace)
      return
    }
    await fs.rm(target, { recursive: true, force: true })
  }

  async function cleanupWorkspace(workspaceId) {
    const cleanupStartedAt = monotonicNow()
    const workspace = get(workspaceId)
    if (!workspace) throw new TypeError(`Agent workspace ${workspaceId} was not found`)
    if (hasReviewableArtifacts(workspace.id)) {
      const retained = updateStatus(workspace.id, 'reviewable', {
        ...workspace.recovery,
        retainedReason: 'reviewable_artifacts',
        retainedAt: now(),
      })
      recordAgentRuntimeDiagnostic(diagnostics, {
        kind: 'workspace_cleanup',
        runId: workspace.runId,
        nodeId: workspace.nodeId,
        attemptId: workspace.attemptId,
        providerClass: 'managed_hierarchy',
        monotonicAt: cleanupStartedAt,
        durationMs: Math.max(0, monotonicNow() - cleanupStartedAt),
        outcome: 'retained',
        attributes: { workspace_mode: workspace.mode },
      }, warn)
      return { retained: true, workspace: retained }
    }
    await removeOwnedRoot(workspace)
    const cleaned = updateStatus(workspace.id, 'cleaned', {
      ...workspace.recovery,
      cleanedAt: now(),
    })
    recordAgentRuntimeDiagnostic(diagnostics, {
      kind: 'workspace_cleanup',
      runId: workspace.runId,
      nodeId: workspace.nodeId,
      attemptId: workspace.attemptId,
      providerClass: 'managed_hierarchy',
      monotonicAt: cleanupStartedAt,
      durationMs: Math.max(0, monotonicNow() - cleanupStartedAt),
      outcome: 'cleaned',
      attributes: { workspace_mode: workspace.mode },
    }, warn)
    return { cleaned: true, workspace: cleaned }
  }

  async function recoverInterrupted() {
    const rows = db.prepare(`
      SELECT * FROM agent_workspaces
      WHERE status IN ('preparing', 'active', 'interrupted')
      ORDER BY created_at ASC, id ASC
    `).all().map(normalizeRecord)
    const recoveredWorkspaceIds = []
    const interruptedWorkspaceIds = []
    for (const workspace of rows) {
      if (!RECOVERABLE_WORKSPACE_STATUSES.has(workspace.status)) continue
      const rootExists = workspace.workspaceRoot
        ? await fs.stat(workspace.workspaceRoot).then(() => true, () => false)
        : ['local_shared_read', 'remote_provider_workspace', 'opaque_no_write_surface']
            .includes(workspace.mode)
      if (rootExists) {
        updateStatus(workspace.id, hasReviewableArtifacts(workspace.id) ? 'reviewable' : 'interrupted', {
          ...workspace.recovery,
          recoveredAt: now(),
          recoveredFromStatus: workspace.status,
        })
        recoveredWorkspaceIds.push(workspace.id)
      } else {
        updateStatus(workspace.id, 'interrupted', {
          ...workspace.recovery,
          missingRootAt: now(),
          recoveredFromStatus: workspace.status,
        })
        interruptedWorkspaceIds.push(workspace.id)
      }
    }
    return { recoveredWorkspaceIds, interruptedWorkspaceIds }
  }

  return Object.freeze({
    cleanupWorkspace,
    get,
    recoverInterrupted,
  })
}
