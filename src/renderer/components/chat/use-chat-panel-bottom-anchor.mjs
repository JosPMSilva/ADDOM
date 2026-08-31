import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CHAT_TIMELINE_NEAR_BOTTOM_THRESHOLD_PX = 40
const CHAT_TIMELINE_UPWARD_INTENT_PX = 8

export function resolveTimelineFollowState({
  previousScrollTop = 0,
  currentScrollTop = 0,
  distanceToBottom = Number.POSITIVE_INFINITY,
  thresholdPx = CHAT_TIMELINE_NEAR_BOTTOM_THRESHOLD_PX,
  upwardIntentPx = CHAT_TIMELINE_UPWARD_INTENT_PX,
} = {}) {
  const movedUp = Number(currentScrollTop || 0) < (
    Number(previousScrollTop || 0) - Number(upwardIntentPx || 0)
  )
  if (movedUp && Number(distanceToBottom || 0) > 0) {
    return {
      nearBottom: false,
      showJumpToLatest: true,
    }
  }
  const nearBottom = Number(distanceToBottom || 0) <= Number(thresholdPx || 0)
  return {
    nearBottom,
    showJumpToLatest: !nearBottom,
  }
}

export function resolveTimelineViewportResizeFollowAction({
  wasNearBottom = false,
  previousClientHeight = 0,
  nextClientHeight = 0,
} = {}) {
  const previousHeight = Math.max(0, Number(previousClientHeight || 0))
  const nextHeight = Math.max(0, Number(nextClientHeight || 0))
  return {
    shouldScroll: !!wasNearBottom
      && previousHeight > 0
      && nextHeight > 0
      && previousHeight !== nextHeight,
  }
}

export function resolveTimelineGrowthFollowAction({
  wasNearBottom = false,
  previousScrollHeight = 0,
  nextScrollHeight = 0,
  distanceToBottom = Number.POSITIVE_INFINITY,
  thresholdPx = CHAT_TIMELINE_NEAR_BOTTOM_THRESHOLD_PX,
} = {}) {
  const normalizedDistance = Number(distanceToBottom || 0)
  const nearBottom = !!wasNearBottom || normalizedDistance <= Number(thresholdPx || 0)
  const grew = Number(nextScrollHeight || 0) > Number(previousScrollHeight || 0)
  return {
    shouldScroll: grew && nearBottom,
    nearBottom,
    showJumpToLatest: !nearBottom,
  }
}

export function buildTimelineAutoScrollSignal({
  timeline = [],
  messages = [],
  streamingId = '',
} = {}) {
  const normalizedTimeline = Array.isArray(timeline) ? timeline : []
  const normalizedMessages = Array.isArray(messages) ? messages : []
  const lastTimelineEntry = normalizedTimeline.length > 0 ? normalizedTimeline[normalizedTimeline.length - 1] : null
  const normalizedStreamingId = String(streamingId || '').trim()
  const streamingMessage = normalizedStreamingId
    ? normalizedMessages.find((message) => String(message?.id || '').trim() === normalizedStreamingId) || null
    : null
  return [
    normalizedTimeline.length,
    String(lastTimelineEntry?.id || ''),
    String(lastTimelineEntry?.kind || ''),
    normalizedMessages.length,
    normalizedStreamingId,
    String(streamingMessage?.status || ''),
    Number(String(streamingMessage?.content || '').length || 0),
    Number(String(streamingMessage?.reasoning || '').length || 0),
  ].join('|')
}

export function useChatPanelBottomAnchor({
  activeThreadId,
  timeline,
  messages,
  streamingId,
  timelineScrollRef,
}) {
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const timelineAutoScrollRafRef = useRef(0)
  const timelineContentAutoScrollRafRef = useRef(0)
  const timelineViewportResizeRafRef = useRef(0)
  const timelineViewportSettleRafRef = useRef(0)
  const timelineViewportFollowPendingRef = useRef(false)
  const timelineClientHeightRef = useRef(0)
  const timelineScrollHeightRef = useRef(0)
  const timelineNearBottomRef = useRef(true)
  const timelineWasStreamingRef = useRef(!!streamingId)
  const lastThreadIdRef = useRef(activeThreadId)
  const lastObservedScrollTopRef = useRef(0)
  const showJumpToLatestRef = useRef(false)

  useEffect(() => {
    showJumpToLatestRef.current = showJumpToLatest
  }, [showJumpToLatest])

  const syncShowJumpToLatest = useCallback((nextValue) => {
    const normalized = !!nextValue
    if (showJumpToLatestRef.current === normalized) return
    showJumpToLatestRef.current = normalized
    setShowJumpToLatest(normalized)
  }, [])

  const getTimelineDistanceToBottom = useCallback((node) => {
    if (!node) return Number.POSITIVE_INFINITY
    return Math.max(0, Math.ceil(node.scrollHeight - node.clientHeight - node.scrollTop))
  }, [])

  const syncTimelineFollowStateFromNode = useCallback((timelineNode) => {
    const isNearBottom = getTimelineDistanceToBottom(timelineNode) <= CHAT_TIMELINE_NEAR_BOTTOM_THRESHOLD_PX
    timelineNearBottomRef.current = isNearBottom
    syncShowJumpToLatest(!isNearBottom)
    return isNearBottom
  }, [getTimelineDistanceToBottom, syncShowJumpToLatest])

  useEffect(() => {
    const timelineNode = timelineScrollRef.current
    if (!timelineNode) return undefined

    const updateNearBottom = () => {
      const currentScrollTop = Math.max(0, Number(timelineNode.scrollTop || 0))
      const distanceToBottom = getTimelineDistanceToBottom(timelineNode)
      const movedUp = currentScrollTop < (
        lastObservedScrollTopRef.current - CHAT_TIMELINE_UPWARD_INTENT_PX
      )
      if (timelineViewportFollowPendingRef.current && !movedUp) {
        lastObservedScrollTopRef.current = currentScrollTop
        return
      }
      if (movedUp) {
        timelineViewportFollowPendingRef.current = false
        if (timelineViewportSettleRafRef.current) {
          window.cancelAnimationFrame(timelineViewportSettleRafRef.current)
          timelineViewportSettleRafRef.current = 0
        }
      }
      const { nearBottom, showJumpToLatest: nextShowJumpToLatest } = resolveTimelineFollowState({
        previousScrollTop: lastObservedScrollTopRef.current,
        currentScrollTop,
        distanceToBottom,
      })
      if (movedUp && timelineAutoScrollRafRef.current) {
        window.cancelAnimationFrame(timelineAutoScrollRafRef.current)
        timelineAutoScrollRafRef.current = 0
      }
      const didChange = (
        timelineNearBottomRef.current !== nearBottom
        || showJumpToLatestRef.current !== nextShowJumpToLatest
      )
      timelineNearBottomRef.current = nearBottom
      lastObservedScrollTopRef.current = currentScrollTop
      if (didChange) {
        syncShowJumpToLatest(nextShowJumpToLatest)
      }
    }

    lastObservedScrollTopRef.current = Math.max(0, Number(timelineNode.scrollTop || 0))
    updateNearBottom()
    timelineNode.addEventListener('scroll', updateNearBottom, { passive: true })
    return () => {
      timelineNode.removeEventListener('scroll', updateNearBottom)
    }
  }, [activeThreadId, getTimelineDistanceToBottom, syncShowJumpToLatest, timelineScrollRef])

  const handleJumpToLatest = useCallback((forceInstant = false) => {
    const timelineNode = timelineScrollRef.current
    if (!timelineNode) return

    let isDistant = false
    const shouldForceInstant = forceInstant === true

    if (!shouldForceInstant) {
      const distance = getTimelineDistanceToBottom(timelineNode)
      // 2500px roughly equals 3-4 average length messages.
      // If we are further than this, smooth scrolling takes too long and thrashes rendering.
      if (distance > 2500) {
        isDistant = true
      }
    }

    timelineNode.scrollTo({
      top: timelineNode.scrollHeight,
      behavior: shouldForceInstant || isDistant ? 'auto' : 'smooth',
    })
    lastObservedScrollTopRef.current = Math.max(0, Number(timelineNode.scrollHeight || 0))
    timelineNearBottomRef.current = true
    syncShowJumpToLatest(false)
  }, [timelineScrollRef, getTimelineDistanceToBottom, syncShowJumpToLatest])

  const autoScrollSignal = useMemo(() => buildTimelineAutoScrollSignal({
    timeline,
    messages,
    streamingId,
  }), [
    timeline,
    messages,
    streamingId,
  ])

  useEffect(() => {
    if (activeThreadId !== lastThreadIdRef.current) {
      lastThreadIdRef.current = activeThreadId
      requestAnimationFrame(() => handleJumpToLatest(true))
    }
  }, [activeThreadId, handleJumpToLatest])

  useEffect(() => {
    const timelineNode = timelineScrollRef.current
    if (!timelineNode) return undefined

    const isStreamingNow = !!streamingId
    const streamingJustFinished = timelineWasStreamingRef.current && !isStreamingNow
    timelineWasStreamingRef.current = isStreamingNow
    if (!timelineNearBottomRef.current) return undefined

    if (timelineAutoScrollRafRef.current) {
      window.cancelAnimationFrame(timelineAutoScrollRafRef.current)
      timelineAutoScrollRafRef.current = 0
    }

    timelineAutoScrollRafRef.current = window.requestAnimationFrame(() => {
      timelineAutoScrollRafRef.current = 0
      if (getTimelineDistanceToBottom(timelineNode) > 1 || streamingJustFinished) {
        timelineNode.scrollTo({
          top: timelineNode.scrollHeight,
          behavior: streamingJustFinished ? 'smooth' : 'auto',
        })
      }
      lastObservedScrollTopRef.current = Math.max(0, Number(timelineNode.scrollTop || timelineNode.scrollHeight || 0))
      syncTimelineFollowStateFromNode(timelineNode)
    })

    return () => {
      if (timelineAutoScrollRafRef.current) {
        window.cancelAnimationFrame(timelineAutoScrollRafRef.current)
        timelineAutoScrollRafRef.current = 0
      }
    }
  }, [
    autoScrollSignal,
    getTimelineDistanceToBottom,
    streamingId,
    syncTimelineFollowStateFromNode,
    timelineScrollRef,
  ])

  useEffect(() => {
    const timelineNode = timelineScrollRef.current
    if (!timelineNode || typeof window === 'undefined') return undefined

    let disposed = false
    let resizeObserver = null
    let mutationObserver = null
    const observedChildren = new Set()
    const readScrollHeight = () => Math.max(0, Math.ceil(Number(timelineNode.scrollHeight) || 0))

    const observeDirectChildren = () => {
      if (!resizeObserver) return
      const nextChildren = new Set(Array.from(timelineNode.children || []))
      for (const child of observedChildren) {
        if (!nextChildren.has(child)) {
          resizeObserver.unobserve(child)
          observedChildren.delete(child)
        }
      }
      for (const child of nextChildren) {
        if (!observedChildren.has(child)) {
          resizeObserver.observe(child)
          observedChildren.add(child)
        }
      }
    }

    const scheduleContentFollow = () => {
      if (disposed || timelineContentAutoScrollRafRef.current) return
      timelineContentAutoScrollRafRef.current = window.requestAnimationFrame(() => {
        timelineContentAutoScrollRafRef.current = 0
        if (disposed) return

        const previousScrollHeight = timelineScrollHeightRef.current
        const nextScrollHeight = readScrollHeight()
        timelineScrollHeightRef.current = nextScrollHeight

        const action = resolveTimelineGrowthFollowAction({
          wasNearBottom: timelineNearBottomRef.current,
          previousScrollHeight,
          nextScrollHeight,
          distanceToBottom: getTimelineDistanceToBottom(timelineNode),
        })

        timelineNearBottomRef.current = action.nearBottom
        syncShowJumpToLatest(action.showJumpToLatest)

        if (!action.shouldScroll) return

        timelineNode.scrollTo({ top: timelineNode.scrollHeight, behavior: 'auto' })
        lastObservedScrollTopRef.current = Math.max(0, Number(timelineNode.scrollTop || timelineNode.scrollHeight || 0))
        syncTimelineFollowStateFromNode(timelineNode)
      })
    }

    timelineScrollHeightRef.current = readScrollHeight()

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => scheduleContentFollow())
      observeDirectChildren()
    }

    if (typeof MutationObserver === 'function') {
      mutationObserver = new MutationObserver(() => {
        observeDirectChildren()
        scheduleContentFollow()
      })
      mutationObserver.observe(timelineNode, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    }

    return () => {
      disposed = true
      if (timelineContentAutoScrollRafRef.current) {
        window.cancelAnimationFrame(timelineContentAutoScrollRafRef.current)
        timelineContentAutoScrollRafRef.current = 0
      }
      if (mutationObserver) mutationObserver.disconnect()
      if (resizeObserver) resizeObserver.disconnect()
      observedChildren.clear()
    }
  }, [
    activeThreadId,
    getTimelineDistanceToBottom,
    syncShowJumpToLatest,
    syncTimelineFollowStateFromNode,
    timelineScrollRef,
  ])

  useEffect(() => {
    const timelineNode = timelineScrollRef.current
    if (!timelineNode || typeof window === 'undefined') return undefined

    let disposed = false
    const readClientHeight = () => Math.max(0, Math.ceil(Number(timelineNode.clientHeight) || 0))

    const applyViewportResize = () => {
      const previousClientHeight = timelineClientHeightRef.current
      const nextClientHeight = readClientHeight()
      timelineClientHeightRef.current = nextClientHeight
      const action = resolveTimelineViewportResizeFollowAction({
        wasNearBottom: timelineNearBottomRef.current || timelineViewportFollowPendingRef.current,
        previousClientHeight,
        nextClientHeight,
      })
      if (!action.shouldScroll || getTimelineDistanceToBottom(timelineNode) <= 1) return

      timelineViewportFollowPendingRef.current = true
      timelineNode.scrollTo({ top: timelineNode.scrollHeight, behavior: 'auto' })
      lastObservedScrollTopRef.current = Math.max(0, Number(timelineNode.scrollTop || 0))
      if (timelineViewportSettleRafRef.current) {
        window.cancelAnimationFrame(timelineViewportSettleRafRef.current)
      }
      timelineViewportSettleRafRef.current = window.requestAnimationFrame(() => {
        timelineViewportSettleRafRef.current = window.requestAnimationFrame(() => {
          timelineViewportSettleRafRef.current = 0
          if (disposed || !timelineViewportFollowPendingRef.current) return
          timelineNode.scrollTo({ top: timelineNode.scrollHeight, behavior: 'auto' })
          lastObservedScrollTopRef.current = Math.max(0, Number(timelineNode.scrollTop || 0))
          timelineViewportFollowPendingRef.current = false
          syncTimelineFollowStateFromNode(timelineNode)
        })
      })
    }

    const scheduleViewportResize = () => {
      if (disposed || timelineViewportResizeRafRef.current) return
      timelineViewportResizeRafRef.current = window.requestAnimationFrame(() => {
        timelineViewportResizeRafRef.current = 0
        if (!disposed) applyViewportResize()
      })
    }

    timelineClientHeightRef.current = readClientHeight()
    window.addEventListener('resize', scheduleViewportResize)

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        disposed = true
        window.removeEventListener('resize', scheduleViewportResize)
        if (timelineViewportResizeRafRef.current) {
          window.cancelAnimationFrame(timelineViewportResizeRafRef.current)
          timelineViewportResizeRafRef.current = 0
        }
        if (timelineViewportSettleRafRef.current) {
          window.cancelAnimationFrame(timelineViewportSettleRafRef.current)
          timelineViewportSettleRafRef.current = 0
        }
        timelineViewportFollowPendingRef.current = false
      }
    }

    const observer = new ResizeObserver(() => scheduleViewportResize())
    observer.observe(timelineNode)
    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('resize', scheduleViewportResize)
      if (timelineViewportResizeRafRef.current) {
        window.cancelAnimationFrame(timelineViewportResizeRafRef.current)
        timelineViewportResizeRafRef.current = 0
      }
      if (timelineViewportSettleRafRef.current) {
        window.cancelAnimationFrame(timelineViewportSettleRafRef.current)
        timelineViewportSettleRafRef.current = 0
      }
      timelineViewportFollowPendingRef.current = false
    }
  }, [
    activeThreadId,
    getTimelineDistanceToBottom,
    syncTimelineFollowStateFromNode,
    timelineScrollRef,
  ])

  return {
    showJumpToLatest,
    handleJumpToLatest,
  }
}
