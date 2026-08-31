import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const preloadSource = fs.readFileSync(
  path.resolve('src/preload/index.mjs'),
  'utf8',
)

const editorServiceHandlerSource = fs.readFileSync(
  path.resolve('src/main/ipc-handlers/editor-service.mjs'),
  'utf8',
)

const editorManagerSource = fs.readFileSync(
  path.resolve('src/main/editor/editor-language-service-manager.mjs'),
  'utf8',
)

const fileHandlerSource = fs.readFileSync(
  path.resolve('src/main/ipc-handlers/file.mjs'),
  'utf8',
)

const mainIndexSource = fs.readFileSync(
  path.resolve('src/main/index.mjs'),
  'utf8',
)

test('preload exposes runtime refresh and tree change subscriptions', () => {
  assert.match(preloadSource, /onTreeChanged: \(cb\) => subVersioned\('file:tree-changed', cb\)/)
  assert.match(preloadSource, /refreshRuntime: \(payload = \{\}\) => invokeVersioned\(\s*'editor:service:refresh-runtime'/)
})

test('main process registers runtime refresh handler and tree change broadcasts', () => {
  assert.match(editorServiceHandlerSource, /handleVersioned\(ipcMain, 'editor:service:refresh-runtime'/)
  assert.match(editorServiceHandlerSource, /manager\.refreshRuntimeAvailability\(payload \|\| \{\}\)/)
  assert.match(fileHandlerSource, /function emitEditorSaveEvents\(sender, project, filePath\)/)
  assert.match(fileHandlerSource, /sendVersioned\(sender, 'file:tree-changed'/)
  assert.match(mainIndexSource, /sendVersioned\(win\.webContents, 'file:tree-changed', payload\)/)
})

test('editor language service manager exposes runtime availability refresh', () => {
  assert.match(editorManagerSource, /const resetFormatterCommandCachesFn = dependencies\.resetFormatterCommandCaches \|\| resetFormatterCommandCaches/)
  assert.match(editorManagerSource, /function clearRuntimeProviderState\(\)/)
  assert.match(editorManagerSource, /refreshRuntimeAvailability\(payload = \{\}\) \{/)
})
