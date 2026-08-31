import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clampWorkspaceRailWidth,
  resolveWorkspaceRailDragEnd,
} from '../../src/renderer/components/workspace/workspace-rail-state.mjs'

test('workspace rail clamps widths and snaps below the useful threshold', () => {
  assert.equal(clampWorkspaceRailWidth(900), 520)
  assert.equal(clampWorkspaceRailWidth(300), 300)
  assert.deepEqual(resolveWorkspaceRailDragEnd({ candidateWidth: 219, previousExpandedWidth: 336 }), {
    open: false,
    width: 336,
  })
  assert.deepEqual(resolveWorkspaceRailDragEnd({ candidateWidth: 280, previousExpandedWidth: 336 }), {
    open: true,
    width: 280,
  })
})
