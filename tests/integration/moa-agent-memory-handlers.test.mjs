import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-memory-handler-userdata-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { registerAgentMemoryHandlers } = await import('../../src/main/ipc-handlers/agent-memory-handlers.mjs')
const { validateMoaProjectFolder } = await import('../../src/main/ipc-handlers/moa-project-validation.mjs')
const { writeMemory } = await import('../../src/main/moa/agent-memory.mjs')
const { closeDb } = await import('../../src/main/memory/db.mjs')
const { registerProject } = await import('../../src/main/workspace/workspace-store.mjs')

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

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

test('validateMoaProjectFolder rejects non-absolute project roots', () => {
  const result = validateMoaProjectFolder('relative/path')
  assert.equal(result.ok, false)
  assert.equal(result.error, 'invalid_project')
})

test('agent memory handlers reject unsafe project folders and allow valid project roots', async () => {
  const ipcMain = createIpcMainHandleMock()
  registerAgentMemoryHandlers(ipcMain)

  const invalid = await ipcMain.invoke('v1:agentMemory:list', {}, {
    projectFolder: 'relative/path',
  })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error, 'invalid_project')

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-memory-'))
  const memoryDir = path.join(projectRoot, '.addom', 'agent-memory')
  fs.mkdirSync(memoryDir, { recursive: true })
  fs.writeFileSync(
    path.join(memoryDir, 'security_reviewer.json'),
    JSON.stringify({
      roleId: 'security_reviewer',
      entries: [{ timestamp: '2026-03-10T00:00:00.000Z', summary: 'A', context: 'B' }],
    }, null, 2),
    'utf8',
  )

  try {
    registerProject(projectRoot)
    writeMemory(projectRoot, 'security_reviewer', {
      summary: 'A',
      context: 'B',
    })
    const listed = await ipcMain.invoke('v1:agentMemory:list', {}, {
      projectFolder: projectRoot,
    })
    assert.equal(listed.ok, true)
    assert.equal(Array.isArray(listed.roles), true)
    assert.equal(listed.roles.length, 1)
    assert.equal(listed.roles[0].roleId, 'security_reviewer')

    const cleared = await ipcMain.invoke('v1:agentMemory:clearAll', {}, {
      projectFolder: projectRoot,
    })
    assert.equal(cleared.ok, true)
    assert.equal(fs.readdirSync(memoryDir).length, 1)
    const empty = await ipcMain.invoke('v1:agentMemory:list', {}, {
      projectFolder: projectRoot,
    })
    assert.deepEqual(empty.roles, [])
  } finally {
    try { fs.rmSync(projectRoot, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})
