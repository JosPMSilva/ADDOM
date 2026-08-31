import { createAgentResourceGovernor } from './agent-resource-governor.mjs'
import { recordAgentRuntimeDiagnostic } from './agent-runtime-diagnostics.mjs'

const LIVE_STATUSES = Object.freeze(['leased'])
const RESERVED_STATUSES = Object.freeze(['queued', 'leased', 'waiting', 'paused'])

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function mapEntry(row) {
  if (!row) return null
  return {
    attemptId: row.attempt_id,
    runId: row.run_id,
    nodeId: row.node_id,
    parentNodeId: row.parent_node_id,
    projectId: row.project_id,
    threadId: row.thread_id,
    providerId: row.provider_id,
    status: row.status,
    depth: Number(row.depth),
    tokenReservation: Number(row.token_reservation),
    costReservationUsd: Number(row.cost_reservation_usd),
    toolCallReservation: Number(row.tool_call_reservation),
    enqueueOrder: Number(row.enqueue_order),
    eligibleAt: Number(row.eligible_at),
    leaseExpiresAt: row.lease_expires_at === null ? null : Number(row.lease_expires_at),
    heartbeatAt: row.heartbeat_at === null ? null : Number(row.heartbeat_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function rotateAfter(values, previous) {
  if (values.length < 2 || !previous) return values
  const index = values.indexOf(previous)
  if (index < 0) return values
  return [...values.slice(index + 1), ...values.slice(0, index + 1)]
}

function fairCandidateOrder(rows, state) {
  const projects = [...new Set(rows.map((row) => row.project_id))]
  const projectOrder = rotateAfter(projects, state.last_project_id)
  const lastRunByProject = parseJson(state.last_run_by_project_json, {})
  const ordered = []
  for (const projectId of projectOrder) {
    const projectRows = rows.filter((row) => row.project_id === projectId)
    const runs = [...new Set(projectRows.map((row) => row.run_id))]
    const runOrder = rotateAfter(runs, lastRunByProject[projectId])
    for (const runId of runOrder) {
      ordered.push(...projectRows.filter((row) => row.run_id === runId))
    }
  }
  return ordered
}

function placeholders(values) {
  return values.map(() => '?').join(', ')
}

export function createAgentScheduler(
  db,
  {
    governor = createAgentResourceGovernor(),
    diagnostics = null,
    now = Date.now,
    leaseDurationMs = 30_000,
    warn = console.warn,
  } = {},
) {
  const insertEntry = db.prepare(`
    INSERT INTO agent_scheduler_entries (
      attempt_id, run_id, node_id, parent_node_id, project_id, thread_id,
      provider_id, status, depth, token_reservation, cost_reservation_usd,
      tool_call_reservation, enqueue_order, eligible_at, lease_expires_at,
      heartbeat_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
  `)

  function list() {
    return db.prepare(`
      SELECT * FROM agent_scheduler_entries ORDER BY enqueue_order ASC
    `).all().map(mapEntry)
  }

  function get(attemptId) {
    return mapEntry(db.prepare(`
      SELECT * FROM agent_scheduler_entries WHERE attempt_id = ?
    `).get(attemptId))
  }

  function limitsForRun(runId) {
    const row = db.prepare(`SELECT contract_json FROM agent_runs WHERE id = ?`).get(runId)
    const contract = parseJson(row?.contract_json, {})
    if (!contract?.budgetSnapshot) throw new TypeError(`Agent run ${runId} has no budget snapshot`)
    return contract.budgetSnapshot
  }

  function nextEnqueueOrder() {
    return Number(db.prepare(`
      SELECT COALESCE(MAX(enqueue_order), 0) + 1 AS next_order
      FROM agent_scheduler_entries
    `).get().next_order)
  }

  function admissionSnapshot(entry, currentTime) {
    const run = db.prepare(`
      SELECT root_node_id, created_at FROM agent_runs WHERE id = ?
    `).get(entry.runId)
    const graph = db.prepare(`
      SELECT
        SUM(CASE WHEN id != ? AND id != ? THEN 1 ELSE 0 END) AS descendant_count,
        SUM(CASE WHEN parent_node_id IS ? AND id != ? THEN 1 ELSE 0 END) AS parent_child_count
      FROM agent_nodes
      WHERE run_id = ?
    `).get(
      run?.root_node_id,
      entry.nodeId,
      entry.parentNodeId,
      entry.nodeId,
      entry.runId,
    )
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN status IN ('queued', 'paused') THEN 1 ELSE 0 END) AS queued_count,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS recent_spawn_count,
        COALESCE(SUM(CASE WHEN status IN (${placeholders(RESERVED_STATUSES)}) THEN token_reservation ELSE 0 END), 0) AS reserved_tokens,
        COALESCE(SUM(CASE WHEN status IN (${placeholders(RESERVED_STATUSES)}) THEN cost_reservation_usd ELSE 0 END), 0) AS reserved_cost,
        COALESCE(SUM(CASE WHEN status IN (${placeholders(RESERVED_STATUSES)}) THEN tool_call_reservation ELSE 0 END), 0) AS reserved_tools
      FROM agent_scheduler_entries
      WHERE run_id = ?
    `).get(
      currentTime - 60_000,
      ...RESERVED_STATUSES,
      ...RESERVED_STATUSES,
      ...RESERVED_STATUSES,
      entry.runId,
    )
    const attempts = db.prepare(`
      SELECT COUNT(*) AS attempt_count FROM agent_attempts WHERE node_id = ?
    `).get(entry.nodeId)
    return {
      descendantCount: Number(graph.descendant_count || 0),
      parentChildCount: Number(graph.parent_child_count || 0),
      parentIsRoot: String(entry.parentNodeId || '') === String(run?.root_node_id || ''),
      queuedCount: Number(row.queued_count || 0),
      recentSpawnCount: Number(row.recent_spawn_count || 0),
      nodeAttemptCount: Number(attempts.attempt_count || 0),
      reservedTokens: Number(row.reserved_tokens || 0),
      reservedCostUsd: Number(row.reserved_cost || 0),
      reservedToolCalls: Number(row.reserved_tools || 0),
      runCreatedAt: Number(run?.created_at || currentTime),
    }
  }

  function evaluateAdmission(entry, currentTime = now()) {
    return governor.evaluateAdmission({
      entry,
      limits: limitsForRun(entry.runId),
      snapshot: admissionSnapshot(entry, currentTime),
      now: currentTime,
    })
  }

  function insertAdmitted(entry, currentTime) {
    insertEntry.run(
      entry.attemptId,
      entry.runId,
      entry.nodeId,
      entry.parentNodeId,
      entry.projectId,
      entry.threadId,
      entry.providerId,
      entry.depth,
      entry.tokenReservation,
      entry.costReservationUsd,
      entry.toolCallReservation,
      nextEnqueueOrder(),
      Math.max(currentTime, entry.createdAt),
      entry.createdAt,
      currentTime,
    )
  }

  function enqueue(entry) {
    const currentTime = now()
    const admission = evaluateAdmission(entry, currentTime)
    if (!admission.admitted) {
      recordAgentRuntimeDiagnostic(diagnostics, {
        kind: 'admission_rejection',
        runId: entry.runId,
        nodeId: entry.nodeId,
        attemptId: entry.attemptId,
        providerClass: 'managed_hierarchy',
        outcome: 'rejected',
        attributes: { reason_code: String(admission.reason || 'unknown').toLowerCase() },
      }, warn)
      return admission
    }
    insertAdmitted(entry, currentTime)
    return { admitted: true, reason: null }
  }

  const enqueueWithOwnershipTransaction = db.transaction((entry, createOwnership) => {
    const currentTime = now()
    const admission = evaluateAdmission(entry, currentTime)
    if (!admission.admitted) return admission
    createOwnership()
    insertAdmitted(entry, currentTime)
    return { admitted: true, reason: null }
  })

  function enqueueWithOwnership(entry, createOwnership) {
    if (typeof createOwnership !== 'function') {
      throw new TypeError('enqueueWithOwnership requires an ownership callback')
    }
    const result = enqueueWithOwnershipTransaction(entry, createOwnership)
    if (!result.admitted) {
      recordAgentRuntimeDiagnostic(diagnostics, {
        kind: 'admission_rejection',
        runId: entry.runId,
        nodeId: entry.nodeId,
        attemptId: entry.attemptId,
        providerClass: 'managed_hierarchy',
        outcome: 'rejected',
        attributes: { reason_code: String(result.reason || 'unknown').toLowerCase() },
      }, warn)
    }
    return result
  }

  function executionSnapshot(entry) {
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN status IN (${placeholders(LIVE_STATUSES)}) THEN 1 ELSE 0 END) AS global_live,
        SUM(CASE WHEN status IN (${placeholders(LIVE_STATUSES)}) AND provider_id = ? THEN 1 ELSE 0 END) AS provider_live,
        SUM(CASE WHEN status IN (${placeholders(LIVE_STATUSES)}) AND project_id = ? THEN 1 ELSE 0 END) AS project_live,
        SUM(CASE WHEN status IN (${placeholders(LIVE_STATUSES)}) AND thread_id = ? THEN 1 ELSE 0 END) AS thread_live,
        SUM(CASE WHEN status IN (${placeholders(LIVE_STATUSES)}) AND run_id = ? THEN 1 ELSE 0 END) AS run_live,
        SUM(CASE WHEN status IN (${placeholders(LIVE_STATUSES)}) AND run_id = ? AND parent_node_id IS ? THEN 1 ELSE 0 END) AS parent_live
      FROM agent_scheduler_entries
    `).get(
      ...LIVE_STATUSES,
      ...LIVE_STATUSES,
      entry.providerId,
      ...LIVE_STATUSES,
      entry.projectId,
      ...LIVE_STATUSES,
      entry.threadId,
      ...LIVE_STATUSES,
      entry.runId,
      ...LIVE_STATUSES,
      entry.runId,
      entry.parentNodeId,
    )
    return {
      globalLiveCount: Number(row.global_live || 0),
      providerLiveCount: Number(row.provider_live || 0),
      projectLiveCount: Number(row.project_live || 0),
      threadLiveCount: Number(row.thread_live || 0),
      runLiveCount: Number(row.run_live || 0),
      parentLiveCount: Number(row.parent_live || 0),
    }
  }

  const claim = db.transaction(() => {
    const currentTime = now()
    const state = db.prepare(`SELECT * FROM agent_scheduler_state WHERE id = 1`).get()
    if (Number(state.paused) === 1) return null
    const rows = db.prepare(`
      SELECT * FROM agent_scheduler_entries
      WHERE status = 'queued' AND eligible_at <= ?
      ORDER BY enqueue_order ASC
    `).all(currentTime)
    for (const row of fairCandidateOrder(rows, state)) {
      const entry = mapEntry(row)
      const grant = governor.evaluateExecution({
        entry,
        limits: limitsForRun(entry.runId),
        snapshot: executionSnapshot(entry),
      })
      if (!grant.granted) continue

      db.prepare(`
        UPDATE agent_scheduler_entries
        SET status = 'leased', lease_expires_at = ?, heartbeat_at = ?, updated_at = ?
        WHERE attempt_id = ? AND status = 'queued'
      `).run(currentTime + leaseDurationMs, currentTime, currentTime, entry.attemptId)
      const lastRunByProject = parseJson(state.last_run_by_project_json, {})
      lastRunByProject[entry.projectId] = entry.runId
      db.prepare(`
        UPDATE agent_scheduler_state
        SET last_project_id = ?, last_run_by_project_json = ?, updated_at = ?
        WHERE id = 1
      `).run(entry.projectId, JSON.stringify(lastRunByProject), currentTime)
      return mapEntry(db.prepare(`
        SELECT * FROM agent_scheduler_entries WHERE attempt_id = ?
      `).get(entry.attemptId))
    }
    return null
  })

  function claimNext() {
    const entry = claim()
    if (entry) {
      recordAgentRuntimeDiagnostic(diagnostics, {
        kind: 'queue_latency',
        runId: entry.runId,
        nodeId: entry.nodeId,
        attemptId: entry.attemptId,
        providerClass: 'managed_hierarchy',
        durationMs: Math.max(0, Number(entry.updatedAt || 0) - Number(entry.createdAt || 0)),
        outcome: 'leased',
      }, warn)
    }
    return entry
  }

  function complete(attemptId) {
    return db.prepare(`DELETE FROM agent_scheduler_entries WHERE attempt_id = ?`).run(attemptId).changes > 0
  }

  function removeAttempts(attemptIds) {
    if (!Array.isArray(attemptIds) || attemptIds.length === 0) return 0
    return db.prepare(`
      DELETE FROM agent_scheduler_entries
      WHERE attempt_id IN (${placeholders(attemptIds)})
    `).run(...attemptIds).changes
  }

  function heartbeat(attemptId) {
    const currentTime = now()
    return db.prepare(`
      UPDATE agent_scheduler_entries
      SET lease_expires_at = ?, heartbeat_at = ?, updated_at = ?
      WHERE attempt_id = ? AND status = 'leased'
    `).run(currentTime + leaseDurationMs, currentTime, currentTime, attemptId).changes > 0
  }

  function listExpiredLeases() {
    return db.prepare(`
      SELECT * FROM agent_scheduler_entries
      WHERE status = 'leased' AND lease_expires_at <= ?
      ORDER BY lease_expires_at ASC, enqueue_order ASC
    `).all(now()).map(mapEntry)
  }

  function isPaused() {
    return Number(db.prepare(`
      SELECT paused FROM agent_scheduler_state WHERE id = 1
    `).get()?.paused || 0) === 1
  }

  function setPaused(paused) {
    const currentTime = now()
    db.prepare(`
      UPDATE agent_scheduler_state SET paused = ?, updated_at = ? WHERE id = 1
    `).run(paused ? 1 : 0, currentTime)
    return paused
  }

  function pauseQueue() {
    return setPaused(true)
  }

  function resumeQueue() {
    return setPaused(false)
  }

  const suspend = db.transaction((parentAttemptId, childEntry) => {
    const parent = db.prepare(`
      SELECT * FROM agent_scheduler_entries WHERE attempt_id = ?
    `).get(parentAttemptId)
    if (!parent || parent.status !== 'leased') {
      throw new TypeError(`Parent attempt ${parentAttemptId} does not hold an execution lease`)
    }
    const currentTime = now()
    const admission = evaluateAdmission(childEntry, currentTime)
    if (!admission.admitted) return admission
    insertAdmitted(childEntry, currentTime)
    db.prepare(`
      UPDATE agent_scheduler_entries
      SET status = 'waiting', lease_expires_at = NULL, heartbeat_at = NULL, updated_at = ?
      WHERE attempt_id = ?
    `).run(currentTime, parentAttemptId)
    return { admitted: true, reason: null }
  })

  function suspendForDescendant(parentAttemptId, childEntry) {
    return suspend(parentAttemptId, childEntry)
  }

  function suspendAttempt(attemptId) {
    const currentTime = now()
    return db.prepare(`
      UPDATE agent_scheduler_entries
      SET status = 'waiting', lease_expires_at = NULL, heartbeat_at = NULL, updated_at = ?
      WHERE attempt_id = ? AND status = 'leased'
    `).run(currentTime, attemptId).changes > 0
  }

  function resumeWaiting(attemptId) {
    const currentTime = now()
    return db.prepare(`
      UPDATE agent_scheduler_entries
      SET status = 'queued', enqueue_order = ?, eligible_at = ?,
          lease_expires_at = NULL, heartbeat_at = NULL, updated_at = ?
      WHERE attempt_id = ? AND status = 'waiting'
    `).run(nextEnqueueOrder(), currentTime, currentTime, attemptId).changes > 0
  }

  return Object.freeze({
    claimNext,
    complete,
    enqueue,
    enqueueWithOwnership,
    get,
    heartbeat,
    isPaused,
    list,
    listExpiredLeases,
    pauseQueue,
    removeAttempts,
    resumeQueue,
    resumeWaiting,
    suspendAttempt,
    suspendForDescendant,
  })
}
