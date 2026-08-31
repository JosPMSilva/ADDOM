import {
  getCollapsedReasoningBlocks,
  trimTurnBucket,
} from './live-execution-store-reasoning.mjs'
import {
  normalizeLiveExecutionId as normalizeId,
  normalizeLiveExecutionNumber as normalizeNumber,
} from './live-execution-store-normalizers.mjs'

const MAX_LIVE_TURNS = 64

function createTurnBucket(turnId, {
  threadId = '',
  createdAt = Date.now(),
} = {}) {
  return {
    turnId,
    threadId,
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    eventOrder: [],
    eventsById: {},
    sessionOrder: [],
    sessionsById: {},
    nextReasoningSeq: 1,
    collapsedReasoningText: '',
    collapsedReasoningCount: 0,
    collapsedReasoningBlocks: [],
  }
}

function cloneTurnBucket(turn) {
  return {
    ...turn,
    eventOrder: Array.isArray(turn?.eventOrder) ? [...turn.eventOrder] : [],
    eventsById: turn?.eventsById && typeof turn.eventsById === 'object' ? { ...turn.eventsById } : {},
    sessionOrder: Array.isArray(turn?.sessionOrder) ? [...turn.sessionOrder] : [],
    sessionsById: turn?.sessionsById && typeof turn.sessionsById === 'object' ? { ...turn.sessionsById } : {},
    nextReasoningSeq: Math.max(0, Number(turn?.nextReasoningSeq || 0) || 0),
    collapsedReasoningText: String(turn?.collapsedReasoningText || ''),
    collapsedReasoningCount: Math.max(0, Number(turn?.collapsedReasoningCount || 0) || 0),
    collapsedReasoningBlocks: getCollapsedReasoningBlocks(turn),
  }
}

export function resolveNextReasoningSequence(turn, turnId = '') {
  const current = Number(turn?.nextReasoningSeq || 0) || 0
  if (current > 0) return current
  const normalizedTurnId = normalizeId(turnId || turn?.turnId)
  let maxSeen = 0
  for (const eventId of Array.isArray(turn?.eventOrder) ? turn.eventOrder : []) {
    const event = turn?.eventsById?.[eventId]
    if (!event || String(event.kind || '').trim() !== 'reasoning' || event?.archived === true) continue
    const id = String(event.id || '')
    const prefix = `reasoning:${normalizedTurnId}:`
    if (!id.startsWith(prefix)) continue
    const n = Number(id.slice(prefix.length) || 0) || 0
    if (n > maxSeen) maxSeen = n
  }
  const next = Math.max(1, maxSeen + 1)
  turn.nextReasoningSeq = next
  return next
}

export function ensureTurnBucket(state, turnId, meta = {}) {
  const normalizedTurnId = normalizeId(turnId)
  if (!normalizedTurnId) return null
  const current = state?.turnsById?.[normalizedTurnId]
  const turn = current
    ? cloneTurnBucket(current)
    : createTurnBucket(normalizedTurnId, meta)
  if (!turn.threadId && meta?.threadId) turn.threadId = normalizeId(meta.threadId)
  if (!turn.createdAt) turn.createdAt = normalizeNumber(meta?.createdAt, Date.now())
  return turn
}

export function finalizeStateWithTurn(state, turn) {
  const nextOrder = Array.isArray(state?.turnOrder) ? [...state.turnOrder] : []
  if (!nextOrder.includes(turn.turnId)) nextOrder.push(turn.turnId)
  while (nextOrder.length > MAX_LIVE_TURNS) nextOrder.shift()
  const allowedTurns = new Set(nextOrder)
  const nextTurnsById = {}
  for (const turnId of allowedTurns) {
    if (turnId === turn.turnId) {
      nextTurnsById[turnId] = trimTurnBucket(turn)
      continue
    }
    const existing = state?.turnsById?.[turnId]
    if (existing) nextTurnsById[turnId] = existing
  }
  if (!allowedTurns.has(turn.turnId)) nextTurnsById[turn.turnId] = trimTurnBucket(turn)
  return { turnsById: nextTurnsById, turnOrder: nextOrder }
}
