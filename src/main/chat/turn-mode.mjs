import { toAISDKTools } from '../tools/tool-definitions.mjs'
import { resolveToolIdentity } from '../tools/tool-identity-registry.mjs'

const RESEARCH_FAMILIES = new Set(['file_read', 'web_fetch', 'image_view'])
const READ_ONLY_GIT_TOOL_NAMES = new Set(['git_status', 'git_diff', 'git_log'])
const QUESTION_TOOL_NAMES = new Set(['question_user'])
const PLAN_READ_TOOL_NAMES = new Set(['plan_read', 'todo_read'])
const PLAN_UPDATE_TOOL_NAMES = new Set([
  'plan_update', 'plan_direction_update', 'plan_direction_finalize', 'todo_write',
])
const PLAN_DOCUMENT_TOOL_NAMES = new Set(['plan_document_write'])
const PLANNING_SKILL_TOOL_NAMES = new Set(['planning_skill_read'])

function normalizeMetadata(metadata = {}) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
}

/**
 * Resolve the mode ceiling for one canonical tool identity. This policy is
 * deliberately independent of permission profiles: profiles refine Execute,
 * but cannot widen Thinking or Plan.
 */
export function resolveModeCapability(toolName = '', mode = 'execute', metadata = {}) {
  const normalizedMode = normalizeChatMode(mode)
  const details = normalizeMetadata(metadata)
  const identity = resolveToolIdentity(String(toolName || '').trim(), {
    providerToolExecutionContext: details.providerToolExecutionContext || null,
    backendToolNameOverride: String(details.backendToolName || '').trim(),
  })
  const canonicalToolName = String(identity?.canonicalToolName || toolName || '').trim()
  const visibleToolName = String(identity?.visibleToolName || toolName || '').trim()
  const family = String(identity?.family || '').trim().toLowerCase()
  const trustedReadOnly = details.trustedReadOnly === true
    || details?.mcp?.trustedReadOnly === true
    || details?.dynamic?.trustedReadOnly === true

  if (normalizedMode === 'execute') {
    return { allowed: true, reason: 'execute_permission_governed', identity }
  }
  if (QUESTION_TOOL_NAMES.has(canonicalToolName) || QUESTION_TOOL_NAMES.has(visibleToolName)) {
    return { allowed: true, reason: 'structured_question_allowed', identity }
  }
  if (PLAN_READ_TOOL_NAMES.has(canonicalToolName) || PLAN_READ_TOOL_NAMES.has(visibleToolName)) {
    return { allowed: true, reason: 'plan_read_allowed', identity }
  }
  if (normalizedMode === 'plan' && (
    PLAN_UPDATE_TOOL_NAMES.has(canonicalToolName)
    || PLAN_UPDATE_TOOL_NAMES.has(visibleToolName)
    || PLAN_DOCUMENT_TOOL_NAMES.has(canonicalToolName)
    || PLAN_DOCUMENT_TOOL_NAMES.has(visibleToolName)
    || PLANNING_SKILL_TOOL_NAMES.has(canonicalToolName)
    || PLANNING_SKILL_TOOL_NAMES.has(visibleToolName)
  )) {
    return { allowed: true, reason: 'plan_write_allowed', identity }
  }
  if (RESEARCH_FAMILIES.has(family)) {
    return { allowed: true, reason: 'research_allowed', identity }
  }
  if (family === 'git' && READ_ONLY_GIT_TOOL_NAMES.has(canonicalToolName)) {
    return { allowed: true, reason: 'git_read_allowed', identity }
  }
  if (trustedReadOnly) {
    return { allowed: true, reason: 'trusted_read_only_tool_allowed', identity }
  }
  return { allowed: false, reason: 'mode_capability_denied', identity }
}

export function filterToolsForMode(tools = {}, mode = 'execute', metadataByTool = {}) {
  const source = tools && typeof tools === 'object' ? tools : {}
  const filtered = {}
  for (const [toolName, definition] of Object.entries(source)) {
    const decision = resolveModeCapability(toolName, mode, metadataByTool?.[toolName])
    if (decision.allowed) filtered[toolName] = definition
  }
  return filtered
}

export function normalizeChatMode(mode) {
  if (mode === 'plan') return 'plan'
  if (mode === 'thinking') return 'thinking'
  return 'execute'
}

export function resolveTurnTools(
  mode,
  permissionMode = 'ask',
  delegationAvailable = false,
  toolsFactory = toAISDKTools,
  toolOptions = {},
) {
  const normalizedMode = normalizeChatMode(mode)
  return filterToolsForMode(
    toolsFactory(permissionMode, !!delegationAvailable, toolOptions),
    normalizedMode,
    toolOptions?.metadataByTool,
  )
}

export function buildModeSystemPrompt(basePrompt, prompts = {}, mode) {
  const normalizedMode = normalizeChatMode(mode)
  const planPrompt = String(prompts?.plan ?? '').trim()
  const thinkingPrompt = String(prompts?.thinking ?? '').trim()

  if (normalizedMode === 'plan' && planPrompt) {
    return `${basePrompt}\n\n${planPrompt}`
  }

  if (normalizedMode === 'thinking' && thinkingPrompt) {
    return `${basePrompt}\n\n${thinkingPrompt}`
  }

  return basePrompt
}
