export const RAW_DELEGATION_TOOL_NAME = 'delegate_to_agents'
export const COMPACT_DELEGATION_TOOL_NAME = 'delegate_tasks'
export const COMPACT_DELEGATION_TOOL_NAMES = Object.freeze([COMPACT_DELEGATION_TOOL_NAME])

function clean(value = '') {
  return String(value || '').trim()
}

function flattenUserTextContent(content) {
  if (typeof content === 'string') return clean(content)
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (part?.type === 'text' ? clean(part?.text) : ''))
    .filter(Boolean)
    .join(' ')
    .trim()
}

function isRetryLikeUserMessage(text = '') {
  return /^(?:retry|try again|again|continue|go ahead|do it|run it|rerun|resend)\b/i.test(clean(text))
}

function extractRecentUserText({ userMessage = '', history = [] } = {}) {
  const direct = clean(userMessage)
  const rows = Array.isArray(history) ? history : []
  if (direct) {
    if (!isRetryLikeUserMessage(direct)) return direct
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]
      if (clean(row?.role).toLowerCase() !== 'user') continue
      const prior = flattenUserTextContent(row?.content)
      if (prior && prior.toLowerCase() !== direct.toLowerCase()) return `${direct}\n${prior}`
    }
    return direct
  }
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (clean(row?.role).toLowerCase() !== 'user') continue
    const text = flattenUserTextContent(row?.content)
    if (text) return text
  }
  return ''
}

export function isCompactDelegationToolName(toolName = '') {
  return clean(toolName) === COMPACT_DELEGATION_TOOL_NAME
}

export function isDelegationToolName(toolName = '') {
  const normalized = clean(toolName)
  return normalized === RAW_DELEGATION_TOOL_NAME || isCompactDelegationToolName(normalized)
}

export function hasVisibleDelegationTool(activeTools = {}) {
  const tools = activeTools && typeof activeTools === 'object' ? activeTools : {}
  return Object.keys(tools).some((toolName) => isDelegationToolName(toolName))
}

export function hasVisibleRawDelegationTool(activeTools = {}) {
  return Boolean(activeTools && typeof activeTools === 'object' && activeTools[RAW_DELEGATION_TOOL_NAME])
}

export function hasExplicitDelegationRequest({ userMessage = '', history = [] } = {}) {
  const text = extractRecentUserText({ userMessage, history })
  return /\b(delegate(?:_tasks|_to_agents)?|delegation|subagents?|sub-agents?|multi-agent|moa|agents? in parallel|parallel agents?|use (?:multiple |several |an? )?agents?|ask (?:multiple |several |an? )?agents?)\b/i.test(text)
}
