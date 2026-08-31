import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { resolveModelCapabilitiesWithTimeout } from '../../src/main/chat/chat-capability-probe.mjs'

test('resolveModelCapabilitiesWithTimeout returns the probe result when it completes in time', async () => {
  const expected = { supportsTools: true, source: 'provider_probe' }
  const result = await resolveModelCapabilitiesWithTimeout({
    providerId: 'openai',
    apiKey: 'sk-test',
    modelId: 'gpt-5.2',
    timeoutMs: 100,
    resolveCapabilities: async () => expected,
  })

  assert.equal(result, expected)
})

test('resolveModelCapabilitiesWithTimeout rejects stalled capability probes', async () => {
  await assert.rejects(
    resolveModelCapabilitiesWithTimeout({
      providerId: 'openai',
      apiKey: 'sk-test',
      modelId: 'gpt-5.2',
      timeoutMs: 25,
      resolveCapabilities: async () => new Promise(() => {}),
    }),
    /Capability probe timed out/i,
  )
})

test('resolveModelCapabilitiesWithTimeout aborts when the outer signal is cancelled', async () => {
  const controller = new AbortController()
  const probePromise = resolveModelCapabilitiesWithTimeout({
    providerId: 'openai',
    apiKey: 'sk-test',
    modelId: 'gpt-5.2',
    timeoutMs: 5_000,
    abortSignal: controller.signal,
    resolveCapabilities: async () => new Promise(() => {}),
  })
  controller.abort()

  await assert.rejects(probePromise, /Capability probe aborted/i)
})

test('chat stream handler emits turn started before waiting on capability probing', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/main/ipc-handlers/chat-stream-handler.mjs'),
    'utf8',
  )
  const startedIndex = source.indexOf("sendTurnState('started'")
  const capabilityProbeIndex = source.indexOf('await resolveModelCapabilitiesWithTimeout({')

  assert.notEqual(startedIndex, -1)
  assert.notEqual(capabilityProbeIndex, -1)
  assert.ok(
    startedIndex < capabilityProbeIndex,
    'turn started must be emitted before capability probing to avoid silent blocked turns',
  )
  assert.match(source, /if \(loop\.cancelled \|\| loop\.abortController\?\.signal\?\.aborted \|\| isAbortError\(capabilityError\)\)/)
  assert.doesNotMatch(source, /resolveWireApi\(providerId/)
  assert.match(source, /adapterProfile\?\.wireApi/)
  assert.match(
    source,
    /sendTurnState\('started',[\s\S]*reasoningEffort: requestedReasoningEffort/,
    'turn-start persistence should retain the dispatched reasoning effort for audit and hydration',
  )
})
