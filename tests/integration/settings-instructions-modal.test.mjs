import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let SettingsInstructionsModal = null
let SettingsCommonBlocks = null

before(async () => {
  const [modalMod, blocksMod] = await Promise.all([
    ssrLoadRendererModule('/components/SettingsInstructionsModal.jsx'),
    ssrLoadRendererModule('/components/settings/SettingsCommonBlocks.jsx'),
  ])
  SettingsInstructionsModal = modalMod?.default || null
  SettingsCommonBlocks = blocksMod || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('settings instructions modal renders user guidance without internal governance copy', () => {
  assert.equal(typeof SettingsInstructionsModal, 'function')

  const html = renderToStaticMarkup(React.createElement(SettingsInstructionsModal, {
    onClose: () => {},
  }))

  assert.match(html, /Using ADDOM/)
  assert.match(html, /Quick reference for ADDOM workflows and controls/i)
  assert.match(html, /Workspace Basics/i)
  assert.match(html, /role="tablist"/i)
  assert.match(html, /role="tab"/i)
  assert.match(html, /role="tabpanel"/i)
  assert.match(html, /role="dialog"/i)
  assert.match(html, /aria-modal="true"/i)
  assert.doesNotMatch(html, /v2026\.04\.18\.1|Last updated|Version 2026/i)
  assert.doesNotMatch(html, /AI on Selection sends the current selection/i)
  assert.doesNotMatch(html, /Documentation Governance/i)
  assert.doesNotMatch(html, /Every new user-facing function must update this catalog/i)
})

test('instructions settings block presents a usage guide instead of unfinished instruction-pack copy', () => {
  assert.equal(typeof SettingsCommonBlocks?.InstructionsBlock, 'function')

  const html = renderToStaticMarkup(React.createElement(SettingsCommonBlocks.InstructionsBlock, {
    onOpenInstructions: () => {},
  }))

  assert.match(html, /Usage Guide/)
  assert.match(html, /In-App Guide/)
  assert.match(html, /Open Guide/)
  assert.match(html, /Quick reference for core ADDOM workflows and controls/i)
  assert.doesNotMatch(html, /Version|Updated 2026/i)
  assert.doesNotMatch(html, /instruction packs/i)
  assert.doesNotMatch(html, /reference guidance packs/i)
})
