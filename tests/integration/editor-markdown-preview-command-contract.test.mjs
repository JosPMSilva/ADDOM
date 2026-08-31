import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const commandPaletteSource = fs.readFileSync(
  path.resolve('src/renderer/components/CommandPalette.jsx'),
  'utf8',
)

const editorPanelSource = fs.readFileSync(
  path.resolve('src/renderer/components/EditorPanel.jsx'),
  'utf8',
)
const editorPanelStateSource = fs.readFileSync(
  path.resolve('src/renderer/components/editor/editor-panel-state-helpers.mjs'),
  'utf8',
)
const editorPanelViewSource = fs.readFileSync(
  path.resolve('src/renderer/components/editor/EditorPanelView.jsx'),
  'utf8',
)
const editorTabBarSource = fs.readFileSync(
  path.resolve('src/renderer/components/editor/EditorTabBar.jsx'),
  'utf8',
)

test('command palette includes markdown preview commands with editor event routing', () => {
  assert.match(commandPaletteSource, /id:\s*'editor\.markdownPreview\.toggle'/)
  assert.match(commandPaletteSource, /id:\s*'editor\.markdownPreview\.open'/)
  assert.match(commandPaletteSource, /emitPanelCommand\('editor',\s*'editor\.markdownPreview\.toggle'\)/)
  assert.match(commandPaletteSource, /emitPanelCommand\('editor',\s*'editor\.markdownPreview\.open'\)/)
})

test('editor panel handles markdown preview command events and renders preview pane', () => {
  assert.match(editorPanelSource, /type === 'editor\.markdownPreview\.toggle'/)
  assert.match(editorPanelSource, /type === 'editor\.markdownPreview\.open'/)
  assert.match(editorPanelSource, /String\(currentTab\.language \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'markdown'/)
  assert.match(editorPanelViewSource, /<EditorTabBar/)
  assert.match(editorPanelViewSource, /onTogglePreview=\{/)
  assert.match(editorPanelViewSource, /<EditorMarkdownPreviewPane/)
  assert.match(editorTabBarSource, /t\('editor\.tabBar\.preview', \{ defaultValue: 'Preview' \}\)/)
})

test('editor panel keeps preview ratio fallback and propagates open-file failures', () => {
  assert.match(editorPanelStateSource, /raw == null\s*\|\|\s*String\(raw\)\.trim\(\)\s*===\s*''/)
  assert.match(editorPanelSource, /openResult\?\.ok === false/)
  assert.match(editorPanelSource, /reason:\s*'file_not_found'/)
})
