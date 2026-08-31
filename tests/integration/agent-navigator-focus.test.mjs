import assert from 'node:assert/strict'
import test from 'node:test'

import {
  focusAgentNavigatorIndex,
  settleAgentNavigatorFocus,
} from '../../src/renderer/components/agents/agent-navigator-focus.mjs'

test('navigator focuses an already mounted row without moving the viewport', () => {
  let focused = false
  let scrolled = false
  const row = {
    focus: () => { focused = true },
    scrollIntoView: () => { scrolled = true },
  }
  const viewport = { scrollTop: 10 }
  focusAgentNavigatorIndex({
    index: 2,
    rowRefs: new Map([[2, row]]),
    viewport,
    requestFrame: () => assert.fail('mounted rows must not schedule a frame'),
  })
  assert.equal(focused, true)
  assert.equal(scrolled, true)
  assert.equal(viewport.scrollTop, 10)
})

test('navigator scrolls and focuses a virtualized row after it mounts', () => {
  let focused = false
  let frame = 0
  const rowRefs = new Map()
  const viewport = { scrollTop: 0 }
  focusAgentNavigatorIndex({
    index: 99,
    rowRefs,
    viewport,
    rowHeight: 46,
    requestFrame(callback) {
      frame += 1
      if (frame === 2) {
        rowRefs.set(99, {
          focus: () => { focused = true },
          scrollIntoView: () => {},
        })
      }
      callback()
    },
  })
  assert.equal(viewport.scrollTop, 99 * 46)
  assert.equal(focused, true)
  assert.equal(frame, 2)
})

test('navigator settles pending keyboard focus after React mounts the virtual row', () => {
  let focused = false
  const rowRefs = new Map()
  assert.equal(settleAgentNavigatorFocus({ index: 40, rowRefs }), false)
  rowRefs.set(40, {
    focus: () => { focused = true },
    scrollIntoView: () => {},
  })
  assert.equal(settleAgentNavigatorFocus({ index: 40, rowRefs }), true)
  assert.equal(focused, true)
})
