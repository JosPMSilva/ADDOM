import {
  bumpExecutionReasoningSegment,
  readExecutionReasoningSegment,
  resolveExecutionReasoningMessageId,
} from '../../../common/chat/reasoning-segment.mjs'
import { endsWithSentenceBoundary } from '../../../common/chat/reasoning-sentence-boundary.mjs'
import { buildReasoningDisplayState } from './reasoning-stream-segmentation.mjs'

function normalizeStatus(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveTurnId(turn = {}) {
  return String(turn?.turnId || turn?.id || '').trim()
}

export function readActiveExecutionReasoningDetail(turn = {}) {
  if (!turn?.reasoningById || typeof turn.reasoningById !== 'object') return ''
  const turnId = resolveTurnId(turn)
  const messageId = resolveExecutionReasoningMessageId({
    turnId,
    segment: readExecutionReasoningSegment(turn),
    providerId: String(turn?.providerId || '').trim().toLowerCase() || 'cursor',
  })
  const preferred = turn.reasoningById[messageId]
  if (preferred && String(preferred.role || '').trim().toLowerCase() !== 'stage') {
    return String(preferred.detail || '')
  }
  let latest = ''
  let latestAt = 0
  for (const reasoning of Object.values(turn.reasoningById)) {
    if (String(reasoning?.role || '').trim().toLowerCase() === 'stage') continue
    if (normalizeStatus(reasoning?.state) === 'done') continue
    const at = Number(reasoning?.updatedAt || reasoning?.createdAt || 0) || 0
    if (at >= latestAt) {
      latestAt = at
      latest = String(reasoning?.detail || '')
    }
  }
  return latest
}

/**
 * Seal active reasoning before tool_started bumps the execution reasoning segment.
 * Flushes pending display tails into stableDetail and marks live/canonical slots done
 * so mid-stream markdown/buffer state is not dropped across the segment boundary.
 */
export function flushActiveReasoningBeforeSegmentBump(turn = {}, { emittedAt = Date.now() } = {}) {
  if (!turn || typeof turn !== 'object') return false
  const at = Number(emittedAt || 0) || Date.now()
  let changed = false

  if (turn.eventsById && typeof turn.eventsById === 'object') {
    for (const eventId of Object.keys(turn.eventsById)) {
      const event = turn.eventsById[eventId]
      if (!event || String(event.kind || '').trim() !== 'reasoning' || event.archived === true) continue
      if (normalizeStatus(event.status) !== 'active') continue
      const displayState = buildReasoningDisplayState(String(event.detail || ''), { terminal: true })
      turn.eventsById[eventId] = {
        ...event,
        status: 'done',
        updatedAt: Math.max(Number(event.updatedAt || 0) || 0, at),
        stableDetail: String(displayState?.stableDetail || ''),
        pendingTail: String(displayState?.pendingTail || ''),
        hasPendingTail: displayState?.hasPendingTail === true,
      }
      changed = true
    }
  }

  if (turn.reasoningById && typeof turn.reasoningById === 'object') {
    for (const [messageId, reasoning] of Object.entries(turn.reasoningById)) {
      if (String(reasoning?.role || '').trim().toLowerCase() === 'stage') continue
      if (normalizeStatus(reasoning?.state) === 'done') continue
      turn.reasoningById[messageId] = {
        ...reasoning,
        id: reasoning?.id || messageId,
        state: 'done',
        updatedAt: Math.max(Number(reasoning?.updatedAt || 0) || 0, at),
      }
      changed = true
    }
  }

  if (changed) {
    turn.updatedAt = Math.max(Number(turn.updatedAt || 0) || 0, at)
  }
  return changed
}

function applySegmentBump(turn = {}, { emittedAt = Date.now() } = {}) {
  flushActiveReasoningBeforeSegmentBump(turn, { emittedAt })
  bumpExecutionReasoningSegment(turn)
  turn.pendingReasoningSegmentBump = false
}

function isStandaloneReasoningHeadingChunk(detail = '') {
  const text = String(detail || '').trim()
  if (!text || text.includes('\n')) return false
  return /^\*\*\S[\s\S]*\*\*$/.test(text)
}

/**
 * On tool_started: bump immediately when the open reasoning ends on a sentence
 * boundary; otherwise keep the segment open and mark a pending bump so later
 * thinking can finish the clause before the next segment starts.
 * Always returns whether a bump was applied now.
 */
export function maybeBumpReasoningSegmentOnToolStarted(turn = {}, { emittedAt = Date.now() } = {}) {
  if (!turn || typeof turn !== 'object') return false
  const detail = readActiveExecutionReasoningDetail(turn)
  if (!detail.trim() || endsWithSentenceBoundary(detail)) {
    applySegmentBump(turn, { emittedAt })
    return true
  }
  turn.pendingReasoningSegmentBump = true
  return false
}

/**
 * After a reasoning chunk lands, apply a deferred bump once the open segment
 * ends on a sentence boundary (completing text stays in the current segment).
 */
export function maybeApplyPendingReasoningSegmentBump(turn = {}, {
  emittedAt = Date.now(),
  nextDetail = '',
} = {}) {
  if (!turn || typeof turn !== 'object') return false
  if (turn.pendingReasoningSegmentBump !== true) return false
  // A complete standalone heading is a provider/language-neutral signal that
  // the post-tool thought has begun. Move it after the tool instead of
  // appending it to an unfinished pre-tool heading.
  if (isStandaloneReasoningHeadingChunk(nextDetail)) {
    applySegmentBump(turn, { emittedAt })
    return true
  }
  const detail = readActiveExecutionReasoningDetail(turn)
  if (!endsWithSentenceBoundary(detail)) return false
  applySegmentBump(turn, { emittedAt })
  return true
}

/** Turn end: drop pending flag without inventing a new empty segment. */
export function clearPendingReasoningSegmentBump(turn = {}) {
  if (!turn || typeof turn !== 'object') return false
  if (turn.pendingReasoningSegmentBump !== true) return false
  turn.pendingReasoningSegmentBump = false
  return true
}
