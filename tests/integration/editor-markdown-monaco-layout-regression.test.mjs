import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('markdown split keeps Monaco on a full-height layout contract', () => {
  const editorPanelViewSource = fs.readFileSync(
    path.resolve('src/renderer/components/editor/EditorPanelView.jsx'),
    'utf8',
  )
  const monacoSource = fs.readFileSync(
    path.resolve('src/renderer/components/editor/EditorMonacoPane.jsx'),
    'utf8',
  )
  const monacoOverviewRulerSource = fs.readFileSync(
    path.resolve('src/renderer/components/editor/editor-monaco-overview-ruler.mjs'),
    'utf8',
  )
  const monacoHelpersSource = fs.readFileSync(
    path.resolve('src/renderer/components/editor/editor-monaco-helpers.mjs'),
    'utf8',
  )

  assert.match(editorPanelViewSource, /className="flex-1 min-h-0 flex items-stretch overflow-hidden"/)
  assert.match(editorPanelViewSource, /className="flex-1 min-w-0 min-h-0 h-full flex items-stretch overflow-hidden"/)
  assert.match(editorPanelViewSource, /className="flex h-full min-h-0 min-w-0 overflow-hidden"/)
  assert.match(editorPanelViewSource, /className="flex-1 min-w-0 min-h-0 h-full overflow-hidden"/)

  assert.match(monacoSource, /const rootRef = useRef\(null\)/)
  assert.match(monacoSource, /const \[editorSize, setEditorSize\] = useState\(EMPTY_EDITOR_SIZE\)/)
  assert.match(monacoSource, /new ResizeObserver\(\(\) => relayoutLater\(\)\)/)
  assert.match(monacoSource, /const INITIAL_LAYOUT_RETRY_FRAMES = 12/)
  assert.match(monacoSource, /relayoutLater\(INITIAL_LAYOUT_RETRY_FRAMES\)/)
  assert.match(monacoSource, /editorRef\.current\?\.layout\(nextSize\)/)
  assert.match(monacoSource, /className="relative flex h-full min-h-0 min-w-0 w-full overflow-hidden"/)
  assert.match(monacoSource, /const hasMeasuredSize = editorSize\.width > 0 && editorSize\.height > 0/)
  assert.match(monacoSource, /const editorWidth = hasMeasuredSize \? editorSize\.width : '100%'/)
  assert.match(monacoSource, /const editorHeight = hasMeasuredSize \? editorSize\.height : '100%'/)
  assert.match(monacoSource, /height=\{editorHeight\}/)
  assert.match(monacoSource, /width=\{editorWidth\}/)
  assert.match(monacoHelpersSource, /automaticLayout: false/)
  assert.match(monacoHelpersSource, /minimap: \{ enabled: true, scale: 1 \}/)
  assert.match(monacoOverviewRulerSource, /function patchOverviewRulerForCollapsedMinimap\(editor\)/)
  assert.match(monacoOverviewRulerSource, /minimapHeightIsEditorHeight/)
})
