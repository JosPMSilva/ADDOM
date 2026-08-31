/** Persist the canonical child conversation records with the legacy run/node ownership. */
export function createManagedChildConversationOwnership({
  attempt,
  conversationRepository,
  createdAt,
  graph,
  node,
  owner,
  parent,
  task,
} = {}) {
  return () => {
    const conversationId = `conversation:${node.id}`
    const turnId = `agent_turn:${attempt.id}`
    const parentConversation = conversationRepository.getConversationBindingForNode(parent.id)
    const parentTurn = owner?.attemptId
      ? conversationRepository.getTurnBindingForAttempt(owner.attemptId)
      : null
    conversationRepository.createConversation({
      schemaVersion: 1,
      id: conversationId,
      projectId: graph.run.projectId,
      rootThreadId: graph.run.threadId,
      parentConversationId: parentConversation?.conversationId || null,
      creatorTurnId: parentTurn?.turnId || graph.run.turnId,
      ownerKind: 'agent',
      ownerId: node.id,
      createdByKind: 'orchestrator',
      createdById: parent.id,
      roleId: node.roleId,
      providerRoute: { providerId: node.providerId, modelId: node.modelId },
      scope: 'nested_agent',
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    }, { nodeId: node.id })
    conversationRepository.createTurn({
      schemaVersion: 1,
      id: turnId,
      conversationId,
      sequence: 1,
      authorKind: 'orchestrator',
      authorId: parent.id,
      sourceTurnId: graph.run.turnId,
      requestedAction: 'delegated_task',
      idempotencyKey: `${conversationId}:initial-turn`,
      status: 'queued',
      finalMessageId: null,
      createdAt,
      startedAt: null,
      finishedAt: null,
    })
    conversationRepository.appendMessage({
      schemaVersion: 1,
      id: `agent_message:${attempt.id}`,
      conversationId,
      turnId,
      sequence: 1,
      kind: 'authored',
      authorKind: 'orchestrator',
      authorId: parent.id,
      sourceConversationId: null,
      sourceTurnId: graph.run.turnId,
      idempotencyKey: `${conversationId}:initial-message`,
      contentParts: [{
        kind: 'markdown',
        text: typeof task?.instruction === 'string' && task.instruction.trim()
          ? task.instruction.trim()
          : 'Complete the delegated task.',
      }],
      createdAt,
    })
    conversationRepository.enqueueMailbox({
      schemaVersion: 1,
      id: `mailbox:${attempt.id}`,
      messageId: `agent_message:${attempt.id}`,
      conversationId,
      targetTurnId: turnId,
      authorKind: 'orchestrator',
      authorId: parent.id,
      enqueueSequence: 1,
      deliveryState: 'delivered',
      idempotencyKey: `${conversationId}:initial-mailbox`,
      createdAt,
      deliveredAt: createdAt,
      deliveryLeaseId: null,
      deliveryLeaseExpiresAt: null,
    })
    conversationRepository.bindAttempt({ attemptId: attempt.id, turnId, createdAt })
  }
}

/** Bind a fresh execution node and attempt to an already-addressable conversation turn. */
export function createManagedContinuationOwnership({
  attempt,
  claim,
  conversationRepository,
  createdAt,
  node,
} = {}) {
  return () => {
    conversationRepository.bindNode({
      nodeId: node.id,
      conversationId: claim.turn.conversationId,
      createdAt,
    })
    conversationRepository.bindAttempt({
      attemptId: attempt.id,
      turnId: claim.turn.id,
      createdAt,
    })
    const committed = conversationRepository.commitMailboxClaimWithinTransaction({
      mailboxId: claim.mailbox.id,
      leaseId: claim.leaseId,
      deliveredAt: createdAt,
    })
    if (!committed) throw new TypeError('Conversation follow-up lease was no longer owned')
  }
}
