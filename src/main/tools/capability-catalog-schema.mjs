import {
  CAPABILITY_CATALOG_LIMITS,
  normalizeCatalogTrust,
  sanitizeCatalogExamples,
  sanitizeCatalogStringList,
  sanitizeCatalogText,
} from './capability-catalog-sanitize.mjs'

export const CAPABILITY_CATALOG_SOURCES = Object.freeze([
  'built_in',
  'provider',
  'mcp',
  'skill',
  'plugin',
  'user',
  'external',
])

export const CAPABILITY_CATALOG_STATUSES = Object.freeze([
  'available',
  'disabled_by_user',
  'auth_required',
  'setup_required',
  'runtime_unavailable',
  'blocked_by_policy',
])

export const CAPABILITY_PERMISSION_CLASSES = Object.freeze([
  'none',
  'read',
  'write',
  'execute',
  'network',
  'browser',
  'delegation',
  'planning',
  'question',
  'mixed',
])

export const CAPABILITY_RISK_CLASSES = Object.freeze([
  'low',
  'medium',
  'high',
  'critical',
])

export const CAPABILITY_DEFAULT_EXPOSURES = Object.freeze([
  'default_visible',
  'catalog_only',
  'intent_activated',
  'recovery_activated',
  'blocked',
  'unavailable',
])

export const CAPABILITY_ACTIVATION_STATES = Object.freeze([
  'hidden_discoverable',
  'primed',
  'active',
  'blocked',
  'unavailable',
])

export const CAPABILITY_ACTIVATION_REASONS = Object.freeze([
  'default_core',
  'strong_intent',
  'catalog_read',
  'explicit_request',
  'hidden_known_recovery',
  'policy',
  'runtime_status',
])

const REQUIRED_FIELDS = Object.freeze([
  'id',
  'title',
  'source',
  'status',
  'summary',
  'permissionClass',
  'riskClass',
  'defaultExposure',
  'activation',
  'toolsAfterActivation',
])

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function pushEnumError(errors, field, value, allowedValues) {
  if (!allowedValues.includes(value)) {
    errors.push(`${field} must be one of: ${allowedValues.join(', ')}`)
  }
}

function normalizeActivation(value = null) {
  if (!isPlainObject(value)) {
    return {
      state: '',
      reasons: [],
      decay: '',
    }
  }
  return {
    state: sanitizeCatalogText(value.state, { maxChars: 80, singleLine: true }).toLowerCase(),
    reasons: sanitizeCatalogStringList(value.reasons || value.triggers, {
      maxItems: 8,
      maxChars: 80,
      lowercase: true,
    }),
    decay: sanitizeCatalogText(value.decay || '', { maxChars: 120, singleLine: true }).toLowerCase(),
  }
}

export function normalizeCapabilityCatalogEntry(rawEntry = {}, {
  trust = rawEntry?.trust || rawEntry?.provenance?.trust || 'curated',
} = {}) {
  const entry = isPlainObject(rawEntry) ? rawEntry : {}
  const normalizedTrust = normalizeCatalogTrust(trust)
  return {
    id: sanitizeCatalogText(entry.id, { maxChars: 120, singleLine: true }),
    title: sanitizeCatalogText(entry.title, { maxChars: 160, singleLine: true }),
    source: sanitizeCatalogText(entry.source, { maxChars: 80, singleLine: true }).toLowerCase(),
    status: sanitizeCatalogText(entry.status, { maxChars: 80, singleLine: true }).toLowerCase(),
    summary: sanitizeCatalogText(entry.summary, {
      maxChars: CAPABILITY_CATALOG_LIMITS.summaryChars,
      singleLine: true,
    }),
    permissionClass: sanitizeCatalogText(entry.permissionClass, { maxChars: 80, singleLine: true }).toLowerCase(),
    riskClass: sanitizeCatalogText(entry.riskClass, { maxChars: 80, singleLine: true }).toLowerCase(),
    defaultExposure: sanitizeCatalogText(entry.defaultExposure, { maxChars: 80, singleLine: true }).toLowerCase(),
    activation: normalizeActivation(entry.activation),
    toolsAfterActivation: sanitizeCatalogStringList(entry.toolsAfterActivation, {
      maxItems: CAPABILITY_CATALOG_LIMITS.toolsAfterActivation,
      maxChars: 120,
    }),
    trust: normalizedTrust,
    whenToUse: sanitizeCatalogStringList(entry.whenToUse, { maxItems: 8, maxChars: 240 }),
    whenNotToUse: sanitizeCatalogStringList(entry.whenNotToUse, { maxItems: 8, maxChars: 240 }),
    examples: sanitizeCatalogExamples(entry.examples),
    related: sanitizeCatalogStringList(entry.related, { maxItems: CAPABILITY_CATALOG_LIMITS.related, maxChars: 160 }),
    auth: isPlainObject(entry.auth) ? { ...entry.auth } : null,
    provenance: isPlainObject(entry.provenance) ? { ...entry.provenance, trust: normalizedTrust } : { trust: normalizedTrust },
    limits: isPlainObject(entry.limits) ? { ...entry.limits } : null,
  }
}

export function validateCapabilityCatalogEntry(rawEntry = {}, options = {}) {
  const entry = normalizeCapabilityCatalogEntry(rawEntry, options)
  const errors = []
  for (const field of REQUIRED_FIELDS) {
    const value = entry[field]
    const hasValue = Array.isArray(value)
      ? value.length > 0
      : isPlainObject(value)
        ? Object.keys(value).length > 0
        : Boolean(value)
    if (!hasValue) errors.push(`${field} is required`)
  }
  pushEnumError(errors, 'source', entry.source, CAPABILITY_CATALOG_SOURCES)
  pushEnumError(errors, 'status', entry.status, CAPABILITY_CATALOG_STATUSES)
  pushEnumError(errors, 'permissionClass', entry.permissionClass, CAPABILITY_PERMISSION_CLASSES)
  pushEnumError(errors, 'riskClass', entry.riskClass, CAPABILITY_RISK_CLASSES)
  pushEnumError(errors, 'defaultExposure', entry.defaultExposure, CAPABILITY_DEFAULT_EXPOSURES)
  pushEnumError(errors, 'activation.state', entry.activation.state, CAPABILITY_ACTIVATION_STATES)
  for (const reason of entry.activation.reasons) {
    pushEnumError(errors, `activation.reasons[${reason}]`, reason, CAPABILITY_ACTIVATION_REASONS)
  }
  return {
    ok: errors.length === 0,
    entry,
    errors,
  }
}

export function assertValidCapabilityCatalogEntry(rawEntry = {}, options = {}) {
  const result = validateCapabilityCatalogEntry(rawEntry, options)
  if (!result.ok) {
    throw new Error(`Invalid capability catalog entry: ${result.errors.join('; ')}`)
  }
  return result.entry
}
