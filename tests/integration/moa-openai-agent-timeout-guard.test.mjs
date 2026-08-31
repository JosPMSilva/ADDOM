import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveAgentStreamIdleTimeoutMs, resolveAgentStreamTimeoutMs } from '../../src/main/moa/agent-runtime.mjs'

test('MoA agent stream timeout is bounded below the remaining delegation budget', () => {
  const timeoutMs = resolveAgentStreamTimeoutMs({
    delegationDeadlineAt: Date.now() + 40_000,
  })

  assert.equal(timeoutMs > 0, true)
  assert.equal(timeoutMs <= 35_000, true)
  assert.equal(timeoutMs >= 5_000, true)
})

test('MoA agent stream timeout falls back to minimum guard when delegation deadline is nearly exhausted', () => {
  const timeoutMs = resolveAgentStreamTimeoutMs({
    delegationDeadlineAt: Date.now() + 1_000,
  })

  assert.equal(timeoutMs, 5_000)
})

test('MoA agent idle timeout is more lenient for local providers', () => {
  const remoteTimeoutMs = resolveAgentStreamIdleTimeoutMs('openai', {
    policy: {
      agentStreamIdleTimeoutMs: 30_000,
      localAgentStreamIdleTimeoutMs: 180_000,
    },
  })
  const localTimeoutMs = resolveAgentStreamIdleTimeoutMs('ollama', {
    policy: {
      agentStreamIdleTimeoutMs: 30_000,
      localAgentStreamIdleTimeoutMs: 180_000,
    },
  })

  assert.equal(remoteTimeoutMs, 30_000)
  assert.equal(localTimeoutMs, 180_000)
})

test('shared stream runtime treats provider tool-stream events as real progress', () => {
  const source = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/main/api-clients/ai-provider-adapter-core.mjs'),
    'utf8',
  )
  assert.match(
    source,
    /if \(eventCollector\.handleChunk\(chunk\)\) \{\s*emittedAnyChunk = true\s*staleMonitor\.markProgress\(\)\s*\}/,
  )
})

test('shared stream runtime honors explicit per-call stream timeout overrides', () => {
  const source = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/main/api-clients/ai-provider-adapter-core.mjs'),
    'utf8',
  )
  assert.match(source, /streamTimeoutMs = 0/)
  assert.match(source, /const resolvedStreamTimeoutMs =/)
  assert.match(source, /buildTimeoutSignal\(resolvedStreamTimeoutMs, abortSignal\)/)
})
