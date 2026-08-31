import { buildTurnStateActivity } from '../../components/chat/chat-event-bridge-turn-state.mjs'

const TURN_STATE_BY_KIND = {
  turn_started: 'started',
  turn_completed: 'completed',
  turn_cancelled: 'cancelled',
  turn_interrupted: 'interrupted',
}

export function hydratePersistedTurnStateActivity({
  eventKey = '',
  kind = '',
  meta = {},
  createdAt = 0,
} = {}) {
  const normalizedKind = String(kind || '').trim().toLowerCase()
  const eventMeta = meta && typeof meta === 'object' ? meta : {}
  const normalizedState = String(
    eventMeta.state || TURN_STATE_BY_KIND[normalizedKind] || '',
  ).trim().toLowerCase()

  if (!normalizedState) return null

  const activity = buildTurnStateActivity(normalizedState, {
    ...eventMeta,
    createdAt,
  })

  if (!activity) return null

  return {
    ...activity,
    id: eventKey,
    stepId: String(eventMeta.stepId || ''),
    sequence: Number(eventMeta.sequence || 0) || 0,
    startedAt: Number(eventMeta.startedAt || 0) || 0,
    finishedAt: Number(eventMeta.finishedAt || 0) || 0,
    durationMs: Number(eventMeta.durationMs || 0) || 0,
    createdAt,
    updatedAt: Number(eventMeta.finishedAt || eventMeta.updatedAt || createdAt) || createdAt,
  }
}
