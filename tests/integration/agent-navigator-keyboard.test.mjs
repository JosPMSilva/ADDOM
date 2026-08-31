import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findParentIndex,
  resolveNavigatorKeyCommand,
} from '../../src/renderer/components/agents/agent-navigator-keyboard.mjs'

// depth 0: parent, depth 1: child (expanded parent), depth 0: leaf sibling
const ROWS = Object.freeze([
  { nodeId: 'parent', depth: 0, hasChildren: true, expanded: true },
  { nodeId: 'child', depth: 1, hasChildren: false, expanded: false },
  { nodeId: 'sibling', depth: 0, hasChildren: true, expanded: false },
])

test('vertical arrows move within bounds and stop at the ends', () => {
  assert.deepEqual(resolveNavigatorKeyCommand('ArrowDown', { rows: ROWS, index: 0 }), { type: 'focus', index: 1 })
  assert.deepEqual(resolveNavigatorKeyCommand('ArrowUp', { rows: ROWS, index: 1 }), { type: 'focus', index: 0 })
  assert.deepEqual(resolveNavigatorKeyCommand('ArrowUp', { rows: ROWS, index: 0 }), { type: 'none' })
  assert.deepEqual(resolveNavigatorKeyCommand('ArrowDown', { rows: ROWS, index: 2 }), { type: 'none' })
})

test('ArrowRight expands a collapsed parent and then steps into the branch', () => {
  assert.deepEqual(
    resolveNavigatorKeyCommand('ArrowRight', { rows: ROWS, index: 2 }),
    { type: 'expand', index: 2 },
    'a collapsed parent expands before it can be entered',
  )
  assert.deepEqual(
    resolveNavigatorKeyCommand('ArrowRight', { rows: ROWS, index: 0 }),
    { type: 'focus', index: 1 },
    'an expanded parent moves focus to its first child',
  )
  assert.deepEqual(
    resolveNavigatorKeyCommand('ArrowRight', { rows: ROWS, index: 1 }),
    { type: 'none' },
    'a leaf has nothing to expand or enter',
  )
})

test('ArrowLeft collapses an expanded parent and otherwise climbs to the parent row', () => {
  assert.deepEqual(resolveNavigatorKeyCommand('ArrowLeft', { rows: ROWS, index: 0 }), { type: 'collapse', index: 0 })
  assert.deepEqual(resolveNavigatorKeyCommand('ArrowLeft', { rows: ROWS, index: 1 }), { type: 'focus', index: 0 })
  assert.deepEqual(
    resolveNavigatorKeyCommand('ArrowLeft', { rows: ROWS, index: 2 }),
    { type: 'none' },
    'a collapsed top-level row has no parent to climb to',
  )
})

test('Home, End, and activation keys resolve to the expected commands', () => {
  assert.deepEqual(resolveNavigatorKeyCommand('Home', { rows: ROWS, index: 2 }), { type: 'focus', index: 0 })
  assert.deepEqual(resolveNavigatorKeyCommand('End', { rows: ROWS, index: 0 }), { type: 'focus', index: 2 })
  assert.deepEqual(resolveNavigatorKeyCommand('Enter', { rows: ROWS, index: 1 }), { type: 'select', index: 1 })
  assert.deepEqual(resolveNavigatorKeyCommand(' ', { rows: ROWS, index: 1 }), { type: 'select', index: 1 })
  assert.deepEqual(resolveNavigatorKeyCommand('Tab', { rows: ROWS, index: 1 }), { type: 'none' })
})

test('an empty navigator and out-of-range focus never produce a command for a missing row', () => {
  assert.deepEqual(resolveNavigatorKeyCommand('ArrowDown', { rows: [], index: 0 }), { type: 'none' })
  assert.deepEqual(
    resolveNavigatorKeyCommand('Enter', { rows: ROWS, index: 99 }),
    { type: 'select', index: 2 },
    'a stale index clamps to the last row instead of selecting nothing',
  )
})

test('findParentIndex walks back to the nearest shallower row', () => {
  const deep = [
    { depth: 0 },
    { depth: 1 },
    { depth: 2 },
    { depth: 1 },
  ]
  assert.equal(findParentIndex(deep, 2), 1)
  assert.equal(findParentIndex(deep, 3), 0)
  assert.equal(findParentIndex(deep, 0), -1)
})
