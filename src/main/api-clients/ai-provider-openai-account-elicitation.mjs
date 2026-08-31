const MAX_ELICITATION_FIELDS = 32
const MAX_ELICITATION_OPTIONS = 64
const MAX_MESSAGE_LENGTH = 4_000
const MAX_LABEL_LENGTH = 240
const MAX_DESCRIPTION_LENGTH = 1_200
const MAX_FIELD_NAME_LENGTH = 120
const MAX_TEXT_LENGTH = 8_192

const RESERVED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype'])
const STRING_FORMATS = new Set(['email', 'uri', 'date', 'date-time'])

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyKeys(value, allowedKeys = []) {
  if (!isPlainObject(value)) return false
  const allowed = new Set(allowedKeys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function normalizeBoundedText(value, maxLength, { required = false } = {}) {
  if (value === undefined || value === null) return required ? null : ''
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if ((required && !normalized) || normalized.length > maxLength) return null
  return normalized
}

function normalizeOptionalInteger(value, {
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
} = {}) {
  if (value === undefined || value === null) return null
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized) || normalized < minimum || normalized > maximum) return undefined
  return normalized
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null) return null
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : undefined
}

function normalizeFieldPresentation(schema) {
  const title = normalizeBoundedText(schema.title, MAX_LABEL_LENGTH)
  const description = normalizeBoundedText(schema.description, MAX_DESCRIPTION_LENGTH)
  if (title === null || description === null) return null
  return { title, description }
}

function normalizeOptionValues(values, titles = null) {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_ELICITATION_OPTIONS) return null
  if (titles !== null && (!Array.isArray(titles) || titles.length !== values.length)) return null
  const seen = new Set()
  const options = []
  for (let index = 0; index < values.length; index += 1) {
    const value = normalizeBoundedText(values[index], MAX_LABEL_LENGTH, { required: true })
    const title = titles === null
      ? value
      : normalizeBoundedText(titles[index], MAX_LABEL_LENGTH, { required: true })
    if (!value || !title || seen.has(value)) return null
    seen.add(value)
    options.push({ value, title })
  }
  return options
}

function normalizeConstOptions(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_ELICITATION_OPTIONS) return null
  const options = []
  const seen = new Set()
  for (const entry of values) {
    if (!hasOnlyKeys(entry, ['const', 'title'])) return null
    const value = normalizeBoundedText(entry.const, MAX_LABEL_LENGTH, { required: true })
    const title = normalizeBoundedText(entry.title, MAX_LABEL_LENGTH, { required: true })
    if (!value || !title || seen.has(value)) return null
    seen.add(value)
    options.push({ value, title })
  }
  return options
}

function normalizeSelectField(schema) {
  if (schema.type !== 'string') return null
  const presentation = normalizeFieldPresentation(schema)
  if (!presentation) return null

  let options = null
  if (Object.hasOwn(schema, 'oneOf')) {
    if (!hasOnlyKeys(schema, ['type', 'title', 'description', 'oneOf', 'default'])) return null
    options = normalizeConstOptions(schema.oneOf)
  } else if (Object.hasOwn(schema, 'enum')) {
    if (!hasOnlyKeys(schema, ['type', 'title', 'description', 'enum', 'enumNames', 'default'])) return null
    options = normalizeOptionValues(schema.enum, Object.hasOwn(schema, 'enumNames') ? schema.enumNames : null)
  }
  if (!options) return null

  const field = {
    kind: 'single_select',
    ...presentation,
    options,
  }
  if (Object.hasOwn(schema, 'default')) {
    if (typeof schema.default !== 'string' || !options.some((option) => option.value === schema.default)) return null
    field.defaultValue = schema.default
  }
  return field
}

function normalizeTextField(schema) {
  if (!hasOnlyKeys(schema, [
    'type',
    'title',
    'description',
    'minLength',
    'maxLength',
    'format',
    'default',
  ])) return null
  const presentation = normalizeFieldPresentation(schema)
  if (!presentation) return null
  const minLength = normalizeOptionalInteger(schema.minLength, { maximum: MAX_TEXT_LENGTH })
  const maxLength = normalizeOptionalInteger(schema.maxLength, { maximum: MAX_TEXT_LENGTH })
  if (minLength === undefined || maxLength === undefined) return null
  const effectiveMinimum = minLength ?? 0
  const effectiveMaximum = maxLength ?? MAX_TEXT_LENGTH
  if (effectiveMinimum > effectiveMaximum) return null
  const format = schema.format === undefined
    ? ''
    : normalizeBoundedText(schema.format, 40, { required: true })
  if (format === null || (format && !STRING_FORMATS.has(format))) return null

  const field = {
    kind: 'text',
    ...presentation,
    minLength: effectiveMinimum,
    maxLength: effectiveMaximum,
    ...(format ? { format } : {}),
  }
  if (Object.hasOwn(schema, 'default')) {
    if (typeof schema.default !== 'string') return null
    const normalizedDefault = normalizeTextValue(field, schema.default)
    if (!normalizedDefault.valid) return null
    field.defaultValue = normalizedDefault.value
  }
  return field
}

function normalizeNumberField(schema) {
  if (!hasOnlyKeys(schema, [
    'type',
    'title',
    'description',
    'minimum',
    'maximum',
    'default',
  ])) return null
  const presentation = normalizeFieldPresentation(schema)
  if (!presentation) return null
  const minimum = normalizeOptionalNumber(schema.minimum)
  const maximum = normalizeOptionalNumber(schema.maximum)
  if (minimum === undefined || maximum === undefined || (minimum !== null && maximum !== null && minimum > maximum)) {
    return null
  }
  const field = {
    kind: schema.type === 'integer' ? 'integer' : 'number',
    ...presentation,
    ...(minimum !== null ? { minimum } : {}),
    ...(maximum !== null ? { maximum } : {}),
  }
  if (Object.hasOwn(schema, 'default')) {
    const defaultValue = normalizeOptionalNumber(schema.default)
    if (defaultValue === null || defaultValue === undefined) return null
    if (field.kind === 'integer' && !Number.isSafeInteger(defaultValue)) return null
    if (minimum !== null && defaultValue < minimum) return null
    if (maximum !== null && defaultValue > maximum) return null
    field.defaultValue = defaultValue
  }
  return field
}

function normalizeBooleanField(schema) {
  if (!hasOnlyKeys(schema, ['type', 'title', 'description', 'default'])) return null
  const presentation = normalizeFieldPresentation(schema)
  if (!presentation) return null
  const field = {
    kind: 'boolean',
    ...presentation,
  }
  if (Object.hasOwn(schema, 'default')) {
    if (typeof schema.default !== 'boolean') return null
    field.defaultValue = schema.default
  }
  return field
}

function normalizeMultiSelectField(schema) {
  if (!hasOnlyKeys(schema, [
    'type',
    'title',
    'description',
    'minItems',
    'maxItems',
    'items',
    'default',
  ])) return null
  const presentation = normalizeFieldPresentation(schema)
  if (!presentation || !isPlainObject(schema.items)) return null
  let options = null
  if (hasOnlyKeys(schema.items, ['type', 'enum']) && schema.items.type === 'string') {
    options = normalizeOptionValues(schema.items.enum)
  } else if (hasOnlyKeys(schema.items, ['anyOf']) || hasOnlyKeys(schema.items, ['oneOf'])) {
    options = normalizeConstOptions(schema.items.anyOf || schema.items.oneOf)
  }
  if (!options) return null
  const minItems = normalizeOptionalInteger(schema.minItems, { maximum: options.length })
  const maxItems = normalizeOptionalInteger(schema.maxItems, { maximum: options.length })
  if (minItems === undefined || maxItems === undefined) return null
  const effectiveMinimum = minItems ?? 0
  const effectiveMaximum = maxItems ?? options.length
  if (effectiveMinimum > effectiveMaximum) return null

  const field = {
    kind: 'multi_select',
    ...presentation,
    minItems: effectiveMinimum,
    maxItems: effectiveMaximum,
    options,
  }
  if (Object.hasOwn(schema, 'default')) {
    const normalizedDefault = normalizeMultiSelectValue(field, schema.default)
    if (!normalizedDefault.valid) return null
    field.defaultValue = normalizedDefault.value
  }
  return field
}

function normalizeFieldSchema(schema) {
  if (!isPlainObject(schema)) return null
  if (schema.type === 'array') return normalizeMultiSelectField(schema)
  if (schema.type === 'string' && (Object.hasOwn(schema, 'enum') || Object.hasOwn(schema, 'oneOf'))) {
    return normalizeSelectField(schema)
  }
  if (schema.type === 'string') return normalizeTextField(schema)
  if (schema.type === 'number' || schema.type === 'integer') return normalizeNumberField(schema)
  if (schema.type === 'boolean') return normalizeBooleanField(schema)
  return null
}

function normalizeMcpElicitationForm(params) {
  const schema = params.requestedSchema
  if (!hasOnlyKeys(schema, ['$schema', 'type', 'properties', 'required'])) {
    return { valid: false, reason: 'unsupported_form_schema', elicitation: null }
  }
  if (schema.type !== 'object' || !isPlainObject(schema.properties)) {
    return { valid: false, reason: 'unsupported_form_schema', elicitation: null }
  }
  const propertyEntries = Object.entries(schema.properties)
  if (propertyEntries.length < 1 || propertyEntries.length > MAX_ELICITATION_FIELDS) {
    return { valid: false, reason: 'unsupported_form_schema', elicitation: null }
  }

  const requiredNames = schema.required === undefined ? [] : schema.required
  if (!Array.isArray(requiredNames) || requiredNames.length > propertyEntries.length) {
    return { valid: false, reason: 'unsupported_form_schema', elicitation: null }
  }
  const required = new Set()
  for (const entry of requiredNames) {
    const name = normalizeBoundedText(entry, MAX_FIELD_NAME_LENGTH, { required: true })
    if (!name || required.has(name) || !Object.hasOwn(schema.properties, name)) {
      return { valid: false, reason: 'unsupported_form_schema', elicitation: null }
    }
    required.add(name)
  }

  const fields = []
  for (const [rawName, fieldSchema] of propertyEntries) {
    const name = normalizeBoundedText(rawName, MAX_FIELD_NAME_LENGTH, { required: true })
    const field = normalizeFieldSchema(fieldSchema)
    if (!name || RESERVED_FIELD_NAMES.has(name) || !field) {
      return { valid: false, reason: 'unsupported_field_schema', elicitation: null }
    }
    fields.push({
      name,
      required: required.has(name),
      ...field,
    })
  }

  return {
    valid: true,
    elicitation: {
      mode: 'form',
      providerThreadId: normalizeBoundedText(params.threadId, MAX_LABEL_LENGTH),
      providerTurnId: normalizeBoundedText(params.turnId, MAX_LABEL_LENGTH),
      serverName: normalizeBoundedText(params.serverName, MAX_LABEL_LENGTH, { required: true }),
      message: normalizeBoundedText(params.message, MAX_MESSAGE_LENGTH, { required: true }),
      fields,
    },
  }
}

export function normalizeOpenAIAccountMcpElicitationRequest(params = null) {
  if (!isPlainObject(params)) {
    return { valid: false, reason: 'malformed_request', elicitation: null }
  }
  if (params.mode === 'url') {
    return { valid: false, reason: 'unsupported_url_mode', elicitation: null }
  }
  if (params.mode !== 'form') {
    return { valid: false, reason: 'unsupported_elicitation_mode', elicitation: null }
  }
  const normalized = normalizeMcpElicitationForm(params)
  if (
    normalized.valid
    && (!normalized.elicitation.serverName || !normalized.elicitation.message)
  ) {
    return { valid: false, reason: 'malformed_request', elicitation: null }
  }
  return normalized
}

function normalizeTextValue(field, value) {
  if (typeof value !== 'string') return { valid: false }
  if (value.length < field.minLength || value.length > field.maxLength) return { valid: false }
  if (field.format && !isValidStringFormat(field.format, value)) return { valid: false }
  return { valid: true, value }
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function isValidDateTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value)
  if (!match || !isValidDate(match[1])) return false
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false
  if (match[6] && (Number(match[6]) > 23 || Number(match[7]) > 59)) return false
  return Number.isFinite(Date.parse(value))
}

function isValidStringFormat(format, value) {
  if (format === 'date') return isValidDate(value)
  if (format === 'date-time') return isValidDateTime(value)
  if (format === 'email') return /^[^\s@]+@[^\s@]+$/.test(value)
  if (format === 'uri') {
    try {
      const url = new URL(value)
      return Boolean(url.protocol)
    } catch {
      return false
    }
  }
  return true
}

function normalizeNumberValue(field, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { valid: false }
  if (field.kind === 'integer' && !Number.isSafeInteger(value)) return { valid: false }
  if (field.minimum !== undefined && value < field.minimum) return { valid: false }
  if (field.maximum !== undefined && value > field.maximum) return { valid: false }
  return { valid: true, value }
}

function normalizeSingleSelectValue(field, value) {
  if (typeof value !== 'string' || !field.options.some((option) => option.value === value)) {
    return { valid: false }
  }
  return { valid: true, value }
}

function normalizeMultiSelectValue(field, value) {
  if (!Array.isArray(value) || value.length < field.minItems || value.length > field.maxItems) {
    return { valid: false }
  }
  const allowed = new Set(field.options.map((option) => option.value))
  const unique = new Set()
  for (const entry of value) {
    if (typeof entry !== 'string' || !allowed.has(entry) || unique.has(entry)) return { valid: false }
    unique.add(entry)
  }
  return { valid: true, value: Array.from(unique) }
}

function normalizeSubmissionValue(field, value) {
  if (field.kind === 'text') return normalizeTextValue(field, value)
  if (field.kind === 'number' || field.kind === 'integer') return normalizeNumberValue(field, value)
  if (field.kind === 'boolean') return typeof value === 'boolean' ? { valid: true, value } : { valid: false }
  if (field.kind === 'single_select') return normalizeSingleSelectValue(field, value)
  if (field.kind === 'multi_select') return normalizeMultiSelectValue(field, value)
  return { valid: false }
}

export function normalizeOpenAIAccountMcpElicitationSubmission(elicitation = null, content = null) {
  if (!isPlainObject(elicitation) || elicitation.mode !== 'form' || !Array.isArray(elicitation.fields)) {
    return { valid: false, reason: 'invalid_elicitation' }
  }
  if (!isPlainObject(content)) return { valid: false, reason: 'invalid_content' }
  const fieldsByName = new Map(elicitation.fields.map((field) => [field.name, field]))
  if (Object.keys(content).some((name) => !fieldsByName.has(name))) {
    return { valid: false, reason: 'unexpected_field' }
  }

  const normalizedContent = {}
  for (const field of elicitation.fields) {
    if (!Object.hasOwn(content, field.name)) {
      if (field.required) return { valid: false, reason: 'missing_required_field' }
      continue
    }
    const normalized = normalizeSubmissionValue(field, content[field.name])
    if (!normalized.valid) return { valid: false, reason: 'invalid_field_value' }
    normalizedContent[field.name] = normalized.value
  }
  return { valid: true, content: normalizedContent }
}

export function buildCancelledOpenAIAccountMcpElicitationResponse(action = 'cancel') {
  const normalizedAction = action === 'decline' ? 'decline' : 'cancel'
  return {
    action: normalizedAction,
    content: null,
    _meta: null,
  }
}
