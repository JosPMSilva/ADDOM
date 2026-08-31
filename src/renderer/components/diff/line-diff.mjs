const DEFAULT_CONTEXT_LINES = 3
const MAX_DP_CELLS = 750_000
const MAX_LCS_CHAR_BUDGET = 300_000
const DEFAULT_FALLBACK_CONTEXT_LINES = 30
const DEFAULT_MAX_CHANGED_LINES = 250

function makeLine(oldLine, newLine, text) {
  return {
    oldLine: Number.isFinite(Number(oldLine)) ? Number(oldLine) : null,
    newLine: Number.isFinite(Number(newLine)) ? Number(newLine) : null,
    text: String(text ?? ''),
  }
}

function collapseUnchangedRuns(edits, contextLines) {
  const result = []
  let index = 0
  while (index < edits.length) {
    const segment = edits[index]
    if (segment.type !== 'unchanged') {
      result.push(segment)
      index += 1
      continue
    }
    const run = []
    while (index < edits.length && edits[index].type === 'unchanged') {
      run.push(edits[index])
      index += 1
    }
    if (run.length <= contextLines * 2 + 1) {
      result.push(...run)
      continue
    }
    result.push(...run.slice(0, contextLines))
    const hidden = run.slice(contextLines, run.length - contextLines)
    result.push({
      type: 'ellipsis',
      lines: [makeLine(null, null, `${hidden.length} unmodified lines`)],
      hiddenLines: hidden.flatMap((seg) => seg.lines),
    })
    result.push(...run.slice(run.length - contextLines))
  }
  return result
}

function pushUnchangedSlice(out, lines, start, count) {
  if (count <= 0) return
  for (let idx = 0; idx < count; idx += 1) {
    const absolute = start + idx
    out.push({
      type: 'unchanged',
      lines: [makeLine(absolute + 1, absolute + 1, lines[absolute])],
    })
  }
}

function computeBoundedFallbackDiff(aLines, bLines) {
  let prefix = 0
  while (
    prefix < aLines.length
    && prefix < bLines.length
    && aLines[prefix] === bLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < (aLines.length - prefix)
    && suffix < (bLines.length - prefix)
    && aLines[aLines.length - 1 - suffix] === bLines[bLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const middleA = aLines.slice(prefix, Math.max(prefix, aLines.length - suffix))
  const middleB = bLines.slice(prefix, Math.max(prefix, bLines.length - suffix))

  const out = [{
    type: 'ellipsis',
    lines: [makeLine(null, null, 'Large diff detected; showing partial diff to keep UI responsive.')],
  }]

  const prefixShown = Math.min(prefix, DEFAULT_FALLBACK_CONTEXT_LINES)
  pushUnchangedSlice(out, bLines, 0, prefixShown)
  if (prefix > prefixShown) {
    out.push({
      type: 'ellipsis',
      lines: [makeLine(null, null, `${prefix - prefixShown} unchanged prefix lines omitted`)],
    })
  }

  const removedShown = middleA.slice(0, DEFAULT_MAX_CHANGED_LINES)
  for (let idx = 0; idx < removedShown.length; idx += 1) {
    out.push({
      type: 'removed',
      lines: [makeLine(prefix + idx + 1, null, removedShown[idx])],
    })
  }
  if (middleA.length > removedShown.length) {
    out.push({
      type: 'ellipsis',
      lines: [makeLine(null, null, `${middleA.length - removedShown.length} removed lines omitted`)],
    })
  }

  const addedShown = middleB.slice(0, DEFAULT_MAX_CHANGED_LINES)
  for (let idx = 0; idx < addedShown.length; idx += 1) {
    out.push({
      type: 'added',
      lines: [makeLine(null, prefix + idx + 1, addedShown[idx])],
    })
  }
  if (middleB.length > addedShown.length) {
    out.push({
      type: 'ellipsis',
      lines: [makeLine(null, null, `${middleB.length - addedShown.length} added lines omitted`)],
    })
  }

  const suffixShown = Math.min(suffix, DEFAULT_FALLBACK_CONTEXT_LINES)
  if (suffix > suffixShown) {
    out.push({
      type: 'ellipsis',
      lines: [makeLine(null, null, `${suffix - suffixShown} unchanged suffix lines omitted`)],
    })
  }
  const suffixStart = Math.max(0, bLines.length - suffixShown)
  pushUnchangedSlice(out, bLines, suffixStart, suffixShown)

  return out
}

function lcsEdits(aLines, bLines) {
  const m = aLines.length
  const n = bLines.length
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1))

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (aLines[i] === bLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const edits = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      edits.push({ type: 'unchanged', lines: [makeLine(i + 1, j + 1, bLines[j])] })
      i += 1
      j += 1
      continue
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      edits.push({ type: 'removed', lines: [makeLine(i + 1, null, aLines[i])] })
      i += 1
      continue
    }
    edits.push({ type: 'added', lines: [makeLine(null, j + 1, bLines[j])] })
    j += 1
  }
  while (i < m) {
    edits.push({ type: 'removed', lines: [makeLine(i + 1, null, aLines[i])] })
    i += 1
  }
  while (j < n) {
    edits.push({ type: 'added', lines: [makeLine(null, j + 1, bLines[j])] })
    j += 1
  }
  return edits
}

export function computeLineDiff(a, b) {
  const oldText = String(a || '')
  const newText = String(b || '')
  const totalChars = oldText.length + newText.length
  const aLines = oldText === '' ? [] : oldText.split('\n')
  const bLines = newText === '' ? [] : newText.split('\n')
  const cellEstimate = (aLines.length + 1) * (bLines.length + 1)

  if (cellEstimate > MAX_DP_CELLS || totalChars > MAX_LCS_CHAR_BUDGET) {
    return computeBoundedFallbackDiff(aLines, bLines)
  }

  return collapseUnchangedRuns(lcsEdits(aLines, bLines), DEFAULT_CONTEXT_LINES)
}

export function flattenLineDiffSegmentsToPreviewRows(segments, options = {}) {
  const hasMaxRows = Number.isFinite(Number(options.maxRows)) && Number(options.maxRows) > 0
  const maxRows = hasMaxRows ? Math.max(1, Number(options.maxRows)) : Number.POSITIVE_INFINITY
  const truncateMessage = String(options.truncateMessage || 'Diff preview truncated.')
  const rows = []
  let truncated = false

  const pushRow = (row) => {
    if (rows.length >= maxRows) {
      truncated = true
      return false
    }
    rows.push(row)
    return true
  }

  for (const segment of Array.isArray(segments) ? segments : []) {
    const kind = (
      segment?.type === 'added' ? 'add'
        : segment?.type === 'removed' ? 'delete'
          : segment?.type === 'ellipsis' ? 'ellipsis'
            : 'context'
    )
    const lines = Array.isArray(segment?.lines) ? segment.lines : []
    const hiddenLines = kind === 'ellipsis' && Array.isArray(segment?.hiddenLines) ? segment.hiddenLines : undefined
    for (const line of lines) {
      if (!pushRow({
        kind,
        oldLine: line?.oldLine ?? null,
        newLine: line?.newLine ?? null,
        text: String(line?.text ?? ''),
        ...(hiddenLines ? { hiddenLines } : {}),
      })) {
        break
      }
    }
    if (truncated) break
  }

  if (truncated) {
    if (rows.length >= maxRows) rows.pop()
    rows.push({
      kind: 'ellipsis',
      oldLine: null,
      newLine: null,
      text: truncateMessage,
    })
  }

  return rows
}
