import {
  resolveAdapterToolSurfaceKind,
  resolveAdapterToolSurfaceMode,
} from '../api-clients/provider-model-adapters.mjs'
import {
  RAW_DELEGATION_TOOL_NAME,
  COMPACT_DELEGATION_TOOL_NAMES,
  hasExplicitDelegationRequest,
} from './delegation-tool-surface.mjs'
import {
  buildBaseSelection,
  normalizeAdapterProfile,
  normalizeToolMap,
  normalizeToolNames,
  omitToolsByName,
  removeVisibleTools,
} from './tool-surface-selection-helpers.mjs'
export { applyProviderPromptBudgetToolSurface } from './tool-surface-budget-policy.mjs'

const ADDOM_OVERLAPPING_COMMAND_TOOL_NAMES = new Set([
  'run_command',
])
const ADDOM_OVERLAPPING_FETCH_TOOL_NAMES = new Set([
  'fetch_page',
])
const ADDOM_OVERLAPPING_FILE_CHANGE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'apply_patch',
  'delete_file',
  'rename_file',
  'create_directory',
  'rollback_file',
  'apply_artifact_revision',
])
const OPENAI_LOCAL_SKILL_TOOL_NAMES = new Set([
  'list_curated_skills',
  'install_curated_skill',
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

function applyReliabilityWeightedWriteGatingToSelection(
  selection,
  {
    reliabilityProfile = null,
    shadowIntent = null,
    addomTools = {},
    userMessage = '',
  } = {},
) {
  const source = selection && typeof selection === 'object' ? selection : buildBaseSelection({})
  const patchExposure = String(reliabilityProfile?.patchExposure || '').trim().toLowerCase()
  const intent = String(shadowIntent?.intent || '').trim().toLowerCase()
  const userText = String(userMessage || '').trim().toLowerCase()
  const tools = normalizeToolMap(source.tools)
  if (!tools.apply_patch) return source
  if (!['restricted', 'disabled'].includes(patchExposure)) return source
  if (!['targeted_edit', 'full_rewrite'].includes(intent)) return source
  if (/\bapply_patch\b/.test(userText) || /\bapply patch\b/.test(userText)) return source

  const hasSaferWritePath = Boolean(tools.edit_file || tools.write_file)
  if (!hasSaferWritePath && patchExposure !== 'disabled') return source

  const nextTools = { ...tools }
  delete nextTools.apply_patch

  const addomToolNames = new Set(Object.keys(normalizeToolMap(addomTools)))
  const removedAddomToolNames = addomToolNames.has('apply_patch')
    ? normalizeToolNames([...(source.removedAddomToolNames || []), 'apply_patch'])
    : normalizeToolNames(source.removedAddomToolNames || [])

  return {
    ...source,
    tools: nextTools,
    removedAddomToolNames,
    excludedToolsWithReasons: [
      ...(Array.isArray(source.excludedToolsWithReasons) ? source.excludedToolsWithReasons : []),
      {
        toolName: 'apply_patch',
        reason: 'excluded_due_to_reliability_weighted_patch_gating',
      },
    ],
  }
}

function shouldExposeLocalSkillTools(adapterProfile = {}) {
  const profile = normalizeAdapterProfile(adapterProfile)
  const providerId = String(profile?.providerId || '').trim().toLowerCase()
  const authMethod = String(
    profile?.openaiRuntimeSupport?.authMethod
    || profile?.authMethod
    || 'api_key',
  ).trim().toLowerCase() || 'api_key'
  const toolSurfaceMode = resolveAdapterToolSurfaceMode(profile)
  if (toolSurfaceMode === 'addom_native') return true
  return providerId === 'openai'
    && authMethod !== 'account'
    && toolSurfaceMode === 'openai_hosted'
}

function applyOpenAILocalSkillToolGating(selection = {}, {
  adapterProfile = {},
  addomTools = {},
} = {}) {
  const source = selection && typeof selection === 'object' ? selection : buildBaseSelection(addomTools)
  if (shouldExposeLocalSkillTools(adapterProfile)) {
    return source
  }
  return removeVisibleTools(source, {
    blockedToolNames: OPENAI_LOCAL_SKILL_TOOL_NAMES,
    addomTools,
    exclusionReason: 'excluded_due_to_local_skill_parity_gate',
  })
}

export function applyTerminalSessionRuntimeGating(selection = {}, {
  addomTools = {},
  terminalSessionRuntimeHealth = null,
} = {}) {
  const source = selection && typeof selection === 'object' ? selection : buildBaseSelection(addomTools)
  const runtime = terminalSessionRuntimeHealth && typeof terminalSessionRuntimeHealth === 'object'
    ? terminalSessionRuntimeHealth
    : null
  const status = String(runtime?.status || '').trim().toLowerCase()
  if (status === 'supported') return source
  return removeVisibleTools(source, {
    blockedToolNames: TERMINAL_SESSION_TOOL_NAMES,
    addomTools,
    exclusionReason: runtime
      ? `excluded_due_to_terminal_runtime_${status || 'unavailable'}`
      : 'excluded_due_to_terminal_runtime_unavailable',
  })
}

export function applyConservativeIntentNarrowing(selection = {}, {
  shadowIntent = null,
  addomTools = {},
  userMessage = '',
  history = [],
} = {}) {
  const source = selection && typeof selection === 'object' ? selection : buildBaseSelection(addomTools)
  const confidence = String(shadowIntent?.confidence || '').trim().toLowerCase()
  const intent = String(shadowIntent?.intent || '').trim().toLowerCase()
  if (confidence !== 'medium' || !intent || intent === 'mixed') return source
  const explicitDelegationRequest = hasExplicitDelegationRequest({ userMessage, history })

  const policyByIntent = {
    exploration_only: [],
    targeted_edit: [],
    full_rewrite: [],
    command_execution: [],
    web_research: [],
    browser_interaction: [],
    delegation: [],
  }
  const blockedToolNames = new Set(policyByIntent[intent] || [])
  if (intent !== 'delegation' && !explicitDelegationRequest) {
    if (Object.prototype.hasOwnProperty.call(source.tools || {}, RAW_DELEGATION_TOOL_NAME)) {
      blockedToolNames.add(RAW_DELEGATION_TOOL_NAME)
    }
  }

  const preferredByIntent = {
    exploration_only: ['read_file', 'view_file_range', 'grep_file', 'search_code', 'find_files', 'list_directory'],
    targeted_edit: ['read_file', 'view_file_range', 'edit_file', 'write_file'],
    full_rewrite: ['read_file', 'view_file_range', 'write_file'],
    command_execution: ['run_command'],
    web_research: ['fetch_page'],
    browser_interaction: ['browser_action'],
    delegation: [RAW_DELEGATION_TOOL_NAME, ...COMPACT_DELEGATION_TOOL_NAMES],
  }
  const preferredVisible = (preferredByIntent[intent] || []).some((toolName) => Object.prototype.hasOwnProperty.call(source.tools || {}, toolName))
  if (!preferredVisible) return source

  return removeVisibleTools(source, {
    blockedToolNames,
    addomTools,
    exclusionReason: `excluded_due_to_conservative_intent_narrowing_${intent}`,
  })
}

export function applyDelegationEntryPointCollapse(selection = {}, {
  addomTools = {},
} = {}) {
  const source = selection && typeof selection === 'object' ? selection : buildBaseSelection(addomTools)
  const tools = normalizeToolMap(source.tools)
  const addom = normalizeToolMap(addomTools)
  const rawVisible = Boolean(tools[RAW_DELEGATION_TOOL_NAME])
  const availableAliases = COMPACT_DELEGATION_TOOL_NAMES.filter((toolName) => Boolean(tools[toolName] && addom[toolName]))
  if (!rawVisible && availableAliases.length === 0) return source
  const nextTools = { ...tools }
  const nextExecutionMap = {
    ...(source.toolExecutionMap && typeof source.toolExecutionMap === 'object' ? source.toolExecutionMap : {}),
  }
  const excludedToolsWithReasons = [
    ...(Array.isArray(source.excludedToolsWithReasons) ? source.excludedToolsWithReasons : []),
  ]
  const removedToolNames = [...(source.removedAddomToolNames || [])]

  for (const toolName of availableAliases) {
    nextExecutionMap[toolName] = RAW_DELEGATION_TOOL_NAME
  }
  delete nextTools[RAW_DELEGATION_TOOL_NAME]
  if (Object.prototype.hasOwnProperty.call(addom, RAW_DELEGATION_TOOL_NAME)) {
    removedToolNames.push(RAW_DELEGATION_TOOL_NAME)
    excludedToolsWithReasons.push({
      toolName: RAW_DELEGATION_TOOL_NAME,
      reason: 'excluded_due_to_compact_delegation_entry_point',
    })
  }

  return {
    ...source,
    tools: nextTools,
    removedAddomToolNames: normalizeToolNames(removedToolNames),
    excludedToolsWithReasons,
    toolExecutionMap: nextExecutionMap,
  }
}

function resolveOpenAICodexLocalSurface(addomTools = {}) {
  const addom = normalizeToolMap(addomTools)
  return {
    tools: addom,
    toolSurfaceKind: 'openai_codex_local',
    toolSurfaceComponents: ['openai_codex_local'],
    mixedToolSurfaceDetected: false,
    removedAddomToolNames: [],
    excludedToolsWithReasons: [],
    toolExecutionMap: {},
  }
}

function resolveProviderShellAlias(providerTools = {}) {
  const provider = normalizeToolMap(providerTools)
  if (provider.shell) {
    return {
      visibleToolName: 'run_command',
      backendToolName: 'shell',
      definition: provider.shell,
      exclusionReason: 'excluded_due_to_provider_hosted_shell_alias',
    }
  }
  return null
}

function resolveProviderFetchAlias(providerTools = {}, toolSurfaceKind = '') {
  const provider = normalizeToolMap(providerTools)
  if (provider.web_search) {
    return {
      visibleToolName: 'fetch_page',
      backendToolName: 'web_search',
      definition: provider.web_search,
      exclusionReason: 'excluded_due_to_provider_hosted_web_alias',
    }
  }
  if (
    String(toolSurfaceKind || '').trim().toLowerCase() === 'moonshot_formula'
  ) {
    const providerEntries = Object.entries(provider)
    if (providerEntries.length === 1) {
      const [toolName, definition] = providerEntries[0]
      if (String(toolName || '').trim().toLowerCase().endsWith('__web_search__search')) {
        return {
          visibleToolName: 'fetch_page',
          backendToolName: String(toolName || '').trim(),
          definition,
          exclusionReason: 'excluded_due_to_provider_native_fetch_alias',
        }
      }
    }
  }
  return null
}

function resolveOpenAISurface(addomTools = {}, providerTools = {}, toolSurfaceKind = 'openai_hosted') {
  const addom = normalizeToolMap(addomTools)
  const provider = normalizeToolMap(providerTools)
  const providerToolNames = Object.keys(provider)
  if (providerToolNames.length === 0) {
    return buildBaseSelection(addom)
  }

  const providerToolSet = new Set(providerToolNames.map((name) => String(name || '').trim().toLowerCase()))
  const hasLocalShell = providerToolSet.has('local_shell')
  const shellAlias = resolveProviderShellAlias(provider)
  const fetchAlias = resolveProviderFetchAlias(provider, toolSurfaceKind)

  let blockedToolNames = new Set()
  if (hasLocalShell) {
    for (const toolName of ADDOM_OVERLAPPING_COMMAND_TOOL_NAMES) {
      blockedToolNames.add(toolName)
    }
  } else if (shellAlias) {
    for (const toolName of ADDOM_OVERLAPPING_COMMAND_TOOL_NAMES) {
      blockedToolNames.add(toolName)
    }
  }
  if (fetchAlias) {
    for (const toolName of ADDOM_OVERLAPPING_FETCH_TOOL_NAMES) {
      blockedToolNames.add(toolName)
    }
  }

  const filteredAddom = omitToolsByName(addom, blockedToolNames)
  const normalizedProvider = { ...provider }
  const toolExecutionMap = {}
  if (shellAlias) {
    delete normalizedProvider[shellAlias.backendToolName]
    normalizedProvider[shellAlias.visibleToolName] = shellAlias.definition
    toolExecutionMap[shellAlias.visibleToolName] = shellAlias.backendToolName
  }
  if (fetchAlias) {
    delete normalizedProvider[fetchAlias.backendToolName]
    normalizedProvider[fetchAlias.visibleToolName] = fetchAlias.definition
    toolExecutionMap[fetchAlias.visibleToolName] = fetchAlias.backendToolName
  }
  const excludedToolsWithReasons = filteredAddom.removedToolNames.map((toolName) => ({
    toolName,
    reason: hasLocalShell && ADDOM_OVERLAPPING_COMMAND_TOOL_NAMES.has(toolName)
      ? 'excluded_due_to_openai_local_shell_overlap'
      : shellAlias && ADDOM_OVERLAPPING_COMMAND_TOOL_NAMES.has(toolName)
        ? shellAlias.exclusionReason
        : fetchAlias && ADDOM_OVERLAPPING_FETCH_TOOL_NAMES.has(toolName)
          ? fetchAlias.exclusionReason
      : 'excluded_due_to_openai_local_runtime_overlap',
  }))
  return {
    tools: {
      ...filteredAddom.tools,
      ...normalizedProvider,
    },
    toolSurfaceKind,
    toolSurfaceComponents: [
      toolSurfaceKind,
    ],
    mixedToolSurfaceDetected: false,
    removedAddomToolNames: normalizeToolNames(filteredAddom.removedToolNames),
    excludedToolsWithReasons,
    toolExecutionMap,
  }
}

function resolveProviderNativeOverlaySurface(addomTools = {}, providerTools = {}, toolSurfaceKind = 'provider_native') {
  const addom = normalizeToolMap(addomTools)
  const provider = normalizeToolMap(providerTools)
  const providerToolNames = Object.keys(provider)
  if (providerToolNames.length === 0) {
    return buildBaseSelection(addom)
  }
  const fetchAlias = resolveProviderFetchAlias(provider, toolSurfaceKind)
  const blockedToolNames = new Set()
  if (fetchAlias) {
    for (const toolName of ADDOM_OVERLAPPING_FETCH_TOOL_NAMES) {
      blockedToolNames.add(toolName)
    }
  }
  const filteredAddom = omitToolsByName(addom, blockedToolNames)
  const normalizedProvider = { ...provider }
  const toolExecutionMap = {}
  if (fetchAlias) {
    delete normalizedProvider[fetchAlias.backendToolName]
    normalizedProvider[fetchAlias.visibleToolName] = fetchAlias.definition
    toolExecutionMap[fetchAlias.visibleToolName] = fetchAlias.backendToolName
  }
  return {
    tools: {
      ...filteredAddom.tools,
      ...normalizedProvider,
    },
    toolSurfaceKind,
    toolSurfaceComponents: [toolSurfaceKind],
    mixedToolSurfaceDetected: false,
    removedAddomToolNames: normalizeToolNames(filteredAddom.removedToolNames),
    excludedToolsWithReasons: filteredAddom.removedToolNames.map((toolName) => ({
      toolName,
      reason: fetchAlias && ADDOM_OVERLAPPING_FETCH_TOOL_NAMES.has(toolName)
        ? fetchAlias.exclusionReason
        : 'excluded_due_to_provider_native_overlap',
    })),
    toolExecutionMap,
  }
}

function resolveProviderOwnedRuntimeSurface(addomTools = {}, toolSurfaceKind = 'provider_owned_runtime') {
  const base = buildBaseSelection(addomTools)
  return {
    ...base,
    toolSurfaceKind,
    toolSurfaceComponents: [toolSurfaceKind],
    toolExecutionMap: {},
  }
}

function resolveOpenAIAccountProviderOwnedRuntimeSurface(adapterProfile = {}, addomTools = {}, providerTools = {}) {
  const profile = normalizeAdapterProfile(adapterProfile)
  const exposedProviderTools = normalizeToolMap(providerTools)
  const providerToolNames = new Set(
    Object.keys(exposedProviderTools).map((name) => String(name || '').trim().toLowerCase()).filter(Boolean),
  )
  const blockedToolNames = new Set()
  const reasonByToolName = new Map()

  // Only suppress overlapping local tools when this turn actually exposes a provider-side replacement.
  if (providerToolNames.has('shell') || providerToolNames.has('local_shell')) {
    for (const toolName of ADDOM_OVERLAPPING_COMMAND_TOOL_NAMES) {
      blockedToolNames.add(toolName)
      reasonByToolName.set(toolName, 'excluded_due_to_openai_account_native_command_execution')
    }
  }
  if (providerToolNames.has('web_search')) {
    for (const toolName of ADDOM_OVERLAPPING_FETCH_TOOL_NAMES) {
      blockedToolNames.add(toolName)
      reasonByToolName.set(toolName, 'excluded_due_to_openai_account_native_web_search')
    }
  }
  if (providerToolNames.has('apply_patch')) {
    for (const toolName of ADDOM_OVERLAPPING_FILE_CHANGE_TOOL_NAMES) {
      blockedToolNames.add(toolName)
      reasonByToolName.set(toolName, 'excluded_due_to_openai_account_native_file_change')
    }
  }

  const filtered = omitToolsByName(addomTools, blockedToolNames)
  const toolSurfaceKind = String(
    profile?.openaiRuntimeSupport?.providerNativeRuntimeFamily
    || profile?.providerNativeRuntime?.family
    || 'openai_codex_app_server',
  ).trim().toLowerCase() || 'openai_codex_app_server'

  return {
    tools: filtered.tools,
    toolSurfaceKind,
    toolSurfaceComponents: ['provider_owned_runtime'],
    mixedToolSurfaceDetected: false,
    removedAddomToolNames: normalizeToolNames(filtered.removedToolNames),
    excludedToolsWithReasons: filtered.removedToolNames.map((toolName) => ({
      toolName,
      reason: reasonByToolName.get(toolName) || 'excluded_due_to_provider_native_overlap',
    })),
    toolExecutionMap: {},
  }
}

export function resolveProviderToolSurface({
  adapterProfile = {},
  addomTools = {},
  providerTools = {},
} = {}) {
  const profile = normalizeAdapterProfile(adapterProfile)
  const providerToolNames = Object.keys(normalizeToolMap(providerTools))
  const surfaceMode = resolveAdapterToolSurfaceMode(profile)
  const toolSurfaceKind = resolveAdapterToolSurfaceKind(profile, providerToolNames)

  let selection = null
  if (surfaceMode === 'openai_codex_local') {
    selection = resolveOpenAICodexLocalSurface(addomTools)
  } else if (surfaceMode === 'openai_hosted') {
    selection = resolveOpenAISurface(addomTools, providerTools, toolSurfaceKind)
  } else if (surfaceMode === 'remote_tool_bundle' && toolSurfaceKind !== 'addom_native') {
    selection = resolveProviderNativeOverlaySurface(addomTools, providerTools, toolSurfaceKind)
  } else if (surfaceMode === 'provider_owned_runtime' && toolSurfaceKind !== 'addom_native') {
    if (
      String(profile?.providerId || '').trim().toLowerCase() === 'openai'
      && String(profile?.openaiRuntimeSupport?.authMethod || profile?.authMethod || '').trim().toLowerCase() === 'account'
    ) {
      selection = resolveOpenAIAccountProviderOwnedRuntimeSurface(profile, addomTools, providerTools)
    } else {
      selection = resolveProviderOwnedRuntimeSurface(addomTools, toolSurfaceKind)
    }
  } else {
    selection = buildBaseSelection(addomTools)
  }
  return applyOpenAILocalSkillToolGating(selection, {
    adapterProfile: profile,
    addomTools,
  })
}

export function applyReliabilityWeightedWriteGating(selection, options = {}) {
  return applyReliabilityWeightedWriteGatingToSelection(selection, options)
}
