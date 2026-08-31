import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let SettingsPreferenceGroup = null
let SettingsTerminalBlock = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/SettingsPanelLayout.jsx')
  SettingsPreferenceGroup = mod?.SettingsPreferenceGroup || null
  const terminalModule = await ssrLoadRendererModule('/components/settings/SettingsTerminalBlock.jsx')
  SettingsTerminalBlock = terminalModule?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('settings preference group renders an unframed continuous section', () => {
  assert.equal(typeof SettingsPreferenceGroup, 'function')

  const html = renderToStaticMarkup(React.createElement(SettingsPreferenceGroup, {
    sectionKey: 'general:language',
    title: 'Language',
    summary: 'Select the ADDOM app language.',
    renderContent: () => React.createElement('div', { 'data-test-id': 'language-body' }, 'Language body'),
    openDetailView: () => {},
  }))

  assert.match(html, /data-ui="settings-preference-group"/)
  assert.match(html, /data-ui="settings-preference-surface"/)
  assert.match(html, /language-body/)
  assert.doesNotMatch(html, /aria-expanded=/)
  assert.doesNotMatch(html, /caret-right/)
})

test('terminal preferences render as compact rows rather than a grid of nested cards', () => {
  assert.equal(typeof SettingsTerminalBlock, 'function')

  const html = renderToStaticMarkup(React.createElement(SettingsTerminalBlock, {
    terminalSettings: {
      fontSize: 12,
      fontFamily: 'Geist Mono',
      defaultShell: 'system',
      defaultCwdBehavior: 'project',
      copyOnSelection: false,
      scrollback: 10_000,
      pasteConfirmationLineThreshold: 6,
    },
    onChange: () => {},
  }))

  assert.match(html, /data-ui="settings-terminal-preferences"/)
  assert.match(html, /settings-terminal-font-size/)
  assert.match(html, /settings-terminal-font-family/)
  assert.match(html, /settings-terminal-default-shell/)
  assert.match(html, /settings-terminal-cwd-behavior/)
  assert.doesNotMatch(html, /rounded-xl/)
  assert.doesNotMatch(html, /shadow-sm/)
})
