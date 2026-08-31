import {
  collectRecentToolContextFacts,
  summarizeToolContextFacts,
} from '../tool-context-facts.mjs'

const HANDOFF_EVENT_TYPES = new Set([
  'local_summary',
  'codex_thread_compaction',
  'provider_chain_compaction',
  'provider_truncation',
])

const HANDOFF_PHASES = new Set([
  'imminent',
  'applied',
  'resumed_after',
])

const HANDOFF_EVENT_SOURCES = new Set(['local', 'provider'])
const HANDOFF_EVENT_CONFIDENCE = new Set(['explicit', 'inferred'])

function flattenMessageContent(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        if (typeof part.text === 'string') return part.text
        if (typeof part.input === 'string') return part.input
        if (part.input && typeof part.input === 'object') {
          try {
            return JSON.stringify(part.input)
          } catch {
            return String(part.input)
          }
        }
        if (part.output && typeof part.output === 'object') {
          try {
            return JSON.stringify(part.output)
          } catch {
            return String(part.output)
          }
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content)
    } catch {
      return String(content)
    }
  }
  return ''
}

function normalizeText(text, max = 240) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function normalizeList(items, { maxItems = 8, maxItemChars = 220 } = {}) {
  if (!Array.isArray(items)) return []
  const out = []
  const seen = new Set()
  for (const item of items) {
    if (out.length >= maxItems) break
    const value = normalizeText(item, maxItemChars)
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function normalizeEnum(value, allowed = new Set(), fallback = '') {
  const normalized = String(value ?? '').trim().toLowerCase()
  return allowed.has(normalized) ? normalized : fallback
}

function normalizeBoolean(value) {
  return value === true
}

function splitCandidateLines(text = '') {
  return String(text || '')
    .split(/\r?\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
}

function extractFirstSentence(text) {
  const value = String(text || '').trim()
  if (!value) return ''
  const lines = value.split(/\r?\n+/g).map((line) => line.trim()).filter(Boolean)
  const first = lines[0] || ''
  if (!first) return ''
  const sentence = first.split(/[.!?]/g).map((part) => part.trim()).find(Boolean) || first
  return normalizeText(sentence, 220)
}

function toMessageRows(history = []) {
  if (!Array.isArray(history)) return []
  return history
    .map((message) => ({
      role: String(message?.role || '').trim().toLowerCase(),
      text: flattenMessageContent(message?.content),
    }))
    .filter((row) => row.role && row.text)
}

function findLastMessageByRole(rows = [], role = '') {
  const targetRole = String(role || '').trim().toLowerCase()
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.role === targetRole) return rows[i]
  }
  return null
}

function extractFilePaths(rows = [], maxItems = 8) {
  const out = []
  const seen = new Set()
  const filePathPattern = /(?:[A-Za-z]:[\\/][^\s"'`<>|?*]+|(?:\.{1,2}[\\/])?[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)+)/g
  for (const row of rows) {
    const text = String(row?.text || '')
    for (const match of text.matchAll(filePathPattern)) {
      let value = String(match?.[0] || '').trim()
      value = value.replace(/[),.;:!?]+$/g, '')
      if (!value || value.includes('://')) continue
      const lower = value.toLowerCase()
      const looksLikeFile = (
        /\.[a-z0-9]{1,8}$/i.test(value)
        || /(^|[\\/])(src|test|tests|docs|lib|app|scripts|config|dist)([\\/]|$)/i.test(value)
        || /package\.json$/i.test(value)
        || /tsconfig\.json$/i.test(value)
      )
      if (!looksLikeFile) continue
      if (seen.has(lower)) continue
      seen.add(lower)
      out.push(value)
      if (out.length >= maxItems) return out
    }
  }
  return out
}

function collectRecentRows(history = [], maxRows = 40) {
  const rows = toMessageRows(history)
  if (rows.length <= maxRows) return rows
  return rows.slice(rows.length - maxRows)
}

function findLatestLine(rows = [], matcher) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const lines = splitCandidateLines(rows[i]?.text || '')
    for (const line of lines) {
      if (matcher(line, rows[i])) return normalizeText(line, 220)
    }
  }
  return ''
}

function buildWorkStateFromHistory(history = [], removedMessages = []) {
  const rows = collectRecentRows(history, 48)
  const removedRows = collectRecentRows(removedMessages, 24)
  const mergedRows = [...rows, ...removedRows]
  const latestUser = findLastMessageByRole(rows, 'user')
  const latestAssistant = findLastMessageByRole(rows, 'assistant')

  const objective = extractFirstSentence(latestUser?.text || latestAssistant?.text || '')
  const constraints = []
  const lastConcreteEdits = []
  const recentToolOutcomes = []
  const blockers = []
  const verificationStatus = []
  const openLoops = []

  for (const row of mergedRows) {
    const lines = splitCandidateLines(row.text)
    for (const line of lines) {
      const normalized = normalizeText(line, 220)
      if (!normalized) continue
      const lower = normalized.toLowerCase()
      if (
        row.role === 'user'
        && /\b(must|should|do not|don't|without|require|constraint|avoid|keep)\b/.test(lower)
      ) constraints.push(normalized)
      if (/\b(edit|updated?|wrote|changed?|refactor|added?|removed?|renamed?|fixed?|implemented?)\b/.test(lower)) {
        lastConcreteEdits.push(normalized)
      }
      if (/\b(tool|command|run_command|write_file|edit_file|read_file)\b/.test(lower)) {
        recentToolOutcomes.push(normalized)
      } else if (/\b(test|build|lint|ci)\b/.test(lower) && /\b(pass|success|ok|fail|error)\b/.test(lower)) {
        recentToolOutcomes.push(normalized)
      }
      if (/\b(blocked|cannot|can't|failed|error|timeout|denied)\b/.test(lower)) blockers.push(normalized)
      if (/\b(test|build|lint|ci)\b/.test(lower) && /\b(pass|success|ok|fail|error)\b/.test(lower)) {
        verificationStatus.push(normalized)
      }
      if (/\b(todo|follow up|pending|remaining|next step|still need)\b/.test(lower)) openLoops.push(normalized)
    }
  }

  const nextStep = findLatestLine(rows, (line) => /\b(next step|todo|remaining|then|follow up)\b/i.test(line))

  return {
    objective,
    constraints: normalizeList(constraints, { maxItems: 8, maxItemChars: 200 }),
    activeFiles: normalizeList(extractFilePaths(rows, 10), { maxItems: 10, maxItemChars: 220 }),
    lastConcreteEdits: normalizeList(lastConcreteEdits, { maxItems: 8, maxItemChars: 220 }),
    recentToolOutcomes: normalizeList(recentToolOutcomes, { maxItems: 8, maxItemChars: 220 }),
    blockers: normalizeList(blockers, { maxItems: 6, maxItemChars: 220 }),
    verificationStatus: normalizeList(verificationStatus, { maxItems: 6, maxItemChars: 220 }),
    nextStep,
    openLoops: normalizeList(openLoops, { maxItems: 8, maxItemChars: 220 }),
  }
}

export function normalizeCompactionHandoffPayload(payload = {}) {
  const sourcePayload = payload && typeof payload === 'object' ? payload : {}
  const sourceEvent = sourcePayload.compactionEvent && typeof sourcePayload.compactionEvent === 'object'
    ? sourcePayload.compactionEvent
    : {}
  const eventOccurred = normalizeBoolean(sourceEvent.occurred)
  const eventType = normalizeEnum(sourceEvent.type, HANDOFF_EVENT_TYPES, 'local_summary')
  const eventPhase = normalizeEnum(sourceEvent.phase, HANDOFF_PHASES, eventOccurred ? 'applied' : 'imminent')
  const eventSource = normalizeEnum(sourceEvent.source, HANDOFF_EVENT_SOURCES, eventType === 'local_summary' ? 'local' : 'provider')
  const eventConfidence = normalizeEnum(sourceEvent.confidence, HANDOFF_EVENT_CONFIDENCE, 'explicit')

  const sourceWorkState = sourcePayload.workState && typeof sourcePayload.workState === 'object'
    ? sourcePayload.workState
    : {}

  return {
    compactionEvent: {
      occurred: eventOccurred,
      type: eventType,
      phase: eventPhase,
      providerId: normalizeText(String(sourceEvent.providerId || '').toLowerCase(), 32),
      turnId: normalizeText(sourceEvent.turnId || '', 80),
      source: eventSource,
      confidence: eventConfidence,
    },
    workState: {
      objective: normalizeText(sourceWorkState.objective || '', 220),
      constraints: normalizeList(sourceWorkState.constraints, { maxItems: 8, maxItemChars: 180 }),
      activeFiles: normalizeList(sourceWorkState.activeFiles, { maxItems: 10, maxItemChars: 220 }),
      lastConcreteEdits: normalizeList(sourceWorkState.lastConcreteEdits, { maxItems: 8, maxItemChars: 220 }),
      recentToolOutcomes: normalizeList(sourceWorkState.recentToolOutcomes, { maxItems: 8, maxItemChars: 220 }),
      toolContextFacts: normalizeList(sourceWorkState.toolContextFacts, { maxItems: 6, maxItemChars: 220 }),
      blockers: normalizeList(sourceWorkState.blockers, { maxItems: 6, maxItemChars: 220 }),
      verificationStatus: normalizeList(sourceWorkState.verificationStatus, { maxItems: 6, maxItemChars: 220 }),
      nextStep: normalizeText(sourceWorkState.nextStep || '', 220),
      openLoops: normalizeList(sourceWorkState.openLoops, { maxItems: 8, maxItemChars: 220 }),
    },
  }
}

export function buildCompactionHandoffPayload({
  compactionEvent = {},
  historyBeforeCompaction = [],
  removedMessages = [],
  compactedHistory = [],
  threadId = '',
  toolContextFacts = null,
} = {}) {
  const sourceHistory = Array.isArray(historyBeforeCompaction) && historyBeforeCompaction.length > 0
    ? historyBeforeCompaction
    : compactedHistory
  const workState = buildWorkStateFromHistory(sourceHistory, removedMessages)
  const recentFacts = Array.isArray(toolContextFacts)
    ? toolContextFacts
    : (
        String(threadId || '').trim()
          ? collectRecentToolContextFacts(String(threadId || '').trim(), { limit: 48 })
          : []
      )
  workState.toolContextFacts = summarizeToolContextFacts(recentFacts, { maxItems: 4 })
  return normalizeCompactionHandoffPayload({
    compactionEvent,
    workState,
  })
}
