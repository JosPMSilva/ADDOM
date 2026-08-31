import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moonshot-settings-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  getSettings,
  setSettingsPatch,
} = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('moonshot runtime settings default to a disabled empty state', () => {
  const settings = getSettings()
  assert.deepEqual(settings.providerRuntimeSettings?.moonshot, {
    remoteToolsEnabled: false,
    enabledFormulaUris: [],
    remoteToolWarningAcknowledgedAt: 0,
    defaultMaxOutputTokensOverride: 0,
    toolResultBudgetCharsOverride: 0,
    oldToolResultPruningEnabled: true,
    promptPreflightHardGuardEnabled: true,
  })
})

test('moonshot runtime settings normalize supported formula URIs and preserve unrelated settings', async () => {
  const first = await setSettingsPatch({
    permissionMode: 'autonomy',
    providerRuntimeSettings: {
      moonshot: {
        remoteToolsEnabled: true,
        enabledFormulaUris: [
          'moonshot/web-search:latest',
          'web-search',
          'moonshot/unknown:latest',
          'moonshot/quickjs:latest',
          'moonshot/quickjs:latest',
        ],
        remoteToolWarningAcknowledgedAt: '1234',
        defaultMaxOutputTokensOverride: '6000',
        toolResultBudgetCharsOverride: '16000',
        oldToolResultPruningEnabled: false,
        promptPreflightHardGuardEnabled: false,
      },
    },
  })

  assert.equal(first.permissionMode, 'autonomy')
  assert.deepEqual(first.providerRuntimeSettings.moonshot, {
    remoteToolsEnabled: true,
    enabledFormulaUris: [
      'moonshot/web-search:latest',
      'moonshot/quickjs:latest',
    ],
    remoteToolWarningAcknowledgedAt: 1234,
    defaultMaxOutputTokensOverride: 6_000,
    toolResultBudgetCharsOverride: 16_000,
    oldToolResultPruningEnabled: false,
    promptPreflightHardGuardEnabled: false,
  })

  const second = await setSettingsPatch({
    permissionMode: 'ask',
    providerRuntimeSettings: {
      moonshot: {
        enabledFormulaUris: [
          'moonshot/fetch:latest',
          'fetch',
        ],
        defaultMaxOutputTokensOverride: -1,
        toolResultBudgetCharsOverride: 0,
        oldToolResultPruningEnabled: 'invalid',
        promptPreflightHardGuardEnabled: 'invalid',
      },
    },
  })

  assert.equal(second.permissionMode, 'ask')
  assert.equal(second.providerRuntimeSettings.moonshot.remoteToolsEnabled, true)
  assert.deepEqual(second.providerRuntimeSettings.moonshot.enabledFormulaUris, [
    'moonshot/fetch:latest',
  ])
  assert.equal(second.providerRuntimeSettings.moonshot.remoteToolWarningAcknowledgedAt, 1234)
  assert.equal(second.providerRuntimeSettings.moonshot.defaultMaxOutputTokensOverride, 0)
  assert.equal(second.providerRuntimeSettings.moonshot.toolResultBudgetCharsOverride, 0)
  assert.equal(second.providerRuntimeSettings.moonshot.oldToolResultPruningEnabled, true)
  assert.equal(second.providerRuntimeSettings.moonshot.promptPreflightHardGuardEnabled, true)
})
