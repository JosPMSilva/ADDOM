import test from 'node:test'
import assert from 'node:assert/strict'

import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'

test('timeline hydration restores pending question_user state until the user answers', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      createdAt: 1000,
      kind: 'assistant_message',
      turnId: 'turn_1',
      content: 'Clarification needed.',
      meta: {
        threadId: 'thread_1',
        stopReason: 'question_user',
        questionUser: {
          header: 'Project setup needed',
          question: 'What stack should I use?',
          options: [
            { label: 'Python + SQLite', description: 'SQLite schema with Python scripts' },
          ],
        },
      },
    },
  ])

  assert.ok(mapped.pendingQuestionUser)
  assert.equal(mapped.pendingQuestionUser.header, 'Project setup needed')
  assert.equal(mapped.pendingQuestionUser.question, 'What stack should I use?')
  assert.equal(mapped.pendingQuestionUser.options.length, 1)
  assert.equal(mapped.pendingQuestionUser.source, 'local_tool')
  assert.equal(mapped.pendingQuestionUser.answerMode, 'new_user_turn')
})

test('timeline hydration clears pending question_user state after a later user reply', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      createdAt: 1000,
      kind: 'assistant_message',
      turnId: 'turn_1',
      content: 'Clarification needed.',
      meta: {
        threadId: 'thread_1',
        stopReason: 'question_user',
        questionUser: {
          header: 'Project setup needed',
          question: 'What stack should I use?',
          options: [
            { label: 'Python + SQLite', description: 'SQLite schema with Python scripts' },
          ],
        },
      },
    },
    {
      eventId: 2,
      createdAt: 1001,
      kind: 'user_message',
      turnId: 'turn_2',
      content: 'Python + SQLite',
      meta: { threadId: 'thread_1' },
    },
  ])

  assert.equal(mapped.pendingQuestionUser, null)
})

test('timeline hydration restores pending question_user from tool result metadata', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      createdAt: 1000,
      kind: 'tool_result',
      turnId: 'turn_1',
      content: 'Website Type:\nWhat kind of website do you want to build?',
      meta: {
        threadId: 'thread_1',
        toolName: 'question_user',
        decision: 'approved',
        isError: false,
        questionUser: {
          header: 'Website Type',
          question: 'What kind of website do you want to build?',
          options: [
            { id: 'marketing', label: 'Marketing site' },
          ],
        },
      },
    },
    {
      eventId: 2,
      createdAt: 1001,
      kind: 'assistant_message',
      turnId: 'turn_1',
      content: 'What kind of website do you want to build?',
      meta: { threadId: 'thread_1' },
    },
  ])

  assert.ok(mapped.pendingQuestionUser)
  assert.equal(mapped.pendingQuestionUser.header, 'Website Type')
  assert.equal(mapped.pendingQuestionUser.options[0]?.id, 'marketing')
})
