import test from 'node:test'
import assert from 'node:assert/strict'

import { buildTimelineBlocks } from '../../src/renderer/components/chat/chat-panel-helpers.mjs'

function toolEntry({
  id,
  turnId = 'turn-1',
  sequence = 1,
  path = '',
  createdAt = 0,
} = {}) {
  return {
    kind: 'tool',
    id,
    activity: {
      id: `activity-${id}`,
      turnId,
      type: 'result',
      toolName: 'write_file',
      decision: 'approved',
      isError: false,
      sequence,
      createdAt,
      toolInput: {
        filePath: path,
        path,
      },
    },
  }
}

test('buildTimelineBlocks can attach full turn activities beyond rendered window', () => {
  const fullTimeline = [
    toolEntry({ id: 'tool-1', sequence: 1, path: 'electron-app/package.json', createdAt: 100 }),
    toolEntry({ id: 'tool-2', sequence: 2, path: 'electron-app/main.js', createdAt: 200 }),
    toolEntry({ id: 'tool-3', sequence: 3, path: 'electron-app/preload.js', createdAt: 300 }),
    {
      kind: 'message',
      id: 'assistant-1',
      message: {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done.',
      },
    },
  ]

  const renderedTimeline = [
    toolEntry({ id: 'tool-3', sequence: 3, path: 'electron-app/preload.js', createdAt: 300 }),
    {
      kind: 'message',
      id: 'assistant-1',
      message: {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done.',
      },
    },
  ]

  const blocks = buildTimelineBlocks(renderedTimeline, { fullTimeline })
  const runbook = blocks.find((block) => block?.kind === 'runbook')
  assert.ok(runbook, 'expected a runbook block')
  assert.equal(Array.isArray(runbook.activities), true)
  assert.equal(runbook.activities.length, 3)
  assert.equal(Array.isArray(runbook.fileChanges), true)
  assert.equal(runbook.fileChanges.length, 3)

  const paths = runbook.activities.map((activity) => String(activity?.toolInput?.path || ''))
  assert.deepEqual(paths, [
    'electron-app/package.json',
    'electron-app/main.js',
    'electron-app/preload.js',
  ])
})

test('buildTimelineBlocks defaults to rendered timeline when full timeline is omitted', () => {
  const renderedTimeline = [
    toolEntry({ id: 'tool-1', sequence: 1, path: 'electron-app/main.js', createdAt: 100 }),
    {
      kind: 'message',
      id: 'assistant-2',
      message: {
        id: 'assistant-2',
        role: 'assistant',
        content: 'Done.',
      },
    },
  ]

  const blocks = buildTimelineBlocks(renderedTimeline)
  const runbook = blocks.find((block) => block?.kind === 'runbook')
  assert.ok(runbook, 'expected a runbook block')
  assert.equal(runbook.activities.length, 1)
  assert.equal(runbook.fileChanges.length, 1)
  assert.equal(String(runbook.activities[0]?.toolInput?.path || ''), 'electron-app/main.js')
})

test('buildTimelineBlocks renders a runbook immediately when its assistant anchor is outside the visible window', () => {
  const renderedTimeline = [
    toolEntry({ id: 'tool-prev', turnId: 'turn-prev', sequence: 1, path: 'src/prev.js', createdAt: 100 }),
    {
      kind: 'message',
      id: 'user-current',
      message: {
        id: 'user-current',
        role: 'user',
        content: '@{Security Reviewer} Say hello',
      },
    },
    {
      kind: 'message',
      id: 'assistant-current',
      message: {
        id: 'assistant-current',
        role: 'assistant',
        content: 'Done.',
        streamMeta: { turnId: 'turn-current' },
      },
    },
  ]

  const blocks = buildTimelineBlocks(renderedTimeline)
  assert.deepEqual(
    blocks.map((block) => block.kind === 'runbook' ? `runbook:${block.turnId}` : `entry:${block.entry?.id}`),
    ['runbook:turn-prev', 'entry:user-current', 'entry:assistant-current'],
  )
})

test('buildTimelineBlocks flushes runbooks only for the matching assistant turn', () => {
  const renderedTimeline = [
    toolEntry({ id: 'tool-1', turnId: 'turn-1', sequence: 1, path: 'src/one.js', createdAt: 100 }),
    toolEntry({ id: 'tool-2', turnId: 'turn-2', sequence: 1, path: 'src/two.js', createdAt: 200 }),
    {
      kind: 'message',
      id: 'assistant-1',
      message: {
        id: 'assistant-1',
        role: 'assistant',
        content: 'First done.',
        streamMeta: { turnId: 'turn-1' },
      },
    },
    {
      kind: 'message',
      id: 'assistant-2',
      message: {
        id: 'assistant-2',
        role: 'assistant',
        content: 'Second done.',
        streamMeta: { turnId: 'turn-2' },
      },
    },
  ]

  const blocks = buildTimelineBlocks(renderedTimeline)
  assert.deepEqual(
    blocks.map((block) => block.kind === 'runbook' ? `runbook:${block.turnId}` : `entry:${block.entry?.id}`),
    ['entry:assistant-1', 'runbook:turn-1', 'entry:assistant-2', 'runbook:turn-2'],
  )
})
