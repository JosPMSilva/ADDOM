export const MIN_PLAN_REVIEW_COMPOSER_HEIGHT = 48
export const MAX_PLAN_REVIEW_COMPOSER_HEIGHT = 112

export function clampPlanReviewComposerHeight(value) {
  const height = Math.round(Number(value))
  if (!Number.isFinite(height)) return MIN_PLAN_REVIEW_COMPOSER_HEIGHT
  return Math.min(MAX_PLAN_REVIEW_COMPOSER_HEIGHT, Math.max(MIN_PLAN_REVIEW_COMPOSER_HEIGHT, height))
}

export function startPlanReviewComposerDragPresentation({ rowElement, bodyElement } = {}) {
  const previousCursor = bodyElement?.style?.cursor || ''
  const previousUserSelect = bodyElement?.style?.userSelect || ''
  const previousTransition = rowElement?.style?.transition || ''
  if (bodyElement?.style) {
    bodyElement.style.cursor = 'row-resize'
    bodyElement.style.userSelect = 'none'
  }
  if (rowElement?.style) rowElement.style.transition = 'none'
  return () => {
    if (bodyElement?.style) {
      bodyElement.style.cursor = previousCursor
      bodyElement.style.userSelect = previousUserSelect
    }
    if (rowElement?.style) rowElement.style.transition = previousTransition
  }
}

export function createPlanReviewComposerDragSession({
  eventTarget,
  captureTarget,
  pointerId,
  startClientY,
  startHeight,
  onPreview,
  onCommit,
  onCancel,
  onCleanup,
} = {}) {
  let currentHeight = clampPlanReviewComposerHeight(startHeight)
  let active = true
  let captured = false
  const ownsPointer = (event) => pointerId === undefined || event?.pointerId === pointerId
  const cleanup = ({ releaseCapture = true, cancel = true } = {}) => {
    if (!active) return
    active = false
    eventTarget?.removeEventListener?.('pointermove', handleMove)
    eventTarget?.removeEventListener?.('pointerup', handleUp)
    eventTarget?.removeEventListener?.('pointercancel', handleCancel)
    captureTarget?.removeEventListener?.('lostpointercapture', handleLostPointerCapture)
    if (releaseCapture && captured) {
      try {
        captureTarget?.releasePointerCapture?.(pointerId)
      } catch {
        captured = false
      }
    }
    onCleanup?.()
    if (cancel) onCancel?.()
  }
  const update = (event) => {
    const clientY = Number(event?.clientY)
    if (!Number.isFinite(clientY)) return
    currentHeight = clampPlanReviewComposerHeight(Number(startHeight) + clientY - Number(startClientY))
    onPreview?.(currentHeight)
  }
  function handleMove(event) {
    if (active && ownsPointer(event)) update(event)
  }
  function handleUp(event) {
    if (!active || !ownsPointer(event)) return
    update(event)
    cleanup({ cancel: false })
    onCommit?.(currentHeight)
  }
  function handleCancel(event) {
    if (!ownsPointer(event)) return
    cleanup()
  }
  function handleLostPointerCapture(event) {
    if (!ownsPointer(event)) return
    cleanup({ releaseCapture: false })
  }

  if (captureTarget?.setPointerCapture && pointerId !== undefined) {
    try {
      captureTarget.setPointerCapture(pointerId)
      captured = true
    } catch {
      captured = false
    }
  }
  eventTarget?.addEventListener?.('pointermove', handleMove)
  eventTarget?.addEventListener?.('pointerup', handleUp)
  eventTarget?.addEventListener?.('pointercancel', handleCancel)
  captureTarget?.addEventListener?.('lostpointercapture', handleLostPointerCapture)
  return { cleanup }
}
