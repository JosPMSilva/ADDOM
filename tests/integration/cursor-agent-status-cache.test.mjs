import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cursor-status-cache-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { createCursorAgentAuthService } = await import('../../src/main/cursor-agent/cursor-agent-auth-service.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort */ }
})

function createReadyService(overrides = {}) {
  return createCursorAgentAuthService({
    userDataPath,
    runtimeManager: {
      ensureRuntimeReady: async () => ({ status: 'runtime_ready', commandPath: 'cursor-agent.cmd' }),
      refreshState: () => ({ status: 'runtime_ready', commandPath: 'cursor-agent.cmd' }),
    },
    ...overrides,
  })
}

test('Cursor getState single-flights concurrent status probes and reuses the TTL cache', async () => {
  let active = 0
  let peak = 0
  let statusCalls = 0
  const release = []
  const nowRef = { value: 5_000 }
  const service = createReadyService({
    now: () => nowRef.value,
    accountStatusTtlMs: 30_000,
    runCommand: async ({ args }) => {
      if (args[0] !== 'status') return { code: 0, stdout: '' }
      statusCalls += 1
      active += 1
      peak = Math.max(peak, active)
      // Only the first probe is gated; later TTL/force reads must not hang the suite.
      if (statusCalls === 1) {
        await new Promise((resolve) => { release.push(resolve) })
      }
      active -= 1
      return { code: 0, stdout: 'Logged in as member@example.test\n' }
    },
  })

  try {
    const pending = Promise.all(Array.from({ length: 12 }, () => service.getState()))
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(statusCalls, 1)
    assert.equal(peak, 1)
    while (release.length > 0) release.shift()()
    const states = await pending
    assert.equal(states.every((state) => state.account.status === 'authenticated'), true)
    await service.getState()
    assert.equal(statusCalls, 1)
    nowRef.value += 31_000
    await service.getState()
    assert.equal(statusCalls, 2)
  } finally {
    while (release.length > 0) release.shift()()
  }
})

test('forceRefresh bypasses the TTL cache but still coalesces concurrent in-flight probes', async () => {
  const nowRef = { value: 1_000 }
  let statusCalls = 0
  let active = 0
  let peak = 0
  const release = []
  const service = createReadyService({
    now: () => nowRef.value,
    accountStatusTtlMs: 30_000,
    runCommand: async ({ args }) => {
      if (args[0] !== 'status') return { code: 0, stdout: '' }
      statusCalls += 1
      active += 1
      peak = Math.max(peak, active)
      if (statusCalls === 2) {
        await new Promise((resolve) => { release.push(resolve) })
      }
      active -= 1
      return { code: 0, stdout: 'Logged in as member@example.test\n' }
    },
  })

  try {
    await service.getState()
    await service.getState()
    assert.equal(statusCalls, 1)

    const pending = Promise.all([
      service.getState({ forceRefresh: true }),
      service.getState({ forceRefresh: true }),
      service.getState({ forceRefresh: true }),
    ])
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(statusCalls, 2)
    assert.equal(peak, 1)
    while (release.length > 0) release.shift()()
    await pending
    assert.equal(statusCalls, 2)
  } finally {
    while (release.length > 0) release.shift()()
  }
})

test('login, logout, and runtime prepare invalidate the Cursor account cache', async () => {
  const nowRef = { value: 1_000 }
  let statusCalls = 0
  const service = createReadyService({
    now: () => nowRef.value,
    accountStatusTtlMs: 60_000,
    runCommand: async ({ args }) => {
      if (args[0] === 'status') {
        statusCalls += 1
        return { code: 0, stdout: 'Logged in as member@example.test\n' }
      }
      return { code: 0, stdout: '' }
    },
    startLoginProcess: () => ({
      authUrl: Promise.resolve('https://cursor.com/auth/probe'),
      completed: Promise.resolve({ code: 0, output: '', error: null }),
      cancel: async () => true,
    }),
  })

  await service.getState()
  assert.equal(statusCalls, 1)
  await service.startLogin()
  await service.getState()
  assert.equal(statusCalls, 2)
  await service.logout()
  await service.getState()
  assert.equal(statusCalls, 3)
  await service.prepareRuntime()
  await service.getState()
  assert.equal(statusCalls, 4)
})
