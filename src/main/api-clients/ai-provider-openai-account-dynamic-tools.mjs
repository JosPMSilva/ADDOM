import crypto from 'node:crypto'
import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import {
  normalizeId,
  normalizeObject,
} from './ai-provider-openai-account-shared.mjs'

const ACCOUNT_DYNAMIC_TOOL_TRANSPORT_NAME_OVERRIDES = Object.freeze({
  apply_patch: 'workspace_apply_patch',
})

const ACCOUNT_DYNAMIC_TOOL_CANONICAL_NAME_BY_TRANSPORT = Object.freeze(
  Object.fromEntries(
    Object.entries(ACCOUNT_DYNAMIC_TOOL_TRANSPORT_NAME_OVERRIDES).map(([canonicalName, transportName]) => [
      transportName,
      canonicalName,
    ]),
  ),
)

function normalizeDynamicToolInput(value = null, { toolName = '' } = {}) {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return normalizeObject(parsed)
    } catch {
      return String(toolName || '').trim().toLowerCase() === 'apply_patch'
        ? { patch: value }
        : {}
    }
  }
  return normalizeObject(value)
}

function toAccountDynamicToolTransportName(toolName = '') {
  const normalizedToolName = normalizeId(toolName)
  return ACCOUNT_DYNAMIC_TOOL_TRANSPORT_NAME_OVERRIDES[normalizedToolName] || normalizedToolName
}

function fromAccountDynamicToolTransportName(toolName = '') {
  const normalizedToolName = normalizeId(toolName)
  return ACCOUNT_DYNAMIC_TOOL_CANONICAL_NAME_BY_TRANSPORT[normalizedToolName] || normalizedToolName
}

function extractDynamicToolSchema(toolDefinition = null) {
  const definition = normalizeObject(toolDefinition)
  const inputSchema = normalizeObject(definition.inputSchema)
  const jsonSchema = normalizeObject(inputSchema.jsonSchema)
  if (Object.keys(jsonSchema).length > 0) return jsonSchema
  if (Object.keys(inputSchema).length > 0) return inputSchema
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  }
}

export function buildDynamicTools(toolMap = {}) {
  const source = normalizeObject(toolMap)
  return Object.entries(source)
    .map(([name, definition]) => {
      const canonicalToolName = normalizeId(name)
      if (!canonicalToolName) return null
      return {
        // Avoid colliding with Codex-native tool ids like "apply_patch" while
        // preserving canonical ADDOM tool names internally.
        name: toAccountDynamicToolTransportName(canonicalToolName),
        description: String(definition?.description || '').trim(),
        inputSchema: extractDynamicToolSchema(definition),
      }
    })
    .filter(Boolean)
}

export function buildDynamicToolSignature(dynamicTools = []) {
  const normalizedTools = Array.isArray(dynamicTools)
    ? dynamicTools
      .map((tool) => ({
        name: normalizeId(tool?.name),
        inputSchema: normalizeObject(tool?.inputSchema),
      }))
      .filter((tool) => tool.name)
      .sort((left, right) => left.name.localeCompare(right.name))
    : []
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalizedTools))
    .digest('hex')
    .slice(0, 16)
}

export function buildModeSignature({
  delegationBackend = '',
  collaborationModeId = '',
  permissionMode = 'ask',
} = {}) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      delegationBackend: normalizeId(delegationBackend).toLowerCase() || 'none',
      collaborationModeId: normalizeId(collaborationModeId),
      permissionMode: normalizePermissionMode(permissionMode),
    }))
    .digest('hex')
    .slice(0, 16)
}

export function buildModelSignature(model = '') {
  return crypto
    .createHash('sha256')
    .update(normalizeId(model))
    .digest('hex')
    .slice(0, 16)
}

export function extractDynamicToolCall(params = null) {
  const source = normalizeObject(params)
  const item = normalizeObject(source.item)
  const toolName = fromAccountDynamicToolTransportName(
    normalizeId(source.tool || item.tool || item.name),
  )
  const rawInput = (
    source.arguments
    ?? source.input
    ?? item.arguments
    ?? item.input
    ?? null
  )
  return {
    id: normalizeId(source.itemId || source.toolCallId || item.id),
    toolName,
    input: normalizeDynamicToolInput(rawInput, { toolName }),
  }
}

export function normalizeDynamicToolExecutorResult(result = null) {
  const source = normalizeObject(result)
  const directContentItems = Array.isArray(source.contentItems) ? source.contentItems : null
  if (directContentItems) {
    return {
      contentItems: normalizeBridgeContentItems(directContentItems),
      success: source.success !== false,
    }
  }
  const payload = Object.prototype.hasOwnProperty.call(source, 'result')
    ? source.result
    : result
  const isError = source.isError === true || source.success === false
  const text = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload ?? null, null, 2)
  return {
    contentItems: text ? [{ type: 'inputText', text }] : [],
    success: !isError,
  }
}

function normalizeBridgeContentItems(items = []) {
  return items
    .map((item) => normalizeBridgeContentItem(item))
    .filter(Boolean)
}

function normalizeBridgeContentItem(item = null) {
  const source = normalizeObject(item)
  const type = normalizeId(source.type).toLowerCase()
  const text = String(
    source.text
    ?? source.value
    ?? source.output?.text
    ?? source.output?.value
    ?? '',
  )

  if (type === 'inputtext' || type === 'input_text' || type === 'text') {
    return { type: 'inputText', text }
  }

  if (text) {
    return { type: 'inputText', text }
  }

  return null
}
