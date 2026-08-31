import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let AttachmentActionsMenu = null

before(async () => {
  const module = await ssrLoadRendererModule('/components/chat/AttachmentActionsMenu.jsx')
  AttachmentActionsMenu = module?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('attachment action menu is safe to render without a browser portal target', () => {
  assert.equal(typeof AttachmentActionsMenu, 'function')
  assert.equal(renderToStaticMarkup(React.createElement(AttachmentActionsMenu, {})), '')
})

test('attachment menu source uses approved menu and submenu semantics', () => {
  const source = fs.readFileSync('src/renderer/components/chat/AttachmentActionsMenu.jsx', 'utf8')
  assert.match(source, /createPortal/)
  assert.match(source, /role="menu"/)
  assert.match(source, /role="menuitem"/)
  assert.match(source, /aria-haspopup=\{action === 'open_with' \? 'menu' : undefined\}/)
  assert.match(source, /aria-expanded=\{action === 'open_with' \? submenuOpen : undefined\}/)
  assert.match(source, /ArrowDown/)
  assert.match(source, /ArrowUp/)
  assert.match(source, /ArrowRight/)
  assert.match(source, /ArrowLeft/)
  assert.match(source, /Escape/)
})
