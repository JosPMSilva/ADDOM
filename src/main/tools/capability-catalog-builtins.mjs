import { assertValidCapabilityCatalogEntry } from './capability-catalog-schema.mjs'
import {
  buildCapabilityCatalogPages,
  buildCapabilityCatalogPath,
  assertCapabilityCatalogPageCaps,
} from './capability-catalog-builder.mjs'
import { BASE_TOOLS } from './tool-definitions-base.mjs'
import { TERMINAL_SESSION_TOOLS } from './tool-definitions-terminal.mjs'
import { resolveToolIdentity } from './tool-identity-registry.mjs'

const RISK_RANK = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
})

const DEFAULT_VISIBLE_TOOLS = new Set([
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
  'plan_read',
  'plan_update',
  'question_user',
  'git_status',
])

const RECOVERY_ACTIVATED_TOOLS = new Set([
  'apply_patch',
  'apply_artifact_revision',
  'terminal_memory_suggest',
])

const FAMILY_CONFIGS = Object.freeze([
  {
    key: 'files',
    identityFamilies: ['file_read', 'file_write'],
    title: 'Files',
    summary: 'Read, search, edit, write, patch, move, delete, and review workspace files.',
    permissionClass: 'mixed',
    whenToUse: [
      'Inspect source before changing it.',
      'Apply targeted source edits or create files requested by the user.',
      'Search the workspace when exact paths are unknown.',
    ],
    whenNotToUse: [
      'Use shell tools for commands, tests, and scripts.',
      'Use Git tools for repository history, status, or commits.',
    ],
    examples: [{ title: 'Inspect then edit', toolName: 'read_file', prompt: 'Read a file, then apply a focused edit.' }],
  },
  {
    key: 'shell',
    identityFamilies: ['shell'],
    title: 'Shell Commands',
    summary: 'Run bounded project-local commands for tests, builds, scripts, and diagnostics.',
    permissionClass: 'execute',
    whenToUse: ['Run project checks, tests, package scripts, or one-shot diagnostics.'],
    whenNotToUse: ['Use terminal sessions for long-running interactive workflows.'],
    examples: [{ title: 'Run tests', toolName: 'run_command', prompt: 'Run the relevant test command from the project root.' }],
  },
  {
    key: 'git',
    identityFamilies: ['git'],
    title: 'Git',
    summary: 'Inspect repository status, diffs, history, and perform explicit commit or checkout actions.',
    permissionClass: 'mixed',
    whenToUse: [
      'Check repository status before editing or closeout.',
      'Inspect diffs, history, commit, or restore files when explicitly needed.',
    ],
    whenNotToUse: ['Do not restore or commit files unless the user or workflow explicitly asks for it.'],
    examples: [{ title: 'Check status', toolName: 'git_status', prompt: 'Show current repository status.' }],
  },
  {
    key: 'browser',
    identityFamilies: ['browser'],
    title: 'Browser',
    summary: 'Drive an ADDOM-managed browser for local UI inspection, element discovery, select option discovery, interaction, screenshots, diagnostics, and accessibility evidence.',
    permissionClass: 'browser',
    whenToUse: [
      'Verify a frontend or interact with pages that require a real browser.',
      'Use inspect or find_elements before choosing selectors, and list_options before select_option when values are unknown.',
      'Read recent console messages or failed requests when debugging UI behavior.',
    ],
    whenNotToUse: ['Use fetch for static public documentation or source tools for code-only inspection.'],
    examples: [{ title: 'Inspect UI', toolName: 'browser_action', prompt: 'Open the local app, inspect the current view, and find the target element.' }],
  },
  {
    key: 'terminal-sessions',
    identityFamilies: ['terminal_session'],
    title: 'Terminal Sessions',
    summary: 'Open, inspect, reuse, write to, resize, signal, and close visible interactive terminal sessions.',
    permissionClass: 'mixed',
    whenToUse: ['Use for interactive prompts, long-running dev servers, REPLs, TUIs, and session continuity.'],
    whenNotToUse: ['Use shell commands for bounded non-interactive commands.'],
    examples: [{ title: 'Reuse terminal', toolName: 'terminal_session_list', prompt: 'List existing sessions before opening a new one.' }],
  },
  {
    key: 'skills',
    identityFamilies: ['skill'],
    title: 'Skills',
    summary: 'Discover and install locally supported curated skills through ADDOM-managed skill tooling.',
    permissionClass: 'mixed',
    whenToUse: ['List or install curated skills when the user asks for additional local capabilities.'],
    whenNotToUse: ['Do not install browser or screenshot skills to replace ADDOM browser automation.'],
    examples: [{ title: 'Find skills', toolName: 'list_curated_skills', prompt: 'List curated skills matching a requested capability.' }],
  },
  {
    key: 'delegation',
    identityFamilies: ['delegation', 'agent_catalog'],
    title: 'Delegation',
    summary: 'Delegate focused research, review, or implementation subtasks to configured background agents.',
    permissionClass: 'delegation',
    whenToUse: ['Use for genuinely parallel work with precise instructions and injected context.'],
    whenNotToUse: ['Do not delegate simple single-file edits, greetings, or underspecified tasks.'],
    examples: [{ title: 'Delegate review', toolName: 'delegate_tasks', prompt: 'Ask an agent to review injected code for a narrow risk.' }],
  },
  {
    key: 'planning',
    identityFamilies: ['planning'],
    title: 'Planning',
    summary: 'Read, shape, and write ADDOM-managed plans using bundled planning guidance.',
    permissionClass: 'planning',
    whenToUse: [
      'Research and shape implementation or investigation work that benefits from explicit task state.',
      'Read bundled planning guidance or write the managed Markdown plan for companion review.',
    ],
    whenNotToUse: ['Avoid plan churn for small one-step requests.'],
    examples: [{ title: 'Update plan', toolName: 'plan_update', prompt: 'Mark the current task complete and move the next task in progress.' }],
  },
  {
    key: 'question',
    identityFamilies: ['question'],
    title: 'User Questions',
    summary: 'Ask the user for structured clarification when progress requires a concrete answer.',
    permissionClass: 'question',
    whenToUse: ['Ask only when a reasonable assumption would be risky or impossible to validate locally.'],
    whenNotToUse: ['Do not ask for confirmation when repo context makes the next step clear.'],
    examples: [{ title: 'Clarify blocker', toolName: 'question_user', prompt: 'Ask for the missing decision needed before implementation can continue.' }],
  },
  {
    key: 'web-fetch',
    identityFamilies: ['web_fetch'],
    title: 'Web Fetch',
    summary: 'Fetch public HTTP or HTTPS pages for fresh documentation and corroborating web context.',
    permissionClass: 'network',
    whenToUse: ['Retrieve public documentation or current evidence when local knowledge may be stale.'],
    whenNotToUse: ['Use the browser for JavaScript-heavy pages, interactions, or screenshots.'],
    examples: [{ title: 'Fetch docs', toolName: 'fetch_page', prompt: 'Fetch official documentation needed for the task.' }],
  },
  {
    key: 'terminal-memory',
    identityFamilies: ['terminal_memory'],
    title: 'Terminal Memory',
    summary: 'Suggest a user-gated durable memory after closing a terminal session.',
    permissionClass: 'mixed',
    whenToUse: ['Suggest concise workspace-relevant memory after a terminal session has been closed.'],
    whenNotToUse: ['Never save memories automatically or include secrets, transcripts, or raw command logs.'],
    examples: [{ title: 'Suggest memory', toolName: 'terminal_memory_suggest', prompt: 'Suggest one durable insight after closing a session.' }],
  },
])

function listBuiltInToolDefinitions({ includeTerminalSessionTools = true } = {}) {
  return includeTerminalSessionTools
    ? [...BASE_TOOLS, ...TERMINAL_SESSION_TOOLS]
    : BASE_TOOLS
}

function resolveToolDefaultExposure(toolName = '') {
  if (DEFAULT_VISIBLE_TOOLS.has(toolName)) return 'default_visible'
  if (RECOVERY_ACTIVATED_TOOLS.has(toolName)) return 'recovery_activated'
  return 'intent_activated'
}

function resolveActivation(defaultExposure = '') {
  if (defaultExposure === 'default_visible') {
    return {
      state: 'active',
      reasons: ['default_core'],
      decay: 'active while the default tool surface includes this capability',
    }
  }
  if (defaultExposure === 'recovery_activated') {
    return {
      state: 'hidden_discoverable',
      reasons: ['catalog_read', 'strong_intent', 'hidden_known_recovery'],
      decay: 'hidden again after the relevant recovery or task need expires',
    }
  }
  return {
    state: 'hidden_discoverable',
    reasons: ['catalog_read', 'strong_intent', 'explicit_request'],
    decay: 'hidden again after the relevant task need expires',
  }
}

function resolveFamilyDefaultExposure(toolSummaries = []) {
  if (toolSummaries.some((tool) => tool.defaultExposure === 'default_visible')) return 'default_visible'
  if (toolSummaries.some((tool) => tool.defaultExposure === 'recovery_activated')) return 'recovery_activated'
  return 'intent_activated'
}

function resolveHighestRisk(toolSummaries = []) {
  return toolSummaries.reduce((highest, tool) => {
    const risk = tool.riskClass || 'low'
    return RISK_RANK[risk] > RISK_RANK[highest] ? risk : highest
  }, 'low')
}

function groupToolDefinitionsByFamily(toolDefinitions = []) {
  const grouped = new Map()
  for (const definition of toolDefinitions) {
    const name = String(definition?.name || '').trim()
    if (!name) continue
    const identity = resolveToolIdentity(name)
    const toolSummary = {
      name,
      label: identity.label || name,
      identityFamily: identity.family,
      canonicalToolName: identity.canonicalToolName || name,
      riskClass: identity.risk || 'low',
      defaultExposure: resolveToolDefaultExposure(name),
      summary: definition.description || identity.label || name,
    }
    const current = grouped.get(identity.family) || []
    current.push(toolSummary)
    grouped.set(identity.family, current)
  }
  return grouped
}

function buildFamilyEntry(config, groupedTools) {
  const toolSummaries = config.identityFamilies.flatMap((family) => groupedTools.get(family) || [])
  const defaultExposure = resolveFamilyDefaultExposure(toolSummaries)
  const entry = {
    id: `builtins.${config.key}`,
    slug: config.key,
    title: config.title,
    source: 'built_in',
    status: 'available',
    summary: config.summary,
    permissionClass: config.permissionClass,
    riskClass: resolveHighestRisk(toolSummaries),
    defaultExposure,
    activation: resolveActivation(defaultExposure),
    toolsAfterActivation: toolSummaries.map((tool) => tool.name),
    whenToUse: config.whenToUse,
    whenNotToUse: config.whenNotToUse,
    examples: config.examples,
    related: FAMILY_CONFIGS
      .filter((row) => row.key !== config.key)
      .slice(0, 4)
      .map((row) => `builtins.${row.key}`),
    provenance: {
      trust: 'curated',
      sourceFile: 'src/main/tools/tool-definitions*.mjs',
      notes: 'Generated from ADDOM built-in tool definitions and the tool identity registry.',
    },
    limits: {
      pagePath: buildCapabilityCatalogPath(config.key),
      maxPageChars: 6000,
    },
    toolSummaries,
  }
  return {
    ...assertValidCapabilityCatalogEntry(entry),
    slug: config.key,
    toolSummaries,
  }
}

export function buildBuiltInCapabilityEntries(options = {}) {
  const groupedTools = groupToolDefinitionsByFamily(listBuiltInToolDefinitions(options))
  return FAMILY_CONFIGS.map((config) => buildFamilyEntry(config, groupedTools))
}

export function buildBuiltInCapabilityCatalog(options = {}) {
  const entries = buildBuiltInCapabilityEntries(options)
  const pages = buildCapabilityCatalogPages(entries, options)
  assertCapabilityCatalogPageCaps(pages, options)
  return { entries, pages }
}

export function listBuiltInCapabilityToolSummaries(options = {}) {
  const groupedTools = groupToolDefinitionsByFamily(listBuiltInToolDefinitions(options))
  return FAMILY_CONFIGS.flatMap((config) => config.identityFamilies.flatMap((family) => groupedTools.get(family) || []))
}
