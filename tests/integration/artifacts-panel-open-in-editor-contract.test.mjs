import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('ArtifactsPanel right-click file rows expose an open-in-editor action through the shared editor store path', () => {
  const source = readSource('src/renderer/components/ArtifactsPanel.jsx')
  const controlsSource = readSource('src/renderer/components/artifacts/ArtifactPanelControls.jsx')

  assert.match(source, /import useEditorStore, \{ detectLanguage \} from '\.\.\/store\/useEditorStore\.js'/)
  assert.match(source, /const setActivePanel = useAppStore\(\(s\) => s\.setActivePanel\)/)
  assert.match(source, /const openEditorFile = useEditorStore\(\(s\) => s\.openFile\)/)
  assert.match(source, /const handleOpenInEditor = useCallback\(async \(filePath\) => \{/)
  assert.match(source, /setActivePanel\('editor'\)/)
  assert.match(source, /await openEditorFile\(projectFolder, normalizedFilePath, \{ source: 'artifacts_panel' \}\)/)
  assert.match(source, /<FileRow[\s\S]*onOpenInEditor=\{\(\) => handleOpenInEditor\(file\.file_path\)\}/)
  assert.match(controlsSource, /onContextMenu=\{openContextMenu\}/)
  assert.match(controlsSource, /role="menu"/)
  assert.match(controlsSource, /role="menuitem"/)
  assert.match(controlsSource, /artifacts\.fileRow\.openInEditor/)
  assert.match(controlsSource, /import \{ formatDateTime \} from '\.\.\/\.\.\/i18n\/formatters\.mjs'/)
})
