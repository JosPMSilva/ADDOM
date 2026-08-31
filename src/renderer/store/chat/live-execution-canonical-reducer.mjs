import { normalizeExecutionEvent } from '../../../common/chat/execution-event-contract.mjs'
import { resolveExecutionReasoningMessageId } from '../../../common/chat/reasoning-segment.mjs'
import {
  extractToolIdentityDetail,
  isPlaceholderToolInputDetail,
} from '../../../common/chat/tool-identity.mjs'
import { mergeReasoningChunks } from './live-execution-store-reasoning.mjs'
import { stripLeakedAssistantAnswerFromExecutionDetail } from './execution-answer-leak.mjs'
import {
  clearPendingReasoningSegmentBump,
  maybeApplyPendingReasoningSegmentBump,
  maybeBumpReasoningSegmentOnToolStarted,
} from './reasoning-segment-boundary.mjs'

const TERMINAL_STATUS_BY_STATE = Object.freeze({
  succeeded: 'done',
  failed: 'error',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
})

function eventIdentity(event) {
  if (event.eventId) return event.eventId
  if (event.kind === 'reasoning_chunk') return ''
  return [
    event.kind,
    event.turnId,
    event.sessionId,
    event.messageId,
    event.sequence,
    event.emittedAt,
    event.stream,
  ].join(':')
}

function cloneSession(session = {}) {
  return {
    ...session,
    outputs: Array.isArray(session?.outputs) ? [...session.outputs] : [],
    diagnosticIds: Array.isArray(session?.diagnosticIds) ? [...session.diagnosticIds] : [],
  }
}

function cloneTurn(turn = {}, event = {}) {
  const emittedAt = Number(event?.emittedAt || 0) || Date.now()
  return {
    ...turn,
    turnId: String(turn?.turnId || event?.turnId || ''),
    threadId: String(turn?.threadId || event?.threadId || ''),
    providerId: String(turn?.providerId || event?.providerId || ''),
    status: String(turn?.status || 'active'),
    terminalState: String(turn?.terminalState || ''),
    createdAt: Number(turn?.createdAt || emittedAt) || emittedAt,
    updatedAt: Number(turn?.updatedAt || emittedAt) || emittedAt,
    itemOrder: Array.isArray(turn?.itemOrder) ? [...turn.itemOrder] : [],
    sessionsById: turn?.sessionsById && typeof turn.sessionsById === 'object'
      ? { ...turn.sessionsById }
      : {},
    reasoningById: turn?.reasoningById && typeof turn.reasoningById === 'object'
      ? { ...turn.reasoningById }
      : {},
    diagnosticsById: turn?.diagnosticsById && typeof turn.diagnosticsById === 'object'
      ? { ...turn.diagnosticsById }
      : {},
    fileChangesById: turn?.fileChangesById && typeof turn.fileChangesById === 'object'
      ? { ...turn.fileChangesById }
      : {},
    seenEventIds: turn?.seenEventIds && typeof turn.seenEventIds === 'object'
      ? { ...turn.seenEventIds }
      : {},
    executionReasoningSegment: Math.max(0, Number(turn?.executionReasoningSegment || 0) || 0),
    pendingReasoningSegmentBump: turn?.pendingReasoningSegmentBump === true,
  }
}

function withItem(turn, itemId) {
  if (!itemId || turn.itemOrder.includes(itemId)) return
  const sourceTimestamp = (candidateId) => {
    if (candidateId.startsWith('tool:')) {
      return Number(turn.sessionsById?.[candidateId.slice('tool:'.length)]?.startedAt || 0) || 0
    }
    if (candidateId.startsWith('reasoning:')) {
      return Number(turn.reasoningById?.[candidateId.slice('reasoning:'.length)]?.createdAt || 0) || 0
    }
    return 0
  }
  const emittedAt = sourceTimestamp(itemId)
  if (!emittedAt) {
    turn.itemOrder.push(itemId)
    return
  }
  const insertionIndex = turn.itemOrder.findIndex((existingId) => {
    const existingAt = sourceTimestamp(existingId)
    return (
      existingAt > emittedAt
      && Math.abs(existingAt - emittedAt) <= 24 * 60 * 60 * 1000
    )
  })
  if (insertionIndex < 0) turn.itemOrder.push(itemId)
  else turn.itemOrder.splice(insertionIndex, 0, itemId)
}

function ensureSession(turn, event) {
  const sessionId = event.sessionId
  if (!sessionId) return null
  const existing = turn.sessionsById[sessionId]
  const session = existing
    ? cloneSession(existing)
    : {
        id: sessionId,
        toolKind: event.toolKind,
        state: 'active',
        startedAt: event.emittedAt,
        completedAt: 0,
        inputDetail: '',
        detail: '',
        outputs: [],
        diagnosticIds: [],
      }
  if (!session.toolKind && event.toolKind) session.toolKind = event.toolKind
  turn.sessionsById[sessionId] = session
  withItem(turn, `tool:${sessionId}`)
  return session
}

function reduceToolEvent(turn, event, identity) {
  const session = ensureSession(turn, event)
  if (!session) return
  if (session.executionBoundarySeen !== true) {
    maybeBumpReasoningSegmentOnToolStarted(turn, { emittedAt: event.emittedAt })
    session.executionBoundarySeen = true
  }
  if (event.kind === 'tool_started') {
    session.state = event.state || 'active'
    session.startedAt = Number(session.startedAt || event.emittedAt) || event.emittedAt
    // Never stick provider status placeholders as L2 identity; wait for real input.
    if (event.detail && !isPlaceholderToolInputDetail(event.detail)) {
      session.inputDetail = event.detail
    } else {
      const extracted = extractToolIdentityDetail({
        toolInput: event.toolInput,
        detail: event.detail,
        toolKind: session.toolKind || event.toolKind,
      })
      if (extracted) session.inputDetail = extracted
    }
    return
  }
  if (event.kind === 'tool_output') {
    session.outputs.push({
      eventId: identity,
      stream: event.stream || 'stdout',
      detail: event.detail,
      sequence: event.sequence,
      emittedAt: event.emittedAt,
    })
    session.outputs.sort((left, right) => (
      (Number(left?.sequence || 0) - Number(right?.sequence || 0))
      || (Number(left?.emittedAt || 0) - Number(right?.emittedAt || 0))
    ))
    return
  }
  session.state = event.state || 'succeeded'
  session.completedAt = event.emittedAt
  if (event.detail) session.detail = event.detail
  if (!session.inputDetail || isPlaceholderToolInputDetail(session.inputDetail)) {
    const extracted = extractToolIdentityDetail({
      detail: event.detail,
      toolInput: event.toolInput,
      output: event.output,
      toolKind: session.toolKind || event.toolKind,
    })
    if (extracted) session.inputDetail = extracted
  }
}

function reduceReasoningEvent(turn, event) {
  const role = event.reasoningRole || 'commentary'
  maybeApplyPendingReasoningSegmentBump(turn, {
    emittedAt: event.emittedAt,
    nextDetail: event.detail,
  })
  const segment = event.reasoningSegment == null
    ? Math.max(0, Number(turn.executionReasoningSegment || 0) || 0)
    : Math.max(0, Number(event.reasoningSegment) || 0)
  const resolvedMessageId = resolveExecutionReasoningMessageId({
    turnId: event.turnId,
    segment,
    providerId: turn.providerId,
    reasoningRole: role,
    explicitMessageId: event.messageId,
  })
  const messageId = (
    role !== 'stage'
    && segment > 0
    && String(resolvedMessageId).startsWith('execution_commentary:')
    && !/:segment:\d+$/.test(String(resolvedMessageId))
  )
    ? `${resolvedMessageId}:segment:${segment}`
    : resolvedMessageId
  const itemId = `reasoning:${messageId}`
  const existing = turn.reasoningById[messageId]
  const isStage = role === 'stage'
  const chunks = isStage
    ? [event.detail]
    : (Array.isArray(existing?.chunks)
      ? [...existing.chunks, event.detail]
      : (existing?.detail ? [existing.detail, event.detail] : [event.detail]))
  turn.reasoningById[messageId] = {
    id: messageId,
    role,
    detail: isStage ? event.detail : mergeReasoningChunks(chunks),
    ...(isStage ? {} : { chunks }),
    createdAt: Number(existing?.createdAt || event.emittedAt) || event.emittedAt,
    updatedAt: event.emittedAt,
    state: event.state || 'active',
  }
  withItem(turn, itemId)
  if (!isStage) {
    maybeApplyPendingReasoningSegmentBump(turn, { emittedAt: event.emittedAt })
  }
}

function closeSessionsInTurn(turn, completedAt) {
  for (const [sessionId, current] of Object.entries(turn.sessionsById)) {
    if (!['queued', 'active'].includes(String(current?.state || 'active'))) continue
    turn.sessionsById[sessionId] = {
      ...cloneSession(current),
      state: 'interrupted',
      completedAt,
    }
  }
}

export function reduceCanonicalExecutionEvent(state = { turnsById: {}, turnOrder: [] }, input = {}) {
  const providerId = String(input?.providerId || '').trim().toLowerCase()
  const event = normalizeExecutionEvent(input)
  const identity = eventIdentity(event)
  const currentTurn = state?.turnsById?.[event.turnId]
  if (identity && currentTurn?.seenEventIds?.[identity]) return state

  const turn = cloneTurn(currentTurn, {
    ...event,
    ...(providerId ? { providerId } : {}),
  })
  if (identity) turn.seenEventIds[identity] = true
  turn.updatedAt = Math.max(Number(turn.updatedAt || 0), Number(event.emittedAt || 0))
  if (providerId && !turn.providerId) {
    turn.providerId = providerId
  }

  if (['tool_started', 'tool_output', 'tool_result'].includes(event.kind)) {
    reduceToolEvent(turn, event, identity)
  } else if (event.kind === 'reasoning_chunk') {
    reduceReasoningEvent(turn, event)
  } else if (event.kind === 'diagnostic') {
    turn.diagnosticsById[identity] = {
      id: identity,
      severity: event.diagnosticSeverity || 'info',
      detail: event.detail,
      emittedAt: event.emittedAt,
      sessionId: event.sessionId,
    }
    if (event.sessionId && turn.sessionsById[event.sessionId]) {
      const session = cloneSession(turn.sessionsById[event.sessionId])
      if (!session.diagnosticIds.includes(identity)) session.diagnosticIds.push(identity)
      turn.sessionsById[event.sessionId] = session
    }
  } else if (event.kind === 'file_change') {
    turn.fileChangesById[identity] = {
      id: identity,
      detail: event.detail,
      state: event.state,
      emittedAt: event.emittedAt,
    }
  }

  if (event.kind === 'turn_state' && event.terminal) {
    turn.terminalState = event.state
    turn.status = TERMINAL_STATUS_BY_STATE[event.state]
    closeSessionsInTurn(turn, event.emittedAt)
    clearPendingReasoningSegmentBump(turn)
  }

  const turnOrder = Array.isArray(state?.turnOrder) ? [...state.turnOrder] : []
  if (!turnOrder.includes(event.turnId)) turnOrder.push(event.turnId)
  return {
    ...state,
    turnsById: {
      ...(state?.turnsById || {}),
      [event.turnId]: turn,
    },
    turnOrder,
  }
}

export function closeIncompleteToolSessions(state = { turnsById: {}, turnOrder: [] }, {
  turnId = '',
  completedAt = 0,
  terminalState = '',
} = {}) {
  const normalizedTurnId = String(turnId || '').trim()
  const currentTurn = state?.turnsById?.[normalizedTurnId]
  if (!normalizedTurnId || !currentTurn) return state
  const turn = cloneTurn(currentTurn, { turnId: normalizedTurnId, emittedAt: completedAt })
  closeSessionsInTurn(turn, Number(completedAt || 0) || Date.now())
  if (TERMINAL_STATUS_BY_STATE[terminalState]) {
    turn.terminalState = terminalState
    turn.status = TERMINAL_STATUS_BY_STATE[terminalState]
  }
  turn.updatedAt = Math.max(Number(turn.updatedAt || 0), Number(completedAt || 0))
  return {
    ...state,
    turnsById: {
      ...(state?.turnsById || {}),
      [normalizedTurnId]: turn,
    },
  }
}

function normalizeComparableExecutionText(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function pruneDuplicatedExecutionCommentaryFromCanonicalState(
  state = { turnsById: {}, turnOrder: [] },
  { turnId = '', assistantText = '' } = {},
) {
  const normalizedTurnId = String(turnId || '').trim()
  const normalizedAssistant = normalizeComparableExecutionText(assistantText)
  if (!normalizedTurnId || !normalizedAssistant) return state
  const currentTurn = state?.turnsById?.[normalizedTurnId]
  if (!currentTurn?.reasoningById) return state

  const turn = cloneTurn(currentTurn, { turnId: normalizedTurnId, emittedAt: Date.now() })
  let changed = false
  for (const [messageId, reasoning] of Object.entries(turn.reasoningById)) {
    const isCommentary = String(messageId || '').startsWith('execution_commentary:')
    const detail = String(reasoning?.detail || '')
    const normalizedDetail = normalizeComparableExecutionText(detail)
    if (!normalizedDetail) continue

    const stripped = stripLeakedAssistantAnswerFromExecutionDetail(detail, assistantText)
    if (stripped === detail) {
      if (!isCommentary) continue
      if (normalizedDetail !== normalizedAssistant && !normalizedAssistant.includes(normalizedDetail)) continue
      delete turn.reasoningById[messageId]
      turn.itemOrder = turn.itemOrder.filter((itemId) => itemId !== `reasoning:${messageId}`)
      changed = true
      continue
    }

    if (!String(stripped || '').trim()) {
      delete turn.reasoningById[messageId]
      turn.itemOrder = turn.itemOrder.filter((itemId) => itemId !== `reasoning:${messageId}`)
      changed = true
      continue
    }

    turn.reasoningById[messageId] = {
      ...reasoning,
      detail: stripped,
    }
    changed = true
  }
  if (!changed) return state
  return {
    ...state,
    turnsById: {
      ...(state?.turnsById || {}),
      [normalizedTurnId]: turn,
    },
  }
}
