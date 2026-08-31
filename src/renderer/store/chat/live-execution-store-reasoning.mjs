import { isReasoningPhaseBoundary } from '../../../common/chat/reasoning-phase-boundary.mjs'
import { endsWithSentenceBoundary } from '../../../common/chat/reasoning-sentence-boundary.mjs'
import { buildReasoningDisplayState } from './reasoning-stream-segmentation.mjs'
import { stripLeakedAssistantAnswerFromExecutionDetail } from './execution-answer-leak.mjs'

const MAX_LIVE_EVENTS_PER_TURN = 256
const MAX_LIVE_SESSIONS_PER_TURN = 96
const MAX_VISIBLE_REASONING_BLOCKS = 50
const MAX_VISIBLE_REASONING_CHARS = 50000

const REASONING_HEADING_CONNECTORS = new Set([
  'a',
  'an',
  'and',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value = 0, fallback = 0) {
  const n = Number(value || 0) || 0
  return n > 0 ? n : fallback
}

function unwrapReasoningHeadingMarkers(detail = '') {
  return String(detail || '')
    .trim()
    .replace(/^\*\*(.+?)\*\*$/s, '$1')
    .trim()
}

export function isReasoningSectionHeading(detail = '') {
  const text = unwrapReasoningHeadingMarkers(detail)
  if (!text || text.includes('\n')) return false
  if (text.length > 80) return false
  if (/[`"':;,.!?()[\]{}]/.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 3 || words.length > 8) return false
  const [firstWord = ''] = words
  if (firstWord.length < 3) return false
  if (!/^[A-Z][A-Za-z-]+$/.test(firstWord)) return false
  if (!/ing$/i.test(firstWord)) return false
  return words.every((word, index) => {
    if (!word) return false
    const lower = word.toLowerCase()
    if (index === 0) return /^[A-Z][A-Za-z-]*$/.test(word)
    if (REASONING_HEADING_CONNECTORS.has(lower)) return true
    return /^[A-Za-z][A-Za-z0-9/-]*$/.test(word)
  })
}

/** True when a heading is finished (not mid-stream ending on a connector like "and"/"for"). */
export function isCompleteReasoningSectionHeading(detail = '') {
  if (!isReasoningSectionHeading(detail)) return false
  const words = unwrapReasoningHeadingMarkers(detail).split(/\s+/).filter(Boolean)
  const lastWord = String(words[words.length - 1] || '').toLowerCase()
  return !REASONING_HEADING_CONNECTORS.has(lastWord)
}

function appendReasoningPhaseBreak(merged = '') {
  const text = String(merged || '')
  if (!text) return '\n\n'
  if (text.endsWith('\n\n')) return text
  if (text.endsWith('\n')) return `${text}\n`
  return `${text}\n\n`
}

/** Soft-join mid-clause text across a phase boundary instead of forcing `\n\n`. */
function appendSoftReasoningPhaseJoin(merged = '') {
  const text = String(merged || '')
  if (!text) return ''
  if (/\s$/.test(text)) return text
  return `${text} `
}

export function mergeReasoningChunks(chunks = [], { startsWithHeading = false } = {}) {
  const parts = (Array.isArray(chunks) ? chunks : [])
    .map((chunk) => String(chunk || ''))
    .filter((chunk) => isReasoningPhaseBoundary(chunk) || chunk.length > 0)
  if (parts.length === 0) return ''
  let merged = isReasoningPhaseBoundary(parts[0]) ? '' : parts[0]
  let pendingBoldOpen = false
  for (const part of parts.slice(1)) {
    if (isReasoningPhaseBoundary(part)) {
      merged = endsWithSentenceBoundary(merged)
        ? appendReasoningPhaseBreak(merged)
        : appendSoftReasoningPhaseJoin(merged)
      continue
    }
    const trimmedPart = part.trimStart()
    const strippedPart = trimmedPart.trim()
    if (strippedPart === '```' || strippedPart === '`') {
      merged += part
      continue
    }
    if (strippedPart === '**') {
      pendingBoldOpen = true
      continue
    }
    if (strippedPart === '.**' || strippedPart === '**.') {
      merged += '**'
      pendingBoldOpen = false
      continue
    }
    if (pendingBoldOpen) {
      pendingBoldOpen = false
      merged += `\n\n**${trimmedPart}`
      continue
    }
    if (trimmedPart.startsWith('```') || trimmedPart.startsWith('**')) {
      merged += `\n\n${trimmedPart}`
      continue
    }
    merged += part
  }
  if (pendingBoldOpen) {
    merged += '**'
  }
  if (!startsWithHeading || parts.length === 1) return merged
  const rest = merged.slice(parts[0].length)
  if (/[A-Za-z0-9]$/.test(parts[0]) && /^[a-z0-9]/.test(String(rest || '').trimStart())) {
    return merged
  }
  return `${parts[0].trim()}\n\n${rest.trimStart()}`.trim()
}

export function buildReasoningActivity({
  eventId = '',
  turnId = '',
  threadId = '',
  detail = '',
  createdAt = 0,
} = {}) {
  return {
    id: eventId,
    type: 'reasoning',
    turnId,
    threadId,
    label: 'Reasoning',
    detail,
    createdAt,
  }
}

function buildReasoningDisplayFields(detail = '', status = 'active') {
  const displayState = buildReasoningDisplayState(detail, {
    terminal: String(status || '').trim().toLowerCase() !== 'active',
  })
  return {
    stableDetail: String(displayState?.stableDetail || ''),
    pendingTail: String(displayState?.pendingTail || ''),
    hasPendingTail: displayState?.hasPendingTail === true,
  }
}

function buildLegacyCollapsedReasoningBlocks(turn = {}) {
  const turnId = normalizeId(turn?.turnId)
  const threadId = normalizeId(turn?.threadId)
  const rawText = String(turn?.collapsedReasoningText || '')
  const parts = rawText
    .split(/\n{2,}---\n{2,}/)
    .map((part) => String(part || ''))
    .filter((part) => part.trim().length > 0)
  return parts.map((detail, index) => {
    const createdAt = normalizeNumber(turn?.createdAt, Date.now())
    const updatedAt = normalizeNumber(turn?.updatedAt, createdAt)
    const id = `reasoning:${turnId || 'turn'}:archive-block:${index + 1}`
    return {
      id,
      turnId,
      threadId,
      stepId: '',
      sessionId: '',
      kind: 'reasoning',
      status: 'done',
      createdAt,
      updatedAt,
      summary: 'Reasoning',
      detail,
      archived: false,
      collapsedOrigin: true,
      reasoningBlock: true,
      reasoningChunks: [detail],
      startsWithHeading: isReasoningSectionHeading(detail),
      messageId: '',
      truncated: false,
      ...buildReasoningDisplayFields(detail, 'done'),
      activity: buildReasoningActivity({
        eventId: id,
        turnId,
        threadId,
        detail,
        createdAt,
      }),
    }
  })
}

function cloneReasoningBlock(block = {}) {
  const createdAt = normalizeNumber(block?.createdAt, Date.now())
  const detail = String(block?.detail || '')
  const reasoningChunks = Array.isArray(block?.reasoningChunks) && block.reasoningChunks.length > 0
    ? block.reasoningChunks.map((chunk) => String(chunk || ''))
    : (detail ? [detail] : [])
  return {
    ...block,
    id: normalizeId(block?.id),
    turnId: normalizeId(block?.turnId),
    threadId: normalizeId(block?.threadId),
    stepId: normalizeId(block?.stepId),
    sessionId: normalizeId(block?.sessionId),
    kind: 'reasoning',
    status: String(block?.status || 'done').trim() || 'done',
    createdAt,
    updatedAt: normalizeNumber(block?.updatedAt, createdAt),
    summary: String(block?.summary || 'Reasoning').trim() || 'Reasoning',
    detail,
    archived: false,
    reasoningBlock: true,
    reasoningChunks,
    startsWithHeading: block?.startsWithHeading === true,
    messageId: normalizeId(block?.messageId),
    truncated: false,
    ...buildReasoningDisplayFields(detail, String(block?.status || 'done').trim() || 'done'),
    reasoningMeta: block?.reasoningMeta && typeof block.reasoningMeta === 'object'
      ? { ...block.reasoningMeta }
      : null,
    streamMeta: block?.streamMeta && typeof block.streamMeta === 'object'
      ? { ...block.streamMeta }
      : null,
    activity: buildReasoningActivity({
      eventId: normalizeId(block?.id),
      turnId: normalizeId(block?.turnId),
      threadId: normalizeId(block?.threadId),
      detail,
      createdAt,
    }),
  }
}

export function getCollapsedReasoningBlocks(turn = {}) {
  if (Array.isArray(turn?.collapsedReasoningBlocks) && turn.collapsedReasoningBlocks.length > 0) {
    return turn.collapsedReasoningBlocks.map(cloneReasoningBlock)
  }
  return buildLegacyCollapsedReasoningBlocks(turn)
}

function getReasoningArchiveEventId(turnId = '') {
  const normalizedTurnId = normalizeId(turnId)
  if (!normalizedTurnId) return ''
  return `reasoning:${normalizedTurnId}:archive`
}

function syncCollapsedReasoningLegacyFields(turn) {
  const blocks = getCollapsedReasoningBlocks(turn)
  turn.collapsedReasoningBlocks = blocks
  turn.collapsedReasoningCount = blocks.length
  turn.collapsedReasoningText = blocks
    .map((block) => String(block?.detail || ''))
    .filter((detail) => detail.trim().length > 0)
    .join('\n\n---\n\n')
}

function appendCollapsedReasoningBlock(turn, block = {}) {
  const nextBlock = cloneReasoningBlock({
    ...block,
    status: 'done',
    archived: false,
  })
  if (!String(nextBlock.detail || '').trim()) return
  turn.collapsedReasoningBlocks = [
    ...getCollapsedReasoningBlocks(turn),
    nextBlock,
  ]
  syncCollapsedReasoningLegacyFields(turn)
}

function removeTurnEvent(turn, eventId = '') {
  const normalizedEventId = normalizeId(eventId)
  if (!normalizedEventId) return null
  const existing = turn?.eventsById?.[normalizedEventId] || null
  turn.eventOrder = (Array.isArray(turn?.eventOrder) ? turn.eventOrder : []).filter((id) => id !== normalizedEventId)
  delete turn.eventsById[normalizedEventId]
  return existing
}

function syncReasoningArchiveEvent(turn) {
  const archiveId = getReasoningArchiveEventId(turn?.turnId)
  if (!archiveId) return
  syncCollapsedReasoningLegacyFields(turn)
  const blocks = getCollapsedReasoningBlocks(turn)
  if (blocks.length === 0) {
    removeTurnEvent(turn, archiveId)
    return
  }
  const count = blocks.length
  const existing = turn.eventsById[archiveId]
  turn.eventsById[archiveId] = {
    ...(existing && typeof existing === 'object' ? existing : {}),
    id: archiveId,
    turnId: String(turn.turnId || ''),
    threadId: String(turn.threadId || ''),
    stepId: '',
    sessionId: '',
    kind: 'reasoning',
    status: 'done',
    summary: `Earlier reasoning (${count} step${count === 1 ? '' : 's'} collapsed)`,
    detail: '',
    archived: true,
    collapsedCount: count,
    blocks,
    createdAt: Number(existing?.createdAt || turn.createdAt || Date.now()) || Date.now(),
    updatedAt: Number(turn.updatedAt || Date.now()) || Date.now(),
    messageId: '',
    truncated: false,
    activity: buildReasoningActivity({
      eventId: archiveId,
      turnId: String(turn.turnId || ''),
      threadId: String(turn.threadId || ''),
      detail: '',
      createdAt: Number(existing?.createdAt || turn.createdAt || Date.now()) || Date.now(),
    }),
  }
  turn.eventOrder = (Array.isArray(turn.eventOrder) ? turn.eventOrder : []).filter((id) => id !== archiveId)
  turn.eventOrder.unshift(archiveId)
}

function getVisibleReasoningEventIds(turn) {
  const ids = []
  for (const eventId of Array.isArray(turn?.eventOrder) ? turn.eventOrder : []) {
    const event = turn?.eventsById?.[eventId]
    if (!event || String(event?.kind || '').trim() !== 'reasoning' || event?.archived === true) continue
    ids.push(eventId)
  }
  return ids
}

function getVisibleReasoningChars(turn, eventIds = []) {
  return (Array.isArray(eventIds) ? eventIds : []).reduce((total, eventId) => {
    const event = turn?.eventsById?.[eventId]
    return total + String(event?.detail || '').length
  }, 0)
}

function shouldKeepVisibleReasoning(turn, eventIds = []) {
  if ((Array.isArray(eventIds) ? eventIds : []).length > MAX_VISIBLE_REASONING_BLOCKS) return false
  return getVisibleReasoningChars(turn, eventIds) <= MAX_VISIBLE_REASONING_CHARS
}

function archiveReasoningEvent(turn, eventId = '') {
  const removed = removeTurnEvent(turn, eventId)
  if (!removed || String(removed?.kind || '').trim() !== 'reasoning' || removed?.archived === true) return false
  appendCollapsedReasoningBlock(turn, removed)
  return true
}

function trimVisibleReasoning(turn) {
  if (String(turn?.status || '').trim().toLowerCase() === 'active') return
  let reasoningEventIds = getVisibleReasoningEventIds(turn)
  while (reasoningEventIds.length > 0 && !shouldKeepVisibleReasoning(turn, reasoningEventIds)) {
    const removedId = reasoningEventIds.shift()
    if (!removedId) break
    archiveReasoningEvent(turn, removedId)
    reasoningEventIds = getVisibleReasoningEventIds(turn)
  }
}

export function trimTurnBucket(turn) {
  const archiveId = getReasoningArchiveEventId(turn?.turnId)
  removeTurnEvent(turn, archiveId)
  trimVisibleReasoning(turn)

  while (turn.eventOrder.length > MAX_LIVE_EVENTS_PER_TURN) {
    const removableNonReasoningId = turn.eventOrder.find((eventId) => {
      const event = turn.eventsById[eventId]
      return event && String(event?.kind || '').trim() !== 'reasoning'
    })
    if (removableNonReasoningId) {
      removeTurnEvent(turn, removableNonReasoningId)
      continue
    }
    const oldestReasoningId = getVisibleReasoningEventIds(turn)[0]
    if (!oldestReasoningId) break
    archiveReasoningEvent(turn, oldestReasoningId)
  }

  syncReasoningArchiveEvent(turn)
  while (turn.sessionOrder.length > MAX_LIVE_SESSIONS_PER_TURN) {
    const removedId = turn.sessionOrder.shift()
    if (removedId) delete turn.sessionsById[removedId]
  }
  return turn
}

export function buildReasoningEvent({
  eventId = '',
  turnId = '',
  threadId = '',
  messageId = '',
  reasoningRole = '',
  detail = '',
  createdAt = 0,
  updatedAt = 0,
  reasoningMeta = null,
  streamMeta = null,
  status = 'active',
} = {}) {
  const startsWithHeading = isReasoningSectionHeading(detail)
  return {
    id: eventId,
    turnId: normalizeId(turnId),
    threadId: normalizeId(threadId),
    stepId: '',
    sessionId: '',
    kind: 'reasoning',
    status: String(status || 'active').trim().toLowerCase() || 'active',
    createdAt,
    updatedAt,
    summary: 'Reasoning',
    detail,
    reasoningMeta: reasoningMeta && typeof reasoningMeta === 'object' ? { ...reasoningMeta } : null,
    streamMeta: streamMeta && typeof streamMeta === 'object' ? { ...streamMeta } : null,
    messageId: normalizeId(messageId),
    reasoningRole: normalizeId(reasoningRole).toLowerCase(),
    truncated: false,
    archived: false,
    reasoningBlock: true,
    reasoningChunks: [detail],
    startsWithHeading,
    ...buildReasoningDisplayFields(detail, status),
    activity: buildReasoningActivity({
      eventId,
      turnId: normalizeId(turnId),
      threadId: normalizeId(threadId),
      detail,
      createdAt,
    }),
  }
}

export function shouldStartNewReasoningBlock(previousEvent = null, nextChunk = '') {
  if (!previousEvent || String(previousEvent?.kind || '').trim() !== 'reasoning' || previousEvent?.archived === true) {
    return true
  }
  const detail = String(nextChunk || '')
  if (!detail.trim()) return false
  const previousDetail = String(previousEvent?.detail || '').trim()
  if (!previousDetail) return false
  const nextIsHeading = isReasoningSectionHeading(detail)
  const previousEndsSentence = /[.!?]\s*$/.test(previousDetail)
  const previousIsHeading = (
    previousEvent?.startsWithHeading === true
    || isReasoningSectionHeading(previousDetail)
  )
  const previousIsCompleteHeading = isCompleteReasoningSectionHeading(previousDetail)
    || (
      previousEvent?.startsWithHeading === true
      && isCompleteReasoningSectionHeading(previousDetail)
    )
  // Completed thinking title followed by non-title prose (often final-answer leak).
  if (previousIsCompleteHeading && !nextIsHeading) return true
  if (!nextIsHeading) return false
  return previousEndsSentence || previousIsHeading
}

/**
 * Split a single chunk that glues a thinking title onto answer prose:
 * `**Creating simple electrical calculator**Done — I created...`
 */
export function splitSmashedReasoningHeadingProse(chunk = '') {
  const raw = String(chunk || '')
  if (!raw.trim()) return null

  const boldMatch = raw.match(/^(\*\*[^*\n]+\*\*)([\s\S]*)$/)
  if (boldMatch && isReasoningSectionHeading(boldMatch[1]) && String(boldMatch[2] || '').trim()) {
    return {
      heading: boldMatch[1],
      prose: boldMatch[2],
    }
  }

  const plainMatch = raw.match(/^([A-Z][^\n]{8,80}?)([A-Z][\s\S]+)$/)
  if (
    plainMatch
    && isReasoningSectionHeading(plainMatch[1])
    && !isReasoningSectionHeading(plainMatch[2])
    && String(plainMatch[2] || '').trim()
  ) {
    return {
      heading: plainMatch[1],
      prose: plainMatch[2],
    }
  }

  return null
}

/** Mid-stream or complete OpenRouter-style short thinking titles (not final-answer prose). */
export function looksLikeOpenRouterReasoningTitleChunk(chunk = '') {
  const text = String(chunk || '').trim()
  if (!text) return false
  if (isReasoningSectionHeading(text)) return true
  if (text.length > 80) return false
  if (/[.!?—–]/.test(text)) return false
  if (/^(Done\b|I(?:'|’)?ll\b|Here(?:'|’)?s\b)/i.test(text)) return false
  // Bold title in progress: **Creating... or **Creating title**
  if (/^\*\*[^*\n]*\*{0,2}$/.test(text)) return true
  // Plain -ing title in progress / complete without requiring full word count yet
  if (/^[A-Z][A-Za-z-]*ing\b/.test(text) && !/[0-9]/.test(text)) return true
  return false
}

/**
 * OpenRouter Codex streams short thinking titles on the reasoning lane, then often
 * also emits final-answer prose there (especially after tools seal the last title).
 * Drop non-title prose so it never flashes in the execution stream before prune.
 */
export function shouldDropOpenRouterAnswerReasoningChunk({
  chunk = '',
  previousEvent = null,
  smashed = null,
} = {}) {
  if (smashed?.heading) return false
  const detail = String(chunk || '').trim()
  if (!detail) return false
  if (isReasoningSectionHeading(detail) || looksLikeOpenRouterReasoningTitleChunk(detail)) {
    return false
  }
  const previousDetail = String(previousEvent?.detail || '').trim()
  const previousIsIncompleteTitle = (
    !!previousEvent
    && previousDetail
    && !isCompleteReasoningSectionHeading(previousDetail)
    && (
      previousEvent?.startsWithHeading === true
      || looksLikeOpenRouterReasoningTitleChunk(previousDetail)
      || isReasoningSectionHeading(previousDetail)
    )
  )
  // Allow tiny continuations that finish an in-progress title (" calculator**").
  if (
    previousIsIncompleteTitle
    && detail.length <= 40
    && !/^(Done\b|I(?:'|’)?ll\b|Here(?:'|’)?s\b)/i.test(detail)
    && !/[.!?—–]/.test(detail)
  ) {
    return false
  }
  return true
}

export function getReasoningEventIds(turn, {
  turnId = '',
  messageId = '',
  reasoningRole = '',
} = {}) {
  const normalizedTurnId = normalizeId(turnId)
  const normalizedMessageId = normalizeId(messageId)
  const normalizedReasoningRole = normalizeId(reasoningRole).toLowerCase()
  const ids = []
  for (const eventId of Array.isArray(turn?.eventOrder) ? turn.eventOrder : []) {
    const event = turn?.eventsById?.[eventId]
    if (!event || String(event.kind || '').trim() !== 'reasoning') continue
    if (event?.archived === true) continue
    if (normalizedMessageId && normalizeId(event.messageId) !== normalizedMessageId) continue
    if (normalizedReasoningRole && normalizeId(event.reasoningRole).toLowerCase() !== normalizedReasoningRole) continue
    if (!normalizedMessageId && normalizedTurnId && normalizeId(event.turnId) !== normalizedTurnId) continue
    ids.push(eventId)
  }
  return ids
}

export function hasLiveReasoningHistory(state = { turnsById: {} }, {
  turnId = '',
  messageId = '',
} = {}) {
  const normalizedTurnId = normalizeId(turnId)
  if (!normalizedTurnId) return false
  const turn = state?.turnsById?.[normalizedTurnId]
  if (!turn) return false
  return (
    getReasoningEventIds(turn, { turnId: normalizedTurnId, messageId }).length > 0
    || getReasoningEventIds(turn, { turnId: normalizedTurnId }).length > 0
  )
}

function normalizeComparableReasoningText(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}---\n{2,}/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

export function pruneTrailingDuplicateReasoningEvents(turn = {}, {
  messageId = '',
  assistantText = '',
} = {}) {
  const normalizedMessageId = normalizeId(messageId)
  const normalizedAssistant = normalizeComparableReasoningText(assistantText)
  if (!normalizedAssistant) return false

  let changed = false
  if (normalizedMessageId) {
    const trailingIds = []
    const order = Array.isArray(turn?.eventOrder) ? turn.eventOrder : []
    for (let index = order.length - 1; index >= 0; index -= 1) {
      const eventId = order[index]
      const event = turn?.eventsById?.[eventId]
      if (!event || event.archived === true) break
      if (String(event.kind || '').trim() !== 'reasoning') break
      if (normalizeId(event.messageId) !== normalizedMessageId) break
      trailingIds.unshift(eventId)
    }
    if (trailingIds.length > 0) {
      const trailingText = trailingIds
        .map((eventId) => String(turn?.eventsById?.[eventId]?.detail || ''))
        .filter((detail) => detail.trim().length > 0)
        .join('\n\n---\n\n')
      if (normalizeComparableReasoningText(trailingText) === normalizedAssistant) {
        for (const eventId of trailingIds) {
          removeTurnEvent(turn, eventId)
        }
        changed = true
      }
    }
  }

  const commentaryIds = []
  const order = Array.isArray(turn?.eventOrder) ? turn.eventOrder : []
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const eventId = order[index]
    const event = turn?.eventsById?.[eventId]
    if (!event || event.archived === true) break
    if (String(event.kind || '').trim() !== 'reasoning') break
    const eventMessageId = normalizeId(event.messageId)
    if (!eventMessageId.startsWith('execution_commentary:')) break
    commentaryIds.unshift(eventId)
  }
  if (commentaryIds.length > 0) {
    const commentaryText = commentaryIds
      .map((eventId) => String(turn?.eventsById?.[eventId]?.detail || ''))
      .filter((detail) => detail.trim().length > 0)
      .join('\n\n---\n\n')
    const normalizedCommentary = normalizeComparableReasoningText(commentaryText)
    if (
      normalizedCommentary === normalizedAssistant
      || (normalizedCommentary && normalizedAssistant.includes(normalizedCommentary))
    ) {
      for (const eventId of commentaryIds) {
        removeTurnEvent(turn, eventId)
      }
      changed = true
    }
  }

  // Strip answer suffixes from any remaining reasoning events (mashed title+answer).
  const eventOrder = Array.isArray(turn?.eventOrder) ? turn.eventOrder : []
  for (const eventId of eventOrder) {
    const event = turn?.eventsById?.[eventId]
    if (!event || event.archived === true) continue
    if (String(event.kind || '').trim() !== 'reasoning') continue
    const detail = String(event.detail || '')
    const stripped = stripLeakedAssistantAnswerFromExecutionDetail(detail, assistantText)
    if (stripped === detail) continue
    if (!String(stripped || '').trim()) {
      removeTurnEvent(turn, eventId)
      changed = true
      continue
    }
    turn.eventsById[eventId] = {
      ...event,
      detail: stripped,
      ...buildReasoningDisplayFields(stripped, event.status),
    }
    changed = true
  }

  if (changed) syncReasoningArchiveEvent(turn)
  return changed
}
