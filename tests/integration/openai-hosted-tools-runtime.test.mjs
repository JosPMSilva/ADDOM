import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildOpenAIHostedToolBundle,
  resolveOpenAIHostedToolExposure,
} from '../../src/main/api-clients/openai-hosted-tools-runtime.mjs'

test('openai hosted tool bundle keeps curated models disabled until hosted tools are explicitly enabled', () => {
  const bundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.4',
    runtimeSettings: {},
  })

  assert.deepEqual(Object.keys(bundle.tools), [])
  assert.deepEqual(bundle.enabledToolIds, [])
  assert.equal(bundle.defaultSupportedToolIds.includes('apply_patch'), true)
  assert.equal(bundle.defaultSupportedToolIds.includes('shell'), true)
  assert.equal(bundle.defaultSupportedToolIds.includes('mcp'), true)
  assert.equal(bundle.defaultSupportedToolIds.includes('file_search'), true)
  assert.deepEqual(bundle.excludedToolReasons, [])
  assert.equal(bundle.notices.length, 0)
})

test('openai hosted tool bundle adds file_search when the project already has a vector store', () => {
  const bundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.4',
    runtimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['code_interpreter', 'file_search'],
      fileSearchMaxNumResults: 12,
    },
    vectorStoreIds: ['vs_project_123'],
  })

  assert.deepEqual(
    Object.keys(bundle.tools).sort(),
    ['code_interpreter', 'file_search'],
  )
  assert.deepEqual(
    bundle.enabledToolIds.sort(),
    ['code_interpreter', 'file_search'],
  )
  assert.equal(bundle.tools.file_search?.id, 'openai.file_search')
  assert.deepEqual(bundle.tools.file_search?.args?.vectorStoreIds, ['vs_project_123'])
  assert.equal(bundle.tools.file_search?.args?.maxNumResults, 12)
  assert.deepEqual(bundle.tools.code_interpreter?.args?.container, {})
})

test('openai hosted tool bundle disables local runtime tools when the caller requests hosted-only mode', () => {
  const bundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.4',
    runtimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['apply_patch', 'code_interpreter', 'web_search'],
    },
    includeLocalRuntimeTools: false,
  })

  assert.deepEqual(
    Object.keys(bundle.tools).sort(),
    ['code_interpreter', 'web_search'],
  )
  assert.deepEqual(
    bundle.enabledToolIds.sort(),
    ['code_interpreter', 'web_search'],
  )
  assert.equal(
    bundle.excludedToolReasons.some((row) => row.toolId === 'apply_patch' && row.reason === 'local_runtime_tools_disabled'),
    true,
  )
})

test('openai hosted tool bundle only emits prerequisite notices for explicitly selected tools', () => {
  const bundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.4',
    runtimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['file_search', 'mcp'],
    },
  })

  assert.deepEqual(Object.keys(bundle.tools), [])
  assert.equal(bundle.excludedToolReasons.some((row) => row.toolId === 'file_search' && row.reason === 'missing_vector_store'), true)
  assert.equal(bundle.excludedToolReasons.some((row) => row.toolId === 'mcp' && row.reason === 'missing_mcp_server'), true)
  assert.equal(bundle.notices.length, 2)
})

test('openai hosted tool bundle keeps gpt-5.3-codex restricted', () => {
  const bundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.3-codex',
    runtimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['apply_patch', 'web_search'],
    },
    includeLocalRuntimeTools: true,
  })

  assert.deepEqual(Object.keys(bundle.tools), [])
  assert.equal(bundle.defaultSupportedToolIds.includes('apply_patch'), false)
  assert.equal(
    bundle.excludedToolReasons.some((row) => (
      row.toolId === 'web_search'
      && row.reason === 'model_not_eligible'
      && /model.*not eligible/i.test(row.detail)
    )),
    true,
  )
  assert.equal(bundle.notices.some((row) => row.meta?.reason === 'model_not_eligible'), true)
})

test('openai hosted tool bundle refuses provider-native tools for generic OpenAI models', () => {
  const bundle = buildOpenAIHostedToolBundle({
    modelId: 'custom-openai-model',
    runtimeSettings: {},
    includeLocalRuntimeTools: true,
  })

  assert.deepEqual(Object.keys(bundle.tools), [])
  assert.equal(bundle.notices.some((row) => String(row?.text || '').includes('disabled for non-curated models')), true)
  assert.deepEqual(bundle.enabledToolIds, [])
})

test('openai hosted tool exposure keeps the same effective enabled tool ids and prerequisite exclusions across auth modes for the same settings intent', () => {
  const runtimeSettings = {
    hostedToolsEnabled: true,
    enabledHostedTools: ['web_search', 'file_search', 'mcp', 'shell'],
  }

  const apiKeyExposure = resolveOpenAIHostedToolExposure({
    modelId: 'gpt-5.4',
    authMethod: 'api_key',
    runtimeSettings,
  })
  const accountExposure = resolveOpenAIHostedToolExposure({
    modelId: 'gpt-5.4',
    authMethod: 'account',
    runtimeSettings,
  })

  assert.deepEqual(accountExposure.enabledToolIds.sort(), apiKeyExposure.enabledToolIds.sort())
  assert.deepEqual(
    accountExposure.defaultSupportedToolIds.sort(),
    apiKeyExposure.defaultSupportedToolIds.sort(),
  )
  assert.deepEqual(accountExposure.excludedToolReasons, apiKeyExposure.excludedToolReasons)
  assert.deepEqual(
    accountExposure.notices.map((row) => row.meta),
    apiKeyExposure.notices.map((row) => row.meta),
  )
})

test('openai hosted tool exposure keeps curated advanced tools disabled in both auth modes until the user enables them', () => {
  const apiKeyExposure = resolveOpenAIHostedToolExposure({
    modelId: 'gpt-5.4',
    authMethod: 'api_key',
    runtimeSettings: {},
  })
  const accountExposure = resolveOpenAIHostedToolExposure({
    modelId: 'gpt-5.4',
    authMethod: 'account',
    runtimeSettings: {},
  })

  assert.deepEqual(accountExposure.enabledToolIds, [])
  assert.deepEqual(accountExposure.enabledToolIds, apiKeyExposure.enabledToolIds)
  assert.deepEqual(
    accountExposure.defaultSupportedToolIds.sort(),
    apiKeyExposure.defaultSupportedToolIds.sort(),
  )
  assert.deepEqual(accountExposure.excludedToolReasons, apiKeyExposure.excludedToolReasons)
})
