import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeOpenAIAccountQuestionUserRequest } from '../../src/main/api-clients/ai-provider-openai-account-question-user.mjs'
import { createOpenAIAccountQuestionUserBridge } from '../../src/main/ipc-handlers/chat-stream-handler-round-context.mjs'

test('account clarification requests preserve their originating Plan mode', () => {
  const request = normalizeOpenAIAccountQuestionUserRequest({
    id: 'request_1',
    question: 'Which plan depth?',
  }, {
    threadId: 'thread_1',
    turnId: 'turn_1',
    originMode: 'plan',
  })

  assert.equal(request.originMode, 'plan')
})

test('account clarification bridge projects the canonical originating mode', () => {
  const events = []
  const bridge = createOpenAIAccountQuestionUserBridge({
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    mode: 'thinking',
    send: (channel, payload) => events.push({ channel, payload }),
  })

  bridge.onQuestionUserRequest({ question: 'Inspect first?' })

  assert.equal(bridge.originMode, 'thinking')
  assert.equal(events[0].channel, 'chat:question-user-requested')
  assert.equal(events[0].payload.questionUser.originMode, 'thinking')
})
