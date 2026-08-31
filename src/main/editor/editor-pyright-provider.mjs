import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LSP_REQUEST_TIMEOUT_MS = 15_000
const LSP_DIAGNOSTIC_TIMEOUT_MS = 8_000

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

export function createPyrightProviderSession(resolution = {}, {
  workspaceRoot = '',
  onFailure = null,
  spawnProcess = spawn,
} = {}) {
  let child = null
  let startPromise = null
  let documentSyncQueue = Promise.resolve()
  let buffer = Buffer.alloc(0)
  let nextRequestId = 1
  const pendingRequests = new Map()
  const documents = new Map()
  const diagnosticsByUri = new Map()
  const diagnosticWaitersByUri = new Map()
  let sessionReady = false
  let sessionReadyWaiters = []

  function reportFailure(message = '') {
    const normalizedMessage = cleanString(message)
    if (!normalizedMessage || typeof onFailure !== 'function') return
    onFailure(normalizedMessage)
  }

  function rejectAllPending(message = '') {
    const error = new Error(cleanString(message) || 'pyright_request_failed')
    for (const [requestId, pending] of pendingRequests.entries()) {
      pendingRequests.delete(requestId)
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    for (const waiter of sessionReadyWaiters) {
      clearTimeout(waiter.timer)
      waiter.resolve(false)
    }
    sessionReadyWaiters = []
    for (const waiters of diagnosticWaitersByUri.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer)
        waiter.resolve(false)
      }
    }
    diagnosticWaitersByUri.clear()
  }

  function markSessionReady() {
    if (sessionReady) return
    sessionReady = true
    for (const waiter of sessionReadyWaiters) {
      clearTimeout(waiter.timer)
      waiter.resolve(true)
    }
    sessionReadyWaiters = []
  }

  function resolveDiagnosticWaiters(uri = '', version = 0) {
    const normalizedUri = cleanString(uri)
    const waiters = diagnosticWaitersByUri.get(normalizedUri)
    if (!normalizedUri || !Array.isArray(waiters) || waiters.length === 0) return
    const publishedVersion = Math.max(0, Number(version || 0) || 0)
    const remaining = []
    for (const waiter of waiters) {
      const targetVersion = Math.max(0, Number(waiter?.targetVersion || 0) || 0)
      if (publishedVersion === 0 || targetVersion === 0 || publishedVersion >= targetVersion) {
        clearTimeout(waiter.timer)
        waiter.resolve(true)
      } else {
        remaining.push(waiter)
      }
    }
    if (remaining.length > 0) diagnosticWaitersByUri.set(normalizedUri, remaining)
    else diagnosticWaitersByUri.delete(normalizedUri)
  }

  function writeMessage(activeChild, payload = {}) {
    return new Promise((resolve, reject) => {
      try {
        activeChild.stdin.write(encodeMessage(payload), (error) => (error ? reject(error) : resolve()))
      } catch (error) {
        reject(error)
      }
    })
  }

  async function respondToServerRequest(activeChild, payload = {}) {
    const method = cleanString(payload?.method)
    const requestId = payload?.id
    if (!method) return

    let result = null
    if (method === 'workspace/configuration') {
      const items = Array.isArray(payload?.params?.items) ? payload.params.items : []
      result = items.map(() => ({}))
    } else if (method === 'workspace/workspaceFolders') {
      const root = cleanString(workspaceRoot)
      result = root
        ? [{ uri: pathToFileURL(path.resolve(root)).href, name: path.basename(root) }]
        : []
    }

    try {
      await writeMessage(activeChild, {
        jsonrpc: '2.0',
        id: requestId,
        result,
      })
    } catch (error) {
      reportFailure(cleanString(error?.message) || `Failed to respond to ${method}.`)
    }
  }

  function handleResponse(payload = {}) {
    const requestId = Number(payload.id)
    const pending = pendingRequests.get(requestId)
    if (!pending) return
    pendingRequests.delete(requestId)
    clearTimeout(pending.timer)
    if (payload.error) {
      pending.reject(new Error(cleanString(payload?.error?.message || payload?.error?.code || 'pyright_request_failed')))
      return
    }
    pending.resolve(payload.result ?? null)
  }

  function handleNotification(payload = {}) {
    const method = cleanString(payload?.method)
    if (!method) return
    if (method === 'window/logMessage') {
      const messageType = Number(payload?.params?.type || 0) || 0
      const message = cleanString(payload?.params?.message)
      if (messageType <= 2 && message) reportFailure(message)
      return
    }
    if (method === 'textDocument/publishDiagnostics') {
      const uri = cleanString(payload?.params?.uri)
      if (!uri) return
      const version = Math.max(0, Number(payload?.params?.version || 0) || 0)
      diagnosticsByUri.set(uri, {
        uri,
        version,
        diagnostics: Array.isArray(payload?.params?.diagnostics) ? payload.params.diagnostics : [],
      })
      markSessionReady()
      resolveDiagnosticWaiters(uri, version)
    }
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
        const payload = JSON.parse(body)
        if (Object.prototype.hasOwnProperty.call(payload, 'id') && !Object.prototype.hasOwnProperty.call(payload, 'method')) {
          handleResponse(payload)
        } else if (Object.prototype.hasOwnProperty.call(payload, 'id') && Object.prototype.hasOwnProperty.call(payload, 'method')) {
          void respondToServerRequest(child, payload)
        } else {
          handleNotification(payload)
        }
      } catch (error) {
        reportFailure(cleanString(error?.message) || 'pyright_invalid_payload')
        rejectAllPending(cleanString(error?.message) || 'pyright_invalid_payload')
      }
    }
  }

  function requestWithChild(activeChild, method = '', params = {}, timeoutMs = LSP_REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const requestId = nextRequestId++
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId)
        reject(new Error(`Pyright request timed out for ${cleanString(method) || 'request'}.`))
      }, Math.max(1_000, Number(timeoutMs || LSP_REQUEST_TIMEOUT_MS) || LSP_REQUEST_TIMEOUT_MS))
      pendingRequests.set(requestId, { resolve, reject, timer })
      void writeMessage(activeChild, {
        jsonrpc: '2.0',
        id: requestId,
        method,
        params: params && typeof params === 'object' ? params : {},
      }).catch((error) => {
        const pending = pendingRequests.get(requestId)
        if (!pending) return
        pendingRequests.delete(requestId)
        clearTimeout(pending.timer)
        pending.reject(error)
      })
    })
  }

  async function notifyWithChild(activeChild, method = '', params = {}) {
    await writeMessage(activeChild, {
      jsonrpc: '2.0',
      method,
      params: params && typeof params === 'object' ? params : {},
    })
  }

  function waitForSessionReady(timeoutMs = LSP_DIAGNOSTIC_TIMEOUT_MS) {
    if (sessionReady) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        sessionReadyWaiters = sessionReadyWaiters.filter((waiter) => waiter.timer !== timer)
        resolve(false)
      }, Math.max(500, Number(timeoutMs || LSP_DIAGNOSTIC_TIMEOUT_MS) || LSP_DIAGNOSTIC_TIMEOUT_MS))
      sessionReadyWaiters.push({ resolve, timer })
    })
  }

  function waitForDiagnostics(documentUri = '', targetVersion = 0, timeoutMs = LSP_DIAGNOSTIC_TIMEOUT_MS) {
    const normalizedUri = cleanString(documentUri)
    if (!normalizedUri) return Promise.resolve(false)
    const expectedVersion = Math.max(0, Number(targetVersion || 0) || 0)
    const existing = diagnosticsByUri.get(normalizedUri)
    const existingVersion = Math.max(0, Number(existing?.version || 0) || 0)
    if (existing && (existingVersion === 0 || expectedVersion === 0 || existingVersion >= expectedVersion)) {
      return Promise.resolve(true)
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const current = diagnosticWaitersByUri.get(normalizedUri) || []
        const next = current.filter((waiter) => waiter.timer !== timer)
        if (next.length > 0) diagnosticWaitersByUri.set(normalizedUri, next)
        else diagnosticWaitersByUri.delete(normalizedUri)
        resolve(false)
      }, Math.max(500, Number(timeoutMs || LSP_DIAGNOSTIC_TIMEOUT_MS) || LSP_DIAGNOSTIC_TIMEOUT_MS))
      const current = diagnosticWaitersByUri.get(normalizedUri) || []
      current.push({ resolve, timer, targetVersion: expectedVersion })
      diagnosticWaitersByUri.set(normalizedUri, current)
    })
  }

  function enqueueDocumentSync(operation) {
    const run = async () => operation()
    const task = documentSyncQueue.then(run, run)
    documentSyncQueue = task.catch(() => {})
    return task
  }

  async function start() {
    if (child) return child
    if (startPromise) return startPromise

    startPromise = new Promise((resolve, reject) => {
      let spawnedChild = null
      try {
        spawnedChild = spawnProcess(resolution.command, Array.isArray(resolution.args) ? resolution.args : [], {
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

      let settled = false
      spawnedChild.once('spawn', async () => {
        if (settled) return
        child = spawnedChild
        spawnedChild.stdout?.on('data', (chunk) => {
          processStdoutChunk(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'))
        })
        spawnedChild.stderr?.on('data', (chunk) => {
          reportFailure(String(chunk || ''))
        })
        spawnedChild.on('exit', (code, signal) => {
          if (child === spawnedChild) child = null
          rejectAllPending(
            cleanString(signal)
              ? `Pyright exited with signal ${signal}`
              : `Pyright exited with code ${String(code ?? 'unknown')}`,
          )
        })

        try {
          const rootPath = cleanString(workspaceRoot)
          const rootUri = rootPath ? pathToFileURL(path.resolve(rootPath)).href : null
          await requestWithChild(spawnedChild, 'initialize', {
            processId: process.pid,
            clientInfo: { name: 'addom_desktop' },
            rootPath: rootPath || null,
            rootUri,
            capabilities: {
              workspace: {
                configuration: true,
                workspaceFolders: true,
              },
              window: {
                workDoneProgress: true,
              },
              textDocument: {
                hover: { contentFormat: ['markdown', 'plaintext'] },
                definition: { linkSupport: true },
                references: {},
                documentSymbol: { hierarchicalDocumentSymbolSupport: true },
                synchronization: { didSave: true },
              },
            },
            workspaceFolders: rootUri
              ? [{ uri: rootUri, name: path.basename(rootPath) || path.basename(cleanString(rootUri)) }]
              : [],
          })
          await notifyWithChild(spawnedChild, 'initialized', {})
          await notifyWithChild(spawnedChild, 'workspace/didChangeConfiguration', { settings: {} })
          settled = true
          startPromise = null
          resolve(spawnedChild)
        } catch (error) {
          settled = true
          child = null
          startPromise = null
          try {
            spawnedChild.kill()
          } catch {
            // Best-effort cleanup only.
          }
          reject(error)
        }
      })
      spawnedChild.once('error', (error) => {
        if (settled) return
        settled = true
        child = null
        startPromise = null
        reject(error)
      })
    })

    return startPromise
  }

  async function updateDocument(document = null, { awaitDiagnostics = false } = {}) {
    return enqueueDocumentSync(async () => {
      if (!document) return null
      const activeChild = await start()
      const documentUri = cleanString(document.uri || pathToFileURL(path.resolve(document.absoluteFilePath)).href)
      const nextContent = String(document.content ?? '')
      const nextVersion = Math.max(1, Number(document.version || 1) || 1)
      if (!documentUri) return null

      const existing = documents.get(documentUri)
      if (!existing) {
        documents.set(documentUri, {
          uri: documentUri,
          absoluteFilePath: cleanString(document.absoluteFilePath),
          version: nextVersion,
          content: nextContent,
        })
        await notifyWithChild(activeChild, 'textDocument/didOpen', {
          textDocument: {
            uri: documentUri,
            languageId: 'python',
            version: nextVersion,
            text: nextContent,
          },
        })
      } else if (existing.content !== nextContent || existing.version !== nextVersion) {
        existing.version = nextVersion
        existing.content = nextContent
        await notifyWithChild(activeChild, 'textDocument/didChange', {
          textDocument: {
            uri: documentUri,
            version: nextVersion,
          },
          contentChanges: [{
            text: nextContent,
          }],
        })
      }

      if (awaitDiagnostics) {
        const diagnosticsReady = await waitForDiagnostics(documentUri, nextVersion)
        if (!diagnosticsReady && !sessionReady) {
          await waitForSessionReady()
        }
      }

      return documentUri
    })
  }

  async function saveDocument(document = null) {
    return enqueueDocumentSync(async () => {
      const activeChild = await start()
      const documentUri = cleanString(document?.uri)
      if (!documentUri) return
      await notifyWithChild(activeChild, 'textDocument/didSave', {
        textDocument: {
          uri: documentUri,
        },
        text: String(document?.content ?? ''),
      })
    })
  }

  async function closeDocument(document = null) {
    return enqueueDocumentSync(async () => {
      const documentUri = cleanString(document?.uri)
      if (!documentUri) return
      if (!child && !startPromise) {
        documents.delete(documentUri)
        diagnosticsByUri.delete(documentUri)
        diagnosticWaitersByUri.delete(documentUri)
        return
      }
      const activeChild = await start()
      await notifyWithChild(activeChild, 'textDocument/didClose', {
        textDocument: {
          uri: documentUri,
        },
      })
      documents.delete(documentUri)
      diagnosticsByUri.delete(documentUri)
      diagnosticWaitersByUri.delete(documentUri)
    })
  }

  async function requestHover(document = null, lineNumber = 1, column = 1) {
    const activeChild = await start()
    const documentUri = await updateDocument(document)
    if (!documentUri) return null
    const hover = await requestWithChild(activeChild, 'textDocument/hover', {
      textDocument: { uri: documentUri },
      position: toLspPosition(lineNumber, column),
    })
    return {
      range: fromLspRange(hover?.range),
      contents: normalizeHoverContents(hover),
    }
  }

  async function requestDiagnostics(document = null) {
    const activeChild = await start()
    const documentUri = await updateDocument(document)
    if (!documentUri) return []
    try {
      const body = await requestWithChild(activeChild, 'textDocument/diagnostic', {
        textDocument: { uri: documentUri },
      })
      const items = Array.isArray(body?.items) ? body.items : []
      if (items.length > 0 || body?.kind === 'full') {
        return items
      }
    } catch {
      // Fallback to push diagnostics for servers that do not implement pull diagnostics.
    }

    await updateDocument(document, { awaitDiagnostics: true })
    const published = diagnosticsByUri.get(documentUri)
    if (!published) {
      throw new Error('Pyright diagnostics timed out.')
    }
    return Array.isArray(published?.diagnostics) ? published.diagnostics : []
  }

  async function requestDefinition(document = null, lineNumber = 1, column = 1) {
    const activeChild = await start()
    const documentUri = await updateDocument(document)
    if (!documentUri) return []
    const body = await requestWithChild(activeChild, 'textDocument/definition', {
      textDocument: { uri: documentUri },
      position: toLspPosition(lineNumber, column),
    })
    return (Array.isArray(body) ? body : [body])
      .map((location) => createLocationFromLsp(location))
      .filter(Boolean)
  }

  async function requestReferences(document = null, lineNumber = 1, column = 1) {
    const activeChild = await start()
    const documentUri = await updateDocument(document)
    if (!documentUri) return []
    const body = await requestWithChild(activeChild, 'textDocument/references', {
      textDocument: { uri: documentUri },
      position: toLspPosition(lineNumber, column),
      context: {
        includeDeclaration: true,
      },
    })
    return (Array.isArray(body) ? body : [body])
      .map((location) => createLocationFromLsp(location))
      .filter(Boolean)
  }

  async function requestSymbols(document = null) {
    const activeChild = await start()
    const documentUri = await updateDocument(document)
    if (!documentUri) return []
    const body = await requestWithChild(activeChild, 'textDocument/documentSymbol', {
      textDocument: { uri: documentUri },
    })
    const lineMap = createLineMap(document?.content || '')
    if (!Array.isArray(body)) return []
    const hasHierarchicalSymbols = body.some((item) => item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'selectionRange'))
    return hasHierarchicalSymbols
      ? body.map((item, index) => createOutlineNode(item, lineMap, [index])).filter(Boolean)
      : body.map((item, index) => createOutlineNodeFromSymbolInformation(item, lineMap, [index])).filter(Boolean)
  }

  async function stop() {
    rejectAllPending('pyright_stopped')
    buffer = Buffer.alloc(0)
    documents.clear()
    diagnosticsByUri.clear()
    diagnosticWaitersByUri.clear()
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
    saveDocument,
    closeDocument,
    requestDiagnostics,
    requestHover,
    requestDefinition,
    requestReferences,
    requestSymbols,
    stop,
  }
}

export const __testPyrightProviderInternals = Object.freeze({
  createLineMap,
  createOutlineNode,
  lineColumnToOffset,
  fromLspRange,
  normalizeHoverContents,
})
