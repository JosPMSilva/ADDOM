import test from 'node:test'
import assert from 'node:assert/strict'

import {
  upsertTimelineMessage,
} from '../../src/renderer/store/chat/activity-builders.mjs'
import {
  buildChatTimelineViewModel,
} from '../../src/renderer/components/chat/chat-panel-helpers.mjs'

test('finalizing an existing assistant message preserves its canonical timeline position', () => {
  const timeline = [
    {
      id: 'msg:assistant-direction',
      kind: 'message',
      createdAt: 100,
      message: {
        id: 'assistant-direction',
        role: 'assistant',
        content: 'Direction ready.',
        status: 'streaming',
        streamMeta: { turnId: 'turn-direction' },
      },
    },
    {
      id: 'tool:plan-draft',
      kind: 'tool',
      createdAt: 200,
      activity: {
        id: 'plan-draft',
        turnId: 'turn-plan-draft',
        type: 'tool',
        label: 'Updated plan',
        createdAt: 200,
      },
    },
  ]

  const next = upsertTimelineMessage(timeline, 'assistant-direction', (message) => ({
    ...message,
    status: 'done',
  }))

  assert.deepEqual(next.map((entry) => entry.id), [
    'msg:assistant-direction',
    'tool:plan-draft',
  ])
  assert.equal(next[0].createdAt, 100)
  assert.equal(next[0].message.status, 'done')
})

test('the live view model keeps a streaming assistant at its persisted turn anchor', () => {
  const timeline = [
    {
      id: 'msg:assistant-direction',
      kind: 'message',
      createdAt: 100,
      message: {
        id: 'assistant-direction',
        role: 'assistant',
        content: 'Direction ready.',
        status: 'streaming',
        streamMeta: { turnId: 'turn-direction' },
      },
    },
    {
      id: 'tool:direction-read',
      kind: 'tool',
      createdAt: 110,
      activity: {
        id: 'direction-read',
        turnId: 'turn-direction',
        type: 'tool',
        label: 'Read project',
        createdAt: 110,
      },
    },
    {
      id: 'tool:plan-draft',
      kind: 'tool',
      createdAt: 200,
      activity: {
        id: 'plan-draft',
        turnId: 'turn-plan-draft',
        type: 'tool',
        label: 'Updated plan',
        createdAt: 200,
      },
    },
  ]

  const view = buildChatTimelineViewModel(timeline, { visibleCount: 20 })

  assert.deepEqual(view.timelineBlocks.map((block) => (
    block.kind === 'runbook'
      ? `runbook:${block.turnId}`
      : `message:${block.entry?.message?.id || ''}`
  )), [
    'message:assistant-direction',
    'runbook:turn-direction',
    'runbook:turn-plan-draft',
  ])
})
