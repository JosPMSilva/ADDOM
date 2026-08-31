import test from 'node:test'
import assert from 'node:assert/strict'

import { buildFixedSizeVirtualWindow } from '../../src/renderer/utils/fixed-size-virtual-window.mjs'

test('fixed size virtualization window computes visible slice with overscan', () => {
  const result = buildFixedSizeVirtualWindow({
    itemCount: 200,
    itemHeight: 60,
    viewportHeight: 300,
    scrollTop: 600,
    overscan: 2,
  })

  assert.deepEqual(result, {
    startIndex: 8,
    endIndex: 17,
    paddingTop: 480,
    paddingBottom: 10980,
    totalHeight: 12000,
  })
})

test('fixed size virtualization window returns empty state for empty lists', () => {
  const result = buildFixedSizeVirtualWindow({
    itemCount: 0,
    itemHeight: 60,
    viewportHeight: 300,
    scrollTop: 0,
    overscan: 2,
  })

  assert.deepEqual(result, {
    startIndex: 0,
    endIndex: 0,
    paddingTop: 0,
    paddingBottom: 0,
    totalHeight: 0,
  })
})
