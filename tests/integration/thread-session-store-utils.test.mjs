import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildThreadProjectionPatch,
  createEmptyThreadSession,
} from '../../src/renderer/store/chat/thread-session-store-utils.mjs'

test('createEmptyThreadSession hides the terminal dock on a fresh thread', () => {
  const session = createEmptyThreadSession()

  assert.equal(session.terminalDock.collapsed, true)
  assert.equal(session.terminalDock.selectedTabId, '')
  assert.equal(session.terminalDock.browserOpen, false)
  assert.equal(session.terminalDock.browserSelectionSessionId, '')
})

test('buildThreadProjectionPatch restores terminal dock visibility when persisted state already targets a session', () => {
  const patch = buildThreadProjectionPatch({
    terminalDock: {
      selectedTabId: 'term_1',
    },
  })

  assert.equal(patch.terminalDock.collapsed, false)
  assert.equal(patch.terminalDock.selectedTabId, 'term_1')
})
