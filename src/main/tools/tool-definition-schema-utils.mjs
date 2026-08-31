function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function schemaAllowsNull(schema) {
  if (!isPlainObject(schema)) return false
  const type = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean)
  if (type.includes('null')) return true
  for (const keyword of ['anyOf', 'oneOf']) {
    if (Array.isArray(schema[keyword]) && schema[keyword].some((entry) => schemaAllowsNull(entry))) {
      return true
    }
  }
  return false
}

function makeSchemaNullable(schema) {
  if (!isPlainObject(schema) || schemaAllowsNull(schema)) return schema

  const next = { ...schema }
  if (typeof next.type === 'string') {
    next.type = [next.type, 'null']
    if (Array.isArray(next.enum) && !next.enum.includes(null)) next.enum = [...next.enum, null]
    return next
  }
  if (Array.isArray(next.type)) {
    next.type = next.type.includes('null') ? next.type : [...next.type, 'null']
    if (Array.isArray(next.enum) && !next.enum.includes(null)) next.enum = [...next.enum, null]
    return next
  }
  if (Array.isArray(next.enum) && !next.enum.includes(null)) {
    next.enum = [...next.enum, null]
    return next
  }
  return {
    anyOf: [next, { type: 'null' }],
  }
}

function expandRequiredOnlyObjectBranch(schema, branch) {
  if (!isPlainObject(schema) || !isPlainObject(branch)) return branch
  if (!Array.isArray(branch.required) || branch.required.length === 0) return branch
  if (Object.prototype.hasOwnProperty.call(branch, 'type') || isPlainObject(branch.properties)) return branch

  const type = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean)
  const isObjectSchema = type.includes('object') || isPlainObject(schema.properties)
  if (!isObjectSchema || !isPlainObject(schema.properties)) return branch

  const properties = {}
  const required = []
  for (const propertyName of branch.required) {
    if (!Object.prototype.hasOwnProperty.call(schema.properties, propertyName)) continue
    properties[propertyName] = schema.properties[propertyName]
    required.push(propertyName)
  }

  if (required.length === 0) return branch

  return {
    ...branch,
    type: 'object',
    properties,
    required,
  }
}

export function sealObjectSchema(schema) {
  if (!isPlainObject(schema)) return schema

  const next = { ...schema }
  const type = Array.isArray(next.type) ? next.type : [next.type].filter(Boolean)
  const isObjectSchema = type.includes('object') || (!next.type && next.properties && typeof next.properties === 'object')

  if (next.properties && typeof next.properties === 'object' && !Array.isArray(next.properties)) {
    next.properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => [key, sealObjectSchema(value)]),
    )
  }

  if (next.items) {
    next.items = Array.isArray(next.items)
      ? next.items.map((value) => sealObjectSchema(value))
      : sealObjectSchema(next.items)
  }

  if (Array.isArray(next.prefixItems)) {
    next.prefixItems = next.prefixItems.map((value) => sealObjectSchema(value))
  }

  for (const keyword of ['anyOf', 'allOf', 'oneOf']) {
    if (Array.isArray(next[keyword])) {
      next[keyword] = next[keyword]
        .map((value) => expandRequiredOnlyObjectBranch(next, value))
        .map((value) => sealObjectSchema(value))
    }
  }

  if (next.not) next.not = sealObjectSchema(next.not)

  if (isObjectSchema) {
    if (!Object.prototype.hasOwnProperty.call(next, 'additionalProperties')) {
      next.additionalProperties = false
    }
    if (next.properties && typeof next.properties === 'object' && !Array.isArray(next.properties)) {
      const propertyKeys = Object.keys(next.properties)
      const requiredSet = new Set(Array.isArray(next.required) ? next.required : [])
      next.properties = Object.fromEntries(
        Object.entries(next.properties).map(([key, value]) => [
          key,
          requiredSet.has(key) ? value : makeSchemaNullable(value),
        ]),
      )
      next.required = propertyKeys
    }
  }

  return next
}
