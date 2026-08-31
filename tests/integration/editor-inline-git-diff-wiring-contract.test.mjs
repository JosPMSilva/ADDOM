import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('main process registers dedicated git IPC handlers through the main IPC registration module', () => {
  const mainSource = readSource('src/main/index.mjs')
  const ipcRegistrationSource = readSource('src/main/main-ipc-registration.mjs')
  const handlerSource = readSource('src/main/ipc-handlers/git.mjs')

  assert.match(mainSource, /import\s+\{\s*registerMainProcessIpcHandlers\s*\}\s+from\s+'\.\/main-ipc-registration\.mjs'/)
  assert.match(mainSource, /registerMainProcessIpcHandlers\(\{/)
  assert.match(ipcRegistrationSource, /import\s+\{\s*registerGitHandlers\s*\}\s+from\s+'\.\/ipc-handlers\/git\.mjs'/)
  assert.match(ipcRegistrationSource, /registerGitHandlers\(\)/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:getHeaderStatus'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:getFileDiff'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:stageHunk'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:discardHunk'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:unstageHunk'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:restoreFile'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:unstageFile'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:stageFile'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:stageAll'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:unstageAll'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:unstageLines'/)
  assert.match(handlerSource, /handleVersioned\(ipcMainImpl,\s*'git:commitStaged'/)
})

test('Monaco pane and mount helpers keep git decoration lifecycle inside the editor mount path', () => {
  const paneSource = readSource('src/renderer/components/editor/EditorMonacoPane.jsx')
  const gitUiSource = readSource('src/renderer/components/editor/editor-monaco-git-ui.mjs')
  const widgetSource = readSource('src/renderer/components/editor/editor-monaco-git-widget.mjs')

  assert.match(paneSource, /attachMonacoGitUi/)
  assert.match(paneSource, /refreshTabGitDiff/)
  assert.match(paneSource, /unstageTabGitHunk/)
  assert.match(paneSource, /unstageTabGitLines/)
  assert.match(gitUiSource, /export function attachMonacoGitUi/)
  assert.match(gitUiSource, /createMonacoGitHunkWidget/)
  assert.match(gitUiSource, /buildMonacoGitDecorations/)
  assert.match(gitUiSource, /Selection includes unchanged context lines\./)
  assert.match(gitUiSource, /Selection does not match a changed segment\./)
  assert.match(gitUiSource, /Actionable range/)
  assert.match(widgetSource, /scopeNode\.textContent = isStagedScope \? resolvedLabels\.staged : resolvedLabels\.unstaged/)
  assert.match(widgetSource, /resolvedLabels\.unstage/)
  assert.match(widgetSource, /resolvedLabels\.unstageLines/)
  assert.match(widgetSource, /headerNode\.textContent = `\$\{resolvedLabels\.hunkPrefix\} \$\{buildChangeSummary\(hunk, resolvedLabels\)\}`/)
  assert.match(widgetSource, /addom-git-hunk-widget__topbar/)
})

test('Git hunk widget uses translucent editor HUD styling', () => {
  const runtimeStyles = readSource('src/renderer/styles/globals-runtime.css')

  assert.match(runtimeStyles, /\.addom-git-hunk-widget\s*\{[\s\S]*background:\s*rgb\(var\(--theme-surface-raised-rgb\) \/ 0\.95\)/)
  assert.match(runtimeStyles, /\.addom-git-hunk-widget\s*\{[\s\S]*opacity:\s*0\.72/)
  assert.match(runtimeStyles, /\.addom-git-hunk-widget\s*\{[\s\S]*padding:\s*4px 4px 4px 8px/)
  assert.match(runtimeStyles, /\.addom-git-hunk-widget\s*\{[\s\S]*backdrop-filter:\s*blur\(6px\)/)
  assert.match(runtimeStyles, /\.addom-git-hunk-widget:is\(:hover, :focus-within\)\s*\{[\s\S]*opacity:\s*1/)
  assert.match(runtimeStyles, /\.addom-git-hunk-widget\s*\{[\s\S]*transition:\s*opacity 140ms ease, background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease/)
  assert.match(runtimeStyles, /\.addom-git-hunk-widget__menu\s*\{[\s\S]*min-width:\s*0/)
  assert.match(runtimeStyles, /\.addom-git-hunk-widget__menu\s*\{[\s\S]*width:\s*max-content/)
  assert.match(runtimeStyles, /\.monaco-editor \.addom-git-line-added\s*\{\s*background:\s*rgb\(var\(--theme-accent-rgb\) \/ 0\.06\);/)
  assert.match(runtimeStyles, /\.monaco-editor \.addom-git-line-modified\s*\{\s*background:\s*rgb\(var\(--theme-accent-rgb\) \/ 0\.06\);/)
  assert.match(runtimeStyles, /\.monaco-editor \.addom-git-line-deleted\s*\{\s*background:\s*rgb\(var\(--theme-accent-rgb\) \/ 0\.06\);/)
})

test('Git hunk widget positions left of the Monaco minimap with a fixed gap', () => {
  const widgetSource = readSource('src/renderer/components/editor/editor-monaco-git-widget.mjs')

  assert.match(widgetSource, /GIT_HUNK_WIDGET_MINIMAP_GAP_PX = 12/)
  assert.match(widgetSource, /function readHunkWidgetMarginLeft\(editor, domNode\)/)
  assert.match(widgetSource, /layoutInfo\?\.contentLeft/)
  assert.match(widgetSource, /layoutInfo\?\.minimap\?\.minimapLeft/)
  assert.match(widgetSource, /minimapLeft - GIT_HUNK_WIDGET_MINIMAP_GAP_PX - widgetWidth/)
  assert.match(widgetSource, /targetLeft - contentLeft/)
  assert.match(widgetSource, /domNode\.style\.marginLeft = readHunkWidgetMarginLeft\(editor, domNode\)/)
})

test('Git hunk widget re-lays out when mounted content changes size', () => {
  const widgetSource = readSource('src/renderer/components/editor/editor-monaco-git-widget.mjs')

  assert.match(widgetSource, /ResizeObserver/)
  assert.match(widgetSource, /editor\.layoutContentWidget\(widget\)/)
  assert.match(widgetSource, /resizeObserver\?\.observe\(domNode\)/)
  assert.match(widgetSource, /resizeObserver\?\.disconnect\(\)/)
})

test('Git hunk widget exposes one primary action and moves secondary actions into a menu', () => {
  const widgetSource = readSource('src/renderer/components/editor/editor-monaco-git-widget.mjs')

  assert.match(widgetSource, /moreButton\.setAttribute\('aria-haspopup', 'menu'\)/)
  assert.match(widgetSource, /moreMenu\.setAttribute\('role', 'menu'\)/)
  assert.match(widgetSource, /moreMenu\.className = 'addom-git-hunk-widget__menu'/)
  assert.match(widgetSource, /actionRow\.appendChild\(stageButton\)/)
  assert.doesNotMatch(widgetSource, /actionRow\.appendChild\(discardButton\)/)
  assert.doesNotMatch(widgetSource, /actionRow\.appendChild\(closeButton\)/)
  assert.match(widgetSource, /moreMenu\.appendChild\(discardButton\)/)
  assert.match(widgetSource, /moreMenu\.appendChild\(closeButton\)/)
  assert.match(widgetSource, /setMoreMenuOpen\(false\)/)
})
