import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let DataResetBlock = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/SettingsDataResetBlock.jsx')
  DataResetBlock = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('data actions communicate scope without colored cards', () => {
  assert.equal(typeof DataResetBlock, 'function')
  const html = renderToStaticMarkup(React.createElement(DataResetBlock, {
    activeProjectId: 'project-alpha',
    activeThreadId: 'thread-alpha',
    onClearCurrentThread: () => {},
    onClearCurrentProject: () => {},
    onExportCurrentThread: () => {},
    onImportThread: () => {},
    onDeleteApiKeysNow: () => {},
    onResetLocalDataAndRestart: () => {},
  }))

  assert.match(html, /Active Thread Migration/)
  assert.match(html, /Local Profile Reset/)
  assert.doesNotMatch(html, /bg-gradient|bg-warning|bg-danger-bg|rounded-xl|shadow-sm/)
})
