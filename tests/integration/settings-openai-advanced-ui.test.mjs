import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let buildActiveSettingsSections = null
let OpenAIRemoteAssetsBlock = null
let ApiKeysBlock = null

before(async () => {
  const [sectionsMod, assetsMod, commonBlocksMod] = await Promise.all([
    ssrLoadRendererModule('/components/settings/SettingsPanelSections.jsx'),
    ssrLoadRendererModule('/components/settings/SettingsBlocksOpenAIRemoteAssets.jsx'),
    ssrLoadRendererModule('/components/settings/SettingsCommonBlocks.jsx'),
  ])
  buildActiveSettingsSections = sectionsMod?.buildActiveSettingsSections || null
  OpenAIRemoteAssetsBlock = assetsMod?.OpenAIRemoteAssetsBlock || null
  ApiKeysBlock = commonBlocksMod?.ApiKeysBlock || null
})

after(async () => {
  await closeViteSsrLoader()
})

function buildProviderSections(overrides = {}) {
  assert.equal(typeof buildActiveSettingsSections, 'function')
  return buildActiveSettingsSections({
    activeCategoryId: 'providers',
    providers: [],
    activeProjectId: '',
    openaiProjectAssets: null,
    openaiAssetsBusy: false,
    modelCatalogVisibility: {},
    openaiRuntimeSettings: {
      hostedToolsEnabled: false,
      enabledHostedTools: [],
    },
    setKeyForProvider: () => {},
    deleteKeyForProvider: () => {},
    setAuthMethodForProvider: () => {},
    handleRefreshOpenAIProjectAssets: () => {},
    handleEnsureOpenAIProjectVectorStore: () => {},
    handleUploadOpenAIFiles: () => {},
    handleAttachOpenAIProjectFiles: () => {},
    handleRemoveOpenAIProjectAsset: () => {},
    handleDeleteOpenAIProjectVectorStore: () => {},
    handleModelCatalogVisibilityChange: () => {},
    ...overrides,
  })
}

test('providers settings hide Project knowledge by default', () => {
  const ids = buildProviderSections().map((section) => section.id)

  assert.deepEqual(ids, ['api-keys'])
  assert.equal(ids.includes('openrouter-catalog-visibility'), false)
  assert.equal(ids.includes('openai-project-knowledge'), false)
})

test('providers settings show Project knowledge only when advanced file_search is enabled', () => {
  const ids = buildProviderSections({
    openaiRuntimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['file_search'],
    },
  }).map((section) => section.id)

  assert.deepEqual(ids, ['api-keys', 'openai-project-knowledge'])
})

test('api keys block keeps the preferred provider order and opens OpenRouter visibility as a detail view', () => {
  assert.equal(typeof ApiKeysBlock, 'function')

  const html = renderToStaticMarkup(React.createElement(ApiKeysBlock, {
    providers: [
      { id: 'grok', name: 'xAI Grok', noKeyRequired: false, hasApiKey: false, authMethod: 'api_key' },
      { id: 'anthropic', name: 'Anthropic', noKeyRequired: false, hasApiKey: false, authMethod: 'api_key' },
      { id: 'ollama', name: 'Ollama', noKeyRequired: true, localAvailable: true, models: [{ id: 'llama3' }] },
      { id: 'deepseek', name: 'DeepSeek', noKeyRequired: false, hasApiKey: false, authMethod: 'api_key' },
      { id: 'openrouter', name: 'OpenRouter', noKeyRequired: false, hasApiKey: true, authMethod: 'api_key' },
      { id: 'gemini', name: 'Google Gemini', noKeyRequired: false, hasApiKey: false, authMethod: 'api_key' },
      { id: 'cursor', name: 'Cursor', noKeyRequired: false, hasApiKey: false, authMethod: 'api_key', runtimeStatus: 'runtime_missing' },
      { id: 'openai', name: 'OpenAI', noKeyRequired: false, hasApiKey: false, authMethod: 'api_key', accountRuntimeSupported: true },
    ],
    modelCatalogVisibility: {},
    onSaveProviderKey: () => {},
    onDeleteProviderKey: () => {},
    onSetProviderAuthMethod: () => {},
    openDetailView: () => {},
  }))

  const preferredLabels = ['OpenAI', 'Cursor', 'OpenRouter', 'Anthropic', 'Google Gemini', 'DeepSeek', 'xAI Grok']
  const preferredPositions = preferredLabels.map((label) => html.indexOf(`>${label}</span>`))
  assert.ok(preferredPositions.every((position) => position >= 0))
  assert.deepEqual(preferredPositions, [...preferredPositions].sort((a, b) => a - b))
  assert.ok(preferredPositions.at(-1) < html.lastIndexOf('Ollama'))
  assert.match(html, /data-ui="settings-provider-credential-row"/)
  assert.match(html, /bg-transparent/)
  assert.match(html, /data-ui="settings-openrouter-manage"/)
  assert.match(html, /Manage visibility/)
  assert.doesNotMatch(html, /Catalog visibility/)
  assert.match(html, /data-ui="openai-access-row"/)
  assert.match(html, /data-ui="openai-api-key-row"/)
  assert.doesNotMatch(html, /Recommended for OpenAI|Using an API key/)
  assert.doesNotMatch(html, /bg-gradient-to-r/)
  assert.doesNotMatch(html, /hover:shadow-md/)
  assert.doesNotMatch(html, /text-white/)
})

test('project knowledge block uses production copy and hides remote/vector-store internals', () => {
  assert.equal(typeof OpenAIRemoteAssetsBlock, 'function')

  const html = renderToStaticMarkup(React.createElement(OpenAIRemoteAssetsBlock, {
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasCredential: true,
      hasApiKey: true,
      authMethod: 'api_key',
      hasAccountSession: false,
    }],
    activeProjectId: 'project-alpha',
    openaiProjectAssets: {
      files: [{
        id: 'asset_1',
        fileName: 'notes.md',
        localPath: 'C:\\project\\notes.md',
        remoteFileId: 'file_123',
        status: 'uploaded',
      }],
      vectorStore: {
        id: 'vs_123',
        status: 'completed',
      },
      vectorStoreFiles: [{
        providerFileRecordId: 'asset_1',
        remoteVectorStoreFileId: 'vsf_123',
      }],
    },
    openaiAssetsBusy: false,
    onRefreshOpenAIProjectAssets: () => {},
    onEnsureOpenAIProjectVectorStore: () => {},
    onUploadOpenAIFiles: () => {},
    onAttachOpenAIProjectFiles: () => {},
    onRemoveOpenAIProjectAsset: () => {},
    onDeleteOpenAIProjectVectorStore: () => {},
  }))

  assert.match(html, /Project knowledge/i)
  assert.match(html, /Project scope/i)
  assert.match(html, /Uploaded files/i)
  assert.doesNotMatch(html, /OpenAI Knowledge Base/)
  assert.doesNotMatch(html, /Vector Store/i)
  assert.doesNotMatch(html, /file_123/)
  assert.doesNotMatch(html, /vs_123/)
  assert.doesNotMatch(html, /C:\\\\project\\\\notes\.md/)
})
