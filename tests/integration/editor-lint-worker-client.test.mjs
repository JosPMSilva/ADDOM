import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { createEditorLintWorkerClient } from '../../src/main/ipc-handlers/editor-lint.mjs'

class FakeLintWorker extends EventEmitter {
  static instances = []

  constructor() {
    super()
    this.behavior = FakeLintWorker.behaviors.shift() || { type: 'success', result: {} }
    this.messages = []
    this.terminated = false
    FakeLintWorker.instances.push(this)
  }

  postMessage(message) {
    this.messages.push(message)
    if (this.behavior.type === 'success') {
      queueMicrotask(() => {
        this.emit('message', {
          id: message.id,
          ok: true,
          result: this.behavior.result,
        })
      })
    }
  }

  terminate() {
    this.terminated = true
    return Promise.resolve(0)
  }
}

test.afterEach(() => {
  FakeLintWorker.behaviors = []
  FakeLintWorker.instances = []
})

test('editor lint worker client retries once with a fresh worker after a timeout', async () => {
  FakeLintWorker.behaviors = [
    { type: 'timeout' },
    {
      type: 'success',
      result: {
        ok: true,
        available: true,
        source: 'project-config',
        messages: [],
      },
    },
  ]

  const client = createEditorLintWorkerClient({
    WorkerClass: FakeLintWorker,
    workerUrl: new URL('file:///fake/editor-lint-worker.mjs'),
    workerOptions: {},
    requestTimeoutMs: 10,
  })

  const result = await client.lintTextViaWorker({
    project: 'C:/repo',
    filePath: 'src/example.js',
    content: 'const value = 1\n',
  })

  assert.deepEqual(result, {
    ok: true,
    available: true,
    source: 'project-config',
    messages: [],
  })
  assert.equal(FakeLintWorker.instances.length, 2)
  assert.equal(FakeLintWorker.instances[0]?.terminated, true)
  assert.equal(FakeLintWorker.instances[1]?.terminated, false)
})
