import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8')
}

test('ChatPanel refreshes OpenAI account rate limits on manual model refresh and during active turns', () => {
  const source = [
    readSource('src/renderer/components/ChatPanel.jsx'),
    readSource('src/renderer/components/chat/ChatPanelView.jsx'),
    readSource('src/renderer/components/chat/use-chat-panel-openai-rate-limits.mjs'),
  ].join('\n')

  assert.match(source, /useChatPanelOpenAIRateLimits/)
  assert.match(source, /const OPENAI_ACCOUNT_RATE_LIMIT_POLL_INTERVAL_MS = 2_000/)
  assert.match(source, /void refreshOpenAIAccountRateLimits\(\{ refreshProviders: true, background: false \}\)/)
  assert.match(source, /void refreshOpenAIAccountRateLimits\(\{ refreshProviders: false, background: true \}\)/)
  assert.match(source, /const intervalId = window\.setInterval\(\(\) => \{/)
  assert.match(source, /}, OPENAI_ACCOUNT_RATE_LIMIT_POLL_INTERVAL_MS\)/)
  assert.match(source, /onSend=\{handleSend\}/)
})

test('vault store supports lightweight OpenAI account session refreshes without provider reloads', () => {
  const source = readSource('src/renderer/store/useVaultStore.js')

  assert.match(source, /refreshOpenAIAccountState: async \(\{ refreshProviders = true, background = false \} = \{\}\) => \{/)
  assert.match(source, /if \(refreshProviders\) \{\s*await get\(\)\.loadProviders\(true\)\s*\}/)
  assert.match(source, /openAIAccountSessionCredentialChanged\(previousSession, nextSession\)/)
  assert.match(
    source,
    /if \(openAIAccountSessionCredentialChanged\(previousSession, nextSession\)\) \{\s*void get\(\)\.loadProviders\(true\)\s*\}/,
  )
  assert.match(source, /loadProvidersInFlight/)
})
