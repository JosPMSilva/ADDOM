import test from 'node:test'
import assert from 'node:assert/strict'

import Database from 'better-sqlite3'

import { createAgentConversationRepository } from '../../src/main/agents/agent-conversation-repository.mjs'
import { createAgentConversationMailboxService } from '../../src/main/agents/agent-conversation-mailbox-service.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentScheduler } from '../../src/main/agents/agent-scheduler.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import { makeAgentAttempt, makeAgentEventDraft, makeAgentNode, makeAgentRun, seedAgentWorkspace } from '../helpers/agent-runtime-fixtures.mjs'

const NOW = 1_754_000_100_000

function database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  const store = createAgentEventStore(db)
  store.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high', run: makeAgentRun(), rootNode: makeAgentNode(),
  }, { attemptId: null }))
  return db
}

function seedConversation(db) {
  const repository = createAgentConversationRepository(db)
  repository.createConversation({
    schemaVersion: 1, id: 'conversation_01', projectId: 'project_01', rootThreadId: 'thread_01',
    parentConversationId: null, creatorTurnId: null, ownerKind: 'agent', ownerId: 'agent_root',
    createdByKind: 'orchestrator', createdById: 'agent_root', roleId: 'reviewer',
    providerRoute: { providerId: 'openai-account', modelId: 'gpt-5.6-luna' },
    scope: 'nested_agent', status: 'completed', createdAt: NOW, updatedAt: NOW,
  }, { nodeId: 'agent_root' })
  return repository
}

function inbound(sequence, suffix, { authorKind = 'user', authorId = 'user_local', text = 'Please review the next change.' } = {}) {
  return {
    turn: {
      schemaVersion: 1, id: `turn_${suffix}`, conversationId: 'conversation_01', sequence,
      authorKind, authorId, sourceTurnId: null, requestedAction: 'message',
      idempotencyKey: `conversation_01:turn:${suffix}`, status: 'pending', finalMessageId: null,
      createdAt: NOW + sequence, startedAt: null, finishedAt: null,
    },
    message: {
      schemaVersion: 1, id: `message_${suffix}`, conversationId: 'conversation_01', turnId: `turn_${suffix}`,
      sequence, kind: 'authored', authorKind, authorId, sourceConversationId: null, sourceTurnId: null,
      idempotencyKey: `conversation_01:message:${suffix}`,
      contentParts: [{ kind: 'markdown', text }], createdAt: NOW + sequence,
    },
    mailbox: {
      schemaVersion: 1, id: `mailbox_${suffix}`, messageId: `message_${suffix}`, conversationId: 'conversation_01',
      targetTurnId: `turn_${suffix}`, authorKind, authorId, enqueueSequence: sequence,
      deliveryState: 'queued', idempotencyKey: `conversation_01:mailbox:${suffix}`,
      createdAt: NOW + sequence, deliveredAt: null,
    },
  }
}

test('durable mailbox creates pending turns, atomically leases one ordered delivery, recovers expired leases, and does not duplicate authored messages', () => {
  const db = database()
  try {
    const repository = seedConversation(db)
    let current = NOW + 10
    const service = createAgentConversationMailboxService({ repository, now: () => current, leaseDurationMs: 25 })
    const first = service.enqueueInbound(inbound(1, 'one'))
    const duplicate = service.enqueueInbound(inbound(1, 'one'))
    assert.throws(() => service.enqueueInbound(inbound(1, 'one', {
      text: 'Conflicting payload under the same idempotency identity.',
    })), /message idempotency key/i)
    service.enqueueInbound(inbound(2, 'two', { authorKind: 'orchestrator', authorId: 'agent_root' }))
    assert.equal(first.inserted, true)
    assert.equal(duplicate.inserted, false)
    assert.deepEqual(repository.getConversationProjection('conversation_01').turns.map((turn) => turn.status), ['pending', 'pending'])

    const firstClaim = service.claimNext({ conversationId: 'conversation_01', leaseId: 'delivery_a' })
    assert.equal(firstClaim.mailbox.id, 'mailbox_one')
    assert.equal(service.claimNext({ conversationId: 'conversation_01', leaseId: 'delivery_b' }), null)
    current += 30
    const recovered = service.claimNext({ conversationId: 'conversation_01', leaseId: 'delivery_c' })
    assert.equal(recovered.mailbox.id, 'mailbox_one')
    service.commitClaim({ mailboxId: 'mailbox_one', leaseId: 'delivery_c' })
    assert.equal(repository.getConversationProjection('conversation_01').turns[0].status, 'queued')
    assert.equal(service.claimNext({ conversationId: 'conversation_01', leaseId: 'delivery_d' }), null)
    service.transitionTurn({ conversationId: 'conversation_01', turnId: 'turn_one', status: 'completed' })
    assert.equal(service.claimNext({ conversationId: 'conversation_01', leaseId: 'delivery_e' }).mailbox.id, 'mailbox_two')
  } finally { db.close() }
})

test('one active conversation turn is structural, and final packages are bounded structured evidence rather than transcript prose', () => {
  const db = database()
  try {
    const repository = seedConversation(db)
    const service = createAgentConversationMailboxService({ repository, now: () => NOW + 10 })
    service.enqueueInbound(inbound(1, 'one'))
    service.enqueueInbound(inbound(2, 'two'))
    const claimed = service.claimNext({ conversationId: 'conversation_01', leaseId: 'delivery_a' })
    service.commitClaim({ mailboxId: claimed.mailbox.id, leaseId: 'delivery_a' })
    assert.throws(() => service.transitionTurn({ conversationId: 'conversation_01', turnId: 'turn_two', status: 'queued' }), /active turn/i)
    repository.appendMessage({
      schemaVersion: 1, id: 'final_one', conversationId: 'conversation_01', turnId: 'turn_one', sequence: 3,
      kind: 'final', authorKind: 'agent', authorId: 'agent_root', sourceConversationId: null, sourceTurnId: null,
      idempotencyKey: 'conversation_01:final:one', contentParts: [{ kind: 'markdown', text: '## Conclusion\nSafe to proceed.' }], createdAt: NOW + 15,
    })
    service.transitionTurn({ conversationId: 'conversation_01', turnId: 'turn_one', status: 'completed', finalMessageId: 'final_one' })
    assert.throws(() => service.transitionTurn({
      conversationId: 'conversation_01', turnId: 'turn_one', status: 'running',
    }), /terminal turn/i)
    const evidence = service.packageTurnEvidence({ conversationId: 'conversation_01', turnId: 'turn_one' })
    assert.deepEqual(Object.keys(evidence).sort(), ['artifacts', 'conclusion', 'conversationId', 'finalMessage', 'provenance', 'schemaVersion', 'status', 'turnId'])
    assert.equal(evidence.conclusion, '## Conclusion\nSafe to proceed.')
    assert.equal(Object.hasOwn(evidence, 'transcript'), false)
  } finally { db.close() }
})

test('continuation route selection is capability-evidenced rather than inferred from provider/model identity', () => {
  const db = database()
  try {
    const repository = seedConversation(db)
    const service = createAgentConversationMailboxService({ repository })
    assert.deepEqual(service.resolveContinuation({ routeAvailable: true, capabilities: { nativeResume: true, nativeSessionReference: 'native_1' } }), { mode: 'native_resume', reason: null })
    assert.deepEqual(service.resolveContinuation({ routeAvailable: true, capabilities: { managedRehydration: true } }), { mode: 'managed_rehydration', reason: null })
    assert.deepEqual(service.resolveContinuation({ routeAvailable: true, capabilities: {} }), { mode: 'unavailable', reason: 'continuation_not_evidenced' })
    assert.deepEqual(service.resolveContinuation({ routeAvailable: false, capabilities: { nativeResume: true, nativeSessionReference: 'native_1' } }), { mode: 'unavailable', reason: 'route_unavailable' })
  } finally { db.close() }
})

test('a continuation that fails before scheduler admission closes its leased turn without later replay', () => {
  const db = database()
  try {
    const repository = seedConversation(db)
    const service = createAgentConversationMailboxService({ repository, now: () => NOW + 10 })
    service.enqueueInbound(inbound(1, 'failed_admission'))
    const claim = service.claimNext({ conversationId: 'conversation_01', leaseId: 'failed_lease' })

    const failed = service.failClaim({ mailboxId: claim.mailbox.id, leaseId: claim.leaseId })

    assert.equal(failed.turn.status, 'failed')
    assert.equal(failed.mailbox.deliveryState, 'failed')
    assert.equal(repository.getConversationProjection('conversation_01').conversation.status, 'completed')
    assert.equal(service.claimNext({ conversationId: 'conversation_01', leaseId: 'unexpected_replay' }), null)
  } finally { db.close() }
})

test('completed managed conversation rehydrates through a fresh run-local node and scheduler attempt without redelivering after service re-instantiation', () => {
  const db = database()
  try {
    const repository = seedConversation(db)
    const store = createAgentEventStore(db)
    const followupRun = makeAgentRun({
      id: 'run_followup', turnId: 'root_turn_followup', rootNodeId: 'agent_followup',
      finalAuthorityNodeId: 'agent_followup', status: 'created', activeNodeCount: 0, queuedNodeCount: 1,
    })
    const followupNode = makeAgentNode({
      id: 'agent_followup', runId: 'run_followup', rootNodeId: 'agent_followup',
      parentNodeId: null, status: 'queued', attemptId: null,
    })
    const followupAttempt = makeAgentAttempt('agent_followup', {
      id: 'attempt_followup', runId: 'run_followup', status: 'queued',
      startedAt: null, providerRequestId: null, providerCorrelationKey: null, usage: null,
    })
    store.append(makeAgentEventDraft('agent_run_created', {
      policyProfileId: 'high', run: followupRun, rootNode: followupNode,
    }, { runId: 'run_followup', nodeId: 'agent_followup', attemptId: null, eventId: 'followup_run_created', idempotencyKey: 'run_followup:created' }))
    repository.bindNode({ nodeId: 'agent_followup', conversationId: 'conversation_01' })

    const followupNow = followupRun.createdAt + 10
    const initial = createAgentConversationMailboxService({ repository, now: () => followupNow })
    initial.enqueueInbound(inbound(1, 'rehydrate'))
    const claim = initial.claimNext({ conversationId: 'conversation_01', leaseId: 'rehydrate_lease' })
    const scheduler = createAgentScheduler(db, { now: () => followupNow })
    const admitted = initial.admitClaimToScheduler({
      claim, scheduler, attemptId: 'attempt_followup',
      schedulerEntry: {
        attemptId: 'attempt_followup', runId: 'run_followup', nodeId: 'agent_followup', parentNodeId: null,
        projectId: 'project_01', threadId: 'thread_01', providerId: 'openai-account', depth: 0,
        tokenReservation: 1, costReservationUsd: 0, toolCallReservation: 1, createdAt: followupNow,
      },
      createOwnership() {
        store.append(makeAgentEventDraft('agent_attempt_queued', {
          attemptId: followupAttempt.id, node: followupNode, attempt: followupAttempt,
        }, { runId: 'run_followup', nodeId: 'agent_followup', attemptId: followupAttempt.id, eventId: 'followup_attempt_queued', idempotencyKey: 'run_followup:queued' }))
      },
    })
    assert.equal(admitted.admitted, true)
    assert.equal(scheduler.get('attempt_followup').status, 'queued')
    assert.equal(repository.getConversationProjection('conversation_01').turns[0].status, 'queued')
    assert.equal(db.prepare('SELECT turn_id FROM agent_attempt_turn_bindings WHERE attempt_id = ?').get('attempt_followup').turn_id, 'turn_rehydrate')

    const reloaded = createAgentConversationMailboxService({ repository, now: () => NOW + 100 })
    assert.equal(reloaded.claimNext({ conversationId: 'conversation_01', leaseId: 'after_restart' }), null)
    assert.equal(repository.getConversationProjection('conversation_01').messages.length, 1)
  } finally { db.close() }
})
