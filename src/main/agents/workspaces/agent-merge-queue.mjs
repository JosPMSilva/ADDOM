import { randomUUID } from 'node:crypto'

import { validateAgentArtifact } from '../../../common/agents/agent-artifact-contract.mjs'
import { recordAgentRuntimeDiagnostic } from '../agent-runtime-diagnostics.mjs'
import {
  createAgentMergeOperationExecutor,
  isMergePathBoundaryError,
} from './agent-merge-operation-executor.mjs'
import {
  createAgentMergeOperationJournal,
} from './agent-merge-operation-journal.mjs'

const LOCAL_WORKSPACE_MODES = new Set(['local_overlay', 'local_worktree'])
const TERMINAL_ENTRY_STATUSES = new Set(['applied', 'discarded', 'conflicted', 'failed'])

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function text(value, field, maxLength = 1_024) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new TypeError(`${field} is required`)
  if (normalized.length > maxLength) throw new TypeError(`${field} exceeds ${maxLength} characters`)
  return normalized
}

function normalizeEntry(row) {
  if (!row) return null
  return {
    id: row.id,
    runId: row.run_id,
    artifactId: row.artifact_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    operation: row.operation,
    status: row.status,
    dependencyIds: parseJson(row.dependency_ids_json, []),
    enqueueOrder: Number(row.enqueue_order || 0),
    decision: parseJson(row.decision_json),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  }
}

function getWorkspace(db, workspaceId) {
  return db.prepare(`
    SELECT * FROM agent_workspaces WHERE id = ?
  `).get(workspaceId)
}

function getArtifactRow(db, artifactId) {
  const row = db.prepare(`
    SELECT status, projection_json FROM agent_artifact_projections WHERE artifact_id = ?
  `).get(artifactId)
  if (!row) throw new TypeError(`Agent artifact ${artifactId} was not found`)
  return {
    status: row.status,
    artifact: validateAgentArtifact(parseJson(row.projection_json)),
    projection: parseJson(row.projection_json),
  }
}

function assertMergeableArtifact(artifact) {
  if (LOCAL_WORKSPACE_MODES.has(artifact.workspaceMode)) return
  if (artifact.workspaceMode === 'opaque_no_write_surface') {
    throw new TypeError('Opaque artifacts never enter the local merge queue')
  }
  if (
    artifact.workspaceMode !== 'remote_provider_workspace'
    || artifact.provenance.origin !== 'provider_reference'
    || artifact.provenance.verifiedLocalImport !== true
    || !artifact.provenance.providerArtifactId
  ) {
    throw new TypeError('Remote artifacts require a verified local import before merge')
  }
}

export function createAgentMergeQueue({
  db,
  eventStore = null,
  now = Date.now,
  idFactory = () => `merge_${randomUUID()}`,
  onTerminalDecision = null,
  diagnostics = null,
  warn = console.warn,
  operationCheckpoint = null,
} = {}) {
  if (!db) throw new TypeError('Agent merge queue requires db')
  const operationJournal = createAgentMergeOperationJournal({ db, now })
  const operationExecutor = createAgentMergeOperationExecutor({
    journal: operationJournal,
    now,
    operationCheckpoint,
  })

  function get(entryId) {
    return normalizeEntry(db.prepare(`
      SELECT * FROM agent_merge_queue WHERE id = ?
    `).get(String(entryId || '').trim()))
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
      SELECT * FROM agent_merge_queue
      ${where}
      ORDER BY enqueue_order ASC, id ASC
    `).all(...args).map(normalizeEntry)
  }

  function dependenciesApplied(dependencyIds) {
    if (dependencyIds.length === 0) return true
    const statuses = dependencyIds.map((artifactId) => db.prepare(`
      SELECT status FROM agent_artifact_projections WHERE artifact_id = ?
    `).get(artifactId)?.status || 'missing')
    return statuses.every((status) => status === 'applied')
  }

  function emitRequested(entry, artifact) {
    if (!eventStore) return
    eventStore.append({
      runId: entry.runId,
      nodeId: artifact.nodeId,
      parentNodeId: null,
      attemptId: artifact.attemptId,
      providerEventId: null,
      providerCorrelationKey: null,
      idempotencyKey: `${entry.runId}:agent_merge_requested:${entry.id}`,
      kind: 'agent_merge_requested',
      payload: {
        mergeId: entry.id,
        artifactIds: [artifact.id],
        operation: entry.operation,
      },
      createdAt: entry.createdAt,
    })
  }

  function enqueue({ runId, artifactId, operation = 'apply' } = {}) {
    const normalizedRunId = text(runId, 'runId', 256)
    const normalizedArtifactId = text(artifactId, 'artifactId', 256)
    const normalizedOperation = String(operation || '').trim()
    if (!['apply', 'discard'].includes(normalizedOperation)) {
      throw new TypeError('Merge operation must be apply or discard')
    }
    const { status: artifactStatus, artifact } = getArtifactRow(db, normalizedArtifactId)
    if (artifact.runId !== normalizedRunId) throw new TypeError('Artifact does not belong to the run')
    if (!['staged', 'conflicted'].includes(artifactStatus)) {
      throw new TypeError(`Artifact ${artifact.id} is not reviewable from ${artifactStatus}`)
    }
    const existingDecision = db.prepare(`
      SELECT * FROM agent_merge_queue
      WHERE artifact_id = ?
      ORDER BY enqueue_order ASC
      LIMIT 1
    `).get(artifact.id)
    if (existingDecision) {
      if (existingDecision.operation === normalizedOperation) {
        return normalizeEntry(existingDecision)
      }
      throw new TypeError(`Artifact ${artifact.id} already has a merge decision`)
    }
    for (const dependencyId of artifact.dependencies) {
      const dependency = db.prepare(`
        SELECT run_id FROM agent_artifact_projections WHERE artifact_id = ?
      `).get(dependencyId)
      if (!dependency || dependency.run_id !== normalizedRunId) {
        throw new TypeError('Artifact dependency must belong to the same run')
      }
    }
    assertMergeableArtifact(artifact)
    const workspace = getWorkspace(db, artifact.workspaceId)
    if (!workspace || workspace.run_id !== normalizedRunId) {
      throw new TypeError('Artifact workspace does not belong to the run')
    }
    const entryId = text(idFactory(), 'mergeId', 256)
    const createdAt = now()
    const enqueueOrder = Number(db.prepare(`
      SELECT COALESCE(MAX(enqueue_order), 0) + 1 AS next_order FROM agent_merge_queue
    `).get()?.next_order || 1)
    const status = dependenciesApplied(artifact.dependencies) ? 'queued' : 'blocked'
    db.prepare(`
      INSERT INTO agent_merge_queue (
        id, run_id, artifact_id, workspace_id, project_id, operation, status,
        dependency_ids_json, enqueue_order, decision_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
    `).run(
      entryId,
      normalizedRunId,
      artifact.id,
      artifact.workspaceId,
      workspace.project_id,
      normalizedOperation,
      status,
      JSON.stringify(artifact.dependencies),
      enqueueOrder,
      createdAt,
      createdAt,
    )
    const entry = get(entryId)
    emitRequested(entry, artifact)
    return entry
  }

  function updateEntry(entryId, status, decision) {
    db.prepare(`
      UPDATE agent_merge_queue
      SET status = ?, decision_json = ?, updated_at = ?
      WHERE id = ?
    `).run(status, JSON.stringify(decision || {}), now(), entryId)
    return get(entryId)
  }

  function updateArtifact(artifactId, status, details = {}) {
    const current = getArtifactRow(db, artifactId)
    const projection = {
      ...current.projection,
      status,
      ...details,
    }
    db.prepare(`
      UPDATE agent_artifact_projections
      SET status = ?, projection_json = ?, updated_at = ?
      WHERE artifact_id = ?
    `).run(status, JSON.stringify(projection), now(), artifactId)
    return projection
  }

  function emitCompleted(entry, artifact, status, decision = {}) {
    if (!eventStore) return
    eventStore.append({
      runId: entry.runId,
      nodeId: artifact.nodeId,
      parentNodeId: null,
      attemptId: artifact.attemptId,
      providerEventId: null,
      providerCorrelationKey: null,
      idempotencyKey: `${entry.runId}:agent_merge_completed:${entry.id}:${status}`,
      kind: 'agent_merge_completed',
      payload: {
        mergeId: entry.id,
        artifactIds: [artifact.id],
        status: status === 'applied'
          ? 'completed'
          : status === 'conflicted'
            ? 'conflicted'
            : status,
        decision,
      },
      createdAt: now(),
    })
  }

  function nextProcessableEntry() {
    const entries = list().filter((entry) => !TERMINAL_ENTRY_STATUSES.has(entry.status))
    for (const entry of entries) {
      if (dependenciesApplied(entry.dependencyIds)) {
        if (entry.status === 'blocked') updateEntry(entry.id, 'queued', {})
        return get(entry.id)
      }
    }
    return null
  }

  function finalizeTerminal(entry, artifact, status, details, artifactDetails) {
    return db.transaction(() => {
      updateArtifact(artifact.id, status, artifactDetails)
      const terminal = updateEntry(entry.id, status, details)
      if (operationJournal.get(entry.id)) {
        operationJournal.setPhase(entry.id, 'completed')
      }
      return terminal
    })()
  }

  async function processEntry(entry) {
    const { artifact } = getArtifactRow(db, entry.artifactId)
    const workspace = getWorkspace(db, entry.workspaceId)
    if (!workspace) throw new TypeError(`Workspace ${entry.workspaceId} was not found`)
    if (entry.operation === 'discard') {
      const decision = { discardedAt: now(), reason: 'user_discarded' }
      const discarded = finalizeTerminal(
        entry,
        artifact,
        'discarded',
        decision,
        { mergeDecision: decision },
      )
      emitCompleted(discarded, artifact, 'discarded', decision)
      await onTerminalDecision?.(discarded)
      return { entry: discarded, decision }
    }
    let result
    try {
      result = await operationExecutor.apply(entry, artifact, workspace)
    } catch (error) {
      if (!isMergePathBoundaryError(error)) throw error
      result = {
        status: 'failed',
        error: {
          reason: 'path_boundary_violation',
          field: error.field,
          detectedAt: now(),
        },
      }
    }
    if (result.status === 'conflicted') {
      const conflicted = finalizeTerminal(
        entry,
        artifact,
        'conflicted',
        result.conflict,
        { conflict: result.conflict },
      )
      emitCompleted(conflicted, artifact, 'conflicted', result.conflict)
      recordAgentRuntimeDiagnostic(diagnostics, {
        kind: 'merge_conflict',
        runId: entry.runId,
        nodeId: artifact.nodeId,
        attemptId: artifact.attemptId,
        providerClass: 'managed_hierarchy',
        outcome: 'conflicted',
        attributes: { reason_code: result.conflict.reason },
      }, warn)
      await onTerminalDecision?.(conflicted)
      return { entry: conflicted, conflict: result.conflict }
    }
    if (result.status === 'failed') {
      const failed = finalizeTerminal(
        entry,
        artifact,
        'failed',
        result.error,
        { mergeError: result.error },
      )
      emitCompleted(failed, artifact, 'failed', result.error)
      await onTerminalDecision?.(failed)
      return { entry: failed, error: result.error }
    }
    const applied = finalizeTerminal(
      entry,
      artifact,
      'applied',
      result.decision,
      { mergeDecision: result.decision },
    )
    emitCompleted(applied, artifact, 'applied', result.decision)
    await onTerminalDecision?.(applied)
    return { entry: applied, decision: result.decision }
  }

  async function processNext() {
    const entry = nextProcessableEntry()
    return entry ? processEntry(entry) : null
  }

  async function recoverInterrupted() {
    const recovered = []
    for (const operation of operationJournal.listIncomplete()) {
      const entry = get(operation.mergeId)
      if (!entry) continue
      if (TERMINAL_ENTRY_STATUSES.has(entry.status)) {
        operationJournal.setPhase(entry.id, 'completed')
        continue
      }
      recovered.push(await processEntry(entry))
    }
    return recovered
  }

  return Object.freeze({
    enqueue,
    get,
    list,
    processNext,
    recoverInterrupted,
  })
}
