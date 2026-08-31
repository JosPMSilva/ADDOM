import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isCrossToolCommentaryContinuation,
  stitchCrossToolCommentaryItems,
} from '../../src/renderer/components/chat/live-execution-stream-commentary-stitch.mjs'
import { buildExecutionStreamItems } from '../../src/renderer/components/chat/live-execution-stream-items.mjs'

test('isCrossToolCommentaryContinuation merges lowercase and connector tails only', () => {
  assert.equal(
    isCrossToolCommentaryContinuation('Finalized three additions: button will be', 'labeled 10ˣ.'),
    true,
  )
  assert.equal(
    isCrossToolCommentaryContinuation('Planning the calculator upgrade.', 'Applying the patch.'),
    false,
  )
  assert.equal(
    isCrossToolCommentaryContinuation('Also adding profile', 'Dataclass will wrap helpers.'),
    false,
  )
  assert.equal(
    isCrossToolCommentaryContinuation('Fixing messy logic in', 'the PDF/A checker module.'),
    true,
  )
})

test('stitchCrossToolCommentaryItems merges across tool-only gaps and keeps tools', () => {
  const stitched = stitchCrossToolCommentaryItems([
    { id: 'r0', kind: 'commentary', label: 'Finalized three additions: button will be' },
    { id: 't0', kind: 'tool', label: 'Read file' },
    { id: 'r1', kind: 'commentary', label: 'labeled 10ˣ.' },
  ])
  assert.equal(stitched.length, 2)
  assert.equal(stitched[0].kind, 'commentary')
  assert.match(String(stitched[0].label || ''), /button will be\s+labeled 10ˣ/)
  assert.equal(stitched[1].kind, 'tool')
  assert.equal(stitched[1].label, 'Read file')
})

test('stitchCrossToolCommentaryItems does not merge a capitalized new thought', () => {
  const stitched = stitchCrossToolCommentaryItems([
    { id: 'r0', kind: 'commentary', label: 'Also adding profile' },
    { id: 't0', kind: 'tool', label: 'Edited file' },
    { id: 'r1', kind: 'commentary', label: 'Dataclass will wrap helpers.' },
  ])
  assert.deepEqual(stitched.map((item) => item.kind), ['commentary', 'tool', 'commentary'])
  assert.equal(stitched[0].label, 'Also adding profile')
  assert.equal(stitched[2].label, 'Dataclass will wrap helpers.')
})

test('buildExecutionStreamItems stitches legacy split segments across tools', () => {
  const items = buildExecutionStreamItems({
    status: 'done',
    itemOrder: [
      'reasoning:execution_reasoning:turn-legacy',
      'tool:session:turn-legacy:call-1',
      'reasoning:execution_reasoning:turn-legacy:1',
    ],
    sessionsById: {
      'session:turn-legacy:call-1': {
        id: 'session:turn-legacy:call-1',
        toolKind: 'file_read',
        state: 'succeeded',
        inputDetail: 'app.js',
        detail: '',
      },
    },
    reasoningById: {
      'execution_reasoning:turn-legacy': {
        id: 'execution_reasoning:turn-legacy',
        role: 'commentary',
        state: 'done',
        detail: 'Finalized three additions: button will be',
      },
      'execution_reasoning:turn-legacy:1': {
        id: 'execution_reasoning:turn-legacy:1',
        role: 'commentary',
        state: 'done',
        detail: 'labeled 10ˣ.',
      },
    },
  }, { reasoning: true, commentary: true, tools: true }, { collapseSettled: false })

  assert.equal(items.length, 2)
  assert.equal(items[0].kind, 'commentary')
  assert.match(String(items[0].label || ''), /button will be\s+labeled 10ˣ/)
  assert.equal(items[1].kind, 'tool')
  assert.match(String(items[1].label || ''), /Read app\.js|Read file/)
})
