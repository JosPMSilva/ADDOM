import {
  elementChildren,
  findCheckboxInput,
  firstElementChild,
  firstTextDescendantNode,
  getAttribute,
  hasTruthyAttribute,
} from './final-document-semantic-snapshot-dom.mjs'
import {
  collectInlineTokens,
  collectNodeText,
  inlinesToText,
  normalizeBlockText,
  normalizeCodeLanguage,
  normalizeCodeText,
  recordControlAnnotation,
  shouldSkipExecutionOwnedNode,
} from './final-document-semantic-snapshot-inline.mjs'

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

export function collectBlocks(nodes, state, path = [], depth = 1) {
  const blocks = []
  let emittedIndex = 0
  for (const node of nodes || []) {
    const blockPath = [...path, emittedIndex]
    const block = collectBlock(node, state, blockPath, depth)
    if (!block) continue
    if (Array.isArray(block)) {
      blocks.push(...block)
      emittedIndex += block.length
      continue
    }
    blocks.push(block)
    emittedIndex += 1
  }
  return blocks
}

export function collectBlock(node, state, path, depth) {
  if (!node) return null
  if (node.type === 'text') {
    const text = normalizeBlockText(node.text)
    return text ? createParagraphBlock([{ kind: 'text', text }], path) : null
  }
  if (node.type !== 'element') return null
  const tagName = String(node.tagName || '').toLowerCase()
  if (shouldSkipExecutionOwnedNode(node)) return null
  if (HEADING_TAGS.has(tagName)) {
    const level = Number.parseInt(tagName.slice(1), 10) || 1
    const inlines = collectInlineTokens(node.children || [], state, [...path, 'inlines'])
    return createHeadingBlock(level, inlines, path)
  }
  if (tagName === 'p') {
    return createParagraphFromNode(node, state, path)
  }
  if (tagName === 'blockquote') {
    return createBlockquoteBlock(collectBlocks(node.children || [], state, [...path, 'blocks'], depth + 1), path)
  }
  if (tagName === 'ul' || tagName === 'ol') {
    return createListBlock(node, state, path, depth)
  }
  if (tagName === 'table') {
    return createTableBlock(node, state, path)
  }
  if (tagName === 'pre') {
    return createCodeBlock(node, path)
  }
  if (tagName === 'hr') {
    return { kind: 'thematic_break', index: path.at(-1) ?? 0 }
  }
  if (tagName === 'li') {
    return createParagraphFromNode(node, state, path)
  }
  if (tagName === 'button' || getAttribute(node, 'role') === 'button') {
    recordControlAnnotation(node, state, path)
    return null
  }
  if (tagName === 'input' || hasTruthyAttribute(node, 'data-chat-control') || hasTruthyAttribute(node, 'data-control')) return null
  const childBlocks = collectBlocks(node.children || [], state, [...path, 'children'], depth + 1)
  if (childBlocks.length > 0) return childBlocks
  const inlineTokens = collectInlineTokens(node.children || [], state, [...path, 'inlines'])
  const text = normalizeBlockText(inlinesToText(inlineTokens))
  return text ? createParagraphBlock(inlineTokens, path) : null
}

export function createHeadingBlock(level, inlines, path) {
  return {
    kind: 'heading',
    index: path.at(-1) ?? 0,
    level,
    inlines,
    text: normalizeBlockText(inlinesToText(inlines)),
  }
}

export function createParagraphBlock(inlines, path) {
  return {
    kind: 'paragraph',
    index: path.at(-1) ?? 0,
    inlines,
    text: normalizeBlockText(inlinesToText(inlines)),
  }
}

export function createParagraphFromNode(node, state, path) {
  const inlines = collectInlineTokens(node.children || [], state, [...path, 'inlines'])
  return createParagraphBlock(inlines, path)
}

export function createBlockquoteBlock(blocks, path) {
  return {
    kind: 'blockquote',
    index: path.at(-1) ?? 0,
    blocks,
  }
}

export function createListBlock(node, state, path, depth) {
  const ordered = String(node.tagName || '').toLowerCase() === 'ol'
  const start = ordered ? Number.parseInt(getAttribute(node, 'start') || '1', 10) || 1 : null
  const items = []
  state.snapshot.stats.maxListDepth = Math.max(state.snapshot.stats.maxListDepth, depth)
  let itemIndex = 0
  for (const child of node.children || []) {
    if (String(child.tagName || '').toLowerCase() !== 'li') continue
    items.push(createListItem(child, state, [...path, 'items', itemIndex], itemIndex, depth + 1))
    itemIndex += 1
  }
  return {
    kind: 'list',
    index: path.at(-1) ?? 0,
    ordered,
    ...(ordered ? { start } : {}),
    items,
    depth,
  }
}

export function createListItem(node, state, path, index, depth) {
  const checkbox = findCheckboxInput(node.children || [])
  const contentNodes = checkbox ? (node.children || []).filter((child) => child !== checkbox) : (node.children || [])
  const blocks = collectBlocks(contentNodes, state, [...path, 'blocks'], depth)
  return {
    kind: 'list_item',
    index,
    task: !!checkbox,
    ...(checkbox ? { checked: hasTruthyAttribute(checkbox, 'checked') } : {}),
    blocks,
  }
}

export function createTableBlock(node, state, path) {
  const thead = firstElementChild(node.children || [], 'thead')
  const tbody = firstElementChild(node.children || [], 'tbody')
  const headerRow = thead ? firstElementChild(thead.children || [], 'tr') : firstElementChild(node.children || [], 'tr')
  const header = []
  if (headerRow) {
    let cellIndex = 0
    for (const cell of Array.from(headerRow.children || [])) {
      const tagName = String(cell?.tagName || '').toLowerCase()
      if (tagName !== 'th' && tagName !== 'td') continue
      header.push(createTableCell(cell, state, [...path, 'header', cellIndex], cellIndex))
      cellIndex += 1
    }
  }
  const rows = []
  const bodyRows = tbody ? elementChildren(tbody.children || [], 'tr') : elementChildren(node.children || [], 'tr')
  for (const [rowIndex, row] of bodyRows.entries()) {
    if (row === headerRow) continue
    const cells = []
    let cellIndex = 0
    for (const cell of Array.from(row.children || [])) {
      const tagName = String(cell?.tagName || '').toLowerCase()
      if (tagName !== 'th' && tagName !== 'td') continue
      cells.push(createTableCell(cell, state, [...path, 'rows', rowIndex, 'cells', cellIndex], cellIndex))
      cellIndex += 1
    }
    if (cells.length > 0) rows.push(cells)
  }
  return {
    kind: 'table',
    index: path.at(-1) ?? 0,
    header,
    rows,
    headerRowCount: header.length > 0 ? 1 : 0,
    rowCount: rows.length,
    columnCount: Math.max(header.length, ...rows.map((row) => row.length), 0),
  }
}

export function createTableCell(node, state, path, index) {
  const inlines = collectInlineTokens(node.children || [], state, [...path, 'inlines'])
  return {
    kind: 'table_cell',
    index,
    inlines,
    text: normalizeBlockText(inlinesToText(inlines)),
  }
}

export function createCodeBlock(node, path) {
  const codeNode = firstElementChild(node.children || [], 'code') || firstTextDescendantNode(node)
  const targetNode = codeNode || node
  const language = normalizeCodeLanguage(getAttribute(targetNode, 'class') || getAttribute(node, 'class') || '')
  const text = normalizeCodeText(collectNodeText(targetNode))
  return {
    kind: 'code_block',
    index: path.at(-1) ?? 0,
    language,
    text,
    lineCount: text.length === 0 ? 0 : text.split('\n').length,
  }
}

export function countBlocks(blocks) {
  let count = 0
  for (const block of blocks || []) {
    if (!block) continue
    count += 1
    if (block.kind === 'blockquote') {
      count += countBlocks(block.blocks || [])
    }
    if (block.kind === 'list') {
      for (const item of block.items || []) {
        count += countBlocks(item.blocks || [])
      }
    }
  }
  return count
}

export function countBlocksOfKind(blocks, kind) {
  let count = 0
  for (const block of blocks || []) {
    if (!block) continue
    if (block.kind === kind) count += 1
    if (block.kind === 'blockquote') count += countBlocksOfKind(block.blocks || [], kind)
    if (block.kind === 'list') {
      for (const item of block.items || []) {
        count += countBlocksOfKind(item.blocks || [], kind)
      }
    }
  }
  return count
}

export function maxListDepth(blocks, depth = 0) {
  let maxDepth = depth
  for (const block of blocks || []) {
    if (!block) continue
    if (block.kind === 'list') {
      maxDepth = Math.max(maxDepth, Number(block.depth || depth + 1))
      for (const item of block.items || []) {
        maxDepth = Math.max(maxDepth, maxListDepth(item.blocks || [], Number(block.depth || depth + 1)))
      }
    }
    if (block.kind === 'blockquote') {
      maxDepth = Math.max(maxDepth, maxListDepth(block.blocks || [], depth))
    }
  }
  return maxDepth
}
