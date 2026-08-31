import assert from 'node:assert/strict'
import test from 'node:test'

import { planStreamReturnFocus } from '../../src/renderer/components/agents/agent-stream-return-focus.mjs'

test('stream return-focus expands first when the group is collapsed', () => {
  assert.deepEqual(
    planStreamReturnFocus({
      focusNodeId: 'node_01',
      focusSurface: 'stream',
      collapsed: true,
      referencesContainFocus: true,
    }),
    { type: 'expand' },
  )
})

test('stream return-focus focuses only after the group is expanded', () => {
  assert.deepEqual(
    planStreamReturnFocus({
      focusNodeId: 'node_01',
      focusSurface: 'stream',
      collapsed: false,
      referencesContainFocus: true,
    }),
    { type: 'focus', focusNodeId: 'node_01' },
  )
})

test('stream return-focus ignores non-stream surfaces and foreign nodes', () => {
  assert.equal(planStreamReturnFocus({
    focusNodeId: 'node_01',
    focusSurface: 'navigator',
    collapsed: false,
    referencesContainFocus: true,
  }), null)
  assert.equal(planStreamReturnFocus({
    focusNodeId: 'node_01',
    focusSurface: 'stream',
    collapsed: false,
    referencesContainFocus: false,
  }), null)
  assert.equal(planStreamReturnFocus({
    focusNodeId: '',
    focusSurface: 'stream',
    collapsed: false,
    referencesContainFocus: true,
  }), null)
})
