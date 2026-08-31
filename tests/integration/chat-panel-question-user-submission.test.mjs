import test from 'node:test'
import assert from 'node:assert/strict'

import {
  executeSendMessage,
  resolveQuestionUserCardDisabled,
  submitQuestionUserAnswer,
} from '../../src/renderer/components/chat/chat-panel-helpers.mjs'

test('resolveQuestionUserCardDisabled keeps account-bridge clarification interactive while streaming', () => {
  assert.equal(resolveQuestionUserCardDisabled({
    request: { source: 'openai_account_bridge' },
    disabled: true,
    isStreaming: true,
  }), false)
  assert.equal(resolveQuestionUserCardDisabled({
    request: { source: 'openai_account_bridge' },
    disabled: true,
    isStreaming: false,
  }), true)
  assert.equal(resolveQuestionUserCardDisabled({
    request: { source: 'local_tool' },
    disabled: true,
    isStreaming: true,
  }), true)
})

test('submitQuestionUserAnswer preserves local question_user behavior via a new user turn', async () => {
  const calls = {
    sendMessage: [],
    respondQuestionUser: [],
    clearPendingQuestionUser: [],
    setPendingQuestionUser: [],
    notices: [],
  }

  const sent = await submitQuestionUserAnswer({
    request: {
      header: 'Need a choice',
      question: 'Which stack?',
      options: [{ id: 'opt_1', label: 'Node' }],
      source: 'local_tool',
      answerMode: 'new_user_turn',
      originMode: 'plan',
      threadId: 'thread_local',
      turnId: 'turn_local',
    },
    answer: 'Node',
    selectedOptionId: 'opt_1',
    activeThreadId: 'thread_local',
    sendMessage: (content, mode) => {
      calls.sendMessage.push({ content, mode })
      return true
    },
    respondQuestionUser: async (payload) => {
      calls.respondQuestionUser.push(payload)
      return {}
    },
    clearPendingQuestionUser: (options) => {
      calls.clearPendingQuestionUser.push(options)
    },
    setPendingQuestionUser: (payload, options) => {
      calls.setPendingQuestionUser.push({ payload, options })
    },
    pushNotice: (notice) => {
      calls.notices.push(notice)
    },
  })

  assert.equal(sent, true)
  assert.deepEqual(calls.sendMessage, [{ content: 'Node', mode: 'plan' }])
  assert.deepEqual(calls.respondQuestionUser, [])
  assert.deepEqual(calls.clearPendingQuestionUser, [{ threadId: 'thread_local' }])
  assert.deepEqual(calls.setPendingQuestionUser, [])
  assert.deepEqual(calls.notices, [])
})

test('submitQuestionUserAnswer answers account-bridge question_user requests through the bridge', async () => {
  const calls = {
    sendMessage: [],
    respondQuestionUser: [],
    clearPendingQuestionUser: [],
    setPendingQuestionUser: [],
    notices: [],
  }
  const request = {
    header: 'Need a choice',
    question: 'Which folder?',
    options: [{ id: 'opt_src', label: 'src/main' }],
    source: 'openai_account_bridge',
    answerMode: 'bridge_response',
    requestId: 'req_123',
    threadId: 'thread_account',
    turnId: 'turn_account',
  }

  const sent = await submitQuestionUserAnswer({
    request,
    answer: 'src/main',
    selectedOptionId: 'opt_src',
    activeThreadId: 'thread_account',
    sendMessage: (content, mode) => {
      calls.sendMessage.push({ content, mode })
      return true
    },
    respondQuestionUser: async (payload) => {
      calls.respondQuestionUser.push(payload)
      return { ok: true }
    },
    clearPendingQuestionUser: (options) => {
      calls.clearPendingQuestionUser.push(options)
    },
    setPendingQuestionUser: (payload, options) => {
      calls.setPendingQuestionUser.push({ payload, options })
    },
    pushNotice: (notice) => {
      calls.notices.push(notice)
    },
  })

  assert.equal(sent, true)
  assert.deepEqual(calls.sendMessage, [])
  assert.deepEqual(calls.respondQuestionUser, [{
    threadId: 'thread_account',
    requestId: 'req_123',
    answer: 'src/main',
    selectedOptionId: 'opt_src',
  }])
  assert.deepEqual(calls.clearPendingQuestionUser, [])
  assert.deepEqual(calls.setPendingQuestionUser, [{
    payload: {
      ...request,
      responsePending: true,
    },
    options: { threadId: 'thread_account' },
  }])
  assert.deepEqual(calls.notices, [])
})

test('submitQuestionUserAnswer ignores duplicate account-bridge submissions once a response is pending', async () => {
  const calls = {
    sendMessage: [],
    respondQuestionUser: [],
    clearPendingQuestionUser: [],
    setPendingQuestionUser: [],
    notices: [],
  }

  const sent = await submitQuestionUserAnswer({
    request: {
      source: 'openai_account_bridge',
      answerMode: 'bridge_response',
      requestId: 'req_123',
      threadId: 'thread_account',
      responsePending: true,
    },
    answer: 'src/main',
    selectedOptionId: 'opt_src',
    activeThreadId: 'thread_account',
    sendMessage: (content, mode) => {
      calls.sendMessage.push({ content, mode })
      return true
    },
    respondQuestionUser: async (payload) => {
      calls.respondQuestionUser.push(payload)
      return { ok: true }
    },
    clearPendingQuestionUser: (options) => {
      calls.clearPendingQuestionUser.push(options)
    },
    setPendingQuestionUser: (payload, options) => {
      calls.setPendingQuestionUser.push({ payload, options })
    },
    pushNotice: (notice) => {
      calls.notices.push(notice)
    },
  })

  assert.equal(sent, false)
  assert.deepEqual(calls.sendMessage, [])
  assert.deepEqual(calls.respondQuestionUser, [])
  assert.deepEqual(calls.clearPendingQuestionUser, [])
  assert.deepEqual(calls.setPendingQuestionUser, [])
  assert.deepEqual(calls.notices, [])
})

test('executeSendMessage allows interrupt-and-replace sends while a turn is already streaming', () => {
  const calls = []
  const sent = executeSendMessage({
    rawContent: 'Replace the current run with this instruction.',
    isStreaming: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
    activeThreadId: 'thread_replace',
    projectFolder: process.cwd(),
    permissionMode: 'ask',
    addUserMessage: () => 'turn_replace',
    addAssistantPlaceholder: () => 'assistant_replace',
    setAttachedImages: () => {},
    getChatState: () => ({ messages: [], planState: {} }),
    chatStream: (...args) => calls.push(args),
  })

  assert.equal(sent, true)
  assert.equal(calls.length, 1)
})
