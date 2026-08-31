import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openrouter-visibility-settings-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  getSettings,
  setSettingsPatch,
} = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('openrouter catalog visibility defaults to an all-visible empty override state', () => {
  const settings = getSettings()
  assert.deepEqual(settings.modelCatalogVisibility?.openrouter, {
    defaultVisible: true,
    namespaceVisibility: {},
    modelOverrides: {},
    filters: {
      reviewedOnly: false,
      toolsOnly: false,
      reasoningOnly: false,
      visionOnly: false,
    },
  })
})

test('openrouter catalog visibility normalizes persisted booleans and partial filter payloads', async () => {
  const next = await setSettingsPatch({
    permissionMode: 'autonomy',
    modelCatalogVisibility: {
      openrouter: {
        namespaceVisibility: {
          openai: true,
          perplexity: false,
          google: 'yes',
        },
        modelOverrides: {
          'openai/gpt-5.4': true,
          'perplexity/sonar-deep-research': false,
        },
        filters: {
          reviewedOnly: true,
          toolsOnly: 1,
          reasoningOnly: true,
        },
      },
    },
  })

  assert.equal(next.permissionMode, 'autonomy')
  assert.deepEqual(next.modelCatalogVisibility.openrouter, {
    defaultVisible: true,
    namespaceVisibility: {
      perplexity: false,
      google: false,
    },
    modelOverrides: {
      'openai/gpt-5.4': true,
      'perplexity/sonar-deep-research': false,
    },
    filters: {
      reviewedOnly: true,
      toolsOnly: false,
      reasoningOnly: true,
      visionOnly: false,
    },
  })
})

test('openrouter catalog visibility patch replaces the openrouter subtree so resets can clear old overrides', async () => {
  await setSettingsPatch({
    modelCatalogVisibility: {
      openrouter: {
        namespaceVisibility: {
          openai: false,
        },
        modelOverrides: {
          'openai/gpt-5.4': true,
        },
        filters: {
          toolsOnly: true,
        },
      },
    },
  })

  const reset = await setSettingsPatch({
    modelCatalogVisibility: {
      openrouter: {
        namespaceVisibility: {},
        modelOverrides: {},
        filters: {
          reviewedOnly: false,
          toolsOnly: false,
          reasoningOnly: false,
          visionOnly: false,
        },
      },
    },
  })

  assert.deepEqual(reset.modelCatalogVisibility.openrouter, {
    defaultVisible: true,
    namespaceVisibility: {},
    modelOverrides: {},
    filters: {
      reviewedOnly: false,
      toolsOnly: false,
      reasoningOnly: false,
      visionOnly: false,
    },
  })
})
