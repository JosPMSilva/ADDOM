import React from 'react'

import {
  TIMELINE_BLOCK_ESTIMATED_HEIGHT_PX,
  TIMELINE_BLOCK_GAP_PX,
  TIMELINE_BLOCK_VIRTUALIZE_MIN_COUNT,
  buildTimelineBlockLayout,
  buildTimelineVirtualizationState,
  pruneTimelineHeightCache,
  resolveTimelineAnchorCorrection,
} from './chat-timeline-virtualization.mjs'

function TimelineMeasuredBlock({
  blockId = '',
  onMeasure = () => {},
  children,
}) {
  const containerRef = React.useRef(null)

  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined
    let disposed = false
    let frameId = 0

    const cancelScheduledMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
        frameId = 0
      }
    }

    const measureNow = () => {
      if (disposed) return
      const nextHeight = Math.ceil(Number(node.getBoundingClientRect().height) || 0)
      if (nextHeight > 0) onMeasure(blockId, nextHeight)
    }

    const containsExecutionStream = node.querySelector('[data-live-execution-stream-root="true"]') !== null
    if (containsExecutionStream) {
      frameId = requestAnimationFrame(() => {
        frameId = requestAnimationFrame(() => {
          frameId = 0
          measureNow()
        })
      })
      return () => {
        disposed = true
        cancelScheduledMeasure()
      }
    }

    measureNow()
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(() => {
      measureNow()
    })
    observer.observe(node)
    return () => {
      disposed = true
      cancelScheduledMeasure()
      observer.disconnect()
    }
  }, [blockId, onMeasure])

  return (
    <div ref={containerRef} data-chat-timeline-block={blockId}>
      {children}
    </div>
  )
}

export default function useTimelineVirtualization({
  timelineBlocks = [],
  scrollContainerRef = null,
} = {}) {
  const [viewportHeight, setViewportHeight] = React.useState(() => (
    typeof window === 'undefined' ? 0 : Math.max(1, Number(window.innerHeight) || 1)
  ))
  const [scrollTop, setScrollTop] = React.useState(0)
  const [measuredBlockHeights, setMeasuredBlockHeights] = React.useState({})
  const [interactionPinnedBlockId, setInteractionPinnedBlockId] = React.useState('')
  const measuredBlockHeightsRef = React.useRef(measuredBlockHeights)
  const scrollMetricsFrameRef = React.useRef(0)
  const anchorCorrectionFrameRef = React.useRef(0)
  const visibleStartIndexRef = React.useRef(0)
  const timelineBlockIndexByIdRef = React.useRef(new Map())
  const scrollMetricsSnapshotRef = React.useRef({ viewportHeight: 0, scrollTop: 0 })
  const timelineBlockIds = React.useMemo(
    () => timelineBlocks.map((block, index) => String(block?.id || `timeline-block-${index}`)),
    [timelineBlocks],
  )

  React.useEffect(() => {
    setMeasuredBlockHeights((current) => (
      pruneTimelineHeightCache(current, new Set(timelineBlockIds))
    ))
  }, [timelineBlockIds])

  const shouldTrackScrollMetrics = timelineBlocks.length >= TIMELINE_BLOCK_VIRTUALIZE_MIN_COUNT
  const scheduleScrollMetricsSync = React.useCallback(() => {
    if (!shouldTrackScrollMetrics || typeof window === 'undefined') return
    if (scrollMetricsFrameRef.current) return
    scrollMetricsFrameRef.current = window.requestAnimationFrame(() => {
      scrollMetricsFrameRef.current = 0
      const node = scrollContainerRef?.current
      if (!node) return
      const nextViewportHeight = Math.max(0, Math.ceil(Number(node.clientHeight) || 0))
      const nextScrollTop = Math.max(0, Number(node.scrollTop) || 0)
      const previousSnapshot = scrollMetricsSnapshotRef.current
      if (
        previousSnapshot.viewportHeight === nextViewportHeight
        && previousSnapshot.scrollTop === nextScrollTop
      ) return
      scrollMetricsSnapshotRef.current = {
        viewportHeight: nextViewportHeight,
        scrollTop: nextScrollTop,
      }
      setViewportHeight((current) => (current === nextViewportHeight ? current : nextViewportHeight))
      setScrollTop((current) => (current === nextScrollTop ? current : nextScrollTop))
    })
  }, [scrollContainerRef, shouldTrackScrollMetrics])

  React.useEffect(() => {
    if (shouldTrackScrollMetrics) {
      scheduleScrollMetricsSync()
      const node = scrollContainerRef?.current
      if (!node || typeof ResizeObserver !== 'function') {
        return () => {
          if (scrollMetricsFrameRef.current) {
            cancelAnimationFrame(scrollMetricsFrameRef.current)
            scrollMetricsFrameRef.current = 0
          }
        }
      }
      const observer = new ResizeObserver(scheduleScrollMetricsSync)
      observer.observe(node)
      return () => {
        if (scrollMetricsFrameRef.current) {
          cancelAnimationFrame(scrollMetricsFrameRef.current)
          scrollMetricsFrameRef.current = 0
        }
        observer.disconnect()
      }
    }
    if (scrollMetricsFrameRef.current) {
      cancelAnimationFrame(scrollMetricsFrameRef.current)
      scrollMetricsFrameRef.current = 0
    }
    return undefined
  }, [scheduleScrollMetricsSync, scrollContainerRef, shouldTrackScrollMetrics])

  const blockLayout = React.useMemo(() => buildTimelineBlockLayout({
    timelineBlocks,
    measuredBlockHeights,
  }), [measuredBlockHeights, timelineBlocks])
  measuredBlockHeightsRef.current = measuredBlockHeights
  const timelineBlockIndexById = React.useMemo(() => new Map(
    blockLayout.entries.map((entry, index) => [entry.blockId, index]),
  ), [blockLayout.entries])
  timelineBlockIndexByIdRef.current = timelineBlockIndexById
  const interactionPinnedBlockIndex = timelineBlockIndexById.get(interactionPinnedBlockId) ?? -1
  const resolveInteractionBlockId = React.useCallback((node) => {
    const element = node?.nodeType === 1 ? node : node?.parentElement
    const block = element?.closest?.('[data-chat-timeline-block]') || null
    const timelineNode = scrollContainerRef?.current
    if (!block || !timelineNode?.contains(block)) return ''
    return String(block.dataset.chatTimelineBlock || '').trim()
  }, [scrollContainerRef])

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const syncSelectionPin = () => {
      const focusId = resolveInteractionBlockId(document.activeElement)
      const selectionId = resolveInteractionBlockId(window.getSelection?.()?.anchorNode)
      setInteractionPinnedBlockId(focusId || selectionId || '')
    }
    document.addEventListener('selectionchange', syncSelectionPin)
    return () => document.removeEventListener('selectionchange', syncSelectionPin)
  }, [resolveInteractionBlockId])

  const virtualizationEnabled = (
    shouldTrackScrollMetrics
    && typeof window !== 'undefined'
    && viewportHeight > 0
  )
  const virtualizedTimelineState = React.useMemo(() => buildTimelineVirtualizationState({
    blockLayout,
    scrollTop,
    viewportHeight,
    virtualizationEnabled,
    pinnedBlockIndex: interactionPinnedBlockIndex,
  }), [blockLayout, interactionPinnedBlockIndex, scrollTop, viewportHeight, virtualizationEnabled])
  const renderedBlockEntries = virtualizationEnabled
    ? virtualizedTimelineState.renderedBlockEntries
    : blockLayout.entries
  const virtualRange = virtualizedTimelineState.virtualRange
  const virtualStartIndex = Number(virtualizedTimelineState.startIndex || 0)
  visibleStartIndexRef.current = Number(virtualizedTimelineState.visibleStartIndex || 0)

  const handleTimelineBlockMeasure = React.useCallback((blockId, height) => {
    const normalizedId = String(blockId || '').trim()
    const nextHeight = Math.max(0, Math.ceil(Number(height) || 0))
    const previousHeight = Math.max(0, Number(measuredBlockHeightsRef.current[normalizedId] || 0) || 0)
    if (!normalizedId || nextHeight <= 0 || previousHeight === nextHeight) return
    const correction = resolveTimelineAnchorCorrection({
      blockIndex: timelineBlockIndexByIdRef.current.get(normalizedId) ?? -1,
      visibleStartIndex: visibleStartIndexRef.current,
      previousSize: (previousHeight || TIMELINE_BLOCK_ESTIMATED_HEIGHT_PX) + TIMELINE_BLOCK_GAP_PX,
      nextSize: nextHeight + TIMELINE_BLOCK_GAP_PX,
    })
    measuredBlockHeightsRef.current = {
      ...measuredBlockHeightsRef.current,
      [normalizedId]: nextHeight,
    }
    setMeasuredBlockHeights((current) => (
      current[normalizedId] === nextHeight
        ? current
        : { ...current, [normalizedId]: nextHeight }
    ))
    if (!correction || typeof window === 'undefined') return
    if (anchorCorrectionFrameRef.current) window.cancelAnimationFrame(anchorCorrectionFrameRef.current)
    anchorCorrectionFrameRef.current = window.requestAnimationFrame(() => {
      anchorCorrectionFrameRef.current = 0
      const node = scrollContainerRef?.current
      if (!node) return
      node.scrollTop = Math.max(0, Number(node.scrollTop || 0) + correction)
      scheduleScrollMetricsSync()
    })
  }, [scheduleScrollMetricsSync, scrollContainerRef])

  React.useEffect(() => () => {
    if (anchorCorrectionFrameRef.current) {
      cancelAnimationFrame(anchorCorrectionFrameRef.current)
      anchorCorrectionFrameRef.current = 0
    }
  }, [])

  const wrapTimelineBlock = React.useCallback((blockKey, blockId, children) => (
    <TimelineMeasuredBlock key={blockKey} blockId={blockId} onMeasure={handleTimelineBlockMeasure}>
      {children}
    </TimelineMeasuredBlock>
  ), [handleTimelineBlockMeasure])
  const handleScroll = React.useCallback(() => {
    scheduleScrollMetricsSync()
  }, [scheduleScrollMetricsSync])
  const handleFocusCapture = React.useCallback((event) => {
    setInteractionPinnedBlockId(resolveInteractionBlockId(event.target))
  }, [resolveInteractionBlockId])
  const handleBlurCapture = React.useCallback((event) => {
    const nextFocusId = resolveInteractionBlockId(event.relatedTarget)
    const selectionId = resolveInteractionBlockId(window.getSelection?.()?.anchorNode)
    setInteractionPinnedBlockId(nextFocusId || selectionId || '')
  }, [resolveInteractionBlockId])

  return {
    blockLayout,
    renderedBlockEntries,
    virtualizationEnabled,
    virtualStartIndex,
    timelineBlocksContainerStyle: virtualRange
      ? {
          paddingTop: `${Math.max(0, Math.round(virtualRange.paddingTop))}px`,
          paddingBottom: `${Math.max(0, Math.round(virtualRange.paddingBottom))}px`,
        }
      : undefined,
    wrapTimelineBlock,
    scrollHandlers: {
      onScroll: handleScroll,
      onFocusCapture: handleFocusCapture,
      onBlurCapture: handleBlurCapture,
    },
  }
}
