import { spawn } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function cleanString(value = '') {
  return String(value || '').trim()
}

function shouldUseWindowsShell(command = '') {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(cleanString(command))
}

function encodeMessage(payload = {}) {
  return Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8')
}

function parseContentLength(headerText = '') {
  const lines = String(headerText || '').split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^content-length:\s*(\d+)$/i)
    if (match) return Number(match[1] || 0)
  }
  return 0
}

function scriptKindNameForLanguage(language = '', filePath = '') {
  const normalizedLanguage = cleanString(language).toLowerCase()
  const normalizedFilePath = cleanString(filePath).toLowerCase()
  if (normalizedFilePath.endsWith('.tsx')) return 'TSX'
  if (normalizedFilePath.endsWith('.jsx')) return 'JSX'
  if (normalizedLanguage === 'typescript' || normalizedFilePath.endsWith('.ts')) return 'TS'
  return 'JS'
}

function flattenDisplayParts(parts = []) {
  if (typeof parts === 'string') return parts
  return (Array.isArray(parts) ? parts : [])
    .map((part) => cleanString(part?.text || ''))
    .filter(Boolean)
    .join('')
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

function clampOffset(offset = 0, text = '') {
  const maxOffset = String(text ?? '').length
  return Math.max(0, Math.min(maxOffset, Number(offset || 0) || 0))
}

function offsetToLineColumn(lineMap, offset = 0) {
  const text = String(lineMap?.text ?? '')
  const safeOffset = clampOffset(offset, text)
  const lineStarts = Array.isArray(lineMap?.lineStarts) ? lineMap.lineStarts : [0]
  let lineIndex = 0
  for (let i = 0; i < lineStarts.length; i += 1) {
    if (lineStarts[i] > safeOffset) break
    lineIndex = i
  }
  const lineStart = lineStarts[lineIndex] ?? 0
  return {
    lineNumber: lineIndex + 1,
    column: Math.max(1, safeOffset - lineStart + 1),
  }
}

function lineColumnToOffset(lineMap, lineNumber = 1, column = 1) {
  const text = String(lineMap?.text ?? '')
  const lineStarts = Array.isArray(lineMap?.lineStarts) ? lineMap.lineStarts : [0]
  const safeLineIndex = Math.max(0, Math.min(lineStarts.length - 1, (Number(lineNumber || 1) || 1) - 1))
  const lineStart = lineStarts[safeLineIndex] ?? 0
  return clampOffset(lineStart + Math.max(0, (Number(column || 1) || 1) - 1), text)
}

function isLineColumnLocation(value = null) {
  return !!(
    value
    && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, 'line')
    && Object.prototype.hasOwnProperty.call(value, 'offset')
  )
}

function spanStartOffset(lineMap, span = null, fallbackOffset = 0) {
  if (!span || typeof span !== 'object') return Math.max(0, Number(fallbackOffset || 0) || 0)
  if (isLineColumnLocation(span.start)) {
    return lineColumnToOffset(lineMap, span.start.line, span.start.offset)
  }
  return Math.max(0, Number(span.start ?? fallbackOffset ?? 0) || 0)
}

function spanEndOffset(lineMap, span = null, fallbackOffset = 1) {
  if (!span || typeof span !== 'object') return Math.max(1, Number(fallbackOffset || 1) || 1)
  if (isLineColumnLocation(span.end)) {
    return lineColumnToOffset(lineMap, span.end.line, span.end.offset)
  }
  if (isLineColumnLocation(span.start) && Number.isFinite(Number(span.length))) {
    return lineColumnToOffset(lineMap, span.start.line, span.start.offset) + Math.max(1, Number(span.length || 1) || 1)
  }
  const start = Math.max(0, Number(span.start ?? 0) || 0)
  const length = Math.max(1, Number(span.length || 1) || 1)
  return Math.max(1, Number(span.end ?? (start + length)) || fallbackOffset)
}

function createSpanFromLocation(filePath = '', start = null, end = null) {
  if (!start || !end) return null
  return {
    uri: pathToFileURL(path.resolve(filePath)).href,
    filePath: cleanString(filePath),
    range: {
      startLineNumber: Math.max(1, Number(start.line || 1) || 1),
      startColumn: Math.max(1, Number(start.offset || 1) || 1),
      endLineNumber: Math.max(1, Number(end.line || start.line || 1) || 1),
      endColumn: Math.max(1, Number(end.offset || start.offset || 1) || 1),
    },
  }
}

function createOutlineKindMeta(kind = '') {
  const value = cleanString(kind).toLowerCase()
  if (value.includes('class')) return { kind: value || 'class', kindLabel: 'Class', kindBadge: { label: 'C', className: 'border-accent-muted/40 bg-accent-muted/12 text-accent-soft' } }
  if (value.includes('interface')) return { kind: value || 'interface', kindLabel: 'Interface', kindBadge: { label: 'I', className: 'border-info-border bg-info-bg text-info-soft' } }
  if (value.includes('enum')) return { kind: value || 'enum', kindLabel: 'Enum', kindBadge: { label: 'E', className: 'border-[#46310a] bg-[#1f1808] text-[#fcd34d]' } }
  if (value.includes('constructor')) return { kind: value || 'constructor', kindLabel: 'Ctor', kindBadge: { label: 'f', className: 'border-[#1f3a34] bg-[#08211b] text-[#86efac]' } }
  if (value.includes('method') || value.includes('function')) return { kind: value || 'function', kindLabel: 'Function', kindBadge: { label: 'f', className: 'border-[#1f3a34] bg-[#08211b] text-[#86efac]' } }
  if (value.includes('property') || value.includes('member')) return { kind: value || 'property', kindLabel: 'Property', kindBadge: { label: '#', className: 'border-[#2b2238] bg-[#170f24] text-[#d8b4fe]' } }
  if (value.includes('const')) return { kind: value || 'const', kindLabel: 'Const', kindBadge: { label: 'v', className: 'border-surface-border bg-surface-panel text-text-secondary' } }
  if (value.includes('var') || value.includes('let')) return { kind: value || 'var', kindLabel: 'Var', kindBadge: { label: 'v', className: 'border-surface-border bg-surface-panel text-text-secondary' } }
  return { kind: value || 'symbol', kindLabel: value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Symbol', kindBadge: { label: 's', className: 'border-surface-border bg-surface-panel text-text-muted' } }
}

function normalizeModifiers(modifiers = '') {
  return cleanString(modifiers)
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function createOutlineNode(item = null, lineMap = null, pathParts = []) {
  if (!item || typeof item !== 'object') return null
  const spans = Array.isArray(item.spans) ? item.spans : []
  const primarySpan = spans[0] && typeof spans[0] === 'object' ? spans[0] : null
  const nameSpan = item.nameSpan && typeof item.nameSpan === 'object' ? item.nameSpan : primarySpan
  if (!nameSpan) return null

  const startOffset = spanStartOffset(lineMap, primarySpan || nameSpan, 0)
  const endOffset = Math.max(startOffset + 1, spanEndOffset(lineMap, primarySpan || nameSpan, startOffset + 1))
  const selectionStartOffset = spanStartOffset(lineMap, nameSpan, startOffset)
  const selectionEndOffset = Math.max(selectionStartOffset + 1, spanEndOffset(lineMap, nameSpan, selectionStartOffset + 1))
  const start = offsetToLineColumn(lineMap, startOffset)
  const end = offsetToLineColumn(lineMap, endOffset)
  const selection = offsetToLineColumn(lineMap, selectionStartOffset)
  const children = (Array.isArray(item.childItems) ? item.childItems : [])
    .map((child, index) => createOutlineNode(child, lineMap, [...pathParts, index]))
    .filter(Boolean)
  const kindMeta = createOutlineKindMeta(item.kind)
  return {
    id: `outline-${pathParts.join('.') || '0'}-${startOffset}-${selectionStartOffset}`,
    name: cleanString(item.text) || '(anonymous)',
    kind: kindMeta.kind,
    kindLabel: kindMeta.kindLabel,
    kindBadge: kindMeta.kindBadge,
    modifiers: normalizeModifiers(item.kindModifiers),
    rangeStartOffset: startOffset,
    rangeEndOffset: endOffset,
    selectionStartOffset,
    selectionEndOffset,
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
    selectionLineNumber: selection.lineNumber,
    selectionColumn: selection.column,
    children,
  }
}

export function createTsServerProviderSession(resolution = {}, {
  workspaceRoot = '',
  onFailure = null,
} = {}) {
  let child = null
  let startPromise = null
  let buffer = Buffer.alloc(0)
  let nextRequestId = 1
  const pendingRequests = new Map()
  const documents = new Map()

  function reportFailure(message = '') {
    const normalizedMessage = cleanString(message)
    if (!normalizedMessage || typeof onFailure !== 'function') return
    onFailure(normalizedMessage)
  }

  function rejectAllPending(message = '') {
    for (const [requestId, pending] of pendingRequests.entries()) {
      pendingRequests.delete(requestId)
      pending.reject(new Error(cleanString(message) || 'tsserver_request_failed'))
    }
  }

  function handleMessage(payload = {}) {
    if (payload?.type !== 'response') return
    const requestId = Number(payload.request_seq || 0)
    if (!requestId) return
    const pending = pendingRequests.get(requestId)
    if (!pending) return
    pendingRequests.delete(requestId)
    if (payload.success === false) {
      pending.reject(new Error(cleanString(payload.message || 'tsserver_request_failed')))
      return
    }
    pending.resolve(payload.body)
  }

  function processStdoutChunk(chunk) {
    buffer = Buffer.concat([buffer, chunk])
    while (buffer.length > 0) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const header = buffer.slice(0, headerEnd).toString('utf8')
      const contentLength = parseContentLength(header)
      if (!contentLength) {
        buffer = buffer.slice(headerEnd + 4)
        continue
      }
      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + contentLength
      if (buffer.length < bodyEnd) return
      const body = buffer.slice(bodyStart, bodyEnd).toString('utf8')
      buffer = buffer.slice(bodyEnd)
      try {
        handleMessage(JSON.parse(body))
      } catch (error) {
        reportFailure(cleanString(error?.message) || 'tsserver_invalid_payload')
        rejectAllPending(cleanString(error?.message) || 'tsserver_invalid_payload')
      }
    }
  }

  async function start() {
    if (child) return child
    if (startPromise) return startPromise

    startPromise = new Promise((resolve, reject) => {
      let spawnedChild = null
      try {
        spawnedChild = spawn(resolution.command, Array.isArray(resolution.args) ? resolution.args : [], {
          cwd: cleanString(workspaceRoot || resolution.cwd) || undefined,
          env: { ...process.env, ...(resolution.env && typeof resolution.env === 'object' ? resolution.env : {}) },
          shell: shouldUseWindowsShell(resolution.command),
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        })
      } catch (error) {
        startPromise = null
        reject(error)
        return
      }

      let resolved = false
      spawnedChild.once('spawn', () => {
        if (resolved) return
        resolved = true
        child = spawnedChild
        startPromise = null
        resolve(spawnedChild)
      })
      spawnedChild.once('error', (error) => {
        if (resolved) return
        resolved = true
        startPromise = null
        reject(error)
      })
      spawnedChild.stdout?.on('data', (chunk) => {
        processStdoutChunk(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'))
      })
      spawnedChild.stderr?.on('data', (chunk) => {
        reportFailure(String(chunk || ''))
      })
      spawnedChild.on('exit', (code, signal) => {
        if (child === spawnedChild) {
          child = null
        }
        rejectAllPending(
          cleanString(signal)
            ? `tsserver exited with signal ${signal}`
            : `tsserver exited with code ${String(code ?? 'unknown')}`,
        )
      })
    })

    return startPromise
  }

  async function request(command = '', args = {}) {
    const activeChild = await start()
    return new Promise((resolve, reject) => {
      const requestId = nextRequestId++
      pendingRequests.set(requestId, { resolve, reject })
      try {
        activeChild.stdin.write(encodeMessage({
          seq: requestId,
          type: 'request',
          command,
          arguments: args,
        }))
      } catch (error) {
        pendingRequests.delete(requestId)
        reject(error)
      }
    })
  }

  async function notify(command = '', args = {}) {
    const activeChild = await start()
    activeChild.stdin.write(encodeMessage({
      seq: nextRequestId++,
      type: 'request',
      command,
      arguments: args,
    }))
  }

  async function updateDocument(document = null) {
    if (!document) return null
    const absoluteFilePath = cleanString(document.absoluteFilePath)
    const nextContent = String(document.content ?? '')
    if (!absoluteFilePath) return null

    const existing = documents.get(absoluteFilePath)
    if (!existing) {
      documents.set(absoluteFilePath, {
        version: Math.max(1, Number(document.version || 1) || 1),
        content: nextContent,
      })
      await notify('open', {
        file: absoluteFilePath,
        fileContent: nextContent,
        scriptKindName: scriptKindNameForLanguage(document.language, absoluteFilePath),
        projectRootPath: cleanString(workspaceRoot),
      })
      return absoluteFilePath
    }

    if (existing.content === nextContent && existing.version === Math.max(1, Number(document.version || 1) || 1)) {
      return absoluteFilePath
    }

    const previousLineMap = createLineMap(existing.content)
    const previousEnd = offsetToLineColumn(previousLineMap, existing.content.length)
    existing.version = Math.max(1, Number(document.version || existing.version || 1) || 1)
    existing.content = nextContent

    await notify('change', {
      file: absoluteFilePath,
      line: 1,
      offset: 1,
      endLine: previousEnd.lineNumber,
      endOffset: previousEnd.column,
      insertString: nextContent,
    })
    return absoluteFilePath
  }

  async function closeDocument(document = null) {
    const absoluteFilePath = cleanString(document?.absoluteFilePath)
    if (!absoluteFilePath) return
    documents.delete(absoluteFilePath)
    if (!child && !startPromise) return
    await notify('close', {
      file: absoluteFilePath,
    })
  }

  async function requestDefinition(document = null, lineNumber = 1, column = 1) {
    const absoluteFilePath = await updateDocument(document)
    if (!absoluteFilePath) return []
    const body = await request('definitionAndBoundSpan', {
      file: absoluteFilePath,
      line: Math.max(1, Number(lineNumber || 1) || 1),
      offset: Math.max(1, Number(column || 1) || 1),
    })
    const definitions = Array.isArray(body?.definitions)
      ? body.definitions
      : Array.isArray(body)
        ? body
        : []
    return definitions
      .map((definition) => createSpanFromLocation(definition.file, definition.start, definition.end))
      .filter(Boolean)
  }

  async function requestReferences(document = null, lineNumber = 1, column = 1) {
    const absoluteFilePath = await updateDocument(document)
    if (!absoluteFilePath) return []
    const body = await request('references', {
      file: absoluteFilePath,
      line: Math.max(1, Number(lineNumber || 1) || 1),
      offset: Math.max(1, Number(column || 1) || 1),
    })
    const refs = Array.isArray(body?.refs) ? body.refs : []
    return refs
      .map((reference) => createSpanFromLocation(reference.file, reference.start, reference.end))
      .filter(Boolean)
  }

  async function requestHover(document = null, lineNumber = 1, column = 1) {
    const absoluteFilePath = await updateDocument(document)
    if (!absoluteFilePath) return null
    const body = await request('quickinfo', {
      file: absoluteFilePath,
      line: Math.max(1, Number(lineNumber || 1) || 1),
      offset: Math.max(1, Number(column || 1) || 1),
      verbosityLevel: 1,
    })
    if (!body?.start || !body?.end) return null
    const displayString = cleanString(body.displayString)
    const documentation = cleanString(flattenDisplayParts(body.documentation))
    const tags = Array.isArray(body.tags)
      ? body.tags
        .map((tag) => {
          const text = cleanString(flattenDisplayParts(tag?.text))
          return text ? `*@${cleanString(tag?.name)}* ${text}` : `*@${cleanString(tag?.name)}*`
        })
        .filter(Boolean)
      : []
    const contents = []
    if (displayString) contents.push({ value: `\`\`\`ts\n${displayString}\n\`\`\`` })
    if (documentation) contents.push({ value: documentation })
    for (const tag of tags) contents.push({ value: tag })
    return {
      range: {
        startLineNumber: Math.max(1, Number(body.start.line || 1) || 1),
        startColumn: Math.max(1, Number(body.start.offset || 1) || 1),
        endLineNumber: Math.max(1, Number(body.end.line || body.start.line || 1) || 1),
        endColumn: Math.max(1, Number(body.end.offset || body.start.offset || 1) || 1),
      },
      contents,
    }
  }

  async function requestSymbols(document = null) {
    const absoluteFilePath = await updateDocument(document)
    if (!absoluteFilePath) return []
    const navTree = await request('navtree', {
      file: absoluteFilePath,
    })
    const lineMap = createLineMap(document?.content || '')
    const children = Array.isArray(navTree?.childItems) ? navTree.childItems : []
    return children
      .map((child, index) => createOutlineNode(child, lineMap, [index]))
      .filter(Boolean)
  }

  async function stop() {
    rejectAllPending('tsserver_stopped')
    buffer = Buffer.alloc(0)
    documents.clear()
    const activeChild = child
    child = null
    startPromise = null
    if (!activeChild) return
    try {
      activeChild.removeAllListeners()
    } catch {
      // Best-effort cleanup only.
    }
    try {
      activeChild.kill()
    } catch {
      // Best-effort cleanup only.
    }
  }

  return {
    start,
    updateDocument,
    closeDocument,
    requestDefinition,
    requestHover,
    requestReferences,
    requestSymbols,
    stop,
  }
}

export const __testTsServerProviderInternals = Object.freeze({
  createLineMap,
  createOutlineNode,
  lineColumnToOffset,
  offsetToLineColumn,
})
