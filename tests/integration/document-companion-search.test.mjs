import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findDocumentSearchOffsets,
  moveDocumentSearchIndex,
  observeDocumentSearchChanges,
} from '../../src/renderer/components/chat/document-companion-search.mjs'

test('document search finds case-insensitive non-overlapping matches', () => {
  assert.deepEqual(findDocumentSearchOffsets('Plan the plan, then PLAN.', 'plan'), [0, 9, 20])
  assert.deepEqual(findDocumentSearchOffsets('aaaa', 'aa'), [0, 2])
  assert.deepEqual(findDocumentSearchOffsets('Document', 'missing'), [])
  assert.deepEqual(findDocumentSearchOffsets('Document', '   '), [])
})

test('document search navigation wraps in both directions', () => {
  assert.equal(moveDocumentSearchIndex(-1, 3, 1), 0)
  assert.equal(moveDocumentSearchIndex(2, 3, 1), 0)
  assert.equal(moveDocumentSearchIndex(0, 3, -1), 2)
  assert.equal(moveDocumentSearchIndex(0, 0, 1), -1)
})

test('document search refreshes when lazy Markdown replaces the rendered content', () => {
  const root = {}
  const observed = []
  let disconnected = false
  let refreshCount = 0

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback
    }

    observe(target, options) {
      observed.push({ target, options })
      this.callback([{ type: 'childList' }])
    }

    disconnect() {
      disconnected = true
    }
  }

  const stop = observeDocumentSearchChanges(root, () => { refreshCount += 1 }, FakeMutationObserver)

  assert.deepEqual(observed, [{
    target: root,
    options: { childList: true, subtree: true, characterData: true },
  }])
  assert.equal(refreshCount, 1)

  stop()
  assert.equal(disconnected, true)
})
