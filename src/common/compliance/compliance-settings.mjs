export const COMPLIANCE_MODE_WARN_ONLY = 'warn_only'
export const COMPLIANCE_MODE_STRICT = 'strict'
const COMPLIANCE_MODE_OFF = 'off'

function cleanString(value = '') {
  return String(value ?? '').trim()
}

export function normalizeComplianceMode(value, fallback = COMPLIANCE_MODE_WARN_ONLY) {
  const normalized = cleanString(value).toLowerCase()
  if (normalized === COMPLIANCE_MODE_OFF) return COMPLIANCE_MODE_OFF
  if (normalized === COMPLIANCE_MODE_STRICT) return COMPLIANCE_MODE_STRICT
  if (normalized === COMPLIANCE_MODE_WARN_ONLY) return COMPLIANCE_MODE_WARN_ONLY
  return fallback
}

export function normalizeProviderTermsAcknowledgements(input = {}, {
  maxProviders = 64,
} = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const entries = Object.entries(source)
  const output = {}
  let count = 0

  for (const [providerIdRaw, value] of entries) {
    if (count >= maxProviders) break
    const providerId = cleanString(providerIdRaw).toLowerCase().slice(0, 80)
    if (!providerId) continue
    if (!value || typeof value !== 'object') continue

    const termsVersion = cleanString(value.termsVersion).slice(0, 120)
    if (!termsVersion) continue

    const acceptedAt = Number(value.acceptedAt)
    if (!Number.isFinite(acceptedAt) || acceptedAt <= 0) continue

    const row = {
      termsVersion,
      acceptedAt: Math.round(acceptedAt),
    }

    const termsUrl = cleanString(value.termsUrl).slice(0, 500)
    if (termsUrl) row.termsUrl = termsUrl

    const providerName = cleanString(value.providerName).slice(0, 120)
    if (providerName) row.providerName = providerName

    output[providerId] = row
    count += 1
  }

  return output
}

export function isProviderTermsAcknowledged(provider = {}, acknowledgements = {}) {
  if (!provider || typeof provider !== 'object') return true
  if (provider.noKeyRequired) return true

  const providerId = cleanString(provider.id || provider.providerId).toLowerCase()
  if (!providerId) return true

  const termsVersion = cleanString(provider.termsVersion)
  if (!termsVersion) return true

  const map = acknowledgements && typeof acknowledgements === 'object'
    ? acknowledgements
    : {}
  const row = map[providerId]
  if (!row || typeof row !== 'object') return false
  return cleanString(row.termsVersion) === termsVersion
}
