import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizePersistedMessages } from '../../src/renderer/store/chat/use-chat-store-helpers.mjs'

test('sanitizePersistedMessages preserves assistant phase for replay-sensitive OpenAI turns', () => {
  const sanitized = sanitizePersistedMessages([
    {
      id: 'assistant_1',
      role: 'assistant',
      content: 'Completed the task.',
      status: 'done',
      phase: 'final_answer',
      reasoning: '',
      reasoningDone: true,
      providerHistoryParts: [
        { type: 'text', text: 'Completed the task.' },
      ],
    },
  ])

  assert.equal(sanitized.length, 1)
  assert.equal(sanitized[0].phase, 'final_answer')
  assert.equal(sanitized[0].finalDocument?.messageId, 'assistant_1')
  assert.equal(sanitized[0].finalDocument?.parts?.[0]?.partId, 'assistant_1:final-document:1')
  assert.equal(sanitized[0].finalDocument?.text, 'Completed the task.')
})
