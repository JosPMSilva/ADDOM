const OVERVIEW_RULER_PATCHED = Symbol('addomOverviewRulerPatched')

function fillOverviewCanvasBackground(part, canvasCtx, canvasWidth, canvasHeight) {
  const backgroundColor = part._settings.backgroundColor
  if (backgroundColor) {
    canvasCtx.fillStyle = backgroundColor.toString()
    canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight)
    return
  }
  canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight)
}

function findViewPartByName(editor, ctorName) {
  const parts = editor?._modelData?.view?._viewParts
  if (!Array.isArray(parts)) return null
  return parts.find((part) => part?.constructor?.name === ctorName) || null
}

function sameOverviewDecorationGroups(left = [], right = []) {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]
    const b = right[i]
    if (!a || !b || a.color !== b.color || a.zIndex !== b.zIndex) return false
    const aData = Array.isArray(a.data) ? a.data : []
    const bData = Array.isArray(b.data) ? b.data : []
    if (aData.length !== bData.length) return false
    for (let j = 0; j < aData.length; j += 1) {
      if (aData[j] !== bData[j]) return false
    }
  }
  return true
}

function sameCursorPositions(left = [], right = []) {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]
    const b = right[i]
    if (!a || !b || a.color !== b.color) return false
    if (a.position?.lineNumber !== b.position?.lineNumber) return false
    if (a.position?.column !== b.position?.column) return false
  }
  return true
}

export function patchOverviewRulerForCollapsedMinimap(editor) {
  const overviewPart = findViewPartByName(editor, 'DecorationsOverviewRuler')
  const minimapPart = findViewPartByName(editor, 'Minimap')
  if (!overviewPart || !minimapPart || overviewPart[OVERVIEW_RULER_PATCHED]) return

  const originalRender = overviewPart._render.bind(overviewPart)
  overviewPart._render = () => {
    const minimapOptions = minimapPart.options
    if (!minimapOptions || minimapOptions.renderMinimap === 0 || minimapOptions.minimapHeightIsEditorHeight) {
      originalRender()
      return
    }

    const backgroundColor = overviewPart._settings.backgroundColor
    if (overviewPart._settings.overviewRulerLanes === 0) {
      overviewPart._domNode.setBackgroundColor(backgroundColor ? backgroundColor.toString() : '')
      overviewPart._domNode.setDisplay('none')
      return
    }

    const decorations = overviewPart._context.viewModel.getAllOverviewRulerDecorations(overviewPart._context.theme)
    decorations.sort((a, b) => {
      if (a.zIndex === b.zIndex) return a.color.localeCompare(b.color)
      return a.zIndex - b.zIndex
    })

    if (overviewPart._actualShouldRender === 1) {
      const sameDecorations = sameOverviewDecorationGroups(overviewPart._renderedDecorations, decorations)
      const sameCursors = sameCursorPositions(overviewPart._renderedCursorPositions, overviewPart._cursorPositions)
      if (!sameDecorations || !sameCursors) {
        overviewPart._actualShouldRender = 2
      }
    }
    if (overviewPart._actualShouldRender === 1) return

    overviewPart._renderedDecorations = decorations
    overviewPart._renderedCursorPositions = overviewPart._cursorPositions
    overviewPart._domNode.setDisplay('block')

    const canvasWidth = overviewPart._settings.canvasWidth
    const canvasHeight = overviewPart._settings.canvasHeight
    const lineHeight = overviewPart._settings.lineHeight
    const minimapLineHeight = Math.max(1, Number(minimapOptions.minimapLineHeight || 1) || 1)
    const viewLayout = overviewPart._context.viewLayout
    const lineCount = overviewPart._context.viewModel?.model?.getLineCount?.() || 1
    const contentHeight = Math.max(lineHeight, viewLayout.getVerticalOffsetAfterLineNumber(lineCount))
    const heightRatio = minimapLineHeight / lineHeight
    const markerCanvasHeight = Math.max(
      1,
      Math.min(canvasHeight, Math.ceil(contentHeight * heightRatio)),
    )
    const minDecorationHeight = Math.max(1, (6 * overviewPart._settings.pixelRatio) | 0)
    const halfMinDecorationHeight = (minDecorationHeight / 2) | 0
    const canvasCtx = overviewPart._domNode.domNode.getContext('2d')

    fillOverviewCanvasBackground(overviewPart, canvasCtx, canvasWidth, canvasHeight)

    const x = overviewPart._settings.x
    const w = overviewPart._settings.w
    const clampCenter = (yCenter, halfHeight) => {
      if (yCenter < halfHeight) return halfHeight
      if (yCenter + halfHeight > markerCanvasHeight) return markerCanvasHeight - halfHeight
      return yCenter
    }

    for (const decorationGroup of decorations) {
      canvasCtx.fillStyle = decorationGroup.color
      const data = decorationGroup.data
      let prevLane = 0
      let prevY1 = 0
      let prevY2 = 0

      for (let i = 0, len = data.length / 3; i < len; i += 1) {
        const lane = data[3 * i]
        const startLineNumber = data[3 * i + 1]
        const endLineNumber = data[3 * i + 2]
        let y1 = (viewLayout.getVerticalOffsetForLineNumber(startLineNumber) * heightRatio) | 0
        let y2 = ((viewLayout.getVerticalOffsetForLineNumber(endLineNumber) + lineHeight) * heightRatio) | 0

        if ((y2 - y1) < minDecorationHeight) {
          const yCenter = clampCenter(((y1 + y2) / 2) | 0, halfMinDecorationHeight)
          y1 = yCenter - halfMinDecorationHeight
          y2 = yCenter + halfMinDecorationHeight
        }

        if (y1 > prevY2 + 1 || lane !== prevLane) {
          if (i !== 0) {
            canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1)
          }
          prevLane = lane
          prevY1 = y1
          prevY2 = y2
        } else if (y2 > prevY2) {
          prevY2 = y2
        }
      }

      canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1)
    }

    if (!overviewPart._settings.hideCursor) {
      const cursorHeight = Math.max(1, (2 * overviewPart._settings.pixelRatio) | 0)
      const halfCursorHeight = (cursorHeight / 2) | 0
      const cursorX = x[7]
      const cursorW = w[7]
      let prevY1 = -100
      let prevY2 = -100
      let prevColor = null

      for (const cursorEntry of overviewPart._cursorPositions) {
        if (!cursorEntry.color) continue
        let yCenter = (viewLayout.getVerticalOffsetForLineNumber(cursorEntry.position.lineNumber) * heightRatio) | 0
        yCenter = clampCenter(yCenter, halfCursorHeight)
        const y1 = yCenter - halfCursorHeight
        const y2 = y1 + cursorHeight

        if (y1 > prevY2 + 1 || cursorEntry.color !== prevColor) {
          if (prevColor) {
            canvasCtx.fillStyle = prevColor
            canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1)
          }
          prevY1 = y1
          prevY2 = y2
        } else if (y2 > prevY2) {
          prevY2 = y2
        }

        prevColor = cursorEntry.color
      }

      if (prevColor) {
        canvasCtx.fillStyle = prevColor
        canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1)
      }
    }

    if (overviewPart._settings.renderBorder && overviewPart._settings.borderColor && overviewPart._settings.overviewRulerLanes > 0) {
      canvasCtx.beginPath()
      canvasCtx.lineWidth = 1
      canvasCtx.strokeStyle = overviewPart._settings.borderColor
      canvasCtx.moveTo(0, 0)
      canvasCtx.lineTo(0, canvasHeight)
      canvasCtx.moveTo(1, 0)
      canvasCtx.lineTo(canvasWidth, 0)
      canvasCtx.stroke()
    }
  }

  overviewPart[OVERVIEW_RULER_PATCHED] = true
}
