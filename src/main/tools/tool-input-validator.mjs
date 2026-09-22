import Ajv from 'ajv'

import { BASE_TOOLS } from './tool-definitions-base.mjs'
import { TERMINAL_SESSION_TOOLS } from './tool-definitions-terminal.mjs'

const TOOL_DEFINITION_BY_NAME = new Map(
  [...BASE_TOOLS, ...TERMINAL_SESSION_TOOLS]
    .map((definition) => [String(definition?.name || '').trim(), definition])
    .filter(([toolName]) => toolName),
)

const ajv = new Ajv({ allErrors: true, strict: false })
const validatorByToolName = new Map()

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOptionalNulls(schema, value) {
  if (!schema || typeof schema !== 'object') return value

  if (Array.isArray(value)) {
    const itemSchema = Array.isArray(schema.items) ? null : schema.items
    return itemSchema
      ? value.map((entry) => normalizeOptionalNulls(itemSchema, entry))
      : value
  }

  if (!isPlainObject(value) || !isPlainObject(schema.properties)) return value

  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  const normalized = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null && !required.has(key)) continue
    normalized[key] = normalizeOptionalNulls(schema.properties[key], entry)
  }
  return normalized
}

function closeObjectSchemas(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
  const next = { ...schema }
  if (isPlainObject(next.properties)) {
    next.properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, propertySchema]) => [
        key,
        closeObjectSchemas(propertySchema),
      ]),
    )
    if (!Object.prototype.hasOwnProperty.call(next, 'additionalProperties')) {
      next.additionalProperties = false
    }
  }
  if (next.items) {
    next.items = Array.isArray(next.items)
      ? next.items.map((itemSchema) => closeObjectSchemas(itemSchema))
      : closeObjectSchemas(next.items)
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(next[keyword])) {
      next[keyword] = next[keyword].map((branch) => closeObjectSchemas(branch))
    }
  }
  if (next.not) next.not = closeObjectSchemas(next.not)
  return next
}

function formatValidationIssue(issue = {}) {
  const path = String(issue.instancePath || '')
    .split('/')
    .filter(Boolean)
    .join('.')
  if (issue.keyword === 'required') {
    const missingProperty = String(issue.params?.missingProperty || '').trim()
    return `${path ? `${path}.` : ''}${missingProperty || 'value'} is required`
  }
  const location = path || 'input'
  if (issue.keyword === 'anyOf') return `${location} does not satisfy a required alternative`
  return `${location} ${String(issue.message || 'is invalid').trim()}`
}

function getValidator(toolName) {
  const normalizedName = String(toolName || '').trim()
  if (!normalizedName) return null
  if (validatorByToolName.has(normalizedName)) return validatorByToolName.get(normalizedName)
  const schema = TOOL_DEFINITION_BY_NAME.get(normalizedName)?.parameters
  if (!schema) {
    validatorByToolName.set(normalizedName, null)
    return null
  }
  const validator = ajv.compile(closeObjectSchemas(schema))
  validatorByToolName.set(normalizedName, validator)
  return validator
}

export class ToolInputValidationError extends Error {
  constructor(toolName, issues = []) {
    const firstIssue = formatValidationIssue(issues[0])
    super(`Invalid input for ${String(toolName || 'tool')}: ${firstIssue}.`)
    this.name = 'ToolInputValidationError'
    this.code = 'invalid_tool_input'
    this.toolName = String(toolName || '').trim()
    this.issues = Array.isArray(issues) ? issues.map((issue) => ({ ...issue })) : []
  }
}

export function validateToolInput(toolName, input) {
  const normalizedName = String(toolName || '').trim()
  const definition = TOOL_DEFINITION_BY_NAME.get(normalizedName)
  const validator = getValidator(normalizedName)
  const value = definition
    ? normalizeOptionalNulls(definition.parameters, input ?? {})
    : (input ?? {})
  if (!validator || validator(value) === true) {
    return { success: true, value }
  }
  return {
    success: false,
    error: new ToolInputValidationError(normalizedName, validator.errors || []),
  }
}

export function assertValidToolInput(toolName, input) {
  const result = validateToolInput(toolName, input)
  if (!result.success) throw result.error
  return result.value
}

export const __testToolInputValidator = Object.freeze({
  closeObjectSchemas,
  normalizeOptionalNulls,
})
