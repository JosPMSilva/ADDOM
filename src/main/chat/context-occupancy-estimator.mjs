import { estimateHistoryTokens } from './context-compaction.mjs'
import { estimateTextTokens } from './token-utils.mjs'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function clampTokenCount(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.max(0, Math.round(n)) : fallback
}

function flattenMessageContent(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        if (typeof part.text === 'string') return part.text
        if (typeof part.input === 'string') return part.input
        if (part.input && typeof part.input === 'object') {
          try {
            return JSON.stringify(part.input)
          } catch {
            return String(part.input)
          }
        }
        if (part.output && typeof part.output === 'object') {
          try {
            return JSON.stringify(part.output)
          } catch {
            return String(part.output)
          }
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content)
    } catch {
      return String(content)
    }
  }
  return ''
}

function stringifyToolOutput(output = null) {
  if (typeof output === 'string') return output
  if (!output || typeof output !== 'object') return output == null ? '' : String(output)
  if (typeof output.value === 'string') return output.value
  if (Object.prototype.hasOwnProperty.call(output, 'value')) {
    try {
      return JSON.stringify(output.value)
    } catch {
      return String(output.value)
    }
  }
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function isPrunedToolResultPart(part = {}) {
  return part?.toolResultHistoryPruned?.pruned === true
}

function estimateToolMessageCategoryTokens(content) {
  const categories = {
    recentToolResultTokens: 0,
    oldToolResultPlaceholderTokens: 0,
  }
  const parts = Array.isArray(content) ? content : []
  let sawToolResultPart = false

  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    if (normalizeText(part.type).toLowerCase() !== 'tool-result') continue
    sawToolResultPart = true
    const outputText = stringifyToolOutput(part.output)
    if (!outputText) continue
    const tokens = estimateRoleMessageTokens('tool', outputText)
    if (isPrunedToolResultPart(part)) {
      categories.oldToolResultPlaceholderTokens += tokens
    } else {
      categories.recentToolResultTokens += tokens
    }
  }

  if (!sawToolResultPart) {
    const contentText = flattenMessageContent(content)
    if (contentText) categories.recentToolResultTokens += estimateRoleMessageTokens('tool', contentText)
  }

  return categories
}

function stableSerializeToolDefinition(toolName = '', definition = null) {
  if (!definition || typeof definition !== 'object') return ''
  const serialized = {
    name: normalizeText(toolName),
    description: normalizeText(definition.description),
    inputSchema: definition.inputSchema && typeof definition.inputSchema === 'object'
      ? definition.inputSchema
      : null,
    parameters: definition.parameters && typeof definition.parameters === 'object'
      ? definition.parameters
      : null,
  }
  return JSON.stringify(serialized)
}

function estimateToolDefinitionsTokens(activeToolDefinitions = {}) {
  const tools = activeToolDefinitions && typeof activeToolDefinitions === 'object'
    ? Object.entries(activeToolDefinitions)
    : []
  if (tools.length === 0) {
    return {
      toolCount: 0,
      toolDefinitionTokens: 0,
    }
  }

  let toolDefinitionTokens = 0
  let toolCount = 0
  for (const [toolName, definition] of tools) {
    const serialized = stableSerializeToolDefinition(toolName, definition)
    if (!serialized) continue
    toolDefinitionTokens += estimateTextTokens(serialized)
    toolCount += 1
  }

  return {
    toolCount,
    toolDefinitionTokens,
  }
}

function estimateRoleMessageTokens(role = '', text = '') {
  const content = String(text || '')
  if (!content) return 0
  return clampTokenCount(estimateTextTokens(`${role}\n${content}`) + 3, 0)
}

function splitMemoryContextFromSystemText(text = '') {
  const value = String(text || '')
  const projectMarker = 'The following is relevant durable context from this project'
  const memoryIndex = value.indexOf(projectMarker)
  if (memoryIndex < 0) {
    return {
      systemRuntimeText: value,
      memoryText: '',
    }
  }
  return {
    systemRuntimeText: value.slice(0, memoryIndex),
    memoryText: value.slice(memoryIndex),
  }
}

function estimateHistoryCategoryTokens(history = []) {
  const categories = {
    systemRuntimeTokens: 0,
    memoryTokens: 0,
    continuityTokens: 0,
    historyTokens: 0,
    recentToolResultTokens: 0,
    oldToolResultPlaceholderTokens: 0,
  }

  for (const message of Array.isArray(history) ? history : []) {
    if (!message || typeof message !== 'object') continue
    const role = normalizeText(message.role).toLowerCase()
    const contentText = flattenMessageContent(message.content)
    if (!contentText) continue
    if (role === 'system' || role === 'developer') {
      if (contentText.includes('[ADDOM Continuity Packet]')) {
        categories.continuityTokens += estimateRoleMessageTokens(role, contentText)
        continue
      }
      const { systemRuntimeText, memoryText } = splitMemoryContextFromSystemText(contentText)
      categories.systemRuntimeTokens += estimateRoleMessageTokens(role, systemRuntimeText)
      categories.memoryTokens += estimateRoleMessageTokens(role, memoryText)
      continue
    }
    if (role === 'tool') {
      if (Array.isArray(message?.content)) {
        const toolCategoryTokens = estimateToolMessageCategoryTokens(message.content)
        categories.recentToolResultTokens += toolCategoryTokens.recentToolResultTokens
        categories.oldToolResultPlaceholderTokens += toolCategoryTokens.oldToolResultPlaceholderTokens
        continue
      }
      categories.recentToolResultTokens += estimateRoleMessageTokens(role, contentText)
      continue
    }
    categories.historyTokens += estimateRoleMessageTokens(role, contentText)
  }

  return categories
}

function buildDominantContributors(categoryEstimates = {}, maxItems = 3) {
  return Object.entries(categoryEstimates && typeof categoryEstimates === 'object' ? categoryEstimates : {})
    .filter(([category]) => String(category || '').trim() !== 'outputReserveTokens')
    .map(([category, tokens]) => ({
      category,
      tokens: clampTokenCount(tokens, 0),
    }))
    .filter((row) => row.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens || a.category.localeCompare(b.category))
    .slice(0, Math.max(1, Math.trunc(Number(maxItems || 3) || 3)))
}

export function estimateDispatchedPromptOccupancy({
  history = [],
  activeToolDefinitions = {},
  providerId = '',
  model = '',
  outputReserveTokens = 0,
} = {}) {
  const historyTokens = clampTokenCount(estimateHistoryTokens(history), 0)
  const { toolCount, toolDefinitionTokens } = estimateToolDefinitionsTokens(activeToolDefinitions)
  const tokenEstimate = clampTokenCount(historyTokens + toolDefinitionTokens, 0)
  const calibrated = Array.isArray(history) && history.length > 0
  const categoryEstimates = {
    ...estimateHistoryCategoryTokens(history),
    activeToolSchemaTokens: clampTokenCount(toolDefinitionTokens, 0),
    outputReserveTokens: clampTokenCount(outputReserveTokens, 0),
  }
  const dominantContributors = buildDominantContributors(categoryEstimates)

  return {
    tokenEstimate,
    occupancyConfidence: calibrated ? 'calibrated_estimate' : 'rough_estimate',
    occupancyMethod: toolCount > 0
      ? 'transformed_history_plus_tool_schema'
      : 'transformed_history_estimate',
    diagnostics: {
      providerId: normalizeText(providerId).toLowerCase(),
      model: normalizeText(model),
      historyTokens,
      toolDefinitionTokens,
      toolCount,
      calibrated,
      categoryEstimates,
      dominantContributors,
    },
  }
}
