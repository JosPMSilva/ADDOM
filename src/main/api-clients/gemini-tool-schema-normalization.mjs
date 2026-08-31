import { jsonSchema } from 'ai'

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeEnumWithoutNull(enumValues = []) {
  return Array.isArray(enumValues)
    ? enumValues.filter((value) => value !== null)
    : enumValues
}

function isObjectSchema(schema = null) {
  if (!isPlainObject(schema)) return false
  const type = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean)
  return type.includes('object') || isPlainObject(schema.properties)
}

function expandRequiredOnlyObjectBranch(branch = null, parentProperties = null) {
  if (!isPlainObject(branch) || !Array.isArray(branch.required) || branch.required.length === 0) {
    return branch
  }
  if (Object.prototype.hasOwnProperty.call(branch, 'type') || isPlainObject(branch.properties)) {
    return branch
  }
  if (!isPlainObject(parentProperties)) {
    return {
      ...branch,
      type: 'object',
    }
  }

  const properties = {}
  const required = []
  for (const propertyName of branch.required) {
    if (!Object.prototype.hasOwnProperty.call(parentProperties, propertyName)) continue
    properties[propertyName] = parentProperties[propertyName]
    required.push(propertyName)
  }

  if (required.length === 0) return null

  return {
    ...branch,
    type: 'object',
    properties,
    required,
  }
}

function normalizeGeminiJsonSchema(schema = null) {
  if (!isPlainObject(schema)) return schema

  const next = { ...schema }

  if (isPlainObject(next.properties)) {
    next.properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => [key, normalizeGeminiJsonSchema(value)]),
    )
  }

  if (next.items) {
    next.items = Array.isArray(next.items)
      ? next.items.map((value) => normalizeGeminiJsonSchema(value))
      : normalizeGeminiJsonSchema(next.items)
  }

  if (Array.isArray(next.prefixItems)) {
    next.prefixItems = next.prefixItems.map((value) => normalizeGeminiJsonSchema(value))
  }

  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(next[keyword])) {
      const normalizedEntries = next[keyword]
        .map((value) => normalizeGeminiJsonSchema(value))
      next[keyword] = isObjectSchema(next)
        ? normalizedEntries
          .map((value) => expandRequiredOnlyObjectBranch(value, next.properties))
          .filter(Boolean)
        : normalizedEntries
    }
  }

  if (isPlainObject(next.not)) {
    next.not = normalizeGeminiJsonSchema(next.not)
  }

  if (!Array.isArray(next.type) || !next.type.includes('null')) {
    return next
  }

  const nonNullTypes = next.type.filter((value) => value && value !== 'null')
  if (nonNullTypes.length === 0) return next

  const baseSchema = {
    ...next,
    ...(nonNullTypes.length === 1 ? { type: nonNullTypes[0] } : { type: nonNullTypes }),
  }

  if (Array.isArray(baseSchema.enum)) {
    const normalizedEnum = normalizeEnumWithoutNull(baseSchema.enum)
    if (normalizedEnum.length > 0) {
      baseSchema.enum = normalizedEnum
    } else {
      delete baseSchema.enum
    }
  }

  delete baseSchema.nullable

  return {
    anyOf: [
      normalizeGeminiJsonSchema(baseSchema),
      { type: 'null' },
    ],
  }
}

export function normalizeGeminiToolSchemas(tools = {}) {
  const source = tools && typeof tools === 'object' ? tools : {}
  const next = {}
  for (const [toolName, definition] of Object.entries(source)) {
    if (!definition || typeof definition !== 'object') {
      next[toolName] = definition
      continue
    }
    const schema = definition?.inputSchema?.jsonSchema
    if (!isPlainObject(schema)) {
      next[toolName] = definition
      continue
    }
    next[toolName] = {
      ...definition,
      inputSchema: jsonSchema(normalizeGeminiJsonSchema(schema)),
    }
  }
  return next
}

export const __testGeminiToolSchemaNormalization = Object.freeze({
  normalizeGeminiJsonSchema,
})
