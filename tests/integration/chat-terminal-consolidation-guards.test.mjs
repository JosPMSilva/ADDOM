import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function resolvePath(relPath) {
  return path.resolve(relPath)
}

function readSource(relPath) {
  return fs.readFileSync(resolvePath(relPath), 'utf8')
}

test('workspace shell retires the dedicated terminal page as a navigation destination', () => {
  const appSource = readSource('src/renderer/App.jsx')
  const sidebarSource = readSource('src/renderer/components/Sidebar.jsx')
  const loaderSource = readSource('src/renderer/workspace-panel-loaders.mjs')
  const appStoreSource = readSource('src/renderer/store/useAppStore.js')

  assert.doesNotMatch(appSource, /TerminalPanelLazy/)
  assert.doesNotMatch(appSource, /loadTerminalPanel/)
  assert.doesNotMatch(appSource, /terminal: 'Terminal panel'/)
  assert.doesNotMatch(appSource, /activePanel === 'terminal'/)
  assert.doesNotMatch(appSource, /activePanel !== 'chat' && activePanel !== 'terminal'/)
  assert.match(appSource, /void useTerminalStore\.getState\(\)\.openThreadTerminal\(\{/)
  assert.match(appSource, /setActivePanel\('chat'\)/)

  assert.doesNotMatch(sidebarSource, /id: 'terminal'/)
  assert.doesNotMatch(sidebarSource, /label: 'Terminal'/)
  assert.doesNotMatch(sidebarSource, /loadTerminalPanel/)

  assert.doesNotMatch(loaderSource, /loadTerminalPanel/)
  assert.doesNotMatch(appStoreSource, /'terminal'/)
})

test('legacy terminal page host files are removed from the renderer', () => {
  assert.equal(fs.existsSync(resolvePath('src/renderer/components/TerminalPanel.jsx')), false)
  assert.equal(fs.existsSync(resolvePath('src/renderer/components/terminal/TerminalSessionList.jsx')), false)
})

test('command palette routes terminal access into the chat terminal instead of a workspace page', () => {
  const commandPaletteSource = readSource('src/renderer/components/CommandPalette.jsx')
  const terminalActionsSource = readSource('src/renderer/components/command-palette-terminal-actions.mjs')

  assert.match(commandPaletteSource, /id:\s*'chat\.openTerminal'/)
  assert.match(commandPaletteSource, /title:\s*'Open Terminal'/)
  assert.match(commandPaletteSource, /useCommandPaletteTerminalActions/)
  assert.match(commandPaletteSource, /run:\s*openChatTerminal/)
  assert.match(terminalActionsSource, /const openChatTerminal = useCallback\(\(\) =>/)
  assert.match(terminalActionsSource, /setActivePanel\?\.\('chat'\)/)
  assert.match(terminalActionsSource, /void useTerminalStore\.getState\(\)\.openThreadTerminal\(\{/)
  assert.doesNotMatch(commandPaletteSource, /Go to Terminal/)
  assert.doesNotMatch(commandPaletteSource, /focusTerminalPanel/)
  assert.doesNotMatch(commandPaletteSource, /setActivePanel\('terminal'\)/)
})

test('terminal viewport fallback copy no longer references a removed terminal panel surface', () => {
  const source = readSource('src/renderer/components/terminal/TerminalViewport.jsx')

  assert.match(source, /Chat terminal is unavailable/)
  assert.doesNotMatch(source, /Terminal panel is unavailable/)
})

test('terminal store tracks chat-terminal compact and expanded modes instead of dual page surfaces', () => {
  const entrySource = readSource('src/renderer/store/useTerminalStore.js')
  const sharedSource = readSource('src/renderer/store/terminal-store-shared.js')
  const viewportSource = readSource('src/renderer/store/terminal-store-viewport-actions.js')

  assert.match(entrySource, /createTerminalViewportActions/)
  assert.match(sharedSource, /export const CHAT_TERMINAL_COMPACT_MODE = 'chat_terminal_compact'/)
  assert.match(sharedSource, /export const CHAT_TERMINAL_EXPANDED_MODE = 'chat_terminal_expanded'/)
  assert.match(sharedSource, /viewportMetricsByMode:/)
  assert.match(sharedSource, /focusRequestKeyByMode:/)
  assert.match(viewportSource, /setViewportMetricsForMode:/)
  assert.doesNotMatch(`${entrySource}\n${sharedSource}\n${viewportSource}`, /viewportMetricsBySurface:/)
  assert.doesNotMatch(`${entrySource}\n${sharedSource}\n${viewportSource}`, /focusRequestKeyBySurface:/)
  assert.doesNotMatch(`${entrySource}\n${sharedSource}\n${viewportSource}`, /focusTerminalPanel:/)
})
