import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

let CommandPalette = null

test.before(async () => {
  const mod = await ssrLoadRendererModule('/components/CommandPalette.jsx')
  CommandPalette = mod?.default || null
})

test.after(async () => {
  await closeViteSsrLoader()
})

test('command palette exposes the added sidebar and chat actions', () => {
  const source = readSource('src/renderer/components/CommandPalette.jsx')

  assert.match(source, /id:\s*'nav\.projectEntry'/)
  assert.match(source, /onOpenWorkspaceRail\?\.\(\)/)
  assert.doesNotMatch(source, /id:\s*'nav\.projects'/)
  assert.match(source, /id:\s*'nav\.openProjectFolder'/)
  assert.match(source, /window\.addom\?\.shell\?\.openPath\?\.\(projectFolder\)/)
  assert.match(source, /id:\s*'nav\.sidebar\.toggle'/)
  assert.match(source, /sidebarCollapsed \? 'Expand Sidebar' : 'Collapse Sidebar'/)
  assert.match(source, /toggleSidebar\(\)/)
  assert.match(source, /const ALL_CATEGORY_FILTER = 'all'/)
  assert.match(source, /const RECENT_CATEGORY_FILTER = 'recent'/)
  assert.match(source, /const \[selectedCategory, setSelectedCategory\] = useState\(ALL_CATEGORY_FILTER\)/)
  assert.match(source, /data-ui="command-palette-category-filters"/)
  assert.match(source, /data-ui="command-palette-category-filter"/)
  assert.match(source, /data-ui="command-palette"/)
  assert.match(source, /data-ui="command-palette-item"/)
  assert.match(source, /aria-activedescendant=/)
  assert.match(source, /aria-pressed=\{selected\}/)
  assert.match(source, /group-hover:opacity-100/)
  assert.doesNotMatch(source, /border-info-border|bg-info-bg|text-info-soft/)
  assert.doesNotMatch(source, /recentAndCommands/)

  assert.match(source, /id:\s*'chat\.jumpToLatest'/)
  assert.match(source, /emitPanelCommand\('chat',\s*'chat\.jumpToLatest'\)/)
  assert.match(source, /id:\s*'chat\.openThreadSelector'/)
  assert.doesNotMatch(source, /emitPanelCommand\('chat',\s*'chat\.openThreadSelector'\)/)
  assert.match(source, /id:\s*'chat\.openBackgroundJobs'/)
  assert.match(source, /emitPanelCommand\('chat',\s*'chat\.openBackgroundJobs'\)/)
  assert.match(source, /id:\s*'chat\.openDirectAgents'/)
  assert.match(source, /emitPanelCommand\('chat',\s*'chat\.openDirectAgents'\)/)
  assert.match(source, /chatMode === 'execute' && activeThreadId && !streamingId/)
  assert.doesNotMatch(source, /Enable Subagents first|setMoaEnabled|moaEnabled/)
})

test('chat panel routes jump-to-latest and forwards palette events into the composer rail path', () => {
  const helperSource = readSource('src/renderer/components/chat/chat-panel-helpers.mjs')
  const panelSource = [
    readSource('src/renderer/components/ChatPanel.jsx'),
    readSource('src/renderer/components/chat/ChatPanelView.jsx'),
  ].join('\n')
  const composerAreaSource = readSource('src/renderer/components/chat/ChatPanelComposerArea.jsx')

  assert.match(panelSource, /import useTerminalStore from '\.\.\/store\/useTerminalStore\.js'/)
  assert.match(helperSource, /handleJumpToLatest = \(\) => \{\}/)
  assert.match(helperSource, /type === 'chat\.jumpToLatest'/)
  assert.match(helperSource, /handleJumpToLatest\(\)/)

  assert.match(panelSource, /handleJumpToLatest,/)
  assert.match(panelSource, /commandPaletteEvent=\{commandPaletteEvent\}/)
  assert.match(composerAreaSource, /commandPaletteEvent = null,/)
  assert.match(composerAreaSource, /commandPaletteEvent=\{commandPaletteEvent\}/)
})

test('composer control rail leaves workspace rail ownership to the App shell', () => {
  const source = readSource('src/renderer/components/chat/ChatComposerControlRail.jsx')

  assert.match(source, /commandPaletteEvent = null,/)
  assert.match(source, /handledCommandPaletteEventIdRef = React\.useRef\(''\)/)
  assert.doesNotMatch(source, /chat\.openThreadSelector|ThreadDrawer|setThreadDrawerOpen/)
  assert.match(source, /type !== 'chat\.openBackgroundJobs'/)
  assert.match(source, /type !== 'chat\.openDirectAgents'/)
  assert.match(source, /type === 'chat\.openBackgroundJobs'/)
  assert.match(source, /setOverflowOpen\(false\)/)
  assert.match(source, /onOpenJobsModal\?\.\(\)/)
  assert.match(source, /type === 'chat\.openDirectAgents' && agentQuickActionsEnabled && !isStreaming/)
  assert.match(source, /onAgentMenuOpenChange\(true\)/)
})

test('app-level command palette shortcut uses capture phase so terminal focus cannot swallow it', () => {
  const source = readSource('src/renderer/App.jsx')

  assert.match(source, /window\.addEventListener\('keydown', handleGlobalShortcut, true\)/)
  assert.match(source, /window\.removeEventListener\('keydown', handleGlobalShortcut, true\)/)
})

test('command palette renders in SSR without runtime reference errors', () => {
  assert.equal(typeof CommandPalette, 'function')
  const html = renderToStaticMarkup(React.createElement(CommandPalette, {
    open: true,
    onClose: () => {},
    onOpenWorkspaceRail: () => {},
  }))
  assert.match(html, /Type a command or search/i)
  assert.match(html, /Command categories/i)
  assert.match(html, />All</)
})
