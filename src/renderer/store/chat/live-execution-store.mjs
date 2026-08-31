import {
  buildReasoningEvent,
  buildReasoningActivity,
  getReasoningEventIds,
  hasLiveReasoningHistory,
  isReasoningSectionHeading,
  isCompleteReasoningSectionHeading,
  mergeReasoningChunks,
  pruneTrailingDuplicateReasoningEvents,
  shouldDropOpenRouterAnswerReasoningChunk,
  shouldStartNewReasoningBlock,
  splitSmashedReasoningHeadingProse,
  trimTurnBucket,
} from './live-execution-store-reasoning.mjs'
import {
  ensureTurnBucket,
  finalizeStateWithTurn,
  resolveNextReasoningSequence,
} from './live-execution-store-state.mjs'
import { allowsReasoningChunk } from '../../../common/chat/reasoning-phase-boundary.mjs'
import { resolveLiveExecutionReasoningIdentity } from './live-execution-reasoning-identity.mjs'
import {
  buildActivityEvent,
  mapActivityToLiveKind,
  mapActivityToCanonicalExecutionEvents,
  mapActivityToStatus,
  resolveActivityEventKind,
  resolveMoaDelegationTerminalStatus,
} from './live-execution-store-activity.mjs'
import { reduceCanonicalExecutionEvent, pruneDuplicatedExecutionCommentaryFromCanonicalState } from './live-execution-canonical-reducer.mjs'
import { liveExecutionTurnEqual } from './live-execution-store-equality.mjs'
import { buildReasoningDisplayState } from './reasoning-stream-segmentation.mjs'
import { normalizeLiveExecutionId as normalizeId, normalizeLiveExecutionNumber as normalizeNumber } from './live-execution-store-normalizers.mjs'

const MAX_LIVE_OUTPUT_CHARS = 12000
const LIVE_OUTPUT_TRUNCATION_MARKER = '\n...[truncated]'

function clampText(value = '', max = MAX_LIVE_OUTPUT_CHARS) {
  const text = String(value ?? '')
  if (text.length <= max) {
    return { text, truncated: false }
  }
  const keep = Math.max(0, max - LIVE_OUTPUT_TRUNCATION_MARKER.length)
  return {
    text: `${text.slice(-keep)}${LIVE_OUTPUT_TRUNCATION_MARKER}`,
    truncated: true,
  }
}

function stripTrailingTruncationMarker(value = '') {
  const text = String(value ?? '')
  return text.endsWith(LIVE_OUTPUT_TRUNCATION_MARKER)
    ? text.slice(0, -LIVE_OUTPUT_TRUNCATION_MARKER.length)
    : text
}

function normalizeMessageReasoningText(message = null) {
  const value = message?.reasoning
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    return String(value.text ?? value.value ?? '')
  }
  return ''
}

function resolveMessageReasoningMode(message = null) {
  return String(message?.reasoningMeta?.mode || message?.reasoning?.mode || '').trim().toLowerCase()
}

function resolveMessageReasoningDone(message = null) {
  return message?.reasoningDone === true || message?.reasoning?.done === true
}

function createSessionBucket(sessionId, {
  turnId = '',
  stepId = '',
  toolName = '',
  createdAt = Date.now(),
} = {}) {
  return {
    id: sessionId,
    turnId,
    stepId,
    toolName,
    createdAt,
    updatedAt: createdAt,
    startedAt: createdAt,
    finishedAt: 0,
    status: 'active',
    output: {
      stdout: { text: '', truncated: false, updatedAt: 0 },
      stderr: { text: '', truncated: false, updatedAt: 0 },
    },
  }
}

function ensureSession(turn, sessionId, meta = {}) {
  const normalizedSessionId = normalizeId(sessionId)
  if (!normalizedSessionId) return null
  const current = turn.sessionsById[normalizedSessionId]
  const session = current
    ? {
        ...current,
        output: {
          stdout: { ...(current.output?.stdout || {}) },
          stderr: { ...(current.output?.stderr || {}) },
        },
      }
    : createSessionBucket(normalizedSessionId, meta)
  if (!turn.sessionOrder.includes(normalizedSessionId)) turn.sessionOrder.push(normalizedSessionId)
  turn.sessionsById[normalizedSessionId] = session
  return session
}

function upsertTurnEvent(turn, event) {
  const eventId = normalizeId(event?.id)
  if (!eventId) return
  const existing = turn.eventsById[eventId]
  if (!turn.eventOrder.includes(eventId)) turn.eventOrder.push(eventId)
  turn.eventsById[eventId] = existing
    ? {
        ...existing,
        ...event,
        id: eventId,
        createdAt: normalizeNumber(existing.createdAt, Date.now()),
        updatedAt: normalizeNumber(event.updatedAt, Date.now()),
      }
    : {
        ...event,
        id: eventId,
        createdAt: normalizeNumber(event.createdAt, Date.now()),
        updatedAt: normalizeNumber(event.updatedAt, Date.now()),
      }
  const existingOrder = new Map(turn.eventOrder.map((id, index) => [id, index]))
  turn.eventOrder.sort((leftId, rightId) => {
    const left = turn.eventsById[leftId]
    const right = turn.eventsById[rightId]
    const leftCreatedAt = normalizeNumber(left?.createdAt, 0)
    const rightCreatedAt = normalizeNumber(right?.createdAt, 0)
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt
    const leftSequence = Number(left?.sequence || left?.activity?.sequence || 0) || 0
    const rightSequence = Number(right?.sequence || right?.activity?.sequence || 0) || 0
    if (leftSequence !== rightSequence) return leftSequence - rightSequence
    const leftKind = String(left?.kind || '').trim().toLowerCase()
    const rightKind = String(right?.kind || '').trim().toLowerCase()
    const kindPriority = {
      transport: 1,
      tool_start: 2,
      tool_progress: 3,
      reasoning: 4,
      compaction: 5,
      file_change: 6,
      usage: 7,
      tool_output: 8,
      tool_result: 9,
      warning: 10,
      error: 11,
    }
    const leftPriority = kindPriority[leftKind] || 99
    const rightPriority = kindPriority[rightKind] || 99
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    return (existingOrder.get(leftId) ?? Number.MAX_SAFE_INTEGER)
      - (existingOrder.get(rightId) ?? Number.MAX_SAFE_INTEGER)
  })
}

function updateTurnStatus(turn, status = '', updatedAt = 0) {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) return
  turn.status = normalized
  turn.updatedAt = normalizeNumber(updatedAt, turn.updatedAt || Date.now())
}

export function createEmptyLiveExecutionState() {
  return {
    turnsById: {},
    turnOrder: [],
  }
}

export function resolveLiveExecutionCommentaryMessageId(turnId = '', round = 0) {
  const normalizedTurnId = normalizeId(turnId)
  const normalizedRound = Math.max(0, Number(round || 0) || 0)
  return normalizedTurnId ? `execution_commentary:${normalizedTurnId}:${normalizedRound}` : 'execution_commentary'
}

export function upsertLiveExecutionActivity(state = createEmptyLiveExecutionState(), activity = {}) {
  const eventKind = resolveActivityEventKind(activity)
  if (eventKind === 'provider_tool_status') {
    const turnId = normalizeId(activity?.turnId)
    if (!turnId) return state
    const turn = ensureTurnBucket(state, turnId, {
      threadId: normalizeId(activity?.threadId),
      createdAt: normalizeNumber(activity?.createdAt || activity?.startedAt, Date.now()),
    })
    if (!turn) return state
    const eventAt = normalizeNumber(activity?.createdAt || activity?.startedAt, Date.now())
    turn.updatedAt = Math.max(turn.updatedAt || 0, eventAt)
    // Segment flush/bump is owned by reduceCanonicalExecutionEvent (deferred when mid-sentence).
    let nextState = finalizeStateWithTurn(state, turn)
    for (const canonicalEvent of mapActivityToCanonicalExecutionEvents(activity)) {
      nextState = reduceCanonicalExecutionEvent(nextState, canonicalEvent)
    }
    return nextState
  }
  const turnId = normalizeId(activity?.turnId)
  if (!turnId) return state
  const currentTurn = state?.turnsById?.[turnId] || null
  const turn = ensureTurnBucket(state, turnId, {
    threadId: normalizeId(activity?.threadId),
    createdAt: normalizeNumber(activity?.createdAt || activity?.startedAt, Date.now()),
  })
  if (!turn) return state
  const liveKind = mapActivityToLiveKind(activity)
  const event = buildActivityEvent({
    ...activity,
    status: mapActivityToStatus(activity, liveKind, turn),
  })
  if (!event) return state
  event.status = mapActivityToStatus(activity, liveKind, turn)
  if (event.kind === 'reasoning') {
    turn.updatedAt = Math.max(turn.updatedAt || 0, event.updatedAt || event.createdAt || Date.now())
    upsertTurnEvent(turn, event)
  } else {
    upsertTurnEvent(turn, event)
  }

  if (event.sessionId) {
    const session = ensureSession(turn, event.sessionId, {
      turnId: event.turnId,
      stepId: event.stepId,
      toolName: String(activity?.toolName || '').trim(),
      createdAt: event.createdAt,
    })
    if (session) {
      if (!session.toolName) session.toolName = String(activity?.toolName || '').trim()
      session.updatedAt = event.updatedAt
      if (!session.startedAt) session.startedAt = event.createdAt
      if (event.kind === 'tool_result' || event.kind === 'error') {
        session.finishedAt = event.updatedAt
        for (const existingEventId of turn.eventOrder) {
          const existingEvent = turn.eventsById[existingEventId]
          if (!existingEvent || existingEvent.sessionId !== event.sessionId) continue
          if (String(existingEvent.kind || '').trim() !== 'tool_output') continue
          turn.eventsById[existingEventId] = {
            ...existingEvent,
            status: event.status,
            updatedAt: Math.max(Number(existingEvent.updatedAt || 0) || 0, event.updatedAt || 0),
          }
        }
      }
      session.status = event.status
    }
  }

  if (event.kind === 'transport' && String(activity?.turnState || '').trim()) {
    updateTurnStatus(turn, mapActivityToStatus(activity, event.kind, turn), event.updatedAt)
  } else if (eventKind === 'moa_delegation_done') {
    updateTurnStatus(turn, resolveMoaDelegationTerminalStatus(activity), event.updatedAt)
  }
  turn.updatedAt = Math.max(turn.updatedAt || 0, event.updatedAt || event.createdAt || Date.now())
  const canonicalEvents = mapActivityToCanonicalExecutionEvents(activity)
  let nextState = finalizeStateWithTurn(state, turn)
  for (const canonicalEvent of canonicalEvents) {
    nextState = reduceCanonicalExecutionEvent(nextState, canonicalEvent)
  }
  if (canonicalEvents.length === 0) {
    const finalizedTurn = trimTurnBucket(turn)
    if (
      currentTurn
      && Array.isArray(state?.turnOrder)
      && state.turnOrder.includes(finalizedTurn.turnId)
      && liveExecutionTurnEqual(currentTurn, finalizedTurn)
    ) {
      return state
    }
  }
  return nextState
}

export function pruneDuplicatedFinalReasoningFromLiveExecution(state = createEmptyLiveExecutionState(), {
  turnId = '',
  messageId = '',
  assistantText = '',
} = {}) {
  const normalizedTurnId = normalizeId(turnId)
  if (!normalizedTurnId) return state
  const turn = ensureTurnBucket(state, normalizedTurnId)
  if (!turn) return state
  const changed = pruneTrailingDuplicateReasoningEvents(turn, {
    messageId,
    assistantText,
  })
  let nextState = changed ? finalizeStateWithTurn(state, turn) : state
  nextState = pruneDuplicatedExecutionCommentaryFromCanonicalState(nextState, {
    turnId: normalizedTurnId,
    assistantText,
  })
  return nextState
}

export function appendLiveExecutionReasoningEvent(state = createEmptyLiveExecutionState(), {
  threadId = '',
  turnId = '',
  eventId = '',
  messageId = '',
  reasoningRole = '',
  chunk = '',
  forceNewBlock = false,
  emittedAt = 0,
  reasoningMeta = null,
  streamMeta = null,
} = {}) {
  const normalizedTurnId = normalizeId(turnId || streamMeta?.turnId)
  if (!normalizedTurnId) return state
  const normalizedEventId = normalizeId(eventId)
  if (normalizedEventId && state?.turnsById?.[normalizedTurnId]?.seenEventIds?.[normalizedEventId]) {
    return state
  }
  const normalizedChunk = String(chunk || '')
  if (!allowsReasoningChunk(normalizedChunk)) return state
  const eventAt = normalizeNumber(emittedAt || streamMeta?.lastChunkAt || reasoningMeta?.lastChunkAt, Date.now())
  const smashed = splitSmashedReasoningHeadingProse(normalizedChunk)
  // Keep the thinking title only when a provider glues final-answer prose onto it
  // in one reasoning chunk (common OpenRouter Codex smash).
  const detail = smashed?.heading || normalizedChunk
  const normalizedThreadId = normalizeId(threadId || streamMeta?.threadId)
  const turn = ensureTurnBucket(state, normalizedTurnId, {
    threadId: normalizedThreadId,
    createdAt: eventAt,
  })
  if (!turn) return state
  const normalizedMessageId = normalizeId(messageId)
  const normalizedReasoningRole = String(reasoningRole || '').trim().toLowerCase()
  const { providerId: normalizedProviderId, persistedSegment, segment: reasoningSegment, messageId: resolvedMessageId } = resolveLiveExecutionReasoningIdentity({
    turn,
    turnId: normalizedTurnId,
    messageId: normalizedMessageId,
    reasoningRole: normalizedReasoningRole,
    reasoningMeta,
    streamMeta,
  })
  const orderedEventIds = Array.isArray(turn.eventOrder) ? turn.eventOrder : []
  const candidateEventIds = normalizedReasoningRole === 'commentary'
    ? [...orderedEventIds].reverse()
    : orderedEventIds.slice(-1)
  const lastEventId = candidateEventIds
    .find((eventId) => {
      const candidate = turn.eventsById[eventId]
      return candidate?.kind === 'reasoning'
        && candidate?.archived !== true
        && String(candidate?.status || '').trim().toLowerCase() === 'active'
        && normalizeId(candidate?.messageId) === resolvedMessageId
    }) || ''
  const lastEvent = lastEventId ? turn.eventsById[lastEventId] : null
  const hasPriorReasoningEvent = orderedEventIds.some((eventId) => {
    const event = turn.eventsById[eventId]
    return event?.kind === 'reasoning' && event?.archived !== true
  })
  const previousIsCompletedHeading = (
    !!lastEvent
    && (
      isCompleteReasoningSectionHeading(String(lastEvent?.detail || '').trim())
      || (
        lastEvent?.startsWithHeading === true
        && isCompleteReasoningSectionHeading(String(lastEvent?.detail || '').trim())
      )
    )
  )
  // OpenRouter: drop final-answer prose that arrives after a sealed thinking title.
  if (
    normalizedProviderId === 'openrouter'
    && normalizedReasoningRole !== 'commentary'
    && hasPriorReasoningEvent
    && shouldDropOpenRouterAnswerReasoningChunk({
      chunk: detail,
      previousEvent: lastEvent,
      smashed,
    })
  ) {
    return state
  }
  // Non-OpenRouter: still drop obvious answer openers glued onto an active title.
  if (
    previousIsCompletedHeading
    && !forceNewBlock
    && !isReasoningSectionHeading(detail)
    && !smashed
    && /^(Done\s*[—–-]|I(?:'|’)?ll\b|Here(?:'|’)?s\b)/i.test(String(detail || '').trim())
  ) {
    return state
  }
  const canAppendToExistingBlock = (
    !forceNewBlock
    && lastEvent
    && String(lastEvent?.kind || '').trim() === 'reasoning'
    && lastEvent?.archived !== true
    && lastEvent?.reasoningBlock === true
    && String(lastEvent?.status || '').trim().toLowerCase() === 'active'
    && normalizeId(lastEvent?.messageId) === resolvedMessageId
    && (normalizedReasoningRole === 'commentary' || !shouldStartNewReasoningBlock(lastEvent, detail))
  )
  if (canAppendToExistingBlock) {
    const chunks = Array.isArray(lastEvent?.reasoningChunks) ? [...lastEvent.reasoningChunks, detail] : [String(lastEvent?.detail || ''), detail]
    const mergedDetail = mergeReasoningChunks(chunks, {
      startsWithHeading: lastEvent?.startsWithHeading === true,
    })
    const displayState = buildReasoningDisplayState(mergedDetail, { terminal: false })
    upsertTurnEvent(turn, {
      ...lastEvent,
      detail: mergedDetail,
      stableDetail: String(displayState?.stableDetail || ''),
      pendingTail: String(displayState?.pendingTail || ''),
      hasPendingTail: displayState?.hasPendingTail === true,
      reasoningChunks: chunks,
      updatedAt: eventAt,
      reasoningMeta: reasoningMeta && typeof reasoningMeta === 'object' ? { ...reasoningMeta } : lastEvent.reasoningMeta || null,
      streamMeta: streamMeta && typeof streamMeta === 'object' ? { ...streamMeta } : lastEvent.streamMeta || null,
      reasoningRole: String(reasoningRole || lastEvent?.reasoningRole || '').trim().toLowerCase(),
      activity: buildReasoningActivity({
        eventId: String(lastEvent.id || ''),
        turnId: normalizedTurnId,
        threadId: normalizedThreadId,
        detail: mergedDetail,
        createdAt: normalizeNumber(lastEvent?.createdAt, eventAt),
      }),
    })
  } else {
    const sequence = resolveNextReasoningSequence(turn, normalizedTurnId)
    turn.nextReasoningSeq = sequence + 1
    const eventId = `reasoning:${normalizedTurnId}:${sequence}`
    upsertTurnEvent(turn, buildReasoningEvent({
      eventId,
      turnId: normalizedTurnId,
      threadId: normalizedThreadId,
      messageId: resolvedMessageId,
      reasoningRole,
      detail,
      createdAt: eventAt,
      updatedAt: eventAt,
      reasoningMeta,
      streamMeta,
      status: 'active',
    }))
  }
  turn.updatedAt = Math.max(turn.updatedAt || 0, eventAt)
  const nextState = finalizeStateWithTurn(state, turn)
  return reduceCanonicalExecutionEvent(nextState, {
    kind: 'reasoning_chunk',
    threadId: normalizedThreadId,
    turnId: normalizedTurnId,
    eventId: normalizedEventId,
    messageId: resolvedMessageId,
    reasoningRole: String(reasoningRole || 'commentary').trim().toLowerCase(),
    ...(persistedSegment != null ? { reasoningSegment } : {}),
    state: 'active',
    detail,
    emittedAt: eventAt,
    ...(normalizedProviderId ? { providerId: normalizedProviderId } : {}),
  })
}
export function replaceLatestLiveExecutionReasoningSnapshot(state = createEmptyLiveExecutionState(), {
  threadId = '',
  turnId = '',
  messageId = '',
  reasoningRole = 'reasoning',
  detail = '',
  emittedAt = 0,
  reasoningMeta = null,
  streamMeta = null,
} = {}) {
  const normalizedTurnId = normalizeId(turnId || streamMeta?.turnId)
  const rawSnapshot = String(detail || '')
  if (!normalizedTurnId || !rawSnapshot.trim()) return state
  const smashed = splitSmashedReasoningHeadingProse(rawSnapshot)
  const snapshot = smashed?.heading || rawSnapshot
  const eventAt = normalizeNumber(emittedAt || streamMeta?.lastChunkAt || reasoningMeta?.lastChunkAt, Date.now())
  const turn = ensureTurnBucket(state, normalizedTurnId, {
    threadId: normalizeId(threadId || streamMeta?.threadId),
    createdAt: eventAt,
  })
  if (!turn) return state
  const { messageId: resolvedMessageId, persistedSegment } = resolveLiveExecutionReasoningIdentity({
    turn,
    turnId: normalizedTurnId,
    messageId: normalizeId(messageId),
    reasoningRole,
    reasoningMeta,
    streamMeta,
  })
  const exactIds = getReasoningEventIds(turn, {
    turnId: normalizedTurnId,
    messageId: resolvedMessageId,
  })
  const fallbackIds = persistedSegment == null
    ? getReasoningEventIds(turn, { turnId: normalizedTurnId }).filter((eventId) => {
      const role = String(turn.eventsById[eventId]?.reasoningRole || '').trim().toLowerCase()
      return role !== 'commentary' && role !== 'stage'
    })
    : []
  const eventId = (exactIds.length > 0 ? exactIds : fallbackIds).at(-1)
  if (!eventId) {
    return appendLiveExecutionReasoningEvent(state, {
      threadId,
      turnId: normalizedTurnId,
      messageId: resolvedMessageId,
      reasoningRole,
      chunk: snapshot,
      emittedAt: eventAt,
      reasoningMeta,
      streamMeta,
    })
  }

  const event = turn.eventsById[eventId]
  const displayState = buildReasoningDisplayState(snapshot, { terminal: false })
  turn.eventsById[eventId] = {
    ...event,
    reasoningRole: String(reasoningRole || event.reasoningRole || 'reasoning').trim().toLowerCase(),
    detail: snapshot,
    reasoningChunks: [snapshot],
    startsWithHeading: isReasoningSectionHeading(snapshot),
    stableDetail: String(displayState?.stableDetail || ''),
    pendingTail: String(displayState?.pendingTail || ''),
    hasPendingTail: displayState?.hasPendingTail === true,
    updatedAt: eventAt,
    reasoningMeta: reasoningMeta && typeof reasoningMeta === 'object' ? { ...reasoningMeta } : event.reasoningMeta || null,
    streamMeta: streamMeta && typeof streamMeta === 'object' ? { ...streamMeta } : event.streamMeta || null,
    activity: buildReasoningActivity({
      eventId,
      turnId: normalizedTurnId,
      threadId: normalizeId(threadId || turn.threadId),
      detail: snapshot,
      createdAt: normalizeNumber(event.createdAt, eventAt),
    }),
  }
  const canonicalId = normalizeId(event.messageId)
  if (canonicalId) {
    const existing = turn.reasoningById?.[canonicalId]
    turn.reasoningById = {
      ...(turn.reasoningById || {}),
      [canonicalId]: {
        ...(existing || {}),
        id: canonicalId,
        role: String(reasoningRole || existing?.role || event.reasoningRole || 'reasoning').trim().toLowerCase(),
        detail: snapshot,
        chunks: [snapshot],
        createdAt: Number(existing?.createdAt || event.createdAt || eventAt) || eventAt,
        updatedAt: eventAt,
        state: String(existing?.state || 'active'),
      },
    }
    const itemId = `reasoning:${canonicalId}`
    if (!turn.itemOrder.includes(itemId)) turn.itemOrder.push(itemId)
  }
  turn.updatedAt = Math.max(Number(turn.updatedAt || 0), eventAt)
  return finalizeStateWithTurn(state, turn)
}

export function patchLiveExecutionReasoningMetadata(state = createEmptyLiveExecutionState(), {
  threadId = '',
  turnId = '',
  messageId = '',
  reasoningRole = '',
  reasoningMeta = null,
  streamMeta = null,
} = {}) {
  const normalizedTurnId = normalizeId(turnId || streamMeta?.turnId)
  if (!normalizedTurnId) return state
  const turn = ensureTurnBucket(state, normalizedTurnId, {
    threadId: normalizeId(threadId || streamMeta?.threadId),
    createdAt: normalizeNumber(streamMeta?.startedAt || reasoningMeta?.firstChunkAt, Date.now()),
  })
  if (!turn) return state
  const eventIds = getReasoningEventIds(turn, {
    turnId: normalizedTurnId,
    messageId,
    reasoningRole,
  })
  if (eventIds.length === 0) return state
  const updatedAt = normalizeNumber(streamMeta?.lastChunkAt || reasoningMeta?.lastChunkAt || streamMeta?.completedAt, turn.updatedAt || Date.now())
  for (const eventId of eventIds) {
    const event = turn.eventsById[eventId]
    if (!event || String(event.status || '').trim() !== 'active') continue
    turn.eventsById[eventId] = {
      ...event,
      updatedAt,
      reasoningMeta: reasoningMeta && typeof reasoningMeta === 'object' ? { ...reasoningMeta } : event.reasoningMeta || null,
      streamMeta: streamMeta && typeof streamMeta === 'object' ? { ...streamMeta } : event.streamMeta || null,
    }
  }
  turn.updatedAt = Math.max(turn.updatedAt || 0, updatedAt)
  return finalizeStateWithTurn(state, turn)
}

export function markLiveExecutionReasoningDone(state = createEmptyLiveExecutionState(), {
  threadId = '',
  turnId = '',
  messageId = '',
  reasoningRole = '',
  reasoningMeta = null,
  streamMeta = null,
} = {}) {
  const normalizedTurnId = normalizeId(turnId || streamMeta?.turnId)
  if (!normalizedTurnId) return state
  const turn = ensureTurnBucket(state, normalizedTurnId, {
    threadId: normalizeId(threadId || streamMeta?.threadId),
    createdAt: normalizeNumber(streamMeta?.startedAt || reasoningMeta?.firstChunkAt, Date.now()),
  })
  if (!turn) return state
  const eventIds = getReasoningEventIds(turn, {
    turnId: normalizedTurnId,
    messageId,
    reasoningRole,
  })
  if (eventIds.length === 0) return state
  const updatedAt = normalizeNumber(streamMeta?.completedAt || reasoningMeta?.lastChunkAt || Date.now(), Date.now())
  for (const eventId of eventIds) {
    const event = turn.eventsById[eventId]
    if (!event) continue
    const displayState = buildReasoningDisplayState(String(event?.detail || ''), { terminal: true })
    turn.eventsById[eventId] = {
      ...event,
      status: 'done',
      updatedAt,
      stableDetail: String(displayState?.stableDetail || ''),
      pendingTail: String(displayState?.pendingTail || ''),
      hasPendingTail: displayState?.hasPendingTail === true,
      reasoningMeta: reasoningMeta && typeof reasoningMeta === 'object' ? { ...reasoningMeta } : event.reasoningMeta || null,
      streamMeta: streamMeta && typeof streamMeta === 'object' ? { ...streamMeta } : event.streamMeta || null,
    }
  }
  turn.updatedAt = Math.max(turn.updatedAt || 0, updatedAt)
  return finalizeStateWithTurn(state, turn)
}

export function appendLiveExecutionToolOutput(state = createEmptyLiveExecutionState(), {
  threadId = '',
  turnId = '',
  stepId = '',
  sequence = 0,
  toolName = '',
  stream = 'stdout',
  chunk = '',
  emittedAt = 0,
  status = 'active',
} = {}) {
  const normalizedTurnId = normalizeId(turnId)
  const normalizedStepId = normalizeId(stepId)
  const normalizedToolName = String(toolName || '').trim()
  const normalizedStream = String(stream || 'stdout').trim().toLowerCase() === 'stderr' ? 'stderr' : 'stdout'
  const delta = String(chunk ?? '')
  if (!normalizedTurnId || !normalizedStepId || !delta) return state

  const eventAt = normalizeNumber(emittedAt, Date.now())
  const sessionId = `session:${normalizedTurnId}:${normalizedStepId}`
  const eventId = `tool_output:${normalizedTurnId}:${normalizedStepId}:${normalizedStream}`

  const turn = ensureTurnBucket(state, normalizedTurnId, {
    threadId: normalizeId(threadId),
    createdAt: eventAt,
  })
  if (!turn) return state

  const session = ensureSession(turn, sessionId, {
    turnId: normalizedTurnId,
    stepId: normalizedStepId,
    toolName: normalizedToolName,
    createdAt: eventAt,
  })
  if (!session) return state
  if (!session.toolName) session.toolName = normalizedToolName
  session.updatedAt = eventAt
  session.status = String(status || 'active').trim().toLowerCase() || 'active'

  const previousOutput = stripTrailingTruncationMarker(session.output?.[normalizedStream]?.text || '')
  const nextOutput = clampText(`${previousOutput}${delta}`, MAX_LIVE_OUTPUT_CHARS)
  session.output[normalizedStream] = {
    text: nextOutput.text,
    truncated: nextOutput.truncated,
    updatedAt: eventAt,
  }

  upsertTurnEvent(turn, {
    id: eventId,
    turnId: normalizedTurnId,
    threadId: normalizeId(threadId),
    stepId: normalizedStepId,
    sessionId,
    kind: 'tool_output',
    status: String(status || 'active').trim().toLowerCase() || 'active',
    createdAt: turn.eventsById[eventId]?.createdAt || eventAt,
    updatedAt: eventAt,
    summary: `${normalizedToolName || 'Command'} ${normalizedStream}`,
    detail: nextOutput.text,
    stream: normalizedStream,
    sequence: Number(sequence || 0) || 0,
    truncated: nextOutput.truncated,
    toolName: normalizedToolName,
  })
  turn.updatedAt = Math.max(turn.updatedAt || 0, eventAt)
  const nextState = finalizeStateWithTurn(state, turn)
  return reduceCanonicalExecutionEvent(nextState, {
    kind: 'tool_output',
    threadId: normalizeId(threadId),
    turnId: normalizedTurnId,
    eventId: `tool_output:${normalizedTurnId}:${normalizedStepId}:${normalizedStream}:${eventAt}:${Number(sequence || 0) || 0}:${previousOutput.length}`,
    sessionId,
    toolKind: /command|shell|terminal|exec/i.test(normalizedToolName) ? 'command' : (normalizedToolName || 'tool'),
    state: 'active',
    detail: delta,
    stream: normalizedStream,
    sequence: Number(sequence || 0) || 0,
    emittedAt: eventAt,
  })
}

export function buildLiveExecutionState({ messages = [], toolActivity = [] } = {}) {
  let state = createEmptyLiveExecutionState()
  for (const activity of Array.isArray(toolActivity) ? toolActivity : []) {
    state = upsertLiveExecutionActivity(state, activity)
    const stdoutPreview = String(activity?.stdoutPreview || '').trim()
    const stderrPreview = String(activity?.stderrPreview || '').trim()
    const stepId = normalizeId(activity?.stepId)
    if (stdoutPreview && stepId) {
      state = appendLiveExecutionToolOutput(state, {
        threadId: normalizeId(activity?.threadId),
        turnId: normalizeId(activity?.turnId),
        stepId,
        sequence: Number(activity?.sequence || 0) || 0,
        toolName: String(activity?.toolName || '').trim(),
        stream: 'stdout',
        chunk: stdoutPreview,
        emittedAt: normalizeNumber(activity?.finishedAt || activity?.updatedAt || activity?.createdAt, Date.now()),
        status: 'done',
      })
    }
    if (stderrPreview && stepId) {
      state = appendLiveExecutionToolOutput(state, {
        threadId: normalizeId(activity?.threadId),
        turnId: normalizeId(activity?.turnId),
        stepId,
        sequence: Number(activity?.sequence || 0) || 0,
        toolName: String(activity?.toolName || '').trim(),
        stream: 'stderr',
        chunk: stderrPreview,
        emittedAt: normalizeNumber(activity?.finishedAt || activity?.updatedAt || activity?.createdAt, Date.now()),
        status: String(activity?.isError ? 'error' : 'done'),
      })
    }
  }
  for (const message of Array.isArray(messages) ? messages : []) {
    if (String(message?.role || '').trim() !== 'assistant') continue
    const streamMeta = message?.streamMeta && typeof message.streamMeta === 'object'
      ? message.streamMeta
      : {}
    const turnId = normalizeId(streamMeta?.turnId)
    const reasoning = normalizeMessageReasoningText(message)
    const mode = resolveMessageReasoningMode(message)
    if (!turnId) continue
    if (!reasoning.trim() && mode !== 'unavailable_redacted') continue
    if (!hasLiveReasoningHistory(state, { turnId, messageId: normalizeId(message?.id) })) {
      const reasoningParts = reasoning.includes('\n\n---\n\n')
        ? reasoning.split('\n\n---\n\n')
        : [reasoning]
      for (const [index, part] of reasoningParts.entries()) {
        if (!String(part || '').trim()) continue
        state = appendLiveExecutionReasoningEvent(state, {
          threadId: normalizeId(streamMeta?.threadId),
          turnId,
          messageId: normalizeId(message?.id),
          chunk: part,
          forceNewBlock: index > 0,
          emittedAt: normalizeNumber(streamMeta?.completedAt || streamMeta?.startedAt || message?.createdAt, Date.now()),
          reasoningMeta: message?.reasoningMeta || null,
          streamMeta,
        })
      }
    }
    if (resolveMessageReasoningDone(message)) {
      state = markLiveExecutionReasoningDone(state, {
        threadId: normalizeId(streamMeta?.threadId),
        turnId,
        messageId: normalizeId(message?.id),
        reasoningMeta: message?.reasoningMeta || null,
        streamMeta,
      })
    } else {
      state = patchLiveExecutionReasoningMetadata(state, {
        threadId: normalizeId(streamMeta?.threadId),
        turnId,
        messageId: normalizeId(message?.id),
        reasoningMeta: message?.reasoningMeta || null,
        streamMeta,
      })
    }
  }
  return state
}
