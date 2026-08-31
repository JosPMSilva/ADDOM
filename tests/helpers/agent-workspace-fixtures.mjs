import {
  makeAgentCapabilities,
  makeAgentPermission,
} from './agent-runtime-fixtures.mjs'

export function insertAgentWorkspaceOwnership(db, {
  projectId = 'project_01',
  threadId = 'thread_01',
  runId = 'run_01',
  nodeId = 'node_01',
  attemptId = 'attempt_01',
  projectRoot,
  permissionSnapshot = makeAgentPermission('read_write'),
  capabilitySnapshot = makeAgentCapabilities(),
  workspaceMode = 'local_shared_read',
  workspaceId = `workspace_${attemptId}`,
  now = 1_752_600_000_000,
} = {}) {
  db.prepare(`
    INSERT OR IGNORE INTO workspace_projects (
      id, path, name, created_at, last_opened_at, last_worked_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId, projectRoot, projectId, now, now, now)
  db.prepare(`
    INSERT INTO chat_threads (
      id, project_id, title, created_at, updated_at, last_viewed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(threadId, projectId, threadId, now, now, now)
  db.prepare(`
    INSERT INTO agent_runs (
      id, project_id, thread_id, turn_id, root_node_id, status, contract_json,
      last_run_sequence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'running', ?, 0, ?, ?)
  `).run(
    runId,
    projectId,
    threadId,
    `turn_${runId}`,
    nodeId,
    JSON.stringify({
      id: runId,
      projectId,
      threadId,
      rootNodeId: nodeId,
      status: 'running',
    }),
    now,
    now,
  )
  const node = {
    id: nodeId,
    runId,
    parentNodeId: null,
    providerId: 'test-provider',
    modelId: 'test-model',
    depth: 0,
    permissionSnapshot,
    capabilitySnapshot,
    branchPath: [nodeId],
    workspaceId,
    workspaceMode,
  }
  db.prepare(`
    INSERT INTO agent_nodes (
      id, run_id, parent_node_id, status, provider_id, model_id, depth,
      contract_json, last_node_sequence, created_at, updated_at
    ) VALUES (?, ?, NULL, 'running', ?, ?, 0, ?, 0, ?, ?)
  `).run(
    nodeId,
    runId,
    node.providerId,
    node.modelId,
    JSON.stringify(node),
    now,
    now,
  )
  const attempt = {
    id: attemptId,
    runId,
    nodeId,
    attemptNumber: 1,
    status: 'running',
    permissionSnapshot,
    capabilitySnapshot,
    workspaceId,
    workspaceMode,
  }
  db.prepare(`
    INSERT INTO agent_attempts (
      id, run_id, node_id, attempt_number, status, reconciliation_state,
      workspace_mode, contract_json, created_at, updated_at
    ) VALUES (?, ?, ?, 1, 'running', 'matched', ?, ?, ?, ?)
  `).run(
    attemptId,
    runId,
    nodeId,
    workspaceMode,
    JSON.stringify(attempt),
    now,
    now,
  )
}
