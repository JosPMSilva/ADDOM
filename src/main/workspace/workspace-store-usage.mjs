import { getDb } from '../memory/db.mjs'
import {
  mapEventRow,
  now,
} from './workspace-store-utils.mjs'

export function listTimeline(threadId, { limit = 1500, afterEventId = 0 } = {}) {
  const db = getDb()
  const tid = String(threadId ?? '').trim()
  if (!tid) return []

  const cap = Math.max(1, Math.min(5000, Math.round(Number(limit) || 1500)))
  const after = Math.max(0, Math.round(Number(afterEventId) || 0))
  const rows = after > 0
    ? db.prepare(`
      SELECT *
      FROM chat_events
      WHERE thread_id = ? AND event_id > ?
      ORDER BY event_id ASC
      LIMIT ?
    `).all(tid, after, cap)
    : db.prepare(`
      SELECT *
      FROM chat_events
      WHERE thread_id = ?
      ORDER BY event_id ASC
      LIMIT ?
    `).all(tid, cap)

  return rows.map(mapEventRow)
}

export function touchProjectUsage(projectId, provider = '', model = '') {
  const db = getDb()
  const pid = String(projectId ?? '').trim()
  if (!pid) return false

  const ts = now()
  db.prepare(`
    UPDATE workspace_projects
    SET
      last_worked_at = ?,
      last_opened_at = ?,
      last_provider = CASE WHEN LENGTH(?) > 0 THEN ? ELSE last_provider END,
      last_model = CASE WHEN LENGTH(?) > 0 THEN ? ELSE last_model END
    WHERE id = ?
  `).run(ts, ts, String(provider ?? ''), String(provider ?? ''), String(model ?? ''), String(model ?? ''), pid)
  return true
}

export function touchProjectUsageByThread(threadId, provider = '', model = '') {
  const db = getDb()
  const tid = String(threadId ?? '').trim()
  if (!tid) return false

  const providerId = String(provider ?? '').trim()
  const modelId = String(model ?? '').trim()
  const ts = now()
  db.prepare(`
    UPDATE chat_threads
    SET
      updated_at = ?,
      last_provider = CASE WHEN LENGTH(?) > 0 THEN ? ELSE last_provider END,
      last_model = CASE WHEN LENGTH(?) > 0 THEN ? ELSE last_model END
    WHERE id = ?
  `).run(ts, providerId, providerId, modelId, modelId, tid)

  const row = db.prepare('SELECT project_id FROM chat_threads WHERE id = ?').get(tid)
  if (!row?.project_id) return false
  return touchProjectUsage(row.project_id, providerId, modelId)
}
