import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import useEditorStore from '../../src/renderer/store/useEditorStore.js'

function resetEditorStore() {
  useEditorStore.getState().clearAllTabs()
  useEditorStore.setState({
    tabs: [],
    activeTab: null,
    pendingReveal: null,
    serviceStateByTab: {},
  })
}

beforeEach(() => {
  resetEditorStore()
})

test('moveTab reorders tabs without changing the active tab', () => {
  useEditorStore.setState({
    tabs: [
      { id: 'tab_a', filePath: 'a.js', label: 'a.js', modelUri: 'file:///a.js', language: 'javascript', loading: false, error: null, dirty: false },
      { id: 'tab_b', filePath: 'b.js', label: 'b.js', modelUri: 'file:///b.js', language: 'javascript', loading: false, error: null, dirty: false },
      { id: 'tab_c', filePath: 'c.js', label: 'c.js', modelUri: 'file:///c.js', language: 'javascript', loading: false, error: null, dirty: false },
    ],
    activeTab: 'tab_b',
  })

  const result = useEditorStore.getState().moveTab('tab_c', 0)

  assert.deepEqual(useEditorStore.getState().tabs.map((tab) => tab.id), ['tab_c', 'tab_a', 'tab_b'])
  assert.equal(useEditorStore.getState().activeTab, 'tab_b')
  assert.deepEqual(result, { ok: true, tabId: 'tab_c', index: 0 })
})

test('moveTab clamps the target index and reports no_change when already ordered', () => {
  useEditorStore.setState({
    tabs: [
      { id: 'tab_a', filePath: 'a.js', label: 'a.js', modelUri: 'file:///a.js', language: 'javascript', loading: false, error: null, dirty: false },
      { id: 'tab_b', filePath: 'b.js', label: 'b.js', modelUri: 'file:///b.js', language: 'javascript', loading: false, error: null, dirty: false },
    ],
    activeTab: 'tab_a',
  })

  const clamped = useEditorStore.getState().moveTab('tab_a', 99)
  assert.deepEqual(useEditorStore.getState().tabs.map((tab) => tab.id), ['tab_b', 'tab_a'])
  assert.deepEqual(clamped, { ok: true, tabId: 'tab_a', index: 1 })

  const noChange = useEditorStore.getState().moveTab('tab_a', 1)
  assert.deepEqual(noChange, { ok: false, reason: 'no_change', tabId: 'tab_a', index: 1 })
})
