import { normalizeAssistantPhase } from './assistant-phase.mjs'
import { buildCanonicalFinalDocument } from './final-document-contract.mjs'

const REGISTERED_TEXT_FIELDS = Object.freeze(['chunk', 'text', 'delta'])

export function isInvalidObjectSentinel(value) {
  return typeof value === 'string' && value.trim() === '[object Object]'
}

function safeString(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/**
 * Reads provider prose only from the explicitly registered text fields. Provider objects are
 * data, not prose: unknown shapes intentionally produce an empty string rather than coercing to
 * a user-visible "[object Object]" value. Strings are kept byte-for-byte (including Unicode and
 * whitespace) because chunk boundaries are meaningful to the stream.
 */
export function readRegisteredText(value, { requireNonWhitespace = false } = {}) {
  if (typeof value === 'string') return isInvalidObjectSentinel(value) ? '' : value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  for (const field of REGISTERED_TEXT_FIELDS) {
    const candidate = value[field]
    if (typeof candidate !== 'string' || isInvalidObjectSentinel(candidate)) continue
    if (requireNonWhitespace && !candidate.trim()) continue
    return candidate
  }
  return ''
}

export function normalizeProviderTextChunk(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null
  const chunk = readRegisteredText(value)
  const phase = normalizeAssistantPhase(source?.phase)
  return {
    chunk,
    ...(phase ? { phase } : {}),
    ...(source?.boundaryBefore === true ? { boundaryBefore: true } : {}),
  }
}

const EVENT_KIND = Object.freeze({
  agent_commentary_delta: 'commentary_delta',
  agent_reasoning_delta: 'reasoning_delta',
  agent_reasoning_boundary: 'reasoning_boundary',
  agent_tool_started: 'tool_started',
  agent_tool_output: 'tool_output',
  agent_tool_completed: 'tool_completed',
  agent_message_sent: 'commentary_message',
  agent_message_received: 'commentary_message',
  agent_context_sent: 'commentary_message',
  agent_context_received: 'commentary_message',
})

function sequenceFor(entry = {}) {
  const sequence = Number(entry?.nodeSequence ?? entry?.sequence ?? 0)
  return Number.isFinite(sequence) ? sequence : 0
}

function eventId(entry = {}) {
  return safeString(entry?.id) || safeString(entry?.eventId)
}

function eventKind(entry = {}) {
  const raw = safeString(entry?.kind)
  return EVENT_KIND[raw] || raw
}

function eventContent(entry = {}) {
  if (Object.hasOwn(entry || {}, 'content')) return readRegisteredText(entry.content)
  return readRegisteredText(entry?.payload)
}

function eventField(entry = {}, field) {
  return safeString(entry?.[field]) || safeString(entry?.payload?.[field])
}

function isStructuredAgentTransportText(value) {
  const source = String(value || '').trim()
  if (!source.startsWith('{') || !source.endsWith('}')) return false
  try {
    const parsed = JSON.parse(source)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    if (typeof parsed.summary !== 'string') return false
    return ['findings', 'recommendations', 'stagedChanges', 'scorecard']
      .some((field) => Object.hasOwn(parsed, field))
  } catch {
    return false
  }
}

function legacyTransportEventIds(entries = []) {
  const eventIds = new Set()
  for (let index = 0; index < entries.length;) {
    if (eventKind(entries[index]) !== 'commentary_delta') {
      index += 1
      continue
    }
    const group = []
    while (index < entries.length && eventKind(entries[index]) === 'commentary_delta') {
      group.push(entries[index])
      index += 1
    }
    if (!isStructuredAgentTransportText(group.map(eventContent).join(''))) continue
    for (const entry of group) eventIds.add(eventId(entry))
  }
  return eventIds
}

/**
 * Projects ordered canonical events into the single turn shape consumed by the root execution
 * item builder. The aliases above exist only for legacy persisted agent event names; output
 * semantics live here, not in a child-only renderer adapter.
 */
export function buildCanonicalTurnFromEvents(entries = [], { status = 'completed' } = {}) {
  const ordered = [...entries]
    .filter((entry) => entry && typeof entry === 'object')
    .sort((left, right) => sequenceFor(left) - sequenceFor(right)
      || eventId(left).localeCompare(eventId(right)))

  const itemOrder = []
  const sessionsById = {}
  const reasoningById = {}
  const hiddenTransportIds = legacyTransportEventIds(ordered)
  let openReasoningId = ''
  let openReasoningRole = ''

  const closeReasoning = () => {
    openReasoningId = ''
    openReasoningRole = ''
  }
  const appendReasoning = (entry, role, { accumulate }) => {
    const content = eventContent(entry)
    if (!content.trim()) return
    const isSnapshot = entry?.snapshot === true || entry?.payload?.snapshot === true
    if (accumulate && openReasoningId && openReasoningRole === role) {
      reasoningById[openReasoningId].detail = isSnapshot
        ? content
        : `${reasoningById[openReasoningId].detail}${content}`
      return
    }
    const id = eventId(entry)
    if (!id) return
    reasoningById[id] = { id, role, detail: content }
    itemOrder.push(`reasoning:${id}`)
    openReasoningId = accumulate ? id : ''
    openReasoningRole = accumulate ? role : ''
  }
  const sessionKey = (entry) => eventField(entry, 'toolCallId') || eventId(entry)

  for (const entry of ordered) {
    if (hiddenTransportIds.has(eventId(entry))) continue
    const kind = eventKind(entry)
    if (kind === 'reasoning_boundary') {
      closeReasoning()
      continue
    }
    if (kind === 'reasoning_delta' || kind === 'commentary_delta') {
      appendReasoning(entry, kind === 'reasoning_delta' ? 'reasoning' : 'commentary', { accumulate: true })
      continue
    }
    if (kind === 'commentary_message') {
      appendReasoning(entry, 'commentary', { accumulate: false })
      continue
    }
    if (kind === 'tool_started') {
      closeReasoning()
      const key = sessionKey(entry)
      if (!key || sessionsById[key]) continue
      sessionsById[key] = {
        id: key,
        toolKind: eventField(entry, 'toolName') || 'tool',
        state: 'active',
        outputs: [],
        inputDetail: eventContent(entry),
        detail: '',
        startedAt: Number(entry?.createdAt || 0),
        completedAt: 0,
      }
      itemOrder.push(`tool:${key}`)
      continue
    }
    if (kind === 'tool_output') {
      const session = sessionsById[sessionKey(entry)]
      const content = eventContent(entry)
      if (session && content) session.outputs.push(content)
      continue
    }
    if (kind === 'tool_completed') {
      const session = sessionsById[sessionKey(entry)]
      if (!session) continue
      session.state = eventField(entry, 'status') || 'completed'
      session.detail = eventContent(entry)
      session.completedAt = Number(entry?.createdAt || 0)
    }
  }

  return { itemOrder, sessionsById, reasoningById, status: safeString(status) || 'completed' }
}

function finalScope(entry = {}, scope = {}) {
  return {
    threadId: safeString(scope.threadId) || eventField(entry, 'threadId'),
    turnId: safeString(scope.turnId) || eventField(entry, 'turnId'),
  }
}

/** Selects the latest final event and projects it with the root final-document contract. */
export function selectCanonicalFinalDocument(entries = [], scope = {}) {
  const final = [...entries]
    .filter((entry) => eventKind(entry) === 'agent_final_message' || eventKind(entry) === 'final_message')
    .sort((left, right) => sequenceFor(right) - sequenceFor(left)
      || eventId(right).localeCompare(eventId(left)))
    .find((entry) => eventId(entry) && (eventContent(entry).trim() || Array.isArray(entry?.finalDocument?.parts)))
  if (!final) return null
  const identity = finalScope(final, scope)
  return buildCanonicalFinalDocument({
    ...identity,
    messageId: eventId(final),
    text: eventContent(final),
    finalDocument: final.finalDocument,
    hasAuthoritativeMessageBinding: true,
  })
}
