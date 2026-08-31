import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-editor-language-service-rollout-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getSettings, setSettingsPatch } = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('editor language-service platform rollout defaults to pilot metadata', () => {
  const settings = getSettings()
  assert.deepEqual(settings.editorLanguageServicePlatform, {
    enabled: true,
    rolloutChannel: 'pilot',
  })
})

test('editor language-service platform rollout normalizes invalid values and keeps disabled state off', async () => {
  const shadow = await setSettingsPatch({
    editorLanguageServicePlatform: {
      enabled: true,
      rolloutChannel: 'shadow',
    },
  })

  assert.deepEqual(shadow.editorLanguageServicePlatform, {
    enabled: true,
    rolloutChannel: 'shadow',
  })

  const normalizedPilot = await setSettingsPatch({
    editorLanguageServicePlatform: {
      enabled: true,
      rolloutChannel: 'unsupported_channel',
    },
  })

  assert.deepEqual(normalizedPilot.editorLanguageServicePlatform, {
    enabled: true,
    rolloutChannel: 'pilot',
  })

  const disabled = await setSettingsPatch({
    editorLanguageServicePlatform: {
      enabled: false,
      rolloutChannel: 'pilot',
    },
  })

  assert.deepEqual(disabled.editorLanguageServicePlatform, {
    enabled: false,
    rolloutChannel: 'off',
  })
})
