import { readAgentRunEvents, readAgentRunEventsPage } from './agent-event-log.mjs'

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function parseContractRows(rows) {
  return rows.map((row) => parseJson(row.contract_json)).filter(Boolean)
}

export function createAgentRunRepository(db) {
  function getApproval(approvalId) {
    const row = db.prepare(`
      SELECT projection_json FROM agent_approval_projections WHERE approval_id = ?
    `).get(approvalId)
    return parseJson(row?.projection_json)
  }

  function listEvents(runId) {
    return readAgentRunEvents(db, runId)
  }

  function listEventsPage(runId, options = {}) {
    return readAgentRunEventsPage(db, runId, options)
  }

  function readRunRow(runId) {
    return db.prepare(`
      SELECT contract_json, last_run_sequence, recovery_json
      FROM agent_runs WHERE id = ?
    `).get(runId)
  }

  function getLastRunSequence(runId) {
    const row = db.prepare(`
      SELECT last_run_sequence FROM agent_runs WHERE id = ?
    `).get(runId)
    return row ? Number(row.last_run_sequence || 0) : 0
  }

  function buildProjectionGraph(runId, runRow) {
    const nodeRows = db.prepare(`
      SELECT contract_json, id, last_node_sequence
      FROM agent_nodes WHERE run_id = ? ORDER BY depth ASC, created_at ASC, id ASC
    `).all(runId)
    const nodeSequences = Object.fromEntries(
      nodeRows.map((row) => [row.id, Number(row.last_node_sequence || 0)]),
    )
    const attempts = parseContractRows(db.prepare(`
      SELECT contract_json FROM agent_attempts
      WHERE run_id = ? ORDER BY node_id ASC, attempt_number ASC
    `).all(runId))
    const approvals = db.prepare(`
      SELECT projection_json FROM agent_approval_projections
      WHERE run_id = ? ORDER BY created_at ASC, approval_id ASC
    `).all(runId).map((row) => parseJson(row.projection_json)).filter(Boolean)
    const artifacts = db.prepare(`
      SELECT projection_json FROM agent_artifact_projections
      WHERE run_id = ? ORDER BY created_at ASC, artifact_id ASC
    `).all(runId).map((row) => parseJson(row.projection_json)).filter(Boolean)
    const workspaces = db.prepare(`
      SELECT *
      FROM agent_workspaces
      WHERE run_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(runId).map((row) => ({
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
      ownership: parseJson(row.ownership_json, {}),
      recovery: parseJson(row.recovery_json, {}),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
    }))
    const mergeQueue = db.prepare(`
      SELECT *
      FROM agent_merge_queue
      WHERE run_id = ?
      ORDER BY enqueue_order ASC, id ASC
    `).all(runId).map((row) => ({
      id: row.id,
      runId: row.run_id,
      artifactId: row.artifact_id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      operation: row.operation,
      status: row.status,
      dependencyIds: parseJson(row.dependency_ids_json, []),
      enqueueOrder: Number(row.enqueue_order || 0),
      decision: parseJson(row.decision_json, {}),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
    }))
    return {
      schemaVersion: 1,
      run: parseJson(runRow.contract_json),
      nodes: parseContractRows(nodeRows),
      attempts,
      approvals,
      artifacts,
      workspaces,
      mergeQueue,
      lastRunSequence: Number(runRow.last_run_sequence || 0),
      nodeSequences,
    }
  }

  /** Everything the renderer projection reads, without the bulk history it discards. */
  function getRunProjectionGraph(runId) {
    const runRow = readRunRow(runId)
    if (!runRow) return null
    return buildProjectionGraph(runId, runRow)
  }

  function getRunGraph(runId) {
    const runRow = readRunRow(runId)
    if (!runRow) return null
    const transcript = db.prepare(`
      SELECT segment_json FROM agent_transcript_segments
      WHERE run_id = ? ORDER BY run_sequence ASC
    `).all(runId).map((row) => parseJson(row.segment_json)).filter(Boolean)
    const usage = db.prepare(`
      SELECT owner_type, owner_id, exclusive_usage_json, inclusive_usage_json, updated_sequence
      FROM agent_usage_projections
      WHERE run_id = ? ORDER BY owner_type ASC, owner_id ASC
    `).all(runId).map((row) => ({
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      exclusiveUsage: parseJson(row.exclusive_usage_json),
      inclusiveUsage: parseJson(row.inclusive_usage_json),
      updatedSequence: Number(row.updated_sequence || 0),
    }))
    const diagnostics = db.prepare(`
      SELECT event_id, node_id, provider_event_id, metadata_json, created_at, expires_at
      FROM agent_provider_diagnostics
      WHERE run_id = ? ORDER BY created_at ASC, event_id ASC
    `).all(runId).map((row) => ({
      eventId: row.event_id,
      nodeId: row.node_id,
      providerEventId: row.provider_event_id,
      metadata: parseJson(row.metadata_json, {}),
      createdAt: Number(row.created_at || 0),
      expiresAt: Number(row.expires_at || 0),
    }))

    return {
      ...buildProjectionGraph(runId, runRow),
      transcript,
      usage,
      diagnostics,
      recovery: parseJson(runRow.recovery_json, {}),
    }
  }

  return Object.freeze({
    getApproval,
    getLastRunSequence,
    getRunGraph,
    getRunProjectionGraph,
    listEvents,
    listEventsPage,
  })
}
