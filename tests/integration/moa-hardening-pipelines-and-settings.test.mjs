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

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-hardening-settings-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const settingsUrl = pathToFileURL(path.resolve('src/main/settings.mjs')).href
const pipelinesUrl = pathToFileURL(path.resolve('src/main/ipc-handlers/pipelines.mjs')).href
const advancedTomlPath = path.join(userDataPath, 'advanced.toml')

const {
  getSettings,
  setSettingsPatch,
} = await import(`${settingsUrl}?moa-hardening=${Date.now()}-settings`)

const {
  registerPipelineHandlers,
  resolvePipelineDefinitionFromInput,
} = await import(`${pipelinesUrl}?moa-hardening=${Date.now()}-pipelines`)

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

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

function enableAdvancedCustomPipelines() {
  fs.writeFileSync(advancedTomlPath, '[agents]\ncustom_pipelines_enabled = true\n', 'utf8')
}

test('customPipelines are shadowed from production settings by default', async () => {
  const pipeline = makeCustomPipeline('persisted-custom')

  const next = await setSettingsPatch({
    customPipelines: [pipeline],
  })

  assert.equal(Array.isArray(next.customPipelines), true)
  assert.equal(next.customPipelines.length, 0)

  const reloaded = getSettings()
  assert.equal(reloaded.customPipelines.length, 0)

  if (fs.existsSync(path.join(userDataPath, 'settings.json'))) {
    const onDisk = JSON.parse(fs.readFileSync(path.join(userDataPath, 'settings.json'), 'utf8'))
    assert.equal(Array.isArray(onDisk.customPipelines), true)
    assert.equal(onDisk.customPipelines.length, 0)
  }
})

test('pipeline resolver includes custom pipelines only when advanced config enables them', async () => {
  enableAdvancedCustomPipelines()
  const pipeline = makeCustomPipeline('custom-resolve')
  await setSettingsPatch({ customPipelines: [pipeline] })

  const resolved = resolvePipelineDefinitionFromInput({ pipelineId: 'custom-resolve' }, getSettings())
  assert.equal(resolved.ok, true)
  assert.equal(resolved.pipeline.id, 'custom-resolve')
  assert.equal(resolved.pipeline.source, 'custom')
})

test('pipeline execute handler resolves advanced-enabled custom pipeline ids instead of treating them as missing', async () => {
  enableAdvancedCustomPipelines()
  const ipcMain = createIpcMainHandleMock()
  registerPipelineHandlers(ipcMain)

  const pipeline = makeCustomPipeline('custom-execute')
  await setSettingsPatch({ customPipelines: [pipeline] })

  const result = await ipcMain.invoke('v1:pipeline:execute', {}, {
    pipelineId: 'custom-execute',
    projectFolder: path.join(userDataPath, 'missing-project-root'),
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'invalid_project')
  assert.doesNotMatch(String(result.message || ''), /not found/i)
})

test('pipeline save and delete handlers reject custom authoring unless advanced-enabled', async () => {
  const ipcMain = createIpcMainHandleMock()
  registerPipelineHandlers(ipcMain)

  fs.writeFileSync(advancedTomlPath, '[agents]\ncustom_pipelines_enabled = false\n', 'utf8')
  const blocked = await ipcMain.invoke('v1:pipeline:save', {}, {
    pipeline: makeCustomPipeline('blocked-via-handler'),
  })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.error, 'custom_pipelines_disabled')

  enableAdvancedCustomPipelines()
  const saveResult = await ipcMain.invoke('v1:pipeline:save', {}, {
    pipeline: makeCustomPipeline('saved-via-handler'),
  })
  assert.equal(saveResult.ok, true)
  assert.equal(getSettings().customPipelines.some((row) => row.id === 'saved-via-handler'), true)

  const deleteResult = await ipcMain.invoke('v1:pipeline:delete', {}, {
    pipelineId: 'saved-via-handler',
  })
  assert.equal(deleteResult.ok, true)
  assert.equal(getSettings().customPipelines.some((row) => row.id === 'saved-via-handler'), false)
})

test('pipeline start returns an executionId immediately and exposes status polling', async () => {
  enableAdvancedCustomPipelines()
  const ipcMain = createIpcMainHandleMock()
  registerPipelineHandlers(ipcMain)

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-pipeline-start-'))
  try {
    await setSettingsPatch({ customPipelines: [makeCustomPipeline('custom-start')] })
    const started = await ipcMain.invoke('v1:pipeline:start', {}, {
      pipelineId: 'custom-start',
      projectFolder: projectRoot,
    })
    assert.equal(started.ok, true)
    assert.equal(typeof started.executionId, 'string')
    assert.equal(started.status, 'running')

    const firstStatus = await ipcMain.invoke('v1:pipeline:get-status', {}, {
      executionId: started.executionId,
    })
    assert.equal(firstStatus.ok, true)

    let terminal = firstStatus
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (['completed', 'failed', 'aborted'].includes(String(terminal.status || ''))) break
      await new Promise((resolve) => setTimeout(resolve, 20))
      terminal = await ipcMain.invoke('v1:pipeline:get-status', {}, {
        executionId: started.executionId,
      })
    }
    assert.equal(['completed', 'failed', 'aborted'].includes(String(terminal.status || '')), true)
  } finally {
    try { fs.rmSync(projectRoot, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})
