import { validateAgentContextPacket } from './agent-context-packet.mjs'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function requireNode(graph, nodeId) {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) throw new TypeError(`Agent node ${nodeId} was not found in run ${graph.run.id}`)
  return node
}

function activeAttemptId(graph, nodeId) {
  return graph.attempts
    .filter((attempt) => attempt.nodeId === nodeId)
    .sort((left, right) => right.attemptNumber - left.attemptNumber)
    .find((attempt) => !TERMINAL_STATUSES.has(attempt.status))
    ?.id ?? null
}

function assertRelation(fromNode, toNode, relation) {
  const valid = relation === 'parent_child'
    ? toNode.parentNodeId === fromNode.id
    : relation === 'child_parent'
      ? fromNode.parentNodeId === toNode.id
      : relation === 'sibling'
        ? fromNode.parentNodeId !== null && fromNode.parentNodeId === toNode.parentNodeId
        : false
  if (!valid) throw new TypeError(`Context relation ${relation} does not match the agent graph`)
}

export function createAgentContextService({
  eventStore,
  repository,
  now = Date.now,
} = {}) {
  if (!eventStore || !repository) {
    throw new TypeError('eventStore and repository are required')
  }

  function deliver({ runId, packet: packetInput }) {
    const graph = repository.getRunGraph(runId)
    if (!graph) throw new TypeError(`Agent run ${runId} was not found`)
    const packet = validateAgentContextPacket(packetInput)
    const fromNode = requireNode(graph, packet.fromNodeId)
    const toNode = requireNode(graph, packet.toNodeId)
    assertRelation(fromNode, toNode, packet.relation)
    if (
      packet.ancestry.length !== toNode.branchPath.length
      || packet.ancestry.some((nodeId, index) => nodeId !== toNode.branchPath[index])
    ) {
      throw new TypeError('Context ancestry must match the recipient branch path')
    }
    const createdAt = now()
    eventStore.appendMany([
      {
        runId,
        nodeId: fromNode.id,
        parentNodeId: fromNode.parentNodeId,
        attemptId: activeAttemptId(graph, fromNode.id),
        providerEventId: null,
        providerCorrelationKey: null,
        idempotencyKey: `${runId}:context:${packet.packetId}:sent`,
        kind: 'agent_context_sent',
        payload: {
          packetId: packet.packetId,
          peerNodeId: toNode.id,
          packetHash: packet.packetHash,
          packet,
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
        idempotencyKey: `${runId}:context:${packet.packetId}:received`,
        kind: 'agent_context_received',
        payload: {
          packetId: packet.packetId,
          peerNodeId: fromNode.id,
          packetHash: packet.packetHash,
        },
        createdAt,
      },
    ])
    return packet
  }

  return Object.freeze({ deliver })
}
