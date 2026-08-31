import test from 'node:test'
import assert from 'node:assert/strict'

import Database from 'better-sqlite3'

import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentMessageBroker } from '../../src/main/agents/agent-message-broker.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentRun,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'

const TS = 1_752_600_000_000

function createDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  return db
}

function seedParentAndChild(store) {
  store.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high',
    run: makeAgentRun(),
    rootNode: makeAgentNode(),
  }, { attemptId: null }))
  const child = makeAgentNode({
    id: 'agent_child',
    status: 'waiting',
    attemptId: 'attempt_agent_child_1',
    startedAt: TS + 1,
  })
  store.append(makeAgentEventDraft('agent_spawned', {
    spawnRequestId: 'spawn_agent_child',
    childNodeId: child.id,
    node: child,
  }, {
    eventId: 'event_spawn_agent_child',
    nodeId: child.id,
    attemptId: null,
    idempotencyKey: 'run_01:spawned:agent_child',
  }))
}

test('message broker durably records both sides and routes a child result only to its parent', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedParentAndChild(store)
    const broker = createAgentMessageBroker({
      eventStore: store,
      repository,
      now: () => TS + 20,
      messageIdFactory: () => 'message_01',
    })

    assert.deepEqual(broker.send({
      runId: 'run_01',
      fromNodeId: 'agent_child',
      toNodeId: 'agent_root',
      text: 'Child result for the direct parent.',
    }), {
      delivered: true,
      messageId: 'message_01',
    })

    const messages = repository.getRunGraph('run_01').transcript
    assert.deepEqual(messages.map((segment) => [
      segment.nodeId,
      segment.kind,
      segment.payload.peerNodeId,
    ]), [
      ['agent_child', 'agent_message_sent', 'agent_root'],
      ['agent_root', 'agent_message_received', 'agent_child'],
    ])
    assert.equal(messages[1].payload.text, 'Child result for the direct parent.')
    assert.throws(() => broker.send({
      runId: 'run_01',
      fromNodeId: 'agent_child',
      toNodeId: 'agent_missing',
      text: 'Must not disappear.',
    }), /not found/i)
  } finally {
    db.close()
  }
})

test('message broker accepts multiline TAB/LF/CR prose and rejects other control characters', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedParentAndChild(store)
    const broker = createAgentMessageBroker({
      eventStore: store,
      repository,
      now: () => TS + 20,
      messageIdFactory: (() => {
        let n = 0
        return () => `message_multiline_${++n}`
      })(),
    })

    const multiline = 'Line one\nLine two\r\nLine three\tcontinue'
    assert.deepEqual(broker.send({
      runId: 'run_01',
      fromNodeId: 'agent_child',
      toNodeId: 'agent_root',
      text: multiline,
    }), {
      delivered: true,
      messageId: 'message_multiline_1',
    })
    const text = repository.getRunGraph('run_01').transcript
      .find((segment) => segment.kind === 'agent_message_received')
      ?.payload.text
    assert.equal(text, multiline)

    assert.throws(() => broker.send({
      runId: 'run_01',
      fromNodeId: 'agent_child',
      toNodeId: 'agent_root',
      text: `bad${String.fromCharCode(0x07)}bell`,
    }), /control character/i)
    assert.throws(() => broker.send({
      runId: 'run_01',
      fromNodeId: 'agent_child',
      toNodeId: 'agent_root',
      text: `c1${String.fromCharCode(0x85)}nel`,
    }), /control character/i)
  } finally {
    db.close()
  }
})
