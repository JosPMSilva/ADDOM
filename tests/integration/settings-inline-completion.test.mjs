import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-settings-inline-completion-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getSettings, setSettingsPatch } = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('inline completion defaults to enabled when settings are empty', () => {
  const settings = getSettings()
  assert.equal(settings.inlineCompletionEnabled, true)
})

test('settings:set persists inline completion toggle', async () => {
  const disabled = await setSettingsPatch({ inlineCompletionEnabled: false })
  assert.equal(disabled.inlineCompletionEnabled, false)

  const enabled = await setSettingsPatch({ inlineCompletionEnabled: true })
  assert.equal(enabled.inlineCompletionEnabled, true)
})
