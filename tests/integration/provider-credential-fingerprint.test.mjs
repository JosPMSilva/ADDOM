import test from 'node:test'
import assert from 'node:assert/strict'

import { createProviderCredentialFingerprint } from '../../src/main/api-clients/provider-credential-fingerprint.mjs'

test('credential fingerprint is stable for the same provider and trimmed credential', () => {
  const first = createProviderCredentialFingerprint('anthropic', '  sk-ant-test-123  ')
  const second = createProviderCredentialFingerprint('anthropic', 'sk-ant-test-123')

  assert.equal(first, second)
  assert.match(first, /^sha256:[a-f0-9]{64}$/)
  assert.equal(first.includes('sk-ant-test-123'), false)
})

test('credential fingerprint stays provider-scoped', () => {
  const anthropic = createProviderCredentialFingerprint('anthropic', 'shared-secret')
  const openai = createProviderCredentialFingerprint('openai', 'shared-secret')

  assert.notEqual(anthropic, openai)
})

test('credential fingerprint returns empty when provider or credential is missing', () => {
  assert.equal(createProviderCredentialFingerprint('', 'secret'), '')
  assert.equal(createProviderCredentialFingerprint('anthropic', ''), '')
})
