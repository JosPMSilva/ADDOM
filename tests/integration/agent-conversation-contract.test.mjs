import test from 'node:test'
import assert from 'node:assert/strict'

import Database from 'better-sqlite3'

import {
  validateAgentConversation,
  validateAgentMailboxEntry,
  validateAgentMessage,
  validateAgentPromotionSnapshot,
  validateAgentTurn,
} from '../../src/common/agents/agent-conversation-contract.mjs'
import { createAgentConversationRepository } from '../../src/main/agents/agent-conversation-repository.mjs'
import { runMigrations, SCHEMA_VERSION } from '../../src/main/memory/db-migrations.mjs'
import {
  makeAgentAttempt,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentRun,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'

const NOW = 1_754_000_000_000

function conversation(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'conversation_01',
    projectId: 'project_01',
    rootThreadId: 'thread_01',
    parentConversationId: null,
    creatorTurnId: null,
    ownerKind: 'agent',
    ownerId: 'agent_root',
    createdByKind: 'orchestrator',
    createdById: 'agent_root',
    roleId: 'reviewer',
    providerRoute: { providerId: 'openai-account', modelId: 'gpt-5.6-sol' },
    scope: 'nested_agent',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function turn(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'agent_turn_01',
    conversationId: 'conversation_01',
    sequence: 1,
    authorKind: 'user',
    authorId: 'user_local',
    sourceTurnId: null,
    requestedAction: 'message',
    idempotencyKey: 'conversation_01:turn:01',
    status: 'queued',
    finalMessageId: null,
    createdAt: NOW,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  }
}

function message(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'agent_message_01',
    conversationId: 'conversation_01',
    turnId: 'agent_turn_01',
    sequence: 1,
    kind: 'authored',
    authorKind: 'user',
    authorId: 'user_local',
    sourceConversationId: null,
    sourceTurnId: null,
    idempotencyKey: 'conversation_01:message:01',
    contentParts: [{ kind: 'markdown', text: 'Please review this change.' }],
    createdAt: NOW,
    ...overrides,
  }
}

function mailbox(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'mailbox_01',
    messageId: 'agent_message_01',
    conversationId: 'conversation_01',
    targetTurnId: null,
    authorKind: 'user',
    authorId: 'user_local',
    enqueueSequence: 1,
    deliveryState: 'queued',
    idempotencyKey: 'conversation_01:mailbox:01',
    createdAt: NOW,
    deliveredAt: null,
    ...overrides,
  }
}

function promotionSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'promotion_01',
    sourceConversationId: 'conversation_01',
    sourceTurnId: 'agent_turn_01',
    sourceSequence: 1,
    sourceRoleId: 'reviewer',
    sourceRoute: { projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'agent_root' },
    providerProvenance: { providerId: 'openai-account', modelId: 'gpt-5.6-sol' },
    content: { messages: [message()] },
    authority: { permissions: 'reset', approvals: 'reset', providerContinuation: 'reset', workspace: 'reset', stagedWrites: 'reset', merge: 'reset' },
    idempotencyKey: 'conversation_01:turn:01:promotion',
    createdAt: NOW,
    ...overrides,
  }
}

function createV23Database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  db.exec(`
    DROP TABLE agent_attempt_turn_bindings;
    DROP TABLE agent_node_conversation_bindings;
    DROP TABLE agent_promotion_snapshots;
    DROP TABLE agent_mailbox_entries;
    DROP TABLE agent_messages;
    DROP TABLE agent_turns;
    DROP TABLE agent_conversations;
    DROP TABLE agent_conversation_legacy_forensics;
  `)
  db.pragma('user_version = 23')
  seedAgentWorkspace(db)
  return db
}

function seedLegacyRun(db) {
  const store = createAgentEventStore(db)
  store.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high',
    run: makeAgentRun(),
    rootNode: makeAgentNode(),
  }, { attemptId: null, eventId: 'event_run_created', idempotencyKey: 'run_01:created' }))
  store.append(makeAgentEventDraft('agent_started', {
    attemptId: 'attempt_agent_root_1',
    node: makeAgentNode({ status: 'running' }),
    attempt: makeAgentAttempt(),
  }, { eventId: 'event_agent_started', idempotencyKey: 'run_01:started' }))
  db.prepare(`
    INSERT INTO agent_transcript_segments (
      event_id, run_id, node_id, attempt_id, kind, run_sequence, node_sequence,
      segment_json, content_hash, source_sequence_start, source_sequence_end, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'legacy_corrupt_segment', 'run_01', 'agent_root', 'attempt_agent_root_1',
    'agent_commentary_delta', 3, 3,
    JSON.stringify({ payload: { text: '[object Object]' } }), 'legacy-corrupt', 3, 3, NOW,
  )
}

function seedHistoricalChildConversation(db) {
  const store = createAgentEventStore(db)
  const child = makeAgentNode({ id: 'agent_child', status: 'completed' })
  const attempt = makeAgentAttempt('agent_child', { status: 'completed' })
  store.append(makeAgentEventDraft('agent_spawned', {
    spawnRequestId: 'spawn_agent_child',
    childNodeId: child.id,
    node: child,
  }, {
    nodeId: child.id,
    attemptId: null,
    eventId: 'event_agent_child_spawned',
    idempotencyKey: 'run_01:agent-child-spawned',
  }))
  store.append(makeAgentEventDraft('agent_started', {
    attemptId: attempt.id,
    node: child,
    attempt,
  }, {
    nodeId: child.id,
    attemptId: attempt.id,
    eventId: 'event_agent_child_started',
    idempotencyKey: 'run_01:agent-child-started',
  }))
  for (const [eventId, kind, payload, sequence] of [
    ['legacy_child_commentary', 'agent_commentary_delta', { text: '[object Object]' }, 3],
    ['legacy_child_final', 'agent_final_message', {
      text: 'Historical conclusion.',
      finalDocument: { parts: [
        { kind: 'markdown', text: 'Historical conclusion.', appendOrder: 1 },
        { kind: 'citation', text: '\nSource: migration fixture.', appendOrder: 2 },
      ] },
    }, 4],
  ]) {
    const segment = {
      eventId,
      runId: 'run_01',
      nodeId: child.id,
      attemptId: attempt.id,
      kind,
      payload,
      runSequence: sequence,
      nodeSequence: sequence,
      createdAt: NOW + sequence,
    }
    db.prepare(`
      INSERT INTO agent_transcript_segments (
        event_id, run_id, node_id, attempt_id, kind, run_sequence, node_sequence,
        segment_json, content_hash, source_sequence_start, source_sequence_end, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId, 'run_01', child.id, attempt.id, kind, sequence, sequence,
      JSON.stringify(segment), `legacy-${eventId}`, sequence, sequence, NOW + sequence,
    )
  }

  const grandchild = makeAgentNode({
    id: 'agent_grandchild', parentNodeId: child.id, depth: 2,
    branchPath: ['agent_root', child.id, 'agent_grandchild'], status: 'completed',
  })
  const grandchildAttempt = makeAgentAttempt(grandchild.id, {
    parentAttemptId: attempt.id, status: 'completed',
  })
  store.append(makeAgentEventDraft('agent_spawned', {
    spawnRequestId: 'spawn_agent_grandchild', childNodeId: grandchild.id, node: grandchild,
  }, {
    nodeId: grandchild.id, parentNodeId: child.id, attemptId: null,
    eventId: 'event_agent_grandchild_spawned', idempotencyKey: 'run_01:agent-grandchild-spawned',
  }))
  store.append(makeAgentEventDraft('agent_started', {
    attemptId: grandchildAttempt.id, node: grandchild, attempt: grandchildAttempt,
  }, {
    nodeId: grandchild.id, parentNodeId: child.id, attemptId: grandchildAttempt.id,
    eventId: 'event_agent_grandchild_started', idempotencyKey: 'run_01:agent-grandchild-started',
  }))
  const final = {
    eventId: 'legacy_grandchild_final', runId: 'run_01', nodeId: grandchild.id,
    attemptId: grandchildAttempt.id, kind: 'agent_final_message',
    payload: { text: 'Nested historical conclusion.' },
    runSequence: 7, nodeSequence: 3, createdAt: NOW + 7,
  }
  db.prepare(`
    INSERT INTO agent_transcript_segments (
      event_id, run_id, node_id, attempt_id, kind, run_sequence, node_sequence,
      segment_json, content_hash, source_sequence_start, source_sequence_end, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    final.eventId, final.runId, final.nodeId, final.attemptId, final.kind,
    final.runSequence, final.nodeSequence, JSON.stringify(final), 'legacy-grandchild-final',
    final.runSequence, final.runSequence, final.createdAt,
  )
}

test('versioned conversation records validate explicit identity, provenance, ordering, and terminal timestamps', () => {
  assert.equal(validateAgentConversation(conversation()).id, 'conversation_01')
  assert.equal(validateAgentTurn(turn()).sequence, 1)
  assert.equal(validateAgentMessage(message()).contentParts[0].kind, 'markdown')
  assert.equal(validateAgentMailboxEntry(mailbox()).enqueueSequence, 1)
  assert.equal(validateAgentPromotionSnapshot(promotionSnapshot()).sourceSequence, 1)
  assert.throws(
    () => validateAgentTurn(turn({ status: 'completed', finishedAt: null })),
    /finishedAt is required/i,
  )
  assert.throws(
    () => validateAgentMessage(message({ contentParts: [{ kind: 'unregistered', text: 'No implicit provider payloads.' }] })),
    /contentParts\[0\]\.kind/i,
  )
})

test('current schema migrates historical child data into canonical conversations and quarantines object sentinels', () => {
  const db = createV23Database()
  try {
    seedLegacyRun(db)
    seedHistoricalChildConversation(db)
    assert.equal(Number(db.pragma('user_version', { simple: true })), 23)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'agent_conversations'").get().count, 0)

    runMigrations(db)

    assert.equal(SCHEMA_VERSION, 29)
    assert.equal(Number(db.pragma('user_version', { simple: true })), SCHEMA_VERSION)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_node_conversation_bindings').get().count, 2)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_attempt_turn_bindings').get().count, 2)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_messages').get().count, 2)
    const migrated = createAgentConversationRepository(db).getConversationProjection(
      db.prepare('SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?').get('agent_child').conversation_id,
    )
    assert.deepEqual(migrated.messages[0].contentParts.map((part) => part.text), [
      'Historical conclusion.',
      'Source: migration fixture.',
    ])
    const grandchildConversation = createAgentConversationRepository(db).getConversationProjection(
      db.prepare('SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?').get('agent_grandchild').conversation_id,
    )
    assert.equal(grandchildConversation.conversation.parentConversationId, migrated.conversation.id)
    assert.equal(grandchildConversation.conversation.creatorTurnId, migrated.turns[0].id)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_conversation_legacy_forensics').get().count, 1)
    assert.equal(db.prepare('SELECT reason FROM agent_conversation_legacy_forensics').get().reason, 'invalid_object_sentinel')
    assert.deepEqual(
      createAgentConversationRepository(db).getMigrationExpectation(),
      { fromSchemaVersion: 23, toSchemaVersion: 27, backupRequired: true, rollback: 'restore_backup_with_prior_binary' },
    )
  } finally {
    db.close()
  }
})

test('conversation repository appends ordered idempotent records, binds new ownership, projects safely, and cascades', () => {
  const db = createV23Database()
  try {
    seedLegacyRun(db)
    runMigrations(db)
    const repository = createAgentConversationRepository(db)

    assert.throws(() => repository.createConversation(conversation()), /nodeId is required/i)
    repository.createConversation(conversation(), { nodeId: 'agent_root' })
    repository.createTurn(turn())
    repository.bindAttempt({ attemptId: 'attempt_agent_root_1', turnId: 'agent_turn_01' })
    const first = repository.appendMessage(message())
    const duplicate = repository.appendMessage(message({ id: 'agent_message_duplicate' }))
    repository.enqueueMailbox(mailbox())
    const snapshot = repository.createPromotionSnapshot(promotionSnapshot())
    const duplicateSnapshot = repository.createPromotionSnapshot(promotionSnapshot({ id: 'promotion_duplicate' }))

    assert.equal(first.inserted, true)
    assert.equal(duplicate.inserted, false)
    assert.equal(duplicate.item.id, 'agent_message_01')
    assert.equal(snapshot.inserted, true)
    assert.equal(duplicateSnapshot.inserted, false)
    assert.equal(duplicateSnapshot.item.id, 'promotion_01')
    assert.throws(
      () => repository.appendMessage(message({ id: 'agent_message_out_of_order', sequence: 3, idempotencyKey: 'conversation_01:message:03' })),
      /next message sequence/i,
    )
    const projection = repository.getConversationProjection('conversation_01')
    assert.deepEqual(projection.messages.map((entry) => entry.sequence), [1])
    assert.equal(Object.hasOwn(projection.messages[0], 'providerContinuationHandle'), false)
    assert.equal(projection.mailbox[0].deliveryState, 'queued')
    assert.equal(db.prepare('SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?').get('agent_root').conversation_id, 'conversation_01')
    assert.equal(db.prepare('SELECT turn_id FROM agent_attempt_turn_bindings WHERE attempt_id = ?').get('attempt_agent_root_1').turn_id, 'agent_turn_01')

    db.prepare('DELETE FROM chat_threads WHERE id = ?').run('thread_01')
    for (const table of ['agent_conversations', 'agent_turns', 'agent_messages', 'agent_mailbox_entries']) {
      assert.equal(Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count), 0, table)
    }
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM agent_promotion_snapshots').get().count), 1)
  } finally {
    db.close()
  }
})

test('conversation bindings are foreign-key owned and reject cross-project node scope', () => {
  const db = createV23Database()
  try {
    seedLegacyRun(db)
    db.prepare(`
      INSERT INTO workspace_projects (
        id, path, name, created_at, last_opened_at, last_worked_at, last_provider, last_model
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('project_02', 'C:/workspace/project-02', 'Project 02', NOW, NOW, NOW, 'openai-account', 'gpt-5.6-sol')
    db.prepare(`
      INSERT INTO chat_threads (id, project_id, title, created_at, updated_at, last_viewed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('thread_02', 'project_02', 'Other project', NOW, NOW, NOW)
    runMigrations(db)
    const repository = createAgentConversationRepository(db)

    assert.throws(
      () => repository.createConversation(
        conversation({ projectId: 'project_02', rootThreadId: 'thread_02' }),
        { nodeId: 'agent_root' },
      ),
      /node scope/i,
    )

    repository.createConversation(conversation(), { nodeId: 'agent_root' })
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_node_conversation_bindings').get().count, 1)
    db.prepare('DELETE FROM agent_conversations WHERE id = ?').run('conversation_01')
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_node_conversation_bindings').get().count, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_nodes WHERE id = ?').get('agent_root').count, 1)
  } finally {
    db.close()
  }
})

test('idempotency keys reject conflicting message and mailbox payloads', () => {
  const db = createV23Database()
  try {
    seedLegacyRun(db)
    runMigrations(db)
    const repository = createAgentConversationRepository(db)
    repository.createConversation(conversation(), { nodeId: 'agent_root' })
    repository.createTurn(turn())
    repository.appendMessage(message())
    repository.enqueueMailbox(mailbox())

    assert.throws(
      () => repository.appendMessage(message({
        id: 'agent_message_conflict',
        contentParts: [{ kind: 'markdown', text: 'Different payload.' }],
      })),
      /idempotency key.*different payload/i,
    )
    assert.throws(
      () => repository.enqueueMailbox(mailbox({
        id: 'mailbox_conflict',
        targetTurnId: 'agent_turn_01',
      })),
      /idempotency key.*different payload/i,
    )
  } finally {
    db.close()
  }
})
