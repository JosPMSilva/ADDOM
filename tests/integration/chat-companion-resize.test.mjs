import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createChatCompanionDragSession,
  startChatCompanionDragPresentation,
} from '../../src/renderer/components/chat/chat-companion-resize.mjs'

class FakeEventTarget {
  constructor() {
    this.listeners = new Map()
    this.capturedPointerId = null
    this.releasedPointerId = null
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event)
  }

  setPointerCapture(pointerId) {
    this.capturedPointerId = pointerId
  }

  releasePointerCapture(pointerId) {
    this.releasedPointerId = pointerId
  }
}

test('companion drag previews directly and commits only once on pointer release', () => {
  const eventTarget = new FakeEventTarget()
  const captureTarget = new FakeEventTarget()
  const previews = []
  const commits = []
  let cleanupCount = 0

  createChatCompanionDragSession({
    eventTarget,
    captureTarget,
    pointerId: 7,
    startClientX: 600,
    startWidth: 360,
    viewportWidth: 1_200,
    onPreview: (width) => previews.push(width),
    onCommit: (width) => commits.push(width),
    onCleanup: () => { cleanupCount += 1 },
  })

  assert.equal(captureTarget.capturedPointerId, 7)
  eventTarget.dispatch('pointermove', { pointerId: 7, clientX: 540 })
  assert.deepEqual(previews, [420])
  assert.deepEqual(commits, [])

  eventTarget.dispatch('pointerup', { pointerId: 7, clientX: 500 })
  assert.deepEqual(previews, [420, 460])
  assert.deepEqual(commits, [460])
  assert.equal(cleanupCount, 1)
  assert.equal(captureTarget.releasedPointerId, 7)

  eventTarget.dispatch('pointermove', { pointerId: 7, clientX: 400 })
  assert.deepEqual(previews, [420, 460])
})

test('companion drag clamps previews against the readable chat surface', () => {
  const eventTarget = new FakeEventTarget()
  const previews = []

  createChatCompanionDragSession({
    eventTarget,
    pointerId: 3,
    startClientX: 600,
    startWidth: 360,
    viewportWidth: 1_200,
    onPreview: (width) => previews.push(width),
  })

  eventTarget.dispatch('pointermove', { pointerId: 3, clientX: 0 })
  assert.deepEqual(previews, [560])
})

test('companion drag reaches half the viewport when Projects is collapsed', () => {
  const eventTarget = new FakeEventTarget()
  const previews = []

  createChatCompanionDragSession({
    eventTarget,
    pointerId: 4,
    startClientX: 600,
    startWidth: 360,
    viewportWidth: 1_200,
    layout: { workspaceRailOpen: false },
    onPreview: (width) => previews.push(width),
  })

  eventTarget.dispatch('pointermove', { pointerId: 4, clientX: 0 })
  assert.deepEqual(previews, [600])
})

test('companion drag presentation disables transitions and restores prior styles', () => {
  const shellElement = { style: { transition: 'width 150ms ease-out' } }
  const bodyElement = { style: { cursor: 'default', userSelect: 'text' } }
  const restore = startChatCompanionDragPresentation({ shellElement, bodyElement })

  assert.equal(shellElement.style.transition, 'none')
  assert.equal(bodyElement.style.cursor, 'col-resize')
  assert.equal(bodyElement.style.userSelect, 'none')

  restore()
  assert.equal(shellElement.style.transition, 'width 150ms ease-out')
  assert.equal(bodyElement.style.cursor, 'default')
  assert.equal(bodyElement.style.userSelect, 'text')
})
