import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { openAIAccountSessionCredentialChanged } from '../../src/renderer/store/openai-account-provider-hydration.mjs'

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8')
}

test('openAIAccountSessionCredentialChanged only fires when hasSession flips', () => {
  assert.equal(
    openAIAccountSessionCredentialChanged({ hasSession: false }, { hasSession: true }),
    true,
  )
  assert.equal(
    openAIAccountSessionCredentialChanged({ hasSession: true }, { hasSession: false }),
    true,
  )
  assert.equal(
    openAIAccountSessionCredentialChanged(
      { hasSession: true, rateLimitSummary: { primary: { usedPercent: 10 } } },
      { hasSession: true, rateLimitSummary: { primary: { usedPercent: 55 } } },
    ),
    false,
  )
  assert.equal(
    openAIAccountSessionCredentialChanged(null, { hasSession: false }),
    false,
  )
  assert.equal(
    openAIAccountSessionCredentialChanged(null, { hasSession: true }),
    true,
  )
})

test('vault store reloads providers only when OpenAI account hasSession flips', () => {
  const source = readSource('src/renderer/store/useVaultStore.js')

  assert.match(source, /openAIAccountSessionCredentialChanged/)
  assert.match(
    source,
    /onSessionUpdated\(\(sessionSummary\) => \{[\s\S]*?openAIAccountSessionCredentialChanged\([\s\S]*?loadProviders\(true\)/,
  )
  assert.match(
    source,
    /if \(openAIAccountSessionCredentialChanged\(previousSession, nextSession\)\) \{\s*void get\(\)\.loadProviders\(true\)\s*\}/,
  )
})
