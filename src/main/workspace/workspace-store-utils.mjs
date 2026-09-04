import path from 'path'
import { mapCanonicalRootEventRow } from './root-event-row-mapper.mjs'
import { projectCanonicalRootEvent } from '../../common/chat/canonical-root-event-projection.mjs'
import crypto from 'node:crypto'

export const MAX_EVENT_CONTENT_CHARS = 24_000
export const MAX_META_STRING_CHARS = 8_000
export const MAX_META_DEPTH = 4
export const MAX_META_KEYS = 80
export const MAX_META_ITEMS = 120
export const MAX_EVENTS_PER_THREAD = 1_600
export const MAX_THREAD_TITLE_CHARS = 200
export const MAX_THREAD_PREVIEW_CHARS = 220
export const MAX_THREAD_IMPORT_EVENTS = 5_000
export const MAX_IMPORTED_EVENT_FUTURE_SKEW_MS = 5 * 60 * 1000

export function now() {
  return Date.now()
}

export function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}

export function normalizeProjectPath(projectPath) {
  const raw = String(projectPath ?? '').trim()
  if (!raw) throw new Error('Project path is required.')
  return path.resolve(raw)
}

export function projectNameFromPath(projectPath) {
  const base = path.basename(projectPath)
  return base || projectPath
}

export function trimString(value, max) {
  const text = String(value ?? '')
  if (text.length <= max) return text
  return `${text.slice(0, max)}... [truncated]`
}

export function normalizeEventContent(kind = '', content = '') {
  const text = String(content ?? '')
  const normalizedKind = String(kind ?? '').trim()
  if (
    normalizedKind === 'user_message'
    || normalizedKind === 'assistant_message'
    || normalizedKind === 'chat_error'
  ) {
    return text
  }
  return trimString(text, MAX_EVENT_CONTENT_CHARS)
}

export function normalizeThreadPreviewText(value) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return trimString(normalized, MAX_THREAD_PREVIEW_CHARS)
}

export function trimMetaValue(value, depth = 0) {
  if (depth > MAX_META_DEPTH) {
    return '[max-depth-truncated]'
  }

  if (typeof value === 'string') {
    return trimString(value, MAX_META_STRING_CHARS)
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return value
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_META_ITEMS).map((item) => trimMetaValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const out = {}
    let count = 0
    for (const [k, v] of Object.entries(value)) {
      if (count >= MAX_META_KEYS) break
      const key = String(k ?? '').trim()
      if (!key) continue
      out[key] = trimMetaValue(v, depth + 1)
      count += 1
    }
    return out
  }

  return String(value)
}

export function safeMetaJson(meta) {
  const normalized = trimMetaValue(meta ?? {}, 0)
  try {
    return JSON.stringify(normalized)
  } catch {
    return '{}'
  }
}

export function parseMetaJson(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function mapProjectRow(row) {
  if (!row) return null
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    createdAt: Number(row.created_at || 0),
    lastOpenedAt: Number(row.last_opened_at || 0),
    lastWorkedAt: Number(row.last_worked_at || 0),
    lastProvider: String(row.last_provider || ''),
    lastModel: String(row.last_model || ''),
    activeThreadId: String(row.active_thread_id || ''),
    threadCount: Number(row.thread_count || 0),
    latestAssistantNote: String(row.latest_assistant_note || ''),
  }
}

export function mapThreadRow(row) {
  if (!row) return null
  const latestUserPreview = normalizeThreadPreviewText(row.latest_user_preview)
  const latestAssistantPreview = normalizeThreadPreviewText(row.latest_assistant_preview)
  const previewText = latestUserPreview || latestAssistantPreview
  const previewRole = latestUserPreview
    ? 'user'
    : latestAssistantPreview
      ? 'assistant'
      : ''
  const snapshot = parseMetaJson(row.origin_snapshot_json)
  const origin = row.origin_snapshot_id ? {
    kind: 'agent_promotion',
    snapshotId: String(row.origin_snapshot_id || ''),
    sourceConversationId: String(row.origin_source_conversation_id || ''),
    sourceTurnId: String(row.origin_source_turn_id || ''),
    sourceSequence: Number(row.origin_source_sequence || snapshot.sourceSequence || 0),
    sourceRoleId: String(row.origin_source_role_id || ''),
    sourceRoleLabel: String(snapshot.sourceRoleLabel || row.origin_source_role_id || ''),
    sourceRoute: {
      projectId: String(row.origin_source_project_id || snapshot.sourceRoute?.projectId || ''),
      threadId: String(row.origin_source_thread_id || snapshot.sourceRoute?.threadId || ''),
      runId: String(row.origin_source_run_id || snapshot.sourceRoute?.runId || ''),
      nodeId: String(row.origin_source_node_id || snapshot.sourceRoute?.nodeId || ''),
    },
    providerProvenance: parseMetaJson(row.origin_provider_provenance_json),
    artifactCount: Array.isArray(snapshot.content?.artifacts) ? snapshot.content.artifacts.length : 0,
    toolResultCount: Array.isArray(snapshot.content?.toolResults) ? snapshot.content.toolResults.length : 0,
    sourceAvailable: Number(row.origin_source_available || 0) === 1,
  } : null
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    titleSource: String(row.title_source || 'manual'),
    lastProvider: String(row.last_provider || ''),
    lastModel: String(row.last_model || ''),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    lastViewedAt: Number(row.last_viewed_at || 0),
    archived: !!row.archived,
    lastEventAt: Number(row.last_event_at || 0),
    previewText,
    previewRole,
    origin,
  }
}

export function mapEventRow(row) {
  if (!row) return null
  const canonical = mapCanonicalRootEventRow(row)
  const projected = projectCanonicalRootEvent(canonical)?.timeline
  return {
    eventId: Number(row.event_id || 0),
    threadId: row.thread_id,
    turnId: String(row.turn_id || ''),
    kind: String(projected?.kind || row.kind || ''),
    role: String(projected?.role || row.role || ''),
    content: String(projected?.content ?? row.content ?? ''),
    meta: projected?.meta || parseMetaJson(row.meta_json),
    createdAt: Number(row.created_at || 0),
    canonical,
  }
}

export function getProjectByPathInternal(db, normalizedPath) {
  return db.prepare('SELECT * FROM workspace_projects WHERE path = ?').get(normalizedPath)
}

export function getProjectByIdInternal(db, projectId) {
  return db.prepare('SELECT * FROM workspace_projects WHERE id = ?').get(projectId)
}

export function getThreadInternal(db, threadId) {
  return db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(threadId)
}

export function ensureDefaultThreadInternal(db, projectId) {
  const project = getProjectByIdInternal(db, projectId)
  if (!project) throw new Error('Project not found.')

  const activeThreadId = String(project.active_thread_id || '').trim()
  if (activeThreadId) {
    const active = db.prepare('SELECT * FROM chat_threads WHERE id = ? AND project_id = ? AND archived = 0').get(activeThreadId, projectId)
    if (active) {
      return mapThreadRow(active)
    }
  }

  let existing = db.prepare(`
    SELECT *
    FROM chat_threads
    WHERE project_id = ? AND archived = 0
    ORDER BY updated_at DESC, created_at ASC
    LIMIT 1
  `).get(projectId)

  if (!existing) {
    const ts = now()
    const id = genId('thread')
    const projectProvider = String(project.last_provider || '').trim()
    const projectModel = String(project.last_model || '').trim()
    db.prepare(`
      INSERT INTO chat_threads (id, project_id, title, last_provider, last_model, created_at, updated_at, last_viewed_at, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, projectId, 'New Thread', projectProvider, projectModel, ts, ts, ts)
    existing = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(id)
  }

  db.prepare(`
    UPDATE workspace_projects
    SET active_thread_id = ?, last_opened_at = ?
    WHERE id = ?
  `).run(existing.id, now(), projectId)

  return mapThreadRow(existing)
}

export function pruneThreadEventsInternal(db, threadId) {
  const count = Number(db.prepare(`
    SELECT COUNT(*) AS c FROM chat_events WHERE thread_id = ? AND schema_version = 0
  `).get(threadId)?.c || 0)
  const overflow = count - MAX_EVENTS_PER_THREAD
  if (overflow <= 0) return 0

  const result = db.prepare(`
    DELETE FROM chat_events
    WHERE thread_id = ?
      AND schema_version = 0
      AND event_id IN (
        SELECT event_id
        FROM chat_events
        WHERE thread_id = ? AND schema_version = 0
        ORDER BY event_id ASC
        LIMIT ?
      )
  `).run(threadId, threadId, overflow)

  return Number(result.changes || 0)
}


export function extractAttachmentIdsFromMeta(meta = {}) {
  const parts = Array.isArray(meta?.userContentParts) ? meta.userContentParts : []
  const ids = new Set()
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    const attachmentId = String(part.attachmentId || '').trim()
    if (attachmentId) ids.add(attachmentId)
  }
  return [...ids]
}

export function remapUserContentAttachmentParts(parts = [], attachmentMapping = {}) {
  const list = Array.isArray(parts) ? parts : []
  if (list.length === 0) return list
  return list.map((part) => {
    if (!part || typeof part !== 'object') return part
    const sourceId = String(part.attachmentId || '').trim()
    if (!sourceId) return part
    const mapped = attachmentMapping[sourceId]
    if (!mapped || typeof mapped !== 'object') return part
    const next = {
      ...part,
      attachmentId: String(mapped.attachmentId || sourceId),
      kind: String(mapped.kind || part.kind || '').trim(),
      mediaType: String(mapped.mediaType || part.mediaType || '').trim(),
      previewUrl: String(mapped.previewUrl || ''),
    }
    const fileName = String(mapped.fileName || part.filename || part.fileName || '').trim()
    if (fileName) {
      next.filename = fileName
      next.fileName = fileName
    }
    return next
  })
}

export function remapAttachmentReferencesInMetaJson(metaJson = '{}', attachmentMapping = {}) {
  const mapping = attachmentMapping && typeof attachmentMapping === 'object' ? attachmentMapping : {}
  if (Object.keys(mapping).length === 0) return String(metaJson || '{}')
  let parsed = {}
  try {
    parsed = JSON.parse(String(metaJson || '{}'))
  } catch {
    parsed = {}
  }
  if (!parsed || typeof parsed !== 'object') parsed = {}
  if (!Array.isArray(parsed.userContentParts)) return safeMetaJson(parsed)
  parsed.userContentParts = remapUserContentAttachmentParts(parsed.userContentParts, mapping)
  return safeMetaJson(parsed)
}

export function normalizeImportedThreadEvents(payload = {}) {
  const sourceEvents = Array.isArray(payload?.events) ? payload.events : null
  const sourceMessages = Array.isArray(payload?.messages) ? payload.messages : null
  const rows = sourceEvents || sourceMessages || []
  const normalized = []
  const baseTime = now()
  const maxFutureCreatedAt = baseTime + MAX_IMPORTED_EVENT_FUTURE_SKEW_MS

  for (let i = 0; i < rows.length; i += 1) {
    if (normalized.length >= MAX_THREAD_IMPORT_EVENTS) break
    const row = rows[i]
    if (!row || typeof row !== 'object') continue

    const role = String(row.role ?? '').trim()
    const kindRaw = String(row.kind ?? '').trim()
    const fallbackKind = role === 'assistant' ? 'assistant_message' : role === 'user' ? 'user_message' : ''
    const kind = trimString(kindRaw || fallbackKind, 80)
    if (!kind) continue

    const content = normalizeEventContent(kind, row.content)
    const turnId = trimString(String(row.turnId ?? row.turn_id ?? ''), 120)
    const createdAt = Number(row.createdAt ?? row.created_at)
    const roundedCreatedAt = Number.isFinite(createdAt) && createdAt > 0
      ? Math.round(createdAt)
      : (baseTime + normalized.length)
    const safeCreatedAt = Math.min(roundedCreatedAt, maxFutureCreatedAt)
    normalized.push({
      turnId,
      kind,
      role: trimString(role, 40),
      content,
      metaJson: safeMetaJson(row.meta ?? row.meta_json ?? {}),
      createdAt: safeCreatedAt,
      canonical: row.canonical && typeof row.canonical === 'object' ? row.canonical : null,
    })
  }

  return normalized
}
