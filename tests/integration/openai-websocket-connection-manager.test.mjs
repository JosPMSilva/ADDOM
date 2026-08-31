import test from 'node:test'
import assert from 'node:assert/strict'

import {
  acquireOpenAIResponsesWebSocketConnection,
  __resetOpenAIResponsesWebSocketConnectionPoolForTests,
} from '../../src/main/api-clients/experimental/openai-websocket/openai-websocket-connection-manager.mjs'

class FakeSocket {
  constructor() {
    this.listeners = new Map()
    this.closeCalls = 0
  }

  addEventListener(type, handler) {
    const rows = this.listeners.get(type) || new Set()
    rows.add(handler)
    this.listeners.set(type, rows)
  }

  removeEventListener(type, handler) {
    const rows = this.listeners.get(type)
    if (!rows) return
    rows.delete(handler)
    if (rows.size === 0) this.listeners.delete(type)
  }

  send() {}

  close(code = 1000, reason = 'OK') {
    void code
    this.closeCalls += 1
    this.emit('close', { reason })
  }

  emit(type, event = {}) {
    const rows = this.listeners.get(type)
    if (!rows) return
    for (const handler of [...rows]) handler(event)
  }
}

test.afterEach(() => {
  __resetOpenAIResponsesWebSocketConnectionPoolForTests()
})

test('busy pooled websocket is not disposed when a concurrent acquire starts', async () => {
  const firstSocket = new FakeSocket()
  const secondSocket = new FakeSocket()

  const first = acquireOpenAIResponsesWebSocketConnection({
    apiKey: 'key',
    baseUrl: 'https://api.openai.com/v1',
    threadId: 'thread_busy',
    createSocket: () => firstSocket,
  })

  const second = acquireOpenAIResponsesWebSocketConnection({
    apiKey: 'key',
    baseUrl: 'https://api.openai.com/v1',
    threadId: 'thread_busy',
    createSocket: () => secondSocket,
  })

  assert.equal(first.reused, false)
  assert.equal(first.pooled, true)
  assert.equal(second.reused, false)
  assert.equal(second.pooled, false)
  assert.equal(firstSocket.closeCalls, 0)

  firstSocket.emit('open')
  await assert.doesNotReject(first.readyPromise)

  first.release({ keepAlive: true })
  second.release({ keepAlive: false })
})
