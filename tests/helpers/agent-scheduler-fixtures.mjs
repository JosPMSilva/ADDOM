import Database from 'better-sqlite3'

import { runMigrations } from '../../src/main/memory/db-migrations.mjs'

export const TEST_POLICY_LIMITS = Object.freeze({
  maxDepth: 4,
  maxLiveAgents: 4,
  maxDescendants: 12,
  maxFanOut: 4,
  maxQueuedNodes: 12,
  maxSpawnsPerMinute: 12,
  maxAttemptsPerNode: 3,
  maxTotalTokens: 10_000,
  maxCostUsd: 25,
  maxDurationMs: 60_000,
  maxToolCalls: 100,
  cancellationDeadlineMs: 5_000,
})

export function createSchedulerDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

export function makeSchedulerEntry(overrides = {}) {
  const nodeId = overrides.nodeId || 'node_root'
  const rootNodeId = overrides.rootNodeId || 'node_root'
  return {
    attemptId: overrides.attemptId || `attempt_${nodeId}_1`,
    runId: overrides.runId || 'run_a',
    nodeId,
    parentNodeId: nodeId === rootNodeId ? null : rootNodeId,
    projectId: overrides.projectId || 'project_a',
    threadId: overrides.threadId || 'thread_a',
    providerId: overrides.providerId || 'openai-account',
    depth: overrides.depth ?? (nodeId === rootNodeId ? 0 : 1),
    tokenReservation: overrides.tokenReservation ?? 100,
    costReservationUsd: overrides.costReservationUsd ?? 0.25,
    toolCallReservation: overrides.toolCallReservation ?? 2,
    createdAt: overrides.createdAt ?? 1_000,
    ...overrides,
  }
}

export function insertSchedulerOwnership(
  db,
  entry,
  { limits = TEST_POLICY_LIMITS, runCreatedAt = 1_000 } = {},
) {
  db.prepare(`
    INSERT OR IGNORE INTO workspace_projects (
      id, path, name, created_at, last_opened_at, last_worked_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entry.projectId,
    `C:/workspace/${entry.projectId}`,
    entry.projectId,
    runCreatedAt,
    runCreatedAt,
    runCreatedAt,
  )
  db.prepare(`
    INSERT OR IGNORE INTO chat_threads (
      id, project_id, title, created_at, updated_at, last_viewed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entry.threadId,
    entry.projectId,
    entry.threadId,
    runCreatedAt,
    runCreatedAt,
    runCreatedAt,
  )

  const rootNodeId = entry.parentNodeId || entry.nodeId
  db.prepare(`
    INSERT OR IGNORE INTO agent_runs (
      id, project_id, thread_id, turn_id, root_node_id, status, contract_json,
      last_run_sequence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'running', ?, 0, ?, ?)
  `).run(
    entry.runId,
    entry.projectId,
    entry.threadId,
    `turn_${entry.runId}`,
    rootNodeId,
    JSON.stringify({
      id: entry.runId,
      projectId: entry.projectId,
      threadId: entry.threadId,
      status: 'running',
      budgetSnapshot: limits,
      createdAt: runCreatedAt,
    }),
    runCreatedAt,
    runCreatedAt,
  )
  if (entry.parentNodeId) {
    db.prepare(`
      INSERT OR IGNORE INTO agent_nodes (
        id, run_id, parent_node_id, status, provider_id, model_id, depth,
        contract_json, last_node_sequence, created_at, updated_at
      ) VALUES (?, ?, NULL, 'running', ?, 'root-model', 0, '{}', 0, ?, ?)
    `).run(entry.parentNodeId, entry.runId, entry.providerId, runCreatedAt, runCreatedAt)
  }
  db.prepare(`
    INSERT OR IGNORE INTO agent_nodes (
      id, run_id, parent_node_id, status, provider_id, model_id, depth,
      contract_json, last_node_sequence, created_at, updated_at
    ) VALUES (?, ?, ?, 'queued', ?, 'test-model', ?, '{}', 0, ?, ?)
  `).run(
    entry.nodeId,
    entry.runId,
    entry.parentNodeId,
    entry.providerId,
    entry.depth,
    entry.createdAt,
    entry.createdAt,
  )
  db.prepare(`
    INSERT OR IGNORE INTO agent_attempts (
      id, run_id, node_id, attempt_number, status, reconciliation_state,
      workspace_mode, contract_json, created_at, updated_at
    ) VALUES (?, ?, ?, 1, 'queued', 'pending_match', 'local_shared_read', '{}', ?, ?)
  `).run(
    entry.attemptId,
    entry.runId,
    entry.nodeId,
    entry.createdAt,
    entry.createdAt,
  )
}
