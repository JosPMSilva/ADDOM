import React, { useEffect, useState } from 'react'
import { MemoProseMarkdown as MemoLazyProseMarkdown } from '../markdown/LazyMarkdownRenderer.jsx'
import { sanitizePreviewHref } from '../editor/editor-markdown-preview-utils.mjs'
const MARKDOWN_HEADING_RE = /(^|\n)\s{0,3}#{1,6}\s+\S/m
const MARKDOWN_LIST_RE = /(^|\n)\s{0,3}(?:[-*+]\s+\S|\d+\.\s+\S)/m
const MARKDOWN_BLOCKQUOTE_RE = /(^|\n)\s{0,3}>\s+\S/m
const MARKDOWN_FENCE_RE = /(^|\n)\s*(```|~~~)/
const MARKDOWN_LINK_RE = /!?\[[^\]]+\]\([^)]+\)/
const MARKDOWN_INLINE_CODE_RE = /`[^`\n]+`/
const MARKDOWN_EMPHASIS_RE = /(?:^|[^\w\\])(?:\*\*[^*\n]+?\*\*|__[^_\n]+?__)(?=$|[^\w])/
const MARKDOWN_TABLE_DIVIDER_LINE_RE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+(?:\s*:?-{3,}:?\s*)\|?\s*$/
const STREAMED_PROSE_SENTENCE_STARTERS_RE = /([a-z0-9])((?:Now|Next|Then|Finally|Perfect|Excellent|Great|Good|Okay|Let me|I['’]ll|I will)\b)/g

function containsMarkdownTable(text = '') {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())

  for (let index = 1; index < lines.length - 1; index += 1) {
    const previousLine = lines[index - 1]
    const currentLine = lines[index]
    const nextLine = lines[index + 1]
    if (!previousLine || !currentLine || !nextLine) continue
    if (!currentLine.includes('|') || !MARKDOWN_TABLE_DIVIDER_LINE_RE.test(currentLine)) continue
    if (previousLine.includes('|') && nextLine.includes('|')) return true
  }

  return false
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || '').trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) return null
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

export function tryParseDispatchJson(text) {
  const parsed = parseJsonObjectFromText(text)
  if (
    parsed
    && typeof parsed === 'object'
    && Array.isArray(parsed.tasks)
    && parsed.tasks.length > 0
    && parsed.tasks[0]?.instruction
  ) {
    return parsed
  }
  return null
}

export function tryParseCouncilJson(text) {
  const parsed = parseJsonObjectFromText(text)
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.memberOutputs) && parsed.memberOutputs.length > 0) {
    return parsed
  }
  return null
}

export function tryParseReviewJson(text) {
  const parsed = parseJsonObjectFromText(text)
  if (
    parsed
    && typeof parsed === 'object'
    && Array.isArray(parsed.steps)
    && parsed.steps.length > 0
    && parsed.steps[0]?.roleName
    && parsed.steps[0]?.output !== undefined
  ) {
    return parsed
  }
  return null
}

export function sanitizeHref(href) {
  return sanitizePreviewHref(href)
}

export const MemoProseMarkdown = React.memo(
  function ProseMarkdown(props) {
    return React.createElement(MemoLazyProseMarkdown, props)
  },
  (prev, next) => prev.text === next.text,
)

export function useStreamingRenderText(text, { enabled = false, intervalMs = 40 } = {}) {
  const [renderText, setRenderText] = useState(String(text ?? ''))
  const lastFlushAtRef = React.useRef(0)
  const timerRef = React.useRef(null)

  useEffect(() => {
    const nextText = String(text ?? '')
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      lastFlushAtRef.current = 0
      setRenderText(nextText)
      return undefined
    }

    if (nextText === renderText) return undefined

    const nowTs = Date.now()
    const elapsed = nowTs - (lastFlushAtRef.current || 0)
    if (!lastFlushAtRef.current || elapsed >= intervalMs) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      lastFlushAtRef.current = nowTs
      setRenderText(nextText)
      return undefined
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      lastFlushAtRef.current = Date.now()
      setRenderText(String(text ?? ''))
    }, Math.max(0, intervalMs - elapsed))

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [text, enabled, intervalMs, renderText])

  return enabled ? renderText : String(text ?? '')
}

export function ensureUniqueSegmentIds(segments = [], seed = 1, existingIds = new Set()) {
  const source = Array.isArray(segments) ? segments : []
  const used = existingIds instanceof Set ? existingIds : new Set()
  let counter = Math.max(1, Number(seed) || 1)

  return source.map((segment) => {
    if (!segment || typeof segment !== 'object') return segment
    const baseId = String(segment.id || '').trim()
    let nextId = baseId || `seg_${counter}`
    while (!nextId || used.has(nextId)) {
      counter += 1
      nextId = baseId ? `${baseId}__${counter}` : `seg_${counter}`
    }
    used.add(nextId)
    if (nextId === baseId) return segment
    return {
      ...segment,
      id: nextId,
    }
  })
}

export function reactNodeText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(reactNodeText).join('')
  if (React.isValidElement(node)) return reactNodeText(node.props?.children)
  return ''
}

export function childrenAreVisuallyEmpty(children) {
  const parts = React.Children.toArray(children)
  if (parts.length === 0) return true
  const hasElement = parts.some((part) => React.isValidElement(part))
  if (hasElement) return false
  return parts.map(reactNodeText).join('').trim().length === 0
}

export function childrenAreSectionLabel(children) {
  const parts = React.Children.toArray(children).filter((part) => {
    if (typeof part === 'string' || typeof part === 'number') {
      return String(part).trim().length > 0
    }
    return React.isValidElement(part)
  })
  if (parts.length !== 1 || !React.isValidElement(parts[0])) return false

  const only = parts[0]
  if (typeof only.type === 'string') {
    const tag = only.type.toLowerCase()
    return tag === 'strong' || tag === 'b'
  }

  const paragraphText = reactNodeText(children).trim()
  const elementText = reactNodeText(only).trim()
  return paragraphText.length > 0 && paragraphText === elementText
}

export function messageTextNeedsMarkdownRuntime(text = '') {
  const value = String(text ?? '')
  if (!value.trim()) return false
  if (
    MARKDOWN_FENCE_RE.test(value)
    || MARKDOWN_HEADING_RE.test(value)
    || MARKDOWN_LIST_RE.test(value)
    || MARKDOWN_BLOCKQUOTE_RE.test(value)
    || MARKDOWN_LINK_RE.test(value)
    || MARKDOWN_INLINE_CODE_RE.test(value)
    || MARKDOWN_EMPHASIS_RE.test(value)
  ) {
    return true
  }
  return containsMarkdownTable(value)
}

export function normalizeAssistantDisplayProse(text = '') {
  const paragraphs = String(text ?? '').replace(/\r\n?/g, '\n').split('\n\n')
  const joined = []
  for (const paragraph of paragraphs) {
    if (joined.length === 0) {
      joined.push(paragraph)
      continue
    }
    const right = paragraph.trimStart()
    const isMarkdownBlock = /^(?:[-*+]\s|\d+\.\s|#{1,6}\s|```|>\s)/.test(right)
    if (!isMarkdownBlock && /^[`"'([]?[A-Za-z0-9]/.test(right)) {
      const left = joined[joined.length - 1].trimEnd()
      const needsSpace = left.length > 0 && right.length > 0 && !/\s$/.test(left)
      joined[joined.length - 1] = `${left}${needsSpace ? ' ' : ''}${right}`
      continue
    }
    joined.push(paragraph)
  }
  return joined.join('\n\n')
    .replace(/([.!?])([A-Z][a-z]+)/g, '$1 $2')
    .replace(/(:)([A-Z][a-z]+)/g, '$1 $2')
    .replace(STREAMED_PROSE_SENTENCE_STARTERS_RE, '$1 $2')
}

export function renderPlainProseText(text = '', {
  keyPrefix = 'plain-prose',
  className = 'whitespace-pre-wrap break-words text-chat-text',
} = {}) {
  const value = normalizeAssistantDisplayProse(text)
  if (!value.trim()) return null
  const paragraphs = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (paragraphs.length <= 1) {
    return React.createElement('p', { key: keyPrefix, className }, value)
  }

  return paragraphs.map((paragraph, index) => React.createElement(
    'p',
    {
      key: `${keyPrefix}:${index}`,
      className: `${className}${index < paragraphs.length - 1 ? ' mb-2' : ''}`,
    },
    paragraph,
  ))
}

export function markdownCodeBlockLanguageFromPreChildren(children) {
  const parts = React.Children.toArray(children)
  const codeElement = parts.find((part) => React.isValidElement(part))
  if (!React.isValidElement(codeElement)) return 'text'
  const className = String(codeElement.props?.className || '')
  const match = className.match(/language-([a-z0-9_+.-]+)/i)
  return String(match?.[1] || 'text').toLowerCase()
}

export function markdownCodeBlockTextFromPreChildren(children) {
  const parts = React.Children.toArray(children)
  const codeElement = parts.find((part) => React.isValidElement(part))
  if (React.isValidElement(codeElement)) {
    return reactNodeText(codeElement.props?.children)
  }
  return reactNodeText(children)
}

function markdownNodeTag(node) {
  return String(node?.tagName || '').trim().toLowerCase()
}

function markdownNodeText(node) {
  if (!node || typeof node !== 'object') return ''
  if (typeof node.value === 'string') return node.value
  const children = Array.isArray(node.children) ? node.children : []
  return children.map((child) => markdownNodeText(child)).join('')
}

function markdownNodeHasAnyTag(node, tags = new Set()) {
  if (!node || typeof node !== 'object') return false
  if (tags.has(markdownNodeTag(node))) return true
  const children = Array.isArray(node.children) ? node.children : []
  return children.some((child) => markdownNodeHasAnyTag(child, tags))
}

function findFirstMarkdownTableRow(tableNode, sectionTag = 'thead') {
  const sections = Array.isArray(tableNode?.children) ? tableNode.children : []
  const section = sections.find((entry) => markdownNodeTag(entry) === sectionTag)
  if (!section) return null
  const rows = Array.isArray(section.children) ? section.children : []
  return rows.find((entry) => markdownNodeTag(entry) === 'tr') || null
}

function findMarkdownTableRows(tableNode, sectionTag = 'tbody') {
  const sections = Array.isArray(tableNode?.children) ? tableNode.children : []
  const section = sections.find((entry) => markdownNodeTag(entry) === sectionTag)
  if (!section) return []
  const rows = Array.isArray(section.children) ? section.children : []
  return rows.filter((entry) => markdownNodeTag(entry) === 'tr')
}

function findMarkdownTableCellNodes(rowNode) {
  return (Array.isArray(rowNode?.children) ? rowNode.children : [])
    .filter((entry) => {
      const tag = markdownNodeTag(entry)
      return tag === 'th' || tag === 'td'
    })
}

function countMarkdownTableColumns(tableNode) {
  const headerRow = findFirstMarkdownTableRow(tableNode, 'thead')
  if (headerRow) {
    const cells = (Array.isArray(headerRow.children) ? headerRow.children : [])
      .filter((entry) => {
        const tag = markdownNodeTag(entry)
        return tag === 'th' || tag === 'td'
      })
    if (cells.length > 0) return cells.length
  }
  const bodyRow = findFirstMarkdownTableRow(tableNode, 'tbody')
  if (!bodyRow) return 0
  return (Array.isArray(bodyRow.children) ? bodyRow.children : [])
    .filter((entry) => {
      const tag = markdownNodeTag(entry)
      return tag === 'th' || tag === 'td'
    })
    .length
}

function findMarkdownTableColumnIndexes(labels = []) {
  const normalized = Array.isArray(labels) ? labels : []
  const findIndex = (matcher) => normalized.findIndex((label) => matcher.test(String(label || '')))
  return {
    urlIndex: findIndex(/\b(url|link|source)\b/i),
    methodIndex: findIndex(/\b(method|route|strategy)\b/i),
    statusIndex: findIndex(/\b(status|http|code)\b/i),
    reasonIndex: findIndex(/\b(why|reason|purpose|note|notes|details)\b/i),
    keyIndex: findIndex(/\b(button|key|symbol|command|shortcut|glyph|hotkey|icon)\b/i),
    nameIndex: findIndex(/\b(function|name|label|action|title|description)\b/i),
    exampleIndex: findIndex(/\b(example|examples|usage|output|result|sample|samples)\b/i),
  }
}

function isMarkdownSourceLogTable(columnCount = 0, indexes = {}) {
  const {
    urlIndex = -1,
    methodIndex = -1,
    statusIndex = -1,
    reasonIndex = -1,
  } = indexes || {}
  return (
    columnCount === 4
    && urlIndex >= 0
    && methodIndex >= 0
    && statusIndex >= 0
    && reasonIndex >= 0
  )
}

function markdownTableMaxCellLength(rows = []) {
  const cellEntries = (Array.isArray(rows) ? rows : [])
    .flatMap((row) => (Array.isArray(row?.cells) ? row.cells : []))
  if (cellEntries.length === 0) return 0
  return Math.max(...cellEntries.map((cell) => String(cell?.text || '').trim().length), 0)
}

function resolveReferenceKeyColumnIndex(indexes = {}) {
  if (Number(indexes?.keyIndex) >= 0) return indexes.keyIndex
  return 0
}

function isMarkdownReferenceTable({
  columnCount = 0,
  indexes = {},
  rows = [],
} = {}) {
  if (isMarkdownSourceLogTable(columnCount, indexes)) return false
  if (columnCount < 2 || columnCount > 4) return false
  if (!Array.isArray(rows) || rows.length === 0) return false
  if (indexes.urlIndex >= 0 && indexes.statusIndex >= 0) return false

  const maxCellLength = markdownTableMaxCellLength(rows)
  if (maxCellLength >= 72) return false

  const {
    keyIndex = -1,
    nameIndex = -1,
    exampleIndex = -1,
  } = indexes || {}

  if (keyIndex >= 0) return true
  if (nameIndex >= 0 && exampleIndex >= 0) return true

  const firstColumnTexts = rows
    .map((row) => String(row?.cells?.[0]?.text || '').trim())
    .filter(Boolean)
  if (firstColumnTexts.length === 0) return false
  const maxFirstColumnLength = Math.max(...firstColumnTexts.map((text) => text.length), 0)
  const shortKeyColumn = maxFirstColumnLength > 0 && maxFirstColumnLength <= 16
  return shortKeyColumn && exampleIndex >= 0
}

function isMarkdownDefinitionPairTable({
  columnCount = 0,
  indexes = {},
  headerLabels = [],
} = {}) {
  if (columnCount !== 2) return false
  const labels = (Array.isArray(headerLabels) ? headerLabels : [])
    .map((label) => String(label || '').trim().toLowerCase())
  if (labels.length >= 2) {
    const [left, right] = labels
    if (/\bfunction\b/.test(left) && /\bpurpose\b/.test(right)) return true
    if (/\bname\b/.test(left) && /\bdescription\b/.test(right)) return true
    if (/\bterm\b/.test(left) && /\bdefinition\b/.test(right)) return true
  }
  const { nameIndex = -1, reasonIndex = -1 } = indexes || {}
  return nameIndex >= 0 && reasonIndex >= 0 && nameIndex !== reasonIndex
}

function shouldRenderMarkdownTableAsRecordList({
  columnCount = 0,
  indexes = {},
  rows = [],
  headerLabels = [],
} = {}) {
  if (isMarkdownSourceLogTable(columnCount, indexes)) return false
  if (isMarkdownReferenceTable({ columnCount, indexes, rows })) return false
  if (isMarkdownDefinitionPairTable({ columnCount, indexes, headerLabels })) return false
  if (!Array.isArray(rows) || rows.length === 0) return false

  const cellEntries = rows.flatMap((row) => Array.isArray(row?.cells) ? row.cells : [])
  if (cellEntries.length === 0) return false

  const maxCellLength = Math.max(...cellEntries.map((cell) => String(cell?.text || '').trim().length), 0)
  const verboseCellCount = cellEntries.filter((cell) => String(cell?.text || '').trim().length >= 72).length
  const richCellCount = cellEntries.filter((cell) => cell?.hasRichContent === true).length

  if (columnCount === 2 && maxCellLength >= 72) return true
  if (columnCount >= 5 && (maxCellLength >= 56 || verboseCellCount >= 2)) return true
  if (columnCount >= 4 && maxCellLength >= 72 && (verboseCellCount >= 2 || richCellCount >= 2)) return true
  return false
}

function resolveReferenceTableColumnWidths() {
  // Content-sized reference tables: let auto layout size columns from cells.
  // Forced percentage widths stretch short tables and create empty gutters.
  return []
}

function resolveMarkdownTableColumnWidths(columnCount = 0, indexes = {}, options = {}) {
  if (options.reference) return resolveReferenceTableColumnWidths(columnCount, indexes)
  if (isMarkdownSourceLogTable(columnCount, indexes)) {
    const {
      urlIndex = -1,
      methodIndex = -1,
      statusIndex = -1,
      reasonIndex = -1,
    } = indexes || {}
    const widths = new Array(4).fill('25%')
    widths[urlIndex] = '24rem'
    widths[methodIndex] = '8.5rem'
    widths[statusIndex] = '7rem'
    widths[reasonIndex] = '18rem'
    return widths
  }
  if (columnCount === 4) {
    const { urlIndex = -1, methodIndex = -1, statusIndex = -1, reasonIndex = -1 } = indexes || {}
    if (urlIndex >= 0 && methodIndex >= 0 && statusIndex >= 0 && reasonIndex >= 0) {
      const widths = new Array(4).fill('25%')
      widths[urlIndex] = '38%'
      widths[methodIndex] = '24%'
      widths[statusIndex] = '8%'
      widths[reasonIndex] = '30%'
      return widths
    }
  }
  if (columnCount === 3) {
    const { urlIndex = -1, statusIndex = -1 } = indexes || {}
    if (urlIndex >= 0 && statusIndex >= 0 && urlIndex !== statusIndex) {
      const widths = new Array(3).fill('33.33%')
      widths[urlIndex] = '52%'
      widths[statusIndex] = '12%'
      return widths
    }
  }
  if (columnCount === 2) return ['42%', '58%']
  if (columnCount === 3) return ['28%', '32%', '40%']
  if (columnCount === 4) return ['34%', '24%', '10%', '32%']
  if (columnCount === 5) return ['25%', '20%', '10%', '23%', '22%']
  return []
}

function resolveMarkdownTableVariant({ columnCount = 0, indexes = {}, rows = [], headerLabels = [] } = {}) {
  if (shouldRenderMarkdownTableAsRecordList({ columnCount, indexes, rows, headerLabels })) return 'record_list'
  if (isMarkdownSourceLogTable(columnCount, indexes)) return 'source_log'
  if (isMarkdownReferenceTable({ columnCount, indexes, rows })) return 'reference_table'
  if (isMarkdownDefinitionPairTable({ columnCount, indexes, headerLabels })) return 'definition_table'
  if (columnCount >= 5) return 'wide_matrix'
  return 'table'
}

export function resolveMarkdownTableClassName(tableNode) {
  const columnCount = countMarkdownTableColumns(tableNode)
  const headerRow = findFirstMarkdownTableRow(tableNode, 'thead')
  const headerCells = findMarkdownTableCellNodes(headerRow)
  const headerLabels = headerCells
    .map((cell) => markdownNodeText(cell).trim())
    .filter(Boolean)
  const labels = headerLabels.map((label) => label.toLowerCase())
  const indexes = findMarkdownTableColumnIndexes(labels)
  const rows = findMarkdownTableRows(tableNode, 'tbody').map((rowNode, rowIndex) => {
    const cells = findMarkdownTableCellNodes(rowNode).map((cellNode, cellIndex) => ({
      headerLabel: headerLabels[cellIndex] || `Column ${cellIndex + 1}`,
      text: markdownNodeText(cellNode).trim(),
      children: Array.isArray(cellNode?.children) ? cellNode.children : [],
      hasRichContent: markdownNodeHasAnyTag(cellNode, new Set(['a', 'code', 'br', 'strong', 'em', 'ul', 'ol', 'blockquote'])),
      rowIndex,
      cellIndex,
    }))
    return {
      rowIndex,
      cells,
      primaryCell: cells[0] || null,
    }
  })
  const classes = ['chat-markdown-table']
  const wrapperClasses = ['chat-markdown-table-wrap']
  const variant = resolveMarkdownTableVariant({ columnCount, indexes, rows, headerLabels })
  if (variant === 'record_list') {
    return {
      variant,
      className: '',
      wrapperClassName: 'chat-markdown-record-list',
      columnWidths: [],
      headerLabels,
      rows,
    }
  }
  const isSourceLog = variant === 'source_log'
  const isReference = variant === 'reference_table'
  const isDefinition = variant === 'definition_table'
  const isWide = variant === 'wide_matrix'
  if (isSourceLog) classes.push('chat-markdown-table--source-log')
  if (isReference) classes.push('chat-markdown-table--reference')
  if (isDefinition) classes.push('chat-markdown-table--definition')
  if (isWide) classes.push('chat-markdown-table--wide')
  if (isSourceLog) wrapperClasses.push('chat-markdown-table-wrap--source-log')
  if (isReference) wrapperClasses.push('chat-markdown-table-wrap--reference')
  if (isDefinition) wrapperClasses.push('chat-markdown-table-wrap--definition')
  if (isWide) wrapperClasses.push('chat-markdown-table-wrap--wide')
  if (indexes.urlIndex >= 0) classes.push(`chat-markdown-table--url-col-${indexes.urlIndex + 1}`)
  if (indexes.methodIndex >= 0) classes.push(`chat-markdown-table--method-col-${indexes.methodIndex + 1}`)
  if (indexes.statusIndex >= 0) classes.push(`chat-markdown-table--status-col-${indexes.statusIndex + 1}`)
  if (isReference) {
    const keyColumnIndex = resolveReferenceKeyColumnIndex(indexes)
    classes.push(`chat-markdown-table--key-col-${keyColumnIndex + 1}`)
  }
  return {
    variant,
    className: classes.join(' '),
    wrapperClassName: wrapperClasses.join(' '),
    columnWidths: resolveMarkdownTableColumnWidths(columnCount, indexes, { reference: isReference }),
    headerLabels,
    rows,
    keyIndex: isReference ? resolveReferenceKeyColumnIndex(indexes) : -1,
    nameIndex: isReference ? Number(indexes.nameIndex) : -1,
  }
}

export function isPdfContentPart(part = {}) {
  const mediaType = String(part?.mediaType || part?.mimeType || '').trim().toLowerCase()
  const fileName = String(part?.filename || part?.fileName || '').trim().toLowerCase()
  return mediaType === 'application/pdf' || fileName.endsWith('.pdf')
}

export function isImageContentPart(part = {}) {
  const type = String(part?.type || '').trim().toLowerCase()
  if (type === 'image') return true
  const mediaType = String(part?.mediaType || part?.mimeType || '').trim().toLowerCase()
  return mediaType.startsWith('image/')
}

export function resolveFileAttachmentBadgeText(part = {}) {
  if (isPdfContentPart(part)) return 'PDF'
  const fileName = String(part?.filename || part?.fileName || '').trim()
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex > 0 && dotIndex < (fileName.length - 1)) {
    const extension = fileName.slice(dotIndex + 1).trim()
    if (/^[a-z0-9]{1,10}$/i.test(extension)) {
      return extension.toUpperCase()
    }
  }
  return 'FILE'
}

export function resolveImagePartSource(part = {}) {
  const previewUrl = String(part?.previewUrl || '').trim()
  const attachmentId = String(part?.attachmentId || '').trim()
  if (previewUrl) {
    if (attachmentId && /^file:/i.test(previewUrl)) {
      return `addom-attachment://attachment/${encodeURIComponent(attachmentId)}`
    }
    return previewUrl
  }
  const image = String(part?.image || '').trim()
  if (!image) return ''
  return image.startsWith('data:')
    ? image
    : `data:${part.mediaType || part.mimeType || 'image/png'};base64,${image}`
}
