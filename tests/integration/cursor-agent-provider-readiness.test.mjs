import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cursor-provider-'))
process.env.NODE_ENV = 'test'
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { __testVaultHandlerInternals } = await import('../../src/main/ipc-handlers/vault-handler-helpers.mjs')
const { buildProviderModelSelectorViewModel } = await import('../../src/renderer/components/chat/provider-model-selector-view-model.mjs')

test.after(() => fs.rmSync(userDataPath, { recursive: true, force: true }))

test('Cursor readiness is explicit and separate from direct-provider catalog counts', async () => {
  const providers = await __testVaultHandlerInternals.resolveVaultGetProvidersResponse({}, {
    listConfiguredProviders: () => ({ cursor: true }),
    getProviderManifest: async () => [
      { id: 'openai', label: 'OpenAI', type: 'remote' },
      { id: 'anthropic', label: 'Anthropic', type: 'remote' },
    ],
    getSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'api_key' } } }),
    getOpenAIAccountState: () => ({ sessionSummary: { availability: { supported: false } } }),
    getCursorAgentState: () => ({
      runtime: { status: 'runtime_ready', message: 'ready' },
      account: { status: 'unauthenticated', accountLabel: '' },
    }),
  })

  assert.deepEqual(providers.map((provider) => provider.id), ['openai', 'cursor', 'anthropic'])
  assert.equal(providers[1].providerClass, 'agent_runtime')
  assert.equal(providers[1].logoPath, 'provider-logos/cursor.svg')
  assert.equal(providers[1].ready, true)
  assert.equal(providers[1].hasApiKey, true)
})

test('Cursor exposes Composer 2.5 and Grok 4.5 High Fast without fake context telemetry', async () => {
  const models = await __testVaultHandlerInternals.resolveVaultGetProviderModelsResponse({ providerId: 'cursor' })
  const composerCapabilities = await __testVaultHandlerInternals.resolveVaultGetModelCapabilitiesResponse({
    providerId: 'cursor',
    modelId: 'composer-2.5',
  })
  const grokCapabilities = await __testVaultHandlerInternals.resolveVaultGetModelCapabilitiesResponse({
    providerId: 'cursor',
    modelId: 'cursor-grok-4.5-high-fast',
  })

  assert.deepEqual(models.map((model) => model.id), [
    'composer-2.5',
    'cursor-grok-4.5-high-fast',
  ])
  assert.equal(models[0].label, 'Composer 2.5')
  assert.equal(models[1].label, 'Grok 4.5 High Fast')
  assert.equal(models[0].contextWindowTokens, null)
  assert.equal(composerCapabilities.agentRuntime, true)
  assert.equal(composerCapabilities.requiresExecuteMode, true)
  assert.equal(composerCapabilities.requiresFullAccess, true)
  assert.equal(composerCapabilities.supportsContextTelemetry, false)
  assert.equal(grokCapabilities.agentRuntime, true)
  assert.equal(grokCapabilities.requiresExecuteMode, true)
  assert.equal(grokCapabilities.requiresFullAccess, true)
})

test('ready Cursor provider row satisfies the chat selection manifest', async () => {
  const providers = await __testVaultHandlerInternals.resolveVaultGetProvidersResponse({}, {
    listConfiguredProviders: () => ({}),
    getProviderManifest: async () => [
      { id: 'openai', name: 'OpenAI', type: 'remote' },
    ],
    getSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    getOpenAIAccountState: () => ({ sessionSummary: { availability: { supported: false } } }),
    getCursorAgentState: () => ({
      runtime: { status: 'runtime_ready', message: 'ready' },
      account: { status: 'authenticated', accountLabel: 'configured account' },
    }),
  })
  const cursor = providers.find((provider) => provider.id === 'cursor')
  const selector = buildProviderModelSelectorViewModel({
    providers,
    loaded: true,
    selectedProvider: 'cursor',
    selectedModel: cursor?.defaultModel,
  })

  assert.equal(cursor?.name, 'Cursor')
  assert.equal(cursor?.defaultModel, 'composer-2.5')
  assert.deepEqual(cursor?.models?.map((model) => model.id), [
    'composer-2.5',
    'cursor-grok-4.5-high-fast',
  ])
  assert.equal(selector.activeProvider?.name, 'Cursor')
  assert.deepEqual(selector.modelList.map((model) => model.id), [
    'composer-2.5',
    'cursor-grok-4.5-high-fast',
  ])
})
