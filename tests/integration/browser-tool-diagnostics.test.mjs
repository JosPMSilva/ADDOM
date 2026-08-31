import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import {
  attachBrowserDiagnosticsToContext,
  attachBrowserDiagnosticsToPage,
  clearBrowserDiagnostics,
  createBrowserDiagnostics,
  formatConsoleDiagnostics,
  formatNetworkDiagnostics,
} from '../../src/main/tools/browser-tool-diagnostics.mjs'

function buildRequest({
  url = 'https://user:secret@example.test/api?token=abc#frag',
  method = 'POST',
  resourceType = 'fetch',
  errorText = 'net::ERR_FAILED',
} = {}) {
  return {
    url: () => url,
    method: () => method,
    resourceType: () => resourceType,
    failure: () => ({ errorText }),
  }
}

test('browser diagnostics collects bounded sanitized console and network rows', () => {
  const session = { diagnostics: createBrowserDiagnostics({ maxRows: 2 }) }
  const page = new EventEmitter()
  attachBrowserDiagnosticsToPage(session, page)

  page.emit('console', {
    type: () => 'warning',
    text: () => 'first warning',
    location: () => ({ url: 'https://user:secret@example.test/app?token=abc', lineNumber: 7, columnNumber: 3 }),
  })
  page.emit('console', {
    type: () => 'error',
    text: () => 'second error',
    location: () => ({ url: 'https://example.test/app#section', lineNumber: 8, columnNumber: 0 }),
  })
  page.emit('pageerror', new Error('third page error'))
  page.emit('requestfailed', buildRequest())
  page.emit('response', {
    status: () => 500,
    statusText: () => 'Server Error',
    url: () => 'https://example.test/api?session=hidden',
    request: () => buildRequest({ url: 'https://example.test/api?session=hidden' }),
  })

  const consoleOutput = formatConsoleDiagnostics(session)
  assert.match(consoleOutput, /Rows returned: 2 of 2/)
  assert.match(consoleOutput, /third page error/)
  assert.match(consoleOutput, /second error/)
  assert.doesNotMatch(consoleOutput, /first warning/)
  assert.doesNotMatch(consoleOutput, /token=abc/)
  assert.doesNotMatch(consoleOutput, /user:secret/)

  const networkOutput = formatNetworkDiagnostics(session)
  assert.match(networkOutput, /Rows returned: 2 of 2/)
  assert.match(networkOutput, /status=500 Server Error/)
  assert.match(networkOutput, /net::ERR_FAILED/)
  assert.doesNotMatch(networkOutput, /token=abc/)
  assert.doesNotMatch(networkOutput, /session=hidden/)
  assert.doesNotMatch(networkOutput, /user:secret/)
})

test('browser diagnostics supports level, status, and resource type filters', () => {
  const session = { diagnostics: createBrowserDiagnostics() }
  const page = new EventEmitter()
  attachBrowserDiagnosticsToPage(session, page)

  page.emit('console', {
    type: () => 'log',
    text: () => 'debug note',
    location: () => ({}),
  })
  page.emit('pageerror', new Error('runtime exploded'))
  page.emit('response', {
    status: () => 404,
    statusText: () => 'Not Found',
    url: () => 'https://example.test/missing.js',
    request: () => buildRequest({ method: 'GET', resourceType: 'script' }),
  })
  page.emit('response', {
    status: () => 500,
    statusText: () => 'Server Error',
    url: () => 'https://example.test/api',
    request: () => buildRequest({ resourceType: 'fetch' }),
  })

  assert.match(formatConsoleDiagnostics(session, { level: 'error' }), /runtime exploded/)
  assert.doesNotMatch(formatConsoleDiagnostics(session, { level: 'error' }), /debug note/)

  const networkOutput = formatNetworkDiagnostics(session, { status: 500, type: 'fetch' })
  assert.match(networkOutput, /status=500 Server Error/)
  assert.doesNotMatch(networkOutput, /Not Found/)
})

test('browser diagnostics clears buffers and removes listeners on session close', () => {
  const session = { diagnostics: createBrowserDiagnostics() }
  const page = new EventEmitter()
  const context = new EventEmitter()

  attachBrowserDiagnosticsToContext(session, context)
  context.emit('page', page)
  page.emit('console', { type: () => 'error', text: () => 'before close', location: () => ({}) })
  assert.match(formatConsoleDiagnostics(session), /before close/)

  clearBrowserDiagnostics(session)
  page.emit('console', { type: () => 'error', text: () => 'after close', location: () => ({}) })

  const output = formatConsoleDiagnostics(session)
  assert.match(output, /Rows returned: 0 of 0/)
  assert.doesNotMatch(output, /after close/)
})
