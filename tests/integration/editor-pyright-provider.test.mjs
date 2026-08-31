import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'

import { createPyrightProviderSession } from '../../src/main/editor/editor-pyright-provider.mjs'

function encodeLspMessage(payload = {}) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'),
    body,
  ])
}

function decodeLspMessage(chunk) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '')
  const separatorIndex = text.indexOf('\r\n\r\n')
  assert.notEqual(separatorIndex, -1, 'Expected an LSP message header separator.')
  return JSON.parse(text.slice(separatorIndex + 4))
}

function createFakePyrightSpawn() {
  const state = {
    closeRelease: null,
    openUris: new Set(),
    textDocumentMethods: [],
  }

  function spawnProcess() {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {
      queueMicrotask(() => child.emit('exit', 0, null))
      return true
    }
    child.stdin = {
      write(chunk, callback = () => {}) {
        const payload = decodeLspMessage(chunk)
        if (payload?.method === 'initialize' && payload?.id != null) {
          queueMicrotask(() => {
            child.stdout.emit('data', encodeLspMessage({
              jsonrpc: '2.0',
              id: payload.id,
              result: { capabilities: {} },
            }))
            callback(null)
          })
          return true
        }

        if (String(payload?.method || '').startsWith('textDocument/')) {
          state.textDocumentMethods.push(payload.method)
        }

        if (payload?.method === 'textDocument/didOpen') {
          const uri = String(payload?.params?.textDocument?.uri || '')
          if (state.openUris.has(uri)) {
            queueMicrotask(() => {
              child.stdout.emit('data', encodeLspMessage({
                jsonrpc: '2.0',
                method: 'window/logMessage',
                params: {
                  type: 1,
                  message: `Received redundant open text document command for ${uri}`,
                },
              }))
            })
          } else {
            state.openUris.add(uri)
          }
        }

        if (payload?.method === 'textDocument/didClose') {
          const uri = String(payload?.params?.textDocument?.uri || '')
          state.closeRelease = () => {
            state.openUris.delete(uri)
            callback(null)
          }
          return true
        }

        queueMicrotask(() => callback(null))
        return true
      },
    }

    queueMicrotask(() => child.emit('spawn'))
    return child
  }

  return {
    spawnProcess,
    releaseClose() {
      const release = state.closeRelease
      state.closeRelease = null
      release?.()
    },
    inspect() {
      return {
        closePending: typeof state.closeRelease === 'function',
        openUris: [...state.openUris],
        textDocumentMethods: [...state.textDocumentMethods],
      }
    },
  }
}

test('pyright provider serializes close before a reopen update', async () => {
  const fakePyright = createFakePyrightSpawn()
  const failures = []
  const filePath = path.join('C:', 'repo', 'example.py')
  const documentUri = pathToFileURL(filePath).href
  const session = createPyrightProviderSession({
    command: process.execPath,
    args: [],
    cwd: path.dirname(filePath),
  }, {
    workspaceRoot: path.dirname(filePath),
    onFailure(message) {
      failures.push(String(message || ''))
    },
    spawnProcess: fakePyright.spawnProcess,
  })

  await session.updateDocument({
    uri: documentUri,
    absoluteFilePath: filePath,
    content: 'value = 1\n',
    version: 1,
  })

  const closePromise = session.closeDocument({
    uri: documentUri,
    absoluteFilePath: filePath,
    content: 'value = 1\n',
    version: 1,
  })
  const reopenPromise = session.updateDocument({
    uri: documentUri,
    absoluteFilePath: filePath,
    content: 'value = 2\n',
    version: 2,
  })

  await new Promise((resolve) => setTimeout(resolve, 10))

  const beforeRelease = fakePyright.inspect()
  assert.equal(beforeRelease.closePending, true)
  assert.deepEqual(beforeRelease.textDocumentMethods, [
    'textDocument/didOpen',
    'textDocument/didClose',
  ])
  assert.deepEqual(failures, [])

  fakePyright.releaseClose()
  await Promise.all([closePromise, reopenPromise])

  const afterRelease = fakePyright.inspect()
  assert.deepEqual(afterRelease.textDocumentMethods, [
    'textDocument/didOpen',
    'textDocument/didClose',
    'textDocument/didOpen',
  ])
  assert.deepEqual(failures, [])

  await session.stop()
})
