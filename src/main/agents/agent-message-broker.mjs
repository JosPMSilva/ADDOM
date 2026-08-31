import { randomUUID } from 'node:crypto'
import { validateAgentOrchestrationContinuation } from '../../common/agents/agent-orchestration-continuation-contract.mjs'

function requireNode(graph, nodeId) {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) throw new TypeError(`Agent node ${nodeId} was not found in run ${graph.run.id}`)
  return node
}

function activeAttemptId(graph, nodeId) {
  return graph.attempts
    .filter((attempt) => attempt.nodeId === nodeId)
    .sort((left, right) => right.attemptNumber - left.attemptNumber)
    .find((attempt) => !['completed', 'failed', 'cancelled'].includes(attempt.status))
    ?.id ?? null
}

export function createAgentMessageBroker({
  eventStore,
  repository,
  now = Date.now,
  messageIdFactory = randomUUID,
  onContinuation = null,
} = {}) {
  if (!eventStore || !repository) {
    throw new TypeError('eventStore and repository are required')
  }

  function send({ runId, fromNodeId, toNodeId, text }) {
    const graph = repository.getRunGraph(runId)
    if (!graph) throw new TypeError(`Agent run ${runId} was not found`)
    if (['completed', 'failed', 'cancelled'].includes(graph.run.status)) {
      return { delivered: false, reason: 'run_terminal' }
    }
    const fromNode = requireNode(graph, fromNodeId)
    const toNode = requireNode(graph, toNodeId)
    const message = typeof text === 'string' ? text.trim() : ''
    if (!message) throw new TypeError('Agent message text is required')
    const messageId = String(messageIdFactory())
    const createdAt = now()
    eventStore.appendMany([
      {
        runId,
        nodeId: fromNode.id,
        parentNodeId: fromNode.parentNodeId,
        attemptId: activeAttemptId(graph, fromNode.id),
        providerEventId: null,
        providerCorrelationKey: null,
        idempotencyKey: `${runId}:message:${messageId}:sent`,
        kind: 'agent_message_sent',
        payload: {
          messageId,
          peerNodeId: toNode.id,
          text: message,
        },
        createdAt,
      },
      {
        runId,
        nodeId: toNode.id,
        parentNodeId: toNode.parentNodeId,
        attemptId: activeAttemptId(graph, toNode.id),
        providerEventId: null,
        providerCorrelationKey: null,
        idempotencyKey: `${runId}:message:${messageId}:received`,
        kind: 'agent_message_received',
        payload: {
          messageId,
          peerNodeId: fromNode.id,
          text: message,
        },
        createdAt,
      },
    ])
    return { delivered: true, messageId }
  }

  function returnChildFinal({ runId, fromNodeId, toNodeId, continuation }) {
    const graph = repository.getRunGraph(runId)
    if (!graph) throw new TypeError(`Agent run ${runId} was not found`)
    if (['completed', 'failed', 'cancelled'].includes(graph.run.status)) {
      return { delivered: false, reason: 'run_terminal' }
    }
    const fromNode = requireNode(graph, fromNodeId)
    const toNode = requireNode(graph, toNodeId)
    const value = validateAgentOrchestrationContinuation(continuation)
    const messageId = String(messageIdFactory())
    const createdAt = now()
    eventStore.appendMany([
      {
        runId,
        nodeId: fromNode.id,
        parentNodeId: fromNode.parentNodeId,
        attemptId: activeAttemptId(graph, fromNode.id),
        providerEventId: null,
        providerCorrelationKey: null,
        idempotencyKey: `${runId}:orchestration-continuation:${messageId}:sent`,
        kind: 'agent_orchestration_continuation_sent',
        payload: { messageId, peerNodeId: toNode.id, continuation: value },
        createdAt,
      },
      {
        runId,
        nodeId: toNode.id,
        parentNodeId: toNode.parentNodeId,
        attemptId: activeAttemptId(graph, toNode.id),
        providerEventId: null,
        providerCorrelationKey: null,
        idempotencyKey: `${runId}:orchestration-continuation:${messageId}:received`,
        kind: 'agent_orchestration_continuation_received',
        payload: { messageId, peerNodeId: fromNode.id, continuation: value },
        createdAt,
      },
    ])
    onContinuation?.({ runId, fromNodeId: fromNode.id, toNodeId: toNode.id, continuation: value })
    return { delivered: true, messageId, continuation: value }
  }

  return Object.freeze({ returnChildFinal, send })
}
