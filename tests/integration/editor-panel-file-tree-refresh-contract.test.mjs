import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const editorPanelSource = fs.readFileSync(
  path.resolve('src/renderer/components/EditorPanel.jsx'),
  'utf8',
)

test('editor panel reloads the file tree from workspace and artifact change events', () => {
  assert.match(editorPanelSource, /const scheduleTreeReload = useCallback/)
  assert.match(
    editorPanelSource,
    /useEffect\(\(\) => \{\s+if \(!projectFolder\) return\s+void loadTree\(projectFolder\)\s+\}, \[projectFolder, loadTree\]\)/,
  )
  assert.match(
    editorPanelSource,
    /window\.addom\.file\.onExternalChange[\s\S]*scheduleTreeReload\(\)[\s\S]*handleExternalFileChange\(projectFolder,\s*filePath,\s*payload\)/,
  )
  assert.match(
    editorPanelSource,
    /window\.addom\.file\.onTreeChanged[\s\S]*scheduleTreeReload\(\)/,
  )
  assert.match(
    editorPanelSource,
    /window\.addom\.artifacts\.onUpdated[\s\S]*scheduleTreeReload\(\)/,
  )
})

test('editor panel refreshes runtime availability on focus and tree changes', () => {
  assert.match(editorPanelSource, /const refreshActiveTabRuntimeAvailability = useCallback\(async \(\) =>/)
  assert.match(
    editorPanelSource,
    /window\.addom\.editor\.service\.refreshRuntime\(/,
  )
  assert.match(
    editorPanelSource,
    /window\.addom\.file\.onTreeChanged[\s\S]*const filePath = String\(payload\.filePath \|\| ''\)\.trim\(\)[\s\S]*const source = String\(payload\.source \|\| ''\)\.trim\(\)\.toLowerCase\(\)[\s\S]*source === 'editor-save'[\s\S]*reloadTab\(projectFolder,\s*filePath,\s*\{\s*force:\s*true\s*\}\)/,
  )
  assert.match(
    editorPanelSource,
    /window\.addEventListener\('focus', handleWindowFocus\)/,
  )
})
