import { mapActivityToCanonicalExecutionEvents } from './live-execution-store-activity.mjs'
import { reduceCanonicalExecutionEvent } from './live-execution-canonical-reducer.mjs'
import { resolveExecutionReasoningMessageId } from '../../../common/chat/reasoning-segment.mjs'

function text(value) {
  return String(value ?? '').trim()
}

function number(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : 0
}

function resolvePersistedCommentaryMessageId(turnId = '', meta = {}) {
  const normalizedTurnId = text(turnId)
  if (!normalizedTurnId) return 'execution_commentary'
  if (meta?.reasoningSegment != null) {
    const round = Math.max(0, number(meta?.round))
    const segment = Math.max(0, number(meta.reasoningSegment))
    const base = `execution_commentary:${normalizedTurnId}:${round}`
    return segment > 0 ? `${base}:segment:${segment}` : base
  }
  const hasRound = Object.prototype.hasOwnProperty.call(meta, 'round')
  if (hasRound) {
    const round = Math.max(0, number(meta?.round))
    return `execution_commentary:${normalizedTurnId}:${round}`
  }
  return `execution_commentary:${normalizedTurnId}`
}

export function resolvePersistedExecutionReasoningSegment(meta = {}) {
  if (meta?.reasoningSegment != null) {
    return {
      hasPersistedSegment: true,
      segment: Math.max(0, number(meta.reasoningSegment)),
    }
  }
  const round = Math.max(0, number(meta?.round))
  return {
    hasPersistedSegment: round > 0,
    segment: Math.max(0, round - 1),
  }
}

function buildPersistedActivity(record = {}) {
  const meta = record?.meta && typeof record.meta === 'object' ? record.meta : {}
  const kind = text(record?.kind).toLowerCase()
  const turnId = text(record?.turnId || meta?.turnId)
  const toolCallId = text(meta?.toolCallId)
  const providerToolId = toolCallId && turnId ? `provider_tool:${turnId}:${toolCallId}` : ''
  const type = kind === 'tool_executing'
    ? 'executing'
    : (kind === 'tool_pending'
      ? 'pending'
      : (kind === 'tool_result' || kind === 'provider_tool_output'
        ? 'result'
        : (kind === 'provider_tool_status'
          ? 'provider_tool'
          : (kind.startsWith('turn_') ? 'turn' : 'info'))))
  return {
    id: providerToolId || `event:${number(record?.eventId) || text(record?.eventId) || `${kind}:${number(record?.createdAt)}`}`,
    type,
    eventKind: kind,
    turnId,
    threadId: text(meta?.threadId),
    stepId: text(meta?.stepId || meta?.toolCallId),
    toolName: text(meta?.toolName),
    providerId: text(meta?.providerId),
    detail: String(record?.content ?? meta?.detail ?? ''),
    result: meta?.result ?? meta?.output,
    isError: meta?.isError === true,
    turnState: text(meta?.turnState || (kind === 'turn_completed' ? 'completed' : '')),
    turnStatus: text(meta?.turnStatus),
    sequence: number(meta?.sequence),
    createdAt: number(record?.createdAt || meta?.createdAt),
    startedAt: number(meta?.startedAt),
    finishedAt: number(meta?.finishedAt || record?.createdAt),
  }
}

export function mapPersistedTimelineRecordToExecutionEvents(record = {}) {
  const kind = text(record?.kind).toLowerCase()
  const turnId = text(record?.turnId || record?.meta?.turnId)
  if (!kind || !turnId) return []
  const meta = record?.meta && typeof record.meta === 'object' ? record.meta : {}
  const emittedAt = number(meta?.emittedAt || record?.createdAt)
  const eventId = `persisted:${number(record?.eventId) || text(record?.eventId) || `${kind}:${emittedAt}`}`

  if (kind === 'execution_commentary_chunk') {
    return [{
      kind: 'reasoning_chunk',
      threadId: text(meta?.threadId),
      turnId,
      eventId,
      messageId: resolvePersistedCommentaryMessageId(turnId, meta),
      reasoningRole: 'commentary',
      state: 'active',
      detail: String(record?.content ?? ''),
      emittedAt,
      ...(meta?.reasoningSegment != null
        ? { reasoningSegment: Math.max(0, number(meta.reasoningSegment)) }
        : {}),
    }]
  }
  if (kind === 'execution_reasoning_chunk') {
    const { segment } = resolvePersistedExecutionReasoningSegment(meta)
    return [{
      kind: 'reasoning_chunk',
      threadId: text(meta?.threadId),
      turnId,
      eventId,
      messageId: resolveExecutionReasoningMessageId({
        turnId,
        segment,
        providerId: text(meta?.providerId),
        explicitMessageId: text(meta?.assistantMessageId || meta?.messageId),
      }),
      reasoningRole: 'reasoning',
      state: 'active',
      detail: String(record?.content ?? ''),
      emittedAt,
      ...(text(meta?.providerId) ? { providerId: text(meta.providerId).toLowerCase() } : {}),
    }]
  }
  return mapActivityToCanonicalExecutionEvents(buildPersistedActivity(record))
}

export function reducePersistedTimelineRecords(records = [], initialState = { turnsById: {}, turnOrder: [] }) {
  const sorted = [...(Array.isArray(records) ? records : [])].sort((left, right) => (
    number(left?.meta?.sequence) - number(right?.meta?.sequence)
    || number(left?.createdAt) - number(right?.createdAt)
    || number(left?.eventId) - number(right?.eventId)
  ))
  let state = initialState
  for (const record of sorted) {
    const meta = record?.meta && typeof record.meta === 'object' ? record.meta : {}
    for (const event of mapPersistedTimelineRecordToExecutionEvents(record)) {
      state = reduceCanonicalExecutionEvent(state, {
        ...event,
        ...(meta.providerId ? { providerId: String(meta.providerId || '').trim().toLowerCase() } : {}),
      })
    }
  }
  return state
}
