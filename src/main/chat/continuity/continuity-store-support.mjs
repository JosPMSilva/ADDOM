import crypto from 'node:crypto'
import { getDb } from '../../memory/db.mjs'

export const CONTINUITY_REDUCER_VERSION = 'thread_local_v1'

const ACKNOWLEDGEMENT_PHRASES = new Set([
  'yes',
  'yes.',
  'yes please',
  'ok',
  'ok.',
  'okay',
  'okay.',
  'sure',
  'sure.',
  'thanks',
  'thank you',
  'sounds good',
  'continue',
  'go on',
])

const META_TEXT_HINTS = /\b(previously|earlier|before|you said|you previously said|repeat|restate|continue|go on|as above|same as before)\b/i
const APOLOGY_HINTS = /\b(sorry|apologize|apology|my mistake|i was wrong)\b/i

export function now() {
  return Date.now()
}

export function genId(prefix = 'continuity') {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}

export function safeJson(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback))
  } catch {
    return fallback
  }
}

export function parseJson(text, fallback) {
  try {
    const parsed = JSON.parse(String(text ?? ''))
    if (parsed === null || parsed === undefined) return fallback
    return parsed
  } catch {
    return fallback
  }
}

export function normalizeId(value = '') {
  return String(value || '').trim()
}

export function trimText(value, max = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}...` : text
}

export function hashText(text = '') {
  let h = 2166136261
  const input = String(text ?? '')
  for (let index = 0; index < input.length; index += 1) {
    h ^= input.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return `h${(h >>> 0).toString(16)}`
}

export function firstSentence(text = '') {
  const source = String(text ?? '').trim()
  if (!source) return ''
  const parts = source
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => trimText(part, 320))
    .filter(Boolean)
  return parts[0] || ''
}

export function extractQuestions(text = '', limit = 3) {
  return String(text ?? '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\?)/))
    .map((part) => trimText(part, 220))
    .filter((part) => part.endsWith('?'))
    .slice(0, Math.max(0, limit))
}

export function containsQuotedComplaint(text = '') {
  const normalized = String(text ?? '').trim().toLowerCase()
  if (!normalized) return false
  return (
    /^["'`]/.test(normalized)
    || /\b(you previously said|you said earlier|earlier you said|that contradicts|this contradicts)\b/.test(normalized)
  )
}

export function isLowSignalSentence(text = '') {
  const normalized = trimText(text, 320).toLowerCase()
  if (!normalized) return true
  if (normalized.length <= 18 && ACKNOWLEDGEMENT_PHRASES.has(normalized)) return true
  if (ACKNOWLEDGEMENT_PHRASES.has(normalized.replace(/[.!?]+$/g, ''))) return true
  if (containsQuotedComplaint(normalized)) return true
  if (APOLOGY_HINTS.test(normalized) && META_TEXT_HINTS.test(normalized)) return true
  if (META_TEXT_HINTS.test(normalized) && normalized.length <= 80) return true
  return false
}

export function dedupeById(items = []) {
  const seen = new Set()
  const out = []
  for (const item of Array.isArray(items) ? items : []) {
    const id = normalizeId(item?.id || item?.path || item?.text)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ ...item, id })
  }
  return out
}

export function normalizeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeId(value))
      .filter(Boolean),
  )]
}

export function mapStateRow(row = null) {
  if (!row) return null
  return {
    threadId: normalizeId(row.thread_id),
    project: normalizeId(row.project),
    epoch: Math.max(1, Number(row.epoch || 1) || 1),
    reducerVersion: normalizeId(row.reducer_version) || CONTINUITY_REDUCER_VERSION,
    taskSummary: trimText(row.task_summary, 320),
    confirmedDecisions: parseJson(row.confirmed_decisions_json, []).filter(Boolean),
    openLoops: parseJson(row.open_loops_json, []).filter(Boolean),
    workspaceRefs: parseJson(row.workspace_refs_json, []).filter(Boolean),
    blockingQuestions: parseJson(row.blocking_questions_json, []).filter(Boolean),
    lastTurnId: normalizeId(row.last_turn_id),
    metadata: parseJson(row.metadata_json, {}),
    updatedAt: Number(row.updated_at || 0) || 0,
  }
}

export function mapTurnRow(row = null) {
  if (!row) return null
  return {
    id: normalizeId(row.id),
    threadId: normalizeId(row.thread_id),
    turnId: normalizeId(row.turn_id),
    project: normalizeId(row.project),
    intentDelta: parseJson(row.intent_delta_json, {}),
    outcomeDelta: parseJson(row.outcome_delta_json, {}),
    toolEffects: parseJson(row.tool_effects_json, []).filter(Boolean),
    decisionDelta: parseJson(row.decision_delta_json, []).filter(Boolean),
    openLoopDelta: parseJson(row.open_loop_delta_json, {}),
    qualityFlags: parseJson(row.quality_flags_json, []).filter(Boolean),
    createdAt: Number(row.created_at || 0) || 0,
  }
}

export function readThreadContinuityState(threadId = '') {
  const tid = normalizeId(threadId)
  if (!tid) return null
  const db = getDb()
  const row = db.prepare(`
    SELECT *
    FROM thread_continuity_state
    WHERE thread_id = ?
  `).get(tid)
  return mapStateRow(row)
}

export function listRecentThreadTurns(threadId = '', limit = 3) {
  const tid = normalizeId(threadId)
  if (!tid) return []
  const db = getDb()
  const rows = db.prepare(`
    SELECT *
    FROM thread_continuity_turns
    WHERE thread_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(tid, Math.max(1, Math.min(12, Math.round(Number(limit) || 3))))
  return rows.map(mapTurnRow)
}

export function deleteRowsByThreadIds(db, tableName = '', threadIds = []) {
  const normalizedThreadIds = normalizeIdList(threadIds)
  if (!tableName || normalizedThreadIds.length === 0) return 0
  const placeholders = normalizedThreadIds.map(() => '?').join(', ')
  const result = db.prepare(`
    DELETE FROM ${tableName}
    WHERE thread_id IN (${placeholders})
  `).run(...normalizedThreadIds)
  return Number(result?.changes || 0) || 0
}
