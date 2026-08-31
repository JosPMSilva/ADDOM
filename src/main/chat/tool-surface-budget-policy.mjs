import {
  RAW_DELEGATION_TOOL_NAME,
  COMPACT_DELEGATION_TOOL_NAMES,
  hasExplicitDelegationRequest,
} from './delegation-tool-surface.mjs'
import { TOOL_SURFACE_ACTIVATION_STATE, consumePrimedToolSurfaceActivation } from './tool-surface-activation.mjs'
import {
  extractRecentUserText,
  normalizeToolMap,
  normalizeToolNames,
  userTextMatches,
} from './tool-surface-selection-helpers.mjs'
import { buildBuiltInCapabilityEntries } from '../tools/capability-catalog-builtins.mjs'
import { resolveToolIdentity } from '../tools/tool-identity-registry.mjs'

const GIT_TOOL_NAMES = new Set([
  'git_status',
  'git_diff',
  'git_log',
  'git_commit',
  'git_checkout_file',
])
const TERMINAL_SESSION_TOOL_NAMES = new Set([
  'terminal_session_list',
  'terminal_session_open',
  'terminal_session_read_snapshot',
  'terminal_session_wait_for_output',
  'terminal_session_attach',
  'terminal_session_write',
  'terminal_session_resize',
  'terminal_session_signal',
  'terminal_session_close',
])
const DELEGATION_TOOL_NAMES = new Set([
  RAW_DELEGATION_TOOL_NAME,
  ...COMPACT_DELEGATION_TOOL_NAMES,
])
const LOCAL_SKILL_TOOL_NAMES = new Set([
  'list_curated_skills',
  'install_curated_skill',
])
const CORE_TOOL_NAMES = new Set([
  'read_file',
  'view_file_range',
  'grep_file',
  'search_code',
  'find_files',
  'list_directory',
  'write_file',
  'edit_file',
  'run_command',
  'fetch_page',
  'question_user',
  'plan_read',
  'plan_update',
  'git_status',
  'agent_catalog',
  ...COMPACT_DELEGATION_TOOL_NAMES,
])
const OPTIONAL_FILE_MUTATION_TOOL_NAMES = new Set([
  'apply_patch',
  'delete_file',
  'rename_file',
  'create_directory',
  'rollback_file',
  'apply_artifact_revision',
])

const BUDGETED_SURFACE_KINDS = new Set([
  'addom_native',
  'openai_codex_local',
  'openai_codex_app_server',
  'openai_hosted',
  'moonshot_formula',
  'perplexity_search',
])

function normalizeLower(value = '') {
  return String(value || '').trim().toLowerCase()
}

function hasTool(tools = {}, toolName = '') {
  return Object.prototype.hasOwnProperty.call(tools, toolName)
}

function normalizeActivationRecords(input = []) {
  if (Array.isArray(input)) return input.filter(Boolean)
  if (!input || typeof input !== 'object') return []
  return Object.values(input).filter(Boolean)
}

function resolveCapabilityToolNamesById() {
  const out = new Map()
  for (const entry of buildBuiltInCapabilityEntries()) {
    const capabilityId = String(entry?.id || '').trim()
    if (!capabilityId) continue
    out.set(capabilityId, normalizeToolNames(entry.toolsAfterActivation || []))
  }
  return out
}

const CAPABILITY_TOOL_NAMES_BY_ID = resolveCapabilityToolNamesById()

function classifyBudgetToolFamily(toolName = '') {
  const name = normalizeLower(toolName)
  if (!name) return ''
  if (TERMINAL_SESSION_TOOL_NAMES.has(name)) return 'terminal_session'
  if (name === 'terminal_memory_suggest') return 'terminal_memory'
  if (GIT_TOOL_NAMES.has(name)) return 'git'
  if (DELEGATION_TOOL_NAMES.has(name) || name === 'apply_artifact_revision') return 'delegation'
  if (LOCAL_SKILL_TOOL_NAMES.has(name)) return 'local_skill'
  if (name === 'browser_action') return 'browser'
  if (name === 'fetch_page') return 'web_fetch'
  if (name === 'run_command') return 'shell'
  if (OPTIONAL_FILE_MUTATION_TOOL_NAMES.has(name)) return 'file_mutation_extra'
  const identityFamily = normalizeLower(resolveToolIdentity(name).family)
  return identityFamily || 'other'
}

function resolveAllowedToolNames({
  tools = {},
  shadowIntent = null,
  userMessage = '',
  history = [],
} = {}) {
  const availableTools = normalizeToolMap(tools)
  const allowed = new Set()
  for (const toolName of CORE_TOOL_NAMES) {
    if (hasTool(availableTools, toolName)) allowed.add(toolName)
  }

  const intent = normalizeLower(shadowIntent?.intent)
  const userText = extractRecentUserText({ userMessage, history }).toLowerCase()
  const hasLocalSkillIntent = userTextMatches(userText, [
    /\bcurated skill\b/i,
    /\bopenai skill\b/i,
    /\bskill catalog\b/i,
    /\b(?:list|install)\s+(?:this\s+|a\s+|an\s+)?(?:curated\s+|openai\s+)?skills?\b/i,
  ])
  const hasWebIntent = intent === 'web_research' || userTextMatches(userText, [
    /\b(fetch|scrape|read docs|look up|search the web|website|web page|url|documentation)\b/i,
    /https?:\/\//i,
  ])
  const hasBrowserIntent = intent === 'browser_interaction' || userTextMatches(userText, [
    /\b(browser|click|scroll|type|fill|login|screenshot|ui flow|interact)\b/i,
    /localhost:\d+|127\.0\.0\.1:\d+/i,
  ])
  const hasGitIntent = userTextMatches(userText, [
    /\bgit\b/i,
    /\b(commit|staged|unstaged|working tree|checkout|branch|rebase|merge)\b/i,
  ])
  const hasDelegationIntent = (
    intent === 'delegation'
    || hasExplicitDelegationRequest({ userMessage, history })
    || userTextMatches(userText, [
      /\b(delegate|delegation|subagents?|sub-agents?|parallel agent|multi-agent)\b/i,
      /\b(?:ask|use|have|send|spawn)\s+(?:an?\s+|one\s+|multiple\s+)?agents?\b/i,
      /\bagents?\s+(?:of|from|in)\s+moa\b/i,
      /\bmoa\b.*\bagents?\b/i,
      /\bagents?\b.*\bmoa\b/i,
    ])
  )
  const hasTerminalSessionIntent = userTextMatches(userText, [
    /\b(terminal session|interactive terminal|persistent terminal|visible terminal|terminal_session|tui|pty|terminal)\b/i,
  ])
  const hasApplyPatchIntent = userTextMatches(userText, [/\bapply_patch\b/i, /\bapply patch\b/i])
  const hasExtraFileMutationIntent = userTextMatches(userText, [
    /\b(delete|rename|move|mkdir|create directory|rollback|restore revision|artifact revision)\b/i,
  ])

  if (hasWebIntent || hasBrowserIntent) allowed.add('fetch_page')
  if (hasBrowserIntent) allowed.add('browser_action')
  if (hasGitIntent) {
    for (const toolName of GIT_TOOL_NAMES) allowed.add(toolName)
  }
  if (hasDelegationIntent) {
    for (const toolName of DELEGATION_TOOL_NAMES) allowed.add(toolName)
  }
  if (hasLocalSkillIntent) {
    for (const toolName of LOCAL_SKILL_TOOL_NAMES) allowed.add(toolName)
  }
  if (hasTerminalSessionIntent) {
    for (const toolName of TERMINAL_SESSION_TOOL_NAMES) allowed.add(toolName)
    allowed.add('terminal_memory_suggest')
  }
  if (hasApplyPatchIntent) allowed.add('apply_patch')
  if (hasExtraFileMutationIntent) {
    for (const toolName of OPTIONAL_FILE_MUTATION_TOOL_NAMES) allowed.add(toolName)
  }

  return allowed
}

function shouldApplyPromptBudgetPolicy({
  promptBudgetProfile = null,
  selection = {},
} = {}) {
  const profileMode = normalizeLower(promptBudgetProfile?.mode) || 'execute'
  const toolSurfaceKind = normalizeLower(selection?.toolSurfaceKind)
  if (profileMode !== 'execute') return false
  return BUDGETED_SURFACE_KINDS.has(toolSurfaceKind)
}

function removeToolsFromExecutionMap(toolExecutionMap = {}, removedToolNames = []) {
  const next = {
    ...(toolExecutionMap && typeof toolExecutionMap === 'object' ? toolExecutionMap : {}),
  }
  for (const toolName of removedToolNames) delete next[toolName]
  return next
}

export function applyProviderPromptBudgetToolSurface(selection = {}, {
  providerId = '',
  promptBudgetProfile = null,
  addomTools = {},
  shadowIntent = null,
  userMessage = '',
  history = [],
} = {}) {
  const source = selection && typeof selection === 'object'
    ? selection
    : {
        tools: normalizeToolMap(addomTools),
        removedAddomToolNames: [],
        excludedToolsWithReasons: [],
        toolExecutionMap: {},
      }
  const normalizedProviderId = normalizeLower(providerId || promptBudgetProfile?.providerId)
  if (!shouldApplyPromptBudgetPolicy({ promptBudgetProfile, selection: source })) return source

  const tools = normalizeToolMap(source.tools)
  const allowedToolNames = resolveAllowedToolNames({
    tools,
    shadowIntent,
    userMessage,
    history,
  })
  const nextTools = {}
  const removedToolNames = []
  const hiddenFamilies = new Set()
  for (const [toolName, definition] of Object.entries(tools)) {
    if (allowedToolNames.has(toolName)) {
      nextTools[toolName] = definition
      continue
    }
    removedToolNames.push(toolName)
    const family = classifyBudgetToolFamily(toolName)
    if (family) hiddenFamilies.add(family)
  }

  const profileId = String(promptBudgetProfile?.id || '').trim()
  if (removedToolNames.length === 0) {
    return {
      ...source,
      toolSurfaceBudgetProvider: normalizedProviderId,
      toolSurfaceBudgetProfile: profileId,
      toolSurfaceBudgetPolicy: 'catalog_first',
      toolSurfaceVisibleCount: Object.keys(tools).length,
      toolSurfaceHiddenFamilies: [],
    }
  }

  const addomToolNames = new Set(Object.keys(normalizeToolMap(addomTools)))
  return {
    ...source,
    tools: nextTools,
    removedAddomToolNames: normalizeToolNames([
      ...(source.removedAddomToolNames || []),
      ...removedToolNames.filter((toolName) => addomToolNames.has(toolName)),
    ]),
    excludedToolsWithReasons: [
      ...(Array.isArray(source.excludedToolsWithReasons) ? source.excludedToolsWithReasons : []),
      ...removedToolNames.map((toolName) => ({
        toolName,
        reason: 'excluded_due_to_catalog_first_prompt_budget',
      })),
    ],
    toolExecutionMap: removeToolsFromExecutionMap(source.toolExecutionMap, removedToolNames),
    toolSurfaceBudgetProvider: normalizedProviderId,
    toolSurfaceBudgetProfile: profileId,
    toolSurfaceBudgetPolicy: 'catalog_first',
    toolSurfaceVisibleCount: Object.keys(nextTools).length,
    toolSurfaceHiddenFamilies: [...hiddenFamilies].sort(),
  }
}

export function applyToolSurfaceActivation(selection = {}, {
  addomTools = {},
  toolSurfaceActivations = [],
} = {}) {
  const source = selection && typeof selection === 'object' ? selection : {}
  const addom = normalizeToolMap(addomTools)
  const tools = { ...normalizeToolMap(source.tools) }
  const nextExecutionMap = {
    ...(source.toolExecutionMap && typeof source.toolExecutionMap === 'object' ? source.toolExecutionMap : {}),
  }
  const removedToolNames = new Set(source.removedAddomToolNames || [])
  const excludedToolsWithReasons = [
    ...(Array.isArray(source.excludedToolsWithReasons) ? source.excludedToolsWithReasons : []),
  ]
  const consumedActivations = []
  const activatedCapabilityIds = new Set()
  const blockedCapabilityIds = new Set()

  for (const record of normalizeActivationRecords(toolSurfaceActivations)) {
    const consumed = consumePrimedToolSurfaceActivation(record)
    if (!consumed?.capabilityId) continue
    consumedActivations.push(consumed)
    const state = normalizeLower(consumed.state)
    if (state === TOOL_SURFACE_ACTIVATION_STATE.ACTIVE) activatedCapabilityIds.add(consumed.capabilityId)
    if (
      state === TOOL_SURFACE_ACTIVATION_STATE.BLOCKED
      || state === TOOL_SURFACE_ACTIVATION_STATE.UNAVAILABLE
    ) {
      activatedCapabilityIds.delete(consumed.capabilityId)
      blockedCapabilityIds.add(consumed.capabilityId)
    }
  }

  const activatedToolNames = []
  for (const capabilityId of activatedCapabilityIds) {
    for (const toolName of CAPABILITY_TOOL_NAMES_BY_ID.get(capabilityId) || []) {
      if (!hasTool(addom, toolName) || hasTool(tools, toolName)) continue
      tools[toolName] = addom[toolName]
      removedToolNames.delete(toolName)
      activatedToolNames.push(toolName)
      if (COMPACT_DELEGATION_TOOL_NAMES.includes(toolName) && hasTool(addom, RAW_DELEGATION_TOOL_NAME)) {
        nextExecutionMap[toolName] = RAW_DELEGATION_TOOL_NAME
      }
    }
  }

  const blockedToolNames = []
  for (const capabilityId of blockedCapabilityIds) {
    for (const toolName of CAPABILITY_TOOL_NAMES_BY_ID.get(capabilityId) || []) {
      if (!hasTool(tools, toolName)) continue
      delete tools[toolName]
      delete nextExecutionMap[toolName]
      blockedToolNames.push(toolName)
      if (hasTool(addom, toolName)) removedToolNames.add(toolName)
    }
  }

  if (activatedToolNames.length === 0 && blockedToolNames.length === 0 && consumedActivations.length === 0) {
    return source
  }

  if (blockedToolNames.length > 0) {
    for (const toolName of blockedToolNames) {
      excludedToolsWithReasons.push({
        toolName,
        reason: 'excluded_due_to_tool_surface_activation_status',
      })
    }
  }

  return {
    ...source,
    tools,
    toolExecutionMap: nextExecutionMap,
    removedAddomToolNames: normalizeToolNames([...removedToolNames]),
    excludedToolsWithReasons,
    toolSurfaceActivationRecords: consumedActivations,
    toolSurfaceActivatedCapabilities: [...activatedCapabilityIds].sort(),
    toolSurfaceBlockedCapabilities: [...blockedCapabilityIds].sort(),
    toolSurfaceActivationIncludedTools: normalizeToolNames(activatedToolNames),
    toolSurfaceVisibleCount: Object.keys(tools).length,
  }
}
