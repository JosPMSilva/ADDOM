import { createHash } from 'node:crypto'

import { createAgentContextPacket } from './agent-context-packet.mjs'
import {
  resolveAgentChildPermission,
} from './agent-permission-resolver.mjs'
import {
  clipAgentLabel,
  permissionForManagedRole,
} from './agent-managed-runtime-values.mjs'

function hashSnapshot(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function digestUtf8(value) {
  const body = String(value ?? '')
  return {
    contentDigest: createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex'),
    contentBytes: Buffer.byteLength(body, 'utf8'),
  }
}

function boundedNumber(value, fallback, max, { integer = false } = {}) {
  const parsed = Number(value)
  const resolved = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  const bounded = Math.min(max, Math.max(integer ? 1 : 0, resolved))
  return integer ? Math.ceil(bounded) : bounded
}

function taskReservations(task, limits) {
  const promptCharacters = [
    task.instruction,
    task.injected_context,
    task.expected_output_format,
  ].reduce((sum, value) => sum + String(value || '').length, 0)
  return {
    tokenReservation: boundedNumber(
      task.estimatedTokens ?? task.estimated_tokens,
      Math.ceil(promptCharacters / 4) + 1_024,
      limits.maxTotalTokens,
      { integer: true },
    ),
    costReservationUsd: boundedNumber(
      task.estimatedCostUsd ?? task.estimated_cost_usd,
      0,
      limits.maxCostUsd,
    ),
    toolCallReservation: boundedNumber(
      task.estimatedToolCalls ?? task.estimated_tool_calls,
      8,
      limits.maxToolCalls,
      { integer: true },
    ),
  }
}

export function buildSelectedEvidenceFromTask({ task, sourceNodeId, idFactory }) {
  const body = String(task?.injected_context || '')
  if (!body.trim()) return []
  const digest = digestUtf8(body)
  return [{
    evidenceId: idFactory('evidence'),
    sourceNodeId,
    summary: clipAgentLabel(body, 4_000),
    visibility: 'private',
    contentKind: 'injected_context',
    contentDigest: digest.contentDigest,
    contentBytes: digest.contentBytes,
  }]
}

export function assertInjectedContextEvidenceIntegrity(packet, task) {
  const rows = Array.isArray(packet?.selectedEvidence) ? packet.selectedEvidence : []
  const body = String(task?.injected_context ?? '')
  for (const evidence of rows) {
    if (evidence?.contentKind !== 'injected_context') continue
    if (!evidence?.contentDigest) continue
    const expected = digestUtf8(body)
    if (evidence.contentDigest !== expected.contentDigest) {
      throw new TypeError('context packet evidence contentDigest does not match injected_context')
    }
    if (
      evidence.contentBytes !== undefined
      && evidence.contentBytes !== expected.contentBytes
    ) {
      throw new TypeError('context packet evidence contentBytes does not match injected_context')
    }
  }
}

export function rebuildManagedContextPacketFromTask({
  priorPacket,
  task,
  packetId,
  workspaceLease,
  createdAt,
  idFactory,
} = {}) {
  const prior = { ...(priorPacket || {}) }
  delete prior.packetHash
  return createAgentContextPacket({
    ...prior,
    packetId,
    workspaceLease: workspaceLease || prior.workspaceLease,
    createdAt,
    selectedEvidence: buildSelectedEvidenceFromTask({
      task,
      sourceNodeId: prior.fromNodeId,
      idFactory,
    }),
  })
}

export function resolveManagedChildAuthority({ parent, role, snapshot }) {
  const requestedPermission = permissionForManagedRole(role)
  const {
    permissionSnapshot,
    permissionSnapshotHash,
  } = resolveAgentChildPermission({
    parentSnapshot: parent.permissionSnapshot,
    requestedSnapshot: requestedPermission,
    policy: { allowedChildLevels: [requestedPermission.level] },
  })
  return {
    capabilitySnapshotHash: hashSnapshot(snapshot.nodeCapabilities),
    permissionSnapshot,
    permissionSnapshotHash,
  }
}

export function createManagedChildContracts({
  graph,
  parent,
  owner,
  task,
  role,
  snapshot,
  background,
  adapterId,
  createdAt,
  idFactory,
  authority = null,
  identity = null,
  workspaceLease = null,
}) {
  const {
    capabilitySnapshotHash,
    permissionSnapshot,
    permissionSnapshotHash,
  } = authority || resolveManagedChildAuthority({ parent, role, snapshot })
  const reservations = taskReservations(task, graph.run.budgetSnapshot)
  const nodeId = identity?.nodeId || idFactory('agent')
  const attemptId = identity?.attemptId || idFactory('attempt')
  const spawnRequestId = identity?.spawnRequestId || idFactory('spawn')
  const resolvedWorkspaceLease = workspaceLease || {
    leaseId: idFactory('workspace_lease'),
    workspaceId: `workspace_${graph.run.projectId}`,
    workspaceMode: role.canWriteFiles ? 'local_overlay' : 'local_shared_read',
    baseRevision: `pending:workspace_${graph.run.projectId}`,
    expiresAt: createdAt + graph.run.budgetSnapshot.maxDurationMs,
  }
  const node = {
    schemaVersion: 1,
    id: nodeId,
    runId: graph.run.id,
    parentNodeId: parent.id,
    rootNodeId: graph.run.rootNodeId,
    providerId: snapshot.providerId,
    modelId: snapshot.modelId,
    providerAgentId: null,
    providerThreadId: null,
    roleId: clipAgentLabel(role.id || role.name || 'agent', 256),
    roleLabel: clipAgentLabel(role.name || role.id || 'Agent', 256),
    taskId: clipAgentLabel(task.task_id || idFactory('task'), 256),
    taskSummary: clipAgentLabel(task.instruction || 'Delegated task', 1_000),
    depth: parent.depth + 1,
    branchPath: [...parent.branchPath, nodeId],
    generation: parent.depth + 1,
    spawnedByEventId: null,
    spawnRequestId,
    status: 'queued',
    attemptId,
    capabilitySnapshot: snapshot.nodeCapabilities,
    capabilitySnapshotHash,
    providerCapabilitySnapshot: snapshot,
    permissionSnapshot,
    permissionSnapshotHash,
    workspaceId: resolvedWorkspaceLease.workspaceId,
    workspaceMode: resolvedWorkspaceLease.workspaceMode,
    createdAt,
    startedAt: null,
    finishedAt: null,
    exclusiveUsage: null,
    inclusiveUsage: null,
    childCount: 0,
    resultSummary: null,
    errorSummary: null,
  }
  const attempt = {
    schemaVersion: 1,
    id: attemptId,
    runId: graph.run.id,
    nodeId,
    attemptNumber: 1,
    parentAttemptId: graph.attempts.some((entry) => entry.id === owner.attemptId)
      ? owner.attemptId
      : null,
    providerRequestId: null,
    providerCorrelationKey: null,
    reconciliationState: 'pending_match',
    status: 'queued',
    capabilitySnapshot: snapshot.nodeCapabilities,
    capabilitySnapshotHash,
    providerCapabilitySnapshot: snapshot,
    permissionSnapshot,
    permissionSnapshotHash,
    workspaceId: node.workspaceId,
    workspaceMode: node.workspaceMode,
    background,
    backgroundKind: background ? 'auto_backgrounded' : 'foreground',
    startedAt: null,
    finishedAt: null,
    stopReason: null,
    errorCode: null,
    usage: null,
    recoveryOfAttemptId: null,
  }
  const contextPacket = createAgentContextPacket({
    packetId: idFactory('context'),
    fromNodeId: parent.id,
    toNodeId: node.id,
    relation: 'parent_child',
    selectedEvidence: buildSelectedEvidenceFromTask({
      task,
      sourceNodeId: parent.id,
      idFactory,
    }),
    ancestry: node.branchPath,
    provenance: [{ source: 'delegated_task', sourceId: node.taskId }],
    effectiveCapabilityHash: capabilitySnapshotHash,
    effectivePermissionHash: permissionSnapshotHash,
    workspaceLease: resolvedWorkspaceLease,
    budgetLease: {
      leaseId: idFactory('budget_lease'),
      tokenLimit: reservations.tokenReservation,
      costLimitUsd: reservations.costReservationUsd,
      toolCallLimit: reservations.toolCallReservation,
      expiresAt: createdAt + graph.run.budgetSnapshot.maxDurationMs,
    },
    providerRoute: {
      adapterId,
      providerId: snapshot.providerId,
      modelId: snapshot.modelId,
    },
    toolDescriptors: permissionSnapshot.toolClasses.map((toolClass) => ({
      name: `${toolClass}_tools`,
      toolClass,
    })),
    serviceDescriptors: [],
    createdAt,
  })
  assertInjectedContextEvidenceIntegrity(contextPacket, task)
  return {
    attempt,
    contextPacket,
    node,
    parentAttemptId: attempt.parentAttemptId || `coordinator_${graph.run.id}`,
    reservations,
    spawnRequestId,
  }
}
