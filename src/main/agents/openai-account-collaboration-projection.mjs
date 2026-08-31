import { AGENT_PROVIDER_CAPABILITY_FIELDS } from '../../common/agents/agent-provider-capability-snapshot.mjs'
import { createAgentProviderCapabilitySnapshot } from './providers/agent-provider-capability-probe.mjs'
import { createProviderOpaqueNode } from './providers/provider-opaque-node.mjs'
import { NATIVE_AGENT_SUPPORT_TARGETS } from './providers/native-agent-support-targets.mjs'
import { createNativeAgentIdentityReconciler } from './providers/native-agent-identity-reconciler.mjs'

const TERMINAL_NODE_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function text(value) {
  return String(value ?? '').trim()
}

function turnKey({ projectId, threadId, turnId }) {
  return `${text(projectId)}:${text(threadId)}:${text(turnId)}`
}

function operations(enabled = []) {
  const allowed = new Set(enabled)
  return Object.fromEntries(
    AGENT_PROVIDER_CAPABILITY_FIELDS.map((field) => [field, allowed.has(field)]),
  )
}

function opaqueChildCapabilitySnapshot({ providerId, modelId, capturedAt }) {
  const target = NATIVE_AGENT_SUPPORT_TARGETS.openaiAccount
  const visibilityReason = target.limitations.join(' ')
  return createAgentProviderCapabilitySnapshot({
    adapterId: 'openai-native',
    providerId,
    modelId,
    capturedAt,
    runtimeAvailability: { status: 'available', reason: null },
    providerCapabilities: {
      operations: operations(['create', 'start', 'dispose']),
      node: {
        mode: 'provider_opaque',
        nativeAgents: true,
        recursiveAgents: false,
        childStreams: false,
        addressableChildren: false,
        childMessaging: false,
        childCancellation: false,
        childRetry: false,
        resumableChildren: false,
        perNodeUsage: false,
        approvalAttribution: false,
        workspaceIsolation: false,
        maxDepthHint: null,
        maxConcurrencyHint: null,
        visibilityReason,
        capabilityKey: 'provider_managed_partial_visibility',
      },
      evidence: {
        sourceClass: 'provider_observation',
        confidence: 'declared',
        provenance: [...target.evidence],
      },
    },
    modelCapabilities: {
      agentRuntime: true,
      disabledCapabilities: [],
      maxDepthHint: null,
      maxConcurrencyHint: null,
    },
  })
}

function normalizeNodeStatus(status, phase) {
  const normalized = text(status).toLowerCase()
  if (['completed', 'failed', 'cancelled', 'interrupted'].includes(normalized)) {
    return normalized === 'interrupted' ? 'cancelled' : normalized
  }
  if (text(phase).toLowerCase() === 'completed') return 'completed'
  if (['queued', 'starting', 'running', 'waiting', 'approval_required', 'paused', 'cancelling'].includes(normalized)) {
    return normalized
  }
  return 'running'
}

/**
 * Projects OpenAI account collaboration discovery into durable Agent Run nodes so the
 * equal-chrome Agents navigator can bind children by chat turnId (status-only / opaque).
 */
export function createOpenAIAccountCollaborationProjection({
  adapterRegistry,
  createRun,
  db = null,
  draft,
  eventStore,
  idFactory,
  now,
  repository,
  runFinalizer = null,
  syncRunCounts,
} = {}) {
  if (!adapterRegistry || !createRun || !draft || !eventStore || !repository) {
    throw new TypeError('OpenAI account collaboration projection requires runtime dependencies')
  }

  const runIdByTurn = new Map()
  const ensureRunInFlight = new Map()
  const ingestChainByTurn = new Map()
  const reconcilerByTurn = new Map()
  const nodeIdByProviderThread = new Map()

  function getReconciler(key) {
    let reconciler = reconcilerByTurn.get(key)
    if (!reconciler) {
      reconciler = createNativeAgentIdentityReconciler({
        namespace: 'openai-account',
        nodeIdFactory: () => idFactory('agent'),
      })
      reconcilerByTurn.set(key, reconciler)
    }
    return reconciler
  }

  function cacheKeyFor(runId, providerThreadId) {
    return `${runId}:${providerThreadId}`
  }

  function rebindProviderThreadCache(graph) {
    if (!graph?.run?.id || !Array.isArray(graph.nodes)) return
    for (const node of graph.nodes) {
      if (node.id === graph.run.rootNodeId) continue
      const providerThreadId = text(node.providerThreadId)
      if (!providerThreadId) continue
      nodeIdByProviderThread.set(cacheKeyFor(graph.run.id, providerThreadId), node.id)
    }
  }

  function findDurableChild(graph, { providerThreadId, spawnRequestId }) {
    const byThread = graph.nodes.find((node) => (
      node.id !== graph.run.rootNodeId
      && text(node.providerThreadId) === providerThreadId
    ))
    if (byThread) return byThread
    const requestId = text(spawnRequestId)
    if (!requestId) return null
    return graph.nodes.find((node) => (
      node.id !== graph.run.rootNodeId
      && (
        text(node.spawnRequestId) === requestId
        || text(node.providerActivityId) === requestId
      )
    )) || null
  }

  function findExistingRun({ projectId, threadId, turnId }) {
    if (!db || typeof db.prepare !== 'function') return null
    const rows = db.prepare(`
      SELECT id, contract_json FROM agent_runs
      WHERE project_id = ? AND thread_id = ?
      ORDER BY updated_at DESC, id ASC
    `).all(projectId, threadId)
    for (const row of rows) {
      try {
        const contract = JSON.parse(String(row.contract_json || ''))
        if (text(contract?.turnId) === turnId) {
          return repository.getRunGraph(row.id)
        }
      } catch {
        // ignore malformed
      }
    }
    return null
  }

  async function ensureRun({ projectId, threadId, turnId, modelId }) {
    const key = turnKey({ projectId, threadId, turnId })
    const cached = runIdByTurn.get(key)
    if (cached) {
      const graph = repository.getRunGraph(cached)
      rebindProviderThreadCache(graph)
      return graph
    }

    const inFlight = ensureRunInFlight.get(key)
    if (inFlight) return inFlight

    const pending = (async () => {
      const existing = findExistingRun({ projectId, threadId, turnId })
      if (existing?.run?.id) {
        runIdByTurn.set(key, existing.run.id)
        rebindProviderThreadCache(existing)
        return existing
      }

      const adapter = adapterRegistry.resolve('openai-native')
      const snapshot = await adapter.probe({
        providerId: 'openai',
        modelId: text(modelId) || 'gpt-5.6-sol',
        capturedAt: now(),
        context: { projectId, threadId },
      })
      const graph = createRun({
        projectId,
        threadId,
        turnId,
        policyProfileId: 'balanced',
        rootTaskSummary: 'OpenAI account collaboration',
        snapshots: [snapshot],
      })
      runIdByTurn.set(key, graph.run.id)
      return graph
    })()

    ensureRunInFlight.set(key, pending)
    try {
      return await pending
    } finally {
      if (ensureRunInFlight.get(key) === pending) ensureRunInFlight.delete(key)
    }
  }

  function applyChildStatus(graph, existing, status, sourceEventId = '') {
    if (!existing || existing.status === status) return existing.id
    if (TERMINAL_NODE_STATUSES.has(existing.status)) {
      const createdAt = now()
      eventStore.append(draft('agent_reconciliation_recorded', {
        runId: graph.run.id,
        nodeId: existing.id,
        parentNodeId: existing.parentNodeId,
        attemptId: null,
        payload: {
          state: 'provider_ahead',
          reason: `Ignored stale provider status ${status} after terminal status ${existing.status}.`,
          sourceEventId: text(sourceEventId) || `openai-account:stale-status:${existing.id}:${createdAt}`,
        },
        suffix: `${existing.id}:stale:${existing.status}:${status}`,
        createdAt,
      }))
      return existing.id
    }
    const createdAt = now()
    const nextNode = {
      ...existing,
      status,
      finishedAt: TERMINAL_NODE_STATUSES.has(status) ? createdAt : null,
      resultSummary: status === 'completed'
        ? (existing.resultSummary || 'Collaboration child completed.')
        : existing.resultSummary,
      errorSummary: status === 'failed'
        ? (existing.errorSummary || 'Collaboration child failed.')
        : existing.errorSummary,
    }
    eventStore.append(draft('agent_status_changed', {
      runId: graph.run.id,
      nodeId: existing.id,
      parentNodeId: existing.parentNodeId,
      payload: { entity: 'node', from: existing.status, to: status, snapshot: nextNode },
      suffix: `${existing.id}:${existing.status}:${status}`,
      createdAt,
    }))
    syncRunCounts?.(graph.run.id)
    return existing.id
  }

  function maybeFinalizeRun(runId) {
    if (!runFinalizer || typeof runFinalizer.finalize !== 'function') return
    const graph = repository.getRunGraph(runId)
    if (!graph || TERMINAL_NODE_STATUSES.has(graph.run.status)) return
    const children = graph.nodes.filter((node) => node.id !== graph.run.rootNodeId)
    if (children.length === 0) return
    if (children.some((node) => !TERMINAL_NODE_STATUSES.has(node.status))) return
    runFinalizer.finalize({
      runId,
      requiredNodeIds: children.map((node) => node.id),
      rootResultSummary: 'OpenAI account collaboration completed.',
      allowPartial: true,
    })
  }

  function reconcileChildrenAtParentCompletion(runId) {
    const graph = repository.getRunGraph(runId)
    if (!graph || TERMINAL_NODE_STATUSES.has(graph.run.status)) return
    const incomplete = graph.nodes.filter((node) => (
      node.id !== graph.run.rootNodeId
      && !TERMINAL_NODE_STATUSES.has(node.status)
    ))
    for (const node of incomplete) {
      const createdAt = now()
      const reason = 'Parent provider turn ended before a terminal status was observed.'
      const failedNode = {
        ...node,
        status: 'failed',
        finishedAt: createdAt,
        errorSummary: reason,
      }
      eventStore.append(draft('agent_status_changed', {
        runId,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        payload: {
          entity: 'node',
          from: node.status,
          to: 'failed',
          snapshot: failedNode,
        },
        suffix: `${node.id}:parent-turn-completed`,
        createdAt,
      }))
      eventStore.append(draft('agent_reconciliation_recorded', {
        runId,
        nodeId: node.id,
        parentNodeId: node.parentNodeId,
        attemptId: null,
        payload: {
          state: 'provider_unverified_terminal',
          reason,
          sourceEventId: `openai-account:parent-turn-completed:${node.id}`,
        },
        suffix: `${node.id}:parent-turn-completed`,
        createdAt,
      }))
    }
    if (incomplete.length > 0) syncRunCounts?.(runId)
  }

  function materializeChild({
    graph,
    discovered,
    status,
  }) {
    const providerThreadId = text(discovered.providerThreadId)
    if (!providerThreadId) return null

    rebindProviderThreadCache(graph)
    const cacheKey = cacheKeyFor(graph.run.id, providerThreadId)
    const spawnRequestId = text(discovered.spawnRequestId) || text(discovered.providerActivityId)
    const durable = findDurableChild(graph, { providerThreadId, spawnRequestId })
      || (() => {
        const cachedId = nodeIdByProviderThread.get(cacheKey)
        return cachedId ? graph.nodes.find((node) => node.id === cachedId) : null
      })()

    if (durable) {
      nodeIdByProviderThread.set(cacheKey, durable.id)
      return applyChildStatus(graph, durable, status, discovered.providerEventId)
    }

    const createdAt = now()
    const nodeId = text(discovered.nodeId) || idFactory('agent')
    const rootNodeId = graph.run.rootNodeId
    const modelId = text(graph.nodes.find((entry) => entry.id === rootNodeId)?.modelId) || 'gpt-5.6-sol'
    const terminal = TERMINAL_NODE_STATUSES.has(status)
    const providerActivityId = text(discovered.providerActivityId)
      || spawnRequestId
      || providerThreadId
    const node = createProviderOpaqueNode({
      id: nodeId,
      runId: graph.run.id,
      parentNodeId: rootNodeId,
      rootNodeId,
      providerId: 'openai',
      modelId,
      providerActivityId,
      providerThreadId,
      roleId: 'openai_collab_child',
      roleLabel: text(discovered.roleLabel) || 'Collaboration agent',
      taskId: `openai_collab_${spawnRequestId || nodeId}`,
      taskSummary: text(discovered.taskSummary) || 'OpenAI collaboration child',
      depth: 1,
      branchPath: [rootNodeId, nodeId],
      status,
      createdAt,
      startedAt: createdAt,
      finishedAt: terminal ? createdAt : null,
      resultSummary: status === 'completed' ? 'Collaboration child completed.' : null,
      errorSummary: status === 'failed' ? 'Collaboration child failed.' : null,
      capabilitySnapshot: opaqueChildCapabilitySnapshot({
        providerId: 'openai',
        modelId,
        capturedAt: createdAt,
      }),
      provenance: {
        source: 'openai_account_collaboration',
        providerEventId: text(discovered.providerEventId) || null,
        confidence: 'provider_asserted',
      },
      transcriptEvidence: text(discovered.transcriptEvidence) || 'status_only',
    })

    const appendResult = eventStore.append(draft('agent_spawned', {
      runId: graph.run.id,
      nodeId,
      parentNodeId: rootNodeId,
      attemptId: null,
      providerEventId: text(discovered.providerEventId) || null,
      payload: {
        spawnRequestId: spawnRequestId || null,
        childNodeId: nodeId,
        node,
      },
      suffix: `${spawnRequestId || providerThreadId}:spawned`,
      createdAt,
    }))

    const latest = repository.getRunGraph(graph.run.id)
    rebindProviderThreadCache(latest)
    const persisted = findDurableChild(latest, { providerThreadId, spawnRequestId })
    if (persisted) {
      nodeIdByProviderThread.set(cacheKey, persisted.id)
      if (appendResult?.inserted === false && persisted.status !== status) {
        return applyChildStatus(latest, persisted, status, discovered.providerEventId)
      }
      syncRunCounts?.(graph.run.id)
      return persisted.id
    }

    if (appendResult?.inserted) {
      nodeIdByProviderThread.set(cacheKey, nodeId)
      syncRunCounts?.(graph.run.id)
      return nodeId
    }

    // Deduped spawn without a durable node is a projector inconsistency — do not cache phantom ids.
    return null
  }

  async function ingestOpenAIAccountCollaboration({
    projectId = '',
    threadId = '',
    turnId = '',
    modelId = '',
    event = {},
  } = {}) {
    const scope = {
      projectId: text(projectId),
      threadId: text(threadId),
      turnId: text(turnId),
    }
    if (!scope.projectId || !scope.threadId || !scope.turnId) {
      throw new TypeError('OpenAI collaboration ingest requires projectId, threadId, and turnId')
    }

    const key = turnKey(scope)
    const prior = ingestChainByTurn.get(key) || Promise.resolve()
    const next = prior.then(async () => {
      const reconciler = getReconciler(key)
      const collab = event && typeof event === 'object' ? event : {}

      if (text(collab.phase).toLowerCase() === 'started') {
        reconciler.registerSpawnIntent({
          spawnRequestId: collab.spawnRequestId || collab.providerActivityId,
          parentAttemptId: collab.parentAttemptId,
          parentProviderThreadId: collab.parentProviderThreadId,
          expectedProviderThreadId: collab.providerThreadId,
        })
      }

      if (!text(collab.providerThreadId)) return { runId: null, nodeId: null }

      const graph = await ensureRun({ ...scope, modelId })
      const discovered = reconciler.observeNode({
        ...collab,
        providerEventId: collab.providerEventId || `openai-account:node:${text(collab.providerThreadId)}`,
      })
      const status = normalizeNodeStatus(collab.status, collab.phase)
      const nodeId = materializeChild({ graph, discovered, status })
      return { runId: graph.run.id, nodeId }
    })
    ingestChainByTurn.set(key, next)
    try {
      return await next
    } finally {
      if (ingestChainByTurn.get(key) === next) ingestChainByTurn.delete(key)
    }
  }

  async function finalizeOpenAIAccountCollaboration({
    projectId = '',
    threadId = '',
    turnId = '',
  } = {}) {
    const scope = {
      projectId: text(projectId),
      threadId: text(threadId),
      turnId: text(turnId),
    }
    if (!scope.projectId || !scope.threadId || !scope.turnId) return null
    const key = turnKey(scope)
    const pending = ingestChainByTurn.get(key)
    if (pending) await pending
    const runId = runIdByTurn.get(key)
    if (!runId) return null
    reconcileChildrenAtParentCompletion(runId)
    maybeFinalizeRun(runId)
    return repository.getRunGraph(runId)
  }

  function materializeProviderDiscoveredChild(entry, providerEvent) {
    const graph = repository.getRunGraph(entry.runId)
    if (!graph) return null
    const payload = providerEvent?.payload && typeof providerEvent.payload === 'object'
      ? providerEvent.payload
      : {}
    if (!text(payload.providerThreadId)) return null
    const status = normalizeNodeStatus(payload.status, providerEvent?.providerMetadata?.phase)
    return materializeChild({
      graph,
      discovered: {
        ...payload,
        providerEventId: providerEvent.providerEventId,
        providerActivityId: providerEvent?.providerMetadata?.providerActivityId
          || payload.providerActivityId
          || payload.spawnRequestId,
        nodeId: payload.nodeId,
      },
      status,
    })
  }

  return Object.freeze({
    finalizeOpenAIAccountCollaboration,
    ingestOpenAIAccountCollaboration,
    materializeProviderDiscoveredChild,
  })
}
