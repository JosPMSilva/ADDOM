import assert from 'node:assert/strict'
import test from 'node:test'

import Database from 'better-sqlite3'

import { createAgentConversationRepository } from '../../src/main/agents/agent-conversation-repository.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentRunQueryService } from '../../src/main/agents/agent-run-query-service.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  AGENT_TEST_TIMESTAMP,
  makeAgentAttempt,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentRun,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'

function createDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  return db
}

function appendActiveRun(store) {
  store.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high', run: makeAgentRun(), rootNode: makeAgentNode(),
  }, { attemptId: null, eventId: 'event_run_created', idempotencyKey: 'run_01:created' }))
  store.append(makeAgentEventDraft('agent_run_started', {
    run: makeAgentRun({ status: 'running', startedAt: AGENT_TEST_TIMESTAMP + 1, queuedNodeCount: 0 }),
  }, { attemptId: null, eventId: 'event_run_started', idempotencyKey: 'run_01:started' }))
  store.append(makeAgentEventDraft('agent_started', {
    attemptId: 'attempt_agent_root_1',
    node: makeAgentNode({ status: 'running' }),
    attempt: makeAgentAttempt(),
  }, { eventId: 'event_agent_started', idempotencyKey: 'run_01:agent-started' }))
}

test('completed conversation paging does not let obsolete assistant deltas hide execution activity', () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    const conversations = createAgentConversationRepository(db)
    conversations.createConversation({
      schemaVersion: 1, id: 'conversation_01', projectId: 'project_01', rootThreadId: 'thread_01',
      parentConversationId: null, creatorTurnId: null, ownerKind: 'agent', ownerId: 'agent_root',
      createdByKind: 'system', createdById: 'system_local', roleId: 'reviewer',
      providerRoute: { providerId: 'openrouter', modelId: 'model_01' }, scope: 'nested_agent',
      status: 'active', createdAt: AGENT_TEST_TIMESTAMP, updatedAt: AGENT_TEST_TIMESTAMP,
    }, { nodeId: 'agent_root' })
    conversations.createTurn({
      schemaVersion: 1, id: 'turn_01', conversationId: 'conversation_01', sequence: 1,
      authorKind: 'user', authorId: 'user_local', sourceTurnId: null, requestedAction: 'initial',
      idempotencyKey: 'conversation_01:turn_01', status: 'running', finalMessageId: null,
      createdAt: AGENT_TEST_TIMESTAMP, startedAt: AGENT_TEST_TIMESTAMP, finishedAt: null,
    })
    conversations.bindAttempt({ attemptId: 'attempt_agent_root_1', turnId: 'turn_01' })

    eventStore.append(makeAgentEventDraft('agent_commentary_delta', { delta: 'Inspecting.' }, {
      eventId: 'event_commentary', idempotencyKey: 'run_01:commentary',
    }))
    for (let index = 1; index <= 3; index += 1) {
      eventStore.append(makeAgentEventDraft('agent_assistant_delta', {
        delta: `answer-${index} `, presentation: 'user',
      }, { eventId: `event_assistant_${index}`, idempotencyKey: `run_01:assistant:${index}` }))
    }
    conversations.appendFinalForAttempt({
      attemptId: 'attempt_agent_root_1', text: 'Final answer.', createdAt: AGENT_TEST_TIMESTAMP + 20,
    })

    const query = createAgentRunQueryService({
      db, repository: createAgentRunRepository(db),
    })
    const page = query.getConversationTranscriptPage({
      projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'agent_root', limit: 1,
    })

    assert.equal(page.items.length, 1)
    assert.equal(page.items[0].kind, 'agent_commentary_delta')
    assert.equal(page.items[0].content, 'Inspecting.')
    assert.equal(page.hasMore, false)
  } finally {
    db.close()
  }
})
