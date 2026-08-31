import test from 'node:test'

import {
  __resetOpenAIResponsesWebSocketFactoryForTests,
  __setOpenAIResponsesWebSocketReconnectWaitForTests,
  __setOpenAIResponsesWebSocketStreamTimeoutMsForTests,
} from '../../src/main/api-clients/experimental/openai-websocket/openai-websocket-runtime.mjs'
import {
  __resetOpenAIBackgroundClientFactoryForTests,
} from '../../src/main/api-clients/openai-background-runtime.mjs'

export class FakeSocket {
  constructor() {
    this.listeners = new Map()
    this.sent = []
    this.closeCalls = []
  }

  addEventListener(type, listener) {
    const rows = this.listeners.get(type) || []
    rows.push(listener)
    this.listeners.set(type, rows)
  }

  removeEventListener(type, listener) {
    const rows = this.listeners.get(type) || []
    this.listeners.set(type, rows.filter((entry) => entry !== listener))
  }

  send(payload) {
    this.sent.push(String(payload || ''))
  }

  close(code, reason) {
    this.closeCalls.push({ code, reason })
  }

  emit(type, payload = {}) {
    const rows = this.listeners.get(type) || []
    for (const listener of rows) {
      listener(payload)
    }
  }
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_ADDOM_DEV = process.env.ADDOM_DEV

export function registerOpenAIWebSocketRuntimeTestCleanup() {
  test.afterEach(() => {
    __resetOpenAIResponsesWebSocketFactoryForTests()
    __resetOpenAIBackgroundClientFactoryForTests()
    __setOpenAIResponsesWebSocketReconnectWaitForTests(null)
    __setOpenAIResponsesWebSocketStreamTimeoutMsForTests(null)
    if (ORIGINAL_NODE_ENV == null) delete process.env.NODE_ENV
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV
    if (ORIGINAL_ADDOM_DEV == null) delete process.env.ADDOM_DEV
    else process.env.ADDOM_DEV = ORIGINAL_ADDOM_DEV
  })
}
