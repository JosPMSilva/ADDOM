import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveDocumentSearchPresentation,
  SAVED_COPY_STATUS_DURATION_MS,
  shouldShowDocumentCompanionSearch,
} from '../../src/renderer/components/chat/document-companion-toolbar-layout.mjs'

test('document search disappears when its toolbar cannot retain a usable search field', () => {
  assert.equal(shouldShowDocumentCompanionSearch({ toolbarWidth: 460, actionsWidth: 220 }), true)
  assert.equal(shouldShowDocumentCompanionSearch({ toolbarWidth: 350, actionsWidth: 220 }), false)
  assert.equal(shouldShowDocumentCompanionSearch({ toolbarWidth: 460, actionsWidth: 330 }), false)
})

test('saved-copy status uses the requested three-second lifetime', () => {
  assert.equal(SAVED_COPY_STATUS_DURATION_MS, 3_000)
})

test('compact document search preserves active queries and keyboard focus', () => {
  assert.equal(resolveDocumentSearchPresentation({ compact: true }), 'button')
  assert.equal(resolveDocumentSearchPresentation({ compact: true, focused: true }), 'overlay')
  assert.equal(resolveDocumentSearchPresentation({ compact: true, query: 'update' }), 'overlay')
  assert.equal(resolveDocumentSearchPresentation({ compact: false }), 'inline')
})
