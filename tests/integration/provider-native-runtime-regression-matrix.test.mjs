import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'
import {
  buildProviderNativeToolBundle,
  executeProviderNativeToolCall,
} from '../../src/main/api-clients/provider-native-tool-runtime.mjs'

function buildTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

test('provider-native runtime matrix keeps Moonshot on remote tool-bundle ownership', async () => {
  const adapter = resolveProviderModelAdapter('moonshot', 'kimi-k2.6')
  const bundle = await buildProviderNativeToolBundle({
    providerId: 'moonshot',
    apiKey: 'moonshot-secret',
    runtimeSettings: {
      moonshot: {
        remoteToolsEnabled: true,
        enabledFormulaUris: ['moonshot/web-search:latest'],
      },
    },
    adapterProfile: adapter,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        tools: [{
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the web',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
        }],
      }),
    }),
  })

  assert.equal(adapter.providerNativeRuntime.supported, true)
  assert.equal(adapter.providerNativeRuntime.mode, 'remote_tool_bundle')
  assert.equal(adapter.allowProviderNativeTools, true)
  assert.equal(Boolean(bundle.tools.moonshot_formula__web_search__search), true)
  assert.equal(bundle.toolRuntimeContext?.family, 'moonshot_formula')
})

test('provider-native runtime matrix keeps Perplexity on provider-owned search semantics without provider tool execution', async () => {
  const adapter = resolveProviderModelAdapter('perplexity', 'sonar-pro')
  const bundle = await buildProviderNativeToolBundle({
    providerId: 'perplexity',
    adapterProfile: adapter,
  })
  const surface = await resolveRuntimeToolSurface({
    providerId: 'perplexity',
    modelId: 'sonar-pro',
    addomTools: buildTools(['read_file']),
    adapterProfile: adapter,
  })

  assert.equal(adapter.providerNativeRuntime.supported, true)
  assert.equal(adapter.providerNativeRuntime.mode, 'provider_owned_runtime')
  assert.equal(adapter.allowProviderNativeTools, false)
  assert.deepEqual(bundle.tools, {})
  assert.equal(bundle.toolRuntimeContext, null)
  assert.equal(surface.providerToolExecutionContext, null)
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'perplexity_search')
})

test('provider-native runtime matrix keeps generic tool support separate from provider-native ownership', () => {
  const generic = resolveProviderModelAdapter('openai', 'unknown-openai-build')
  const openaiHosted = resolveProviderModelAdapter('openai', 'gpt-5.4')

  assert.equal(generic.toolFamily, 'generic_addom_native')
  assert.equal(generic.providerNativeRuntime.supported, false)
  assert.equal(generic.allowProviderNativeTools, false)

  assert.equal(openaiHosted.toolFamily, 'openai_hosted')
  assert.equal(openaiHosted.providerNativeRuntime.supported, false)
  assert.equal(openaiHosted.allowProviderNativeTools, true)
})

test('provider-native runtime matrix fails loudly for unsupported configured runtime families', async () => {
  await assert.rejects(
    () => buildProviderNativeToolBundle({
      providerId: 'custom',
      adapterProfile: {
        providerNativeRuntime: {
          supported: true,
          family: 'unknown_runtime_family',
        },
      },
    }),
    /Unsupported provider-native runtime family/i,
  )

  await assert.rejects(
    () => executeProviderNativeToolCall({
      providerId: 'custom',
      toolName: 'custom_tool',
      toolRuntimeContext: {
        family: 'unknown_runtime_family',
      },
    }),
    /Unsupported provider-native runtime family/i,
  )
})
