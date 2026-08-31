import test from 'node:test'
import assert from 'node:assert/strict'

import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'

test('timeline hydration suppresses terminal_memory_suggest tool rows from the runbook lane', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      createdAt: 1000,
      kind: 'tool_result',
      turnId: 'turn_terminal_memory',
      content: 'Terminal memory suggestion prepared.',
      meta: {
        threadId: 'thread_terminal_memory',
        toolName: 'terminal_memory_suggest',
        decision: 'approved',
        isError: false,
        resultPreview: 'Terminal memory suggestion prepared.',
      },
    },
    {
      eventId: 2,
      createdAt: 1001,
      kind: 'assistant_message',
      turnId: 'turn_terminal_memory',
      content: 'Closed the terminal and captured the fix.',
      meta: {
        threadId: 'thread_terminal_memory',
      },
    },
  ])

  assert.equal(mapped.toolActivity.length, 0)
  assert.equal(mapped.timeline.length, 1)
  assert.equal(mapped.timeline[0]?.kind, 'message')
})
