import React from 'react'

const DEFAULT_BLOCKS_VIEWPORT_HEIGHT = 224
const MIN_BLOCKS_VIEWPORT_HEIGHT = 112
const COMPOSER_BLOCKS_VIEWPORT_HEIGHT_KEY = 'addom.chatComposer.blocksViewportHeight'
const DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT = 115
const MIN_DRAFT_TEXTAREA_MAX_HEIGHT = 38
const MIN_PERSISTED_DRAFT_TEXTAREA_MAX_HEIGHT = DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT
const DRAFT_TEXTAREA_MAX_HEIGHT_STORAGE_KEY = 'addom.chatComposer.draftTextareaManualHeight'
const MIN_DRAFT_TEXTAREA_HEIGHT_PX = 38
const BLOCKS_VIEWPORT_BOTTOM_MARGIN_PX = 8
const DRAFT_SECTION_TOP_PADDING_WITH_BLOCKS_PX = 8
const MIN_COMPOSER_SHELL_MAX_HEIGHT = 160
const COMPOSER_SHELL_VIEWPORT_BOTTOM_GAP_PX = 12

function readStoredDimension(key, fallbackValue, minValue) {
  if (typeof window === 'undefined') return fallbackValue
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed >= minValue) {
      return Math.round(parsed)
    }
  } catch {
    // ignore localStorage errors
  }
  return fallbackValue
}

export default function useChatComposerResize({
  composerInputRef,
  normalizedBlocksLength,
  attachedImagesLength,
  agentMenuOpen,
  agentQuickActionsEnabled,
  isStreaming,
}) {
  const [blocksViewportHeight, setBlocksViewportHeight] = React.useState(() => (
    readStoredDimension(
      COMPOSER_BLOCKS_VIEWPORT_HEIGHT_KEY,
      DEFAULT_BLOCKS_VIEWPORT_HEIGHT,
      MIN_BLOCKS_VIEWPORT_HEIGHT,
    )
  ))
  const [draftTextareaMaxHeight, setDraftTextareaMaxHeight] = React.useState(() => (
    readStoredDimension(
      DRAFT_TEXTAREA_MAX_HEIGHT_STORAGE_KEY,
      DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT,
      MIN_PERSISTED_DRAFT_TEXTAREA_MAX_HEIGHT,
    )
  ))
  const [draftTextareaHeightOverride, setDraftTextareaHeightOverride] = React.useState(null)
  const [draftTextareaMaxHeightLimit, setDraftTextareaMaxHeightLimit] = React.useState(
    DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT,
  )
  const [composerShellMaxHeight, setComposerShellMaxHeight] = React.useState(null)
  const shellRef = React.useRef(null)
  const blocksViewportRef = React.useRef(null)
  const attachedPreviewRef = React.useRef(null)
  const draftMetaRowRef = React.useRef(null)
  const draftTextareaRef = React.useRef(null)
  const dragOverlayRef = React.useRef(null)
  const blocksViewportHeightRef = React.useRef(blocksViewportHeight)
  const draftTextareaMaxHeightRef = React.useRef(draftTextareaMaxHeight)
  const draftTextareaMaxHeightLimitRef = React.useRef(DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT)
  const draftTextareaHeightOverrideRef = React.useRef(null)
  const draftTextareaLimitRafRef = React.useRef(0)
  const resizeDragRef = React.useRef(null)
  const draftResizeDragRef = React.useRef(null)
  const handleComposerResizePointerMoveRef = React.useRef(null)
  const handleDraftResizePointerMoveRef = React.useRef(null)

  React.useEffect(() => {
    blocksViewportHeightRef.current = blocksViewportHeight
  }, [blocksViewportHeight])

  React.useEffect(() => {
    draftTextareaMaxHeightRef.current = draftTextareaMaxHeight
  }, [draftTextareaMaxHeight])

  React.useEffect(() => {
    draftTextareaMaxHeightLimitRef.current = draftTextareaMaxHeightLimit
  }, [draftTextareaMaxHeightLimit])

  React.useEffect(() => {
    const value = Number(draftTextareaHeightOverride)
    draftTextareaHeightOverrideRef.current = Number.isFinite(value) ? value : null
  }, [draftTextareaHeightOverride])

  const computeBlocksViewportMaxHeight = React.useCallback(() => {
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900
    return Math.max(MIN_BLOCKS_VIEWPORT_HEIGHT, Math.floor(viewportHeight * 0.5))
  }, [])

  const computeDraftTextareaMaxHeightLimit = React.useCallback(() => {
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900
    const viewportLimit = Math.max(MIN_DRAFT_TEXTAREA_MAX_HEIGHT, Math.floor(viewportHeight * 0.5))
    if (normalizedBlocksLength === 0) return viewportLimit

    const shellEl = shellRef.current
    const shellHeightBudget = composerShellMaxHeight && composerShellMaxHeight > 0
      ? composerShellMaxHeight
      : Math.floor(viewportHeight * 0.75)
    const shellStyle = (typeof window !== 'undefined' && shellEl)
      ? window.getComputedStyle(shellEl)
      : null
    const shellPaddingTop = shellStyle ? Number.parseFloat(shellStyle.paddingTop || '0') || 0 : 0
    const shellPaddingBottom = shellStyle ? Number.parseFloat(shellStyle.paddingBottom || '0') || 0 : 0
    const availableInnerHeight = Math.max(
      0,
      shellHeightBudget - shellPaddingTop - shellPaddingBottom,
    )
    const attachmentsHeight = attachedPreviewRef.current?.offsetHeight || 0
    const draftMetaHeight = draftMetaRowRef.current?.offsetHeight || 0
    const reservedForBlocks = MIN_BLOCKS_VIEWPORT_HEIGHT + BLOCKS_VIEWPORT_BOTTOM_MARGIN_PX
    const reservedBeforeTextarea = attachmentsHeight
      + draftMetaHeight
      + DRAFT_SECTION_TOP_PADDING_WITH_BLOCKS_PX
      + reservedForBlocks
    const shellLimited = Math.max(
      MIN_DRAFT_TEXTAREA_MAX_HEIGHT,
      Math.floor(availableInnerHeight - reservedBeforeTextarea),
    )
    return Math.max(
      MIN_DRAFT_TEXTAREA_MAX_HEIGHT,
      Math.min(viewportLimit, shellLimited),
    )
  }, [composerShellMaxHeight, normalizedBlocksLength])

  const syncDraftTextareaMaxHeightLimit = React.useCallback(() => {
    const nextLimit = computeDraftTextareaMaxHeightLimit()
    setDraftTextareaMaxHeightLimit((prev) => (prev === nextLimit ? prev : nextLimit))
  }, [computeDraftTextareaMaxHeightLimit])

  const scheduleDraftTextareaMaxHeightLimitSync = React.useCallback(() => {
    if (typeof window === 'undefined') {
      syncDraftTextareaMaxHeightLimit()
      return
    }
    if (draftTextareaLimitRafRef.current) return
    draftTextareaLimitRafRef.current = window.requestAnimationFrame(() => {
      draftTextareaLimitRafRef.current = 0
      syncDraftTextareaMaxHeightLimit()
    })
  }, [syncDraftTextareaMaxHeightLimit])

  const syncComposerShellMaxHeight = React.useCallback(() => {
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900
    const nextHeight = Math.floor(viewportHeight * 0.75)
    const clamped = Math.max(
      MIN_COMPOSER_SHELL_MAX_HEIGHT,
      nextHeight - COMPOSER_SHELL_VIEWPORT_BOTTOM_GAP_PX,
    )
    setComposerShellMaxHeight((prev) => (prev === clamped ? prev : clamped))
  }, [])

  const clampBlocksViewportHeight = React.useCallback((nextHeight) => {
    const value = Number(nextHeight)
    if (!Number.isFinite(value)) return DEFAULT_BLOCKS_VIEWPORT_HEIGHT
    const maxHeight = computeBlocksViewportMaxHeight()
    return Math.max(MIN_BLOCKS_VIEWPORT_HEIGHT, Math.min(maxHeight, Math.round(value)))
  }, [computeBlocksViewportMaxHeight])

  const clampDraftTextareaMaxHeight = React.useCallback((nextHeight) => {
    const value = Number(nextHeight)
    if (!Number.isFinite(value)) return DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT
    const maxHeight = draftTextareaMaxHeightLimitRef.current
    return Math.max(MIN_DRAFT_TEXTAREA_MAX_HEIGHT, Math.min(maxHeight, Math.round(value)))
  }, [])

  React.useEffect(() => {
    setBlocksViewportHeight((prev) => {
      const next = clampBlocksViewportHeight(prev)
      return next === prev ? prev : next
    })
  }, [clampBlocksViewportHeight, normalizedBlocksLength])

  React.useEffect(() => {
    syncComposerShellMaxHeight()
  }, [
    syncComposerShellMaxHeight,
    normalizedBlocksLength,
    attachedImagesLength,
    agentMenuOpen,
    agentQuickActionsEnabled,
    isStreaming,
  ])

  React.useEffect(() => {
    scheduleDraftTextareaMaxHeightLimitSync()
  }, [
    scheduleDraftTextareaMaxHeightLimitSync,
    normalizedBlocksLength,
    attachedImagesLength,
    agentMenuOpen,
    agentQuickActionsEnabled,
    isStreaming,
    composerShellMaxHeight,
  ])

  React.useEffect(() => {
    setDraftTextareaMaxHeight((prev) => {
      const next = clampDraftTextareaMaxHeight(prev)
      return next === prev ? prev : next
    })
    setDraftTextareaHeightOverride((prev) => {
      const value = Number(prev)
      if (!Number.isFinite(value)) return prev
      const next = clampDraftTextareaMaxHeight(value)
      return next === value ? prev : next
    })
  }, [draftTextareaMaxHeightLimit, clampDraftTextareaMaxHeight])

  React.useEffect(() => {
    try {
      window.localStorage.setItem(COMPOSER_BLOCKS_VIEWPORT_HEIGHT_KEY, String(blocksViewportHeight))
    } catch {
      // ignore localStorage errors
    }
  }, [blocksViewportHeight])

  React.useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_TEXTAREA_MAX_HEIGHT_STORAGE_KEY, String(draftTextareaMaxHeight))
    } catch {
      // ignore localStorage errors
    }
  }, [draftTextareaMaxHeight])

  const handleComposerResizePointerMove = React.useCallback((event) => {
    const drag = resizeDragRef.current
    if (!drag) return
    const delta = drag.startY - Number(event.clientY || 0)
    const nextHeight = clampBlocksViewportHeight(drag.startHeight + delta)
    setBlocksViewportHeight(nextHeight)
  }, [clampBlocksViewportHeight])

  const handleDraftResizePointerMove = React.useCallback((event) => {
    const drag = draftResizeDragRef.current
    if (!drag) return
    const pointerY = Number(event.clientY || 0)
    if (!Number.isFinite(pointerY)) return
    const delta = drag.startY - pointerY
    const nextHeight = clampDraftTextareaMaxHeight(drag.startHeight + delta)
    setDraftTextareaHeightOverride((prev) => (prev === nextHeight ? prev : nextHeight))
  }, [clampDraftTextareaMaxHeight])

  React.useEffect(() => {
    handleComposerResizePointerMoveRef.current = handleComposerResizePointerMove
  }, [handleComposerResizePointerMove])

  React.useEffect(() => {
    handleDraftResizePointerMoveRef.current = handleDraftResizePointerMove
  }, [handleDraftResizePointerMove])

  const mountGlobalResizeOverlay = React.useCallback(() => {
    if (typeof document === 'undefined') return
    if (dragOverlayRef.current?.isConnected) return
    const overlay = document.createElement('div')
    overlay.setAttribute('data-ui', 'chat-composer-global-resize-overlay')
    overlay.setAttribute('aria-hidden', 'true')
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.zIndex = '2147483647'
    overlay.style.cursor = 'ns-resize'
    overlay.style.pointerEvents = 'auto'
    overlay.style.background = 'transparent'
    overlay.style.touchAction = 'none'
    document.body.appendChild(overlay)
    dragOverlayRef.current = overlay
  }, [])

  const unmountGlobalResizeOverlay = React.useCallback(() => {
    const overlay = dragOverlayRef.current
    if (!overlay) return
    try {
      overlay.remove()
    } catch {
      // ignore DOM cleanup failures
    }
    dragOverlayRef.current = null
  }, [])

  const endComposerResizeDrag = React.useCallback(() => {
    const drag = resizeDragRef.current
    const handler = handleComposerResizePointerMoveRef.current
    if (typeof window !== 'undefined' && handler) {
      window.removeEventListener('pointermove', handler)
      window.removeEventListener('pointerup', endComposerResizeDrag)
      window.removeEventListener('pointercancel', endComposerResizeDrag)
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    try {
      drag?.handleElement?.releasePointerCapture?.(drag.pointerId)
    } catch {
      // ignore pointer capture release failures
    }
    unmountGlobalResizeOverlay()
    resizeDragRef.current = null
  }, [unmountGlobalResizeOverlay])

  const endDraftResizeDrag = React.useCallback(() => {
    const drag = draftResizeDragRef.current
    const wasDragging = !!drag
    const handler = handleDraftResizePointerMoveRef.current
    if (typeof window !== 'undefined' && handler) {
      window.removeEventListener('pointermove', handler)
      window.removeEventListener('pointerup', endDraftResizeDrag)
      window.removeEventListener('pointercancel', endDraftResizeDrag)
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    try {
      drag?.handleElement?.releasePointerCapture?.(drag.pointerId)
    } catch {
      // ignore pointer capture release failures
    }
    unmountGlobalResizeOverlay()
    draftResizeDragRef.current = null
    if (!wasDragging) return
    const overrideHeight = Number(draftTextareaHeightOverrideRef.current)
    if (!Number.isFinite(overrideHeight)) return
    const committedHeight = Math.max(
      DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT,
      clampDraftTextareaMaxHeight(overrideHeight),
    )
    setDraftTextareaMaxHeight((prev) => (prev === committedHeight ? prev : committedHeight))
  }, [clampDraftTextareaMaxHeight, unmountGlobalResizeOverlay])

  React.useEffect(() => () => {
    endComposerResizeDrag()
  }, [endComposerResizeDrag])

  React.useEffect(() => () => {
    endDraftResizeDrag()
  }, [endDraftResizeDrag])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onWindowResize = () => {
      syncComposerShellMaxHeight()
      scheduleDraftTextareaMaxHeightLimitSync()
      setBlocksViewportHeight((prev) => clampBlocksViewportHeight(prev))
      setDraftTextareaHeightOverride((prev) => {
        const value = Number(prev)
        if (!Number.isFinite(value)) return prev
        const next = clampDraftTextareaMaxHeight(value)
        return next === value ? prev : next
      })
    }
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [
    clampBlocksViewportHeight,
    clampDraftTextareaMaxHeight,
    scheduleDraftTextareaMaxHeightLimitSync,
    syncComposerShellMaxHeight,
  ])

  const handleComposerResizePointerDown = React.useCallback((event) => {
    if (normalizedBlocksLength === 0) return
    event.preventDefault()
    event.stopPropagation()
    resizeDragRef.current = {
      startY: Number(event.clientY || 0),
      startHeight: blocksViewportHeightRef.current,
      handleElement: event.currentTarget || null,
      pointerId: Number(event.pointerId),
    }
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId)
    } catch {
      // ignore pointer capture failures
    }
    mountGlobalResizeOverlay()
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ns-resize'
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', handleComposerResizePointerMoveRef.current)
      window.addEventListener('pointerup', endComposerResizeDrag)
      window.addEventListener('pointercancel', endComposerResizeDrag)
    }
  }, [endComposerResizeDrag, mountGlobalResizeOverlay, normalizedBlocksLength])

  const handleDraftResizePointerDown = React.useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    const currentDraftHeight = Number(draftTextareaRef.current?.clientHeight || 0)
    const startY = Number(event.clientY || 0)
    const resolvedStartHeight = currentDraftHeight > 0
      ? currentDraftHeight
      : (draftTextareaHeightOverrideRef.current ?? draftTextareaMaxHeightRef.current)
    const startHeight = Math.max(DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT, resolvedStartHeight)
    draftResizeDragRef.current = {
      startY,
      startHeight,
      handleElement: event.currentTarget || null,
      pointerId: Number(event.pointerId),
    }
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId)
    } catch {
      // ignore pointer capture failures
    }
    mountGlobalResizeOverlay()
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ns-resize'
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', handleDraftResizePointerMoveRef.current)
      window.addEventListener('pointerup', endDraftResizeDrag)
      window.addEventListener('pointercancel', endDraftResizeDrag)
    }
  }, [endDraftResizeDrag, mountGlobalResizeOverlay])

  const setPrimaryComposerRef = React.useCallback((node) => {
    draftTextareaRef.current = node || null
    if (!composerInputRef || typeof composerInputRef !== 'object') return
    composerInputRef.current = node || null
  }, [composerInputRef])

  React.useEffect(() => () => {
    if (typeof window !== 'undefined' && draftTextareaLimitRafRef.current) {
      window.cancelAnimationFrame(draftTextareaLimitRafRef.current)
      draftTextareaLimitRafRef.current = 0
    }
  }, [])

  const resolvedDraftTextareaHeightOverride = Number(draftTextareaHeightOverride)
  const hasManualDraftTextareaExpansion = Number.isFinite(resolvedDraftTextareaHeightOverride)
    && resolvedDraftTextareaHeightOverride > DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT
  const activeDraftTextareaMaxHeight = clampDraftTextareaMaxHeight(
    hasManualDraftTextareaExpansion
      ? resolvedDraftTextareaHeightOverride
      : draftTextareaMaxHeight,
  )
  const explicitDraftTextareaHeight = hasManualDraftTextareaExpansion
    ? activeDraftTextareaMaxHeight
    : null

  return {
    activeDraftTextareaMaxHeight,
    attachedPreviewRef,
    blocksViewportHeight,
    blocksViewportRef,
    clampBlocksViewportHeight,
    composerShellMaxHeight,
    draftMetaRowRef,
    handleComposerResizePointerDown,
    handleDraftResizePointerDown,
    explicitDraftTextareaHeight,
    minBlocksViewportHeight: MIN_BLOCKS_VIEWPORT_HEIGHT,
    minDraftTextareaHeightPx: MIN_DRAFT_TEXTAREA_HEIGHT_PX,
    setPrimaryComposerRef,
    shellRef,
  }
}
