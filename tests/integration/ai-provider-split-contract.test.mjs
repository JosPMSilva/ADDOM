import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const apiClientsDir = path.join(process.cwd(), 'src/main/api-clients')
const facadePath = path.join(apiClientsDir, 'ai-provider.mjs')
const adapterCorePath = path.join(apiClientsDir, 'ai-provider-adapter-core.mjs')
const openAIRuntimePath = path.join(apiClientsDir, 'ai-provider-openai-runtime.mjs')
const openAICompatibleCorePath = path.join(apiClientsDir, 'ai-provider-openai-compatible-core.mjs')
const moonshotAdapterPath = path.join(apiClientsDir, 'ai-provider-moonshot.mjs')
const openrouterAdapterPath = path.join(apiClientsDir, 'ai-provider-openrouter.mjs')
const ollamaAdapterPath = path.join(apiClientsDir, 'ai-provider-ollama.mjs')
const lmstudioAdapterPath = path.join(apiClientsDir, 'ai-provider-lmstudio.mjs')

test('ai-provider facade delegates through the adapter registry instead of embedding provider constructors', () => {
  const facadeSource = fs.readFileSync(facadePath, 'utf8')
  const adapterCoreSource = fs.readFileSync(adapterCorePath, 'utf8')

  assert.match(facadeSource, /resolveProviderAdapter/)
  assert.match(facadeSource, /adapter\.createStreamWithTools/)
  assert.match(facadeSource, /adapter\.createInlineCompletion/)
  assert.doesNotMatch(facadeSource, /createOpenAICompatible\(/)
  assert.doesNotMatch(facadeSource, /createOpenAI\(/)
  assert.doesNotMatch(facadeSource, /createAnthropic\(/)
  assert.match(adapterCoreSource, /const PROVIDER_ADAPTERS = Object\.freeze/)
})

test('openai-specific continuation and response helpers live outside the facade', () => {
  const facadeSource = fs.readFileSync(facadePath, 'utf8')
  const runtimeSource = fs.readFileSync(openAIRuntimePath, 'utf8')

  assert.match(runtimeSource, /export function prepareOpenAIContinuationMessages/)
  assert.match(runtimeSource, /export function extractOpenAIResponseMeta/)
  assert.match(runtimeSource, /export async function prepareOpenAIBackgroundTurnPayload/)
  assert.doesNotMatch(facadeSource, /function prepareOpenAIContinuationMessages/)
  assert.doesNotMatch(facadeSource, /function extractOpenAIResponseMeta/)
})

test('moonshot and local providers are first-class adapters built on shared openai-compatible core', () => {
  const moonshotSource = fs.readFileSync(moonshotAdapterPath, 'utf8')
  const openrouterSource = fs.readFileSync(openrouterAdapterPath, 'utf8')
  const ollamaSource = fs.readFileSync(ollamaAdapterPath, 'utf8')
  const lmstudioSource = fs.readFileSync(lmstudioAdapterPath, 'utf8')
  const openAICompatibleCoreSource = fs.readFileSync(openAICompatibleCorePath, 'utf8')

  assert.match(moonshotSource, /createOpenAICompatibleProviderAdapter/)
  assert.match(moonshotSource, /resolveMoonshotBaseUrl/)
  assert.match(openrouterSource, /createOpenAICompatibleProviderAdapter/)
  assert.match(openrouterSource, /https:\/\/openrouter\.ai\/api\/v1/)
  assert.match(ollamaSource, /createOpenAICompatibleProviderAdapter/)
  assert.match(ollamaSource, /http:\/\/localhost:11434\/v1/)
  assert.match(lmstudioSource, /createOpenAICompatibleProviderAdapter/)
  assert.match(lmstudioSource, /http:\/\/localhost:1234\/v1/)
  assert.match(openAICompatibleCoreSource, /export function createOpenAICompatibleProviderAdapter/)
  assert.match(openAICompatibleCoreSource, /createOpenAICompatible\(/)
})
