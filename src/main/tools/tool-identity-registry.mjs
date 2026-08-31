import { isSupportedOpenAIHostedToolId } from '../../common/api-clients/openai-hosted-tool-catalog.mjs'
import { isOpenAILocalRuntimeToolName } from '../api-clients/openai-local-runtime-tools.mjs'

const BASE_TOOL_IDENTITIES = Object.freeze({
  read_file: { canonicalToolName: 'read_file', family: 'file_read', label: 'Read File', risk: 'low' },
  view_file_range: { canonicalToolName: 'view_file_range', family: 'file_read', label: 'View File Range', risk: 'low' },
  grep_file: { canonicalToolName: 'grep_file', family: 'file_read', label: 'Grep File', risk: 'low' },
  search_code: { canonicalToolName: 'search_code', family: 'file_read', label: 'Search Code', risk: 'low' },
  find_files: { canonicalToolName: 'find_files', family: 'file_read', label: 'Find Files', risk: 'low' },
  list_directory: { canonicalToolName: 'list_directory', family: 'file_read', label: 'List Directory', risk: 'low' },
  write_file: { canonicalToolName: 'write_file', family: 'file_write', label: 'Write File', risk: 'high' },
  edit_file: { canonicalToolName: 'edit_file', family: 'file_write', label: 'Edit File', risk: 'high' },
  file_change: { canonicalToolName: 'file_change', family: 'file_write', label: 'Review File Changes', risk: 'high' },
  apply_patch: { canonicalToolName: 'apply_patch', family: 'file_write', label: 'Apply Patch', risk: 'critical' },
  delete_file: { canonicalToolName: 'delete_file', family: 'file_write', label: 'Delete File', risk: 'high' },
  rename_file: { canonicalToolName: 'rename_file', family: 'file_write', label: 'Rename File', risk: 'high' },
  create_directory: { canonicalToolName: 'create_directory', family: 'file_write', label: 'Create Directory', risk: 'high' },
  rollback_file: { canonicalToolName: 'rollback_file', family: 'file_write', label: 'Rollback File', risk: 'high' },
  apply_artifact_revision: { canonicalToolName: 'apply_artifact_revision', family: 'file_write', label: 'Apply Artifact Revision', risk: 'high' },
  fetch_page: { canonicalToolName: 'fetch_page', family: 'web_fetch', label: 'Fetch Web Page', risk: 'medium' },
  browser_action: { canonicalToolName: 'browser_action', family: 'browser', label: 'Browser Action', risk: 'medium' },
  run_command: { canonicalToolName: 'run_command', family: 'shell', label: 'Run Command', risk: 'critical' },
  local_shell: { canonicalToolName: 'run_command', family: 'shell', label: 'Run Command', risk: 'critical' },
  terminal_session_list: { canonicalToolName: 'terminal_session_list', family: 'terminal_session', label: 'List Terminal Sessions', risk: 'low' },
  terminal_session_open: { canonicalToolName: 'terminal_session_open', family: 'terminal_session', label: 'Open Terminal Session', risk: 'critical' },
  terminal_session_read_snapshot: { canonicalToolName: 'terminal_session_read_snapshot', family: 'terminal_session', label: 'Read Terminal Snapshot', risk: 'medium' },
  terminal_session_wait_for_output: { canonicalToolName: 'terminal_session_wait_for_output', family: 'terminal_session', label: 'Wait For Terminal Output', risk: 'medium' },
  terminal_session_attach: { canonicalToolName: 'terminal_session_attach', family: 'terminal_session', label: 'Attach Terminal Session', risk: 'medium' },
  terminal_session_write: { canonicalToolName: 'terminal_session_write', family: 'terminal_session', label: 'Write Terminal Session', risk: 'critical' },
  terminal_session_resize: { canonicalToolName: 'terminal_session_resize', family: 'terminal_session', label: 'Resize Terminal Session', risk: 'low' },
  terminal_session_signal: { canonicalToolName: 'terminal_session_signal', family: 'terminal_session', label: 'Signal Terminal Session', risk: 'high' },
  terminal_session_close: { canonicalToolName: 'terminal_session_close', family: 'terminal_session', label: 'Close Terminal Session', risk: 'high' },
  delegate_to_agents: { canonicalToolName: 'delegate_to_agents', family: 'delegation', label: 'Delegate to Agents', risk: 'low' },
  delegate_tasks: { canonicalToolName: 'delegate_to_agents', family: 'delegation', label: 'Delegate Tasks', risk: 'low' },
  agent_catalog: { canonicalToolName: 'agent_catalog', family: 'agent_catalog', label: 'Agent Catalog', risk: 'low' },
  plan_read: { canonicalToolName: 'plan_read', family: 'planning', label: 'Read Plan State', risk: 'low' },
  plan_update: { canonicalToolName: 'plan_update', family: 'planning', label: 'Update Plan', risk: 'low' },
  plan_direction_update: { canonicalToolName: 'plan_direction_update', family: 'planning', label: 'Set Plan Direction', risk: 'low' },
  plan_direction_finalize: { canonicalToolName: 'plan_direction_finalize', family: 'planning', label: 'Finalize Plan Direction', risk: 'low' },
  plan_document_write: { canonicalToolName: 'plan_document_write', family: 'planning', label: 'Write Managed Plan Document', risk: 'low' },
  planning_skill_read: { canonicalToolName: 'planning_skill_read', family: 'planning', label: 'Read Planning Skill', risk: 'low' },
  todo_read: { canonicalToolName: 'plan_read', family: 'planning', label: 'Read Plan State', risk: 'low' },
  todo_write: { canonicalToolName: 'plan_update', family: 'planning', label: 'Update Plan', risk: 'low' },
  question_user: { canonicalToolName: 'question_user', family: 'question', label: 'Ask User Question', risk: 'low' },
  terminal_memory_suggest: { canonicalToolName: 'terminal_memory_suggest', family: 'terminal_memory', label: 'Suggest Terminal Memory', risk: 'low' },
  list_curated_skills: { canonicalToolName: 'list_curated_skills', family: 'skill', label: 'List Curated Skills', risk: 'medium' },
  install_curated_skill: { canonicalToolName: 'install_curated_skill', family: 'skill', label: 'Install Curated Skill', risk: 'medium' },
  git_status: { canonicalToolName: 'git_status', family: 'git', label: 'Git Status', risk: 'low' },
  git_diff: { canonicalToolName: 'git_diff', family: 'git', label: 'Git Diff', risk: 'low' },
  git_log: { canonicalToolName: 'git_log', family: 'git', label: 'Git Log', risk: 'low' },
  git_commit: { canonicalToolName: 'git_commit', family: 'git', label: 'Git Commit', risk: 'high' },
  git_checkout_file: { canonicalToolName: 'git_checkout_file', family: 'git', label: 'Git Checkout File', risk: 'high' },
  webSearch: { canonicalToolName: 'web_search', family: 'web_fetch', label: 'Web Search', risk: 'medium' },
  imageView: { canonicalToolName: 'image_view', family: 'image_view', label: 'View Image', risk: 'low' },
  commandExecution: { canonicalToolName: 'command_execution', family: 'shell', label: 'Run Command', risk: 'critical' },
  fileChange: { canonicalToolName: 'file_change', family: 'file_write', label: 'Review File Changes', risk: 'high' },
  imageGeneration: { canonicalToolName: 'image_generation', family: 'image_generation', label: 'Generate Image', risk: 'high' },
})

function normalizeName(value = '') {
  return String(value || '').trim()
}

function cloneIdentity(source = {}) {
  return { ...source }
}

function buildDefaultIdentity(toolName = '') {
  const visibleToolName = normalizeName(toolName)
  return {
    visibleToolName,
    canonicalToolName: visibleToolName,
    family: 'other',
    label: visibleToolName,
    risk: 'low',
    backendToolName: visibleToolName,
    backendFamily: '',
    executionRuntime: 'addom_native',
  }
}

function resolveProviderNativeIdentity(toolName = '', providerToolExecutionContext = null) {
  const visibleToolName = normalizeName(toolName)
  const toolMap = providerToolExecutionContext?.toolMap instanceof Map
    ? providerToolExecutionContext.toolMap
    : null
  const mapping = toolMap?.get(visibleToolName) || null
  const providerNativeFamily = normalizeName(providerToolExecutionContext?.family).toLowerCase()
  if (!mapping && !providerNativeFamily) return null

  if (providerNativeFamily === 'moonshot_formula' && String(mapping?.originalToolName || '').trim().toLowerCase() === 'search') {
    return {
      visibleToolName,
      canonicalToolName: 'fetch_page',
      family: 'web_fetch',
      label: 'Fetch Web Page',
      risk: 'medium',
      backendToolName: visibleToolName,
      backendFamily: providerNativeFamily,
      executionRuntime: 'provider_native',
    }
  }

  return {
    visibleToolName,
    canonicalToolName: visibleToolName,
    family: providerNativeFamily || 'provider_native',
    label: visibleToolName,
    risk: 'low',
    backendToolName: visibleToolName,
    backendFamily: providerNativeFamily,
    executionRuntime: 'provider_native',
  }
}

export function resolveToolIdentity(toolName = '', {
  providerToolExecutionContext = null,
  backendToolNameOverride = '',
} = {}) {
  const visibleToolName = normalizeName(toolName)
  if (!visibleToolName) return buildDefaultIdentity('')
  const backendToolName = normalizeName(backendToolNameOverride)
  if (backendToolName && backendToolName !== visibleToolName) {
    const visibleBase = BASE_TOOL_IDENTITIES[visibleToolName]
    const backendIdentity = resolveToolIdentity(backendToolName, {
      providerToolExecutionContext,
    })
    if (visibleBase) {
      return {
        visibleToolName,
        ...cloneIdentity(visibleBase),
        backendToolName,
        backendFamily: backendIdentity.backendFamily || backendIdentity.family || '',
        executionRuntime: backendIdentity.executionRuntime || 'addom_native',
      }
    }
    return {
      ...backendIdentity,
      visibleToolName,
      backendToolName,
    }
  }

  const providerNativeIdentity = resolveProviderNativeIdentity(visibleToolName, providerToolExecutionContext)
  if (providerNativeIdentity) return providerNativeIdentity

  const base = BASE_TOOL_IDENTITIES[visibleToolName]
  if (base) {
    return {
      visibleToolName,
      ...cloneIdentity(base),
      backendToolName: visibleToolName,
      backendFamily: '',
      executionRuntime: isOpenAILocalRuntimeToolName(visibleToolName) ? 'openai_local_runtime' : 'addom_native',
    }
  }

  if (visibleToolName === 'shell') {
    return {
      visibleToolName,
      canonicalToolName: 'run_command',
      family: 'shell',
      label: 'Run Command',
      risk: 'critical',
      backendToolName: visibleToolName,
      backendFamily: 'openai_hosted',
      executionRuntime: 'provider_hosted',
    }
  }

  if (visibleToolName === 'web_search') {
    return {
      visibleToolName,
      canonicalToolName: 'fetch_page',
      family: 'web_fetch',
      label: 'Fetch Web Page',
      risk: 'medium',
      backendToolName: visibleToolName,
      backendFamily: 'openai_hosted',
      executionRuntime: 'provider_hosted',
    }
  }

  if (isSupportedOpenAIHostedToolId(visibleToolName) || /^mcp_/i.test(visibleToolName)) {
    return {
      visibleToolName,
      canonicalToolName: visibleToolName,
      family: 'provider_hosted',
      label: visibleToolName,
      risk: 'medium',
      backendToolName: visibleToolName,
      backendFamily: 'openai_hosted',
      executionRuntime: 'provider_hosted',
    }
  }

  return buildDefaultIdentity(visibleToolName)
}

export function buildToolIdentityMap(toolNames = [], options = {}) {
  const toolBackendNameMap = options?.toolBackendNameMap && typeof options.toolBackendNameMap === 'object'
    ? options.toolBackendNameMap
    : {}
  const out = {}
  for (const rawToolName of Array.isArray(toolNames) ? toolNames : []) {
    const toolName = normalizeName(rawToolName)
    if (!toolName) continue
    out[toolName] = resolveToolIdentity(toolName, {
      ...options,
      backendToolNameOverride: toolBackendNameMap[toolName],
    })
  }
  return out
}

export function getToolMetaFromIdentity(toolName = '', options = {}) {
  const identity = resolveToolIdentity(toolName, options)
  return {
    label: identity.label,
    risk: identity.risk,
  }
}
