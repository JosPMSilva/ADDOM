export function normalizeAdapterProfile(input = {}) {
  return input && typeof input === 'object' ? input : {}
}

export function normalizeToolMap(input = {}) {
  return input && typeof input === 'object' ? input : {}
}

export function normalizeToolNames(input = []) {
  const source = Array.isArray(input) ? input : []
  const seen = new Set()
  const out = []
  for (const value of source) {
    const normalized = String(value || '').trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

function flattenUserTextContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (part?.type === 'text' ? String(part?.text || '') : ''))
    .join(' ')
    .trim()
}

function isRetryLikeUserMessage(text = '') {
  return /^(?:retry|try again|again|continue|go ahead|do it|run it|rerun|resend)\b/i.test(String(text || '').trim())
}

export function extractRecentUserText({ userMessage = '', history = [] } = {}) {
  const direct = String(userMessage || '').trim()
  const messages = Array.isArray(history) ? history : []
  if (direct) {
    if (!isRetryLikeUserMessage(direct)) return direct
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const row = messages[index]
      if (String(row?.role || '').trim().toLowerCase() !== 'user') continue
      const prior = flattenUserTextContent(row?.content)
      if (!prior) continue
      if (prior.toLowerCase() === direct.toLowerCase()) continue
      return `${direct}\n${prior}`.trim()
    }
    return direct
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = messages[index]
    if (String(row?.role || '').trim().toLowerCase() !== 'user') continue
    const text = flattenUserTextContent(row?.content)
    if (text) return text
  }
  return ''
}

export function userTextMatches(userText = '', patterns = []) {
  return (Array.isArray(patterns) ? patterns : []).some((pattern) => pattern.test(userText))
}

export function omitToolsByName(tools = {}, blockedToolNames = new Set()) {
  const source = normalizeToolMap(tools)
  const blocked = blockedToolNames instanceof Set ? blockedToolNames : new Set()
  const next = {}
  const removed = []
  for (const [toolName, definition] of Object.entries(source)) {
    const normalized = String(toolName || '').trim()
    if (!normalized) continue
    if (blocked.has(normalized)) {
      removed.push(normalized)
      continue
    }
    next[normalized] = definition
  }
  return {
    tools: next,
    removedToolNames: removed,
  }
}

export function removeVisibleTools(source, {
  blockedToolNames = new Set(),
  addomTools = {},
  exclusionReason = '',
} = {}) {
  const blocked = blockedToolNames instanceof Set ? blockedToolNames : new Set()
  if (blocked.size === 0) return source
  const tools = normalizeToolMap(source.tools)
  const addom = normalizeToolMap(addomTools)
  const nextTools = { ...tools }
  const removedToolNames = []
  for (const toolName of blocked) {
    if (!Object.prototype.hasOwnProperty.call(nextTools, toolName)) continue
    delete nextTools[toolName]
    removedToolNames.push(toolName)
  }
  if (removedToolNames.length === 0) return source
  return {
    ...source,
    tools: nextTools,
    removedAddomToolNames: normalizeToolNames([
      ...(source.removedAddomToolNames || []),
      ...removedToolNames.filter((toolName) => Object.prototype.hasOwnProperty.call(addom, toolName)),
    ]),
    excludedToolsWithReasons: [
      ...(Array.isArray(source.excludedToolsWithReasons) ? source.excludedToolsWithReasons : []),
      ...removedToolNames.map((toolName) => ({
        toolName,
        reason: exclusionReason,
      })),
    ],
  }
}

export function buildBaseSelection(addomTools = {}) {
  const tools = normalizeToolMap(addomTools)
  const toolNames = Object.keys(tools)
  return {
    tools,
    toolSurfaceKind: toolNames.length > 0 ? 'addom_native' : 'none',
    toolSurfaceComponents: toolNames.length > 0 ? ['addom_native'] : [],
    mixedToolSurfaceDetected: false,
    removedAddomToolNames: [],
    excludedToolsWithReasons: [],
    toolExecutionMap: {},
  }
}
