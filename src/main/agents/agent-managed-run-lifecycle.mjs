import { resolveAgentPolicyProfile } from '../../common/agents/agent-policy-profile.mjs'
import { resolveAgentPolicyFromSettings } from '../../common/agents/agent-settings.mjs'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function clip(value, maxLength = 4_000) {
  const text = String(value || '').trim()
  return text.slice(0, maxLength) || 'Agent completed.'
}

export function createManagedRunLifecycle({
  eventStore,
  repository,
  runPolicies,
  now,
  idFactory,
  draft,
  statusDraft,
}) {
  function createRun({
    projectId,
    threadId,
    turnId,
    policyProfileId,
    policySettings = null,
    rootTaskSummary,
    snapshots,
  }) {
    const runId = idFactory('run')
    const rootNodeId = idFactory('agent')
    const createdAt = now()
    const policy = policySettings
      ? resolveAgentPolicyFromSettings(policySettings)
      : resolveAgentPolicyProfile(policyProfileId)
    const firstSnapshot = snapshots[0]
    const rootNode = {
      schemaVersion: 1,
      id: rootNodeId,
      runId,
      parentNodeId: null,
      rootNodeId,
      providerId: firstSnapshot.providerId,
      modelId: firstSnapshot.modelId,
      providerAgentId: null,
      providerThreadId: null,
      roleId: 'root',
      roleLabel: 'Primary agent',
      taskId: `root_task_${runId}`,
      taskSummary: clip(rootTaskSummary, 1_000),
      depth: 0,
      branchPath: [rootNodeId],
      generation: 0,
      spawnedByEventId: null,
      spawnRequestId: null,
      status: 'running',
      attemptId: null,
      capabilitySnapshot: firstSnapshot.nodeCapabilities,
      providerCapabilitySnapshot: firstSnapshot,
      permissionSnapshot: { level: 'all', toolClasses: ['read', 'write', 'execute'] },
      workspaceId: `workspace_${projectId}`,
      workspaceMode: 'local_worktree',
      createdAt,
      startedAt: createdAt,
      finishedAt: null,
      exclusiveUsage: null,
      inclusiveUsage: null,
      childCount: 0,
      resultSummary: null,
      errorSummary: null,
    }
    const run = {
      schemaVersion: 1,
      id: runId,
      projectId,
      threadId,
      turnId,
      rootNodeId,
      status: 'created',
      policyProfileId: policy.id,
      createdAt,
      startedAt: null,
      finishedAt: null,
      providerMix: [...new Set(snapshots.map((snapshot) => snapshot.providerId))],
      providerCapabilitySnapshots: snapshots,
      activeNodeCount: 0,
      queuedNodeCount: 0,
      terminalNodeCount: 0,
      exclusiveUsage: null,
      inclusiveUsage: null,
      budgetSnapshot: policy.effectiveLimits,
      finalAuthorityNodeId: rootNodeId,
      completionReason: null,
      reconciliationStatus: 'matched',
    }
    eventStore.append(draft('agent_run_created', {
      runId,
      nodeId: rootNodeId,
      parentNodeId: null,
      payload: { policyProfileId: policy.id, run, rootNode },
      suffix: runId,
    }))
    eventStore.append(draft('agent_run_started', {
      runId,
      nodeId: rootNodeId,
      parentNodeId: null,
      payload: {
        run: {
          ...run,
          status: 'running',
          startedAt: createdAt,
        },
      },
      suffix: runId,
    }))
    runPolicies.set(runId, policy)
    return repository.getRunGraph(runId)
  }

  function syncRunCounts(runId) {
    const graph = repository.getRunGraph(runId)
    if (!graph || TERMINAL_STATUSES.has(graph.run.status)) return
    const nodes = graph.nodes.filter((node) => node.id !== graph.run.rootNodeId)
    const activeNodeCount = nodes.filter((node) => (
      ['starting', 'running', 'waiting', 'approval_required', 'paused', 'cancelling']
        .includes(node.status)
    )).length
    const queuedNodeCount = nodes.filter((node) => node.status === 'queued').length
    const terminalNodeCount = nodes.filter((node) => TERMINAL_STATUSES.has(node.status)).length
    if (
      graph.run.activeNodeCount === activeNodeCount
      && graph.run.queuedNodeCount === queuedNodeCount
      && graph.run.terminalNodeCount === terminalNodeCount
    ) return
    eventStore.append(statusDraft(
      'run',
      graph.run.status,
      graph.run.status,
      {
        ...graph.run,
        activeNodeCount,
        queuedNodeCount,
        terminalNodeCount,
      },
      null,
      `counts:${graph.lastRunSequence}`,
    ))
  }

  function ensureRunRoute(runId, snapshot) {
    const graph = repository.getRunGraph(runId)
    if (graph.run.providerCapabilitySnapshots.some((entry) => (
      entry.providerId === snapshot.providerId && entry.modelId === snapshot.modelId
    ))) return
    const nextRun = {
      ...graph.run,
      providerMix: [...new Set([...graph.run.providerMix, snapshot.providerId])],
      providerCapabilitySnapshots: [...graph.run.providerCapabilitySnapshots, snapshot],
    }
    eventStore.append(statusDraft(
      'run',
      graph.run.status,
      graph.run.status,
      nextRun,
      null,
      `route:${snapshot.providerId}:${snapshot.modelId}`,
    ))
  }

  return Object.freeze({ createRun, ensureRunRoute, syncRunCounts })
}
