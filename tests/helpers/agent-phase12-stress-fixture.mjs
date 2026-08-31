import { resolveAgentPolicyProfile } from '../../src/common/agents/agent-policy-profile.mjs'
import {
  AGENT_TEST_TIMESTAMP,
  makeAgentArtifact,
  makeAgentAttempt,
  makeAgentCapabilities,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentPermission,
  makeAgentRun,
  seedAgentWorkspace,
} from './agent-runtime-fixtures.mjs'

const ROOT_NODE_ID = 'agent_000'
const HEAVY_SEGMENTS_PER_NODE = 1_000
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)

function assertStressSpec(spec) {
  const exact = {
    nodeCount: 500,
    maximumDepth: 8,
    eventCount: 25_000,
    transcriptHeavyNodeCount: 20,
    pendingApprovalCount: 10,
    stagedArtifactCount: 10,
    completedNodeCount: 400,
    failedNodeCount: 50,
    activeNodeCount: 50,
  }
  for (const [field, expected] of Object.entries(exact)) {
    if (Number(spec?.[field]) !== expected) {
      throw new TypeError(`Phase 12 stress fixture ${field} must equal ${expected}`)
    }
  }
  if (!Array.isArray(spec.providerIds) || spec.providerIds.length < 2) {
    throw new TypeError('Phase 12 stress fixture requires multiple provider IDs')
  }
}

function nodeId(index) {
  return `agent_${String(index).padStart(3, '0')}`
}

function parentIndex(index) {
  return index === 0 ? null : Math.floor((index - 1) / 2)
}

function buildBranchPath(index) {
  const path = []
  let current = index
  while (current !== null) {
    path.unshift(nodeId(current))
    current = parentIndex(current)
  }
  return path
}

function statusForIndex(index, spec) {
  if (index === 0) return 'running'
  if (index <= spec.completedNodeCount) return 'completed'
  if (index <= spec.completedNodeCount + spec.failedNodeCount) return 'failed'
  return 'running'
}

function terminalSnapshot(node, status) {
  const result = {
    ...node,
    status,
    finishedAt: status === 'running' ? null : AGENT_TEST_TIMESTAMP + 100,
    resultSummary: status === 'completed' ? `Completed ${node.id}` : null,
    errorSummary: status === 'failed' ? `Failed ${node.id}` : null,
  }
  return result
}

function runningSnapshot(node) {
  return {
    ...node,
    status: 'running',
    attemptId: `attempt_${node.id}_1`,
    startedAt: AGENT_TEST_TIMESTAMP + 1,
    finishedAt: null,
    resultSummary: null,
    errorSummary: null,
  }
}

function queuedSnapshot(node) {
  return {
    ...node,
    status: 'queued',
    attemptId: null,
    startedAt: null,
    finishedAt: null,
    resultSummary: null,
    errorSummary: null,
  }
}

function attemptForNode(node, status = 'running') {
  const terminal = status === 'completed' || status === 'failed'
  return makeAgentAttempt(node.id, {
    parentAttemptId: node.parentNodeId ? `attempt_${node.parentNodeId}_1` : null,
    status,
    reconciliationState: 'matched',
    permissionSnapshot: node.permissionSnapshot,
    workspaceId: node.workspaceId,
    workspaceMode: node.workspaceMode,
    finishedAt: terminal ? AGENT_TEST_TIMESTAMP + 100 : null,
    stopReason: terminal ? `${status}_for_phase12_fixture` : null,
    errorCode: status === 'failed' ? 'PHASE12_FIXTURE_FAILURE' : null,
  })
}

function makeDraft(kind, payload, {
  eventId,
  node,
  attemptId,
  createdAt = AGENT_TEST_TIMESTAMP,
}) {
  return makeAgentEventDraft(kind, payload, {
    eventId,
    idempotencyKey: `phase12:${eventId}`,
    nodeId: node.id,
    parentNodeId: node.parentNodeId,
    attemptId,
    createdAt,
  })
}

function buildNodes(spec) {
  const writeNodeStart = spec.nodeCount - spec.stagedArtifactCount
  const nodes = []
  for (let index = 0; index < spec.nodeCount; index += 1) {
    const id = nodeId(index)
    const parent = parentIndex(index)
    const branchPath = buildBranchPath(index)
    const canWrite = index >= writeNodeStart
    const providerId = spec.providerIds[index % spec.providerIds.length]
    const childCount = [index * 2 + 1, index * 2 + 2]
      .filter((childIndex) => childIndex < spec.nodeCount)
      .length
    const base = makeAgentNode({
      id,
      rootNodeId: ROOT_NODE_ID,
      parentNodeId: parent === null ? null : nodeId(parent),
      providerId,
      modelId: `phase12-model-${providerId}`,
      roleId: index === 0 ? 'root' : `role_${index % 8}`,
      roleLabel: index === 0 ? 'Primary agent' : `Agent role ${index % 8}`,
      taskId: `task_${id}`,
      taskSummary: `Deterministic Phase 12 task ${index}`,
      depth: branchPath.length - 1,
      branchPath,
      generation: branchPath.length - 1,
      spawnedByEventId: index === 0 ? null : `event_spawn_${id}`,
      spawnRequestId: index === 0 ? null : `spawn_${id}`,
      capabilitySnapshot: makeAgentCapabilities({
        maxDepthHint: spec.maximumDepth,
        maxConcurrencyHint: 64,
      }),
      permissionSnapshot: makeAgentPermission(index === 0 ? 'all' : canWrite ? 'read_write' : 'read_only'),
      workspaceId: canWrite ? `workspace_${id}` : 'workspace_01',
      workspaceMode: index === 0 ? 'local_worktree' : canWrite ? 'local_overlay' : 'local_shared_read',
      childCount,
    })
    nodes.push(terminalSnapshot(runningSnapshot(base), statusForIndex(index, spec)))
  }
  return nodes
}

function buildLifecycleDrafts(spec, run, nodes) {
  const drafts = [
    makeDraft('agent_run_created', {
      policyProfileId: 'ultra',
      run,
      rootNode: queuedSnapshot(nodes[0]),
    }, {
      eventId: 'event_run_created',
      node: nodes[0],
      attemptId: null,
    }),
    makeDraft('agent_run_started', {
      run,
    }, {
      eventId: 'event_run_started',
      node: nodes[0],
      attemptId: null,
      createdAt: AGENT_TEST_TIMESTAMP + 1,
    }),
    makeDraft('agent_started', {
      attemptId: `attempt_${ROOT_NODE_ID}_1`,
      node: runningSnapshot(nodes[0]),
      attempt: attemptForNode(nodes[0]),
    }, {
      eventId: 'event_started_agent_000',
      node: nodes[0],
      attemptId: `attempt_${ROOT_NODE_ID}_1`,
      createdAt: AGENT_TEST_TIMESTAMP + 2,
    }),
  ]

  for (let index = 1; index < nodes.length; index += 1) {
    const node = nodes[index]
    drafts.push(makeDraft('agent_spawned', {
      spawnRequestId: `spawn_${node.id}`,
      childNodeId: node.id,
      node: queuedSnapshot(node),
    }, {
      eventId: `event_spawn_${node.id}`,
      node,
      attemptId: null,
      createdAt: AGENT_TEST_TIMESTAMP + 3 + index,
    }))
    drafts.push(makeDraft('agent_started', {
      attemptId: `attempt_${node.id}_1`,
      node: runningSnapshot(node),
      attempt: attemptForNode(node),
    }, {
      eventId: `event_started_${node.id}`,
      node,
      attemptId: `attempt_${node.id}_1`,
      createdAt: AGENT_TEST_TIMESTAMP + 503 + index,
    }))
  }
  return drafts
}

function buildTranscriptDrafts(spec, nodes, count) {
  const heavy = nodes.slice(1, spec.transcriptHeavyNodeCount + 1)
  const ordinary = [nodes[0], ...nodes.slice(spec.transcriptHeavyNodeCount + 1)]
  const assignments = []
  for (const node of heavy) {
    for (let index = 0; index < HEAVY_SEGMENTS_PER_NODE; index += 1) assignments.push(node)
  }
  let ordinaryIndex = 0
  while (assignments.length < count) {
    assignments.push(ordinary[ordinaryIndex % ordinary.length])
    ordinaryIndex += 1
  }
  return assignments.map((node, index) => makeDraft('agent_commentary_delta', {
    delta: `Phase 12 transcript ${index} for ${node.id}.`,
  }, {
    eventId: `event_delta_${String(index).padStart(5, '0')}`,
    node,
    attemptId: `attempt_${node.id}_1`,
    createdAt: AGENT_TEST_TIMESTAMP + 1_100 + index,
  }))
}

function buildPendingWorkDrafts(spec, nodes) {
  const selected = nodes.slice(-spec.pendingApprovalCount)
  const approvalDrafts = []
  const artifactDrafts = []
  for (let index = 0; index < selected.length; index += 1) {
    const node = selected[index]
    const approvalId = `approval_phase12_${String(index).padStart(2, '0')}`
    approvalDrafts.push(makeDraft('agent_approval_requested', {
      approvalId,
      permissionLevel: 'execute',
      operationSummary: `Run deterministic verification ${index}`,
      toolCallId: `tool_phase12_${String(index).padStart(2, '0')}`,
      projectId: 'project_01',
      threadId: 'thread_01',
      providerId: node.providerId,
      modelId: node.modelId,
      permissionSnapshotHash: HASH_A,
      workspaceSnapshotHash: HASH_B,
      operationScopeHash: HASH_C,
      operationScope: { command: `verify-${index}` },
      workspaceSnapshot: { workspaceId: node.workspaceId, mode: node.workspaceMode },
      parentPath: node.branchPath,
      allowedResolutionScopes: ['once'],
    }, {
      eventId: `event_${approvalId}`,
      node,
      attemptId: `attempt_${node.id}_1`,
      createdAt: AGENT_TEST_TIMESTAMP + 24_700 + index,
    }))

    const artifactId = `artifact_phase12_${String(index).padStart(2, '0')}`
    const artifact = makeAgentArtifact({
      id: artifactId,
      nodeId: node.id,
      attemptId: `attempt_${node.id}_1`,
      workspaceId: node.workspaceId,
      workspaceMode: node.workspaceMode,
      path: `phase12/output-${index}.txt`,
      digest: `sha256:phase12-${String(index).padStart(2, '0')}`,
      createdAt: AGENT_TEST_TIMESTAMP + 24_720 + index,
    })
    artifactDrafts.push(makeDraft('agent_artifact_staged', {
      artifactId,
      workspaceMode: artifact.workspaceMode,
      path: artifact.path,
      artifact,
    }, {
      eventId: `event_${artifactId}`,
      node,
      attemptId: `attempt_${node.id}_1`,
      createdAt: artifact.createdAt,
    }))
  }
  return { approvalDrafts, artifactDrafts }
}

function buildTerminalDrafts(spec, nodes) {
  const terminalCount = spec.completedNodeCount + spec.failedNodeCount
  return nodes.slice(1, terminalCount + 1).map((node, index) => {
    const status = statusForIndex(index + 1, spec)
    const kind = status === 'completed' ? 'agent_completed' : 'agent_failed'
    const payload = status === 'completed'
      ? {
          resultSummary: node.resultSummary,
          node,
          attempt: attemptForNode(node, status),
        }
      : {
          errorSummary: node.errorSummary,
          node,
          attempt: attemptForNode(node, status),
        }
    return makeDraft(kind, payload, {
      eventId: `event_${status}_${node.id}`,
      node,
      attemptId: `attempt_${node.id}_1`,
      createdAt: AGENT_TEST_TIMESTAMP + 24_800 + index,
    })
  })
}

export function buildPhase12StressFixture(input) {
  const spec = structuredClone(input)
  assertStressSpec(spec)
  const nodes = buildNodes(spec)
  const run = makeAgentRun({
    id: 'run_01',
    rootNodeId: ROOT_NODE_ID,
    status: 'running',
    policyProfileId: 'ultra',
    providerMix: [...spec.providerIds],
    activeNodeCount: spec.activeNodeCount,
    queuedNodeCount: 0,
    terminalNodeCount: spec.completedNodeCount + spec.failedNodeCount,
    budgetSnapshot: resolveAgentPolicyProfile('ultra').limits,
    finalAuthorityNodeId: ROOT_NODE_ID,
    completionReason: null,
  })
  const lifecycleDrafts = buildLifecycleDrafts(spec, run, nodes)
  const terminalDrafts = buildTerminalDrafts(spec, nodes)
  const { approvalDrafts, artifactDrafts } = buildPendingWorkDrafts(spec, nodes)
  const transcriptCount = spec.eventCount
    - lifecycleDrafts.length
    - approvalDrafts.length
    - artifactDrafts.length
    - terminalDrafts.length
  const transcriptDrafts = buildTranscriptDrafts(spec, nodes, transcriptCount)
  const drafts = [
    ...lifecycleDrafts,
    ...transcriptDrafts,
    ...approvalDrafts,
    ...artifactDrafts,
    ...terminalDrafts,
  ]
  if (drafts.length !== spec.eventCount) {
    throw new TypeError(`Phase 12 stress fixture generated ${drafts.length} events`)
  }
  return {
    spec,
    run,
    nodes,
    drafts,
    transcriptHeavyNodeIds: nodes.slice(1, spec.transcriptHeavyNodeCount + 1).map((node) => node.id),
    pendingApprovalIds: approvalDrafts.map((draft) => draft.payload.approvalId),
    stagedArtifactIds: artifactDrafts.map((draft) => draft.payload.artifactId),
    statusCounts: {
      active: nodes.filter((node) => node.status === 'running').length,
      completed: nodes.filter((node) => node.status === 'completed').length,
      failed: nodes.filter((node) => node.status === 'failed').length,
    },
  }
}

export function seedPhase12StressWorkspace(db) {
  seedAgentWorkspace(db)
}
