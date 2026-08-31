import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ComposerCodeBlockAdvancedEditorModal = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx')
  ComposerCodeBlockAdvancedEditorModal = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('advanced composer code editor modal exports component and keeps required controls in source', () => {
  assert.equal(typeof ComposerCodeBlockAdvancedEditorModal, 'function')
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx'),
    'utf8',
  )
  assert.match(source, /Advanced Code Editor/i)
  assert.match(source, /Ctrl\/Cmd\+Enter apply/i)
  assert.match(source, /Cancel/i)
  assert.match(source, /Apply/i)
  assert.match(source, /useDialogFocusTrap\(open,\s*dialogRef\)/)
  assert.match(source, /useDialogEscapeDismiss\(open,\s*dialogRef,\s*onCancel\)/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-labelledby="composer-advanced-editor-title"/)
  assert.match(source, /monaco\.KeyMod\.CtrlCmd\s*\|\s*monaco\.KeyCode\.Enter/)
  assert.match(source, /monaco\.KeyCode\.Escape/)
  assert.match(source, /requestInlineCompletion\(/)
  assert.match(source, /providerId:\s*provider/i)
  assert.match(source, /model:\s*selectedModel/i)
  assert.match(source, /project,\s*[\r\n]+\s*filePath:/i)
})
