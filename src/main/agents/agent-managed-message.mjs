export function createManagedSendMessage({
  messageBroker,
  requireOwner,
  sessionsByAttempt,
}) {
  return async function sendMessage({ owner, targetNodeId, text }) {
    const { graph } = requireOwner(owner)
    if (!graph.nodes.some((node) => node.id === targetNodeId)) {
      throw new TypeError(`Agent node ${targetNodeId} was not found`)
    }
    const delivered = messageBroker.send({
      runId: owner.runId,
      fromNodeId: owner.nodeId,
      toNodeId: targetNodeId,
      text,
    })
    const targetAttempt = graph.attempts
      .filter((attempt) => attempt.nodeId === targetNodeId)
      .sort((left, right) => right.attemptNumber - left.attemptNumber)[0]
    const targetSession = targetAttempt ? sessionsByAttempt.get(targetAttempt.id) : null
    if (targetSession) {
      await targetSession.adapter.message(targetSession.session.sessionId, { text })
    }
    return delivered
  }
}
