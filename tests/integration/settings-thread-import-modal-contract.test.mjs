import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let SettingsImportThreadModal = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/SettingsImportThreadModal.jsx')
  SettingsImportThreadModal = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('SettingsPanelRoot no longer uses window.prompt for thread import', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/settings/SettingsPanelRoot.jsx'),
    'utf8',
  )

  assert.doesNotMatch(source, /window\.prompt\(/)
  assert.match(source, /import SettingsImportThreadModal from '\.\/SettingsImportThreadModal\.jsx'/)
  assert.match(source, /<SettingsImportThreadModal/)
})

test('SettingsImportThreadModal renders textarea-based import dialog semantics', () => {
  assert.equal(typeof SettingsImportThreadModal, 'function')

  const html = renderToStaticMarkup(React.createElement(SettingsImportThreadModal, {
    open: true,
    importJson: '{"thread":{"title":"Imported"}}',
    onImportJsonChange: () => {},
    onCancel: () => {},
    onConfirm: () => {},
  }))

  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /Import thread JSON/i)
  assert.match(html, /textarea/i)
  assert.match(html, /Import Thread/)
})
