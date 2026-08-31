import crypto from 'node:crypto'

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeCredential(value = '') {
  return String(value || '').trim()
}

export function createProviderCredentialFingerprint(providerId = '', credential = '') {
  const normalizedProviderId = normalizeProviderId(providerId)
  const normalizedCredential = normalizeCredential(credential)
  if (!normalizedProviderId || !normalizedCredential) return ''

  const digest = crypto.createHash('sha256')
    .update(normalizedProviderId, 'utf8')
    .update('\n', 'utf8')
    .update(normalizedCredential, 'utf8')
    .digest('hex')

  return `sha256:${digest}`
}
