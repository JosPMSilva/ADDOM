import test from 'node:test'
import assert from 'node:assert/strict'

import { createCursorAgentAuthService } from '../../src/main/cursor-agent/cursor-agent-auth-service.mjs'

test('Cursor auth service normalizes isolated account status and login URL', async () => {
  const calls = []
  const service = createCursorAgentAuthService({
    runtimeManager: {
      ensureRuntimeReady: async () => ({ status: 'runtime_ready', commandPath: 'cursor-agent.cmd' }),
      refreshState: () => ({ status: 'runtime_ready', commandPath: 'cursor-agent.cmd' }),
    },
    runCommand: async ({ args, env }) => {
      calls.push({ args, env })
      if (args[0] === 'status') return { code: 0, stdout: 'Logged in as member@example.test\n' }
      return { code: 0, stdout: '' }
    },
    startLoginProcess: ({ env }) => {
      calls.push({ args: ['login'], env })
      return {
        authUrl: Promise.resolve('https://cursor.com/auth/probe'),
        completed: new Promise(() => {}),
        cancel: async () => true,
      }
    },
  })

  const status = await service.getStatus()
  const login = await service.startLogin()

  assert.deepEqual(status, { status: 'authenticated', accountLabel: 'member@example.test' })
  assert.equal(login.status, 'pending')
  assert.equal(login.authUrl, 'https://cursor.com/auth/probe')
  assert.equal(calls.every((call) => call.env.HOME && call.env.USERPROFILE), true)
})

test('Cursor auth login remains pending until explicitly cancelled', async () => {
  let cancelCount = 0
  const service = createCursorAgentAuthService({
    runtimeManager: {
      ensureRuntimeReady: async () => ({ status: 'runtime_ready', commandPath: 'cursor-agent.cmd' }),
      refreshState: () => ({ status: 'runtime_ready', commandPath: 'cursor-agent.cmd' }),
    },
    startLoginProcess: () => ({
      authUrl: Promise.resolve('https://cursor.com/auth/probe'),
      completed: new Promise(() => {}),
      cancel: async () => { cancelCount += 1; return true },
    }),
  })

  await service.startLogin()
  const result = await service.cancelLogin()

  assert.deepEqual(result, { cancelled: true })
  assert.equal(cancelCount, 1)
})
