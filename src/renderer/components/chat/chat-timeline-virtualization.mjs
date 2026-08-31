export const TIMELINE_BLOCK_GAP_PX = 8
export const TIMELINE_BLOCK_ESTIMATED_HEIGHT_PX = 196
export const TIMELINE_BLOCK_OVERSCAN = 4
export const TIMELINE_BLOCK_VIRTUALIZE_MIN_COUNT = 40
export const TIMELINE_VIRTUALIZATION_MAX_MOUNTED_BLOCKS = 60

function findFirstBlockEndingAfter(prefixOffsets, offset) {
  const blockCount = Math.max(0, prefixOffsets.length - 1)
  let low = 0
  let high = blockCount
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (prefixOffsets[middle + 1] > offset) high = middle
    else low = middle + 1
  }
  return Math.min(blockCount, low)
}

function findFirstBlockStartingAtOrAfter(prefixOffsets, offset) {
  const blockCount = Math.max(0, prefixOffsets.length - 1)
  let low = 0
  let high = blockCount
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (prefixOffsets[middle] >= offset) high = middle
    else low = middle + 1
  }
  return Math.min(blockCount, low)
}

export function buildTimelineBlockLayout({
  timelineBlocks = [],
  measuredBlockHeights = {},
  estimatedHeightPx = TIMELINE_BLOCK_ESTIMATED_HEIGHT_PX,
  gapPx = TIMELINE_BLOCK_GAP_PX,
} = {}) {
  const blocks = Array.isArray(timelineBlocks) ? timelineBlocks : []
  const heights = measuredBlockHeights && typeof measuredBlockHeights === 'object'
    ? measuredBlockHeights
    : {}
  const normalizedGap = Math.max(0, Number(gapPx) || 0)
  const normalizedEstimate = Math.max(0, Number(estimatedHeightPx) || 0)
  const entries = blocks.map((block, index) => {
    const blockId = String(block?.id || `timeline-block-${index}`)
    const measuredHeight = Math.max(0, Number(heights[blockId] || 0) || 0)
    return {
      block,
      blockId,
      size: Math.max(
        normalizedGap,
        (measuredHeight > 0 ? measuredHeight : normalizedEstimate) + normalizedGap,
      ),
    }
  })
  const prefixOffsets = new Array(entries.length + 1)
  prefixOffsets[0] = 0
  for (let index = 0; index < entries.length; index += 1) {
    prefixOffsets[index + 1] = prefixOffsets[index] + entries[index].size
  }
  return {
    entries,
    prefixOffsets,
    totalSize: prefixOffsets[entries.length],
  }
}

export function buildTimelineVirtualizationState({
  blockLayout = null,
  scrollTop = 0,
  viewportHeight = 0,
  virtualizationEnabled = false,
  overscanViewportRatio = 1.5,
  overscanBlocks = TIMELINE_BLOCK_OVERSCAN,
  maxMountedBlocks = TIMELINE_VIRTUALIZATION_MAX_MOUNTED_BLOCKS,
  pinnedBlockIndex = -1,
} = {}) {
  const entries = Array.isArray(blockLayout?.entries) ? blockLayout.entries : []
  const prefixOffsets = Array.isArray(blockLayout?.prefixOffsets) ? blockLayout.prefixOffsets : [0]
  const totalSize = Math.max(0, Number(blockLayout?.totalSize || 0) || 0)
  if (!virtualizationEnabled || entries.length === 0) {
    return {
      renderedBlockEntries: entries,
      virtualRange: null,
      startIndex: 0,
      endIndex: entries.length,
      visibleStartIndex: 0,
      visibleEndIndex: entries.length,
      pinnedBlockIncluded: Number(pinnedBlockIndex) >= 0 && Number(pinnedBlockIndex) < entries.length,
    }
  }

  const normalizedScrollTop = Math.max(0, Number(scrollTop) || 0)
  const normalizedViewportHeight = Math.max(0, Number(viewportHeight) || 0)
  const overscanPx = normalizedViewportHeight * Math.max(0, Number(overscanViewportRatio) || 0)
  const minVisibleOffset = normalizedScrollTop
  const maxVisibleOffset = Math.min(totalSize, normalizedScrollTop + normalizedViewportHeight)
  const minRenderedOffset = Math.max(0, minVisibleOffset - overscanPx)
  const maxRenderedOffset = Math.min(totalSize, maxVisibleOffset + overscanPx)
  const visibleStartIndex = findFirstBlockEndingAfter(prefixOffsets, minVisibleOffset)
  const visibleEndIndex = Math.max(
    visibleStartIndex + 1,
    findFirstBlockStartingAtOrAfter(prefixOffsets, maxVisibleOffset),
  )
  let startIndex = Math.max(
    0,
    findFirstBlockEndingAfter(prefixOffsets, minRenderedOffset) - Math.max(0, Number(overscanBlocks) || 0),
  )
  let endIndex = Math.min(
    entries.length,
    findFirstBlockStartingAtOrAfter(prefixOffsets, maxRenderedOffset)
      + Math.max(0, Number(overscanBlocks) || 0),
  )

  const mountedBudget = Math.max(1, Number(maxMountedBlocks) || 1)
  if (endIndex - startIndex > mountedBudget) {
    startIndex = Math.max(0, Math.min(
      startIndex,
      visibleEndIndex - mountedBudget,
    ))
    endIndex = Math.min(entries.length, startIndex + mountedBudget)
    if (endIndex < visibleEndIndex) {
      endIndex = Math.min(entries.length, visibleEndIndex)
      startIndex = Math.max(0, endIndex - mountedBudget)
    }
  }

  const normalizedPinnedIndex = Number.isInteger(Number(pinnedBlockIndex))
    ? Number(pinnedBlockIndex)
    : -1
  if (normalizedPinnedIndex >= 0 && normalizedPinnedIndex < entries.length) {
    const requiredStart = Math.min(visibleStartIndex, normalizedPinnedIndex)
    const requiredEnd = Math.max(visibleEndIndex, normalizedPinnedIndex + 1)
    if (requiredEnd - requiredStart <= mountedBudget) {
      const minimumStart = Math.max(0, requiredEnd - mountedBudget)
      startIndex = Math.max(minimumStart, Math.min(startIndex, requiredStart))
      endIndex = Math.min(entries.length, startIndex + mountedBudget)
    }
  }

  return {
    renderedBlockEntries: entries.slice(startIndex, endIndex),
    virtualRange: {
      paddingTop: prefixOffsets[startIndex] || 0,
      paddingBottom: Math.max(0, totalSize - (prefixOffsets[endIndex] || 0)),
    },
    startIndex,
    endIndex,
    visibleStartIndex,
    visibleEndIndex,
    pinnedBlockIncluded: normalizedPinnedIndex >= startIndex && normalizedPinnedIndex < endIndex,
  }
}

export function pruneTimelineHeightCache(cache = {}, allowedIds = new Set()) {
  const current = cache && typeof cache === 'object' ? cache : {}
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || [])
  let changed = false
  const next = {}
  for (const [blockId, height] of Object.entries(current)) {
    if (!allowed.has(blockId)) {
      changed = true
      continue
    }
    next[blockId] = height
  }
  return changed ? next : current
}

export function resolveTimelineAnchorCorrection({
  blockIndex = -1,
  visibleStartIndex = 0,
  previousSize = 0,
  nextSize = 0,
} = {}) {
  if (Number(blockIndex) < 0 || Number(blockIndex) >= Number(visibleStartIndex || 0)) return 0
  return Number(nextSize || 0) - Number(previousSize || 0)
}
