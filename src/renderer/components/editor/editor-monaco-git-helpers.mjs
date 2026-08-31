import { resolveGitDecorationColor as getGitDecorationColor } from '../../theme/specialized-theme-adapters.mjs'

function clampLineNumber(lineCount, lineNumber) {
  const maxLine = Math.max(1, Number(lineCount || 1) || 1)
  const nextLine = Math.max(1, Number(lineNumber || 1) || 1)
  return Math.min(maxLine, nextLine)
}

function escapeMarkdownCode(value = '') {
  return String(value || '').replace(/```/g, '` ` `')
}

function buildHunkPreviewText(hunk = {}, maxLines = 12) {
  const lines = Array.isArray(hunk?.lines) ? hunk.lines : []
  const preview = []
  const limit = Math.max(1, Number(maxLines || 12) || 12)
  for (let index = 0; index < lines.length && preview.length < limit; index += 1) {
    const line = lines[index]
    const prefix = (
      line?.type === 'add' ? '+'
        : line?.type === 'delete' ? '-'
          : line?.type === 'note' ? '\\'
            : ' '
    )
    preview.push(`${prefix}${String(line?.text || '')}`)
  }
  if (lines.length > preview.length) {
    preview.push(`... ${lines.length - preview.length} more line(s)`)
  }
  return preview.join('\n')
}

export function getGitHunkAnchor(hunk = {}, modelLineCount = 1) {
  const lineCount = Math.max(1, Number(modelLineCount || 1) || 1)
  const newStart = Math.max(1, Number(hunk?.newStart || 1) || 1)
  const newCount = Math.max(0, Number(hunk?.newCount || 0) || 0)
  if (newCount > 0) {
    return {
      lineNumber: clampLineNumber(lineCount, newStart),
      isDeletedAnchor: false,
    }
  }
  if (newStart <= lineCount) {
    return {
      lineNumber: Math.max(1, newStart),
      isDeletedAnchor: true,
    }
  }
  return {
    lineNumber: lineCount,
    isDeletedAnchor: true,
  }
}

export function buildGitHunkHoverMarkdown(hunk = {}) {
  const header = String(hunk?.header || '').trim()
  const previewText = buildHunkPreviewText(hunk)
  const parts = ['**Git hunk**']
  if (header) parts.push(`\`${escapeMarkdownCode(header)}\``)
  if (previewText) {
    parts.push(`\`\`\`diff\n${escapeMarkdownCode(previewText)}\n\`\`\``)
  }
  return parts.join('\n\n')
}

function getOverviewRulerLane(monaco) {
  return monaco?.editor?.OverviewRulerLane?.Left ?? 1
}

function getMinimapPosition(monaco) {
  return monaco?.editor?.MinimapPosition?.Gutter ?? 2
}

export function buildMonacoGitDecorations(monaco, model, gitDiff = null) {
  if (!monaco || !model || gitDiff?.status !== 'ok' || gitDiff?.dirtyBufferBlocked === true) {
    return {
      decorations: [],
      anchorsByHunkId: new Map(),
      lineToHunkId: new Map(),
    }
  }

  const lineCount = Math.max(1, Number(model.getLineCount?.() || 1) || 1)
  const decorations = []
  const anchorsByHunkId = new Map()
  const lineToHunkId = new Map()

  for (const hunk of Array.isArray(gitDiff?.hunks) ? gitDiff.hunks : []) {
    if (!hunk?.id) continue
    const anchor = getGitHunkAnchor(hunk, lineCount)
    const endLineNumber = Math.max(
      anchor.lineNumber,
      hunk.newCount > 0 ? clampLineNumber(lineCount, anchor.lineNumber + hunk.newCount - 1) : anchor.lineNumber,
    )
    const hoverMessage = { value: buildGitHunkHoverMarkdown(hunk) }
    const kind = String(hunk.kind || 'modified')
    const color = getGitDecorationColor(kind)
    decorations.push({
      range: new monaco.Range(anchor.lineNumber, 1, endLineNumber, 1),
      options: {
        isWholeLine: true,
        className: `addom-git-line-hitbox addom-git-line-${kind}`,
        linesDecorationsClassName: `addom-git-lines addom-git-lines-${kind}`,
        lineNumberClassName: `addom-git-line-number addom-git-line-number-${kind}`,
        overviewRuler: {
          color,
          position: getOverviewRulerLane(monaco),
        },
        minimap: {
          color,
          position: getMinimapPosition(monaco),
        },
        hoverMessage,
        glyphMarginHoverMessage: hoverMessage,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    })
    anchorsByHunkId.set(hunk.id, anchor)
    for (let lineNumber = anchor.lineNumber; lineNumber <= endLineNumber; lineNumber += 1) {
      if (!lineToHunkId.has(lineNumber)) {
        lineToHunkId.set(lineNumber, hunk.id)
      }
    }
  }

  return { decorations, anchorsByHunkId, lineToHunkId }
}
