import { useCallback, useEffect, useRef } from 'react'
import {
  clampFileTreeWidth,
  clampMarkdownPreviewRatio,
  writeFileTreeWidth,
  writeMarkdownPreviewRatio,
} from './editor-panel-state-helpers.mjs'

export function useEditorPanelResizers({
  previewSplitRatio,
  setPreviewSplitRatio,
  fileTreeWidth,
  setFileTreeWidth,
}) {
  const previewSplitHostRef = useRef(null)
  const previewSplitDragRef = useRef(null)
  const handlePreviewSplitPointerMoveRef = useRef(null)
  const fileTreeContainerRef = useRef(null)
  const treeDragRef = useRef(null)
  const handleTreeDragPointerMoveRef = useRef(null)

  const handlePreviewSplitPointerMove = useCallback((event) => {
    const drag = previewSplitDragRef.current
    if (!drag) return
    const deltaX = Number(event.clientX || 0) - drag.startX
    const nextRatio = clampMarkdownPreviewRatio((drag.startRatio * drag.startWidth + deltaX) / drag.startWidth)
    drag.currentRatio = nextRatio
    setPreviewSplitRatio(nextRatio)
  }, [setPreviewSplitRatio])
  handlePreviewSplitPointerMoveRef.current = handlePreviewSplitPointerMove

  const endPreviewSplitDrag = useCallback(() => {
    const moveHandler = handlePreviewSplitPointerMoveRef.current
    if (moveHandler) {
      window.removeEventListener('pointermove', moveHandler)
    }
    window.removeEventListener('pointerup', endPreviewSplitDrag)
    window.removeEventListener('pointercancel', endPreviewSplitDrag)
    const drag = previewSplitDragRef.current
    previewSplitDragRef.current = null
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    if (drag?.currentRatio !== undefined) {
      writeMarkdownPreviewRatio(drag.currentRatio)
    }
  }, [])

  useEffect(() => () => {
    endPreviewSplitDrag()
  }, [endPreviewSplitDrag])

  const handlePreviewSplitPointerDown = useCallback((event) => {
    const host = previewSplitHostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    if (!bounds.width || bounds.width < 280) return
    previewSplitDragRef.current = {
      startX: Number(event.clientX || 0),
      startRatio: previewSplitRatio,
      startWidth: bounds.width,
      currentRatio: previewSplitRatio,
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
    if (handlePreviewSplitPointerMoveRef.current) {
      window.addEventListener('pointermove', handlePreviewSplitPointerMoveRef.current)
      window.addEventListener('pointerup', endPreviewSplitDrag)
      window.addEventListener('pointercancel', endPreviewSplitDrag)
    }
  }, [endPreviewSplitDrag, previewSplitRatio])

  const handleTreeDragPointerMove = useCallback((event) => {
    const drag = treeDragRef.current
    if (!drag) return
    const deltaX = Number(event.clientX || 0) - drag.startX
    const nextWidth = clampFileTreeWidth(drag.startWidth + deltaX)
    drag.currentWidth = nextWidth

    if (fileTreeContainerRef.current) {
      fileTreeContainerRef.current.style.width = `${nextWidth}px`
    }
  }, [])
  handleTreeDragPointerMoveRef.current = handleTreeDragPointerMove

  const endTreeDrag = useCallback(() => {
    const moveHandler = handleTreeDragPointerMoveRef.current
    if (moveHandler) {
      window.removeEventListener('pointermove', moveHandler)
    }
    window.removeEventListener('pointerup', endTreeDrag)
    window.removeEventListener('pointercancel', endTreeDrag)

    const drag = treeDragRef.current
    treeDragRef.current = null

    if (typeof document !== 'undefined' && document.body) {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    if (drag?.currentWidth !== undefined) {
      setFileTreeWidth(drag.currentWidth)
      writeFileTreeWidth(drag.currentWidth)
    }
  }, [setFileTreeWidth])

  useEffect(() => () => {
    endTreeDrag()
  }, [endTreeDrag])

  const handleTreePointerDown = useCallback((event) => {
    treeDragRef.current = {
      startX: Number(event.clientX || 0),
      startWidth: fileTreeWidth,
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
    if (handleTreeDragPointerMoveRef.current) {
      window.addEventListener('pointermove', handleTreeDragPointerMoveRef.current)
      window.addEventListener('pointerup', endTreeDrag)
      window.addEventListener('pointercancel', endTreeDrag)
    }
  }, [endTreeDrag, fileTreeWidth])

  return {
    previewSplitHostRef,
    fileTreeContainerRef,
    handlePreviewSplitPointerDown,
    handleTreePointerDown,
  }
}
