import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveOpenAIModelRuntimeSupport } from '../../src/main/api-clients/openai-model-runtime-support.mjs'

const CASES = [
  ['gpt-5.6-sol', { shell: true, apply_patch: true, web_search: true, file_search: true, code_interpreter: true, image_generation: true, mcp: true }],
  ['gpt-5.6-terra', { shell: true, apply_patch: true, web_search: true, file_search: true, code_interpreter: true, image_generation: true, mcp: true }],
  ['gpt-5.6-luna', { shell: true, apply_patch: true, web_search: true, file_search: true, code_interpreter: true, image_generation: true, mcp: true }],
  ['gpt-5.5', { shell: true, apply_patch: true, web_search: true, file_search: true, code_interpreter: true, image_generation: true, mcp: true }],
  ['gpt-5.4', { shell: true, apply_patch: true, web_search: true, file_search: true, code_interpreter: true, image_generation: true, mcp: true }],
  ['gpt-5.3-codex', { shell: false, apply_patch: false, web_search: false, file_search: false, code_interpreter: false, image_generation: false, mcp: false }],
  ['gpt-5.2', { shell: false, apply_patch: false, web_search: false, file_search: false, code_interpreter: false, image_generation: false, mcp: false }],
]

test('openai reasoning effort options match the exact curated model family', () => {
  const expectations = new Map([
    ['gpt-5.6-sol', ['none', 'low', 'medium', 'high', 'xhigh', 'max']],
    ['gpt-5.6-terra', ['none', 'low', 'medium', 'high', 'xhigh', 'max']],
    ['gpt-5.6-luna', ['none', 'low', 'medium', 'high', 'xhigh', 'max']],
    ['gpt-5.5', ['none', 'low', 'medium', 'high', 'xhigh']],
    ['gpt-5.4', ['none', 'low', 'medium', 'high', 'xhigh']],
    ['gpt-5.3-codex', ['low', 'medium', 'high', 'xhigh']],
    ['gpt-5.2', []],
  ])

  for (const [modelId, expected] of expectations) {
    assert.deepEqual(
      resolveOpenAIModelRuntimeSupport(modelId).reasoningEffortOptions,
      expected,
      modelId,
    )
  }
})

test('account runtime omits API-only max effort until the app-server supports it', () => {
  assert.deepEqual(
    resolveOpenAIModelRuntimeSupport('gpt-5.6-sol', { authMethod: 'account' }).reasoningEffortOptions,
    ['none', 'low', 'medium', 'high', 'xhigh'],
  )
})

test('account runtime rejects GPT-5.3 Codex before dispatch', () => {
  const support = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex', { authMethod: 'account' })

  assert.equal(support.accountRuntimeStatus, 'unsupported')
  assert.equal(support.supportsProviderNativeRuntime, false)
  assert.equal(support.supportsChatToolSurface, false)
  assert.equal(support.supportsDelegatedToolSurface, false)
  assert.match(support.accountRuntimeMessage, /not supported.*ChatGPT account/i)
})

test('openai runtime support derives hosted tools from the evidence-backed API contract', () => {
  for (const [modelId, expected] of CASES) {
    const support = resolveOpenAIModelRuntimeSupport(modelId)
    assert.equal(support.hostedToolSupport.shell, expected.shell, `${modelId}: shell`)
    assert.equal(support.hostedToolSupport.apply_patch, expected.apply_patch, `${modelId}: apply_patch`)
    assert.equal(support.hostedToolSupport.web_search, expected.web_search, `${modelId}: web_search`)
    assert.equal(support.hostedToolSupport.file_search, expected.file_search, `${modelId}: file_search`)
    assert.equal(support.hostedToolSupport.code_interpreter, expected.code_interpreter, `${modelId}: code_interpreter`)
    assert.equal(support.hostedToolSupport.image_generation, expected.image_generation, `${modelId}: image_generation`)
    assert.equal(support.hostedToolSupport.mcp, expected.mcp, `${modelId}: mcp`)
  }
})

test('openai account runtime support preserves parity-aware tool support instead of blanket downgrading hosted tools', () => {
  for (const [modelId, expected] of CASES) {
    const support = resolveOpenAIModelRuntimeSupport(modelId, { authMethod: 'account' })
    if (modelId === 'gpt-5.2' || modelId === 'gpt-5.3-codex') {
      assert.equal(support.accountRuntimeStatus, 'unsupported', `${modelId}: accountRuntimeStatus`)
      continue
    }
    assert.equal(support.accountRuntimeStatus, 'parity', `${modelId}: accountRuntimeStatus`)
    assert.equal(support.supportsProviderNativeRuntime, true, `${modelId}: supportsProviderNativeRuntime`)
    assert.equal(support.providerNativeRuntimeFamily, 'openai_codex_app_server', `${modelId}: providerNativeRuntimeFamily`)
    assert.equal(support.providerNativeRuntimeMode, 'provider_owned_runtime', `${modelId}: providerNativeRuntimeMode`)
    assert.equal(support.hostedToolSupport.shell, expected.shell, `${modelId}: shell`)
    assert.equal(support.hostedToolSupport.apply_patch, expected.apply_patch, `${modelId}: apply_patch`)
    assert.equal(support.hostedToolSupport.web_search, expected.web_search, `${modelId}: web_search`)
    assert.equal(support.hostedToolSupport.file_search, expected.file_search, `${modelId}: file_search`)
    assert.equal(support.hostedToolSupport.code_interpreter, expected.code_interpreter, `${modelId}: code_interpreter`)
    assert.equal(support.hostedToolSupport.image_generation, expected.image_generation, `${modelId}: image_generation`)
    assert.equal(support.hostedToolSupport.mcp, expected.mcp, `${modelId}: mcp`)
  }
})
