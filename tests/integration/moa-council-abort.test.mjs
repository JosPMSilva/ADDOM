import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { executeCouncil, resolveCouncilMembers } from '../../src/main/moa/council-mode.mjs'

const councilSource = fs.readFileSync(
  path.join(process.cwd(), 'src/main/ipc-handlers/council.mjs'),
  'utf8',
)

const roles = [
  { id: 'role_a', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5.4' },
  { id: 'role_b', name: 'Architecture Reviewer', providerId: 'moonshot', model: 'kimi-k2' },
]

const extendedRoles = [
  ...roles,
  { id: 'role_c', name: 'Performance Reviewer', providerId: 'openai', model: 'gpt-5.4-mini' },
  { id: 'role_d', name: 'Documentation Writer', providerId: 'openai', model: 'gpt-5.4-mini' },
]

function createIpcMainHandleMock() {
  const handlers = new Map()
  return {
    handle(channel, handler) {
      handlers.set(String(channel || ''), handler)
    },
    async invoke(channel, ...args) {
      const handler = handlers.get(String(channel || ''))
      if (!handler) throw new Error(`No handler for ${channel}`)
      return await handler(...args)
    },
  }
}

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-council-hardening-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('council handler passes AbortController signal into executeCouncil', () => {
  assert.match(councilSource, /abortSignal:\s*controller\.signal/)
})

test('executeCouncil returns aborted when the signal is already aborted', async () => {
  const controller = new AbortController()
  controller.abort()

  const result = await executeCouncil({
    instruction: 'Review the architecture.',
    moaRoles: roles,
    projectFolder: process.cwd(),
    abortSignal: controller.signal,
    executeDelegationFn: async () => {
      throw new Error('should not execute')
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'aborted')
})

test('resolveCouncilMembers prefers a bounded scored subset by default', () => {
  const members = resolveCouncilMembers(extendedRoles, {
    instruction: 'Run a council review of the auth and permission model.',
  })

  assert.equal(members.length, 3)
  assert.equal(members.some((role) => role.id === 'role_a'), true)
  assert.equal(members.some((role) => role.id === 'role_d'), false)
})

test('resolveCouncilMembers keeps explicit role selections bounded and stable', () => {
  const members = resolveCouncilMembers(extendedRoles, {
    councilRoleIds: ['role_d', 'role_b', 'role_a', 'role_c'],
    maxMembers: 3,
  })

  assert.deepEqual(members.map((role) => role.id), ['role_a', 'role_b', 'role_c'])
})

test('executeCouncil returns aborted when the signal is aborted after delegation completes', async () => {
  const controller = new AbortController()

  const result = await executeCouncil({
    instruction: 'Review the architecture.',
    moaRoles: roles,
    projectFolder: process.cwd(),
    abortSignal: controller.signal,
    executeDelegationFn: async () => {
      controller.abort()
      return {
        results: [
          { roleId: 'role_a', roleName: 'Security Reviewer', agentOutput: 'Finding A', status: 'completed' },
          { roleId: 'role_b', roleName: 'Architecture Reviewer', agentOutput: 'Finding B', status: 'completed' },
        ],
      }
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'aborted')
})

test('executeCouncil accepts modern delegation envelopes that return agents instead of results', async () => {
  let delegationContext = null
  const result = await executeCouncil({
    instruction: 'Review the project architecture.',
    moaRoles: roles,
    projectFolder: process.cwd(),
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    executeDelegationFn: async (_tasks, _roles, _vault, _folder, _emit, _signal, context) => {
      delegationContext = context
      return {
      agents: [
        { roleId: 'role_a', role: 'Security Reviewer', output: 'Finding A', status: 'completed' },
        { roleId: 'role_b', role: 'Architecture Reviewer', output: 'Finding B', status: 'completed' },
      ],
      }
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.successfulOutputs, 2)
  assert.equal(Array.isArray(result.memberOutputs), true)
  assert.deepEqual(result.memberOutputs.map((row) => row.roleId).sort(), ['role_a', 'role_b'])
  assert.match(String(result.synthesisPrompts?.userPrompt || ''), /Finding A/)
  assert.equal(delegationContext.projectId, 'project_01')
  assert.equal(delegationContext.threadId, 'thread_01')
  assert.equal(delegationContext.turnId, 'turn_01')
})

test('executeCouncil excludes non-completed members even if they produced partial output', async () => {
  const result = await executeCouncil({
    instruction: 'Review the project architecture.',
    moaRoles: roles,
    projectFolder: process.cwd(),
    executeDelegationFn: async () => ({
      agents: [
        { roleId: 'role_a', role: 'Security Reviewer', output: 'Finding A', status: 'completed' },
        { roleId: 'role_b', role: 'Architecture Reviewer', output: 'Partial failure text', status: 'timeout' },
      ],
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.successfulOutputs, 1)
  assert.equal(result.memberOutputs.length, 2)
  assert.match(String(result.synthesisPrompts?.userPrompt || ''), /Finding A/)
  assert.doesNotMatch(String(result.synthesisPrompts?.userPrompt || ''), /Partial failure text/)
})

test('council start returns an executionId immediately and exposes status polling', async () => {
  const ipcMain = createIpcMainHandleMock()
  const councilModule = await import(`${pathToFileURL(path.resolve('src/main/ipc-handlers/council.mjs')).href}?council-start=${Date.now()}`)
  const settingsModule = await import(`${pathToFileURL(path.resolve('src/main/settings.mjs')).href}?council-settings=${Date.now()}`)
  try {
    await settingsModule.setSettingsPatch({ moaRoles: roles })
    councilModule.registerCouncilHandlers(ipcMain)

    const started = await ipcMain.invoke('v1:council:start', {
      sender: { isDestroyed: () => true },
    }, {
      instruction: 'Review the project.',
      projectFolder: process.cwd(),
    })
    assert.equal(started.ok, true)
    assert.equal(typeof started.executionId, 'string')
    assert.equal(started.status, 'running')

    const firstStatus = await ipcMain.invoke('v1:council:get-status', {}, {
      executionId: started.executionId,
    })
    assert.equal(firstStatus.ok, true)

    let terminal = firstStatus
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (['completed', 'failed', 'aborted'].includes(String(terminal.status || ''))) break
      await new Promise((resolve) => setTimeout(resolve, 20))
      terminal = await ipcMain.invoke('v1:council:get-status', {}, {
        executionId: started.executionId,
      })
    }
    assert.equal(['completed', 'failed', 'aborted'].includes(String(terminal.status || '')), true)
  } finally {
    // settings temp root cleaned by test.after hook
  }
})
