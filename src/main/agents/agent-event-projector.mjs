import { createHash } from 'node:crypto'

import { validateAgentArtifact } from '../../common/agents/agent-artifact-contract.mjs'
import { validateAgentAttempt } from '../../common/agents/agent-attempt-contract.mjs'
import { validateAgentEventSequence } from '../../common/agents/agent-event-contract.mjs'
import { validateAgentNode } from '../../common/agents/agent-node-contract.mjs'
import { validateAgentRun } from '../../common/agents/agent-run-contract.mjs'
import { readAgentRunEvents } from './agent-event-log.mjs'

const TRANSCRIPT_KINDS = new Set([
  'agent_commentary_delta',
  'agent_assistant_delta',
  'agent_reasoning_delta',
  'agent_reasoning_boundary',
  'agent_tool_started',
  'agent_tool_output',
  'agent_tool_completed',
  'agent_message_sent',
  'agent_message_received',
  'agent_orchestration_continuation_sent',
  'agent_orchestration_continuation_received',
  'agent_context_sent',
  'agent_context_received',
  'agent_final_message',
])
const RECONCILIATION_BLOCKED_TERMINAL_STATES = new Set([
  'reconciling',
  'provider_ahead',
  'provider_unverified_terminal',
  'forked_history',
])
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const TERMINAL_SAFE_EVENT_KINDS = new Set([
  'agent_approval_resolved',
  'agent_approval_consumed',
  'agent_artifact_staged',
  'agent_merge_requested',
  'agent_merge_completed',
  'agent_reconciliation_recorded',
])

function stringify(value) {
  return JSON.stringify(value)
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function upsertUsage(db, runId, ownerType, ownerId, exclusiveUsage, inclusiveUsage, sequence) {
  db.prepare(`
    INSERT INTO agent_usage_projections (
      run_id, owner_type, owner_id, exclusive_usage_json, inclusive_usage_json, updated_sequence
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, owner_type, owner_id) DO UPDATE SET
      exclusive_usage_json = excluded.exclusive_usage_json,
      inclusive_usage_json = excluded.inclusive_usage_json,
      updated_sequence = excluded.updated_sequence
  `).run(
    runId,
    ownerType,
    ownerId,
    exclusiveUsage === null ? null : stringify(exclusiveUsage),
    inclusiveUsage === null ? null : stringify(inclusiveUsage),
    sequence,
  )
}

function upsertRun(db, input, sequence, updatedAt) {
  const run = validateAgentRun(input)
  db.prepare(`
    INSERT INTO agent_runs (
      id, project_id, thread_id, turn_id, root_node_id, status, contract_json,
      last_run_sequence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      contract_json = excluded.contract_json,
      last_run_sequence = MAX(agent_runs.last_run_sequence, excluded.last_run_sequence),
      updated_at = excluded.updated_at
  `).run(
    run.id,
    run.projectId,
    run.threadId,
    run.turnId,
    run.rootNodeId,
    run.status,
    stringify(run),
    sequence,
    run.createdAt,
    updatedAt,
  )
  upsertUsage(db, run.id, 'run', run.id, run.exclusiveUsage, run.inclusiveUsage, sequence)
  return run
}

function upsertNode(db, input, sequence, updatedAt) {
  const node = validateAgentNode(input)
  db.prepare(`
    INSERT INTO agent_nodes (
      id, run_id, parent_node_id, status, provider_id, model_id, depth, contract_json,
      last_node_sequence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      contract_json = excluded.contract_json,
      last_node_sequence = MAX(agent_nodes.last_node_sequence, excluded.last_node_sequence),
      updated_at = excluded.updated_at
  `).run(
    node.id,
    node.runId,
    node.parentNodeId,
    node.status,
    node.providerId,
    node.modelId,
    node.depth,
    stringify(node),
    sequence,
    node.createdAt,
    updatedAt,
  )
  upsertUsage(db, node.runId, 'node', node.id, node.exclusiveUsage, node.inclusiveUsage, sequence)
  return node
}

function upsertAttempt(db, input, sequence, updatedAt) {
  const attempt = validateAgentAttempt(input)
  db.prepare(`
    INSERT INTO agent_attempts (
      id, run_id, node_id, attempt_number, status, reconciliation_state,
      workspace_mode, contract_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      reconciliation_state = excluded.reconciliation_state,
      workspace_mode = excluded.workspace_mode,
      contract_json = excluded.contract_json,
      updated_at = excluded.updated_at
  `).run(
    attempt.id,
    attempt.runId,
    attempt.nodeId,
    attempt.attemptNumber,
    attempt.status,
    attempt.reconciliationState,
    attempt.workspaceMode,
    stringify(attempt),
    attempt.startedAt ?? updatedAt,
    updatedAt,
  )
  upsertUsage(db, attempt.runId, 'attempt', attempt.id, attempt.usage, null, sequence)
  return attempt
}

function assertTerminalProjectionIsReconciled(attempt, kind) {
  if (RECONCILIATION_BLOCKED_TERMINAL_STATES.has(attempt?.reconciliationState)) {
    throw new TypeError(
      `${kind} cannot project a terminal attempt while provider reconciliation is ${attempt.reconciliationState}`,
    )
  }
}

function assertRunTerminalProjectionIsReconciled(run, kind) {
  if (
    ['completed', 'failed', 'cancelled'].includes(run?.status)
    && RECONCILIATION_BLOCKED_TERMINAL_STATES.has(run?.reconciliationStatus)
  ) {
    throw new TypeError(
      `${kind} cannot project a terminal run while provider reconciliation is ${run.reconciliationStatus}`,
    )
  }
}

function insertTranscriptSegment(db, event) {
  const segment = {
    eventId: event.eventId,
    runId: event.runId,
    nodeId: event.nodeId,
    attemptId: event.attemptId,
    kind: event.kind,
    payload: event.payload,
    runSequence: event.runSequence,
    nodeSequence: event.nodeSequence,
    createdAt: event.createdAt,
  }
  const segmentJson = stringify(segment)
  db.prepare(`
    INSERT OR IGNORE INTO agent_transcript_segments (
      event_id, run_id, node_id, attempt_id, kind, run_sequence, node_sequence,
      segment_json, content_hash, source_sequence_start, source_sequence_end, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.runId,
    event.nodeId,
    event.attemptId,
    event.kind,
    event.runSequence,
    event.nodeSequence,
    segmentJson,
    hash(segmentJson),
    event.runSequence,
    event.runSequence,
    event.createdAt,
  )
}

function projectApproval(db, event) {
  const approvalId = event.payload.approvalId
  if (event.kind === 'agent_approval_requested') {
    const projection = {
      id: approvalId,
      runId: event.runId,
      nodeId: event.nodeId,
      attemptId: event.attemptId,
      status: 'pending',
      permissionLevel: event.payload.permissionLevel,
      operationSummary: event.payload.operationSummary,
      toolCallId: event.payload.toolCallId,
      operationScope: event.payload.operationScope,
      operationScopeHash: event.payload.operationScopeHash,
      parentPath: event.payload.parentPath,
      projectId: event.payload.projectId,
      threadId: event.payload.threadId,
      providerId: event.payload.providerId,
      modelId: event.payload.modelId,
      permissionSnapshotHash: event.payload.permissionSnapshotHash,
      workspaceSnapshot: event.payload.workspaceSnapshot,
      workspaceSnapshotHash: event.payload.workspaceSnapshotHash,
      allowedResolutionScopes: event.payload.allowedResolutionScopes,
      outcome: null,
      resolutionScope: null,
      grant: null,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    }
    db.prepare(`
      INSERT INTO agent_approval_projections (
        approval_id, run_id, node_id, attempt_id, status, projection_json,
        updated_sequence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      approvalId,
      event.runId,
      event.nodeId,
      event.attemptId,
      'pending',
      stringify(projection),
      event.runSequence,
      event.createdAt,
      event.createdAt,
    )
    return
  }

  const row = db.prepare(`
    SELECT projection_json FROM agent_approval_projections WHERE approval_id = ?
  `).get(approvalId)
  if (!row) throw new TypeError(`Approval ${approvalId} was resolved before it was requested`)
  const previous = JSON.parse(row.projection_json)
  const projection = {
    ...previous,
    status: event.kind === 'agent_approval_consumed' ? 'consumed' : event.payload.outcome,
    outcome: event.kind === 'agent_approval_consumed'
      ? previous.outcome
      : event.payload.outcome,
    resolutionScope: event.kind === 'agent_approval_consumed'
      ? previous.resolutionScope
      : event.payload.resolutionScope,
    grant: event.kind === 'agent_approval_consumed'
      ? {
          ...previous.grant,
          usedAt: event.payload.usedAt,
        }
      : event.payload.grant,
    updatedAt: event.createdAt,
  }
  db.prepare(`
    UPDATE agent_approval_projections
    SET status = ?, projection_json = ?, updated_sequence = ?, updated_at = ?
    WHERE approval_id = ?
  `).run(projection.status, stringify(projection), event.runSequence, event.createdAt, approvalId)
}

function projectArtifact(db, event) {
  const artifact = validateAgentArtifact(event.payload.artifact)
  if (artifact.id !== event.payload.artifactId) {
    throw new TypeError('agent_artifact_staged artifactId must match payload.artifact.id')
  }
  db.prepare(`
    INSERT INTO agent_artifact_projections (
      artifact_id, run_id, node_id, attempt_id, status, projection_json,
      updated_sequence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'staged', ?, ?, ?, ?)
    ON CONFLICT(artifact_id) DO UPDATE SET
      status = excluded.status,
      projection_json = excluded.projection_json,
      updated_sequence = excluded.updated_sequence,
      updated_at = excluded.updated_at
  `).run(
    artifact.id,
    artifact.runId,
    artifact.nodeId,
    artifact.attemptId,
    stringify({ ...artifact, status: 'staged' }),
    event.runSequence,
    artifact.createdAt,
    event.createdAt,
  )
}

function projectArtifactMerge(db, event) {
  for (const artifactId of event.payload.artifactIds) {
    const row = db.prepare(`
      SELECT status, projection_json
      FROM agent_artifact_projections
      WHERE artifact_id = ? AND run_id = ?
    `).get(artifactId, event.runId)
    if (!row) throw new TypeError(`Merge references unknown artifact ${artifactId}`)
    const previous = JSON.parse(row.projection_json)
    const projection = event.kind === 'agent_merge_requested'
      ? {
          ...previous,
          pendingMerge: {
            id: event.payload.mergeId,
            operation: event.payload.operation,
            requestedAt: event.createdAt,
          },
        }
      : {
          ...previous,
          status: event.payload.status === 'completed' ? 'applied' : event.payload.status,
          pendingMerge: null,
          mergeDecision: event.payload.decision,
          mergeId: event.payload.mergeId,
          mergedAt: event.createdAt,
        }
    const status = projection.status || row.status
    db.prepare(`
      UPDATE agent_artifact_projections
      SET status = ?, projection_json = ?, updated_sequence = ?, updated_at = ?
      WHERE artifact_id = ? AND run_id = ?
    `).run(
      status,
      stringify(projection),
      event.runSequence,
      event.createdAt,
      artifactId,
      event.runId,
    )
  }
}

function assertFinalizedRunMutationAllowed(db, event, { replay = false } = {}) {
  const status = db.prepare(`SELECT status FROM agent_runs WHERE id = ?`).get(event.runId)?.status
  const replayReset = replay && event.kind === 'agent_run_created'
  if (
    TERMINAL_RUN_STATUSES.has(status)
    && !replayReset
    && !TERMINAL_SAFE_EVENT_KINDS.has(event.kind)
  ) {
    throw new TypeError(
      `${event.kind} cannot mutate finalized run ${event.runId}; record reconciliation instead`,
    )
  }
}

export function projectAgentEvent(db, event, options = {}) {
  assertFinalizedRunMutationAllowed(db, event, options)
  const payload = event.payload
  switch (event.kind) {
    case 'agent_run_created':
      upsertRun(db, payload.run, event.runSequence, event.createdAt)
      upsertNode(db, payload.rootNode, event.nodeSequence, event.createdAt)
      break
    case 'agent_run_started':
    case 'agent_run_finalizing':
    case 'agent_run_completed':
    case 'agent_run_failed':
    case 'agent_run_cancelled':
      if (!payload.run) throw new TypeError(`${event.kind} requires payload.run`)
      assertRunTerminalProjectionIsReconciled(payload.run, event.kind)
      upsertRun(db, payload.run, event.runSequence, event.createdAt)
      break
    case 'agent_spawned':
      upsertNode(db, payload.node, event.nodeSequence, event.createdAt)
      break
    case 'agent_attempt_queued':
    case 'agent_started':
      upsertNode(db, payload.node, event.nodeSequence, event.createdAt)
      upsertAttempt(db, payload.attempt, event.runSequence, event.createdAt)
      break
    case 'agent_status_changed': {
      const snapshot = payload.snapshot
      if (!snapshot) throw new TypeError('agent_status_changed requires payload.snapshot')
      if (payload.entity === 'run') {
        assertRunTerminalProjectionIsReconciled(snapshot, event.kind)
        upsertRun(db, snapshot, event.runSequence, event.createdAt)
      }
      if (payload.entity === 'node') upsertNode(db, snapshot, event.nodeSequence, event.createdAt)
      if (payload.entity === 'attempt') {
        assertTerminalProjectionIsReconciled(snapshot, event.kind)
        upsertAttempt(db, snapshot, event.runSequence, event.createdAt)
      }
      break
    }
    case 'agent_completed':
    case 'agent_failed':
    case 'agent_cancelled':
      if (!payload.node || !payload.attempt) throw new TypeError(`${event.kind} requires payload.node and payload.attempt`)
      assertTerminalProjectionIsReconciled(payload.attempt, event.kind)
      upsertNode(db, payload.node, event.nodeSequence, event.createdAt)
      upsertAttempt(db, payload.attempt, event.runSequence, event.createdAt)
      break
    case 'agent_approval_requested':
    case 'agent_approval_resolved':
    case 'agent_approval_consumed':
      projectApproval(db, event)
      break
    case 'agent_artifact_staged':
      projectArtifact(db, event)
      break
    case 'agent_merge_requested':
    case 'agent_merge_completed':
      projectArtifactMerge(db, event)
      break
    case 'agent_reconciliation_recorded':
      db.prepare(`
        UPDATE agent_runs
        SET recovery_json = ?, updated_at = MAX(updated_at, ?)
        WHERE id = ?
      `).run(stringify({
        reconciliationState: payload.state,
        reason: payload.reason,
        sourceEventId: payload.sourceEventId,
        recordedAt: event.createdAt,
      }), event.createdAt, event.runId)
      break
    default:
      break
  }

  if (TRANSCRIPT_KINDS.has(event.kind)) insertTranscriptSegment(db, event)
  db.prepare(`
    UPDATE agent_runs
    SET last_run_sequence = MAX(last_run_sequence, ?), updated_at = MAX(updated_at, ?)
    WHERE id = ?
  `).run(event.runSequence, event.createdAt, event.runId)
  db.prepare(`
    UPDATE agent_nodes
    SET last_node_sequence = MAX(last_node_sequence, ?), updated_at = MAX(updated_at, ?)
    WHERE id = ? AND run_id = ?
  `).run(event.nodeSequence, event.createdAt, event.nodeId, event.runId)
}

export function rebuildAgentRunProjection(db, runId) {
  const events = validateAgentEventSequence(readAgentRunEvents(db, runId))
  if (events.length === 0) throw new TypeError(`Agent run ${runId} has no canonical events to replay`)

  const rebuild = db.transaction(() => {
    db.prepare(`DELETE FROM agent_attempts WHERE run_id = ?`).run(runId)
    db.prepare(`DELETE FROM agent_transcript_segments WHERE run_id = ?`).run(runId)
    db.prepare(`DELETE FROM agent_approval_projections WHERE run_id = ?`).run(runId)
    db.prepare(`DELETE FROM agent_artifact_projections WHERE run_id = ?`).run(runId)
    db.prepare(`DELETE FROM agent_usage_projections WHERE run_id = ?`).run(runId)
    db.prepare(`DELETE FROM agent_nodes WHERE run_id = ?`).run(runId)
    db.prepare(`
      UPDATE agent_runs
      SET last_run_sequence = 0, recovery_json = '{}'
      WHERE id = ?
    `).run(runId)
    for (const event of events) projectAgentEvent(db, event, { replay: true })
    return events.length
  })

  return { replayedEvents: rebuild() }
}

export function getAgentTranscriptKinds() {
  return new Set(TRANSCRIPT_KINDS)
}
