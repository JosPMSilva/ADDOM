import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { resolveAgentProviderRuntimeSettings } from '../../src/main/moa/agent-runtime.mjs'

test('resolveAgentProviderRuntimeSettings selects runtime settings for the active provider', () => {
  const settings = {
    openai: { transportMode: 'responses_auto', websocketFallbackToStream: false },
    moonshot: { formulaMode: 'thinking' },
    ollama: { baseUrl: 'http://127.0.0.1:11434' },
  }

  assert.deepEqual(
    resolveAgentProviderRuntimeSettings('openai', settings),
    {
      transportMode: 'responses_stream',
      websocketFallbackToStream: false,
    },
  )
  assert.deepEqual(
    resolveAgentProviderRuntimeSettings('moonshot', settings),
    settings.moonshot,
  )
  assert.deepEqual(
    resolveAgentProviderRuntimeSettings('ollama', settings),
    settings.ollama,
  )
  assert.equal(resolveAgentProviderRuntimeSettings('lmstudio', settings), undefined)
})

test('agent runtime source no longer hardcodes openai runtime settings for all agents', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/main/moa/agent-runtime.mjs'), 'utf8')
  assert.match(source, /resolveAgentProviderRuntimeSettings/)
  assert.doesNotMatch(source, /providerRuntimeSettings:\s*runtime\.providerRuntimeSettings\?\.openai/)
})

test('agent runtime source forces OpenAI MoA transport onto responses_stream', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/main/moa/agent-runtime-provider-runtime.mjs'), 'utf8')
  assert.match(source, /normalizedProviderId !== 'openai'/)
  assert.match(source, /transportMode:\s*'responses_stream'/)
})

