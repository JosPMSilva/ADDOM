export const OPENAI_HOSTED_TOOL_GROUP_ORDER = Object.freeze([
  'Remote Knowledge & Services',
  'Remote Execution',
  'Local Runtime',
])

export const OPENAI_MUTUALLY_EXCLUSIVE_TOOL_GROUPS = Object.freeze([
  Object.freeze(['code_interpreter', 'shell']),
])

const OPENAI_HOSTED_TOOL_CATALOG = Object.freeze([
  {
    id: 'web_search',
    label: 'Web search',
    group: 'Remote Knowledge & Services',
    riskLevel: 'medium',
    defaultEnabled: false,
    requiresRemoteExecution: true,
    description: 'Run OpenAI hosted web search and surface live citations from provider-side retrieval.',
  },
  {
    id: 'file_search',
    label: 'File search',
    group: 'Remote Knowledge & Services',
    riskLevel: 'medium',
    defaultEnabled: false,
    requiresRemoteExecution: true,
    requiresProjectVectorStore: true,
    description: 'Search uploaded OpenAI vector-store files for the active ADDOM project.',
  },
  {
    id: 'code_interpreter',
    label: 'Code interpreter',
    group: 'Remote Execution',
    riskLevel: 'high',
    defaultEnabled: false,
    requiresRemoteExecution: true,
    description: 'Execute Python and return logs or generated plots from OpenAI provider infrastructure.',
  },
  {
    id: 'image_generation',
    label: 'Image generation',
    group: 'Remote Execution',
    riskLevel: 'medium',
    defaultEnabled: false,
    requiresRemoteExecution: true,
    description: 'Generate images with OpenAI hosted image-generation tooling.',
  },
  {
    id: 'mcp',
    label: 'MCP',
    group: 'Remote Knowledge & Services',
    riskLevel: 'high',
    defaultEnabled: false,
    requiresRemoteExecution: true,
    description: 'Expose allowlisted third-party MCP tools through OpenAI Responses.',
  },
  {
    id: 'shell',
    label: 'Shell',
    group: 'Remote Execution',
    riskLevel: 'high',
    defaultEnabled: false,
    requiresRemoteExecution: true,
    description: 'Run OpenAI hosted shell/container commands on provider infrastructure.',
  },
  {
    id: 'apply_patch',
    label: 'Apply patch',
    group: 'Local Runtime',
    riskLevel: 'critical',
    defaultEnabled: false,
    requiresRemoteExecution: false,
    description: 'Let OpenAI propose structured local file patches that still require ADDOM approval before write.',
  },
])

function normalizeToolId(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
}

const OPENAI_SUPPORTED_TOOL_ID_SET = new Set(OPENAI_HOSTED_TOOL_CATALOG.map((entry) => entry.id))
const OPENAI_TOOL_GROUP_INDEX_BY_TOOL_ID = (() => {
  const out = new Map()
  for (let index = 0; index < OPENAI_MUTUALLY_EXCLUSIVE_TOOL_GROUPS.length; index += 1) {
    const group = OPENAI_MUTUALLY_EXCLUSIVE_TOOL_GROUPS[index]
    for (const toolId of group) {
      if (!out.has(toolId)) out.set(toolId, index)
    }
  }
  return out
})()

function normalizeEnabledOpenAIHostedToolIds(enabledHostedTools = [], { maxItems = 32 } = {}) {
  const source = Array.isArray(enabledHostedTools) ? enabledHostedTools : []
  const seen = new Set()
  const out = []
  for (const value of source) {
    if (out.length >= maxItems) break
    const toolId = normalizeToolId(value)
    if (!toolId || seen.has(toolId) || !OPENAI_SUPPORTED_TOOL_ID_SET.has(toolId)) continue
    seen.add(toolId)
    out.push(toolId)
  }
  return out
}

export function sanitizeOpenAIHostedToolIdsForMutualExclusion(
  enabledHostedTools = [],
  { maxItems = 32 } = {},
) {
  const normalized = normalizeEnabledOpenAIHostedToolIds(enabledHostedTools, { maxItems })
  const activatedGroups = new Set()
  const out = []
  for (const toolId of normalized) {
    const groupIndex = OPENAI_TOOL_GROUP_INDEX_BY_TOOL_ID.get(toolId)
    if (Number.isInteger(groupIndex)) {
      if (activatedGroups.has(groupIndex)) continue
      activatedGroups.add(groupIndex)
    }
    out.push(toolId)
  }
  return out
}

export function resolveOpenAIHostedToolBlockersByEnabled(enabledHostedTools = []) {
  const activeToolIds = sanitizeOpenAIHostedToolIdsForMutualExclusion(enabledHostedTools)
  const activeSet = new Set(activeToolIds)
  const blockers = {}

  for (const group of OPENAI_MUTUALLY_EXCLUSIVE_TOOL_GROUPS) {
    const normalizedGroup = Array.isArray(group)
      ? group.map((value) => normalizeToolId(value)).filter(Boolean)
      : []
    if (normalizedGroup.length < 2) continue

    const enabledToolId = normalizedGroup.find((toolId) => activeSet.has(toolId))
    if (!enabledToolId) continue

    for (const toolId of normalizedGroup) {
      if (toolId === enabledToolId) continue
      blockers[toolId] = enabledToolId
    }
  }

  return blockers
}

export function listOpenAIHostedToolCatalog() {
  return OPENAI_HOSTED_TOOL_CATALOG.map((entry) => ({ ...entry }))
}

export function getOpenAIHostedToolCatalogEntry(toolId = '') {
  const normalized = normalizeToolId(toolId)
  return OPENAI_HOSTED_TOOL_CATALOG.find((entry) => entry.id === normalized) || null
}

export function isSupportedOpenAIHostedToolId(toolId = '') {
  return !!getOpenAIHostedToolCatalogEntry(toolId)
}

export function listSupportedOpenAIHostedToolIds() {
  return [...OPENAI_SUPPORTED_TOOL_ID_SET]
}
