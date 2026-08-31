const SENSITIVE_FIELD_NAMES = new Set([
  'access_token',
  'apikey',
  'api_key',
  'authcode',
  'authorization',
  'authorizationcode',
  'authurl',
  'callbackurl',
  'code',
  'cookie',
  'id_token',
  'idtoken',
  'redirecturl',
  'refresh_token',
  'refreshtoken',
  'secret',
  'session',
  'sessionid',
  'sessiontoken',
  'token',
])

const URL_LIKE_FIELD_NAMES = new Set([
  'authurl',
  'callbackurl',
  'redirecturl',
  'url',
])

const URL_WITH_QUERY_PATTERN = /https?:\/\/[^\s"'<>]+/gi
const SENSITIVE_KEY_VALUE_PATTERN = /(^|[\s?&#,;{(])((?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|token|code|secret|session(?:[_-]?id)?|cookie))=([^\s&#,;})]+)/gi
const SENSITIVE_JSON_ASSIGNMENT_PATTERN = /("(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|token|code|secret|session(?:[_-]?id)?|cookie)"\s*:\s*")([^"]+)(")/gi
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~-]+\b/gi

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeFieldName(value = '') {
  return normalizeId(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function looksSensitiveFieldName(value = '') {
  const normalized = normalizeFieldName(value)
  if (!normalized) return false
  if (SENSITIVE_FIELD_NAMES.has(normalized)) return true
  return /(token|secret|cookie|session|authorization|apikey|authcode)/.test(normalized)
}

function looksUrlLikeFieldName(value = '') {
  const normalized = normalizeFieldName(value)
  return URL_LIKE_FIELD_NAMES.has(normalized)
}

export function sanitizeUrlForSecrets(value = '') {
  const rawValue = String(value || '')
  const trimmed = rawValue.trim()
  if (!trimmed) return rawValue
  try {
    const parsed = new URL(trimmed)
    const hasSensitiveParts = Boolean(parsed.search || parsed.hash)
    if (!hasSensitiveParts) return rawValue
    return `${parsed.origin}${parsed.pathname}${parsed.search ? '?[redacted-query]' : ''}${parsed.hash ? '#[redacted-fragment]' : ''}`
  } catch {
    return rawValue
  }
}

export function sanitizeTextForSecrets(value = '') {
  const rawValue = String(value || '')
  if (!rawValue) return rawValue
  return rawValue
    .replace(URL_WITH_QUERY_PATTERN, (url) => sanitizeUrlForSecrets(url))
    .replace(SENSITIVE_KEY_VALUE_PATTERN, (_match, prefix, key) => `${prefix}${key}=[redacted]`)
    .replace(SENSITIVE_JSON_ASSIGNMENT_PATTERN, (_match, prefix, _value, suffix) => `${prefix}[redacted]${suffix}`)
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [redacted]')
}

function redactFieldValue(fieldName = '', value = null) {
  const normalizedFieldName = normalizeFieldName(fieldName)
  if (looksSensitiveFieldName(normalizedFieldName)) {
    return `[redacted-${normalizedFieldName || 'secret'}]`
  }
  if (typeof value === 'string') {
    const sanitizedText = sanitizeTextForSecrets(value)
    if (looksUrlLikeFieldName(normalizedFieldName)) {
      return sanitizeUrlForSecrets(sanitizedText)
    }
    return sanitizedText
  }
  return value
}

export function sanitizeStructuredForSecrets(value = null, fieldName = '') {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeStructuredForSecrets(entry))
  }
  if (value && typeof value === 'object') {
    const next = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      next[key] = sanitizeStructuredForSecrets(nestedValue, key)
    }
    return next
  }
  return redactFieldValue(fieldName, value)
}
