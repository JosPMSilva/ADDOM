import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('dialog layering constants define the semantic z-index scale', () => {
  const source = readSource('src/renderer/components/dialog-layering.mjs')

  assert.match(source, /export const DIALOG_Z_STANDARD = 'z-50'/)
  assert.match(source, /export const DIALOG_Z_ELEVATED = 'z-\[70\]'/)
  assert.match(source, /export const DIALOG_Z_IMMERSIVE = 'z-\[80\]'/)
  assert.match(source, /export const DIALOG_Z_CONFIRM = 'z-\[90\]'/)
})

test('modal overlays consume the shared dialog layering constants', () => {
  const appSource = readSource('src/renderer/App.jsx')
  const decisionDialogSource = readSource('src/renderer/components/ui/AppDecisionDialog.jsx')
  const commandPaletteSource = readSource('src/renderer/components/CommandPalette.jsx')
  const composerSource = readSource('src/renderer/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx')
  const backgroundJobsSource = readSource('src/renderer/components/chat/BackgroundJobsModal.jsx')
  const chatThreadModalsSource = readSource('src/renderer/components/chat/ChatThreadModals.jsx')

  assert.match(appSource, /AppDecisionDialog/)
  assert.match(decisionDialogSource, /DIALOG_Z_CONFIRM/)
  assert.match(commandPaletteSource, /DIALOG_Z_IMMERSIVE/)
  assert.match(composerSource, /DIALOG_Z_IMMERSIVE/)
  assert.match(backgroundJobsSource, /DIALOG_Z_STANDARD/)
  assert.match(chatThreadModalsSource, /DIALOG_Z_STANDARD/)
})
