import test from 'node:test'
import assert from 'node:assert/strict'

import { registerCursorAgentHandlers } from '../../src/main/ipc-handlers/cursor-agent.mjs'

test('Cursor IPC exposes only the supported runtime and auth actions', async () => {
  const handlers = new Map()
  const calls = []
  const service = {
    getState: async () => ({ runtime: { status: 'runtime_ready' } }),
    prepareRuntime: async () => ({ status: 'runtime_ready' }),
    checkRuntimeUpdate: async () => ({ updateStatus: 'current' }),
    installRuntimeUpdate: async () => ({ status: 'runtime_ready' }),
    startLogin: async () => ({ status: 'pending', authUrl: 'https://cursor.com/auth/probe' }),
    cancelLogin: async () => ({ cancelled: true }),
    logout: async () => ({ ok: true }),
  }
  registerCursorAgentHandlers({
    service,
    handle: (channel, handler) => handlers.set(channel, handler),
  })

  for (const [channel, handler] of handlers) calls.push([channel, await handler({}, {})])

  assert.deepEqual([...handlers.keys()], [
    'cursor-agent:get-state',
    'cursor-agent:prepare-runtime',
    'cursor-agent:check-runtime-update',
    'cursor-agent:install-runtime-update',
    'cursor-agent:start-login',
    'cursor-agent:cancel-login',
    'cursor-agent:logout',
  ])
  assert.equal(calls[0][1].runtime.status, 'runtime_ready')
})
