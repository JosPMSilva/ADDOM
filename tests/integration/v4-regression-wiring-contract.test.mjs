import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('main process restores v4 inline completion and attachment throttle wiring', () => {
  const source = fs.readFileSync(path.resolve('src/main/index.mjs'), 'utf8')
  const ipcRegistrationSource = fs.readFileSync(path.resolve('src/main/main-ipc-registration.mjs'), 'utf8')

  assert.match(source, /import\s+\{\s*registerMainProcessIpcHandlers\s*\}\s+from\s+'\.\/main-ipc-registration\.mjs'/)
  assert.match(source, /registerMainProcessIpcHandlers\(\{/)
  assert.match(ipcRegistrationSource, /import\s+\{\s*registerEditorCompletionHandlers\s*\}\s+from\s+'\.\/ipc-handlers\/editor-completion\.mjs'/)
  assert.match(ipcRegistrationSource, /registerEditorCompletionHandlers\(\)/)

  assert.match(source, /import\s+\{\s*createAttachmentPreviewRateLimiter\s*\}\s+from\s+'\.\/attachments\/attachment-preview-guard\.mjs'/)
  assert.match(source, /const\s+attachmentPreviewRateLimiter\s*=\s*createAttachmentPreviewRateLimiter\(/)
  assert.match(source, /attachmentPreviewRateLimiter\.consume\(request\)/)
})

test('editor Monaco pane restores inline completion provider registration and editor options', () => {
  const paneSource = fs.readFileSync(path.resolve('src/renderer/components/editor/EditorMonacoPane.jsx'), 'utf8')
  const inlineSource = fs.readFileSync(path.resolve('src/renderer/components/editor/editor-monaco-inline-completions.mjs'), 'utf8')

  assert.match(paneSource, /from '\.\/editor-monaco-mount-helpers\.mjs'/)
  assert.match(paneSource, /registerInlineCompletionProvider/)
  assert.match(paneSource, /options=\{editorOptions\}/)
  assert.doesNotMatch(paneSource, /options=\{MONACO_OPTIONS\}/)

  assert.match(inlineSource, /registerInlineCompletionsProvider\(/)
  assert.match(inlineSource, /disposeInlineCompletions\s*:\s*disposeInlineCompletionsNoop/)
})
