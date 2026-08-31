import { clampChatCompanionWidth } from './chat-companion-state.mjs'

export function startChatCompanionDragPresentation({
  shellElement,
  bodyElement,
} = {}) {
  const previousCursor = bodyElement?.style?.cursor || ''
  const previousUserSelect = bodyElement?.style?.userSelect || ''
  const previousTransition = shellElement?.style?.transition || ''
  if (bodyElement?.style) {
    bodyElement.style.cursor = 'col-resize'
    bodyElement.style.userSelect = 'none'
  }
  if (shellElement?.style) shellElement.style.transition = 'none'
  return () => {
    if (bodyElement?.style) {
      bodyElement.style.cursor = previousCursor
      bodyElement.style.userSelect = previousUserSelect
    }
    if (shellElement?.style) shellElement.style.transition = previousTransition
  }
}

export function createChatCompanionDragSession({
  eventTarget,
  captureTarget,
  pointerId,
  startClientX,
  startWidth,
  viewportWidth,
  layout,
  onPreview,
  onCommit,
  onCancel,
  onCleanup,
} = {}) {
  let currentWidth = clampChatCompanionWidth(startWidth, viewportWidth, layout)
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
    const clientX = Number(event?.clientX)
    if (!Number.isFinite(clientX)) return
    currentWidth = clampChatCompanionWidth(
      Number(startWidth) + Number(startClientX) - clientX,
      viewportWidth,
      layout,
    )
    onPreview?.(currentWidth)
  }
  function handleMove(event) {
    if (active && ownsPointer(event)) update(event)
  }
  function handleUp(event) {
    if (!active || !ownsPointer(event)) return
    update(event)
    cleanup({ cancel: false })
    onCommit?.(currentWidth)
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
