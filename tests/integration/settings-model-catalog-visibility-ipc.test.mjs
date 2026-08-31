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

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-settings-model-catalog-ipc-'))
const ipcMain = createIpcMainHandleMock()
const sent = []

process.env.ADDOM_USER_DATA_PATH = userDataPath
globalThis.__ADDOM_TEST_ELECTRON__ = {
  ipcMain,
  BrowserWindow: {
    getAllWindows: () => [{
      webContents: {
        isDestroyed: () => false,
        send: (channel, payload) => sent.push({ channel, payload }),
      },
    }],
  },
}

const handlersUrl = pathToFileURL(path.resolve('src/main/ipc-handlers/settings.mjs')).href
const settingsUrl = pathToFileURL(path.resolve('src/main/settings.mjs')).href

const { registerSettingsHandlers } = await import(`${handlersUrl}?settings-model-catalog-ipc=${Date.now()}`)
const { getSettings } = await import(`${settingsUrl}?settings-model-catalog-ipc=${Date.now()}`)

registerSettingsHandlers()

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { delete globalThis.__ADDOM_TEST_ELECTRON__ } catch { /* best-effort test cleanup */ }
})

test('settings:set persists and broadcasts model catalog visibility patches', async () => {
  sent.length = 0

  const result = await ipcMain.invoke('v1:settings:set', {}, {
    patch: {
      modelCatalogVisibility: {
        openrouter: {
          defaultVisible: false,
          namespaceVisibility: {
            openai: true,
          },
          modelOverrides: {
            'anthropic/claude-opus-4.6': true,
          },
          filters: {
            reviewedOnly: true,
          },
        },
      },
    },
  })

  assert.equal(result.modelCatalogVisibility.openrouter.defaultVisible, false)
  assert.deepEqual(result.modelCatalogVisibility.openrouter.namespaceVisibility, {
    openai: true,
  })
  assert.deepEqual(result.modelCatalogVisibility.openrouter.modelOverrides, {
    'anthropic/claude-opus-4.6': true,
  })
  assert.deepEqual(result.modelCatalogVisibility.openrouter.filters, {
    reviewedOnly: true,
    toolsOnly: false,
    reasoningOnly: false,
    visionOnly: false,
  })

  const persisted = getSettings()
  assert.equal(persisted.modelCatalogVisibility.openrouter.defaultVisible, false)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].channel, 'v1:settings:updated')
  assert.deepEqual(sent[0].payload.changedKeys, ['modelCatalogVisibility'])
  assert.equal(sent[0].payload.settings?.modelCatalogVisibility?.openrouter?.defaultVisible, false)
})

test('settings:set persists and broadcasts ui scaling patches', async () => {
  sent.length = 0

  const result = await ipcMain.invoke('v1:settings:set', {}, {
    patch: {
      uiScaling: {
        mode: 'manual',
        scale: 0.9,
      },
    },
  })

  assert.deepEqual(result.uiScaling, {
    mode: 'manual',
    scale: 0.9,
  })

  const persisted = getSettings()
  assert.deepEqual(persisted.uiScaling, {
    mode: 'manual',
    scale: 0.9,
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].channel, 'v1:settings:updated')
  assert.deepEqual(sent[0].payload.changedKeys, ['uiScaling'])
  assert.deepEqual(sent[0].payload.settings?.uiScaling, {
    mode: 'manual',
    scale: 0.9,
  })
})

test('settings:set persists and broadcasts background tone patches', async () => {
  sent.length = 0

  const result = await ipcMain.invoke('v1:settings:set', {}, {
    patch: {
      backgroundTone: {
        tone: 'ash',
      },
    },
  })

  assert.deepEqual(result.backgroundTone, {
    tone: 'ash',
  })

  const persisted = getSettings()
  assert.deepEqual(persisted.backgroundTone, {
    tone: 'ash',
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].channel, 'v1:settings:updated')
  assert.deepEqual(sent[0].payload.changedKeys, ['backgroundTone'])
  assert.deepEqual(sent[0].payload.settings?.backgroundTone, {
    tone: 'ash',
  })
})

test('settings:set persists and broadcasts terminal settings patches', async () => {
  sent.length = 0

  const result = await ipcMain.invoke('v1:settings:set', {}, {
    patch: {
      terminal: {
        fontSize: 15,
        fontFamily: 'jetbrains_mono',
        defaultShell: 'pwsh',
        defaultCwdBehavior: 'editor_folder',
        copyOnSelection: true,
      },
    },
  })

  assert.deepEqual(result.terminal, {
    fontSize: 15,
    fontFamily: 'jetbrains_mono',
    scrollback: 5000,
    defaultShell: 'pwsh',
    defaultCwdBehavior: 'editor_folder',
    copyOnSelection: true,
    pasteConfirmationLineThreshold: 12,
  })

  const persisted = getSettings()
  assert.deepEqual(persisted.terminal, result.terminal)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].channel, 'v1:settings:updated')
  assert.deepEqual(sent[0].payload.changedKeys, ['terminal'])
  assert.deepEqual(sent[0].payload.settings?.terminal, result.terminal)
})

test('settings:set persists and broadcasts canonical agent settings', async () => {
  sent.length = 0

  const result = await ipcMain.invoke('v1:settings:set', {}, {
    patch: {
      agentSettings: {
        enabled: false,
        defaultProfile: 'high',
        limits: {
          maxLiveAgents: 12,
          maxDepth: 5,
          maxDescendants: 120,
          maxTotalTokens: 750_000,
          maxCostUsd: 125,
          maxDurationMs: 3_600_000,
        },
        providerConcurrencyCaps: {
          openai: 6,
        },
      },
    },
  })

  assert.equal(result.agentSettings.enabled, false)
  assert.equal(result.agentSettings.defaultProfile, 'high')
  assert.equal(result.agentSettings.writeIsolation, 'required')
  assert.equal(result.agentSettings.limits.maxLiveAgents, 12)
  assert.deepEqual(result.agentSettings.providerConcurrencyCaps, { openai: 6 })

  const persisted = getSettings()
  assert.deepEqual(persisted.agentSettings, result.agentSettings)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].channel, 'v1:settings:updated')
  assert.deepEqual(sent[0].payload.changedKeys, ['agentSettings'])
  assert.deepEqual(sent[0].payload.settings?.agentSettings, result.agentSettings)
})

test('settings:set rejects advanced runtime objects on the public settings surface', async () => {
  sent.length = 0

  await assert.rejects(
    () => ipcMain.invoke('v1:settings:set', {}, {
      patch: {
        providerRuntimeSettings: {
          anthropic: {
            contextManagementCompactionThresholdTokens: 50_000,
          },
        },
        terminal: {
          scrollback: 12000,
        },
      },
    }),
    /settings:set cannot mutate advanced or dedicated settings: providerRuntimeSettings, terminal.scrollback/,
  )

  assert.equal(sent.length, 0)
})

test('provider-auth:set-method persists and broadcasts the dedicated OpenAI auth choice', async () => {
  sent.length = 0

  const result = await ipcMain.invoke('v1:provider-auth:set-method', {}, {
    providerId: 'openai',
    authMethod: 'account',
  })

  assert.deepEqual(result, { authMethod: 'account' })

  const persisted = getSettings()
  assert.equal(persisted.providerAuthSettings.openai.authMethod, 'account')
  assert.equal(sent.length, 1)
  assert.equal(sent[0].channel, 'v1:settings:updated')
  assert.deepEqual(sent[0].payload.changedKeys, ['providerAuthSettings'])
  assert.equal(sent[0].payload.settings?.providerAuthSettings?.openai?.authMethod, 'account')
})

test('provider-auth:set-method persists the dedicated Cursor auth choice', async () => {
  sent.length = 0

  const result = await ipcMain.invoke('v1:provider-auth:set-method', {}, {
    providerId: 'cursor',
    authMethod: 'api_key',
  })

  assert.deepEqual(result, { authMethod: 'api_key' })
  assert.equal(getSettings().providerAuthSettings.cursor.authMethod, 'api_key')
  assert.equal(sent[0].payload.settings.providerAuthSettings.cursor.authMethod, 'api_key')
})

test('provider-runtime-settings:set persists and broadcasts a scoped reasoning-effort change', async () => {
  sent.length = 0

  const result = await ipcMain.invoke('v1:provider-runtime-settings:set', {}, {
    providerId: 'openai',
    runtimeSettings: { reasoningEffort: 'medium' },
  })

  assert.equal(result.reasoningEffort, 'medium')
  assert.equal(getSettings().providerRuntimeSettings.openai.reasoningEffort, 'medium')
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].payload.changedKeys, ['providerRuntimeSettings'])
  assert.equal(sent[0].payload.settings.providerRuntimeSettings.openai.reasoningEffort, 'medium')
})

test('moa-roles:set persists and broadcasts dedicated role changes', async () => {
  sent.length = 0

  const result = await ipcMain.invoke('v1:moa-roles:set', {}, {
    moaRoles: [{
      id: 'role_ipc_reviewer',
      name: 'IPC Reviewer',
      providerId: 'openai',
      model: 'gpt-5.4',
      canWriteFiles: true,
    }],
  })

  assert.equal(result.ok, true)
  assert.equal(result.moaRoles.length, 1)
  assert.equal(result.moaRoles[0].name, 'IPC Reviewer')
  assert.equal(result.moaRoles[0].canWriteFiles, false)

  const persisted = getSettings()
  assert.equal(persisted.moaRoles.some((role) => role.id === 'role_ipc_reviewer'), true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].channel, 'v1:settings:updated')
  assert.deepEqual(sent[0].payload.changedKeys, ['moaRoles'])
})
