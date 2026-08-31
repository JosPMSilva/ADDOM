import { getDb } from '../memory/db.mjs'

const ACTIVE_JOB_STATUSES = Object.freeze(['queued', 'polling', 'cancel_requested'])
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled', 'orphaned'])

function now() {
  return Date.now()
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeStatus(value = '') {
  return normalizeId(value).toLowerCase()
}

function normalizeJson(value = {}) {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {})
  } catch {
    return '{}'
  }
}

function parseJson(value = '{}') {
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function mapRow(row = null) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizeId(row.id),
    providerId: normalizeId(row.provider_id) || 'openai',
    projectId: normalizeId(row.project_id),
    threadId: normalizeId(row.thread_id),
    assistantMessageId: normalizeId(row.assistant_message_id),
    model: normalizeId(row.model),
    status: normalizeStatus(row.status) || 'queued',
    remoteResponseId: normalizeId(row.remote_response_id),
    conversationId: normalizeId(row.conversation_id),
    toolsetHash: normalizeId(row.toolset_hash),
    systemPromptHash: normalizeId(row.system_prompt_hash),
    continuitySignature: normalizeId(row.continuity_signature),
    storeEnabled: Number(row.store_enabled || 0) === 1,
    backgroundModeEnabled: Number(row.background_mode_enabled || 0) === 1,
    queuedEventPersisted: Number(row.queued_event_persisted || 0) === 1,
    completionEventPersisted: Number(row.completion_event_persisted || 0) === 1,
    failureEventPersisted: Number(row.failure_event_persisted || 0) === 1,
    lastPolledAt: Number(row.last_polled_at || 0) || 0,
    cancelRequestedAt: Number(row.cancel_requested_at || 0) || 0,
    completedAt: Number(row.completed_at || 0) || 0,
    errorCode: normalizeId(row.error_code),
    errorMessage: normalizeId(row.error_message),
    resultSummary: parseJson(row.result_summary_json),
    createdAt: Number(row.created_at || 0) || 0,
    updatedAt: Number(row.updated_at || 0) || 0,
  }
}

function rowExistsForThreadTurn(db, threadId = '', turnId = '') {
  const normalizedThreadId = normalizeId(threadId)
  const normalizedTurnId = normalizeId(turnId)
  if (!normalizedThreadId || !normalizedTurnId) return false
  const row = db.prepare(`
    SELECT 1
    FROM chat_events
    WHERE thread_id = ? AND turn_id = ?
    LIMIT 1
  `).get(normalizedThreadId, normalizedTurnId)
  return !!row
}

function threadExists(db, threadId = '') {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) return false
  const row = db.prepare(`
    SELECT 1
    FROM chat_threads
    WHERE id = ?
    LIMIT 1
  `).get(normalizedThreadId)
  return !!row
}

export function upsertOpenAIBackgroundJob({
  id = '',
  providerId = 'openai',
  projectId = '',
  threadId = '',
  assistantMessageId = '',
  model = '',
  status = 'queued',
  remoteResponseId = '',
  conversationId = '',
  toolsetHash = '',
  systemPromptHash = '',
  continuitySignature = '',
  storeEnabled = false,
  backgroundModeEnabled = true,
  queuedEventPersisted = false,
  completionEventPersisted = false,
  failureEventPersisted = false,
  lastPolledAt = 0,
  cancelRequestedAt = 0,
  completedAt = 0,
  errorCode = '',
  errorMessage = '',
  resultSummary = {},
  createdAt = 0,
} = {}) {
  const normalizedId = normalizeId(id)
  if (!normalizedId) throw new Error('OpenAI background job id is required.')

  const db = getDb()
  const existing = getOpenAIBackgroundJob(normalizedId)
  const timestamp = now()
  const effectiveCreatedAt = Number(createdAt || existing?.createdAt || timestamp) || timestamp

  db.prepare(`
    INSERT INTO openai_background_jobs (
      id,
      provider_id,
      project_id,
      thread_id,
      assistant_message_id,
      model,
      status,
      remote_response_id,
      conversation_id,
      toolset_hash,
      system_prompt_hash,
      continuity_signature,
      store_enabled,
      background_mode_enabled,
      queued_event_persisted,
      completion_event_persisted,
      failure_event_persisted,
      last_polled_at,
      cancel_requested_at,
      completed_at,
      error_code,
      error_message,
      result_summary_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider_id = excluded.provider_id,
      project_id = excluded.project_id,
      thread_id = excluded.thread_id,
      assistant_message_id = excluded.assistant_message_id,
      model = excluded.model,
      status = excluded.status,
      remote_response_id = excluded.remote_response_id,
      conversation_id = excluded.conversation_id,
      toolset_hash = excluded.toolset_hash,
      system_prompt_hash = excluded.system_prompt_hash,
      continuity_signature = excluded.continuity_signature,
      store_enabled = excluded.store_enabled,
      background_mode_enabled = excluded.background_mode_enabled,
      queued_event_persisted = excluded.queued_event_persisted,
      completion_event_persisted = excluded.completion_event_persisted,
      failure_event_persisted = excluded.failure_event_persisted,
      last_polled_at = excluded.last_polled_at,
      cancel_requested_at = excluded.cancel_requested_at,
      completed_at = excluded.completed_at,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      result_summary_json = excluded.result_summary_json,
      updated_at = excluded.updated_at
  `).run(
    normalizedId,
    normalizeId(providerId) || 'openai',
    normalizeId(projectId),
    normalizeId(threadId),
    normalizeId(assistantMessageId),
    normalizeId(model),
    normalizeStatus(status) || 'queued',
    normalizeId(remoteResponseId),
    normalizeId(conversationId),
    normalizeId(toolsetHash),
    normalizeId(systemPromptHash),
    normalizeId(continuitySignature),
    storeEnabled === true ? 1 : 0,
    backgroundModeEnabled === true ? 1 : 0,
    queuedEventPersisted === true ? 1 : 0,
    completionEventPersisted === true ? 1 : 0,
    failureEventPersisted === true ? 1 : 0,
    Math.max(0, Number(lastPolledAt || 0) || 0),
    Math.max(0, Number(cancelRequestedAt || 0) || 0),
    Math.max(0, Number(completedAt || 0) || 0),
    normalizeId(errorCode),
    normalizeId(errorMessage),
    normalizeJson(resultSummary),
    effectiveCreatedAt,
    timestamp,
  )

  return getOpenAIBackgroundJob(normalizedId)
}

export function getOpenAIBackgroundJob(id = '') {
  const normalizedId = normalizeId(id)
  if (!normalizedId) return null
  const db = getDb()
  const row = db.prepare(`
    SELECT *
    FROM openai_background_jobs
    WHERE id = ?
  `).get(normalizedId)
  return mapRow(row)
}

export function getOpenAIBackgroundJobByResponseId(remoteResponseId = '') {
  const normalizedResponseId = normalizeId(remoteResponseId)
  if (!normalizedResponseId) return null
  const db = getDb()
  const row = db.prepare(`
    SELECT *
    FROM openai_background_jobs
    WHERE remote_response_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(normalizedResponseId)
  return mapRow(row)
}

export function listRecoverableOpenAIBackgroundJobs() {
  const db = getDb()
  const rows = db.prepare(`
    SELECT *
    FROM openai_background_jobs
    WHERE status IN (${ACTIVE_JOB_STATUSES.map(() => '?').join(', ')})
    ORDER BY created_at ASC
  `).all(...ACTIVE_JOB_STATUSES)
  return rows.map(mapRow).filter(Boolean)
}

export function listOpenAIBackgroundJobsForUi({ projectId = '' } = {}) {
  const normalizedProjectId = normalizeId(projectId)
  const db = getDb()
  const recentWindowStart = now() - 120_000
  const rows = normalizedProjectId
    ? db.prepare(`
      SELECT *
      FROM openai_background_jobs
      WHERE project_id = ?
        AND (
          status IN (${ACTIVE_JOB_STATUSES.map(() => '?').join(', ')})
          OR (status IN ('completed', 'failed', 'cancelled', 'orphaned') AND updated_at >= ?)
        )
      ORDER BY updated_at DESC, created_at DESC
    `).all(normalizedProjectId, ...ACTIVE_JOB_STATUSES, recentWindowStart)
    : db.prepare(`
      SELECT *
      FROM openai_background_jobs
      WHERE status IN (${ACTIVE_JOB_STATUSES.map(() => '?').join(', ')})
         OR (status IN ('completed', 'failed', 'cancelled', 'orphaned') AND updated_at >= ?)
      ORDER BY updated_at DESC, created_at DESC
    `).all(...ACTIVE_JOB_STATUSES, recentWindowStart)

  return rows.map(mapRow).filter(Boolean)
}

export function markOpenAIBackgroundJobPolled(id = '', polledAt = now()) {
  const row = getOpenAIBackgroundJob(id)
  if (!row) return null
  return upsertOpenAIBackgroundJob({
    ...row,
    lastPolledAt: polledAt,
    status: row.status === 'queued' ? 'polling' : row.status,
  })
}

export function markOpenAIBackgroundJobCancelRequested(id = '', cancelRequestedAt = now()) {
  const row = getOpenAIBackgroundJob(id)
  if (!row) return null
  return upsertOpenAIBackgroundJob({
    ...row,
    status: 'cancel_requested',
    cancelRequestedAt,
  })
}

export function finalizeOpenAIBackgroundJob(id = '', patch = {}) {
  const row = getOpenAIBackgroundJob(id)
  if (!row) return null
  const nextStatus = normalizeStatus(patch.status || row.status || 'completed') || 'completed'
  const isTerminal = TERMINAL_JOB_STATUSES.has(nextStatus)
  const nextResultSummary = (
    patch.resultSummary && typeof patch.resultSummary === 'object'
      ? {
          ...(row.resultSummary && typeof row.resultSummary === 'object' ? row.resultSummary : {}),
          ...patch.resultSummary,
        }
      : row.resultSummary
  )
  return upsertOpenAIBackgroundJob({
    ...row,
    ...patch,
    status: nextStatus,
    resultSummary: nextResultSummary,
    completedAt: isTerminal
      ? Math.max(0, Number(patch.completedAt || row.completedAt || now()) || now())
      : Math.max(0, Number(patch.completedAt || row.completedAt || 0) || 0),
  })
}

export function deleteOpenAIBackgroundJob(id = '') {
  const normalizedId = normalizeId(id)
  if (!normalizedId) return false
  const db = getDb()
  const result = db.prepare('DELETE FROM openai_background_jobs WHERE id = ?').run(normalizedId)
  return Number(result?.changes || 0) > 0
}

export function clearOpenAIBackgroundJobsForProject(projectId = '', { threadIds = [] } = {}) {
  const normalizedProjectId = normalizeId(projectId)
  const normalizedThreadIds = [...new Set(
    (Array.isArray(threadIds) ? threadIds : [])
      .map((value) => normalizeId(value))
      .filter(Boolean),
  )]
  const db = getDb()
  const tx = db.transaction(() => {
    let deletedRows = 0
    if (normalizedProjectId) {
      deletedRows += Number(db.prepare(`
        DELETE FROM openai_background_jobs
        WHERE project_id = ?
      `).run(normalizedProjectId)?.changes || 0)
    }
    if (normalizedThreadIds.length > 0) {
      const placeholders = normalizedThreadIds.map(() => '?').join(', ')
      deletedRows += Number(db.prepare(`
        DELETE FROM openai_background_jobs
        WHERE thread_id IN (${placeholders})
      `).run(...normalizedThreadIds)?.changes || 0)
    }
    return {
      ok: true,
      deletedRows,
    }
  })
  return tx()
}

export function clearAllOpenAIBackgroundJobs() {
  const db = getDb()
  const result = db.prepare('DELETE FROM openai_background_jobs').run()
  return Number(result?.changes || 0) || 0
}

export function pruneStaleOpenAIBackgroundJobs({ keepRecentCompletedMs = 120_000 } = {}) {
  const db = getDb()
  const cutoff = now() - Math.max(1_000, Number(keepRecentCompletedMs || 120_000) || 120_000)
  const result = db.prepare(`
    DELETE FROM openai_background_jobs
    WHERE status IN ('completed', 'failed', 'cancelled', 'orphaned')
      AND updated_at < ?
  `).run(cutoff)
  return Number(result?.changes || 0) || 0
}

export function resolveOpenAIBackgroundJobOrphanState({
  threadId = '',
  turnId = '',
} = {}) {
  const db = getDb()
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) {
    return { orphaned: true, reason: 'missing_thread_id' }
  }
  if (!threadExists(db, normalizedThreadId)) {
    return { orphaned: true, reason: 'thread_missing' }
  }
  if (!rowExistsForThreadTurn(db, normalizedThreadId, turnId)) {
    return { orphaned: true, reason: 'turn_events_missing' }
  }
  return { orphaned: false, reason: '' }
}

export function resolveOpenAIBackgroundJobDeliveryState({
  threadId = '',
  turnId = '',
} = {}) {
  const db = getDb()
  const normalizedThreadId = normalizeId(threadId)
  const normalizedTurnId = normalizeId(turnId)
  if (!normalizedThreadId || !normalizedTurnId) {
    return {
      queuedEventExists: false,
      completionEventExists: false,
      failureEventExists: false,
      assistantMessageExists: false,
    }
  }
  const rows = db.prepare(`
    SELECT kind
    FROM chat_events
    WHERE thread_id = ? AND turn_id = ?
      AND kind IN ('background_response_queued', 'background_response_completed', 'background_response_failed', 'assistant_message')
  `).all(normalizedThreadId, normalizedTurnId)
  const kinds = new Set(rows.map((row) => normalizeId(row?.kind)))
  return {
    queuedEventExists: kinds.has('background_response_queued'),
    completionEventExists: kinds.has('background_response_completed'),
    failureEventExists: kinds.has('background_response_failed'),
    assistantMessageExists: kinds.has('assistant_message'),
  }
}
