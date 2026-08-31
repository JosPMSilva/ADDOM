const DEFAULT_MAX_ROWS = 100
const MAX_TEXT_CHARS = 1_000

function normalizeLimit(value, max = DEFAULT_MAX_ROWS) {
  return Math.min(max, Math.max(1, Number(value) || max))
}

function clipText(value = '', limit = MAX_TEXT_CHARS) {
  const text = String(value ?? '').trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit)} [truncated]`
}

function sanitizeUrl(rawUrl = '') {
  const value = String(rawUrl || '').trim()
  if (!value) return ''
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return `${url.origin}${url.pathname}`
    }
    return url.toString()
  } catch {
    return value
      .replace(/\/\/[^/@\s]+@/g, '//[credentials-redacted]@')
      .split(/[?#]/)[0]
  }
}

function normalizeConsoleLevel(level = '') {
  const value = String(level || '').trim().toLowerCase()
  if (value === 'warn') return 'warning'
  if (value === 'page_error') return 'pageerror'
  return value
}

function pushBounded(rows, entry, maxRows = DEFAULT_MAX_ROWS) {
  rows.push({
    observedAt: new Date().toISOString(),
    ...entry,
  })
  while (rows.length > maxRows) rows.shift()
}

function getDiagnostics(session) {
  if (session?.diagnostics) return session.diagnostics
  return createBrowserDiagnostics()
}

function eventOff(target, eventName, handler) {
  if (typeof target?.off === 'function') {
    target.off(eventName, handler)
    return
  }
  if (typeof target?.removeListener === 'function') {
    target.removeListener(eventName, handler)
  }
}

function bindEvent(diagnostics, target, eventName, handler) {
  if (typeof target?.on !== 'function') return
  const safeHandler = (...args) => {
    try {
      handler(...args)
    } catch {
      // Diagnostics must not interfere with browser execution.
    }
  }
  target.on(eventName, safeHandler)
  diagnostics.cleanupFns.push(() => eventOff(target, eventName, safeHandler))
}

function requestUrl(request) {
  return typeof request?.url === 'function' ? request.url() : request?.url
}

function requestMethod(request) {
  const value = typeof request?.method === 'function' ? request.method() : request?.method
  return String(value || 'GET').trim().toUpperCase()
}

function requestType(request) {
  const value = typeof request?.resourceType === 'function' ? request.resourceType() : request?.resourceType
  return String(value || '').trim()
}

function failureText(request) {
  const failure = typeof request?.failure === 'function' ? request.failure() : request?.failure
  return clipText(failure?.errorText || failure?.message || '')
}

export function createBrowserDiagnostics({ maxRows = DEFAULT_MAX_ROWS } = {}) {
  return {
    maxRows: normalizeLimit(maxRows, DEFAULT_MAX_ROWS),
    consoleMessages: [],
    networkErrors: [],
    cleanupFns: [],
    pages: new WeakSet(),
    contexts: new WeakSet(),
  }
}

export function ensureBrowserDiagnostics(session) {
  if (!session) return createBrowserDiagnostics()
  if (!session.diagnostics) session.diagnostics = createBrowserDiagnostics()
  return session.diagnostics
}

export function recordConsoleDiagnostic(session, message) {
  const diagnostics = ensureBrowserDiagnostics(session)
  const location = typeof message?.location === 'function' ? message.location() : message?.location
  const type = typeof message?.type === 'function' ? message.type() : message?.type
  const text = typeof message?.text === 'function' ? message.text() : message?.text
  pushBounded(diagnostics.consoleMessages, {
    kind: 'console',
    level: normalizeConsoleLevel(type || 'log') || 'log',
    text: clipText(text),
    url: sanitizeUrl(location?.url),
    line: Number(location?.lineNumber || 0),
    column: Number(location?.columnNumber || 0),
  }, diagnostics.maxRows)
}

export function recordPageErrorDiagnostic(session, error) {
  const diagnostics = ensureBrowserDiagnostics(session)
  pushBounded(diagnostics.consoleMessages, {
    kind: 'pageerror',
    level: 'pageerror',
    text: clipText(error?.message || error),
    url: '',
    line: 0,
    column: 0,
  }, diagnostics.maxRows)
}

export function recordFailedRequestDiagnostic(session, request) {
  const diagnostics = ensureBrowserDiagnostics(session)
  pushBounded(diagnostics.networkErrors, {
    kind: 'failed',
    url: sanitizeUrl(requestUrl(request)),
    method: requestMethod(request),
    type: requestType(request),
    status: 0,
    statusText: '',
    error: failureText(request),
  }, diagnostics.maxRows)
}

export function recordResponseDiagnostic(session, response) {
  const status = Number(typeof response?.status === 'function' ? response.status() : response?.status || 0)
  if (status < 400) return
  const request = typeof response?.request === 'function' ? response.request() : response?.request
  const statusText = typeof response?.statusText === 'function' ? response.statusText() : response?.statusText
  const diagnostics = ensureBrowserDiagnostics(session)
  pushBounded(diagnostics.networkErrors, {
    kind: 'http_error',
    url: sanitizeUrl(typeof response?.url === 'function' ? response.url() : response?.url || requestUrl(request)),
    method: requestMethod(request),
    type: requestType(request),
    status,
    statusText: clipText(statusText, 120),
    error: '',
  }, diagnostics.maxRows)
}

export function attachBrowserDiagnosticsToPage(session, page) {
  if (!session || !page) return ensureBrowserDiagnostics(session)
  const diagnostics = ensureBrowserDiagnostics(session)
  if (diagnostics.pages.has(page)) return diagnostics
  diagnostics.pages.add(page)
  bindEvent(diagnostics, page, 'console', (message) => recordConsoleDiagnostic(session, message))
  bindEvent(diagnostics, page, 'pageerror', (error) => recordPageErrorDiagnostic(session, error))
  bindEvent(diagnostics, page, 'requestfailed', (request) => recordFailedRequestDiagnostic(session, request))
  bindEvent(diagnostics, page, 'response', (response) => recordResponseDiagnostic(session, response))
  return diagnostics
}

export function attachBrowserDiagnosticsToContext(session, context) {
  if (!session || !context) return ensureBrowserDiagnostics(session)
  const diagnostics = ensureBrowserDiagnostics(session)
  if (diagnostics.contexts.has(context)) return diagnostics
  diagnostics.contexts.add(context)
  bindEvent(diagnostics, context, 'page', (page) => attachBrowserDiagnosticsToPage(session, page))
  return diagnostics
}

export function clearBrowserDiagnostics(session) {
  const diagnostics = session?.diagnostics
  if (!diagnostics) return
  for (const cleanup of diagnostics.cleanupFns.splice(0)) {
    try {
      cleanup()
    } catch {
      // Listener cleanup is best effort during browser teardown.
    }
  }
  diagnostics.consoleMessages.length = 0
  diagnostics.networkErrors.length = 0
  session.diagnostics = createBrowserDiagnostics({ maxRows: diagnostics.maxRows })
}

function formatConsoleRow(row, index) {
  const parts = [`${index + 1}. [${row.level || 'log'}] ${row.text || '(empty)'}`]
  if (row.url) {
    const location = row.line ? `${row.url}:${row.line}${row.column ? `:${row.column}` : ''}` : row.url
    parts.push(`   at ${location}`)
  }
  return parts.join('\n')
}

function formatNetworkRow(row, index) {
  const status = row.status ? ` status=${row.status}${row.statusText ? ` ${row.statusText}` : ''}` : ''
  const type = row.type ? ` type=${row.type}` : ''
  const lines = [`${index + 1}. [${row.kind || 'network'}] ${row.method || 'GET'} ${row.url || '(unknown url)'}${status}${type}`]
  if (row.error) lines.push(`   error: ${row.error}`)
  return lines.join('\n')
}

export function formatConsoleDiagnostics(session, { level = '', limit = DEFAULT_MAX_ROWS } = {}) {
  const diagnostics = getDiagnostics(session)
  const normalizedLevel = normalizeConsoleLevel(level)
  const rows = diagnostics.consoleMessages.filter((row) => {
    if (!normalizedLevel) return true
    if (normalizedLevel === 'error') return row.level === 'error' || row.level === 'pageerror'
    return row.level === normalizedLevel
  })
  const shown = rows.slice(-normalizeLimit(limit)).reverse()
  const lines = [
    normalizedLevel ? `Recent console messages (${normalizedLevel})` : 'Recent console messages',
    `Rows returned: ${shown.length} of ${rows.length}`,
  ]
  if (shown.length === 0) lines.push('No console messages recorded for the active browser session.')
  else lines.push('', ...shown.map(formatConsoleRow))
  return lines.join('\n')
}

export function formatNetworkDiagnostics(session, { status = '', type = '', limit = DEFAULT_MAX_ROWS } = {}) {
  const diagnostics = getDiagnostics(session)
  const normalizedStatus = Number(status) || 0
  const normalizedType = String(type || '').trim().toLowerCase()
  const rows = diagnostics.networkErrors.filter((row) => {
    if (normalizedStatus && Number(row.status || 0) !== normalizedStatus) return false
    if (normalizedType && String(row.type || '').toLowerCase() !== normalizedType) return false
    return true
  })
  const shown = rows.slice(-normalizeLimit(limit)).reverse()
  const lines = [
    'Recent network errors',
    `Rows returned: ${shown.length} of ${rows.length}`,
  ]
  if (shown.length === 0) lines.push('No failed or error-status requests recorded for the active browser session.')
  else lines.push('', ...shown.map(formatNetworkRow))
  return lines.join('\n')
}
