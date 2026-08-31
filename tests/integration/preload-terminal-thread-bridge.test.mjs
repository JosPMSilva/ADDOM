import test from 'node:test'
import assert from 'node:assert/strict'

import { createPreloadHarness } from './preload-bridge-test-helpers.mjs'

test('preload terminal createSession forwards threadId and preferredSurface on the versioned bridge', async () => {
  const harness = await createPreloadHarness({
    invokeBehavior: async (channel, payload) => ({ ok: true, channel, payload }),
  })

  const response = await harness.addom.terminal.createSession({
    projectFolder: 'C:\\repo',
    cwd: '.',
    shell: 'default',
    cols: 90,
    rows: 30,
    permissionMode: 'ask',
    threadId: 'thread_terminal',
    preferredSurface: 'chat_dock',
    sessionTitle: 'Build logs',
  })

  assert.equal(response?.channel, 'v1:terminal:session:create')
  assert.deepEqual(harness.invokeCalls, [{
    channel: 'v1:terminal:session:create',
    payload: {
      projectFolder: 'C:\\repo',
      cwd: '.',
      shell: 'default',
      cols: 90,
      rows: 30,
      permissionMode: 'ask',
      threadId: 'thread_terminal',
      preferredSurface: 'chat_dock',
      sessionTitle: 'Build logs',
    },
  }])
})
