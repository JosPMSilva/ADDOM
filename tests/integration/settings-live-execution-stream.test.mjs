import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-settings-live-execution-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getSettings, setSettingsPatch } = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('live execution stream defaults to enabled when settings are empty', () => {
  const settings = getSettings()
  assert.equal(settings.liveExecutionStreamEnabled, true)
})

test('settings:set persists live execution stream rollout toggle', async () => {
  const disabled = await setSettingsPatch({ liveExecutionStreamEnabled: false })
  assert.equal(disabled.liveExecutionStreamEnabled, false)

  const enabled = await setSettingsPatch({ liveExecutionStreamEnabled: true })
  assert.equal(enabled.liveExecutionStreamEnabled, true)
})
