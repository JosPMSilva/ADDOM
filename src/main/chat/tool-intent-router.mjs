const INTENT_ORDER = Object.freeze([
  'exploration_only',
  'targeted_edit',
  'full_rewrite',
  'command_execution',
  'web_research',
  'browser_interaction',
  'delegation',
  'mixed',
])

const INTENT_NARROWING_POLICY = Object.freeze({
  exploration_only: Object.freeze({
    preferExposed: Object.freeze(['read_file', 'view_file_range', 'grep_file', 'search_code', 'find_files', 'list_directory']),
    hideByDefault: Object.freeze([]),
  }),
  targeted_edit: Object.freeze({
    preferExposed: Object.freeze(['read_file', 'view_file_range', 'edit_file', 'write_file']),
    hideByDefault: Object.freeze(['apply_patch']),
  }),
  full_rewrite: Object.freeze({
    preferExposed: Object.freeze(['read_file', 'view_file_range', 'write_file']),
    hideByDefault: Object.freeze(['apply_patch', 'edit_file']),
  }),
  command_execution: Object.freeze({
    preferExposed: Object.freeze(['run_command']),
    hideByDefault: Object.freeze([]),
  }),
  web_research: Object.freeze({
    preferExposed: Object.freeze(['fetch_page']),
    hideByDefault: Object.freeze([]),
  }),
  browser_interaction: Object.freeze({
    preferExposed: Object.freeze(['browser_action']),
    hideByDefault: Object.freeze([]),
  }),
  delegation: Object.freeze({
    preferExposed: Object.freeze(['delegate_tasks']),
    hideByDefault: Object.freeze([]),
  }),
  mixed: Object.freeze({
    preferExposed: Object.freeze([]),
    hideByDefault: Object.freeze([]),
  }),
})

function normalizeLower(value = '') {
  return String(value || '').trim().toLowerCase()
}

function uniqueStrings(values = []) {
  const seen = new Set()
  const out = []
  for (const rawValue of Array.isArray(values) ? values : []) {
    const value = String(rawValue || '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function normalizeToolNames(activeTools = {}) {
  return new Set(
    Object.keys(activeTools && typeof activeTools === 'object' ? activeTools : {})
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )
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

function extractRecentUserText({ userMessage = '', history = [] } = {}) {
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

function hasAny(text = '', patterns = []) {
  return (Array.isArray(patterns) ? patterns : []).some((pattern) => pattern.test(text))
}

function pushHit(target, intent, signal) {
  if (!target[intent]) target[intent] = []
  target[intent].push(signal)
}

function hasTroubleshootingSignal(text = '') {
  return hasAny(text, [
    /\b(debug|diagnose|diagnostic|investigate|trace|triage|root cause)\b/i,
    /\b(bug|issue|error|errors|failing|failed|failure|stuck|stale|broken|regression)\b/i,
    /\b(live session|current session)\b/i,
  ])
}

function hasDelegationSignal(text = '') {
  return hasAny(text, [
    /\b(delegate|delegation|subagent|sub-agent|parallel agent|multi-agent)\b/i,
    /\b(?:ask|use|have|send|spawn)\s+(?:an?\s+|one\s+|multiple\s+)?agents?\b/i,
    /\bagents?\s+(?:of|from|in)\s+moa\b/i,
    /\bmoa\b.*\bagents?\b/i,
    /\bagents?\b.*\bmoa\b/i,
  ])
}

export function resolveToolIntentShadow({
  mode = 'execute',
  userMessage = '',
  history = [],
  activeTools = {},
} = {}) {
  const normalizedMode = normalizeLower(mode) || 'execute'
  const visibleToolNames = normalizeToolNames(activeTools)
  const text = extractRecentUserText({ userMessage, history })
  const normalizedText = normalizeLower(text)
  const hits = {}

  if (normalizedMode !== 'execute') {
    return {
      intent: 'mixed',
      confidence: 'low',
      signals: ['non_execute_mode'],
      suggestedVisibleToolNames: [],
      suggestedHiddenToolNames: [],
    }
  }

  if (hasDelegationSignal(normalizedText)) {
    pushHit(hits, 'delegation', 'delegation_keywords')
  }
  if (hasAny(normalizedText, [/\b(run|execute|build|test|install|npm|pnpm|yarn|bun|cargo|pip|pytest|make|cmake|powershell|bash|cmd)\b/i])) {
    pushHit(hits, 'command_execution', 'command_keywords')
  }
  if (
    hasAny(normalizedText, [/\b(browser|click|scroll|type|fill|login|screenshot|ui flow|interact)\b/i])
    || /localhost:\d+|127\.0\.0\.1:\d+/i.test(normalizedText)
  ) {
    pushHit(hits, 'browser_interaction', 'browser_keywords')
  }
  if (
    hasAny(normalizedText, [/\b(fetch|scrape|read docs|look up|search the web|website|web page|url|documentation)\b/i, /https?:\/\//i])
  ) {
    pushHit(hits, 'web_research', 'web_keywords')
  }
  if (hasAny(normalizedText, [/\b(rewrite|replace entire|from scratch|overwrite fully|full rewrite|new file|recreate)\b/i])) {
    pushHit(hits, 'full_rewrite', 'rewrite_keywords')
  }
  if (hasAny(normalizedText, [/\b(fix|edit|modify|update|change|patch|adjust|refactor|implement)\b/i])) {
    pushHit(hits, 'targeted_edit', 'edit_keywords')
  }
  if (hasTroubleshootingSignal(normalizedText)) {
    pushHit(hits, 'targeted_edit', 'troubleshooting_keywords')
  }
  if (
    hasAny(normalizedText, [/\b(read|inspect|review|analyze|explain|summarize|understand|list|find|search code)\b/i])
    && !hits.targeted_edit
    && !hits.full_rewrite
  ) {
    pushHit(hits, 'exploration_only', 'read_keywords')
  }

  const matchedIntents = Object.keys(hits)
  if (matchedIntents.length === 0) {
    return {
      intent: 'mixed',
      confidence: 'low',
      signals: ['no_confident_intent_signal'],
      suggestedVisibleToolNames: [],
      suggestedHiddenToolNames: [],
    }
  }

  const selectedIntent = INTENT_ORDER.find((intent) => matchedIntents.includes(intent)) || 'mixed'
  const intent = matchedIntents.length > 1 ? 'mixed' : selectedIntent
  const confidence = matchedIntents.length === 1 ? 'medium' : 'low'
  const policy = INTENT_NARROWING_POLICY[intent] || INTENT_NARROWING_POLICY.mixed

  return {
    intent,
    confidence,
    signals: uniqueStrings(matchedIntents.flatMap((name) => hits[name] || [])),
    suggestedVisibleToolNames: uniqueStrings((policy.preferExposed || []).filter((name) => visibleToolNames.has(name))),
    suggestedHiddenToolNames: uniqueStrings((policy.hideByDefault || []).filter((name) => visibleToolNames.has(name))),
  }
}
