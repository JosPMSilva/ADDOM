export const AGENT_CONTRACT_SCHEMA_VERSION = 1

export function assertPlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${field} must be a plain object`)
  }
  return value
}

function assertSerializableNode(value, field, seen) {
  if (value === null) return
  const type = typeof value
  if (type === 'string' || type === 'boolean') return
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${field} must be JSON serializable`)
    return
  }
  if (type !== 'object') throw new TypeError(`${field} must be JSON serializable`)
  if (seen.has(value)) throw new TypeError(`${field} must be JSON serializable without cycles`)
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSerializableNode(entry, `${field}[${index}]`, seen))
  } else {
    assertPlainObject(value, field)
    for (const [key, entry] of Object.entries(value)) {
      assertSerializableNode(entry, `${field}.${key}`, seen)
    }
  }
  seen.delete(value)
}

export function cloneSerializable(value, field = 'value') {
  assertSerializableNode(value, field, new Set())
  return JSON.parse(JSON.stringify(value))
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const entry of Object.values(value)) deepFreeze(entry)
  return value
}

export function validateSchemaVersion(value) {
  if (value !== AGENT_CONTRACT_SCHEMA_VERSION) {
    throw new TypeError(`schemaVersion must be ${AGENT_CONTRACT_SCHEMA_VERSION}`)
  }
  return value
}

export function validateString(value, field, {
  nullable = false,
  maxLength = 512,
  allowWhitespaceControl = false,
  preserveWhitespace = false,
} = {}) {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string`)
  const normalized = preserveWhitespace ? value : value.trim()
  if (normalized.length > maxLength) throw new TypeError(`${field} exceeds ${maxLength} characters`)
  const hasForbiddenControl = allowWhitespaceControl
    // Allow TAB/LF/CR only; reject other Cc including C1 (U+0080–U+009F).
    // eslint-disable-next-line no-control-regex -- intentional Cc allowlist for prose fields
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F]/u.test(normalized)
    : /\p{Cc}/u.test(normalized)
  if (hasForbiddenControl) throw new TypeError(`${field} contains control characters`)
  return normalized
}

export function validateOptionalString(value, field, options = {}) {
  if (value === null || value === undefined) return null
  return validateString(value, field, options)
}

export function validateInternalId(value, field) {
  return validateString(value, field, { maxLength: 256 })
}

export function validateOptionalExternalId(value, field) {
  return validateOptionalString(value, field, { maxLength: 1024 })
}

export function validateInteger(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${field} must be an integer between ${min} and ${max}`)
  }
  return value
}

export function validateNumber(value, field, { min = 0, max = Number.MAX_VALUE } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${field} must be a finite number between ${min} and ${max}`)
  }
  return value
}

export function validateTimestamp(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null
  return validateInteger(value, field, { min: 0 })
}

export function validateEnum(value, field, allowed) {
  if (!allowed.includes(value)) throw new TypeError(`${field} must be one of: ${allowed.join(', ')}`)
  return value
}

export function validateSummary(value, field, {
  maxLength = 4_000,
  nullable = true,
  allowWhitespaceControl = false,
} = {}) {
  if (nullable && value === null) return null
  return validateString(value, field, { maxLength, allowWhitespaceControl })
}

export function validateTerminalTimestamps(status, terminalStatuses, startedAt, finishedAt) {
  if (startedAt !== null && finishedAt !== null && finishedAt < startedAt) {
    throw new TypeError('finishedAt cannot be earlier than startedAt')
  }
  if (terminalStatuses.includes(status) && finishedAt === null) {
    throw new TypeError(`finishedAt is required for terminal status ${status}`)
  }
  if (!terminalStatuses.includes(status) && finishedAt !== null) {
    throw new TypeError(`finishedAt must be null for non-terminal status ${status}`)
  }
}

export function cloneContractInput(value, field) {
  assertPlainObject(value, field)
  return cloneSerializable(value, field)
}
