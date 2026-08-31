import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let LiveExecutionStreamBlock = null
let LiveExecutionStreamHeader = null
let formatExecutionTime = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/LiveExecutionStreamBlock.jsx')
  LiveExecutionStreamBlock = mod?.default || null
  const headerMod = await ssrLoadRendererModule('/components/chat/LiveExecutionStreamHeader.jsx')
  LiveExecutionStreamHeader = headerMod?.default || null
  formatExecutionTime = headerMod?.formatExecutionTime || null
})

test('execution time uses bounded units and a day/month date for old spans', () => {
  assert.equal(typeof formatExecutionTime, 'function')
  const startedAt = new Date(2026, 6, 15, 12, 0, 0).getTime()

  assert.equal(formatExecutionTime({ seconds: 21, startedAt }), '21s')
  assert.equal(formatExecutionTime({ seconds: (541 * 60) + 58, startedAt }), '9h 2m')
  assert.equal(formatExecutionTime({ seconds: (2 * 86_400) + (3 * 3_600), startedAt }), '2d 3h')
  assert.equal(formatExecutionTime({ seconds: 8 * 86_400, startedAt }), '15/07')
})

test('execution header uses the whole row as a caret-free disclosure', () => {
  assert.equal(typeof LiveExecutionStreamHeader, 'function')
  const html = renderToStaticMarkup(React.createElement(LiveExecutionStreamHeader, {
    t: (_key, options = {}) => options.defaultValue || '',
    expanded: false,
    onToggle() {},
    panelId: 'execution-panel',
    isLiveTurn: false,
    statusLabel: 'Completed',
    turn: { createdAt: 1_000_000, updatedAt: 1_021_000 },
  }))

  assert.match(html, /data-turn-header-dock-row="execution"/)
  assert.match(html, /aria-expanded="false"/)
  assert.doesNotMatch(html, /<svg|[⌃⌄]/)
})

after(async () => {
  await closeViteSsrLoader()
})

test('LiveExecutionStreamBlock labels errored completed turns as failed in the header', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-failed',
        status: 'error',
        createdAt: 1_000_000,
        updatedAt: 1_002_000,
        eventOrder: ['reasoning-1'],
        eventsById: {
          'reasoning-1': {
            id: 'reasoning-1',
            kind: 'reasoning',
            status: 'done',
            detail: 'Timed out while waiting for the provider response.',
            createdAt: 1_000_000,
            updatedAt: 1_002_000,
          },
        },
      },
    }),
  )

  assert.match(html, />Failed</)
  assert.doesNotMatch(html, /Execution Stream/)
  assert.doesNotMatch(html, />Completed</)
})

test('LiveExecutionStreamBlock dismisses warning status from the completed header', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-warning',
        status: 'warning',
        createdAt: 1_000_000,
        updatedAt: 1_002_000,
        eventOrder: ['tool-warning-1'],
        eventsById: {
          'tool-warning-1': {
            id: 'tool-warning-1',
            kind: 'tool_result',
            status: 'warning',
            activity: {
              id: 'tool-warning-1',
              type: 'result',
              toolName: 'write_file',
              label: 'Wrote src/app.js',
              fileChange: { filePath: 'src/app.js' },
            },
          },
        },
      },
    }),
  )

  assert.match(html, />Completed</)
  assert.doesNotMatch(html, /completed with warnings/i)
  assert.doesNotMatch(html, />Failed</)
})
