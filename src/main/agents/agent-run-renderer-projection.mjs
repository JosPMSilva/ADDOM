function usage(value) {
  if (!value || typeof value !== 'object') return null
  const safe = { ...value }
  delete safe.rawProviderUsage
  return safe
}

function capabilities(value) {
  if (!value || typeof value !== 'object') return null
  return { ...value }
}

export function projectAgentRun(run = {}) {
  return {
    schemaVersion: 1,
    id: run.id,
    projectId: run.projectId,
    threadId: run.threadId,
    turnId: run.turnId,
    rootNodeId: run.rootNodeId,
    status: run.status,
    policyProfileId: run.policyProfileId,
    providerMix: [...(run.providerMix || [])],
    activeNodeCount: Number(run.activeNodeCount || 0),
    queuedNodeCount: Number(run.queuedNodeCount || 0),
    terminalNodeCount: Number(run.terminalNodeCount || 0),
    exclusiveUsage: usage(run.exclusiveUsage),
    inclusiveUsage: usage(run.inclusiveUsage),
    finalAuthorityNodeId: run.finalAuthorityNodeId,
    completionReason: run.completionReason || null,
    reconciliationStatus: run.reconciliationStatus,
    createdAt: Number(run.createdAt || 0),
    startedAt: run.startedAt == null ? null : Number(run.startedAt),
    finishedAt: run.finishedAt == null ? null : Number(run.finishedAt),
  }
}

export function projectAgentNode(node = {}, { conversationIdsByNode = {} } = {}) {
  return {
    schemaVersion: 1,
    id: node.id,
    runId: node.runId,
    conversationId: node.conversationId || conversationIdsByNode[node.id] || null,
    parentNodeId: node.parentNodeId || null,
    rootNodeId: node.rootNodeId,
    providerId: node.providerId,
    modelId: node.modelId,
    roleId: node.roleId,
    roleLabel: node.roleLabel,
    taskId: node.taskId,
    taskSummary: node.taskSummary,
    depth: Number(node.depth || 0),
    branchPath: [...(node.branchPath || [])],
    generation: Number(node.generation || 0),
    spawnedByEventId: node.spawnedByEventId || null,
    status: node.status,
    attemptId: node.attemptId || null,
    capabilitySnapshot: capabilities(node.capabilitySnapshot),
    workspaceMode: node.workspaceMode,
    createdAt: Number(node.createdAt || 0),
    startedAt: node.startedAt == null ? null : Number(node.startedAt),
    finishedAt: node.finishedAt == null ? null : Number(node.finishedAt),
    exclusiveUsage: usage(node.exclusiveUsage),
    inclusiveUsage: usage(node.inclusiveUsage),
    childCount: Number(node.childCount || 0),
    resultSummary: node.resultSummary || null,
    errorSummary: node.errorSummary || null,
  }
}

export function projectAgentAttempt(attempt = {}) {
  return {
    schemaVersion: 1,
    id: attempt.id,
    runId: attempt.runId,
    nodeId: attempt.nodeId,
    attemptNumber: Number(attempt.attemptNumber || 0),
    parentAttemptId: attempt.parentAttemptId || null,
    reconciliationState: attempt.reconciliationState,
    status: attempt.status,
    capabilitySnapshot: capabilities(attempt.capabilitySnapshot),
    workspaceMode: attempt.workspaceMode,
    background: attempt.background === true,
    backgroundKind: attempt.backgroundKind,
    startedAt: attempt.startedAt == null ? null : Number(attempt.startedAt),
    finishedAt: attempt.finishedAt == null ? null : Number(attempt.finishedAt),
    stopReason: attempt.stopReason || null,
    errorCode: attempt.errorCode || null,
    usage: usage(attempt.usage),
    recoveryOfAttemptId: attempt.recoveryOfAttemptId || null,
  }
}

export function projectAgentApproval(approval = {}) {
  return {
    id: approval.id,
    runId: approval.runId,
    nodeId: approval.nodeId,
    attemptId: approval.attemptId || null,
    status: approval.status,
    permissionLevel: approval.permissionLevel,
    operationSummary: approval.operationSummary,
    toolCallId: approval.toolCallId,
    operationScope: approval.operationScope || null,
    parentPath: [...(approval.parentPath || [])],
    allowedResolutionScopes: [...(approval.allowedResolutionScopes || [])],
    outcome: approval.outcome || null,
    resolutionScope: approval.resolutionScope || null,
    createdAt: Number(approval.createdAt || 0),
    updatedAt: Number(approval.updatedAt || 0),
  }
}

export function projectAgentArtifact(artifact = {}) {
  return {
    schemaVersion: 1,
    id: artifact.id,
    runId: artifact.runId,
    nodeId: artifact.nodeId,
    attemptId: artifact.attemptId,
    workspaceMode: artifact.workspaceMode,
    baseRevision: artifact.baseRevision,
    kind: artifact.kind,
    operationType: artifact.operationType,
    path: artifact.path,
    originalPath: artifact.originalPath || null,
    digest: artifact.digest,
    sizeBytes: Number(artifact.sizeBytes || 0),
    dependencies: [...(artifact.dependencies || [])],
    provenance: {
      origin: artifact.provenance?.origin,
      verifiedLocalImport: artifact.provenance?.verifiedLocalImport === true,
      providerArtifactId: artifact.provenance?.providerArtifactId || null,
    },
    status: artifact.status || 'staged',
    createdAt: Number(artifact.createdAt || 0),
  }
}

export function projectAgentWorkspace(workspace = {}) {
  return {
    id: workspace.id,
    runId: workspace.runId,
    nodeId: workspace.nodeId,
    attemptId: workspace.attemptId,
    projectId: workspace.projectId,
    mode: workspace.mode,
    status: workspace.status,
    baseRevision: workspace.baseRevision,
    leaseExpiresAt: Number(workspace.leaseExpiresAt || 0),
    createdAt: Number(workspace.createdAt || 0),
    updatedAt: Number(workspace.updatedAt || 0),
  }
}

function projectEventPayload(payload = {}, options = {}) {
  const result = {}
  const scalarFields = [
    'attemptId', 'boundary', 'childNodeId', 'completionReason', 'delta', 'errorSummary',
    'finalAuthorityNodeId', 'messageId', 'operation', 'operationSummary', 'peerNodeId',
    'reason', 'resolutionScope', 'resultSummary', 'scope', 'spawnRequestId', 'status',
    'targetNodeId', 'taskSummary', 'text', 'toolCallId', 'toolClass', 'toolName',
  ]
  for (const field of scalarFields) {
    if (Object.hasOwn(payload, field)) result[field] = payload[field]
  }
  if (Object.hasOwn(payload, 'output')) result.output = payload.output
  if (payload.run) result.run = projectAgentRun(payload.run)
  if (payload.rootNode) result.rootNode = projectAgentNode(payload.rootNode, options)
  if (payload.node) result.node = projectAgentNode(payload.node, options)
  if (payload.attempt) result.attempt = projectAgentAttempt(payload.attempt)
  if (payload.artifact) result.artifact = projectAgentArtifact(payload.artifact)
  if (Array.isArray(payload.artifactIds)) result.artifactIds = [...payload.artifactIds]
  if (payload.approvalId) result.approvalId = payload.approvalId
  return result
}

export function projectAgentEvent(event = {}, options = {}) {
  return {
    schemaVersion: 1,
    eventId: event.eventId,
    runId: event.runId,
    nodeId: event.nodeId,
    parentNodeId: event.parentNodeId || null,
    runSequence: Number(event.runSequence || 0),
    nodeSequence: Number(event.nodeSequence || 0),
    attemptId: event.attemptId || null,
    kind: event.kind,
    payload: projectEventPayload(event.payload, options),
    createdAt: Number(event.createdAt || 0),
  }
}

export function projectAgentRunGraph(graph = {}, options = {}) {
  return {
    schemaVersion: 1,
    run: projectAgentRun(graph.run),
    nodes: (graph.nodes || []).map((node) => projectAgentNode(node, options)),
    attempts: (graph.attempts || []).map(projectAgentAttempt),
    approvals: (graph.approvals || []).map(projectAgentApproval),
    artifacts: (graph.artifacts || []).map(projectAgentArtifact),
    workspaces: (graph.workspaces || []).map(projectAgentWorkspace),
    mergeQueue: (graph.mergeQueue || []).map((entry) => ({
      id: entry.id,
      runId: entry.runId,
      artifactId: entry.artifactId,
      operation: entry.operation,
      status: entry.status,
      dependencyIds: [...(entry.dependencyIds || [])],
      enqueueOrder: Number(entry.enqueueOrder || 0),
      decision: entry.decision || {},
      createdAt: Number(entry.createdAt || 0),
      updatedAt: Number(entry.updatedAt || 0),
    })),
    lastRunSequence: Number(graph.lastRunSequence || 0),
    nodeSequences: { ...(graph.nodeSequences || {}) },
  }
}
