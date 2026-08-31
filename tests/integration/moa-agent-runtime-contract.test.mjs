import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/main/moa/agent-runtime.mjs'),
  'utf8',
)

test('MoA agent runtime does not terminate tool rounds purely because the provider used stop/end_turn', () => {
  assert.doesNotMatch(source, /!toolCalls\.length \|\| stopReason === 'stop' \|\| stopReason === 'end_turn'/)
})

test('MoA agent runtime fails empty-output agent completions after tool execution errors', () => {
  assert.match(source, /if \(!String\(finalText \|\| ''\)\.trim\(\) && lastToolExecutionError\)/)
})

test('MoA agent runtime classifies provider quota exhaustion as rate_limited', () => {
  const providerRuntimeSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/main/moa/agent-runtime-provider-runtime.mjs'),
    'utf8',
  )
  assert.match(providerRuntimeSource, /isProviderQuotaExceededError/)
  assert.match(providerRuntimeSource, /status:\s*'rate_limited'/)
  assert.match(providerRuntimeSource, /retryAfterSeconds/)
})
