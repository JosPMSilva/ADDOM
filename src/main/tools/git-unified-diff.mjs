const MAX_SUBSET_LINE_ACTION_VARIANTS = 200

function toPosInt(value, fallback = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  return rounded >= 0 ? rounded : fallback
}

function normalizeDiffText(input = '') {
  return String(input || '').replace(/\r\n/g, '\n')
}

function buildHunkId(index, oldStart, oldCount, newStart, newCount) {
  return `hunk:${index}:${oldStart},${oldCount}:${newStart},${newCount}`
}

function buildSegmentId(hunkId, index) {
  return `${String(hunkId || '').trim()}:segment:${index}`
}

function classifyHunkKind(lines = []) {
  let hasAdd = false
  let hasDelete = false
  for (const line of lines) {
    if (line?.type === 'add') hasAdd = true
    if (line?.type === 'delete') hasDelete = true
  }
  if (hasAdd && hasDelete) return 'modified'
  if (hasAdd) return 'added'
  if (hasDelete) return 'deleted'
  return 'modified'
}

function summarizeChangedLines(lines = []) {
  let addedLineCount = 0
  let deletedLineCount = 0
  for (const line of lines) {
    if (line?.type === 'add') addedLineCount += 1
    if (line?.type === 'delete') deletedLineCount += 1
  }
  return { addedLineCount, deletedLineCount }
}

function buildLineCountSummary(lines = []) {
  const summary = {
    oldStart: 0,
    oldCount: 0,
    newStart: 0,
    newCount: 0,
  }

  for (const line of Array.isArray(lines) ? lines : []) {
    if (!summary.oldStart && Number.isFinite(line?.oldLineNumber)) {
      summary.oldStart = Number(line.oldLineNumber)
    }
    if (!summary.newStart && Number.isFinite(line?.newLineNumber)) {
      summary.newStart = Number(line.newLineNumber)
    }
    if (line?.type !== 'add' && line?.type !== 'note') {
      summary.oldCount += 1
      if (!summary.oldStart && Number.isFinite(line?.oldCursorBefore)) {
        summary.oldStart = Number(line.oldCursorBefore)
      }
    }
    if (line?.type !== 'delete' && line?.type !== 'note') {
      summary.newCount += 1
      if (!summary.newStart && Number.isFinite(line?.newCursorBefore)) {
        summary.newStart = Number(line.newCursorBefore)
      }
    }
  }

  return summary
}

function buildSyntheticHunkHeader(lines = []) {
  const summary = buildLineCountSummary(lines)
  return {
    oldStart: summary.oldStart,
    oldCount: summary.oldCount,
    newStart: summary.newStart,
    newCount: summary.newCount,
    header: `@@ -${summary.oldStart},${summary.oldCount} +${summary.newStart},${summary.newCount} @@`,
  }
}

function buildPatchText(headerLines = [], header = '', lines = []) {
  return [
    ...headerLines,
    header,
    ...lines.map((line) => String(line?.rawText || line || '')),
    '',
  ].join('\n')
}

function buildSelectableLineBounds(lines = []) {
  const visibleLineNumbers = lines
    .filter((line) => Number.isFinite(line?.newLineNumber))
    .map((line) => Number(line.newLineNumber))
  return {
    selectableLineStart: visibleLineNumbers.length > 0 ? Math.min(...visibleLineNumbers) : null,
    selectableLineEnd: visibleLineNumbers.length > 0 ? Math.max(...visibleLineNumbers) : null,
  }
}

function buildLineActionSegment({
  hunkId,
  headerLines = [],
  segmentIndex,
  variantIndex = 0,
  lines = [],
  selectableLines = null,
  kind = 'modified',
} = {}) {
  const synthetic = buildSyntheticHunkHeader(lines)
  const selectionBounds = selectableLines
    ? buildSelectableLineBounds(selectableLines)
    : buildSelectableLineBounds(lines)
  const segmentId = variantIndex > 0
    ? buildSegmentId(hunkId, `${segmentIndex}.${variantIndex}`)
    : buildSegmentId(hunkId, segmentIndex)

  return {
    id: segmentId,
    index: segmentIndex,
    kind,
    oldStart: synthetic.oldStart,
    oldCount: synthetic.oldCount,
    newStart: synthetic.newStart,
    newCount: synthetic.newCount,
    lines,
    displayText: [synthetic.header, ...lines.map((line) => String(line?.rawText || ''))].join('\n'),
    previewText: buildDiffPreviewText(lines),
    patchText: buildPatchText(headerLines, synthetic.header, lines),
    ...selectionBounds,
    lineActionEligible: selectionBounds.selectableLineStart != null && selectionBounds.selectableLineEnd != null,
    lineActionReason: selectionBounds.selectableLineStart != null && selectionBounds.selectableLineEnd != null
      ? ''
      : 'segment_has_no_visible_lines',
  }
}

function buildSubsetLineActionSegments(
  hunkId,
  headerLines = [],
  segmentIndex,
  segmentLines = [],
  contextBefore = [],
  contextAfter = [],
) {
  const additions = segmentLines.filter((line) => line?.type === 'add')
  const deletions = segmentLines.filter((line) => line?.type === 'delete')
  if (additions.length <= 1) return []
  const variantCount = deletions.length === 0
    ? (additions.length * (additions.length + 1) / 2) - 1
    : additions.length === deletions.length
      ? (additions.length * (additions.length + 1) / 2) - 1
      : 0
  if (variantCount > MAX_SUBSET_LINE_ACTION_VARIANTS) return []

  const variants = []
  let variantIndex = 0

  const pushVariant = (lines, kind = 'modified') => {
    variantIndex += 1
    variants.push(buildLineActionSegment({
      hunkId,
      headerLines,
      segmentIndex,
      variantIndex,
      lines: [...contextBefore, ...lines, ...contextAfter],
      selectableLines: lines,
      kind,
    }))
  }

  if (deletions.length === 0) {
    for (let start = 0; start < additions.length; start += 1) {
      for (let end = start; end < additions.length; end += 1) {
        if (start === 0 && end === additions.length - 1) continue
        pushVariant(additions.slice(start, end + 1), 'added')
      }
    }
    return variants
  }

  if (deletions.length !== additions.length) return []

  for (let start = 0; start < additions.length; start += 1) {
    for (let end = start; end < additions.length; end += 1) {
      if (start === 0 && end === additions.length - 1) continue
      pushVariant([
        ...deletions.slice(start, end + 1),
        ...additions.slice(start, end + 1),
      ], 'modified')
    }
  }

  return variants
}

export function buildDiffPreviewText(lines = [], maxLines = 12) {
  const source = Array.isArray(lines) ? lines : []
  const limit = Math.max(1, Number(maxLines || 12) || 12)
  const preview = []
  for (let index = 0; index < source.length && preview.length < limit; index += 1) {
    const line = source[index]
    const prefix = (
      line?.type === 'add' ? '+'
        : line?.type === 'delete' ? '-'
          : line?.type === 'note' ? '\\'
            : ' '
    )
    preview.push(`${prefix}${String(line?.text || '')}`)
  }
  if (source.length > preview.length) {
    preview.push(`... ${source.length - preview.length} more line(s)`)
  }
  return preview.join('\n')
}

function buildHunkSegments(hunkId, headerLines = [], parsedLines = []) {
  const ranges = []
  let activeStart = -1

  const flushRange = (endIndex) => {
    if (activeStart < 0 || endIndex < activeStart) return
    ranges.push({ start: activeStart, end: endIndex })
    activeStart = -1
  }

  for (let index = 0; index < parsedLines.length; index += 1) {
    const line = parsedLines[index]
    const isChangedLine = line?.type === 'add' || line?.type === 'delete'
    if (isChangedLine) {
      if (activeStart < 0) activeStart = index
      continue
    }
    if (line?.type === 'note') {
      if (activeStart >= 0) continue
      return []
    }
    flushRange(index - 1)
  }
  flushRange(parsedLines.length - 1)

  return ranges.flatMap((range, index) => {
    const previousRange = ranges[index - 1]
    const nextRange = ranges[index + 1]
    const patchStart = previousRange ? previousRange.end + 1 : 0
    const patchEnd = nextRange ? nextRange.start - 1 : parsedLines.length - 1
    const segmentLines = parsedLines.slice(range.start, range.end + 1)
    const patchLines = parsedLines.slice(patchStart, patchEnd + 1)
    const contextBefore = parsedLines.slice(patchStart, range.start).filter((line) => line?.type === 'context')
    const contextAfter = parsedLines.slice(range.end + 1, patchEnd + 1).filter((line) => line?.type === 'context')
    const synthetic = buildSyntheticHunkHeader(patchLines)
    const selectionBounds = buildSelectableLineBounds(segmentLines)
    const baseSegment = {
      id: buildSegmentId(hunkId, index + 1),
      index: index + 1,
      kind: classifyHunkKind(segmentLines),
      startLineIndex: range.start,
      endLineIndex: range.end,
      oldStart: synthetic.oldStart,
      oldCount: synthetic.oldCount,
      newStart: synthetic.newStart,
      newCount: synthetic.newCount,
      lines: segmentLines,
      displayText: [synthetic.header, ...segmentLines.map((line) => String(line?.rawText || ''))].join('\n'),
      previewText: buildDiffPreviewText(segmentLines),
      patchText: buildPatchText(headerLines, synthetic.header, patchLines),
      ...selectionBounds,
      lineActionEligible: selectionBounds.selectableLineStart != null && selectionBounds.selectableLineEnd != null,
      lineActionReason: selectionBounds.selectableLineStart != null && selectionBounds.selectableLineEnd != null
        ? ''
        : 'segment_has_no_visible_lines',
    }

    return [
      baseSegment,
      ...buildSubsetLineActionSegments(
        hunkId,
        headerLines,
        index + 1,
        segmentLines,
        contextBefore,
        contextAfter,
      ),
    ]
  })
}

export function findHunkSegmentByLineRange(hunk = {}, startLineNumber, endLineNumber) {
  const start = toPosInt(startLineNumber, 0)
  const end = toPosInt(endLineNumber, 0)
  if (!start || !end) return null
  const normalizedStart = Math.min(start, end)
  const normalizedEnd = Math.max(start, end)
  const segments = Array.isArray(hunk?.segments) ? hunk.segments : []
  return segments.find((segment) => (
    segment?.lineActionEligible === true
    && Number(segment.selectableLineStart) === normalizedStart
    && Number(segment.selectableLineEnd) === normalizedEnd
  )) || null
}

export function parseUnifiedDiffForSingleFile(diffText = '') {
  const text = normalizeDiffText(diffText)
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      ok: true,
      status: 'no_diff',
      headerLines: [],
      hunks: [],
      hunkCount: 0,
      addedLineCount: 0,
      deletedLineCount: 0,
      rawText: '',
      file: {
        oldPath: '',
        newPath: '',
        isNewFile: false,
        isDeletedFile: false,
      },
    }
  }

  if (/^(rename from|rename to|similarity index|dissimilarity index|GIT binary patch|Binary files |Submodule )/m.test(text)) {
    return {
      ok: true,
      status: 'unsupported',
      unsupportedReason: 'unsupported_diff_type',
      headerLines: [],
      hunks: [],
      hunkCount: 0,
      addedLineCount: 0,
      deletedLineCount: 0,
      rawText: text,
      file: {
        oldPath: '',
        newPath: '',
        isNewFile: false,
        isDeletedFile: false,
      },
    }
  }

  const lines = text.split('\n')
  const headerLines = []
  const hunks = []
  let index = 0
  const file = {
    oldPath: '',
    newPath: '',
    isNewFile: false,
    isDeletedFile: false,
  }

  while (index < lines.length && !lines[index].startsWith('@@ ')) {
    const line = lines[index]
    if (line.startsWith('--- ')) {
      file.oldPath = String(line.slice(4) || '').trim()
      file.isNewFile = file.oldPath === '/dev/null'
    } else if (line.startsWith('+++ ')) {
      file.newPath = String(line.slice(4) || '').trim()
      file.isDeletedFile = file.newPath === '/dev/null'
    }
    headerLines.push(line)
    index += 1
  }

  if (index >= lines.length) {
    return {
      ok: true,
      status: 'no_diff',
      headerLines,
      hunks: [],
      hunkCount: 0,
      addedLineCount: 0,
      deletedLineCount: 0,
      rawText: text,
      file,
    }
  }

  while (index < lines.length) {
    const header = lines[index]
    if (!header.startsWith('@@ ')) {
      return {
        ok: false,
        error: 'invalid_diff_hunk_header',
        message: `Unexpected unified diff line: ${header}`,
      }
    }

    const match = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/)
    if (!match) {
      return {
        ok: false,
        error: 'invalid_diff_hunk_header',
        message: `Invalid unified diff hunk header: ${header}`,
      }
    }

    const oldStart = toPosInt(match[1], 0)
    const oldCount = toPosInt(match[2], 1)
    const newStart = toPosInt(match[3], 0)
    const newCount = toPosInt(match[4], 1)

    index += 1
    const hunkLines = []
    const parsedLines = []
    let oldLineNumber = oldStart
    let newLineNumber = newStart

    while (index < lines.length && !lines[index].startsWith('@@ ')) {
      const rawLine = lines[index]
      hunkLines.push(rawLine)
      if (rawLine.startsWith('+')) {
        parsedLines.push({
          type: 'add',
          text: rawLine.slice(1),
          rawText: rawLine,
          oldLineNumber: null,
          newLineNumber,
          oldCursorBefore: oldLineNumber,
          newCursorBefore: newLineNumber,
        })
        newLineNumber += 1
      } else if (rawLine.startsWith('-')) {
        parsedLines.push({
          type: 'delete',
          text: rawLine.slice(1),
          rawText: rawLine,
          oldLineNumber,
          newLineNumber: null,
          oldCursorBefore: oldLineNumber,
          newCursorBefore: newLineNumber,
        })
        oldLineNumber += 1
      } else if (rawLine.startsWith(' ')) {
        parsedLines.push({
          type: 'context',
          text: rawLine.slice(1),
          rawText: rawLine,
          oldLineNumber,
          newLineNumber,
          oldCursorBefore: oldLineNumber,
          newCursorBefore: newLineNumber,
        })
        oldLineNumber += 1
        newLineNumber += 1
      } else if (rawLine.startsWith('\\')) {
        parsedLines.push({
          type: 'note',
          text: rawLine.slice(1).trimStart(),
          rawText: rawLine,
          oldLineNumber: null,
          newLineNumber: null,
          oldCursorBefore: oldLineNumber,
          newCursorBefore: newLineNumber,
        })
      } else {
        return {
          ok: false,
          error: 'invalid_diff_hunk_line',
          message: `Unexpected unified diff body line: ${rawLine}`,
        }
      }
      index += 1
    }

    const lineSummary = summarizeChangedLines(parsedLines)
    const hunkIndex = hunks.length + 1
    const hunkId = buildHunkId(hunkIndex, oldStart, oldCount, newStart, newCount)

    hunks.push({
      id: hunkId,
      index: hunkIndex,
      header,
      oldStart,
      oldCount,
      newStart,
      newCount,
      kind: classifyHunkKind(parsedLines),
      lines: parsedLines,
      displayText: [header, ...hunkLines].join('\n'),
      previewText: buildDiffPreviewText(parsedLines),
      patchText: buildPatchText(headerLines, header, parsedLines),
      segments: buildHunkSegments(hunkId, headerLines, parsedLines),
      ...lineSummary,
    })
  }

  const totals = hunks.reduce((acc, hunk) => {
    acc.addedLineCount += Number(hunk.addedLineCount || 0)
    acc.deletedLineCount += Number(hunk.deletedLineCount || 0)
    return acc
  }, { addedLineCount: 0, deletedLineCount: 0 })

  return {
    ok: true,
    status: hunks.length > 0 ? 'ok' : 'no_diff',
    headerLines,
    hunks,
    hunkCount: hunks.length,
    rawText: text,
    file,
    ...totals,
  }
}
