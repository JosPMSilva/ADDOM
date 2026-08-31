import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-anthropic-settings-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  getSettings,
  setSettingsPatch,
} = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('anthropic runtime settings default to compaction disabled', () => {
  const settings = getSettings()
  assert.deepEqual(settings.providerRuntimeSettings?.anthropic, {
    thinkingType: 'disabled',
    reasoningEffort: 'provider_default',
    useContextManagementCompaction: false,
    contextManagementCompactionThresholdTokens: 0,
    providerTruncationSoftTriggerPercent: 85,
    defaultMaxOutputTokensOverride: 0,
    toolResultBudgetCharsOverride: 0,
    oldToolResultPruningEnabled: true,
    promptPreflightHardGuardEnabled: true,
    contextManagementCompactionInstructions: '',
  })
})

test('anthropic runtime settings normalize public fields, ignore hidden adaptive override inputs, and preserve unrelated provider values', async () => {
  const first = await setSettingsPatch({
    providerRuntimeSettings: {
      anthropic: {
        thinkingType: 'enabled',
        reasoningEffort: 'max',
        useContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: '50000',
        providerTruncationSoftTriggerPercent: '50',
        defaultMaxOutputTokensOverride: '12000',
        toolResultBudgetCharsOverride: '24000',
        adaptiveInputCeilingOverrideTokens: '64000',
        adaptiveExplorationModeOverride: 'relaxed',
        oldToolResultPruningEnabled: false,
        promptPreflightHardGuardEnabled: false,
        contextManagementCompactionInstructions: '  Keep decisions and unresolved work.  ',
      },
      openai: {
        transportMode: 'responses_stream',
      },
    },
  })

  assert.deepEqual(first.providerRuntimeSettings.anthropic, {
    thinkingType: 'enabled',
    reasoningEffort: 'max',
    useContextManagementCompaction: true,
    contextManagementCompactionThresholdTokens: 50_000,
    providerTruncationSoftTriggerPercent: 50,
    defaultMaxOutputTokensOverride: 12_000,
    toolResultBudgetCharsOverride: 24_000,
    oldToolResultPruningEnabled: false,
    promptPreflightHardGuardEnabled: false,
    contextManagementCompactionInstructions: 'Keep decisions and unresolved work.',
  })
  assert.equal(first.providerRuntimeSettings.openai.transportMode, 'responses_stream')

  const second = await setSettingsPatch({
    providerRuntimeSettings: {
      anthropic: {
        thinkingType: 'invalid',
        reasoningEffort: 'invalid',
        contextManagementCompactionThresholdTokens: '-1',
        providerTruncationSoftTriggerPercent: 0,
        defaultMaxOutputTokensOverride: '-1',
        toolResultBudgetCharsOverride: '0',
        adaptiveInputCeilingOverrideTokens: '-1',
        adaptiveExplorationModeOverride: 'invalid',
        oldToolResultPruningEnabled: 'invalid',
        promptPreflightHardGuardEnabled: 'invalid',
        contextManagementCompactionInstructions: '   ',
      },
    },
  })

  assert.deepEqual(second.providerRuntimeSettings.anthropic, {
    thinkingType: 'disabled',
    reasoningEffort: 'provider_default',
    useContextManagementCompaction: true,
    contextManagementCompactionThresholdTokens: 0,
    providerTruncationSoftTriggerPercent: 85,
    defaultMaxOutputTokensOverride: 0,
    toolResultBudgetCharsOverride: 0,
    oldToolResultPruningEnabled: true,
    promptPreflightHardGuardEnabled: true,
    contextManagementCompactionInstructions: '',
  })
  assert.equal(second.providerRuntimeSettings.openai.transportMode, 'responses_stream')
})
