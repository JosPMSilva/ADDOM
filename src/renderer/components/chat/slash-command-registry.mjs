const BASE_SLASH_COMMANDS = Object.freeze([
  {
    id: 'compact',
    label: '/compact',
    description: 'Force a manual compaction turn.',
    category: 'Context',
    aliases: ['compact', 'manual compact', 'summarize context'],
    insertText: '/compact ',
    example: '/compact :: Continue the task with the compressed context',
  },
  {
    id: 'compact-threshold',
    label: '/compact-threshold',
    description: 'Force server-side compaction with a token override.',
    category: 'Context',
    aliases: ['compact threshold', 'threshold compact', 'server compact'],
    insertText: '/compact-threshold 180000 :: ',
    example: '/compact-threshold 180000 :: Continue the investigation',
  },
  {
    id: 'agent',
    label: '/agent',
    description: 'Send a task to one configured MoA agent role.',
    category: 'Agents',
    aliases: ['single agent', 'delegate one agent'],
    insertText: '/agent <role> :: ',
    example: '/agent Security Reviewer :: Audit the auth flow',
  },
  {
    id: 'agents',
    label: '/agents',
    description: 'Fan a task out to multiple configured MoA agent roles.',
    category: 'Agents',
    aliases: ['fanout agents', 'multi agent', 'delegate many agents'],
    insertText: '/agents <role1>, <role2> :: ',
    example: '/agents Security Reviewer, Performance Analyst :: Review this module',
  },
  {
    id: 'createrole',
    label: '/createrole',
    description: 'Generate a new MoA role definition from a prompt.',
    category: 'Agents',
    aliases: ['create role', 'new role', 'generate role'],
    insertText: '/createrole ',
    example: '/createrole UI reviewer for React dashboards',
  },
  {
    id: 'dispatch',
    label: '/dispatch',
    description: 'Decompose a task and route it across MoA roles.',
    category: 'Agents',
    aliases: ['dispatch', 'decompose task', 'fanout work'],
    insertText: '/dispatch ',
    example: '/dispatch Review the auth module for security and performance',
  },
  {
    id: 'pipeline',
    label: '/pipeline',
    description: 'List or execute a configured pipeline.',
    category: 'Automation',
    aliases: ['pipeline list', 'run pipeline', 'workflow'],
    insertText: '/pipeline ',
    example: '/pipeline list',
  },
  {
    id: 'council',
    label: '/council',
    description: 'Run an LLM Council session and synthesize the outputs.',
    category: 'Agents',
    aliases: ['council', 'consensus', 'multi model'],
    insertText: '/council ',
    example: '/council Review the auth module for vulnerabilities',
  },
  {
    id: 'review',
    label: '/review',
    description: 'Run the comprehensive code review pipeline.',
    category: 'Review',
    aliases: ['code review', 'audit', 'review project'],
    insertText: '/review ',
    example: '/review auth module security',
  },
])

function cleanString(value) {
  return String(value ?? '')
}

function cleanQuery(value) {
  return cleanString(value).trim().toLowerCase()
}

function splitSlashLabel(label = '') {
  return cleanString(label).replace(/^\//, '').toLowerCase()
}

function getSlashTokenMatch(text = '') {
  return cleanString(text).match(/^\/([^\s]*)$/)
}

function getSlashCommandScore(command, query = '') {
  const normalizedQuery = cleanQuery(query)
  if (!normalizedQuery) return 10_000 - cleanString(command.label).length

  const label = splitSlashLabel(command.label)
  const aliases = Array.isArray(command.aliases)
    ? command.aliases.map((value) => cleanQuery(value))
    : []

  if (label === normalizedQuery) return 9_000
  if (label.startsWith(normalizedQuery)) return 8_000 - label.length
  if (label.includes(normalizedQuery)) return 7_000 - label.length

  for (const alias of aliases) {
    if (!alias) continue
    if (alias === normalizedQuery) return 6_000
    if (alias.startsWith(normalizedQuery)) return 5_000 - alias.length
    if (alias.includes(normalizedQuery)) return 4_000 - alias.length
  }

  const description = cleanQuery(command.description)
  if (description.includes(normalizedQuery)) return 3_000 - description.length

  return -1
}

export const SLASH_COMMANDS = Object.freeze(BASE_SLASH_COMMANDS.map((command) => Object.freeze({ ...command })))

export function resolveSlashCommandQuery({
  draftText = '',
  selectionStart = null,
  selectionEnd = null,
  slashCommandsEnabled = true,
} = {}) {
  if (!slashCommandsEnabled) return null
  const text = cleanString(draftText)
  const match = getSlashTokenMatch(text)
  if (!match) return null

  const tokenEnd = text.length
  const start = Number.isFinite(selectionStart) ? Number(selectionStart) : tokenEnd
  const end = Number.isFinite(selectionEnd) ? Number(selectionEnd) : start
  if (start !== end) return null
  if (start < 0 || start > tokenEnd) return null

  return {
    token: text,
    query: cleanQuery(match[1]),
    selectionStart: start,
    selectionEnd: end,
  }
}

export function filterSlashCommands(query = '', commands = SLASH_COMMANDS) {
  return (Array.isArray(commands) ? commands : [])
    .map((command) => ({
      ...command,
      _score: getSlashCommandScore(command, query),
    }))
    .filter((command) => command._score >= 0)
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score
      return cleanString(a.label).localeCompare(cleanString(b.label))
    })
    .map((entry) => {
      const command = { ...entry }
      delete command._score
      return command
    })
}

export function resolveSlashCommandMenuState({
  draftText = '',
  selectionStart = null,
  selectionEnd = null,
  slashCommandsEnabled = true,
  commands = SLASH_COMMANDS,
} = {}) {
  const trigger = resolveSlashCommandQuery({
    draftText,
    selectionStart,
    selectionEnd,
    slashCommandsEnabled,
  })
  if (!trigger) {
    return {
      open: false,
      query: '',
      token: '',
      items: [],
    }
  }

  const items = filterSlashCommands(trigger.query, commands)
  return {
    open: items.length > 0,
    query: trigger.query,
    token: trigger.token,
    items,
  }
}

export function applySlashCommandSelection({
  draftText = '',
  command = null,
  selectionStart = null,
  selectionEnd = null,
  slashCommandsEnabled = true,
} = {}) {
  const trigger = resolveSlashCommandQuery({
    draftText,
    selectionStart,
    selectionEnd,
    slashCommandsEnabled,
  })
  const insertText = cleanString(command?.insertText)
  if (!trigger || !insertText) return cleanString(draftText)
  return insertText
}
