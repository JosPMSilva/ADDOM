import { spawn } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
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
} from './editor-lsp-provider-session-helpers.mjs'

const LSP_REQUEST_TIMEOUT_MS = 15_000
const LSP_FORMATTING_TIMEOUT_MS = 20_000
const LSP_CODE_ACTION_TIMEOUT_MS = 20_000

export function createLspProviderSession(resolution = {}, {
  providerLabel = 'language server',
  workspaceRoot = '',
  onFailure = null,
  spawnProcess = spawn,
  getLanguageId = () => 'plaintext',
  buildInitializeParams = null,
  configurationSettings = {},
  requestTimeoutMs = LSP_REQUEST_TIMEOUT_MS,
} = {}) {
  let child = null
  let startPromise = null
  let documentSyncQueue = Promise.resolve()
  let buffer = Buffer.alloc(0)
  let nextRequestId = 1
  const pendingRequests = new Map()
  const documents = new Map()

  function formatProviderError(action = 'request') {
    return `${providerLabel} ${action} failed.`
  }

  function reportFailure(message = '') {
    const normalizedMessage = cleanString(message)
    if (!normalizedMessage || typeof onFailure !== 'function') return
    onFailure(normalizedMessage)
  }

  function rejectAllPending(message = '') {
    const error = new Error(cleanString(message) || formatProviderError('request'))
    for (const [requestId, pending] of pendingRequests.entries()) {
      pendingRequests.delete(requestId)
      clearTimeout(pending.timer)
      pending.reject(error)
    }
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
    if (!method || requestId == null) return

    const workspaceFolders = normalizeWorkspaceFolders(workspaceRoot)
    let result = null
    if (method === 'workspace/configuration') {
      const items = Array.isArray(payload?.params?.items) ? payload.params.items : []
      result = items.map(() => ({ ...configurationSettings }))
    } else if (method === 'workspace/workspaceFolders') {
      result = workspaceFolders
    } else if (
      method === 'client/registerCapability'
      || method === 'client/unregisterCapability'
      || method === 'window/workDoneProgress/create'
    ) {
      result = null
    } else if (method === 'workspace/applyEdit') {
      result = { applied: false }
    } else if (method === 'window/showMessageRequest') {
      result = null
    }

    try {
      await writeMessage(activeChild, {
        jsonrpc: '2.0',
        id: requestId,
        result,
      })
    } catch (error) {
      reportFailure(cleanString(error?.message) || formatProviderError(`response (${method})`))
    }
  }

  function handleResponse(payload = {}) {
    const requestId = Number(payload.id)
    const pending = pendingRequests.get(requestId)
    if (!pending) return
    pendingRequests.delete(requestId)
    clearTimeout(pending.timer)
    if (payload.error) {
      pending.reject(new Error(cleanString(payload?.error?.message || payload?.error?.code || formatProviderError())))
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
        reportFailure(cleanString(error?.message) || `${providerLabel} returned an invalid payload.`)
        rejectAllPending(cleanString(error?.message) || `${providerLabel} returned an invalid payload.`)
      }
    }
  }

  function requestWithChild(activeChild, method = '', params = {}, timeoutMs = requestTimeoutMs) {
    return new Promise((resolve, reject) => {
      const requestId = nextRequestId++
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId)
        reject(new Error(`${providerLabel} request timed out for ${cleanString(method) || 'request'}.`))
      }, Math.max(1_000, Number(timeoutMs || requestTimeoutMs) || requestTimeoutMs))
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
          cwd: cleanString(resolution.cwd || workspaceRoot) || undefined,
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
              ? `${providerLabel} exited with signal ${signal}`
              : `${providerLabel} exited with code ${String(code ?? 'unknown')}`,
          )
        })

        try {
          const workspaceFolders = normalizeWorkspaceFolders(workspaceRoot)
          const defaultParams = createDefaultInitializeParams({ workspaceRoot, workspaceFolders })
          const initializeParams = typeof buildInitializeParams === 'function'
            ? buildInitializeParams({
              workspaceRoot,
              workspaceFolders,
              defaultParams,
            })
            : defaultParams
          await requestWithChild(spawnedChild, 'initialize', initializeParams)
          await notifyWithChild(spawnedChild, 'initialized', {})
          await notifyWithChild(spawnedChild, 'workspace/didChangeConfiguration', { settings: configurationSettings })
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

  async function updateDocument(document = null) {
    return enqueueDocumentSync(async () => {
      if (!document) return null
      const activeChild = await start()
      const documentUri = cleanString(document.uri || pathToFileURL(path.resolve(document.absoluteFilePath)).href)
      const nextContent = String(document.content ?? '')
      const nextVersion = Math.max(1, Number(document.version || 1) || 1)
      if (!documentUri) return null

      const existing = documents.get(documentUri)
      const languageId = cleanString(getLanguageId(document))
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
            languageId,
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
        return
      }
      const activeChild = await start()
      await notifyWithChild(activeChild, 'textDocument/didClose', {
        textDocument: {
          uri: documentUri,
        },
      })
      documents.delete(documentUri)
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

  async function requestFormatting(document = null, {
    tabSize = 2,
    insertSpaces = true,
  } = {}) {
    const activeChild = await start()
    const documentUri = await updateDocument(document)
    if (!documentUri) return {
      changed: false,
      formatted: String(document?.content ?? ''),
    }
    const edits = await requestWithChild(activeChild, 'textDocument/formatting', {
      textDocument: { uri: documentUri },
      options: {
        tabSize: Math.max(1, Number(tabSize || 2) || 2),
        insertSpaces: insertSpaces !== false,
      },
    }, LSP_FORMATTING_TIMEOUT_MS)
    const formatted = applyTextEdits(document?.content, Array.isArray(edits) ? edits : [])
    return {
      changed: formatted !== String(document?.content ?? ''),
      formatted,
    }
  }

  async function requestCodeActions(document = null) {
    const activeChild = await start()
    const documentUri = await updateDocument(document)
    if (!documentUri) return []
    const actionResults = await requestWithChild(activeChild, 'textDocument/codeAction', {
      textDocument: { uri: documentUri },
      range: {
        start: { line: 0, character: 0 },
        end: { line: Math.max(0, Number(String(document?.content ?? '').split('\n').length) - 1), character: 0 },
      },
      context: {
        diagnostics: [],
      },
    }, LSP_CODE_ACTION_TIMEOUT_MS)
    const codeActions = Array.isArray(actionResults) ? actionResults : []
    const actions = []

    for (let index = 0; index < codeActions.length; index += 1) {
      let action = codeActions[index]
      if (!action || typeof action !== 'object') continue

      if (!action.edit && action.data) {
        try {
          const resolved = await requestWithChild(activeChild, 'codeAction/resolve', action, LSP_CODE_ACTION_TIMEOUT_MS)
          if (resolved && typeof resolved === 'object') {
            action = resolved
          }
        } catch {
          // Some servers do not implement resolve; keep the original action.
        }
      }

      const workspaceEdit = extractWorkspaceEditFromCodeAction(action)
      const editResult = buildWorkspaceEditResult(workspaceEdit, document)
      if (!editResult) continue

      actions.push({
        id: `code-action-${index}-${cleanString(action.title || action.kind || 'action').replace(/\s+/g, '-').toLowerCase()}`,
        title: cleanString(action.title) || 'Apply code action',
        kind: normalizeCodeActionKind(action.kind),
        isPreferred: action.isPreferred === true,
        edit: {
          fullText: editResult.fullText,
        },
      })
    }

    return actions
  }

  async function stop() {
    rejectAllPending(`${providerLabel} stopped.`)
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
    saveDocument,
    closeDocument,
    requestHover,
    requestDefinition,
    requestReferences,
    requestSymbols,
    requestFormatting,
    requestCodeActions,
    stop,
  }
}

export const __testEditorLspProviderSessionInternals = Object.freeze({
  applyTextEdits,
  buildWorkspaceEditResult,
  createLineMap,
  createOutlineNode,
  fromLspRange,
  lineColumnToOffset,
  normalizeHoverContents,
})
