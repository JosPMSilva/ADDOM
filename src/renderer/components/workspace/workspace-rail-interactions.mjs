import {
  clampWorkspaceRailWidth,
  resolveWorkspaceRailDragEnd,
  WORKSPACE_RAIL_DEFAULT_WIDTH,
  WORKSPACE_RAIL_MAX_WIDTH,
} from './workspace-rail-state.mjs'

export const WORKSPACE_RAIL_KEYBOARD_STEP = 16
export const WORKSPACE_RAIL_OPEN_CONTROL_ID = 'workspace-rail-open-control'

function previewWidth(value) {
  const width = Number(value)
  if (!Number.isFinite(width)) return WORKSPACE_RAIL_DEFAULT_WIDTH
  return Math.min(WORKSPACE_RAIL_MAX_WIDTH, Math.max(0, width))
}

export function resolveWorkspaceRailKeyboardCommand(key, width) {
  if (key === 'Escape') return { handled: true, open: false, width: clampWorkspaceRailWidth(width) }
  if (key === 'Home') return { handled: true, open: true, width: WORKSPACE_RAIL_DEFAULT_WIDTH }
  if (key === 'ArrowLeft') {
    return { handled: true, open: true, width: clampWorkspaceRailWidth(width - WORKSPACE_RAIL_KEYBOARD_STEP) }
  }
  if (key === 'ArrowRight') {
    return { handled: true, open: true, width: clampWorkspaceRailWidth(width + WORKSPACE_RAIL_KEYBOARD_STEP) }
  }
  return { handled: false, open: true, width: clampWorkspaceRailWidth(width) }
}

export function shouldCloseWorkspaceRailAfterTarget({ narrow, kind, result }) {
  if (!narrow) return false
  if (kind === 'select-thread') return Boolean(result)
  if (kind === 'create-thread') return Boolean(result)
  return false
}

export function startWorkspaceRailDragPresentation({ railElement, bodyElement }) {
  const previousCursor = bodyElement?.style.cursor || ''
  const previousUserSelect = bodyElement?.style.userSelect || ''
  const previousTransition = railElement?.style.transition || ''
  if (bodyElement) {
    bodyElement.style.cursor = 'col-resize'
    bodyElement.style.userSelect = 'none'
  }
  if (railElement) railElement.style.transition = 'none'
  return () => {
    if (bodyElement) {
      bodyElement.style.cursor = previousCursor
      bodyElement.style.userSelect = previousUserSelect
    }
    if (railElement) railElement.style.transition = previousTransition
  }
}

export function createWorkspaceRailDragSession({
  eventTarget,
  captureTarget,
  pointerId,
  startClientX,
  startWidth,
  uiScale = 1,
  onPreview,
  onCommit,
  onCancel,
  onCleanup,
}) {
  const scale = Number(uiScale) > 0 ? Number(uiScale) : 1
  let currentWidth = startWidth
  let active = true
  let captured = false

  const ownsPointer = (event) => pointerId === undefined || event?.pointerId === pointerId
  const cleanup = ({ releaseCapture = true, cancel = true } = {}) => {
    if (!active) return
    active = false
    eventTarget.removeEventListener('pointermove', handleMove)
    eventTarget.removeEventListener('pointerup', handleUp)
    eventTarget.removeEventListener('pointercancel', handleCancel)
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
    currentWidth = previewWidth(startWidth + (Number(event?.clientX || 0) - startClientX) / scale)
    onPreview(currentWidth)
  }
  function handleMove(event) {
    if (active && ownsPointer(event)) update(event)
  }
  function handleUp(event) {
    if (!active || !ownsPointer(event)) return
    update(event)
    const result = resolveWorkspaceRailDragEnd({
      candidateWidth: currentWidth,
      previousExpandedWidth: startWidth,
    })
    cleanup({ cancel: false })
    onCommit(result)
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
  eventTarget.addEventListener('pointermove', handleMove)
  eventTarget.addEventListener('pointerup', handleUp)
  eventTarget.addEventListener('pointercancel', handleCancel)
  captureTarget?.addEventListener?.('lostpointercapture', handleLostPointerCapture)
  return { cleanup }
}
