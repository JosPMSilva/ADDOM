import { assertParentFollowupBudget } from './agent-orchestrator-synthesis.mjs'

function inboundContracts({
  authorId,
  authorKind,
  binding,
  createdAt,
  idFactory,
  projection,
  sourceConversation,
  sourceTurn,
  text,
}) {
  const turnId = idFactory('agent_turn')
  const messageId = idFactory('agent_message')
  const mailboxId = idFactory('mailbox')
  return {
    turn: {
      schemaVersion: 1, id: turnId, conversationId: binding.conversationId,
      sequence: projection.turns.length + 1, authorKind,
      authorId, sourceTurnId: sourceTurn?.turnId || null,
      requestedAction: 'followup', idempotencyKey: `${binding.conversationId}:${turnId}`,
      status: 'pending', finalMessageId: null, createdAt, startedAt: null, finishedAt: null,
    },
    message: {
      schemaVersion: 1, id: messageId, conversationId: binding.conversationId, turnId,
      sequence: projection.messages.length + 1, kind: 'authored', authorKind,
      authorId, sourceConversationId: sourceConversation?.conversationId || null,
      sourceTurnId: sourceTurn?.turnId || null,
      idempotencyKey: `${binding.conversationId}:${messageId}`,
      contentParts: [{ kind: 'markdown', text }], createdAt,
    },
    mailbox: {
      schemaVersion: 1, id: mailboxId, messageId, conversationId: binding.conversationId,
      targetTurnId: turnId, authorKind, authorId,
      enqueueSequence: projection.mailbox.length + 1, deliveryState: 'queued',
      idempotencyKey: `${binding.conversationId}:${mailboxId}`, createdAt, deliveredAt: null,
    },
  }
}

export function enqueueManagedConversationFollowup({
  authorId,
  authorKind,
  conversationId,
  conversationMailbox,
  conversationRepository,
  idFactory,
  now,
  sourceConversationId = null,
  sourceTurnId = null,
  text,
} = {}) {
  const projection = conversationRepository.getConversationProjection(conversationId)
  if (!projection) throw new TypeError('Agent conversation was not found')
  const inbound = conversationMailbox.enqueueInbound(inboundContracts({
    authorId,
    authorKind,
    binding: { conversationId },
    createdAt: now(),
    idFactory,
    projection,
    sourceConversation: sourceConversationId ? { conversationId: sourceConversationId } : null,
    sourceTurn: sourceTurnId ? { turnId: sourceTurnId } : null,
    text,
  }))
  const claim = conversationMailbox.claimNext({ conversationId })
  return { claim, inbound, projection, queued: !claim }
}

function instructionFromClaim(claim) {
  return (claim?.message?.contentParts || [])
    .filter((part) => ['markdown', 'text', 'citation'].includes(part?.kind))
    .map((part) => String(part.text || ''))
    .join('\n')
    .trim()
}

function messageText(message) {
  return (message?.contentParts || [])
    .filter((part) => ['markdown', 'text', 'citation'].includes(part?.kind))
    .map((part) => String(part.text || '').trim())
    .filter(Boolean)
    .join('\n')
}

function continuationContext({ conversationRepository, conversationId, excludeTurnId }) {
  const projection = conversationRepository.getConversationProjection(conversationId)
  const messages = (projection?.messages || [])
    .filter((message) => message.turnId !== excludeTurnId)
    .map((message) => {
      const text = messageText(message)
      if (!text) return null
      const speaker = message.kind === 'final'
        ? 'Agent'
        : message.authorKind === 'user' ? 'User' : 'Orchestrator'
      return `${speaker}:\n${text}`
    })
    .filter(Boolean)
  const selected = []
  let used = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index]
    if (selected.length > 0 && used + entry.length > 30_000) break
    selected.unshift(entry)
    used += entry.length
  }
  const omitted = selected.length < messages.length ? '[Earlier conversation omitted]\n\n' : ''
  return `Continue the same durable agent conversation. Use this prior context:\n\n${omitted}${selected.join('\n\n')}`
}

export function createManagedConversationContinuation({
  conversationMailbox,
  conversationRepository,
  executeTaskGraph,
  idFactory,
  now,
} = {}) {
  return async function continueConversation({
    conversationId, text, role, apiKey, projectFolder,
    authorKind = 'user', authorId = 'user_local', agentRuntime = {},
    policyProfileId = 'balanced',
  } = {}) {
    const { claim, inbound, projection } = enqueueManagedConversationFollowup({
      authorId, authorKind, conversationId, conversationMailbox, conversationRepository,
      idFactory, now, text,
    })
    if (!claim) {
      return {
        queued: true,
        conversationId,
        conversationTurnId: inbound.turn.id,
      }
    }
    const injectedContext = continuationContext({
      conversationRepository,
      conversationId,
      excludeTurnId: claim.turn.id,
    })
    let result
    try {
      result = await executeTaskGraph({
        projectId: projection.conversation.projectId,
        threadId: projection.conversation.rootThreadId,
        turnId: idFactory('agent_followup_root_turn'),
        policyProfileId,
        rootTaskSummary: text,
        tasks: [{
          task: {
            task_id: idFactory('task'), instruction: text,
            injected_context: injectedContext,
            expected_output_format: 'Return a concise follow-up result.',
            outputPresentation: 'natural',
          },
          role, apiKey, projectFolder, agentRuntime, conversationClaim: claim,
        }],
      })
    } catch (error) {
      conversationMailbox.failClaim?.({ mailboxId: claim.mailbox.id, leaseId: claim.leaseId })
      throw error
    }
    return { ...result, conversationId, conversationTurnId: claim.turn.id }
  }
}

export function createManagedFollowup({
  conversationMailbox,
  conversationRepository,
  executionInputs,
  idFactory,
  now,
  pumpUntil,
  repository,
  requireOwner,
  requireOwnedTarget,
  spawnChild,
  terminalStatuses,
  maxParentFollowups = 3,
} = {}) {
  async function launchClaim({ claim, owner, priorInput, target }) {
    const instruction = instructionFromClaim(claim)
    if (!instruction) throw new TypeError('Agent conversation follow-up has no deliverable text')
    const injectedContext = continuationContext({
      conversationRepository,
      conversationId: claim.turn.conversationId,
      excludeTurnId: claim.turn.id,
    })
    return spawnChild({
      owner,
      task: {
        task_id: idFactory('task'), instruction,
        injected_context: injectedContext,
        expected_output_format: 'Return a concise follow-up result.',
        outputPresentation: 'natural',
      },
      role: priorInput.role,
      apiKey: priorInput.apiKey,
      projectFolder: priorInput.sourceProjectFolder,
      background: false,
      capabilitySnapshot: target.providerCapabilitySnapshot,
      agentRuntime: priorInput.agentRuntime,
      conversationClaim: claim,
    })
  }

  async function followupAgent({
    owner,
    targetNodeId,
    text,
    authorKind = 'orchestrator',
    authorId = owner?.nodeId,
  }) {
    const target = authorKind === 'user'
      ? requireOwner(owner).node
      : requireOwnedTarget(owner, targetNodeId).target
    if (target.id !== targetNodeId) throw new TypeError('User follow-up target does not match its conversation node')
    const priorInput = executionInputs.get(target.id)
    if (!priorInput) throw new TypeError('Agent conversation route is no longer available in this run')
    const binding = conversationRepository.getConversationBindingForNode(target.id)
    if (!binding) throw new TypeError('Agent conversation was not found')
    const sourceConversation = conversationRepository.getConversationBindingForNode(owner.nodeId)
    const sourceTurn = conversationRepository.getTurnBindingForAttempt(owner.attemptId)
    if (authorKind === 'orchestrator') {
      assertParentFollowupBudget({
        projection: conversationRepository.getConversationProjection(binding.conversationId),
        sourceConversationId: sourceConversation?.conversationId || '',
        sourceTurnId: sourceTurn?.turnId || '',
        limit: maxParentFollowups,
      })
    }
    const queued = enqueueManagedConversationFollowup({
      authorId,
      authorKind,
      conversationId: binding.conversationId,
      conversationMailbox,
      conversationRepository,
      idFactory,
      now,
      sourceConversationId: authorKind === 'user' ? null : sourceConversation?.conversationId || null,
      sourceTurnId: authorKind === 'user' ? null : sourceTurn?.turnId || null,
      text,
    })
    if (!queued.claim) {
      return {
        queued: true,
        conversationId: binding.conversationId,
        conversationTurnId: queued.inbound.turn.id,
      }
    }
    const spawned = await launchClaim({ claim: queued.claim, owner, priorInput, target })
    if (authorKind !== 'user') return spawned
    await pumpUntil(() => {
      const current = repository.getRunGraph(owner.runId)?.nodes
        .find((node) => node.id === spawned.nodeId)
      return terminalStatuses.has(current?.status)
    })
    const completed = repository.getRunGraph(owner.runId)?.nodes
      .find((node) => node.id === spawned.nodeId)
    return { ...spawned, status: completed?.status, resultSummary: completed?.resultSummary }
  }

  async function drainConversation({ owner }) {
    const target = requireOwner(owner).node
    const binding = conversationRepository.getConversationBindingForNode(target.id)
    if (!binding) return null
    const claim = conversationMailbox.claimNext({ conversationId: binding.conversationId })
    if (!claim) return null
    const priorInput = executionInputs.get(target.id)
    if (!priorInput) throw new TypeError('Agent conversation route is no longer available in this run')
    return launchClaim({ claim, owner, priorInput, target })
  }

  return Object.freeze({ drainConversation, followupAgent })
}
