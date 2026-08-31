import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let PermissionRow = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/PermissionRow.jsx')
  PermissionRow = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('PermissionRow toggle renders switch semantics', () => {
  assert.equal(typeof PermissionRow, 'function')

  const html = renderToStaticMarkup(React.createElement(PermissionRow, {
    label: 'Run shell commands',
    description: 'Allow run_command tool calls.',
    enabled: true,
    locked: false,
    onToggle: () => {},
  }))

  assert.match(html, /role="switch"/)
  assert.match(html, /aria-checked="true"/)
  assert.match(html, /aria-label="Run shell commands"/)
  assert.match(html, /type="button"/)
  assert.match(html, /md:items-center/)
  assert.match(html, /duration-75/)
})

test('PermissionRow supports disabled state for unavailable toggles', () => {
  const html = renderToStaticMarkup(React.createElement(PermissionRow, {
    label: 'OpenAI background mode',
    description: 'Unavailable when provider key is missing.',
    enabled: false,
    disabled: true,
    onToggle: () => {},
  }))

  assert.match(html, /role="switch"/)
  assert.match(html, /aria-disabled="true"/)
  assert.match(html, /disabled=""/)
  assert.match(html, /title="Unavailable"/)
})
