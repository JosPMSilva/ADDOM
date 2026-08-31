import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const auditedFiles = [
  'src/renderer/App.jsx',
  'src/renderer/components/ChatPanel.jsx',
  'src/renderer/components/EditorPanel.jsx',
  'src/renderer/components/settings/SettingsPanelRoot.jsx',
  'src/renderer/components/ChatEventBridge.jsx',
  'src/renderer/components/editor/EditorMonacoPane.jsx',
  'src/renderer/components/chat/ChatPanelTimelineArea.jsx',
]

const chatPaletteAuditedFiles = [
  'src/renderer/components/chat/MessageBubble.jsx',
  'src/renderer/components/chat/CopyBlockButton.jsx',
  'src/renderer/components/chat/ContextMeter.jsx',
  'src/renderer/components/chat/context-meter-view-model.mjs',
  'src/renderer/components/chat/ChatPanelTimelineArea.jsx',
  'src/renderer/components/chat/ToolActivityLine.jsx',
  'src/renderer/components/chat/TurnFileChangesCard.jsx',
]

test('audited renderer files no longer start with a UTF-8 BOM', () => {
  for (const relPath of auditedFiles) {
    const source = fs.readFileSync(path.resolve(relPath), 'utf8')
    assert.notEqual(source.charCodeAt(0), 0xFEFF, `${relPath} still starts with a BOM`)
  }
})

test('audited renderer files do not contain mojibake fragments', () => {
  const mojibakePattern = /â|Ã|�/
  for (const relPath of auditedFiles) {
    const source = fs.readFileSync(path.resolve(relPath), 'utf8')
    assert.doesNotMatch(source, mojibakePattern, `${relPath} still contains mojibake text`)
  }
})

test('audited chat UI files avoid hardcoded hex colors', () => {
  const hardcodedHexColorPattern = /#[0-9a-fA-F]{3,8}\b/
  for (const relPath of chatPaletteAuditedFiles) {
    const source = fs.readFileSync(path.resolve(relPath), 'utf8')
    assert.doesNotMatch(source, hardcodedHexColorPattern, `${relPath} still contains hardcoded hex colors`)
  }
})
