import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'

function buildTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

async function resolveToolExposureSnapshot(authMethod, {
  runtimeSettings = {
    hostedToolsEnabled: true,
    enabledHostedTools: ['web_search', 'file_search', 'mcp', 'shell'],
  },
  vectorStoreIds = [],
} = {}) {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    addomTools: buildTools([
      'fetch_page',
      'read_file',
      'run_command',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod }),
    providerRuntimeSettings: {
      openai: runtimeSettings,
    },
    vectorStoreIds,
  })

  return {
    hostedToolIds: [...surface.openaiHostedToolIds].sort(),
    defaultSupportedToolIds: [...surface.openaiDefaultSupportedToolIds].sort(),
    excludedToolReasons: [...surface.openaiExcludedToolReasons],
    noticeMeta: surface.notices.map((row) => row.meta),
    visibleTools: Object.keys(surface.resolvedToolSurface.tools).sort(),
  }
}

test('OpenAI auth tool exposure parity keeps the same canonical visible tools and effective provider-tool exposure for the same settings intent', async () => {
  const apiKey = await resolveToolExposureSnapshot('api_key')
  const account = await resolveToolExposureSnapshot('account')

  assert.deepEqual(account.visibleTools, apiKey.visibleTools)
  assert.deepEqual(account.hostedToolIds, apiKey.hostedToolIds)
  assert.deepEqual(account.defaultSupportedToolIds, apiKey.defaultSupportedToolIds)
  assert.deepEqual(account.excludedToolReasons, apiKey.excludedToolReasons)
  assert.deepEqual(account.noticeMeta, apiKey.noticeMeta)
})

test('OpenAI auth tool exposure parity keeps tool exposure disabled in both auth modes until advanced tools are explicitly enabled', async () => {
  const apiKey = await resolveToolExposureSnapshot('api_key', {
    runtimeSettings: {},
  })
  const account = await resolveToolExposureSnapshot('account', {
    runtimeSettings: {},
  })

  assert.deepEqual(account.hostedToolIds, [])
  assert.deepEqual(account.hostedToolIds, apiKey.hostedToolIds)
  assert.deepEqual(account.defaultSupportedToolIds, apiKey.defaultSupportedToolIds)
  assert.deepEqual(account.excludedToolReasons, apiKey.excludedToolReasons)
})
