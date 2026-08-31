const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const ACTIVE_STATUSES = new Set([
  'queued',
  'starting',
  'running',
  'waiting',
  'approval_required',
  'paused',
  'cancelling',
])

function summary(value) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new TypeError('Root result summary is required')
  if (normalized.length > 20_000) throw new TypeError('Root result summary exceeds 20000 characters')
  return normalized
}

export function evaluateAgentRunFinalization(
  graph,
  {
    requiredNodeIds = [],
    rootResultSummary,
    allowPartial = false,
  } = {},
) {
  if (!graph?.run || !Array.isArray(graph.nodes)) {
    throw new TypeError('Agent run graph is required for finalization')
  }
  if (TERMINAL_STATUSES.has(graph.run.status)) {
    return {
      ready: false,
      reason: 'run_terminal_reconciliation_required',
      reconciliationState: 'provider_unverified_terminal',
    }
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  if (!nodes.has(graph.run.rootNodeId)) throw new TypeError('Agent run root node was not found')
  const required = [...new Set(requiredNodeIds)]
  for (const nodeId of required) {
    if (!nodes.has(nodeId) || nodeId === graph.run.rootNodeId) {
      throw new TypeError(`Required descendant ${nodeId} was not found`)
    }
  }
  const blockingNodeIds = required.filter((nodeId) => ACTIVE_STATUSES.has(nodes.get(nodeId).status))
  if (blockingNodeIds.length > 0) {
    return {
      ready: false,
      reason: 'required_descendants_active',
      blockingNodeIds,
    }
  }
  const activeDescendantIds = [...nodes.values()]
    .filter((node) => (
      node.id !== graph.run.rootNodeId && ACTIVE_STATUSES.has(node.status)
    ))
    .map((node) => node.id)
  if (activeDescendantIds.length > 0) {
    return {
      ready: false,
      reason: 'descendants_active',
      blockingNodeIds: activeDescendantIds,
    }
  }
  const failedRequired = required.filter((nodeId) => (
    ['failed', 'cancelled'].includes(nodes.get(nodeId).status)
  ))
  if (failedRequired.length > 0 && !allowPartial) {
    return {
      ready: false,
      reason: 'required_descendants_failed',
      blockingNodeIds: failedRequired,
    }
  }
  const pendingApprovals = (graph.approvals || []).filter((approval) => approval.status === 'pending')
  if (pendingApprovals.length > 0) {
    return {
      ready: false,
      reason: 'pending_approvals',
      approvalIds: pendingApprovals.map((approval) => approval.id),
    }
  }
  const abandonedBranches = [...nodes.values()]
    .filter((node) => (
      node.id !== graph.run.rootNodeId
      && (
        ['failed', 'cancelled'].includes(node.status)
      )
    ))
    .map((node) => ({
      nodeId: node.id,
      status: node.status,
      reason: node.errorSummary || node.status,
    }))
  return {
    ready: true,
    rootResultSummary: summary(rootResultSummary),
    requiredNodeIds: required,
    abandonedBranches,
  }
}

function eventDraft(kind, {
  runId,
  nodeId,
  parentNodeId,
  attemptId = null,
  payload,
  suffix,
  createdAt,
}) {
  return {
    runId,
    nodeId,
    parentNodeId,
    attemptId,
    providerEventId: null,
    providerCorrelationKey: null,
    idempotencyKey: `${runId}:${kind}:${suffix}`,
    kind,
    payload,
    createdAt,
  }
}

export function createAgentRunFinalizer({
  eventStore,
  repository,
  now = Date.now,
} = {}) {
  if (!eventStore || !repository) {
    throw new TypeError('eventStore and repository are required')
  }

  function finalize({
    runId,
    requiredNodeIds = [],
    rootResultSummary,
    allowPartial = false,
  }) {
    const graph = repository.getRunGraph(runId)
    if (!graph) throw new TypeError(`Agent run ${runId} was not found`)
    const decision = evaluateAgentRunFinalization(graph, {
      requiredNodeIds,
      rootResultSummary,
      allowPartial,
    })
    if (!decision.ready) return { finalized: false, decision, graph }

    const completedAt = now()
    const rollups = calculateAgentUsageRollups({
      nodes: graph.nodes,
      attempts: graph.attempts,
      rootNodeId: graph.run.rootNodeId,
    })
    const root = graph.nodes.find((node) => node.id === graph.run.rootNodeId)
    const nodeUsageEvents = graph.nodes.map((node) => {
      const usage = rollups.byNode[node.id]
      return eventDraft('agent_status_changed', {
        runId,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        attemptId: node.attemptId,
        payload: {
          entity: 'node',
          from: node.status,
          to: node.status,
          snapshot: {
            ...node,
            exclusiveUsage: usage.exclusive,
            inclusiveUsage: usage.inclusive,
          },
        },
        suffix: `usage:${node.id}`,
        createdAt: completedAt,
      })
    })
    const terminalNodeCount = graph.nodes.filter((node) => (
      node.id !== graph.run.rootNodeId && TERMINAL_STATUSES.has(node.status)
    )).length
    const finalizingRun = {
      ...graph.run,
      status: 'finalizing',
      activeNodeCount: 0,
      queuedNodeCount: 0,
      terminalNodeCount,
      exclusiveUsage: rollups.run.exclusive,
      inclusiveUsage: rollups.run.inclusive,
      usageProvenance: {
        unknownScope: rollups.run.unknown,
        rawProviderUsage: rollups.rawProviderUsage,
        authoritativeCostUsd: rollups.run.authoritativeCostUsd,
      },
    }
    const completedRoot = {
      ...root,
      status: 'completed',
      finishedAt: completedAt,
      exclusiveUsage: rollups.byNode[root.id].exclusive,
      inclusiveUsage: rollups.byNode[root.id].inclusive,
      resultSummary: decision.rootResultSummary,
      errorSummary: null,
    }
    const completionReason = decision.abandonedBranches.length > 0
      ? 'managed_tasks_partially_completed'
      : 'managed_tasks_completed'
    const completedRun = {
      ...finalizingRun,
      status: 'completed',
      finishedAt: completedAt,
      completionReason,
      completionProvenance: {
        requiredNodeIds: decision.requiredNodeIds,
        abandonedBranches: decision.abandonedBranches,
        finalAuthorityNodeId: graph.run.rootNodeId,
      },
    }
    eventStore.appendMany([
      ...nodeUsageEvents,
      eventDraft('agent_run_finalizing', {
        runId,
        nodeId: root.id,
        parentNodeId: null,
        payload: {
          finalAuthorityNodeId: root.id,
          run: finalizingRun,
        },
        suffix: 'root',
        createdAt: completedAt,
      }),
      eventDraft('agent_status_changed', {
        runId,
        nodeId: root.id,
        parentNodeId: null,
        payload: {
          entity: 'node',
          from: root.status,
          to: 'completed',
          snapshot: completedRoot,
        },
        suffix: 'root-final',
        createdAt: completedAt,
      }),
      eventDraft('agent_run_completed', {
        runId,
        nodeId: root.id,
        parentNodeId: null,
        payload: {
          finalAuthorityNodeId: root.id,
          completionReason,
          run: completedRun,
        },
        suffix: 'root',
        createdAt: completedAt,
      }),
    ])
    return {
      finalized: true,
      decision,
      graph: repository.getRunGraph(runId),
    }
  }

  return Object.freeze({ finalize })
}
import { calculateAgentUsageRollups } from './agent-usage-accounting.mjs'
