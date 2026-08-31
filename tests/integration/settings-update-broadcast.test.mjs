import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

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

function installSettingsUpdateCapture() {
  const sent = []
  const browserWindow = globalThis.__ADDOM_TEST_ELECTRON__?.BrowserWindow
  const original = browserWindow?.getAllWindows
  if (!browserWindow || typeof original !== 'function') {
    throw new Error('BrowserWindow test double is not installed.')
  }
  browserWindow.getAllWindows = () => [{
    webContents: {
      isDestroyed: () => false,
      send: (channel, payload) => sent.push({ channel, payload }),
    },
  }]
  return {
    sent,
    restore() {
      browserWindow.getAllWindows = original
    },
  }
}

function makeCustomPipeline(id = 'custom-pipeline-1') {
  return {
    id,
    name: 'Custom Review Pipeline',
    description: 'Saved custom pipeline for regression coverage.',
    steps: [
      {
        stepId: 'review',
        roleId: 'role_security',
        instruction: 'Review the code.',
        expected_output_format: 'Findings',
      },
    ],
  }
}

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-settings-update-broadcast-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath
const advancedTomlPath = path.join(userDataPath, 'advanced.toml')
globalThis.__ADDOM_TEST_ELECTRON__ = {
  ipcMain: {
    handle() {},
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}

const createRoleUrl = pathToFileURL(path.resolve('src/main/ipc-handlers/create-role-from-chat.mjs')).href
const pipelinesUrl = pathToFileURL(path.resolve('src/main/ipc-handlers/pipelines.mjs')).href
const settingsUrl = pathToFileURL(path.resolve('src/main/settings.mjs')).href

const { createPersistentRoleFromDefinition } = await import(`${createRoleUrl}?settings-broadcast=${Date.now()}-role`)
const { registerPipelineHandlers } = await import(`${pipelinesUrl}?settings-broadcast=${Date.now()}-pipelines`)
const { getSettings } = await import(`${settingsUrl}?settings-broadcast=${Date.now()}-settings`)

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { delete globalThis.__ADDOM_TEST_ELECTRON__ } catch { /* best-effort test cleanup */ }
})

test('createPersistentRoleFromDefinition broadcasts settings updates after saving a new role', async () => {
  const capture = installSettingsUpdateCapture()
  try {
    const result = await createPersistentRoleFromDefinition({
      name: 'Tech Analyst',
      providerId: 'openai',
      model: 'gpt-5.4',
      systemPrompt: 'Analyze technical products.',
      canWriteFiles: true,
    })

    assert.equal(result.ok, true)
    assert.equal(result.role.canWriteFiles, false)
    assert.equal(result.moaRoles.find((role) => role.name === 'Tech Analyst')?.canWriteFiles, false)
    assert.equal(getSettings().moaRoles.some((role) => role.name === 'Tech Analyst'), true)
    assert.equal(capture.sent.length, 1)
    assert.equal(capture.sent[0].channel, 'v1:settings:updated')
    assert.deepEqual(capture.sent[0].payload.changedKeys, ['moaRoles'])
    assert.equal(
      capture.sent[0].payload.settings?.moaRoles?.some((role) => role.name === 'Tech Analyst'),
      true,
    )
  } finally {
    capture.restore()
  }
})

test('pipeline save/delete handlers broadcast settings updates for custom pipeline changes', async () => {
  const capture = installSettingsUpdateCapture()
  try {
    fs.writeFileSync(advancedTomlPath, '[agents]\ncustom_pipelines_enabled = true\n', 'utf8')
    const ipcMain = createIpcMainHandleMock()
    registerPipelineHandlers(ipcMain)

    const saveResult = await ipcMain.invoke('v1:pipeline:save', {}, {
      pipeline: makeCustomPipeline('broadcasted-custom'),
    })
    assert.equal(saveResult.ok, true)

    const deleteResult = await ipcMain.invoke('v1:pipeline:delete', {}, {
      pipelineId: 'broadcasted-custom',
    })
    assert.equal(deleteResult.ok, true)

    assert.equal(capture.sent.length, 2)
    assert.deepEqual(capture.sent.map((row) => row.channel), [
      'v1:settings:updated',
      'v1:settings:updated',
    ])
    assert.deepEqual(capture.sent.map((row) => row.payload.changedKeys), [
      ['customPipelines'],
      ['customPipelines'],
    ])
  } finally {
    capture.restore()
  }
})
