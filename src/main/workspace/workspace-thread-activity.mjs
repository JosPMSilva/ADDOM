import { getDb } from '../memory/db.mjs'
import { mapThreadRow, parseMetaJson } from './workspace-store-utils.mjs'

const LIFECYCLE_KINDS = [
  'turn_state',
  'turn_started',
  'turn_completed',
  'turn_cancelled',
  'turn_interrupted',
]

function parsePayloadJson(value = '') {
  try {
    const parsed = JSON.parse(String(value || ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeEvent(source = null) {
  const event = source && typeof source === 'object' ? source : {}
  return {
    eventId: Number(event.eventId || 0) || 0,
    kind: String(event.kind || '').trim().toLowerCase(),
    createdAt: Number(event.createdAt || 0) || 0,
    meta: event.meta && typeof event.meta === 'object' ? event.meta : {},
  }
}

export function normalizePersistedLifecycleEvent(source = null) {
  const event = normalizeEvent(source)
  if (event.kind !== 'turn_state') return event
  const timeline = source?.payload?.timeline && typeof source.payload.timeline === 'object'
    ? source.payload.timeline
    : {}
  return normalizeEvent({
    eventId: event.eventId,
    kind: timeline.kind,
    createdAt: event.createdAt,
    meta: timeline.meta,
  })
}

function terminalActivity(lifecycle, lastViewedAt) {
  const event = normalizePersistedLifecycleEvent(lifecycle)
  const status = String(event.meta.status || '').trim().toLowerCase()
  const unread = event.createdAt > lastViewedAt
  if (event.kind === 'turn_started') {
    return { status: 'active', unread: false, updatedAt: event.createdAt }
  }
  if (event.kind === 'turn_interrupted' || status === 'error' || status === 'failed') {
    return unread
      ? { status: 'failed', unread: true, updatedAt: event.createdAt }
      : { status: 'idle', unread: false, updatedAt: event.createdAt }
  }
  if (event.kind === 'turn_completed') {
    return unread
      ? { status: 'completed', unread: true, updatedAt: event.createdAt }
      : { status: 'idle', unread: false, updatedAt: event.createdAt }
  }
  return { status: 'idle', unread: false, updatedAt: event.createdAt }
}

export function derivePersistedThreadActivity({
  lastViewedAt = 0,
  lifecycle = null,
  assistant = null,
  latestUserEventId = 0,
  bridgeQuestion = null,
} = {}) {
  const viewedAt = Number(lastViewedAt || 0) || 0
  const assistantEvent = normalizeEvent(assistant)
  const bridgeEvent = normalizeEvent(bridgeQuestion)
  const userEventId = Number(latestUserEventId || 0) || 0
  const ordinaryQuestionPending = (
    assistantEvent.eventId > userEventId
    && String(assistantEvent.meta.stopReason || '').trim().toLowerCase() === 'question_user'
  )
  const bridgeQuestionPending = (
    bridgeEvent.eventId > userEventId
    && bridgeEvent.kind === 'question_user_requested'
  )
  if (ordinaryQuestionPending || bridgeQuestionPending) {
    const updatedAt = Math.max(
      normalizePersistedLifecycleEvent(lifecycle).createdAt,
      assistantEvent.createdAt,
      bridgeEvent.createdAt,
    )
    return { status: 'needs_input', unread: true, updatedAt }
  }
  return terminalActivity(lifecycle, viewedAt)
}

function mapPersistedActivityRow(row = {}) {
  return derivePersistedThreadActivity({
    lastViewedAt: row.last_viewed_at,
    lifecycle: {
      kind: row.latest_lifecycle_kind,
      createdAt: row.latest_lifecycle_created_at,
      meta: parseMetaJson(row.latest_lifecycle_meta_json),
      payload: parsePayloadJson(row.latest_lifecycle_payload_json),
    },
    assistant: {
      eventId: row.latest_assistant_event_id,
      createdAt: row.latest_assistant_created_at,
      meta: parseMetaJson(row.latest_assistant_meta_json),
    },
    latestUserEventId: row.latest_user_event_id,
    bridgeQuestion: {
      eventId: row.latest_bridge_question_event_id,
      kind: row.latest_bridge_question_kind,
      createdAt: row.latest_bridge_question_created_at,
    },
  })
}

export function listWorkspaceThreadsFromDb(db, projectId) {
  if (!db) throw new TypeError('db is required')
  const id = String(projectId ?? '').trim()
  if (!id) return []
  const lifecycleKinds = LIFECYCLE_KINDS.map(() => '?').join(', ')
  const lifecycleArgs = [...LIFECYCLE_KINDS]
  const rows = db.prepare(`
    SELECT
      t.*,
      (SELECT MAX(created_at) FROM chat_events ce WHERE ce.thread_id = t.id) AS last_event_at,
      (SELECT ce.content FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind = 'user_message' AND LENGTH(TRIM(ce.content)) > 0 ORDER BY ce.event_id DESC LIMIT 1) AS latest_user_preview,
      (SELECT ce.content FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind = 'assistant_message' AND LENGTH(TRIM(ce.content)) > 0 ORDER BY ce.event_id DESC LIMIT 1) AS latest_assistant_preview,
      (SELECT ce.event_id FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind = 'user_message' ORDER BY ce.event_id DESC LIMIT 1) AS latest_user_event_id,
      (SELECT ce.event_id FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind = 'assistant_message' ORDER BY ce.event_id DESC LIMIT 1) AS latest_assistant_event_id,
      (SELECT ce.created_at FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind = 'assistant_message' ORDER BY ce.event_id DESC LIMIT 1) AS latest_assistant_created_at,
      (SELECT ce.meta_json FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind = 'assistant_message' ORDER BY ce.event_id DESC LIMIT 1) AS latest_assistant_meta_json,
      (SELECT ce.kind FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind IN (${lifecycleKinds}) ORDER BY ce.event_id DESC LIMIT 1) AS latest_lifecycle_kind,
      (SELECT ce.created_at FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind IN (${lifecycleKinds}) ORDER BY ce.event_id DESC LIMIT 1) AS latest_lifecycle_created_at,
      (SELECT ce.meta_json FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind IN (${lifecycleKinds}) ORDER BY ce.event_id DESC LIMIT 1) AS latest_lifecycle_meta_json,
      (SELECT ce.payload_json FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind IN (${lifecycleKinds}) ORDER BY ce.event_id DESC LIMIT 1) AS latest_lifecycle_payload_json,
      (SELECT ce.event_id FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind IN ('question_user_requested', 'question_user_cleared') ORDER BY ce.event_id DESC LIMIT 1) AS latest_bridge_question_event_id,
      (SELECT ce.kind FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind IN ('question_user_requested', 'question_user_cleared') ORDER BY ce.event_id DESC LIMIT 1) AS latest_bridge_question_kind,
      (SELECT ce.created_at FROM chat_events ce WHERE ce.thread_id = t.id AND ce.kind IN ('question_user_requested', 'question_user_cleared') ORDER BY ce.event_id DESC LIMIT 1) AS latest_bridge_question_created_at,
      origins.snapshot_id AS origin_snapshot_id,
      origins.source_conversation_id AS origin_source_conversation_id,
      origins.source_turn_id AS origin_source_turn_id,
      origins.source_sequence AS origin_source_sequence,
      origins.source_role_id AS origin_source_role_id,
      origins.source_project_id AS origin_source_project_id,
      origins.source_thread_id AS origin_source_thread_id,
      origins.source_run_id AS origin_source_run_id,
      origins.source_node_id AS origin_source_node_id,
      origins.provider_provenance_json AS origin_provider_provenance_json,
      snapshots.contract_json AS origin_snapshot_json,
      CASE WHEN EXISTS (
        SELECT 1 FROM agent_node_conversation_bindings AS bindings
        INNER JOIN agent_conversations AS conversations ON conversations.id = bindings.conversation_id
        WHERE bindings.conversation_id = origins.source_conversation_id
          AND bindings.run_id = origins.source_run_id
          AND bindings.node_id = origins.source_node_id
          AND conversations.project_id = origins.source_project_id
          AND conversations.root_thread_id = origins.source_thread_id
      ) THEN 1 ELSE 0 END AS origin_source_available
    FROM chat_threads t
    LEFT JOIN project_thread_origins AS origins ON origins.thread_id = t.id
    LEFT JOIN agent_promotion_snapshots AS snapshots ON snapshots.id = origins.snapshot_id
    WHERE t.project_id = ? AND t.archived = 0
    ORDER BY t.updated_at DESC, t.created_at DESC
  `).all(...lifecycleArgs, ...lifecycleArgs, ...lifecycleArgs, ...lifecycleArgs, id)
  return rows.map((row) => ({
    ...mapThreadRow(row),
    persistedActivity: mapPersistedActivityRow(row),
  }))
}

export function listWorkspaceThreads(projectId) {
  return listWorkspaceThreadsFromDb(getDb(), projectId)
}

export function acknowledgeWorkspaceThreadActivity(threadId, acknowledgedAt = Date.now()) {
  const db = getDb()
  const id = String(threadId ?? '').trim()
  if (!id) throw new Error('threadId is required.')
  const at = Math.max(0, Math.round(Number(acknowledgedAt) || Date.now()))
  const result = db.prepare('UPDATE chat_threads SET last_viewed_at = ? WHERE id = ?').run(at, id)
  if (Number(result.changes || 0) === 0) throw new Error('Thread not found.')
  return { ok: true, threadId: id, lastViewedAt: at }
}
