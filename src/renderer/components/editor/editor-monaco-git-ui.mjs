import { buildMonacoGitDecorations } from './editor-monaco-git-helpers.mjs'
import { createMonacoGitHunkWidget } from './editor-monaco-git-widget.mjs'
import { reportMonacoTrace } from './editor-monaco-service-helpers.mjs'

export function attachMonacoGitUi({
  editor,
  monaco,
  onSelectHunk,
  onCloseWidget,
  onStageHunk,
  onDiscardHunk,
  onUnstageHunk,
  onStageLines,
  onDiscardLines,
  onUnstageLines,
  labels = {},
}) {
  const resolvedLabels = {
    selectionPrefixChanged: String(labels?.selectionPrefixChanged || '').trim() || 'Selection: changed lines {{lineLabel}}',
    selectionPrefixStaged: String(labels?.selectionPrefixStaged || '').trim() || 'Selection: staged lines {{lineLabel}}',
    selectionReason: String(labels?.selectionReason || '').trim() || 'Selection: {{reason}}.',
    selectionIncludesContext: String(labels?.selectionIncludesContext || '').trim() || 'Selection includes unchanged context lines. {{hint}}',
    selectionNoMatch: String(labels?.selectionNoMatch || '').trim() || 'Selection does not match a changed segment. {{hint}}',
    selectionNoMatchPlain: String(labels?.selectionNoMatchPlain || '').trim() || 'Selection does not match a changed segment.',
    actionableRange: String(labels?.actionableRange || '').trim() || 'Actionable range: {{labels}}',
    actionableRanges: String(labels?.actionableRanges || '').trim() || 'Actionable ranges: {{labels}}',
    moreRangesSuffix: String(labels?.moreRangesSuffix || '').trim() || ', +{{count}} more',
  }

  function applyLabel(template, values = {}) {
    return String(template || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => String(values[key] ?? ''))
  }

  function normalizeSelectionLineRange(selection = null) {
    if (!selection || typeof selection.isEmpty === 'function' && selection.isEmpty()) return null
    const startLine = Math.max(1, Math.min(
      Number(selection.startLineNumber || 1) || 1,
      Number(selection.endLineNumber || 1) || 1,
    ))
    const endLine = Math.max(
      startLine,
      Math.max(
        Number(selection.startLineNumber || 1) || 1,
        Number(selection.endLineNumber || 1) || 1,
      ),
    )
    return { startLine, endLine }
  }

  function formatLineRangeLabel(startLine, endLine) {
    const start = Math.max(1, Number(startLine || 1) || 1)
    const end = Math.max(start, Number(endLine || start) || start)
    return start === end ? `${start}` : `${start}-${end}`
  }

  function collectEligibleLineRanges(segments = []) {
    const uniqueRanges = new Map()
    for (const segment of Array.isArray(segments) ? segments : []) {
      if (segment?.lineActionEligible !== true) continue
      const startLine = Number(segment?.selectableLineStart || 0) || 0
      const endLine = Number(segment?.selectableLineEnd || 0) || 0
      if (!startLine || !endLine) continue
      const key = `${startLine}:${endLine}`
      if (!uniqueRanges.has(key)) {
        uniqueRanges.set(key, { startLine, endLine })
      }
    }
    return [...uniqueRanges.values()].sort((left, right) => (
      left.startLine - right.startLine || left.endLine - right.endLine
    ))
  }

  function formatEligibleRangeHint(ranges = [], maxRanges = 3) {
    const limited = (Array.isArray(ranges) ? ranges : []).slice(0, maxRanges)
    const labels = limited.map((range) => formatLineRangeLabel(range.startLine, range.endLine))
    const extraCount = Math.max(0, (Array.isArray(ranges) ? ranges.length : 0) - limited.length)
    if (labels.length === 0) return ''
    const prefix = labels.length === 1 && extraCount === 0
      ? applyLabel(resolvedLabels.actionableRange, { labels: labels.join(', ') })
      : applyLabel(resolvedLabels.actionableRanges, { labels: labels.join(', ') })
    const extra = extraCount > 0
      ? applyLabel(resolvedLabels.moreRangesSuffix, { count: extraCount })
      : ''
    return `${prefix}${extra}.`
  }

  function resolveLineAction(gitDiff, selectedHunkId, selection, scope = 'unstaged') {
    const normalizedHunkId = String(selectedHunkId || '').trim()
    if (!normalizedHunkId || gitDiff?.status !== 'ok') return { enabled: false, message: '' }
    const lineRange = normalizeSelectionLineRange(selection)
    if (!lineRange) return { enabled: false, message: '' }

    const selectedHunk = Array.isArray(gitDiff?.hunks)
      ? gitDiff.hunks.find((hunk) => hunk?.id === normalizedHunkId)
      : null
    if (!selectedHunk) return { enabled: false, message: '' }

    const segments = Array.isArray(selectedHunk?.segments) ? selectedHunk.segments : []
    const eligibleRanges = collectEligibleLineRanges(segments)
    const exactSegment = segments.find((segment) => (
      Number(segment?.selectableLineStart || 0) === lineRange.startLine
      && Number(segment?.selectableLineEnd || 0) === lineRange.endLine
    )) || null

    if (exactSegment?.lineActionEligible) {
      const lineLabel = formatLineRangeLabel(lineRange.startLine, lineRange.endLine)
      return {
        enabled: true,
        startLine: lineRange.startLine,
        endLine: lineRange.endLine,
        message: String(scope || '').trim().toLowerCase() === 'staged'
          ? applyLabel(resolvedLabels.selectionPrefixStaged, { lineLabel })
          : applyLabel(resolvedLabels.selectionPrefixChanged, { lineLabel }),
      }
    }

    if (exactSegment && exactSegment.lineActionReason) {
      return {
        enabled: false,
        message: applyLabel(resolvedLabels.selectionReason, {
          reason: String(exactSegment.lineActionReason || '').replace(/_/g, ' '),
        }),
      }
    }

    const overlappingEligibleRanges = eligibleRanges.filter((range) => (
      lineRange.startLine <= range.endLine && lineRange.endLine >= range.startLine
    ))
    if (overlappingEligibleRanges.length > 0) {
      return {
        enabled: false,
        message: applyLabel(resolvedLabels.selectionIncludesContext, {
          hint: formatEligibleRangeHint(overlappingEligibleRanges),
        }).trim(),
      }
    }

    if (eligibleRanges.length > 0) {
      return {
        enabled: false,
        message: applyLabel(resolvedLabels.selectionNoMatch, {
          hint: formatEligibleRangeHint(eligibleRanges),
        }).trim(),
      }
    }

    return {
      enabled: false,
      message: resolvedLabels.selectionNoMatchPlain,
    }
  }

  const decorations = editor.createDecorationsCollection([])
  const widget = createMonacoGitHunkWidget({
    editor,
    monaco,
    onStageHunk,
    onDiscardHunk,
    onUnstageHunk,
    onStageLines,
    onDiscardLines,
    onUnstageLines,
    onClose: onCloseWidget,
    labels,
  })
  let lineToHunkId = new Map()
  let anchorsByHunkId = new Map()
  let latestState = {}
  let disposed = false

  const mouseDisposable = editor.onMouseDown((event) => {
    if (disposed) return
    const targetType = Number(event?.target?.type || -1)
    if (
      targetType !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
      && targetType !== monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS
      && targetType !== monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
    ) {
      return
    }
    const lineNumber = Number(event?.target?.position?.lineNumber || 0)
    if (!lineNumber) return
    const hunkId = lineToHunkId.get(lineNumber)
    if (!hunkId) return
    event?.event?.preventDefault?.()
    selectHunkImmediately(hunkId)
    onSelectHunk?.(hunkId)
  })
  const selectionDisposable = editor.onDidChangeCursorSelection(() => {
    if (disposed) return
    renderSelectedHunkWidget()
  })

  function selectHunkImmediately(hunkId = '') {
    const normalizedHunkId = String(hunkId || '').trim()
    if (!normalizedHunkId) return
    const currentSelectedHunkId = String(latestState?.selectedHunkId || '').trim()
    latestState = {
      ...latestState,
      selectedHunkId: currentSelectedHunkId === normalizedHunkId ? '' : normalizedHunkId,
      actionError: '',
    }
    renderSelectedHunkWidget()
  }

  function renderSelectedHunkWidget() {
    const gitDiff = latestState?.gitDiff
    const selectedHunkId = String(latestState?.selectedHunkId || '').trim()
    const selectedHunk = Array.isArray(gitDiff?.hunks)
      ? gitDiff.hunks.find((hunk) => hunk?.id === selectedHunkId)
      : null
    const anchor = selectedHunkId ? anchorsByHunkId.get(selectedHunkId) : null
    if (!selectedHunk || !anchor) {
      widget.hide()
      return
    }

    widget.show({
      hunk: selectedHunk,
      lineNumber: anchor.lineNumber,
      uiState: {
        scope: String(latestState?.scope || 'unstaged'),
        lineAction: resolveLineAction(
          gitDiff,
          selectedHunkId,
          editor.getSelection(),
          latestState?.scope,
        ),
        actionHunkId: String(latestState?.actionHunkId || '').trim(),
        actionType: String(latestState?.actionType || '').trim(),
        actionError: String(latestState?.actionError || '').trim(),
      },
    })
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    mouseDisposable?.dispose?.()
    selectionDisposable?.dispose?.()
    decorations.clear()
    widget.dispose()
  }

  editor.onDidDispose(() => {
    dispose()
  })

  return {
    update(nextState = {}) {
      if (disposed) return
      latestState = nextState
      const gitDiff = nextState?.gitDiff
      if (!gitDiff || gitDiff.status !== 'ok' || gitDiff.dirtyBufferBlocked === true || gitDiff.editorRenderable === false) {
        reportMonacoTrace('monaco_git_ui_clear', {
          status: String(gitDiff?.status || ''),
          dirtyBufferBlocked: gitDiff?.dirtyBufferBlocked === true,
          editorRenderable: gitDiff?.editorRenderable === true,
        })
        decorations.clear()
        lineToHunkId = new Map()
        anchorsByHunkId = new Map()
        widget.hide()
        return
      }

      const mapped = buildMonacoGitDecorations(monaco, editor.getModel(), gitDiff)
      reportMonacoTrace('monaco_git_ui_decorations', {
        decorationCount: Array.isArray(mapped?.decorations) ? mapped.decorations.length : 0,
        hunkCount: Array.isArray(gitDiff?.hunks) ? gitDiff.hunks.length : 0,
      })
      decorations.set(mapped.decorations)
      lineToHunkId = mapped.lineToHunkId
      anchorsByHunkId = mapped.anchorsByHunkId

      const selectedHunkId = String(nextState?.selectedHunkId || '').trim()
      if (!selectedHunkId || !anchorsByHunkId.get(selectedHunkId)) {
        widget.hide()
        return
      }
      renderSelectedHunkWidget()
    },
    dispose,
  }
}
