import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveAttachmentActionKinds,
  resolveAttachmentMenuPosition,
  resolveAttachmentSubmenuSide,
  resolveNextMenuItemIndex,
} from '../../src/renderer/components/chat/attachment-action-menu-state.mjs'

test('cached attachment menus expose native reveal while image menus omit Open with', () => {
  assert.deepEqual(resolveAttachmentActionKinds({ kind: 'image' }), ['copy', 'save_as'])
  assert.deepEqual(resolveAttachmentActionKinds({ kind: 'file' }), ['copy', 'save_as', 'open_with'])
  assert.deepEqual(
    resolveAttachmentActionKinds({
      kind: 'image',
      descriptor: { attachmentId: 'att_generated' },
    }),
    ['copy', 'show_in_folder', 'save_as'],
  )
  assert.deepEqual(
    resolveAttachmentActionKinds({
      kind: 'file',
      descriptor: { attachmentId: 'att_file' },
    }),
    ['copy', 'show_in_folder', 'save_as', 'open_with'],
  )
})

test('context menu coordinates remain inside every viewport edge', () => {
  assert.deepEqual(
    resolveAttachmentMenuPosition(
      { x: 790, y: 590 },
      { width: 180, height: 120 },
      { width: 800, height: 600 },
    ),
    { left: 612, top: 472 },
  )
  assert.deepEqual(
    resolveAttachmentMenuPosition(
      { x: -20, y: -10 },
      { width: 180, height: 120 },
      { width: 800, height: 600 },
    ),
    { left: 8, top: 8 },
  )
})

test('submenu flips left when its right edge would leave the viewport', () => {
  assert.equal(resolveAttachmentSubmenuSide({
    menuRight: 740,
    submenuWidth: 220,
    viewportWidth: 760,
    margin: 8,
  }), 'left')
  assert.equal(resolveAttachmentSubmenuSide({
    menuRight: 300,
    submenuWidth: 220,
    viewportWidth: 760,
    margin: 8,
  }), 'right')
})

test('roving menu focus wraps and skips disabled entries', () => {
  const entries = [{ disabled: false }, { disabled: true }, { disabled: false }]
  assert.equal(resolveNextMenuItemIndex(entries, 0, 1), 2)
  assert.equal(resolveNextMenuItemIndex(entries, 2, 1), 0)
  assert.equal(resolveNextMenuItemIndex(entries, 0, -1), 2)
})
