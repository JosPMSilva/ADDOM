import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TIMELINE_VIRTUALIZATION_MAX_MOUNTED_BLOCKS,
  buildTimelineBlockLayout,
  buildTimelineVirtualizationState,
  pruneTimelineHeightCache,
  resolveTimelineAnchorCorrection,
} from '../../src/renderer/components/chat/chat-timeline-virtualization.mjs'

function buildBlocks(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `block-${index}`,
    kind: 'entry',
  }))
}

test('buildTimelineBlockLayout keys measured heights by stable block identity', () => {
  const timelineBlocks = buildBlocks(4)
  const layout = buildTimelineBlockLayout({
    timelineBlocks,
    measuredBlockHeights: {
      'block-1': 120,
      'block-3': 240,
    },
  })

  assert.deepEqual(layout.entries.map(({ blockId, size }) => ({ blockId, size })), [
    { blockId: 'block-0', size: 204 },
    { blockId: 'block-1', size: 128 },
    { blockId: 'block-2', size: 204 },
    { blockId: 'block-3', size: 248 },
  ])
  assert.deepEqual(layout.prefixOffsets, [0, 204, 332, 536, 784])
  assert.equal(layout.totalSize, 784)
})

test('buildTimelineVirtualizationState stays within the mounted-block budget at 500 rows', () => {
  const layout = buildTimelineBlockLayout({ timelineBlocks: buildBlocks(500) })
  const scrollPositions = [0, 2_000, 20_000, 60_000, layout.totalSize - 900]

  for (const scrollTop of scrollPositions) {
    const state = buildTimelineVirtualizationState({
      blockLayout: layout,
      scrollTop,
      viewportHeight: 900,
      virtualizationEnabled: true,
    })
    assert.ok(state.renderedBlockEntries.length <= TIMELINE_VIRTUALIZATION_MAX_MOUNTED_BLOCKS)
    assert.equal(state.virtualRange.paddingTop, layout.prefixOffsets[state.startIndex])
    assert.equal(
      state.virtualRange.paddingBottom,
      layout.totalSize - layout.prefixOffsets[state.endIndex],
    )
    assert.ok(state.visibleStartIndex >= state.startIndex)
    assert.ok(state.visibleEndIndex <= state.endIndex)
  }
})

test('virtualization includes the final row when scrolled to the bottom', () => {
  const layout = buildTimelineBlockLayout({ timelineBlocks: buildBlocks(500) })
  const state = buildTimelineVirtualizationState({
    blockLayout: layout,
    scrollTop: layout.totalSize - 900,
    viewportHeight: 900,
    virtualizationEnabled: true,
  })

  assert.equal(state.endIndex, 500)
  assert.equal(state.renderedBlockEntries.at(-1).blockId, 'block-499')
})

test('virtualization keeps a nearby focused or selected block inside the bounded range', () => {
  const layout = buildTimelineBlockLayout({ timelineBlocks: buildBlocks(500) })
  const baseline = buildTimelineVirtualizationState({
    blockLayout: layout,
    scrollTop: 50_000,
    viewportHeight: 900,
    virtualizationEnabled: true,
  })
  const pinnedBlockIndex = Math.max(0, baseline.startIndex - 3)
  const pinned = buildTimelineVirtualizationState({
    blockLayout: layout,
    scrollTop: 50_000,
    viewportHeight: 900,
    virtualizationEnabled: true,
    pinnedBlockIndex,
  })

  assert.ok(pinned.startIndex <= pinnedBlockIndex)
  assert.ok(pinned.endIndex > pinnedBlockIndex)
  assert.equal(pinned.pinnedBlockIncluded, true)
  assert.ok(pinned.renderedBlockEntries.length <= TIMELINE_VIRTUALIZATION_MAX_MOUNTED_BLOCKS)
})

test('pruneTimelineHeightCache removes prior-thread entries without rebuilding a valid cache', () => {
  const cache = { 'block-1': 120, 'block-2': 140 }
  assert.equal(pruneTimelineHeightCache(cache, new Set(['block-1', 'block-2'])), cache)
  assert.deepEqual(pruneTimelineHeightCache(cache, new Set(['block-2'])), { 'block-2': 140 })
  assert.deepEqual(pruneTimelineHeightCache(cache, new Set()), {})
})

test('resolveTimelineAnchorCorrection adjusts only measurements above the visible anchor', () => {
  assert.equal(resolveTimelineAnchorCorrection({
    blockIndex: 3,
    visibleStartIndex: 10,
    previousSize: 204,
    nextSize: 128,
  }), -76)
  assert.equal(resolveTimelineAnchorCorrection({
    blockIndex: 12,
    visibleStartIndex: 10,
    previousSize: 204,
    nextSize: 128,
  }), 0)
})

test('independent project caches cannot leak measurements into each other', () => {
  const projectA = pruneTimelineHeightCache({ 'a-1': 100, 'b-1': 900 }, new Set(['a-1']))
  const projectB = pruneTimelineHeightCache({ 'a-1': 100, 'b-1': 900 }, new Set(['b-1']))

  assert.deepEqual(projectA, { 'a-1': 100 })
  assert.deepEqual(projectB, { 'b-1': 900 })
})
