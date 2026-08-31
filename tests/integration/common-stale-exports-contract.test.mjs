import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('common modules keep live exports and drop the remaining stale ones', () => {
  const complianceSource = readSource('src/common/compliance/compliance-settings.mjs')
  const providerTermsSource = readSource('src/common/compliance/provider-terms-guidance.mjs')
  const attachmentSource = readSource('src/common/attachments/attachment-support-policy.mjs')
  const modelRegistrySource = readSource('src/common/api-clients/model-registry.mjs')
  const moaSource = readSource('src/common/moa/moa-tier-policy.mjs')

  assert.match(providerTermsSource, /export function getProviderTermsGuidance/)
  assert.match(complianceSource, /export function isProviderTermsAcknowledged/)
  assert.match(attachmentSource, /export function listSupportedTextExtractionExtensions/)
  assert.match(modelRegistrySource, /export function getRegistryProvider/)
  assert.match(modelRegistrySource, /export function listRegistryModelsForProvider/)
  assert.match(moaSource, /export const MOA_TIER_LABELS/)
  assert.match(moaSource, /export const MOA_TIER_DESCRIPTIONS/)
  assert.match(moaSource, /export function applyMoaTierDefaults/)

  assert.doesNotMatch(complianceSource, /export const COMPLIANCE_MODE_OFF/)
  assert.doesNotMatch(attachmentSource, /export function isPdfMediaType/)
  assert.doesNotMatch(moaSource, /export const MOA_USER_TIERS/)
})
