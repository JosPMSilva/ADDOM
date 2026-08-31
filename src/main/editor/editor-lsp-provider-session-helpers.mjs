import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function cleanString(value = '') {
  return String(value || '').trim()
}

function shouldUseWindowsShell(command = '') {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(cleanString(command))
}

function encodeMessage(payload = {}) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8')
  return Buffer.concat([header, body])
}

function parseContentLength(headerText = '') {
  const lines = String(headerText || '').split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^content-length:\s*(\d+)$/i)
    if (match) return Number(match[1] || 0)
  }
  return 0
}

function createLineMap(text = '') {
  const normalizedText = String(text ?? '')
  const lineStarts = [0]
  for (let index = 0; index < normalizedText.length; index += 1) {
    if (normalizedText.charCodeAt(index) === 10) {
      lineStarts.push(index + 1)
    }
  }
  return {
    text: normalizedText,
    lineStarts,
  }
}

function lineColumnToOffset(lineMap, lineNumber = 1, column = 1) {
  const safeLineNumber = Math.max(1, Number(lineNumber || 1) || 1)
  const safeColumn = Math.max(1, Number(column || 1) || 1)
  const text = String(lineMap?.text ?? '')
  const lineStarts = Array.isArray(lineMap?.lineStarts) ? lineMap.lineStarts : [0]
  const lineStart = lineStarts[safeLineNumber - 1] ?? text.length
  const nextLineStart = lineStarts[safeLineNumber] ?? text.length
  const maxColumn = Math.max(1, nextLineStart - lineStart + 1)
  return Math.max(0, lineStart + Math.min(safeColumn, maxColumn) - 1)
}

function toLspPosition(lineNumber = 1, column = 1) {
  return {
    line: Math.max(0, Number(lineNumber || 1) - 1),
    character: Math.max(0, Number(column || 1) - 1),
  }
}

function fromLspRange(range = null) {
  if (!range || typeof range !== 'object') return null
  return {
    startLineNumber: Math.max(1, Number(range?.start?.line ?? 0) + 1),
    startColumn: Math.max(1, Number(range?.start?.character ?? 0) + 1),
    endLineNumber: Math.max(1, Number(range?.end?.line ?? range?.start?.line ?? 0) + 1),
    endColumn: Math.max(1, Number(range?.end?.character ?? range?.start?.character ?? 0) + 1),
  }
}

function filePathFromUri(uri = '') {
  const normalizedUri = cleanString(uri)
  if (!normalizedUri) return ''
  try {
    return path.resolve(fileURLToPath(normalizedUri))
  } catch {
    return ''
  }
}

function createLocationFromLsp(location = null) {
  const targetUri = cleanString(location?.targetUri || location?.uri)
  const targetRange = location?.targetSelectionRange || location?.targetRange || location?.range || null
  const range = fromLspRange(targetRange)
  if (!targetUri || !range) return null
  return {
    uri: targetUri,
    filePath: filePathFromUri(targetUri),
    range,
  }
}

function appendHoverContent(contents = [], value = '') {
  const normalizedValue = cleanString(value)
  if (!normalizedValue) return
  contents.push({ value: normalizedValue })
}

function normalizeHoverContents(hover = null) {
  const source = hover?.contents
  const contents = []
  if (typeof source === 'string') {
    appendHoverContent(contents, source)
    return contents
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      if (typeof item === 'string') appendHoverContent(contents, item)
      else if (item && typeof item === 'object' && typeof item.language === 'string') {
        appendHoverContent(contents, `\`\`\`${cleanString(item.language)}\n${cleanString(item.value)}\n\`\`\``)
      } else if (item && typeof item === 'object') {
        appendHoverContent(contents, item.value)
      }
    }
    return contents
  }
  if (source && typeof source === 'object' && typeof source.language === 'string') {
    appendHoverContent(contents, `\`\`\`${cleanString(source.language)}\n${cleanString(source.value)}\n\`\`\``)
    return contents
  }
  if (source && typeof source === 'object') {
    appendHoverContent(contents, source.value)
  }
  return contents
}

function createOutlineKindMeta(kind = 0) {
  const numericKind = Math.max(0, Number(kind || 0) || 0)
  if (numericKind === 2) return { kind: 'module', kindLabel: 'Module', kindBadge: { label: 'M', className: 'border-info-border bg-info-bg text-info-soft' } }
  if (numericKind === 5) return { kind: 'class', kindLabel: 'Class', kindBadge: { label: 'C', className: 'border-accent-muted/40 bg-accent-muted/12 text-accent-soft' } }
  if (numericKind === 6 || numericKind === 12) return { kind: 'function', kindLabel: 'Function', kindBadge: { label: 'f', className: 'border-[#1f3a34] bg-[#08211b] text-[#86efac]' } }
  if (numericKind === 7) return { kind: 'property', kindLabel: 'Property', kindBadge: { label: '#', className: 'border-[#2b2238] bg-[#170f24] text-[#d8b4fe]' } }
  if (numericKind === 13) return { kind: 'var', kindLabel: 'Var', kindBadge: { label: 'v', className: 'border-surface-border bg-surface-panel text-text-secondary' } }
  if (numericKind === 14) return { kind: 'const', kindLabel: 'Const', kindBadge: { label: 'v', className: 'border-surface-border bg-surface-panel text-text-secondary' } }
  return { kind: 'symbol', kindLabel: 'Symbol', kindBadge: { label: 's', className: 'border-surface-border bg-surface-panel text-text-muted' } }
}

function createOutlineNode(item = null, lineMap = null, pathParts = []) {
  if (!item || typeof item !== 'object') return null
  const range = fromLspRange(item.range)
  const selectionRange = fromLspRange(item.selectionRange || item.range)
  if (!range || !selectionRange) return null

  const startOffset = lineColumnToOffset(lineMap, range.startLineNumber, range.startColumn)
  const endOffset = Math.max(startOffset + 1, lineColumnToOffset(lineMap, range.endLineNumber, range.endColumn))
  const selectionStartOffset = lineColumnToOffset(lineMap, selectionRange.startLineNumber, selectionRange.startColumn)
  const selectionEndOffset = Math.max(selectionStartOffset + 1, lineColumnToOffset(lineMap, selectionRange.endLineNumber, selectionRange.endColumn))
  const children = (Array.isArray(item.children) ? item.children : [])
    .map((child, index) => createOutlineNode(child, lineMap, [...pathParts, index]))
    .filter(Boolean)
  const kindMeta = createOutlineKindMeta(item.kind)

  return {
    id: `outline-${pathParts.join('.') || '0'}-${selectionStartOffset}-${selectionEndOffset}`,
    name: cleanString(item.name) || '(anonymous)',
    kind: kindMeta.kind,
    kindLabel: kindMeta.kindLabel,
    kindBadge: kindMeta.kindBadge,
    modifiers: [],
    detail: cleanString(item.detail),
    rangeStartOffset: startOffset,
    rangeEndOffset: endOffset,
    selectionStartOffset,
    selectionEndOffset,
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.endLineNumber,
    endColumn: range.endColumn,
    selectionLineNumber: selectionRange.startLineNumber,
    selectionColumn: selectionRange.startColumn,
    children,
  }
}

function createOutlineNodeFromSymbolInformation(item = null, lineMap = null, pathParts = []) {
  if (!item || typeof item !== 'object') return null
  const range = fromLspRange(item?.location?.range)
  if (!range) return null
  return createOutlineNode({
    name: item.name,
    kind: item.kind,
    range: item.location.range,
    selectionRange: item.location.range,
    children: [],
  }, lineMap, pathParts)
}

function compareTextEditDescending(left = {}, right = {}) {
  const leftRange = fromLspRange(left.range) || fromLspRange(left) || null
  const rightRange = fromLspRange(right.range) || fromLspRange(right) || null
  const leftStartLine = Number(leftRange?.startLineNumber || 0)
  const rightStartLine = Number(rightRange?.startLineNumber || 0)
  if (leftStartLine !== rightStartLine) return rightStartLine - leftStartLine
  const leftStartColumn = Number(leftRange?.startColumn || 0)
  const rightStartColumn = Number(rightRange?.startColumn || 0)
  return rightStartColumn - leftStartColumn
}

function applyTextEdits(content = '', edits = []) {
  const baseContent = String(content ?? '')
  const lineMap = createLineMap(baseContent)
  let nextContent = baseContent
  const sortedEdits = Array.isArray(edits)
    ? edits
      .filter((edit) => edit && typeof edit === 'object' && edit.range)
      .sort(compareTextEditDescending)
    : []

  for (const edit of sortedEdits) {
    const range = fromLspRange(edit.range)
    if (!range) continue
    const startOffset = lineColumnToOffset(lineMap, range.startLineNumber, range.startColumn)
    const endOffset = lineColumnToOffset(lineMap, range.endLineNumber, range.endColumn)
    const nextText = typeof edit.newText === 'string'
      ? edit.newText
      : typeof edit.text === 'string'
        ? edit.text
        : ''
    nextContent = `${nextContent.slice(0, startOffset)}${nextText}${nextContent.slice(endOffset)}`
  }

  return nextContent
}

function extractWorkspaceEditTextEdits(workspaceEdit = null, documentUri = '') {
  const normalizedUri = cleanString(documentUri)
  if (!workspaceEdit || typeof workspaceEdit !== 'object' || !normalizedUri) return []

  const directChanges = workspaceEdit?.changes && typeof workspaceEdit.changes === 'object'
    ? workspaceEdit.changes[normalizedUri]
    : null
  if (Array.isArray(directChanges)) return directChanges

  const documentChanges = Array.isArray(workspaceEdit?.documentChanges)
    ? workspaceEdit.documentChanges
    : []
  for (const change of documentChanges) {
    if (!change || typeof change !== 'object') continue
    const textDocumentUri = cleanString(change?.textDocument?.uri)
    if (textDocumentUri === normalizedUri && Array.isArray(change.edits)) {
      return change.edits
    }
    if (cleanString(change.kind)) continue
  }

  return []
}

function buildWorkspaceEditResult(workspaceEdit = null, document = null) {
  const documentUri = cleanString(document?.uri)
  if (!documentUri) return null
  const edits = extractWorkspaceEditTextEdits(workspaceEdit, documentUri)
  if (!Array.isArray(edits) || edits.length === 0) return null
  const fullText = applyTextEdits(document?.content, edits)
  return {
    changed: fullText !== String(document?.content ?? ''),
    fullText,
  }
}

function normalizeCodeActionKind(value = '') {
  const normalizedValue = cleanString(value)
  return normalizedValue || 'quickfix'
}

function extractWorkspaceEditFromCodeAction(action = null) {
  if (!action || typeof action !== 'object') return null
  if (action.edit && typeof action.edit === 'object') return action.edit

  const commandName = cleanString(action?.command?.command)
  const commandArguments = Array.isArray(action?.command?.arguments)
    ? action.command.arguments
    : []
  if (commandName === 'java.apply.workspaceEdit') {
    const workspaceEditArg = commandArguments.find((entry) => entry && typeof entry === 'object')
    if (workspaceEditArg?.edit && typeof workspaceEditArg.edit === 'object') return workspaceEditArg.edit
    if (workspaceEditArg && typeof workspaceEditArg === 'object') return workspaceEditArg
  }

  return null
}

function createDefaultInitializeParams({ workspaceRoot = '', workspaceFolders = [] } = {}) {
  const rootPath = cleanString(workspaceRoot)
  const rootUri = rootPath ? pathToFileURL(path.resolve(rootPath)).href : null
  return {
    processId: process.pid,
    clientInfo: { name: 'addom_desktop' },
    rootPath: rootPath || null,
    rootUri,
    capabilities: {
      workspace: {
        configuration: true,
        workspaceFolders: true,
        applyEdit: false,
      },
      window: {
        workDoneProgress: true,
      },
      textDocument: {
        hover: { contentFormat: ['markdown', 'plaintext'] },
        definition: { linkSupport: true },
        references: {},
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        formatting: {
          dynamicRegistration: false,
        },
        codeAction: {
          dynamicRegistration: false,
          codeActionLiteralSupport: {
            codeActionKind: {
              valueSet: [
                '',
                'quickfix',
                'refactor',
                'refactor.extract',
                'refactor.inline',
                'refactor.rewrite',
                'source',
                'source.organizeImports',
                'source.fixAll',
              ],
            },
          },
          resolveSupport: {
            properties: ['edit', 'command'],
          },
          dataSupport: true,
          isPreferredSupport: true,
        },
        synchronization: {
          didSave: true,
        },
      },
    },
    workspaceFolders,
  }
}

function normalizeWorkspaceFolders(workspaceRoot = '') {
  const rootPath = cleanString(workspaceRoot)
  const rootUri = rootPath ? pathToFileURL(path.resolve(rootPath)).href : null
  return rootUri
    ? [{ uri: rootUri, name: path.basename(rootPath) || path.basename(rootUri) }]
    : []
}



export {
  applyTextEdits,
  buildWorkspaceEditResult,
  cleanString,
  createDefaultInitializeParams,
  createLineMap,
  createLocationFromLsp,
  createOutlineNode,
  createOutlineNodeFromSymbolInformation,
  encodeMessage,
  extractWorkspaceEditFromCodeAction,
  fromLspRange,
  lineColumnToOffset,
  normalizeCodeActionKind,
  normalizeHoverContents,
  normalizeWorkspaceFolders,
  parseContentLength,
  shouldUseWindowsShell,
  toLspPosition,
}
