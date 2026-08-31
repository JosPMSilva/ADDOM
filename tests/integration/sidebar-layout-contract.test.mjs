import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let Sidebar = null
let useAppStore = null

before(async () => {
  const storeModule = await ssrLoadRendererModule('/store/useAppStore.js')
  const sidebarModule = await ssrLoadRendererModule('/components/Sidebar.jsx')
  useAppStore = storeModule?.default || null
  Sidebar = sidebarModule?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderSidebar(sidebarCollapsed) {
  useAppStore.setState({
    activePanel: 'chat',
    sidebarCollapsed,
  })
  return renderToStaticMarkup(React.createElement(Sidebar))
}

test('sidebar uses its flexible whitespace as the accessible two-way width control', () => {
  assert.equal(typeof Sidebar, 'function')
  assert.equal(typeof useAppStore?.setState, 'function')

  const collapsedHtml = renderSidebar(true)
  const source = fs.readFileSync(path.resolve('src/renderer/components/Sidebar.jsx'), 'utf8')

  assert.match(collapsedHtml, /data-ui="sidebar-whitespace-toggle"/)
  assert.match(collapsedHtml, /aria-label="Expand sidebar"/)
  assert.match(source, /aria-label=\{sidebarCollapsed \? 'Expand sidebar' : 'Collapse sidebar'\}/)
  assert.ok(collapsedHtml.indexOf('Memory') < collapsedHtml.indexOf('Settings'))
  assert.doesNotMatch(source, /border-t border-surface-border\/50/)
  assert.doesNotMatch(source, /bg-gradient-to-t/)
  assert.doesNotMatch(source, /ChevronIcon/)
  assert.match(source, /onClick=\{toggleSidebar\}/)
  assert.match(source, /id: 'settings'/)
  assert.match(source, /hover:after:bg-surface-border\/60/)
  assert.match(source, /focus-visible:after:bg-border-strong/)
  assert.match(source, /after:-right-2 after:inset-y-0 after:w-px/)
  assert.doesNotMatch(source, /after:h-px after:w-6/)
  assert.doesNotMatch(source, /hover:bg-surface-panel/)
  assert.doesNotMatch(source, /focus-visible:bg-surface-panel/)
  assert.doesNotMatch(source, /focus-visible:ring/)
  assert.match(source, /style=\{\{ outline: 'none' \}\}/)
})
