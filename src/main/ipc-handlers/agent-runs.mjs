import { randomUUID } from 'node:crypto'

import { getDb } from '../memory/db.mjs'
import { getManagedAgentRuntime } from '../agents/managed-agent-runtime-singleton.mjs'
import { createAgentConversationContinuationRouteResolver } from '../agents/agent-conversation-continuation-route.mjs'
import { createAgentConversationPromotionService } from '../agents/agent-conversation-promotion-service.mjs'
import { createAgentRunQueryService } from '../agents/agent-run-query-service.mjs'
import {
  projectAgentApproval,
  projectAgentEvent,
} from '../agents/agent-run-renderer-projection.mjs'
import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import { getSettings } from '../settings.mjs'
import { getKey } from '../vault.mjs'
import { createThreadFromPromotionSnapshot } from '../workspace/workspace-store.mjs'

function text(value, field, maxLength = 4_000) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new TypeError(`${field} is required`)
  if (normalized.length > maxLength) throw new TypeError(`${field} is too long`)
  return normalized
}

function parseJson(value, fallback = null) {
  try { return JSON.parse(String(value || '')) } catch { return fallback }
}

function readPromotionTranscript(query, scope, maximumItems = 1_000) {
  const items = []
  let cursor = null
  while (items.length < maximumItems) {
    const page = query.getConversationTranscriptPage({ ...scope, cursor, limit: 200 })
    items.push(...(Array.isArray(page?.items) ? page.items : []))
    if (!page?.hasMore || page.nextCursor == null) break
    cursor = page.nextCursor
  }
  return items.slice(0, maximumItems).sort((left, right) => (
    Number(left?.transcriptSequence || 0) - Number(right?.transcriptSequence || 0)
    || Number(left?.createdAt || 0) - Number(right?.createdAt || 0)
    || String(left?.id || '').localeCompare(String(right?.id || ''))
  ))
}

function readPromotionArtifacts(db, conversationId, maximumTurnSequence) {
  return db.prepare(`
    SELECT artifacts.projection_json
    FROM agent_artifact_projections AS artifacts
    INNER JOIN agent_attempt_turn_bindings AS bindings ON bindings.attempt_id = artifacts.attempt_id
    INNER JOIN agent_turns AS turns ON turns.id = bindings.turn_id
    WHERE bindings.conversation_id = ? AND turns.turn_sequence <= ?
    ORDER BY turns.turn_sequence ASC, artifacts.created_at ASC, artifacts.artifact_id ASC
    LIMIT 100
  `).all(conversationId, maximumTurnSequence)
    .map((row) => parseJson(row.projection_json))
    .filter(Boolean)
}

function ensureOwnedNode(query, input, field) {
  const nodeId = text(input[field], field, 256)
  query.assertScope({ ...input, nodeId }, { requireRun: true, requireNode: true })
  return nodeId
}

function requireRunArtifact(runtime, runId, artifactId) {
  const graph = runtime.repository.getRunGraph(runId)
  const artifact = graph?.artifacts.find((candidate) => candidate.id === artifactId)
  if (!artifact) throw new TypeError('Agent artifact is outside the owning run scope')
  return artifact
}

function conversationIdsForEvent(db, agentEvent) {
  const payload = agentEvent?.payload && typeof agentEvent.payload === 'object'
    ? agentEvent.payload
    : {}
  const nodes = [payload.rootNode, payload.node].filter((node) => node?.id && node?.runId)
  if (nodes.length === 0) return {}
  const findBinding = db.prepare(`
    SELECT conversation_id
    FROM agent_node_conversation_bindings
    WHERE node_id = ? AND run_id = ?
  `)
  const result = {}
  for (const node of nodes) {
    const binding = findBinding.get(node.id, node.runId)
    if (binding?.conversation_id) result[node.id] = binding.conversation_id
  }
  return result
}

export function registerAgentRunHandlers({
  ipcMain,
  db = getDb(),
  getRuntime = getManagedAgentRuntime,
  resolveContinuationRoute = null,
  createProjectThreadFromPromotion = createThreadFromPromotionSnapshot,
  subscriptionIdFactory = randomUUID,
} = {}) {
  if (!ipcMain?.handle) throw new TypeError('ipcMain is required')
  const subscriptions = new Map()
  const senderSubscriptions = new Map()
  const continuationRouteResolver = resolveContinuationRoute
    || createAgentConversationContinuationRouteResolver({ db, getSettings, getKey })

  function cleanupSubscription(subscriptionId, { removeDestroyedListener = true } = {}) {
    const subscription = subscriptions.get(subscriptionId)
    if (!subscription) return false
    subscription.unsubscribe()
    subscriptions.delete(subscriptionId)

    const senderEntry = senderSubscriptions.get(subscription.sender)
    if (!senderEntry) return true
    senderEntry.subscriptionIds.delete(subscriptionId)
    if (senderEntry.subscriptionIds.size > 0) return true
    if (removeDestroyedListener) {
      senderEntry.sender.removeListener?.('destroyed', senderEntry.destroyedHandler)
    }
    senderSubscriptions.delete(subscription.sender)
    return true
  }

  function ensureSenderEntry(sender) {
    let entry = senderSubscriptions.get(sender)
    if (entry) return entry
    const destroyedHandler = () => {
      const current = senderSubscriptions.get(sender)
      if (!current) return
      for (const subscriptionId of Array.from(current.subscriptionIds)) {
        cleanupSubscription(subscriptionId, { removeDestroyedListener: false })
      }
    }
    entry = {
      sender,
      destroyedHandler,
      subscriptionIds: new Set(),
    }
    senderSubscriptions.set(sender, entry)
    sender?.once?.('destroyed', destroyedHandler)
    return entry
  }

  function services() {
    const runtime = getRuntime()
    return {
      query: createAgentRunQueryService({
        db,
        repository: runtime.repository,
        diagnostics: runtime.runtimeDiagnostics,
      }),
      runtime,
    }
  }

  async function readyServices() {
    const resolved = services()
    await resolved.runtime.ready?.()
    return resolved
  }

  handleVersioned(ipcMain, 'agent-runs:list', async (_event, input = {}) => (
    (await readyServices()).query.listRuns(input)
  ))
  handleVersioned(ipcMain, 'agent-runs:get', async (_event, input = {}) => (
    (await readyServices()).query.getRun(input)
  ))
  handleVersioned(ipcMain, 'agent-runs:transcript-page', async (_event, input = {}) => (
    (await readyServices()).query.getTranscriptPage(input)
  ))
  handleVersioned(ipcMain, 'agent-runs:events-page', async (_event, input = {}) => (
    (await readyServices()).query.getEventsPage(input)
  ))
  handleVersioned(ipcMain, 'agent-runs:conversation', async (_event, input = {}) => {
    const { query, runtime } = await readyServices()
    const scope = query.assertScope(input, { requireRun: true, requireNode: true })
    const binding = runtime.conversationRepository?.getConversationBindingForNode(scope.nodeId)
    if (!binding) throw new TypeError('Agent conversation was not found for the selected node')
    const projection = runtime.conversationRepository.getConversationProjection(binding.conversationId)
    if (!projection
      || projection.conversation.projectId !== scope.projectId
      || projection.conversation.rootThreadId !== scope.threadId) {
      throw new TypeError('Agent conversation is outside the owning project/thread scope')
    }
    return { ...projection, runId: scope.runId, nodeId: scope.nodeId }
  })
  handleVersioned(ipcMain, 'agent-runs:conversation-transcript-page', async (_event, input = {}) => (
    (await readyServices()).query.getConversationTranscriptPage(input)
  ))

  handleVersioned(ipcMain, 'agent-runs:subscribe', async (event, input = {}) => {
    const { query, runtime } = await readyServices()
    const scope = input.runId
      ? query.assertScope(input, { requireRun: true })
      : query.assertScope(input)
    const subscriptionId = text(subscriptionIdFactory(), 'subscriptionId', 256)
    const unsubscribe = runtime.eventStore.subscribe((events) => {
      if (!event.sender || event.sender.isDestroyed?.()) return
      for (const agentEvent of events) {
        if (scope.runId && agentEvent.runId !== scope.runId) continue
        if (!scope.runId) {
          try {
            query.assertScope({ ...scope, runId: agentEvent.runId }, { requireRun: true })
          } catch {
            continue
          }
        }
        sendVersioned(event.sender, 'agent-runs:event', {
          subscriptionId,
          event: projectAgentEvent(agentEvent, {
            conversationIdsByNode: conversationIdsForEvent(db, agentEvent),
          }),
        })
      }
    })
    subscriptions.set(subscriptionId, { sender: event.sender, unsubscribe })
    ensureSenderEntry(event.sender).subscriptionIds.add(subscriptionId)
    return {
      ok: true,
      subscriptionId,
      lastRunSequence: scope.runId ? runtime.repository.getLastRunSequence(scope.runId) : 0,
    }
  })

  handleVersioned(ipcMain, 'agent-runs:unsubscribe', (event, input = {}) => {
    const subscriptionId = text(input.subscriptionId, 'subscriptionId', 256)
    const subscription = subscriptions.get(subscriptionId)
    if (!subscription || subscription.sender !== event.sender) {
      return { ok: false, error: 'subscription_not_found' }
    }
    cleanupSubscription(subscriptionId)
    return { ok: true, subscriptionId }
  })

  handleVersioned(ipcMain, 'agent-runs:control', async (_event, input = {}) => {
    const { query, runtime } = await readyServices()
    const scope = query.assertScope(input, { requireRun: true })
    const action = text(input.action, 'action', 64)
    const reason = String(input.reason || 'user_request').trim().slice(0, 1_000)
    if (action === 'stop_run') {
      return runtime.controlService.stopRun({ runId: scope.runId, reason })
    }
    const nodeId = ensureOwnedNode(query, input, 'nodeId')
    if (action === 'stop_node') {
      return runtime.controlService.stopNode({ runId: scope.runId, nodeId, reason })
    }
    if (action === 'stop_subtree' || action === 'interrupt') {
      return runtime.controlService.stopSubtree({ runId: scope.runId, nodeId, reason })
    }
    throw new TypeError(`Unsupported agent control action: ${action}`)
  })

  handleVersioned(ipcMain, 'agent-runs:followup', async (_event, input = {}) => {
    const { query, runtime } = await readyServices()
    const scope = query.assertScope(input, { requireRun: true, requireNode: true })
    if (typeof runtime.continueConversation !== 'function') {
      return { supported: false, reason: 'managed_continuation_unavailable' }
    }
    const graph = runtime.repository.getRunGraph(scope.runId)
    const node = graph?.nodes.find((candidate) => candidate.id === scope.nodeId)
    if (node?.capabilitySnapshot?.childMessaging !== true) {
      return { supported: false, reason: 'conversation_followup_unavailable' }
    }
    const binding = runtime.conversationRepository?.getConversationBindingForNode(scope.nodeId)
    if (!binding) throw new TypeError('Agent conversation was not found for the selected node')
    const projection = runtime.conversationRepository.getConversationProjection(binding.conversationId)
    if (!projection
      || projection.conversation.projectId !== scope.projectId
      || projection.conversation.rootThreadId !== scope.threadId) {
      throw new TypeError('Agent conversation is outside the owning project/thread scope')
    }
    const route = await continuationRouteResolver(projection.conversation)
    if (route?.supported !== true) return route
    return runtime.continueConversation({
      conversationId: binding.conversationId,
      text: text(input.text, 'text', 200_000),
      authorKind: 'user',
      authorId: 'user_local',
      role: route.role,
      apiKey: route.apiKey,
      projectFolder: route.projectFolder,
      agentRuntime: route.agentRuntime,
      policyProfileId: route.policyProfileId,
    })
  })

  handleVersioned(ipcMain, 'agent-runs:promote-conversation', async (_event, input = {}) => {
    const { query, runtime } = await readyServices()
    const scope = query.assertScope(input, { requireRun: true, requireNode: true })
    const graph = runtime.repository.getRunGraph(scope.runId)
    const node = graph?.nodes.find((candidate) => candidate.id === scope.nodeId)
    if (!node || node?.capabilitySnapshot?.mode === 'provider_opaque') {
      return { supported: false, reason: 'conversation_promotion_unavailable' }
    }
    const binding = runtime.conversationRepository?.getConversationBindingForNode(scope.nodeId)
    if (!binding) throw new TypeError('Agent conversation was not found for the selected node')
    const projection = runtime.conversationRepository.getConversationProjection(binding.conversationId)
    if (!projection
      || projection.conversation.projectId !== scope.projectId
      || projection.conversation.rootThreadId !== scope.threadId) {
      throw new TypeError('Agent conversation is outside the owning project/thread scope')
    }
    const promotion = createAgentConversationPromotionService({
      conversationRepository: runtime.conversationRepository,
      getArtifacts: ({ projection: sourceProjection, turn }) => readPromotionArtifacts(
        db, sourceProjection.conversation.id, Number(turn.sequence || 0),
      ),
      getTranscript: () => readPromotionTranscript(query, scope),
      createProjectThreadFromPromotion: ({ snapshot, title }) => createProjectThreadFromPromotion({
        projectId: scope.projectId, snapshot, title,
      }),
      idFactory: () => randomUUID(),
    })
    return promotion.promote({
      conversationId: binding.conversationId,
      title: String(input.title || '').trim().slice(0, 200),
      sourceRoleLabel: String(node.roleLabel || '').trim().slice(0, 256),
      sourceRoute: {
        projectId: scope.projectId, threadId: scope.threadId, runId: scope.runId, nodeId: scope.nodeId,
      },
    })
  })

  handleVersioned(ipcMain, 'agent-runs:retry', async (_event, input = {}) => {
    const { query, runtime } = await readyServices()
    const scope = query.assertScope(input, { requireRun: true })
    const nodeId = ensureOwnedNode(query, input, 'nodeId')
    if (typeof runtime.retryAgent !== 'function') {
      return { supported: false, reason: 'retry_unavailable' }
    }
    return runtime.retryAgent({ runId: scope.runId, nodeId })
  })

  handleVersioned(ipcMain, 'agent-runs:queue', async (_event, input = {}) => {
    const { query, runtime } = await readyServices()
    query.assertScope(input)
    return input.paused === true
      ? runtime.controlService.pauseQueue()
      : runtime.controlService.resumeQueue()
  })

  handleVersioned(ipcMain, 'agent-runs:approval', async (_event, input = {}) => {
    const { query, runtime } = await readyServices()
    const scope = query.assertScope(input, { requireRun: true })
    const approvalId = text(input.approvalId, 'approvalId', 256)
    const approval = runtime.repository.getApproval(approvalId)
    if (!approval || approval.runId !== scope.runId) {
      throw new TypeError('Agent approval is outside the owning run scope')
    }
    return projectAgentApproval(runtime.approvalRouter.resolve({
      approvalId,
      outcome: text(input.outcome, 'outcome', 64),
      resolutionScope: input.resolutionScope
        ? text(input.resolutionScope, 'resolutionScope', 64)
        : null,
      expiresAt: input.expiresAt == null ? null : Number(input.expiresAt),
      reason: input.reason ? text(input.reason, 'reason', 1_000) : null,
    }))
  })

  handleVersioned(ipcMain, 'agent-runs:artifact-action', async (_event, input = {}) => {
    const { query, runtime } = await readyServices()
    const scope = query.assertScope(input, { requireRun: true })
    const artifactId = text(input.artifactId, 'artifactId', 256)
    requireRunArtifact(runtime, scope.runId, artifactId)
    const operation = text(input.operation, 'operation', 64)
    if (!['apply', 'discard'].includes(operation)) {
      throw new TypeError('Artifact operation must be apply or discard')
    }
    const entry = runtime.mergeQueue.enqueue({
      runId: scope.runId,
      artifactId,
      operation,
    })
    const result = await runtime.mergeQueue.processNext()
    return { entry, result }
  })

  return Object.freeze({
    dispose() {
      for (const subscriptionId of Array.from(subscriptions.keys())) {
        cleanupSubscription(subscriptionId)
      }
    },
  })
}
