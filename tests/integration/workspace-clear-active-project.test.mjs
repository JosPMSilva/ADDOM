import assert from 'node:assert/strict'
import test from 'node:test'

import { registerWorkspaceHandlers } from '../../src/main/ipc-handlers/workspace.mjs'

function createHarness() {
  const handlers = new Map()
  return {
    ipcMain: {
      handle(channel, listener) {
        handlers.set(String(channel), listener)
      },
    },
    invoke(channel, payload = {}, sender = { send() {} }) {
      const handler = handlers.get(String(channel))
      if (!handler) throw new Error(`No handler registered for ${channel}`)
      return handler({ sender }, payload)
    },
  }
}

test('clear-active-project clears the main route and optionally notifies the renderer', async () => {
  const harness = createHarness()
  const activePaths = []
  const sent = []
  const sender = {
    send(channel, payload) {
      sent.push({ channel, payload })
    },
  }
  registerWorkspaceHandlers({
    ipcMainImpl: harness.ipcMain,
    onActiveProjectPathChanged: (projectPath) => activePaths.push(projectPath),
    sendVersionedImpl: (target, channel, payload) => target.send(channel, payload),
  })

  const silentResult = await harness.invoke('v1:workspace:clear-active-project', {
    notifyRenderer: false,
  }, sender)
  assert.deepEqual(silentResult, { project: null, activeThread: null })
  assert.deepEqual(activePaths, [''])
  assert.deepEqual(sent, [])

  const notifiedResult = await harness.invoke('v1:workspace:clear-active-project', {}, sender)
  assert.deepEqual(notifiedResult, { project: null, activeThread: null })
  assert.deepEqual(activePaths, ['', ''])
  assert.deepEqual(sent, [{
    channel: 'workspace:active-project-changed',
    payload: {
      action: 'clear-active-project',
      project: null,
      activeThread: null,
    },
  }])
})
