import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let SettingsSection = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/SettingsSection.jsx')
  SettingsSection = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('SettingsSection renders title and description props above content', () => {
  assert.equal(typeof SettingsSection, 'function')
  const html = renderToStaticMarkup(React.createElement(SettingsSection, {
    title: 'Command Safety',
    description: 'Policy controls for command execution.',
  }, React.createElement('div', null, 'Section body')))

  assert.match(html, /Command Safety/)
  assert.match(html, /Policy controls for command execution\./)
  assert.match(html, /Section body/)
})

test('SettingsSection uses semantic text token classes', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/settings/SettingsSection.jsx'),
    'utf8',
  )

  assert.match(source, /text-text-primary/)
  assert.match(source, /text-text-secondary/)
})
