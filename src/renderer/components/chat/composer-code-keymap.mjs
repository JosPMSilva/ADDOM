const INDENT_UNIT = '  '

const COMMENT_PREFIX_BY_LANGUAGE = Object.freeze({
  py: '#',
  sh: '#',
  yaml: '#',
  yml: '#',
  toml: '#',
  sql: '--',
})

function clampOffset(value = '', offset = 0) {
  const text = String(value || '')
  const raw = Number(offset)
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(text.length, Math.floor(raw)))
}

function normalizeSelection(value = '', selectionStart = 0, selectionEnd = 0) {
  const start = clampOffset(value, selectionStart)
  const end = clampOffset(value, selectionEnd)
  if (start <= end) return { start, end }
  return { start: end, end: start }
}

function buildLineStarts(value = '') {
  const starts = [0]
  const text = String(value || '')
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function lineIndexForOffset(lineStarts = [], offset = 0) {
  const probe = Math.max(0, Number(offset || 0))
  for (let i = lineStarts.length - 1; i >= 0; i -= 1) {
    if (probe >= lineStarts[i]) return i
  }
  return 0
}

function resolveLineRange(value = '', selectionStart = 0, selectionEnd = 0) {
  const text = String(value || '')
  const { start, end } = normalizeSelection(text, selectionStart, selectionEnd)
  const lineStarts = buildLineStarts(text)
  const firstLine = lineIndexForOffset(lineStarts, start)
  const endProbe = start === end
    ? end
    : Math.max(start, end - 1)
  const lastLine = lineIndexForOffset(lineStarts, endProbe)
  return {
    start,
    end,
    lineStarts,
    firstLine,
    lastLine,
  }
}

function lineTextAt(value = '', lineStarts = [], lineIndex = 0) {
  const text = String(value || '')
  const start = lineStarts[lineIndex] ?? 0
  const nextLineStart = lineStarts[lineIndex + 1]
  const endExclusive = Number.isFinite(nextLineStart) ? Math.max(start, nextLineStart - 1) : text.length
  return {
    start,
    text: text.slice(start, endExclusive),
  }
}

function applyTextOperations(value = '', selectionStart = 0, selectionEnd = 0, operations = []) {
  const text = String(value || '')
  const sorted = [...operations]
    .filter((operation) => operation && typeof operation === 'object')
    .map((operation) => ({
      index: clampOffset(text, operation.index),
      deleteCount: Math.max(0, Number(operation.deleteCount || 0) || 0),
      insertText: String(operation.insertText || ''),
    }))
    .sort((a, b) => a.index - b.index)

  let cursor = 0
  let nextValue = ''
  for (const operation of sorted) {
    nextValue += text.slice(cursor, operation.index)
    nextValue += operation.insertText
    cursor = Math.min(text.length, operation.index + operation.deleteCount)
  }
  nextValue += text.slice(cursor)

  const remapPoint = (initialPoint) => {
    let point = clampOffset(text, initialPoint)
    let cumulativeDelta = 0
    for (const operation of sorted) {
      const opStart = operation.index + cumulativeDelta
      const opEnd = opStart + operation.deleteCount
      const insertLen = operation.insertText.length
      if (point < opStart) {
        // no-op
      } else if (point <= opEnd) {
        point = opStart + insertLen
      } else {
        point += insertLen - operation.deleteCount
      }
      cumulativeDelta += insertLen - operation.deleteCount
    }
    return Math.max(0, Math.min(nextValue.length, point))
  }

  return {
    value: nextValue,
    selectionStart: remapPoint(selectionStart),
    selectionEnd: remapPoint(selectionEnd),
  }
}

export function commentPrefixForLanguage(language = '') {
  const normalized = String(language || '').trim().toLowerCase()
  return COMMENT_PREFIX_BY_LANGUAGE[normalized] || '//'
}

export function applyCodeTabAction({
  value = '',
  selectionStart = 0,
  selectionEnd = 0,
  shiftKey = false,
} = {}) {
  const text = String(value || '')
  const { start, end, lineStarts, firstLine, lastLine } = resolveLineRange(text, selectionStart, selectionEnd)
  const operations = []

  if (!shiftKey) {
    if (start === end) {
      operations.push({ index: start, deleteCount: 0, insertText: INDENT_UNIT })
    } else {
      for (let line = firstLine; line <= lastLine; line += 1) {
        operations.push({ index: lineStarts[line], deleteCount: 0, insertText: INDENT_UNIT })
      }
    }
  } else {
    for (let line = firstLine; line <= lastLine; line += 1) {
      const { start: lineStart, text: lineText } = lineTextAt(text, lineStarts, line)
      let deleteCount = 0
      if (lineText.startsWith('\t')) deleteCount = 1
      else if (lineText.startsWith(INDENT_UNIT)) deleteCount = INDENT_UNIT.length
      else if (lineText.startsWith(' ')) deleteCount = 1
      if (deleteCount > 0) {
        operations.push({ index: lineStart, deleteCount, insertText: '' })
      }
    }
  }

  if (operations.length === 0) {
    return {
      handled: true,
      value: text,
      selectionStart: start,
      selectionEnd: end,
      reason: shiftKey ? 'tab_outdent_noop' : 'tab_indent_noop',
    }
  }

  const applied = applyTextOperations(text, start, end, operations)
  return {
    handled: true,
    ...applied,
    reason: shiftKey ? 'tab_outdent' : 'tab_indent',
  }
}

export function applyCodeEnterAction({
  value = '',
  selectionStart = 0,
  selectionEnd = 0,
} = {}) {
  const text = String(value || '')
  const { start, end } = normalizeSelection(text, selectionStart, selectionEnd)
  const lineStart = Math.max(0, text.lastIndexOf('\n', Math.max(0, start - 1)) + 1)
  const beforeCursor = text.slice(lineStart, start)
  const indentMatch = beforeCursor.match(/^[\t ]*/)
  const leadingIndent = indentMatch ? indentMatch[0] : ''
  const trimmedBeforeCursor = beforeCursor.trimEnd()
  const needsExtraIndent = /(?:\{|\[|\(|:)$/.test(trimmedBeforeCursor)
  const insertion = `\n${leadingIndent}${needsExtraIndent ? INDENT_UNIT : ''}`

  const applied = applyTextOperations(text, start, end, [{
    index: start,
    deleteCount: Math.max(0, end - start),
    insertText: insertion,
  }])

  return {
    handled: true,
    ...applied,
    reason: needsExtraIndent ? 'enter_extra_indent' : 'enter_indent',
  }
}

export function applyCodeCommentToggleAction({
  value = '',
  selectionStart = 0,
  selectionEnd = 0,
  language = '',
} = {}) {
  const text = String(value || '')
  const { start, end, lineStarts, firstLine, lastLine } = resolveLineRange(text, selectionStart, selectionEnd)
  const commentPrefix = commentPrefixForLanguage(language)
  const descriptors = []

  for (let line = firstLine; line <= lastLine; line += 1) {
    const row = lineTextAt(text, lineStarts, line)
    const indentMatch = row.text.match(/^[\t ]*/)
    const indent = indentMatch ? indentMatch[0] : ''
    const content = row.text.slice(indent.length)
    descriptors.push({
      lineStart: row.start,
      indentLength: indent.length,
      content,
      empty: content.trim().length === 0,
    })
  }

  const nonEmpty = descriptors.filter((descriptor) => !descriptor.empty)
  if (nonEmpty.length === 0) {
    return {
      handled: true,
      value: text,
      selectionStart: start,
      selectionEnd: end,
      reason: 'comment_toggle_noop',
    }
  }

  const allCommented = nonEmpty.every((descriptor) => descriptor.content.startsWith(commentPrefix))
  const operations = []

  if (allCommented) {
    for (const descriptor of nonEmpty) {
      let deleteCount = commentPrefix.length
      const afterPrefix = descriptor.content.slice(commentPrefix.length)
      if (afterPrefix.startsWith(' ')) deleteCount += 1
      operations.push({
        index: descriptor.lineStart + descriptor.indentLength,
        deleteCount,
        insertText: '',
      })
    }
  } else {
    const insertToken = `${commentPrefix} `
    for (const descriptor of nonEmpty) {
      operations.push({
        index: descriptor.lineStart + descriptor.indentLength,
        deleteCount: 0,
        insertText: insertToken,
      })
    }
  }

  const applied = applyTextOperations(text, start, end, operations)
  return {
    handled: true,
    ...applied,
    reason: allCommented ? 'comment_unset' : 'comment_set',
  }
}

export function applyCodeBlockKeymap({
  value = '',
  selectionStart = 0,
  selectionEnd = 0,
  key = '',
  shiftKey = false,
  ctrlKey = false,
  metaKey = false,
  altKey = false,
  language = '',
} = {}) {
  const normalizedKey = String(key || '')
  const hasModifier = !!(ctrlKey || metaKey || altKey)
  if (normalizedKey === 'Tab' && !ctrlKey && !metaKey && !altKey) {
    return applyCodeTabAction({
      value,
      selectionStart,
      selectionEnd,
      shiftKey,
    })
  }
  if (normalizedKey === 'Enter' && !hasModifier) {
    return applyCodeEnterAction({
      value,
      selectionStart,
      selectionEnd,
    })
  }
  if ((ctrlKey || metaKey) && !altKey && normalizedKey === '/') {
    return applyCodeCommentToggleAction({
      value,
      selectionStart,
      selectionEnd,
      language,
    })
  }
  return {
    handled: false,
    value: String(value || ''),
    selectionStart: clampOffset(value, selectionStart),
    selectionEnd: clampOffset(value, selectionEnd),
    reason: 'unhandled',
  }
}
