import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ApiKeysBlock = null
let OpenAIRemoteAssetsBlock = null

before(async () => {
  const commonBlocksMod = await ssrLoadRendererModule('/components/settings/SettingsCommonBlocks.jsx')
  const assetsMod = await ssrLoadRendererModule('/components/settings/SettingsBlocksOpenAIRemoteAssets.jsx')
  ApiKeysBlock = commonBlocksMod?.ApiKeysBlock || null
  OpenAIRemoteAssetsBlock = assetsMod?.OpenAIRemoteAssetsBlock || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderProviderSettings() {
  return renderToStaticMarkup(React.createElement(ApiKeysBlock, {
    providers: [
      { id: 'openai', name: 'OpenAI', noKeyRequired: false, hasApiKey: false, authMethod: 'api_key', accountRuntimeSupported: true },
      { id: 'openrouter', name: 'OpenRouter', noKeyRequired: false, hasApiKey: true, authMethod: 'api_key' },
      { id: 'ollama', name: 'Ollama', noKeyRequired: true, localAvailable: true, models: [{ id: 'llama3' }] },
    ],
    onSaveProviderKey: () => {},
    onDeleteProviderKey: () => {},
    onSetProviderAuthMethod: () => {},
    openDetailView: () => {},
  }))
}

function renderConfiguredProvider() {
  return renderToStaticMarkup(React.createElement(ApiKeysBlock, {
    providers: [
      { id: 'openrouter', name: 'OpenRouter', noKeyRequired: false, hasApiKey: true, authMethod: 'api_key' },
    ],
    onSaveProviderKey: () => {},
    onDeleteProviderKey: () => {},
    onSetProviderAuthMethod: () => {},
    openDetailView: () => {},
  }))
}

function renderProjectKnowledgeReadyState() {
  return renderToStaticMarkup(React.createElement(OpenAIRemoteAssetsBlock, {
    providers: [{ id: 'openai', name: 'OpenAI', hasCredential: true, hasApiKey: true, authMethod: 'api_key' }],
    activeProjectId: 'project-alpha',
    openaiProjectAssets: {
      files: [{ id: 'asset-1', fileName: 'notes.md' }],
      vectorStore: { id: 'store-1' },
      vectorStoreFiles: [{ providerFileRecordId: 'asset-1' }],
    },
  }))
}

function renderConnectedOpenAIAccount() {
  return renderToStaticMarkup(React.createElement(ApiKeysBlock, {
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      noKeyRequired: false,
      hasApiKey: true,
      hasAccountSession: true,
      accountLabel: 'person@example.com',
      accountPlanType: 'plus',
      authMethod: 'account',
      accountRuntimeSupported: true,
    }],
    onSaveProviderKey: () => {},
    onDeleteProviderKey: () => {},
    onSetProviderAuthMethod: () => {},
    openDetailView: () => {},
  }))
}

function renderCursorProvider(runtimeOverrides = {}) {
  return renderToStaticMarkup(React.createElement(ApiKeysBlock, {
    providers: [{
      id: 'cursor',
      name: 'Cursor',
      providerClass: 'agent_runtime',
      noKeyRequired: false,
      hasApiKey: true,
      hasAccountSession: true,
      accountStatus: 'authenticated',
      accountLabel: 'cursor@example.com',
      authMethod: 'account',
      runtimeStatus: 'runtime_ready',
      runtimeStatusMessage: 'Cursor Agent runtime is ready.',
      ...runtimeOverrides,
      ready: true,
    }],
    onSaveProviderKey: () => {},
    onDeleteProviderKey: () => {},
    onSetProviderAuthMethod: () => {},
    openDetailView: () => {},
  }))
}

test('provider settings stay flat and operational', () => {
  const html = renderProviderSettings()

  assert.match(html, /data-ui="settings-provider-credential-row"/)
  assert.doesNotMatch(html, /rounded-lg border border-surface-border\/70 bg-transparent px-2\.5 py-2/)
  assert.doesNotMatch(html, /bg-warning|text-warning|bg-success|text-success|rounded-xl|shadow-sm/)
})

test('configured provider identity aligns with its status and actions', () => {
  const html = renderConfiguredProvider()

  assert.match(html, /sm:items-center/)
  assert.doesNotMatch(html, /sm:items-start/)
  assert.match(html, /OpenRouter/)
  assert.match(html, /Configured/)
})

test('OpenAI account access stays within three calm functional rows', () => {
  const html = renderConnectedOpenAIAccount()

  assert.equal((html.match(/data-ui="openai-(?:access|account|runtime)-row"/g) || []).length, 3)
  assert.match(html, /data-ui="openai-access-row"/)
  assert.match(html, /data-ui="openai-account-row"/)
  assert.match(html, /data-ui="openai-runtime-row"/)
  assert.match(html, /person@example\.com - plus/)
  assert.match(html, /Stored API key remains available but inactive/)
  assert.match(html, /Reconnect/)
  assert.match(html, /Disconnect/)
  assert.match(html, /Codex runtime not installed/)
  assert.match(html, /Check runtime updates/)
  assert.doesNotMatch(html, /Using your OpenAI account|Using an API key|Recommended for OpenAI/)
})

test('OpenAI API key access keeps the existing credential controls', () => {
  const html = renderProviderSettings()

  assert.match(html, /data-ui="openai-access-row"/)
  assert.match(html, /data-ui="openai-api-key-row"/)
  assert.match(html, /Paste your API key/)
  assert.match(html, /aria-label="Save key"/)
})

test('Cursor account access mirrors the OpenAI three-row settings grammar', () => {
  const html = renderCursorProvider()

  assert.match(html, /data-ui="cursor-provider-row"/)
  assert.equal((html.match(/data-ui="cursor-(?:access|account|runtime)-row"/g) || []).length, 3)
  assert.match(html, /data-ui="cursor-access-row"/)
  assert.match(html, /data-ui="cursor-account-row"/)
  assert.match(html, /data-ui="cursor-runtime-row"/)
  assert.match(html, /data-ui="cursor-auth-method"/)
  assert.ok(html.indexOf('data-ui="cursor-account-row"') < html.indexOf('data-ui="cursor-runtime-row"'))
  assert.match(html, />Sign in with</)
  assert.match(html, /cursor@example\.com/)
  assert.match(html, /Reconnect/)
  assert.match(html, /Disconnect/)
  assert.match(html, /Runtime(?: .*?)? is ready/)
  assert.match(html, /Check runtime/)
  assert.match(html, /Cursor account/)
  assert.match(html, /API key/)
  assert.match(html, /Chat Execute/)
  assert.match(html, /Full Access/)
  assert.doesNotMatch(html, /quota|context window|compaction/i)
  assert.doesNotMatch(html, /bg-warning|text-warning|bg-success|text-success|shadow-/)
})

test('Cursor runtime row offers the install action after a real update check', () => {
  const html = renderCursorProvider({
    runtimeUpdateStatus: 'available',
    runtimeUpdateAvailable: true,
    latestRuntimeVersion: '2026.08.11-e8db854',
  })

  assert.match(html, /2026\.08\.11-e8db854 available/)
  assert.match(html, /Install update/)
  assert.doesNotMatch(html, />Check runtime</)
})

test('Project Knowledge uses scope, actions, and file rows without cards', () => {
  const html = renderProjectKnowledgeReadyState()

  assert.match(html, /Project scope/)
  assert.match(html, /Uploaded files/)
  assert.doesNotMatch(html, /bg-warning|text-warning|bg-success|text-success|rounded-xl|shadow-sm/)
})
