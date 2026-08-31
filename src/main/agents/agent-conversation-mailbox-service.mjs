import { randomUUID } from 'node:crypto'

const MAX_CONCLUSION_LENGTH = 20_000

function proseFromParts(parts) {
  return parts
    .filter((part) => part?.kind === 'markdown' || part?.kind === 'text' || part?.kind === 'citation')
    .map((part) => String(part.text || ''))
    .join('\n')
    .slice(0, MAX_CONCLUSION_LENGTH)
}

function requireRepository(repository) {
  if (!repository || typeof repository.enqueueInbound !== 'function') {
    throw new TypeError('A Phase 3 agent conversation repository is required')
  }
  return repository
}

/**
 * Main-process mailbox coordinator for addressable agent conversations.
 * It deliberately owns delivery leases only; the existing AgentScheduler remains
 * the sole admission/fairness authority for provider execution.
 */
export function createAgentConversationMailboxService({
  repository,
  now = Date.now,
  leaseDurationMs = 30_000,
  leaseIdFactory = () => `mailbox_lease_${randomUUID()}`,
} = {}) {
  requireRepository(repository)
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs < 1) {
    throw new TypeError('leaseDurationMs must be a positive finite number')
  }

  function enqueueInbound(input) {
    return repository.enqueueInbound(input)
  }

  function claimNext({ conversationId, leaseId = leaseIdFactory() } = {}) {
    const currentTime = now()
    const mailbox = repository.claimNextMailbox({
      conversationId,
      leaseId,
      leaseExpiresAt: currentTime + leaseDurationMs,
      now: currentTime,
    })
    if (!mailbox) return null
    const projection = repository.getConversationProjection(conversationId)
    const turn = projection?.turns.find((candidate) => candidate.id === mailbox.targetTurnId) || null
    const message = projection?.messages.find((candidate) => candidate.id === mailbox.messageId) || null
    return { mailbox, turn, message, leaseId }
  }

  function commitClaim({ mailboxId, leaseId }) {
    return repository.commitMailboxClaim({ mailboxId, leaseId, deliveredAt: now() })
  }

  function failClaim({ mailboxId, leaseId }) {
    return repository.failMailboxClaim({ mailboxId, leaseId, failedAt: now() })
  }

  function admitClaimToScheduler({ claim, scheduler, schedulerEntry, attemptId = null, createOwnership = null }) {
    if (!claim?.mailbox?.id || !claim?.leaseId) throw new TypeError('A live mailbox claim is required')
    if (!scheduler || typeof scheduler.enqueueWithOwnership !== 'function') {
      throw new TypeError('The existing AgentScheduler is required for conversation admission')
    }
    if (!schedulerEntry || schedulerEntry.attemptId !== attemptId) {
      throw new TypeError('Scheduler entry must be bound to the supplied attempt identity')
    }
    const admitted = scheduler.enqueueWithOwnership(schedulerEntry, () => {
      createOwnership?.()
      if (typeof repository.bindAttempt === 'function') {
        repository.bindAttempt({ attemptId, turnId: claim.turn.id, createdAt: now() })
      }
      const committed = repository.commitMailboxClaimWithinTransaction({
        mailboxId: claim.mailbox.id,
        leaseId: claim.leaseId,
        deliveredAt: now(),
      })
      if (!committed) throw new TypeError('Mailbox delivery lease was no longer owned')
    })
    if (!admitted.admitted) {
      // A rejected scheduler admission leaves the durable lease recoverable; no text is lost.
      return admitted
    }
    return { ...admitted, conversationId: claim.turn.conversationId, turnId: claim.turn.id }
  }

  function recoverExpiredLeases() {
    return repository.recoverExpiredMailboxLeases({ now: now() })
  }

  function transitionTurn(input) {
    return repository.transitionTurn({ ...input, now: now() })
  }

  function resolveContinuation({ routeAvailable = false, capabilities = {} } = {}) {
    if (!routeAvailable) return { mode: 'unavailable', reason: 'route_unavailable' }
    if (capabilities.nativeResume === true && typeof capabilities.nativeSessionReference === 'string' && capabilities.nativeSessionReference) {
      return { mode: 'native_resume', reason: null }
    }
    if (capabilities.managedRehydration === true) return { mode: 'managed_rehydration', reason: null }
    return { mode: 'unavailable', reason: 'continuation_not_evidenced' }
  }

  function packageTurnEvidence({ conversationId, turnId }) {
    const projection = repository.getConversationProjection(conversationId)
    const turn = projection?.turns.find((candidate) => candidate.id === turnId)
    if (!turn) throw new TypeError('Agent turn does not match its conversation scope')
    const finalMessage = turn.finalMessageId
      ? projection.messages.find((message) => message.id === turn.finalMessageId && message.kind === 'final')
      : null
    return Object.freeze({
      schemaVersion: 1,
      conversationId,
      turnId,
      status: turn.status,
      provenance: Object.freeze({ authorKind: turn.authorKind, authorId: turn.authorId }),
      conclusion: finalMessage ? proseFromParts(finalMessage.contentParts) : '',
      finalMessage: finalMessage ? Object.freeze({
        id: finalMessage.id,
        contentParts: Object.freeze(finalMessage.contentParts.map((part) => Object.freeze({ ...part }))),
      }) : null,
      // Phase 3 intentionally carries descriptors only. Phase 6 decides synthesis policy.
      artifacts: Object.freeze([]),
    })
  }

  return Object.freeze({
    claimNext,
    admitClaimToScheduler,
    commitClaim,
    enqueueInbound,
    failClaim,
    packageTurnEvidence,
    recoverExpiredLeases,
    resolveContinuation,
    transitionTurn,
  })
}
