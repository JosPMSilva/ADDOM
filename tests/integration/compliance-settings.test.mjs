import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPLIANCE_MODE_WARN_ONLY,
  COMPLIANCE_MODE_STRICT,
  normalizeComplianceMode,
  normalizeProviderTermsAcknowledgements,
  isProviderTermsAcknowledged,
} from '../../src/common/compliance/compliance-settings.mjs'
import { getProviderTermsGuidance } from '../../src/common/compliance/provider-terms-guidance.mjs'

test('normalizeComplianceMode keeps warn_only default and validates strict/off', () => {
  assert.equal(normalizeComplianceMode(undefined, COMPLIANCE_MODE_WARN_ONLY), COMPLIANCE_MODE_WARN_ONLY)
  assert.equal(normalizeComplianceMode('warn_only', 'off'), COMPLIANCE_MODE_WARN_ONLY)
  assert.equal(normalizeComplianceMode('strict', COMPLIANCE_MODE_WARN_ONLY), COMPLIANCE_MODE_STRICT)
  assert.equal(normalizeComplianceMode('off', COMPLIANCE_MODE_WARN_ONLY), 'off')
  assert.equal(normalizeComplianceMode('invalid', COMPLIANCE_MODE_WARN_ONLY), COMPLIANCE_MODE_WARN_ONLY)
})

test('normalizeProviderTermsAcknowledgements sanitizes invalid entries', () => {
  const normalized = normalizeProviderTermsAcknowledgements({
    OpenAI: {
      termsVersion: '2026-02-28',
      acceptedAt: 1700000000000,
      termsUrl: 'https://openai.com/policies/service-terms',
      providerName: 'OpenAI',
    },
    invalidMissingVersion: {
      acceptedAt: 1700000000000,
    },
    invalidAcceptedAt: {
      termsVersion: 'v1',
      acceptedAt: 'not-a-number',
    },
  })

  assert.equal(Object.keys(normalized).length, 1)
  assert.equal(typeof normalized.openai, 'object')
  assert.equal(normalized.openai.termsVersion, '2026-02-28')
  assert.equal(normalized.openai.acceptedAt, 1700000000000)
})

test('isProviderTermsAcknowledged enforces version match and skips local providers', () => {
  const provider = {
    id: 'openai',
    termsVersion: '2026-02-28',
    noKeyRequired: false,
  }
  const acknowledgements = normalizeProviderTermsAcknowledgements({
    openai: {
      termsVersion: '2026-02-28',
      acceptedAt: Date.now(),
    },
  })
  assert.equal(isProviderTermsAcknowledged(provider, acknowledgements), true)

  const staleAcknowledgements = normalizeProviderTermsAcknowledgements({
    openai: {
      termsVersion: '2026-01-01',
      acceptedAt: Date.now(),
    },
  })
  assert.equal(isProviderTermsAcknowledged(provider, staleAcknowledgements), false)
  assert.equal(isProviderTermsAcknowledged(provider, {}), false)

  assert.equal(isProviderTermsAcknowledged({
    id: 'ollama',
    noKeyRequired: true,
    termsVersion: '2026-02-28',
  }, {}), true)
})

test('getProviderTermsGuidance returns provider-specific and fallback guidance', () => {
  const perplexity = getProviderTermsGuidance({ id: 'perplexity' })
  assert.equal(perplexity.providerId, 'perplexity')
  assert.ok(Array.isArray(perplexity.bullets))
  assert.ok(perplexity.bullets.some((row) => String(row).toLowerCase().includes('citation')))

  const openai = getProviderTermsGuidance({ id: 'openai' })
  assert.ok(openai.bullets.some((row) => String(row).toLowerCase().includes('mcp')))

  const fallback = getProviderTermsGuidance({ id: 'unknown-provider' })
  assert.equal(fallback.providerId, 'unknown-provider')
  assert.ok(Array.isArray(fallback.bullets))
  assert.ok(fallback.bullets.length >= 3)
  assert.ok(fallback.bullets.some((row) => String(row).toLowerCase().includes('provider-hosted tool activity')))
})
