import test from 'node:test'
import assert from 'node:assert/strict'

import Database from 'better-sqlite3'

import { createAgentConversationRepository } from '../../src/main/agents/agent-conversation-repository.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { compactTerminalAgentTranscriptDeltas } from '../../src/main/agents/agent-event-retention.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { createAgentRunQueryService } from '../../src/main/agents/agent-run-query-service.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  AGENT_TEST_TIMESTAMP,
  makeAgentAttempt,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentRun,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'

const SCOPE = Object.freeze({ projectId: 'project_01', threadId: 'thread_01', runId: 'run_01' })
const BEYOND_TRANSCRIPT_RETENTION_MS = 31 * 24 * 60 * 60 * 1_000

function createDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  return db
}

function observeReads(db) {
  const reads = []
  const observed = {
    prepare(sql) {
      const statement = db.prepare(sql)
      const record = { sql, rows: 0 }
      reads.push(record)
      return {
        all(...args) {
          const rows = statement.all(...args)
          record.rows += rows.length
          return rows
        },
        get: (...args) => statement.get(...args),
        run: (...args) => statement.run(...args),
      }
    },
  }
  return { reads, db: observed }
}

function queryServiceOver(db) {
  const repository = createAgentRunRepository(db)
  return { repository, query: createAgentRunQueryService({ db, repository }) }
}

function startRun(store) {
  store.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high',
    run: makeAgentRun(),
    rootNode: makeAgentNode(),
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

function spawnChild(store, childNodeId) {
  store.append(makeAgentEventDraft('agent_spawned', {
    spawnRequestId: `spawn_${childNodeId}`,
    childNodeId,
    node: makeAgentNode({ id: childNodeId }),
  }, {
    nodeId: childNodeId,
    attemptId: null,
    eventId: `event_spawn_${childNodeId}`,
    idempotencyKey: `run_01:spawn:${childNodeId}`,
  }))
  store.append(makeAgentEventDraft('agent_started', {
    attemptId: `attempt_${childNodeId}_1`,
    node: makeAgentNode({ id: childNodeId, status: 'running' }),
    attempt: makeAgentAttempt(childNodeId),
  }, {
    nodeId: childNodeId,
    eventId: `event_agent_started_${childNodeId}`,
    idempotencyKey: `run_01:agent-started:${childNodeId}`,
  }))
}

function appendDeltas(store, {
  nodeId = 'agent_root',
  count = 1,
  createdAt = AGENT_TEST_TIMESTAMP,
  prefix = 'delta',
} = {}) {
  for (let index = 0; index < count; index += 1) {
    store.append(makeAgentEventDraft('agent_commentary_delta', {
      delta: `${prefix} ${index}`,
    }, {
      nodeId,
      eventId: `event_${prefix}_${nodeId}_${index}`,
      idempotencyKey: `run_01:${prefix}:${nodeId}:${index}`,
      createdAt,
    }))
  }
}

function completeRun(store) {
  store.append(makeAgentEventDraft('agent_run_completed', {
    finalAuthorityNodeId: 'agent_root',
    completionReason: 'root_final_emitted',
    run: makeAgentRun({ status: 'completed' }),
  }, {
    attemptId: null,
    eventId: 'event_run_completed',
    idempotencyKey: 'run_01:run-completed',
    createdAt: AGENT_TEST_TIMESTAMP + 101,
  }))
}

function drainEventPages(query, { limit, nodeId = null } = {}) {
  const sequences = []
  let cursor = null
  for (let guard = 0; guard <= 200; guard += 1) {
    const page = query.getEventsPage({ ...SCOPE, ...(nodeId ? { nodeId } : {}), limit, cursor })
    sequences.push(...page.items.map((item) => item.runSequence))
    if (!page.hasMore) return sequences
    assert.ok(page.nextCursor != null, 'a page reporting hasMore must return a cursor')
    assert.ok(page.nextCursor > (cursor || 0), 'cursor must advance')
    cursor = page.nextCursor
  }
  throw new Error('Event paging did not terminate')
}

test('getRun() does not read the transcript, usage, or diagnostic tables its projection discards', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    startRun(store)
    appendDeltas(store, { count: 50 })

    const observed = observeReads(db)
    const { query } = queryServiceOver(observed.db)
    const run = query.getRun(SCOPE)
    assert.equal(run.run.id, 'run_01')

    const executed = observed.reads.map((entry) => entry.sql).join('\n')
    assert.ok(
      !executed.includes('agent_transcript_segments'),
      'getRun must not read agent_transcript_segments',
    )
    assert.ok(
      !executed.includes('agent_usage_projections'),
      'getRun must not read agent_usage_projections',
    )
    assert.ok(
      !executed.includes('agent_provider_diagnostics'),
      'getRun must not read agent_provider_diagnostics',
    )
  } finally {
    db.close()
  }
})

test('getRun() projects the durable conversation identity for each bound execution node', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    startRun(store)
    const conversations = createAgentConversationRepository(db)
    conversations.createConversation({
      schemaVersion: 1,
      id: 'conversation_root',
      projectId: SCOPE.projectId,
      rootThreadId: SCOPE.threadId,
      parentConversationId: null,
      creatorTurnId: 'turn_01',
      ownerKind: 'agent',
      ownerId: 'agent_root',
      createdByKind: 'orchestrator',
      createdById: 'agent_root',
      roleId: 'reviewer',
      providerRoute: { providerId: 'openrouter', modelId: 'test-model' },
      scope: 'nested_agent',
      status: 'active',
      createdAt: AGENT_TEST_TIMESTAMP,
      updatedAt: AGENT_TEST_TIMESTAMP,
    }, { nodeId: 'agent_root' })

    const { query } = queryServiceOver(db)
    const run = query.getRun(SCOPE)

    assert.equal(run.nodes.find((node) => node.id === 'agent_root')?.conversationId, 'conversation_root')
  } finally {
    db.close()
  }
})

test('getEventsPage() reads a bounded page instead of replaying every event in the run', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    startRun(store)
    appendDeltas(store, { count: 400 })

    const observed = observeReads(db)
    const { query } = queryServiceOver(observed.db)
    const page = query.getEventsPage({ ...SCOPE, limit: 25 })

    assert.equal(page.items.length, 25)
    assert.equal(page.hasMore, true)

    const eventRows = observed.reads
      .filter((entry) => entry.sql.includes('agent_events') || entry.sql.includes('agent_event_compactions'))
      .reduce((total, entry) => total + entry.rows, 0)
    assert.ok(
      eventRows <= 60,
      `getEventsPage must read a bounded window, but read ${eventRows} event rows for a 25 item page`,
    )
  } finally {
    db.close()
  }
})

test('getEventsPage() pages across a compaction boundary without dropping or duplicating events', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    startRun(store)
    appendDeltas(store, {
      count: 30,
      createdAt: AGENT_TEST_TIMESTAMP - BEYOND_TRANSCRIPT_RETENTION_MS,
      prefix: 'archived',
    })
    appendDeltas(store, { count: 20, prefix: 'recent' })
    completeRun(store)

    const compaction = compactTerminalAgentTranscriptDeltas(db, { now: AGENT_TEST_TIMESTAMP })
    assert.ok(compaction.compactions >= 1, 'fixture must produce at least one compaction')
    assert.equal(compaction.compactedEvents, 30)

    const { repository, query } = queryServiceOver(db)
    const expected = repository.listEvents('run_01').map((event) => event.runSequence)
    assert.equal(expected.length, 54)

    assert.deepEqual(drainEventPages(query, { limit: 7 }), expected)
  } finally {
    db.close()
  }
})

test('getEventsPage() scoped to a node returns only that node in run sequence order', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    startRun(store)
    spawnChild(store, 'agent_child')
    appendDeltas(store, { count: 15, prefix: 'root' })
    appendDeltas(store, { nodeId: 'agent_child', count: 15, prefix: 'child' })
    appendDeltas(store, { count: 15, prefix: 'root-late' })

    const { repository, query } = queryServiceOver(db)
    const expected = repository.listEvents('run_01')
      .filter((event) => event.nodeId === 'agent_child')
      .map((event) => event.runSequence)
    assert.equal(expected.length, 17)

    assert.deepEqual(drainEventPages(query, { limit: 5, nodeId: 'agent_child' }), expected)
  } finally {
    db.close()
  }
})

test('getTranscriptPage() returns the canonical agent final message as rich text', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    startRun(store)
    const finalText = 'Completed the review.\n\n- Verified the regression test.'
    store.append(makeAgentEventDraft('agent_final_message', {
      text: finalText,
    }, {
      eventId: 'event_agent_final_message',
      idempotencyKey: 'run_01:agent-final-message',
    }))

    const { query } = queryServiceOver(db)
    const page = query.getTranscriptPage({
      ...SCOPE,
      nodeId: 'agent_root',
      limit: 10,
    })
    const final = page.items.find((item) => item.kind === 'agent_final_message')
    assert.equal(final?.content, finalText)
  } finally {
    db.close()
  }
})
