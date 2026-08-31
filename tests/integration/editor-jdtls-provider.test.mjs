import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'

import { createJdtlsProviderSession } from '../../src/main/editor/editor-jdtls-provider.mjs'

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

function createFakeJdtlsSpawn() {
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
        const method = String(payload?.method || '')
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

        if (payload?.id != null && method === 'textDocument/formatting') {
          queueMicrotask(() => {
            child.stdout.emit('data', encodeLspMessage({
              jsonrpc: '2.0',
              id: payload.id,
              result: [{
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 1, character: 0 },
                },
                newText: 'class App {\n}\n',
              }],
            }))
            callback(null)
          })
          return true
        }

        if (payload?.id != null && method === 'textDocument/codeAction') {
          queueMicrotask(() => {
            child.stdout.emit('data', encodeLspMessage({
              jsonrpc: '2.0',
              id: payload.id,
              result: [{
                title: 'Organize imports',
                kind: 'source.organizeImports',
                isPreferred: true,
                edit: {
                  changes: {
                    [payload.params.textDocument.uri]: [{
                      range: {
                        start: { line: 0, character: 0 },
                        end: { line: 1, character: 0 },
                      },
                      newText: 'class App {\n}\n',
                    }],
                  },
                },
              }],
            }))
            callback(null)
          })
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
  }
}

test('jdtls provider session applies formatting edits and workspace-edit code actions', async () => {
  const fakeJdtls = createFakeJdtlsSpawn()
  const filePath = path.join('C:', 'repo', 'src', 'main', 'java', 'App.java')
  const documentUri = pathToFileURL(filePath).href
  const session = createJdtlsProviderSession({
    command: process.execPath,
    args: [],
    cwd: path.dirname(filePath),
  }, {
    workspaceRoot: path.dirname(path.dirname(path.dirname(path.dirname(filePath)))),
    spawnProcess: fakeJdtls.spawnProcess,
  })

  const document = {
    uri: documentUri,
    filePath: 'src/main/java/App.java',
    absoluteFilePath: filePath,
    content: 'class App {}\n',
    version: 1,
  }

  const formatting = await session.requestFormatting(document)
  const codeActions = await session.requestCodeActions(document)

  assert.equal(formatting.changed, true)
  assert.equal(formatting.formatted, 'class App {\n}\n')
  assert.equal(Array.isArray(codeActions), true)
  assert.equal(codeActions.length, 1)
  assert.equal(codeActions[0].kind, 'source.organizeImports')
  assert.equal(codeActions[0].edit?.fullText, 'class App {\n}\n')

  await session.stop()
})
