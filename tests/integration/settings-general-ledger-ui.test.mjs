import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

const GENERAL_SOURCE_PATHS = [
  'src/renderer/components/settings/SettingsCommonBlocks.jsx',
  'src/renderer/components/settings/SettingsUiScalingBlock.jsx',
  'src/renderer/components/settings/SettingsTerminalBlock.jsx',
  'src/renderer/components/settings/SettingsUpdateSection.jsx',
  'src/renderer/components/settings/SettingsBlocksGovernance.jsx',
]

const generalSources = GENERAL_SOURCE_PATHS.map((filePath) => readFileSync(
  new URL(`../../${filePath}`, import.meta.url),
  'utf8',
))

let SettingsTerminalBlock = null
let SettingsUpdateSection = null
let SettingsCommonBlocks = null
let SettingsBlocksGovernance = null

before(async () => {
  const [terminalMod, updateMod, commonBlocksMod, governanceMod] = await Promise.all([
    ssrLoadRendererModule('/components/settings/SettingsTerminalBlock.jsx'),
    ssrLoadRendererModule('/components/settings/SettingsUpdateSection.jsx'),
    ssrLoadRendererModule('/components/settings/SettingsCommonBlocks.jsx'),
    ssrLoadRendererModule('/components/settings/SettingsBlocksGovernance.jsx'),
  ])
  SettingsTerminalBlock = terminalMod?.default || null
  SettingsUpdateSection = updateMod?.default || null
  SettingsCommonBlocks = commonBlocksMod || null
  SettingsBlocksGovernance = governanceMod || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('general settings use rows without card chrome', () => {
  const terminalHtml = renderToStaticMarkup(React.createElement(SettingsTerminalBlock, {
    terminalSettings: {
      fontSize: 12,
      fontFamily: 'geist_mono',
      defaultShell: 'default',
      defaultCwdBehavior: 'project_root',
      copyOnSelection: false,
      scrollback: 5000,
      pasteConfirmationLineThreshold: 12,
    },
    onChange: () => {},
  }))
  const updateHtml = renderToStaticMarkup(React.createElement(SettingsUpdateSection, {
    status: 'available',
    info: { version: '1.2.3' },
    pct: 0,
    onDownload: () => {},
  }))

  assert.doesNotMatch(terminalHtml, /<details/)
  assert.doesNotMatch(terminalHtml, /rounded-xl|shadow-sm|shadow-inner/)
  assert.doesNotMatch(updateHtml, /text-warning|bg-warning|rounded-xl|shadow-sm/)
  assert.match(updateHtml, /Update available/)
})

test('general setting sources avoid decorative container chrome', () => {
  for (const source of generalSources) {
    assert.doesNotMatch(source, /bg-gradient|rounded-xl|hover:shadow|shadow-inner/)
  }
  assert.doesNotMatch(generalSources.join('\n'), /version \?\? '1\.0\.0'/)
})

test('dense settings surfaces keep consistent vertical breathing room', () => {
  const promptHtml = renderToStaticMarkup(React.createElement(SettingsCommonBlocks.AssistantPromptBlock, {
    value: '',
    onSave: () => {},
  }))
  const aboutHtml = renderToStaticMarkup(React.createElement(SettingsBlocksGovernance.AboutBlock, {
    version: '1.0.0',
  }))

  assert.match(promptHtml, /data-ui="settings-custom-instructions"[^>]*class="[^"]*py-3/)
  assert.match(aboutHtml, /data-ui="settings-about"[^>]*class="[^"]*py-3/)
})

test('unavailable updater state uses a calm no-results message', () => {
  const html = renderToStaticMarkup(React.createElement(SettingsUpdateSection, {
    status: 'not-available',
    info: null,
    pct: 0,
    onCheck: () => {},
  }))

  assert.match(html, /No updates found\./)
})

test('updater failures never render upstream response details', () => {
  const unsafeDetails = '404 GET https://github.com/example/private/releases.atom set-cookie: _gh_sess=secret authorization: Bearer token'
  const html = renderToStaticMarkup(React.createElement(SettingsUpdateSection, {
    status: 'error',
    info: {
      code: 'unavailable',
      message: unsafeDetails,
    },
    pct: 0,
    onCheck: () => {},
  }))

  assert.match(html, /The update service is not available yet\. Try again later\./)
  assert.doesNotMatch(html, /github\.com|set-cookie|_gh_sess|Bearer token|secret/i)
})
