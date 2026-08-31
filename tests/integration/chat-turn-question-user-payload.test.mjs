import test from 'node:test'
import assert from 'node:assert/strict'

import { finalizeRoundWithoutTools } from '../../src/main/chat/chat-turn-events.mjs'

test('finalizeRoundWithoutTools emits structured question_user payload on chat:done and persisted assistant message metadata', () => {
  const sent = []
  const persisted = []
  const turnStates = []

  finalizeRoundWithoutTools({
    send: (channel, payload) => {
      sent.push({ channel, payload })
    },
    persistTimelineEvent: (kind, payload) => {
      persisted.push({ kind, payload })
    },
    sendTurnState: (state, payload) => {
      turnStates.push({ state, payload })
    },
    assistantText: 'Clarification needed.',
    providerId: 'openai',
    model: 'gpt-5.4',
    threadId: 'thread_1',
    turnId: 'turn_1',
    round: 1,
    stopReason: 'question_user',
    questionUser: {
      header: 'Project setup needed',
      question: 'What stack should I use?',
      options: [
        { label: 'Python + SQLite', description: 'SQLite schema with Python scripts' },
        { label: 'Node + Express', description: 'Express REST API with a DB' },
      ],
    },
  })

  assert.equal(sent.length > 0, true)
  assert.equal(persisted.length > 0, true)
  assert.equal(turnStates.length > 0, true)

  const doneEvent = sent.find((entry) => entry.channel === 'chat:done')
  assert.ok(doneEvent)
  assert.equal(doneEvent.payload.questionUser.header, 'Project setup needed')
  assert.equal(doneEvent.payload.questionUser.question, 'What stack should I use?')
  assert.equal(doneEvent.payload.questionUser.source, 'local_tool')
  assert.equal(doneEvent.payload.questionUser.answerMode, 'new_user_turn')
  assert.deepEqual(doneEvent.payload.questionUser.options.map((option) => option.label), [
    'Python + SQLite',
    'Node + Express',
  ])
  assert.deepEqual(doneEvent.payload.questionUser.options.map((option) => option.id), [
    'option_1',
    'option_2',
  ])

  const assistantMessageEvent = persisted.find((entry) => entry.kind === 'assistant_message')
  assert.ok(assistantMessageEvent)
  assert.equal(assistantMessageEvent.payload.meta.stopReason, 'question_user')
  assert.equal(assistantMessageEvent.payload.meta.questionUser.header, 'Project setup needed')
  assert.equal(assistantMessageEvent.payload.meta.questionUser.options.length, 2)
  assert.equal(assistantMessageEvent.payload.meta.questionUser.source, 'local_tool')
  assert.equal(assistantMessageEvent.payload.meta.questionUser.answerMode, 'new_user_turn')

  assert.deepEqual(turnStates.at(-1), {
    state: 'completed',
    payload: {
      status: 'ok',
      stopReason: 'question_user',
    },
  })
})

test('finalizeRoundWithoutTools persists providerHistoryParts for assistant continuity replay', () => {
  const sent = []
  const persisted = []

  const providerHistoryParts = [
    {
      type: 'reasoning',
      text: 'Anthropic thinking block.',
      providerOptions: {
        anthropic: {
          signature: 'sig_123',
        },
      },
    },
    {
      type: 'reasoning',
      text: '',
      providerOptions: {
        anthropic: {
          redactedData: 'redacted_blob',
        },
      },
    },
    {
      type: 'text',
      text: 'Provider history text that must not redefine the final document.',
    },
  ]

  finalizeRoundWithoutTools({
    send: (channel, payload) => {
      sent.push({ channel, payload })
    },
    persistTimelineEvent: (kind, payload) => {
      persisted.push({ kind, payload })
    },
    sendTurnState: () => {},
    assistantText: 'Final answer.',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    threadId: 'thread_1',
    turnId: 'turn_1',
    round: 2,
    stopReason: 'stop',
    assistantMessageId: 'assistant_provider_history',
    assistantHistoryParts: providerHistoryParts,
  })

  const doneEvent = sent.find((entry) => entry.channel === 'chat:done')
  assert.ok(doneEvent)
  assert.equal(doneEvent.payload.assistantMessageId, 'assistant_provider_history')
  assert.deepEqual(doneEvent.payload.finalDocument, {
    schemaVersion: 1,
    threadId: 'thread_1',
    turnId: 'turn_1',
    messageId: 'assistant_provider_history',
    ownership: 'final-document',
    text: 'Final answer.',
    parts: [{
      threadId: 'thread_1',
      turnId: 'turn_1',
      messageId: 'assistant_provider_history',
      partId: 'assistant_provider_history:final-document:1',
      appendOrder: 1,
      sequence: 1,
      status: 'completed',
      ownership: 'final-document',
      kind: 'markdown',
      text: 'Final answer.',
    }],
  })
  assert.deepEqual(doneEvent.payload.providerHistoryParts, providerHistoryParts)

  const assistantMessageEvent = persisted.find((entry) => entry.kind === 'assistant_message')
  assert.ok(assistantMessageEvent)
  assert.equal(assistantMessageEvent.payload.meta.assistantMessageId, 'assistant_provider_history')
  assert.deepEqual(assistantMessageEvent.payload.meta.finalDocument, doneEvent.payload.finalDocument)
  assert.deepEqual(assistantMessageEvent.payload.meta.providerHistoryParts, providerHistoryParts)
})

test('finalizeRoundWithoutTools emits and persists generated artifact references without raw image bytes', () => {
  const sent = []
  const persisted = []
  const generatedArtifacts = [{
    artifactId: 'generated:att-1',
    attachmentId: 'att-1',
    toolCallId: 'image-call-1',
    toolName: 'vendor_image',
    sourcePath: 'C:/generated/hero.png',
    kind: 'image',
    mediaType: 'image/png',
    fileName: 'hero.png',
    sizeBytes: 42,
    previewUrl: 'addom-attachment://attachment/att-1',
  }]

  finalizeRoundWithoutTools({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    sendTurnState: () => {},
    assistantText: '![Hero](<C:/generated/hero.png>)',
    providerId: 'provider-a',
    model: 'model-a',
    threadId: 'thread-artifact',
    turnId: 'turn-artifact',
    assistantMessageId: 'assistant-artifact',
    generatedArtifacts,
  })

  const doneEvent = sent.find((entry) => entry.channel === 'chat:done')
  const assistantMessageEvent = persisted.find((entry) => entry.kind === 'assistant_message')
  assert.deepEqual(doneEvent?.payload?.generatedArtifacts, generatedArtifacts)
  assert.deepEqual(assistantMessageEvent?.payload?.meta?.generatedArtifacts, generatedArtifacts)
  assert.equal(JSON.stringify(doneEvent).includes('rawBytes'), false)
})

test('finalizeRoundWithoutTools persists the final before projection and does not project persistence failure', () => {
  const order = []
  finalizeRoundWithoutTools({
    send: (channel) => order.push(`send:${channel}`),
    persistTimelineEvent: (kind) => order.push(`persist:${kind}`),
    sendTurnState: (state) => order.push(`turn:${state}`),
    assistantText: 'Durable final.',
    providerId: 'openai',
    model: 'gpt-5.4',
    threadId: 'thread-order',
    turnId: 'turn-order',
    assistantMessageId: 'assistant-order',
  })
  assert.deepEqual(order.slice(0, 3), [
    'persist:assistant_message',
    'send:chat:done',
    'turn:completed',
  ])

  const failedOrder = []
  assert.throws(() => finalizeRoundWithoutTools({
    send: (channel) => failedOrder.push(`send:${channel}`),
    persistTimelineEvent: (kind) => {
      failedOrder.push(`persist:${kind}`)
      throw new Error('final ledger unavailable')
    },
    sendTurnState: (state) => failedOrder.push(`turn:${state}`),
    assistantText: 'Must not become visible.',
    threadId: 'thread-failure',
    turnId: 'turn-failure',
    assistantMessageId: 'assistant-failure',
  }), /final ledger unavailable/i)
  assert.deepEqual(failedOrder, ['persist:assistant_message'])
})

test('finalizeRoundWithoutTools delegates final and terminal projection to the atomic canonical committer', () => {
  const commits = []
  const forbiddenCalls = []
  const loop = { turnStateFinalized: false }

  finalizeRoundWithoutTools({
    send: (channel) => forbiddenCalls.push(`send:${channel}`),
    persistTimelineEvent: (kind) => forbiddenCalls.push(`persist:${kind}`),
    sendTurnState: (state) => forbiddenCalls.push(`turn:${state}`),
    commitFinalTurn: (payload) => commits.push(payload),
    loop,
    assistantText: 'Committed once.',
    providerId: 'openai',
    model: 'gpt-5.4',
    threadId: 'thread-atomic-final',
    turnId: 'turn-atomic-final',
    assistantMessageId: 'assistant-atomic-final',
  })

  assert.deepEqual(forbiddenCalls, [])
  assert.equal(commits.length, 1)
  assert.equal(commits[0].donePayload.full, 'Committed once.')
  assert.equal(commits[0].assistantMeta.assistantMessageId, 'assistant-atomic-final')
  assert.deepEqual(commits[0].terminalPayload, {
    status: 'ok',
    stopReason: '',
  })
  assert.equal(loop.turnStateFinalized, true)
})
