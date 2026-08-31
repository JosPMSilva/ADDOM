import test from 'node:test'
import assert from 'node:assert/strict'

import {
  derivePersistedThreadActivity,
  normalizePersistedLifecycleEvent,
} from '../../src/main/workspace/workspace-thread-activity.mjs'
import {
  createOpenAIAccountMcpElicitationBridge,
  createOpenAIAccountQuestionUserBridge,
} from '../../src/main/ipc-handlers/chat-stream-handler-round-context.mjs'

test('persisted activity gives unresolved ordinary questions precedence over completion', () => {
  const activity = derivePersistedThreadActivity({
    lastViewedAt: 100,
    lifecycle: {
      kind: 'turn_completed',
      createdAt: 220,
      meta: { status: 'ok', stopReason: 'question_user' },
    },
    assistant: {
      eventId: 11,
      meta: {
        stopReason: 'question_user',
        questionUser: { requestId: 'question-1', question: 'Which target?' },
      },
    },
    latestUserEventId: 10,
  })

  assert.deepEqual(activity, { status: 'needs_input', unread: true, updatedAt: 220 })
})

test('a later user message clears an ordinary question and acknowledges viewed completion', () => {
  const completedUnread = derivePersistedThreadActivity({
    lastViewedAt: 100,
    lifecycle: { kind: 'turn_completed', createdAt: 220, meta: { status: 'ok' } },
    assistant: { eventId: 11, meta: { stopReason: 'question_user' } },
    latestUserEventId: 12,
  })
  const completedViewed = derivePersistedThreadActivity({
    lastViewedAt: 250,
    lifecycle: { kind: 'turn_completed', createdAt: 220, meta: { status: 'ok' } },
    assistant: { eventId: 11, meta: { stopReason: 'question_user' } },
    latestUserEventId: 12,
  })

  assert.deepEqual(completedUnread, { status: 'completed', unread: true, updatedAt: 220 })
  assert.deepEqual(completedViewed, { status: 'idle', unread: false, updatedAt: 220 })
})

test('bridge question request and clear events produce durable pending state', () => {
  assert.deepEqual(derivePersistedThreadActivity({
    lifecycle: { kind: 'turn_started', createdAt: 300, meta: {} },
    bridgeQuestion: { eventId: 15, kind: 'question_user_requested', createdAt: 320 },
    latestUserEventId: 14,
  }), { status: 'needs_input', unread: true, updatedAt: 320 })

  assert.deepEqual(derivePersistedThreadActivity({
    lifecycle: { kind: 'turn_started', createdAt: 300, meta: {} },
    bridgeQuestion: { eventId: 16, kind: 'question_user_cleared', createdAt: 330 },
    latestUserEventId: 14,
  }), { status: 'active', unread: false, updatedAt: 300 })
})

test('interrupted and errored terminal states remain failed until viewed', () => {
  assert.deepEqual(derivePersistedThreadActivity({
    lastViewedAt: 100,
    lifecycle: { kind: 'turn_interrupted', createdAt: 400, meta: { status: 'interrupted' } },
  }), { status: 'failed', unread: true, updatedAt: 400 })

  assert.deepEqual(derivePersistedThreadActivity({
    lastViewedAt: 450,
    lifecycle: { kind: 'turn_completed', createdAt: 400, meta: { status: 'error' } },
  }), { status: 'idle', unread: false, updatedAt: 400 })
})

test('canonical turn_state payloads project the durable lifecycle event', () => {
  assert.deepEqual(normalizePersistedLifecycleEvent({
    kind: 'turn_state',
    createdAt: 500,
    payload: {
      timeline: {
        kind: 'turn_completed',
        meta: { status: 'ok', stopReason: 'stop' },
      },
    },
  }), {
    eventId: 0,
    kind: 'turn_completed',
    createdAt: 500,
    meta: { status: 'ok', stopReason: 'stop' },
  })
})

test('OpenAI account question bridge persists request and clear evidence', () => {
  const sent = []
  const persisted = []
  const bridge = createOpenAIAccountQuestionUserBridge({
    activeThreadId: 'thread-openai',
    activeTurnId: 'turn-openai',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
  })

  bridge.onQuestionUserRequest({
    requestId: 'request-1',
    question: 'Choose a release target',
  })
  bridge.onQuestionUserResolved({ requestId: 'request-1', reason: 'answered' })

  assert.deepEqual(sent.map((row) => row.channel), [
    'chat:question-user-requested',
    'chat:question-user-cleared',
  ])
  assert.deepEqual(persisted.map((row) => row.kind), [
    'question_user_requested',
    'question_user_cleared',
  ])
  assert.equal(persisted[0].payload.meta.questionUser.requestId, 'request-1')
  assert.equal(persisted[1].payload.meta.requestId, 'request-1')
})

test('OpenAI account MCP elicitation bridge persists decisions without submitted values', () => {
  const sent = []
  const persisted = []
  const bridge = createOpenAIAccountMcpElicitationBridge({
    activeThreadId: 'thread-openai',
    activeTurnId: 'turn-openai',
    senderId: 19,
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
  })

  bridge.onRequest({
    message: 'Choose a target',
    serverName: 'example-mcp',
    fields: [{ id: 'token', type: 'text' }],
  })
  bridge.onResolved({
    action: 'accept',
    reason: 'responded',
    content: { token: 'must-not-persist' },
  })

  assert.equal(bridge.senderId, 19)
  assert.deepEqual(sent.map((row) => row.channel), [
    'chat:mcp-elicitation-requested',
    'chat:mcp-elicitation-cleared',
  ])
  assert.deepEqual(persisted.map((row) => row.kind), [
    'mcp_elicitation_requested',
    'mcp_elicitation_resolved',
  ])
  assert.equal(persisted[0].payload.meta.fieldCount, 1)
  assert.equal(persisted[1].payload.meta.action, 'accept')
  assert.equal(JSON.stringify(persisted).includes('must-not-persist'), false)
})

test('workspace thread listing projects durable activity and acknowledges it on selection', async (t) => {
  let store
  try {
    store = await import(`../../src/main/workspace/workspace-store.mjs?activity=${Date.now()}`)
    const db = (await import('../../src/main/memory/db.mjs')).getDb()
    if (!db) throw new Error('database unavailable')
  } catch {
    t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
    return
  }

  const projectPath = `C:\\__addom_activity_${Date.now()}`
  const registered = store.registerProject(projectPath)
  const projectId = registered.project.id
  const threadId = registered.activeThread.id
  const base = Date.now() + 1_000
  try {
    store.appendEvent(threadId, {
      turnId: 'turn-activity',
      kind: 'turn_started',
      meta: { status: 'running' },
      createdAt: base,
    })
    assert.equal(store.listThreads(projectId)[0].persistedActivity.status, 'active')

    store.appendEvent(threadId, {
      turnId: 'turn-activity',
      kind: 'assistant_message',
      role: 'assistant',
      content: 'Which target?',
      meta: { stopReason: 'question_user', questionUser: { question: 'Which target?' } },
      createdAt: base + 1,
    })
    store.appendEvent(threadId, {
      turnId: 'turn-activity',
      kind: 'turn_completed',
      meta: { status: 'ok', stopReason: 'question_user' },
      createdAt: base + 2,
    })
    assert.equal(store.listThreads(projectId)[0].persistedActivity.status, 'needs_input')

    store.appendEvent(threadId, {
      turnId: 'turn-next',
      kind: 'user_message',
      role: 'user',
      content: 'Production',
      createdAt: base + 3,
    })
    assert.equal(store.listThreads(projectId)[0].persistedActivity.status, 'completed')

    store.acknowledgeThreadActivity(threadId, base + 4)
    const acknowledged = store.listThreads(projectId)[0]
    assert.equal(acknowledged.persistedActivity.status, 'idle')
    assert.equal(acknowledged.lastViewedAt, base + 4)
  } finally {
    await store.removeProject(projectId)
  }
})
