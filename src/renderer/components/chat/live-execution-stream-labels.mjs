const ACTIVE_STATES = new Set(['queued', 'active', 'running', 'pending'])
const SUCCESS_STATES = new Set(['succeeded', 'done', 'completed', 'success'])
const FAILED_STATES = new Set(['failed', 'error', 'cancelled', 'canceled', 'interrupted'])

const VERBS_BY_TOOL_KIND = Object.freeze({
  command: { active: 'Running', completed: 'Ran', failed: 'Failed' },
  file_read: { active: 'Reading', completed: 'Read', failed: 'Failed to read' },
  file_write: { active: 'Writing', completed: 'Wrote', failed: 'Failed to write' },
  file_edit: { active: 'Editing', completed: 'Edited', failed: 'Failed to edit' },
  file_delete: { active: 'Deleting', completed: 'Deleted', failed: 'Failed to delete' },
  search: { active: 'Searching', completed: 'Searched', failed: 'Search failed' },
  plan: { active: 'Updating plan', completed: 'Updated plan', failed: 'Plan update failed' },
  web: { active: 'Fetching', completed: 'Fetched', failed: 'Fetch failed' },
  browser: { active: 'Using browser', completed: 'Used browser', failed: 'Browser action failed' },
  agent: { active: 'Running agent', completed: 'Ran agent', failed: 'Agent failed' },
  tool: { active: 'Running tool', completed: 'Ran tool', failed: 'Tool failed' },
})

const FALLBACK_BY_TOOL_KIND = Object.freeze({
  command: { active: 'Running command', completed: 'Ran command', failed: 'Command failed' },
  file_read: { active: 'Reading file', completed: 'Read file', failed: 'Failed to read file' },
  file_write: { active: 'Writing file', completed: 'Wrote file', failed: 'Failed to write file' },
  file_edit: { active: 'Editing file', completed: 'Edited file', failed: 'Failed to edit file' },
  file_delete: { active: 'Deleting file', completed: 'Deleted file', failed: 'Failed to delete file' },
  search: { active: 'Searching files', completed: 'Searched files', failed: 'Search failed' },
  plan: { active: 'Updating plan', completed: 'Updated plan', failed: 'Plan update failed' },
  web: { active: 'Fetching page', completed: 'Fetched page', failed: 'Fetch failed' },
  browser: { active: 'Using browser', completed: 'Used browser', failed: 'Browser action failed' },
  agent: { active: 'Running agent', completed: 'Ran agent', failed: 'Agent failed' },
  tool: { active: 'Running tool', completed: 'Ran tool', failed: 'Tool failed' },
})

function normalizeState(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeIdentity(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

/** Browser-safe basename (never import node:path in renderer). */
function basenameIdentity(value = '') {
  const normalized = normalizeIdentity(value)
  if (!normalized) return ''
  const cleaned = normalized.replace(/^(?:path|file|cwd):\s*/i, '').replace(/\\/g, '/')
  const base = cleaned.split('/').filter(Boolean).pop() || cleaned
  return base || cleaned
}

function truncateIdentity(value = '', maxLength = 64) {
  const normalized = normalizeIdentity(value)
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

function isUsefulIdentity(value = '', toolKind = '') {
  const normalized = normalizeIdentity(value)
  if (!normalized) return false
  if (/^collecting provider tool input/i.test(normalized)) return false
  if (/^running tool$/i.test(normalized)) return false
  if (/^\.+$/.test(normalized)) return false
  if (toolKind.startsWith('file_') && /\s{2,}/.test(normalized) && !/[\\/]/.test(normalized)) {
    return false
  }
  return true
}

/** True when inputDetail is safe to show as L2 identity / L3 path. */
export function isUsefulToolInputDetail(value = '', toolKind = '') {
  return isUsefulIdentity(value, toolKind)
}

export function resolveShortToolIdentity(toolKind = '', inputDetail = '') {
  const kind = String(toolKind || 'tool').trim().toLowerCase()
  const detail = normalizeIdentity(inputDetail)
  if (!isUsefulIdentity(detail, kind)) return ''
  // Delegation evidence belongs in the expandable tool detail and Agents group.
  // Treating planner counters as an identity produces labels such as
  // "Ran agent requested_tasks: 1", which leaks transport metadata into the stream.
  if (kind === 'agent') return ''

  if (kind.startsWith('file_')) return truncateIdentity(basenameIdentity(detail), 48)
  if (kind === 'command') return truncateIdentity(detail, 56)
  if (kind === 'search' || kind === 'web') {
    const withoutPrefix = detail.replace(/^(?:query|pattern|url):\s*/i, '')
    // Absolute search roots are noisy; keep the leaf folder/file name.
    const short = /[\\/]/.test(withoutPrefix) || /^[A-Za-z]:/.test(withoutPrefix)
      ? basenameIdentity(withoutPrefix)
      : withoutPrefix
    return truncateIdentity(short, 56)
  }
  return truncateIdentity(detail, 56)
}

function resolveVerbSet(kind = 'tool') {
  return VERBS_BY_TOOL_KIND[kind] || VERBS_BY_TOOL_KIND.tool
}

function resolveFallbackSet(kind = 'tool') {
  return FALLBACK_BY_TOOL_KIND[kind] || FALLBACK_BY_TOOL_KIND.tool
}

export function formatExecutionToolLabel({
  toolKind = 'tool',
  state = '',
  inputDetail = '',
} = {}) {
  const parts = resolveExecutionToolLabelParts({ toolKind, state, inputDetail })
  return parts.label
}

/**
 * Split L2 labels into verb + identity so the stream can shade them differently
 * (Cursor-style: dimmer verbs, mid-tone paths/commands; reasoning stays brighter).
 */
export function resolveExecutionToolLabelParts({
  toolKind = 'tool',
  state = '',
  inputDetail = '',
} = {}) {
  const kind = String(toolKind || 'tool').trim().toLowerCase()
  const normalizedState = normalizeState(state)
  const active = ACTIVE_STATES.has(normalizedState)
  const failed = FAILED_STATES.has(normalizedState)
  const verbs = resolveVerbSet(kind)
  const fallback = resolveFallbackSet(kind)
  const identity = resolveShortToolIdentity(kind, inputDetail)
  const verb = active ? verbs.active : (failed ? verbs.failed : verbs.completed)
  const fallbackLabel = active ? fallback.active : (failed ? fallback.failed : fallback.completed)

  if (!identity) {
    return { label: fallbackLabel, verb: fallbackLabel, identity: '' }
  }

  let label = `${verb} ${identity}`
  if (kind === 'plan' || kind === 'browser' || kind === 'agent' || kind === 'tool') {
    label = `${fallbackLabel} ${identity}`.trim()
  } else if (kind === 'search') {
    if (active) label = `Searching ${identity}`
    else if (failed) label = `Search failed ${identity}`
    else label = `Searched ${identity}`
  } else if (kind === 'web') {
    if (active) label = `Fetching ${identity}`
    else if (failed) label = `Fetch failed ${identity}`
    else label = `Fetched ${identity}`
  }

  const verbPart = label.endsWith(identity)
    ? label.slice(0, Math.max(0, label.length - identity.length)).trimEnd()
    : label
  return {
    label,
    verb: verbPart || label,
    identity: verbPart && verbPart !== label ? identity : '',
  }
}

export function resolveToolStatusPresentation(state = '') {
  const normalizedState = normalizeState(state)
  const active = ACTIVE_STATES.has(normalizedState)
  const succeeded = SUCCESS_STATES.has(normalizedState)
  const interrupted = normalizedState === 'interrupted'
  const cancelled = normalizedState === 'cancelled' || normalizedState === 'canceled'
  return {
    statusMark: active ? '…' : (succeeded ? '✓' : '×'),
    accessibleStatus: active
      ? 'Running'
      : (succeeded
        ? 'Succeeded'
        : (interrupted ? 'Interrupted' : (cancelled ? 'Cancelled' : 'Failed'))),
  }
}
