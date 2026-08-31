import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8')
}

test('workspace rail, empty entry, and active chat share the 52px shell header boundary', () => {
  const railSource = readSource('src/renderer/components/workspace/WorkspaceRailShell.jsx')
  const emptyEntrySource = readSource('src/renderer/components/WorkspaceProjectEntry.jsx')
  const chatHeaderSource = readSource('src/renderer/components/chat/ChatPanelHeaderBar.jsx')

  assert.match(railSource, /min-h-\[52px\][^"']*border-b/)
  assert.match(emptyEntrySource, /min-h-\[52px\][^"']*border-b/)
  assert.match(chatHeaderSource, /min-h-\[52px\][^"']*border-b/)
})

test('file-tree header owns the adjustment that aligns it to the 38px editor tab boundary', () => {
  const fileTreeSource = readSource('src/renderer/components/editor/EditorFileTree.jsx')
  const tabBarSource = readSource('src/renderer/components/editor/EditorTabBar.jsx')

  assert.match(fileTreeSource, /h-\[38px\][^"']*border-b/)
  assert.doesNotMatch(fileTreeSource, /h-\[38px\][^"']*py-2/)
  assert.match(tabBarSource, /relative flex items-end[^"']*border-b/)
})

test('artifact rail and detail states share the 52px split-pane header boundary', () => {
  const artifactsSource = readSource('src/renderer/components/ArtifactsPanel.jsx')
  const alignedHeaders = artifactsSource.match(/h-\[52px\][^"']*border-b/g) ?? []

  assert.equal(alignedHeaders.length, 3)
})
