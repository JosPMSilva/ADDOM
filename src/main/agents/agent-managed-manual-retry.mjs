import { enqueueManagedConversationFollowup } from './agent-managed-followup.mjs'

export function createManagedManualRetry({
  conversationMailbox = null,
  contextService,
  conversationRepository = null,
  createContextPacket,
  executionInputs,
  idFactory,
  now,
  pumpUntil,
  repository,
  runService,
  syncRunCounts,
  terminalStatuses,
  workspaceManager,
  warn = console.warn,
} = {}) {
  return async function retryAgent({ runId, nodeId }) {
    const graph = repository.getRunGraph(runId)
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId)
    const input = executionInputs.get(nodeId)
    const previous = graph?.attempts
      .filter((attempt) => attempt.nodeId === nodeId)
      .sort((left, right) => right.attemptNumber - left.attemptNumber)[0]
    if (!graph || !node || !previous) {
      throw new TypeError(`Agent node ${nodeId} was not found in run ${runId}`)
    }
    if (node.status !== 'waiting' || previous.status !== 'failed' || !input) {
      return { supported: false, reason: 'retry_not_actionable' }
    }

    const attemptId = idFactory('attempt')
    const expiresAt = now() + graph.run.budgetSnapshot.maxDurationMs
    const prepared = await workspaceManager.prepare({
      workspaceId: idFactory('workspace'),
      projectRoot: input.sourceProjectFolder,
      providerWorkspaceId: input.agentRuntime?.providerWorkspaceId,
      permissionSnapshot: previous.permissionSnapshot,
      capabilitySnapshot: previous.capabilitySnapshot,
      expiresAt,
    })
    const workspaceLease = {
      leaseId: idFactory('workspace_lease'),
      workspaceId: prepared.id,
      workspaceMode: prepared.mode,
      baseRevision: prepared.baseRevision,
      expiresAt,
    }
    const contextPacket = createContextPacket
      ? createContextPacket({
        priorPacket: input.contextPacket,
        task: input.task,
        packetId: idFactory('context'),
        workspaceLease,
        createdAt: now(),
        idFactory,
      })
      : null
    if (!contextPacket) {
      throw new TypeError('Managed manual retry requires createContextPacket')
    }
    const conversationBinding = conversationRepository
      ?.getConversationBindingForNode(nodeId)
    const conversationClaim = conversationBinding && conversationMailbox
      ? enqueueManagedConversationFollowup({
          authorId: 'agent_runtime',
          authorKind: 'system',
          conversationId: conversationBinding.conversationId,
          conversationMailbox,
          conversationRepository,
          idFactory,
          now,
          text: 'Retry the previous agent turn.',
        }).claim
      : null
    const admission = runService.retryNode({
      runId,
      nodeId,
      attemptId,
      workspaceLease,
      reservations: {
        tokenReservation: 1,
        costReservationUsd: 0,
        toolCallReservation: 1,
      },
      createOwnership: conversationRepository
        ? () => {
            const binding = conversationClaim
              ? { turnId: conversationClaim.turn.id }
              : conversationRepository.getTurnBindingForAttempt(previous.id)
            if (binding) conversationRepository.bindAttempt({
              attemptId, turnId: binding.turnId, createdAt: now(),
            })
            if (conversationClaim) {
              const committed = conversationRepository.commitMailboxClaimWithinTransaction({
                mailboxId: conversationClaim.mailbox.id,
                leaseId: conversationClaim.leaseId,
                deliveredAt: now(),
              })
              if (!committed) throw new TypeError('Manual retry mailbox lease was no longer owned')
            }
          }
        : null,
    })
    if (!admission.admitted) {
      await workspaceManager.discardPrepared(prepared).catch(() => {})
      return { supported: true, admitted: false, reason: admission.reason || null }
    }

    const ready = workspaceManager.activate(prepared, {
      runId,
      nodeId,
      attemptId,
      projectId: graph.run.projectId,
    })
    input.workspaceAttempts.set(attemptId, {
      contextPacket,
      workspace: prepared,
      workspaceReady: ready,
    })
    try {
      await ready
      contextService.deliver({ runId, packet: contextPacket })
    } catch (error) {
      input.workspaceAttempts.delete(attemptId)
      await workspaceManager.discardPrepared(prepared).catch(() => {})
      runService.failAttempt({
        attemptId,
        errorSummary: `Retry workspace activation failed: ${String(error?.message || error)}`,
        errorCode: 'AGENT_RETRY_WORKSPACE_FAILED',
        retryable: false,
      })
      conversationRepository?.closeTurnForAttempt({
        attemptId,
        status: 'failed',
        now: now(),
      })
      throw error
    }
    syncRunCounts(runId)
    void pumpUntil(() => {
      const latest = repository.getRunGraph(runId)
      const latestNode = latest?.nodes.find((candidate) => candidate.id === nodeId)
      return terminalStatuses.has(latest?.run?.status)
        || terminalStatuses.has(latestNode?.status)
    }).catch((error) => {
      warn(`[agents] retry scheduler stopped: ${String(error?.message || error)}`)
    })
    return { supported: true, admitted: true, attemptId }
  }
}
