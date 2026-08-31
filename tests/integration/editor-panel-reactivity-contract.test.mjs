import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('EditorPanel derives active tab render state from subscribed tabs instead of selector snapshot getters', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/EditorPanel.jsx'),
    'utf8',
  )

  assert.doesNotMatch(source, /getTabsSnapshot:\s*s\.getTabsSnapshot/)
  assert.doesNotMatch(source, /getTabSnapshot:\s*s\.getTabSnapshot/)
  assert.match(source, /const tabSnapshots = tabs\.map\(\(tab\) => \(\{ \.\.\.tab, dirty: !!tab\.dirty \}\)\)/)
  assert.match(source, /const activeTabBase = activeTab \? \(tabs\.find\(\(tab\) => tab\.id === activeTab\) \?\? null\) : null/)
  assert.match(source, /const currentTab = activeTabBase \? \(useEditorStore\.getState\(\)\.getTabSnapshot\(activeTabBase\.id\) \?\? activeTabBase\) : null/)
  assert.doesNotMatch(source, /const currentTab = useMemo\(/)
  assert.doesNotMatch(source, /const tabSnapshots = useMemo\(/)
})
