import assert from 'node:assert/strict'
import test from 'node:test'

import Database from 'better-sqlite3'

import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { createAgentConversationRepository } from '../../src/main/agents/agent-conversation-repository.mjs'
import { registerAgentRunHandlers } from '../../src/main/ipc-handlers/agent-runs.mjs'
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

function appendActiveRun(eventStore) {
  eventStore.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high',
    run: makeAgentRun(),
    rootNode: makeAgentNode(),
  }, {
    attemptId: null,
    eventId: 'event_run_created',
    idempotencyKey: 'run_01:created',
  }))
  eventStore.append(makeAgentEventDraft('agent_run_started', {
    run: makeAgentRun({
      status: 'running',
      startedAt: AGENT_TEST_TIMESTAMP + 1,
      queuedNodeCount: 0,
    }),
  }, {
    attemptId: null,
    eventId: 'event_run_started',
    idempotencyKey: 'run_01:started',
  }))
  eventStore.append(makeAgentEventDraft('agent_started', {
    attemptId: 'attempt_agent_root_1',
    node: makeAgentNode({ status: 'running' }),
    attempt: makeAgentAttempt(),
  }, {
    eventId: 'event_agent_started',
    idempotencyKey: 'run_01:agent-started',
  }))
}

function createIpcMainHarness() {
  const handlers = new Map()
  return {
    handlers,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler)
      },
    },
  }
}

function createSender() {
  const sent = []
  const listeners = new Map()
  return {
    sent,
    isDestroyed: () => false,
    send(channel, payload) {
      sent.push({ channel, payload })
    },
    once(event, callback) {
      const callbacks = listeners.get(event) || new Set()
      callbacks.add(callback)
      listeners.set(event, callbacks)
    },
    removeListener(event, callback) {
      const callbacks = listeners.get(event)
      callbacks?.delete(callback)
      if (callbacks?.size === 0) listeners.delete(event)
    },
    listenerCount(event) {
      return listeners.get(event)?.size || 0
    },
    destroy() {
      const callbacks = Array.from(listeners.get('destroyed') || [])
      listeners.delete('destroyed')
      for (const callback of callbacks) callback()
    },
  }
}

test('agent run IPC returns only the selected node durable conversation projection and pages its transcript on demand', async () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    const conversationRepository = createAgentConversationRepository(db)
    conversationRepository.createConversation({
      schemaVersion: 1,
      id: 'conversation_01',
      projectId: 'project_01',
      rootThreadId: 'thread_01',
      parentConversationId: null,
      creatorTurnId: null,
      ownerKind: 'agent',
      ownerId: 'agent_root',
      createdByKind: 'system',
      createdById: 'system_local',
      roleId: 'reviewer',
      providerRoute: { providerId: 'openrouter', modelId: 'model_01' },
      scope: 'nested_agent',
      status: 'active',
      createdAt: AGENT_TEST_TIMESTAMP,
      updatedAt: AGENT_TEST_TIMESTAMP,
    }, { nodeId: 'agent_root' })
    const harness = createIpcMainHarness()
    registerAgentRunHandlers({
      ipcMain: harness.ipcMain,
      db,
      getRuntime: () => ({
        eventStore,
        repository: createAgentRunRepository(db),
        conversationRepository,
      }),
    })
    const projection = await harness.handlers.get('v1:agent-runs:conversation')({ sender: createSender() }, {
      projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'agent_root',
    })
    assert.equal(projection.conversation.id, 'conversation_01')
    assert.equal(projection.nodeId, 'agent_root')
    assert.equal(projection.conversation.providerRoute.modelId, 'model_01')
    conversationRepository.createTurn({
      schemaVersion: 1, id: 'turn_01', conversationId: 'conversation_01', sequence: 1,
      authorKind: 'user', authorId: 'user_local', sourceTurnId: null,
      requestedAction: 'initial', idempotencyKey: 'conversation_01:turn_01', status: 'running',
      finalMessageId: null, createdAt: AGENT_TEST_TIMESTAMP, startedAt: AGENT_TEST_TIMESTAMP, finishedAt: null,
    })
    conversationRepository.bindAttempt({ attemptId: 'attempt_agent_root_1', turnId: 'turn_01' })
    db.prepare(`
      INSERT INTO agent_transcript_segments (
        event_id, run_id, node_id, attempt_id, kind, run_sequence, node_sequence,
        segment_json, content_hash, source_sequence_start, source_sequence_end, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'event_commentary', 'run_01', 'agent_root', 'attempt_agent_root_1',
      'agent_commentary_delta', 4, 4,
      JSON.stringify({ eventId: 'event_commentary', runId: 'run_01', nodeId: 'agent_root', attemptId: 'attempt_agent_root_1', kind: 'agent_commentary_delta', payload: { text: 'Inspecting.' }, runSequence: 4, nodeSequence: 4, createdAt: AGENT_TEST_TIMESTAMP + 2 }),
      'hash_commentary', 4, 4, AGENT_TEST_TIMESTAMP + 2,
    )
    db.prepare(`
      INSERT INTO agent_transcript_segments (
        event_id, run_id, node_id, attempt_id, kind, run_sequence, node_sequence,
        segment_json, content_hash, source_sequence_start, source_sequence_end, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'event_commentary_next', 'run_01', 'agent_root', 'attempt_agent_root_1',
      'agent_commentary_delta', 5, 5,
      JSON.stringify({ eventId: 'event_commentary_next', runId: 'run_01', nodeId: 'agent_root', attemptId: 'attempt_agent_root_1', kind: 'agent_commentary_delta', payload: { text: 'Verifying.' }, runSequence: 5, nodeSequence: 5, createdAt: AGENT_TEST_TIMESTAMP + 3 }),
      'hash_commentary_next', 5, 5, AGENT_TEST_TIMESTAMP + 3,
    )
    const transcript = await harness.handlers.get('v1:agent-runs:conversation-transcript-page')({ sender: createSender() }, {
      projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'agent_root', limit: 1,
    })
    assert.equal(transcript.items[0].turnId, 'turn_01')
    assert.equal(transcript.items[0].content, 'Verifying.')
    assert.equal(transcript.hasMore, true)
    assert.equal(Number.isSafeInteger(transcript.nextCursor), true)
    assert.equal(transcript.nextCursor > 0, true)
    db.prepare(`
      INSERT INTO agent_transcript_segments (
        event_id, run_id, node_id, attempt_id, kind, run_sequence, node_sequence,
        segment_json, content_hash, source_sequence_start, source_sequence_end, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'event_commentary_live', 'run_01', 'agent_root', 'attempt_agent_root_1',
      'agent_commentary_delta', 6, 6,
      JSON.stringify({ eventId: 'event_commentary_live', runId: 'run_01', nodeId: 'agent_root', attemptId: 'attempt_agent_root_1', kind: 'agent_commentary_delta', payload: { text: 'Still working.' }, runSequence: 6, nodeSequence: 6, createdAt: AGENT_TEST_TIMESTAMP + 4 }),
      'hash_commentary_live', 6, 6, AGENT_TEST_TIMESTAMP + 4,
    )
    const olderTranscript = await harness.handlers.get('v1:agent-runs:conversation-transcript-page')({ sender: createSender() }, {
      projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'agent_root',
      limit: 1, cursor: transcript.nextCursor,
    })
    assert.equal(olderTranscript.items[0].content, 'Inspecting.')
    assert.equal(olderTranscript.hasMore, false)
    await assert.rejects(
      harness.handlers.get('v1:agent-runs:conversation')({ sender: createSender() }, {
        projectId: 'project_other', threadId: 'thread_01', runId: 'run_01', nodeId: 'agent_root',
      }),
      /scope|project/i,
    )
  } finally {
    db.close()
  }
})

test('agent run IPC rehydrates a scoped durable conversation before continuing it', async () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    const conversationRepository = createAgentConversationRepository(db)
    conversationRepository.createConversation({
      schemaVersion: 1, id: 'conversation_followup', projectId: 'project_01', rootThreadId: 'thread_01',
      parentConversationId: null, creatorTurnId: null, ownerKind: 'agent', ownerId: 'agent_root',
      createdByKind: 'system', createdById: 'system_local', roleId: 'reviewer',
      providerRoute: { providerId: 'openai-account', modelId: 'gpt-5.6-sol' },
      scope: 'nested_agent', status: 'active', createdAt: AGENT_TEST_TIMESTAMP, updatedAt: AGENT_TEST_TIMESTAMP,
    }, { nodeId: 'agent_root' })
    const calls = []
    const harness = createIpcMainHarness()
    registerAgentRunHandlers({
      ipcMain: harness.ipcMain,
      db,
      resolveContinuationRoute: (conversation) => ({
        supported: true,
        role: { id: conversation.roleId, providerId: 'openai', model: 'gpt-5.6-sol' },
        apiKey: 'resolved-secret',
        projectFolder: 'C:/workspace/project-01',
        agentRuntime: { policy: { maxDepth: 4 } },
        policyProfileId: 'high',
      }),
      getRuntime: () => ({
        eventStore,
        repository: createAgentRunRepository(db),
        conversationRepository,
        async continueConversation(input) { calls.push(input); return { conversationId: 'conversation_followup' } },
      }),
    })
    const result = await harness.handlers.get('v1:agent-runs:followup')({ sender: createSender() }, {
      projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'agent_root', text: 'Continue safely.',
    })
    assert.equal(result.conversationId, 'conversation_followup')
    assert.deepEqual(calls[0], {
      conversationId: 'conversation_followup',
      text: 'Continue safely.',
      authorKind: 'user',
      authorId: 'user_local',
      role: { id: 'reviewer', providerId: 'openai', model: 'gpt-5.6-sol' },
      apiKey: 'resolved-secret',
      projectFolder: 'C:/workspace/project-01',
      agentRuntime: { policy: { maxDepth: 4 } },
      policyProfileId: 'high',
    })
  } finally {
    db.close()
  }
})

test('agent run IPC promotes the latest completed durable turn with its attributable source route', async () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    const conversationRepository = createAgentConversationRepository(db)
    conversationRepository.createConversation({
      schemaVersion: 1, id: 'conversation_promote', projectId: 'project_01', rootThreadId: 'thread_01',
      parentConversationId: null, creatorTurnId: null, ownerKind: 'agent', ownerId: 'agent_root',
      createdByKind: 'system', createdById: 'system_local', roleId: 'reviewer',
      providerRoute: { providerId: 'openai-account', modelId: 'gpt-5.6-sol' },
      scope: 'nested_agent', status: 'completed', createdAt: AGENT_TEST_TIMESTAMP, updatedAt: AGENT_TEST_TIMESTAMP + 10,
    }, { nodeId: 'agent_root' })
    conversationRepository.createTurn({
      schemaVersion: 1, id: 'turn_promote', conversationId: 'conversation_promote', sequence: 1,
      authorKind: 'orchestrator', authorId: 'agent_root', sourceTurnId: null,
      requestedAction: 'initial', idempotencyKey: 'conversation_promote:turn_01', status: 'completed',
      finalMessageId: 'message_promote', createdAt: AGENT_TEST_TIMESTAMP,
      startedAt: AGENT_TEST_TIMESTAMP + 1, finishedAt: AGENT_TEST_TIMESTAMP + 10,
    })
    conversationRepository.bindAttempt({ attemptId: 'attempt_agent_root_1', turnId: 'turn_promote' })
    conversationRepository.appendMessage({
      schemaVersion: 1, id: 'message_promote', conversationId: 'conversation_promote', turnId: 'turn_promote', sequence: 1,
      kind: 'final', authorKind: 'agent', authorId: 'agent_root', sourceConversationId: null, sourceTurnId: null,
      idempotencyKey: 'conversation_promote:message_01', contentParts: [{ kind: 'markdown', text: 'Promotable result.' }],
      createdAt: AGENT_TEST_TIMESTAMP + 10,
    })
    const calls = []
    const harness = createIpcMainHarness()
    registerAgentRunHandlers({
      ipcMain: harness.ipcMain,
      db,
      getRuntime: () => ({
        eventStore,
        repository: createAgentRunRepository(db),
        conversationRepository,
      }),
      createProjectThreadFromPromotion(input) {
        calls.push(input)
        return { project: { id: 'project_01' }, thread: { id: 'thread_promoted' }, recovered: false }
      },
    })
    const result = await harness.handlers.get('v1:agent-runs:promote-conversation')({ sender: createSender() }, {
      projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'agent_root',
    })

    assert.equal(result.supported, true)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].snapshot.sourceRoute, {
      projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'agent_root',
    })
    assert.equal(calls[0].snapshot.sourceRoleLabel, 'Primary agent')
    assert.equal(calls[0].snapshot.content.messages[0].contentParts[0].text, 'Promotable result.')
  } finally {
    db.close()
  }
})

test('agent run IPC returns scoped lightweight projections without privileged values', async () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    db.prepare(`
      INSERT INTO agent_workspaces (
        id, run_id, node_id, attempt_id, project_id, mode, status,
        source_root, workspace_root, project_view_root, base_revision,
        lease_expires_at, ownership_json, recovery_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'workspace_01',
      'run_01',
      'agent_root',
      'attempt_agent_root_1',
      'project_01',
      'local_worktree',
      'active',
      'C:/secret/source',
      'C:/secret/worktree',
      'C:/secret/worktree/project',
      'git:test',
      AGENT_TEST_TIMESTAMP + 10_000,
      JSON.stringify({ cleanupToken: 'never-render-this' }),
      JSON.stringify({ rawHandle: 'never-render-this' }),
      AGENT_TEST_TIMESTAMP,
      AGENT_TEST_TIMESTAMP,
    )

    const harness = createIpcMainHarness()
    registerAgentRunHandlers({
      ipcMain: harness.ipcMain,
      db,
      getRuntime: () => ({
        eventStore,
        repository: createAgentRunRepository(db),
      }),
    })
    const event = { sender: createSender() }
    const scope = { projectId: 'project_01', threadId: 'thread_01' }
    const listed = await harness.handlers.get('v1:agent-runs:list')(event, scope)
    const graph = await harness.handlers.get('v1:agent-runs:get')(event, {
      ...scope,
      runId: 'run_01',
    })

    assert.equal(listed.runs.length, 1)
    assert.equal(graph.run.id, 'run_01')
    assert.equal(graph.transcript, undefined)
    assert.equal(graph.diagnostics, undefined)
    assert.equal(graph.nodes[0].providerThreadId, undefined)
    assert.equal(graph.attempts[0].providerRequestId, undefined)
    assert.equal(graph.attempts[0].providerCorrelationKey, undefined)
    assert.equal(graph.workspaces[0].sourceRoot, undefined)
    assert.equal(graph.workspaces[0].workspaceRoot, undefined)
    assert.equal(graph.workspaces[0].projectViewRoot, undefined)
    assert.doesNotMatch(JSON.stringify(graph), /never-render-this|C:\/secret/u)
  } finally {
    db.close()
  }
})

test('agent run IPC waits for runtime recovery before exposing durable projections', async () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    let releaseRecovery
    let recoveryFinished = false
    const recovery = new Promise((resolve) => {
      releaseRecovery = () => {
        recoveryFinished = true
        resolve()
      }
    })
    const harness = createIpcMainHarness()
    registerAgentRunHandlers({
      ipcMain: harness.ipcMain,
      db,
      getRuntime: () => ({
        eventStore,
        repository: createAgentRunRepository(db),
        ready: () => recovery,
      }),
    })

    const request = harness.handlers.get('v1:agent-runs:list')(
      { sender: createSender() },
      { projectId: 'project_01', threadId: 'thread_01' },
    )
    let settled = false
    void request.finally(() => {
      settled = true
    })
    await Promise.resolve()
    assert.equal(settled, false)

    releaseRecovery()
    const result = await request
    assert.equal(recoveryFinished, true)
    assert.equal(result.runs.length, 1)
  } finally {
    db.close()
  }
})

test('agent run IPC rejects cross-project and cross-thread access before runtime controls', async () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    let controlCalls = 0
    const harness = createIpcMainHarness()
    registerAgentRunHandlers({
      ipcMain: harness.ipcMain,
      db,
      getRuntime: () => ({
        eventStore,
        repository: createAgentRunRepository(db),
        controlService: {
          stopRun() {
            controlCalls += 1
            return { cancelledAttemptIds: [] }
          },
        },
      }),
    })
    const event = { sender: createSender() }

    await assert.rejects(
      harness.handlers.get('v1:agent-runs:get')(event, {
        projectId: 'project_other',
        threadId: 'thread_01',
        runId: 'run_01',
      }),
      /scope|project/i,
    )
    await assert.rejects(
      harness.handlers.get('v1:agent-runs:control')(event, {
        projectId: 'project_01',
        threadId: 'thread_other',
        runId: 'run_01',
        action: 'stop_run',
      }),
      /scope|thread/i,
    )
    await assert.rejects(
      harness.handlers.get('v1:agent-runs:events-page')(event, {
        projectId: 'project_01',
        threadId: 'thread_01',
        runId: 'run_01',
        nodeId: 'node_other',
      }),
      /scope|node/i,
    )
    assert.equal(controlCalls, 0)
  } finally {
    db.close()
  }
})

test('agent run IPC paginates a node transcript and live subscriptions emit committed events once', async () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    for (let index = 0; index < 5; index += 1) {
      eventStore.append(makeAgentEventDraft('agent_commentary_delta', {
        delta: `chunk ${index + 1}`,
      }, {
        eventId: `event_chunk_${index + 1}`,
        idempotencyKey: `run_01:chunk:${index + 1}`,
        createdAt: AGENT_TEST_TIMESTAMP + 10 + index,
      }))
    }

    const harness = createIpcMainHarness()
    registerAgentRunHandlers({
      ipcMain: harness.ipcMain,
      db,
      getRuntime: () => ({
        eventStore,
        repository: createAgentRunRepository(db),
      }),
      subscriptionIdFactory: () => 'agent_subscription_01',
    })
    const sender = createSender()
    const event = { sender }
    const scope = {
      projectId: 'project_01',
      threadId: 'thread_01',
      runId: 'run_01',
      nodeId: 'agent_root',
    }
    const first = await harness.handlers.get('v1:agent-runs:transcript-page')(event, {
      ...scope,
      limit: 2,
    })
    const second = await harness.handlers.get('v1:agent-runs:transcript-page')(event, {
      ...scope,
      limit: 2,
      cursor: first.nextCursor,
    })
    assert.deepEqual(first.items.map((row) => row.content), ['chunk 1', 'chunk 2'])
    assert.deepEqual(second.items.map((row) => row.content), ['chunk 3', 'chunk 4'])
    assert.equal(first.hasMore, true)

    const subscribed = await harness.handlers.get('v1:agent-runs:subscribe')(event, scope)
    assert.equal(subscribed.subscriptionId, 'agent_subscription_01')
    assert.equal(sender.listenerCount('destroyed'), 1)
    eventStore.append(makeAgentEventDraft('agent_commentary_delta', {
      delta: 'live chunk',
    }, {
      eventId: 'event_live_chunk',
      idempotencyKey: 'run_01:live-chunk',
      createdAt: AGENT_TEST_TIMESTAMP + 100,
    }))
    assert.equal(sender.sent.length, 1)
    assert.equal(sender.sent[0].channel, 'v1:agent-runs:event')
    assert.equal(sender.sent[0].payload.event.eventId, 'event_live_chunk')

    await harness.handlers.get('v1:agent-runs:unsubscribe')(event, {
      subscriptionId: subscribed.subscriptionId,
    })
    assert.equal(sender.listenerCount('destroyed'), 0)
    eventStore.append(makeAgentEventDraft('agent_commentary_delta', {
      delta: 'after unsubscribe',
    }, {
      eventId: 'event_after_unsubscribe',
      idempotencyKey: 'run_01:after-unsubscribe',
      createdAt: AGENT_TEST_TIMESTAMP + 101,
    }))
    assert.equal(sender.sent.length, 1)
  } finally {
    db.close()
  }
})

test('agent run IPC shares one destroyed listener across a sender subscription set', async () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    const harness = createIpcMainHarness()
    let nextSubscriptionId = 0
    registerAgentRunHandlers({
      ipcMain: harness.ipcMain,
      db,
      getRuntime: () => ({
        eventStore,
        repository: createAgentRunRepository(db),
      }),
      subscriptionIdFactory: () => `agent_subscription_${++nextSubscriptionId}`,
    })
    const sender = createSender()
    const event = { sender }
    const scope = {
      projectId: 'project_01',
      threadId: 'thread_01',
      runId: 'run_01',
    }

    const first = await harness.handlers.get('v1:agent-runs:subscribe')(event, scope)
    const second = await harness.handlers.get('v1:agent-runs:subscribe')(event, scope)

    assert.equal(sender.listenerCount('destroyed'), 1)

    await harness.handlers.get('v1:agent-runs:unsubscribe')(event, {
      subscriptionId: first.subscriptionId,
    })
    assert.equal(sender.listenerCount('destroyed'), 1)

    await harness.handlers.get('v1:agent-runs:unsubscribe')(event, {
      subscriptionId: second.subscriptionId,
    })
    assert.equal(sender.listenerCount('destroyed'), 0)
  } finally {
    db.close()
  }
})

test('agent run IPC exposes canonical control, retry, and queue routes', async () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    appendActiveRun(eventStore)
    const calls = []
    const harness = createIpcMainHarness()
    registerAgentRunHandlers({
      ipcMain: harness.ipcMain,
      db,
      getRuntime: () => ({
        eventStore,
        repository: createAgentRunRepository(db),
        controlService: {
          stopNode(input) {
            calls.push(['stopNode', input])
            return { cancelledAttemptIds: ['attempt_agent_root_1'] }
          },
          pauseQueue() {
            calls.push(['pauseQueue'])
            return { supported: true }
          },
          resumeQueue() {
            calls.push(['resumeQueue'])
            return { supported: true }
          },
        },
        async retryAgent(input) {
          calls.push(['retryAgent', input])
          return { supported: true, admitted: true }
        },
      }),
    })
    const event = { sender: createSender() }
    const scope = {
      projectId: 'project_01',
      threadId: 'thread_01',
      runId: 'run_01',
    }
    await harness.handlers.get('v1:agent-runs:control')(event, {
      ...scope,
      nodeId: 'agent_root',
      action: 'stop_node',
    })
    await harness.handlers.get('v1:agent-runs:retry')(event, {
      ...scope,
      nodeId: 'agent_root',
    })
    await harness.handlers.get('v1:agent-runs:queue')(event, {
      projectId: 'project_01',
      threadId: 'thread_01',
      paused: true,
    })

    assert.deepEqual(calls.map(([name]) => name), [
      'stopNode',
      'retryAgent',
      'pauseQueue',
    ])
  } finally {
    db.close()
  }
})
