import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { createTransientDismissTimer } from '../../src/renderer/components/transient-dismiss-timer.mjs'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let SECOND_INSTANCE_NOTICE_DURATION_MS = null
let SecondInstanceNotice = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/AppSecondInstanceNotice.jsx')
  SECOND_INSTANCE_NOTICE_DURATION_MS = mod?.SECOND_INSTANCE_NOTICE_DURATION_MS
  SecondInstanceNotice = mod?.SecondInstanceNotice
})

after(async () => {
  await closeViteSsrLoader()
})

test('second-instance notice is a calm accessible status surface', () => {
  const html = renderToStaticMarkup(React.createElement(SecondInstanceNotice, {
    message: 'ADDOM is already open. Switched to the existing window.',
    dismissLabel: 'Dismiss notification',
    onDismiss: () => {},
  }))

  assert.match(html, /role="status"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /aria-atomic="true"/)
  assert.match(html, /ADDOM is already open/)
  assert.match(html, /aria-label="Dismiss notification"/)
  assert.doesNotMatch(html, /danger|warning|accent/)
  assert.equal(SECOND_INSTANCE_NOTICE_DURATION_MS, 4_000)
})

test('transient notice timer restarts instead of stacking dismissals', () => {
  const scheduled = []
  const cleared = []
  const timer = createTransientDismissTimer({
    durationMs: 4_000,
    setTimer: (callback, delay) => {
      const handle = { callback, delay }
      scheduled.push(handle)
      return handle
    },
    clearTimer: (handle) => cleared.push(handle),
  })

  timer.restart(() => {})
  timer.restart(() => {})

  assert.equal(scheduled.length, 2)
  assert.equal(scheduled[0].delay, 4_000)
  assert.deepEqual(cleared, [scheduled[0]])

  timer.dispose()
  assert.deepEqual(cleared, [scheduled[0], scheduled[1]])
})
