import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let Sidebar = null
let useAppStore = null
let SidebarUpdateButton = null

before(async () => {
  const storeModule = await ssrLoadRendererModule('/store/useAppStore.js')
  const sidebarModule = await ssrLoadRendererModule('/components/Sidebar.jsx')
  useAppStore = storeModule?.default || null
  Sidebar = sidebarModule?.default || null
  SidebarUpdateButton = sidebarModule?.SidebarUpdateButton || null
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

function updateSnapshot(phase, overrides = {}) {
  return {
    phase,
    version: null,
    progressPercent: 0,
    errorCode: null,
    checkedAt: null,
    downloadedAt: null,
    installBlockers: [],
    simulation: { enabled: true, candidateVersion: '99.0.0-dev' },
    revision: 1,
    ...overrides,
  }
}

function renderSidebarWithUpdate(phase, overrides = {}, sidebarCollapsed = true) {
  if (typeof SidebarUpdateButton !== 'function') return ''
  return renderToStaticMarkup(React.createElement(SidebarUpdateButton, {
    collapsed: sidebarCollapsed,
    snapshot: updateSnapshot(phase, overrides),
  }))
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

test('sidebar keeps the update control absent until an update candidate exists', () => {
  assert.doesNotMatch(renderSidebarWithUpdate('hidden'), /data-ui="sidebar-update"/)
  assert.doesNotMatch(renderSidebarWithUpdate('checking'), /data-ui="sidebar-update"/)
  assert.doesNotMatch(renderSidebarWithUpdate('unavailable'), /data-ui="sidebar-update"/)
})

test('collapsed sidebar exposes update states without an inline label', () => {
  const cases = [
    ['available', 'ph-download-simple', 'Update available - v99.0.0-dev'],
    ['ready', 'ph-arrow-clockwise', 'v99.0.0-dev ready to install'],
    ['installing', 'ph-spinner', 'Installing update...'],
    ['error', 'ph-warning-circle', 'check for updates. Try again later.'],
  ]

  for (const [phase, iconClass, accessibleStatus] of cases) {
    const html = renderSidebarWithUpdate(phase, { version: '99.0.0-dev' }, true)
    assert.match(html, new RegExp(`data-update-phase="${phase}"`))
    assert.match(html, new RegExp(iconClass))
    assert.match(html, new RegExp(accessibleStatus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.doesNotMatch(html, />Update<\/span>/)
  }
})

test('sidebar download state renders a determinate circular progress indicator', () => {
  const html = renderSidebarWithUpdate('downloading', {
    version: '99.0.0-dev',
    progressPercent: 47,
  })

  assert.match(html, /data-update-phase="downloading"/)
  assert.match(html, /role="progressbar"/)
  assert.match(html, /aria-valuenow="47"/)
  assert.match(html, /Downloading\.\.\. 47%/)
})

test('sidebar ready state signals blockers without hiding their explanation', () => {
  const html = renderSidebarWithUpdate('ready', {
    version: '99.0.0-dev',
    progressPercent: 100,
    installBlockers: [{
      kind: 'running-task',
      label: 'Simulated running task',
      simulated: true,
    }],
  })

  assert.match(html, /ph-clock-countdown/)
  assert.match(html, /Simulated running task/)
})

test('update states expose disabled semantics and only ready offers a confirmation', () => {
  for (const phase of ['downloading', 'installing']) {
    assert.match(renderSidebarWithUpdate(phase), /aria-disabled="true"/)
    assert.doesNotMatch(renderSidebarWithUpdate(phase), /aria-haspopup/)
  }
  assert.match(renderSidebarWithUpdate('ready'), /aria-haspopup="dialog"/)
  assert.doesNotMatch(renderSidebarWithUpdate('available'), /aria-haspopup/)
  const blocked = renderSidebarWithUpdate('ready', {
    installBlockers: [{ kind: 'running-task', label: 'Running task' }],
  })
  assert.match(blocked, /aria-disabled="true"/)
  assert.doesNotMatch(blocked, /aria-haspopup/)
})

test('blocked sidebar update state periodically rechecks readiness without installing', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/components/SidebarUpdateControl.jsx'), 'utf8')
  assert.match(source, /refreshInstallReadiness\(\)/)
  assert.match(source, /setInterval\(refresh, 2_000\)/)
})

test('renderer becomes non-interactive during coordinated installer handoff', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/App.jsx'), 'utf8')
  assert.match(source, /snapshot\.phase === 'installing'/)
  assert.match(source, /inert=\{updateInstalling \? true : undefined\}/)
  assert.match(source, /aria-busy=\{updateInstalling \? true : undefined\}/)
})
