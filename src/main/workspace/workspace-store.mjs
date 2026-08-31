import { getDb } from '../memory/db.mjs'
import { clearNodes } from '../memory/memory-store.mjs'
import { clearAllArtifacts } from '../memory/artifact-store.mjs'
import {
  exportCachedAttachmentsByIds,
  importThreadAttachmentPayloads,
} from '../attachments/attachment-cache.mjs'
import {
  clearAllOpenAIThreadState,
} from '../api-clients/openai-thread-state-service.mjs'
import {
  clearAllOpenAIBackgroundJobs,
  listRecoverableOpenAIBackgroundJobs,
} from '../api-clients/openai-background-job-store.mjs'
import {
  clearAllContinuityState,
} from '../chat/continuity/continuity-store.mjs'
import {
  clearAllTerminalSessionArchives,
} from '../terminal/terminal-session-archive-store.mjs'
import {
  cleanupAllWorkspaceAttachments,
  cleanupAllWorkspaceProviderAssets,
  cleanupThreadAttachments,
} from './workspace-store-cleanup.mjs'
import {
  buildThreadExportComplianceDisclaimer,
  collectComplianceEventSummary,
  collectExportProvenance,
  normalizeThreadExportOptions,
} from './workspace-store-export-helpers.mjs'
import {
  MAX_THREAD_TITLE_CHARS,
  now,
  genId,
  normalizeProjectPath,
  projectNameFromPath,
  normalizeEventContent,
  trimString,
  safeMetaJson,
  mapProjectRow,
  mapThreadRow,
  mapEventRow,
  getProjectByPathInternal,
  getProjectByIdInternal,
  getThreadInternal,
  ensureDefaultThreadInternal,
  pruneThreadEventsInternal,
  extractAttachmentIdsFromMeta,
  remapAttachmentReferencesInMetaJson,
  normalizeImportedThreadEvents,
} from './workspace-store-utils.mjs'
import {
  acknowledgeWorkspaceThreadActivity,
  listWorkspaceThreads,
} from './workspace-thread-activity.mjs'
import { reconcileInterruptedWorkspaceTurns } from './workspace-turn-recovery.mjs'
import {
  deleteWorkspaceThread,
  removeWorkspaceProject,
} from './workspace-lifecycle-service.mjs'
import { createPromotedProjectThread } from './workspace-promotion-service.mjs'
import { createRootEventRepository } from './root-event-repository.mjs'
import { deriveThreadTitleFromPrompt } from './thread-auto-title.mjs'
export {
  listTimeline,
  touchProjectUsage,
  touchProjectUsageByThread,
} from './workspace-store-usage.mjs'

function purgeAllWorkspaceDatabaseState() {
  clearAllOpenAIThreadState()
  clearAllOpenAIBackgroundJobs()
  clearAllContinuityState()
  clearAllTerminalSessionArchives()
  clearAllArtifacts()
  clearNodes(null)
}

export function registerProject(projectPath) {
  const db = getDb()
  const normalizedPath = normalizeProjectPath(projectPath)
  const ts = now()

  const tx = db.transaction(() => {
    let row = getProjectByPathInternal(db, normalizedPath)
    if (!row) {
      const id = genId('project')
      const name = projectNameFromPath(normalizedPath)
      db.prepare(`
        INSERT INTO workspace_projects (
          id, path, name, created_at, last_opened_at, last_worked_at,
          last_provider, last_model, active_thread_id
        )
        VALUES (?, ?, ?, ?, ?, ?, '', '', NULL)
      `).run(id, normalizedPath, name, ts, ts, ts)
      row = getProjectByIdInternal(db, id)
    } else {
      db.prepare(`
        UPDATE workspace_projects
        SET name = ?, last_opened_at = ?
        WHERE id = ?
      `).run(projectNameFromPath(normalizedPath), ts, row.id)
      row = getProjectByIdInternal(db, row.id)
    }

    const activeThread = ensureDefaultThreadInternal(db, row.id)
    row = getProjectByIdInternal(db, row.id)
    return {
      project: mapProjectRow({
        ...row,
        thread_count: Number(db.prepare('SELECT COUNT(*) AS c FROM chat_threads WHERE project_id = ? AND archived = 0').get(row.id)?.c || 0),
        latest_assistant_note: db.prepare(`
          SELECT ce.content AS content
          FROM chat_events ce
          INNER JOIN chat_threads t ON t.id = ce.thread_id
          WHERE t.project_id = ? AND ce.kind = 'assistant_message'
          ORDER BY ce.event_id DESC
          LIMIT 1
        `).get(row.id)?.content ?? '',
      }),
      activeThread,
    }
  })

  return tx()
}

export function listProjects() {
  const db = getDb()
  const rows = db.prepare(`
    WITH thread_counts AS (
      SELECT
        t.project_id,
        COUNT(*) AS thread_count
      FROM chat_threads t
      WHERE t.archived = 0
      GROUP BY t.project_id
    ),
    latest_assistant_ranked AS (
      SELECT
        t.project_id,
        ce.content,
        ROW_NUMBER() OVER (
          PARTITION BY t.project_id
          ORDER BY ce.event_id DESC
        ) AS assistant_rank
      FROM chat_events ce
      INNER JOIN chat_threads t ON t.id = ce.thread_id
      WHERE ce.kind = 'assistant_message'
    )
    SELECT
      p.*,
      COALESCE(tc.thread_count, 0) AS thread_count,
      COALESCE(la.content, '') AS latest_assistant_note
    FROM workspace_projects p
    LEFT JOIN thread_counts tc ON tc.project_id = p.id
    LEFT JOIN latest_assistant_ranked la
      ON la.project_id = p.id
      AND la.assistant_rank = 1
    ORDER BY p.last_worked_at DESC, p.last_opened_at DESC
  `).all()

  return rows.map(mapProjectRow)
}

export function setActiveProject(projectId) {
  const db = getDb()
  const id = String(projectId ?? '').trim()
  if (!id) throw new Error('projectId is required.')

  const tx = db.transaction(() => {
    const row = getProjectByIdInternal(db, id)
    if (!row) throw new Error('Project not found.')

    db.prepare('UPDATE workspace_projects SET last_opened_at = ? WHERE id = ?').run(now(), id)
    const activeThread = ensureDefaultThreadInternal(db, id)
    const updated = getProjectByIdInternal(db, id)
    return { project: mapProjectRow(updated), activeThread }
  })

  return tx()
}

export function listThreads(projectId) {
  return listWorkspaceThreads(projectId)
}

export function acknowledgeThreadActivity(threadId, acknowledgedAt = Date.now()) {
  return acknowledgeWorkspaceThreadActivity(threadId, acknowledgedAt)
}

export function createThread(projectId, title = 'New Thread') {
  const db = getDb()
  const id = String(projectId ?? '').trim()
  if (!id) throw new Error('projectId is required.')

  const cleanTitle = String(title ?? '').trim() || 'New Thread'
  const titleSource = cleanTitle === 'New Thread' ? 'default' : 'manual'
  const ts = now()
  const threadId = genId('thread')

  const tx = db.transaction(() => {
    const project = getProjectByIdInternal(db, id)
    if (!project) throw new Error('Project not found.')
    const projectProvider = String(project.last_provider || '').trim()
    const projectModel = String(project.last_model || '').trim()

    db.prepare(`
      INSERT INTO chat_threads (id, project_id, title, title_source, last_provider, last_model, created_at, updated_at, last_viewed_at, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(threadId, id, trimString(cleanTitle, MAX_THREAD_TITLE_CHARS), titleSource, projectProvider, projectModel, ts, ts, ts)

    db.prepare(`
      UPDATE workspace_projects
      SET active_thread_id = ?, last_opened_at = ?
      WHERE id = ?
    `).run(threadId, ts, id)

    const thread = getThreadInternal(db, threadId)
    const updatedProject = getProjectByIdInternal(db, id)
    return {
      project: mapProjectRow(updatedProject),
      thread: mapThreadRow(thread),
    }
  })

  return tx()
}

export function createThreadFromPromotionSnapshot({ projectId, snapshot, title = '' } = {}) {
  return createPromotedProjectThread({
    db: getDb(), projectId, snapshot, title, now, idFactory: genId,
  })
}

export function setActiveThread(projectId, threadId) {
  const db = getDb()
  const pid = String(projectId ?? '').trim()
  const tid = String(threadId ?? '').trim()
  if (!pid || !tid) throw new Error('projectId and threadId are required.')

  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM chat_threads WHERE id = ? AND project_id = ? AND archived = 0').get(tid, pid)
    if (!row) throw new Error('Thread not found for project.')

    const ts = now()
    db.prepare('UPDATE chat_threads SET last_viewed_at = ? WHERE id = ?').run(ts, tid)
    db.prepare(`
      UPDATE workspace_projects
      SET active_thread_id = ?, last_opened_at = ?
      WHERE id = ?
    `).run(tid, ts, pid)

    const project = getProjectByIdInternal(db, pid)
    return {
      project: mapProjectRow(project),
      thread: mapThreadRow(db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(tid)),
    }
  })

  return tx()
}

export function resolveWorkspaceProjectPath({ projectId = '', threadId = '' } = {}) {
  const db = getDb()
  const normalizedThreadId = String(threadId ?? '').trim()
  const normalizedProjectId = String(projectId ?? '').trim()

  if (normalizedThreadId) {
    const thread = getThreadInternal(db, normalizedThreadId)
    const threadProjectId = String(thread?.project_id || '').trim()
    if (threadProjectId) {
      const project = getProjectByIdInternal(db, threadProjectId)
      const projectPath = String(project?.path || '').trim()
      if (projectPath) return projectPath
    }
  }

  if (normalizedProjectId) {
    const project = getProjectByIdInternal(db, normalizedProjectId)
    const projectPath = String(project?.path || '').trim()
    if (projectPath) return projectPath
  }

  return ''
}

export function renameThread(projectId, threadId, title = '') {
  const db = getDb()
  const pid = String(projectId ?? '').trim()
  const tid = String(threadId ?? '').trim()
  if (!pid || !tid) throw new Error('projectId and threadId are required.')

  const cleanTitle = trimString(String(title ?? '').trim(), MAX_THREAD_TITLE_CHARS)
  if (!cleanTitle) throw new Error('Thread title is required.')

  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM chat_threads WHERE id = ? AND project_id = ? AND archived = 0').get(tid, pid)
    if (!row) throw new Error('Thread not found for project.')

    const ts = now()
    db.prepare("UPDATE chat_threads SET title = ?, title_source = 'manual', updated_at = ? WHERE id = ?").run(cleanTitle, ts, tid)
    db.prepare('UPDATE workspace_projects SET last_opened_at = ? WHERE id = ?').run(ts, pid)

    const project = getProjectByIdInternal(db, pid)
    const thread = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(tid)
    return {
      project: mapProjectRow(project),
      thread: mapThreadRow(thread),
    }
  })

  return tx()
}

export function autoTitleThread(projectId, threadId, prompt = '') {
  const db = getDb()
  const pid = String(projectId ?? '').trim()
  const tid = String(threadId ?? '').trim()
  const title = deriveThreadTitleFromPrompt(prompt)
  if (!pid || !tid || !title) return { updated: false, thread: null }

  const tx = db.transaction(() => {
    const ts = now()
    const result = db.prepare(`
      UPDATE chat_threads
      SET title = ?, title_source = 'auto', updated_at = ?
      WHERE id = ? AND project_id = ? AND archived = 0 AND title_source = 'default'
    `).run(trimString(title, MAX_THREAD_TITLE_CHARS), ts, tid, pid)
    const thread = db.prepare('SELECT * FROM chat_threads WHERE id = ? AND project_id = ?').get(tid, pid)
    return { updated: result.changes === 1, thread: mapThreadRow(thread) }
  })

  return tx()
}

export function appendEvent(threadId, {
  turnId = '',
  kind = '',
  role = '',
  content = '',
  meta = {},
  createdAt = null,
} = {}) {
  const db = getDb()
  const tid = String(threadId ?? '').trim()
  if (!tid) throw new Error('threadId is required.')

  const normalized = normalizeAppendEventInput({
    turnId,
    kind,
    role,
    content,
    meta,
    createdAt,
  })

  return appendNormalizedEventsTx(db, tid, [normalized])[0] || null
}

export function reconcileWorkspaceTurnsOnStartup() {
  return reconcileInterruptedWorkspaceTurns({
    db: getDb(),
    appendEvent,
    listRecoverableJobs: listRecoverableOpenAIBackgroundJobs,
  })
}

function normalizeAppendEventInput({
  turnId = '',
  kind = '',
  role = '',
  content = '',
  meta = {},
  createdAt = null,
} = {}) {
  const cleanKind = String(kind ?? '').trim()
  if (!cleanKind) throw new Error('event.kind is required.')

  const ts = Number(createdAt) > 0 ? Number(createdAt) : now()
  return {
    turnId: trimString(String(turnId ?? ''), 120),
    kind: cleanKind,
    role: trimString(String(role ?? ''), 40),
    content: normalizeEventContent(cleanKind, content),
    metaJson: safeMetaJson(meta),
    createdAt: ts,
  }
}

function appendNormalizedEventsTx(db, threadId, normalizedEvents = []) {
  const tid = String(threadId ?? '').trim()
  if (!tid) throw new Error('threadId is required.')
  const source = Array.isArray(normalizedEvents) ? normalizedEvents : []
  if (source.length === 0) return []

  const tx = db.transaction(() => {
    const thread = getThreadInternal(db, tid)
    if (!thread || !!thread.archived) throw new Error('Thread not found.')

    const insertStmt = db.prepare(`
      INSERT INTO chat_events (thread_id, turn_id, kind, role, content, meta_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const selectStmt = db.prepare('SELECT * FROM chat_events WHERE event_id = ?')
    const updateThreadStmt = db.prepare('UPDATE chat_threads SET updated_at = ? WHERE id = ?')
    const updateProjectStmt = db.prepare(`
      UPDATE workspace_projects
      SET last_worked_at = ?, last_opened_at = ?
      WHERE id = ?
    `)

    const insertedEventIds = []
    let latestCreatedAt = 0

    for (const event of source) {
      const result = insertStmt.run(
        tid,
        event.turnId,
        event.kind,
        event.role,
        event.content,
        event.metaJson,
        event.createdAt,
      )
      insertedEventIds.push(Number(result.lastInsertRowid || 0))
      if (event.createdAt > latestCreatedAt) latestCreatedAt = event.createdAt
    }

    updateThreadStmt.run(latestCreatedAt, tid)
    updateProjectStmt.run(latestCreatedAt, latestCreatedAt, thread.project_id)

    const mappedRows = insertedEventIds.map((eventId) => mapEventRow(selectStmt.get(eventId)))
    pruneThreadEventsInternal(db, tid)
    return mappedRows
  })

  return tx()
}

export function appendEvents(threadId, events = []) {
  if (!Array.isArray(events) || events.length === 0) return []
  const db = getDb()
  const tid = String(threadId ?? '').trim()
  if (!tid) throw new Error('threadId is required.')

  const normalized = events.map((event) => normalizeAppendEventInput(event))
  return appendNormalizedEventsTx(db, tid, normalized)
}

export function appendCanonicalRootEvent(threadId, event = {}) {
  return createRootEventRepository(getDb()).append({
    ...event,
    threadId: String(threadId ?? '').trim(),
  })
}

export function appendCanonicalRootEvents(threadId, events = []) {
  if (!Array.isArray(events) || events.length === 0) return []
  const tid = String(threadId ?? '').trim()
  return createRootEventRepository(getDb()).appendMany(
    events.map((event) => ({ ...event, threadId: tid })),
  )
}


export async function deleteThread(threadId) {
  return deleteWorkspaceThread(threadId)
}

export async function exportThread(threadId, options = {}) {
  const db = getDb()
  const tid = String(threadId ?? '').trim()
  if (!tid) throw new Error('threadId is required.')
  const normalizedOptions = normalizeThreadExportOptions(options)
  const thread = getThreadInternal(db, tid)
  if (!thread || !!thread.archived) throw new Error('Thread not found.')
  const project = getProjectByIdInternal(db, thread.project_id)
  if (!project) throw new Error('Project not found.')
  const rows = db.prepare(`
    SELECT *
    FROM chat_events
    WHERE thread_id = ?
    ORDER BY event_id ASC
  `).all(tid)
  const events = rows.map(mapEventRow)
  const attachmentIds = new Set()
  for (const event of events) {
    const ids = extractAttachmentIdsFromMeta(event?.meta || {})
    for (const id of ids) attachmentIds.add(id)
  }
  const attachments = await exportCachedAttachmentsByIds(tid, [...attachmentIds])
  const provenance = collectExportProvenance(events)
  const complianceSummary = collectComplianceEventSummary(events)
  const exportMeta = {
    options: normalizedOptions,
    provenance,
    complianceSummary,
    complianceDisclaimer: buildThreadExportComplianceDisclaimer(normalizedOptions),
  }
  return {
    schema: 'addom.thread_export.v2',
    exportedAt: now(),
    thread: {
      id: String(thread.id || ''),
      title: String(thread.title || 'Imported Thread'),
      projectId: String(project.id || ''),
      projectName: String(project.name || ''),
      projectPath: '',
      createdAt: Number(thread.created_at || 0),
      updatedAt: Number(thread.updated_at || 0),
    },
    eventCount: rows.length,
    attachmentCount: attachments.length,
    attachments,
    events,
    exportMeta,
  }
}

export async function importThread(projectId, payload = {}) {
  const db = getDb()
  const pid = String(projectId ?? '').trim()
  if (!pid) throw new Error('projectId is required.')
  if (!payload || typeof payload !== 'object') throw new Error('payload is required.')
  const importedEvents = normalizeImportedThreadEvents(payload)
  const importedAttachmentPayloads = Array.isArray(payload?.attachments) ? payload.attachments : []
  const titleCandidate = String(
    payload?.thread?.title
    || payload?.title
    || `Imported ${new Date().toISOString().slice(0, 10)}`,
  ).trim()
  const cleanTitle = trimString(titleCandidate || 'Imported Thread', MAX_THREAD_TITLE_CHARS)
  const threadId = genId('thread')
  let attachmentMapping = {}
  if (importedAttachmentPayloads.length > 0) {
    const importedAttachments = await importThreadAttachmentPayloads({
      projectId: pid,
      threadId,
      attachments: importedAttachmentPayloads,
    })
    attachmentMapping = importedAttachments?.mapping && typeof importedAttachments.mapping === 'object'
      ? importedAttachments.mapping
      : {}
  }
  const tx = db.transaction(() => {
    const project = getProjectByIdInternal(db, pid)
    if (!project) throw new Error('Project not found.')
    const ts = now()
    const projectProvider = String(project.last_provider || '').trim()
    const projectModel = String(project.last_model || '').trim()
    db.prepare(`
      INSERT INTO chat_threads (id, project_id, title, last_provider, last_model, created_at, updated_at, last_viewed_at, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(threadId, pid, cleanTitle, projectProvider, projectModel, ts, ts, ts)
    if (importedEvents.length > 0) {
      const canonicalRepository = createRootEventRepository(db)
      const insertStmt = db.prepare(`
        INSERT INTO chat_events (thread_id, turn_id, kind, role, content, meta_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const event of importedEvents) {
        const mappedMetaJson = remapAttachmentReferencesInMetaJson(event.metaJson, attachmentMapping)
        if (Number(event?.canonical?.schemaVersion || 0) > 0) {
          canonicalRepository.importOne(threadId, { ...event, metaJson: mappedMetaJson }, event.canonical)
          continue
        }
        insertStmt.run(
          threadId,
          String(event.turnId || ''),
          String(event.kind || 'note'),
          String(event.role || ''),
          String(event.content || ''),
          String(mappedMetaJson || '{}'),
          Number(event.createdAt || ts),
        )
      }
      pruneThreadEventsInternal(db, threadId)
    }
    const touchedAt = importedEvents.length > 0
      ? Number(importedEvents[importedEvents.length - 1]?.createdAt || ts)
      : ts
    db.prepare('UPDATE chat_threads SET updated_at = ? WHERE id = ?').run(touchedAt, threadId)
    db.prepare(`
      UPDATE workspace_projects
      SET active_thread_id = ?, last_opened_at = ?, last_worked_at = ?
      WHERE id = ?
    `).run(threadId, touchedAt, touchedAt, pid)

    const nextProject = getProjectByIdInternal(db, pid)
    const nextThread = getThreadInternal(db, threadId)
    return {
      project: mapProjectRow(nextProject),
      thread: mapThreadRow(nextThread),
      importedEvents: importedEvents.length,
      skippedEvents: Math.max(
        0,
        (Array.isArray(payload?.events) ? payload.events.length : 0) - importedEvents.length,
      ),
    }
  })
  try {
    return tx()
  } catch (error) {
    try {
      await cleanupThreadAttachments(threadId)
    } catch {
      // Non-fatal cleanup best effort after failed import transaction.
    }
    throw error
  }
}

export async function removeProject(projectId) {
  return await removeWorkspaceProject(projectId)
}

export async function clearAllWorkspaceData() {
  const db = getDb()
  const tx = db.transaction(() => {
    const events = db.prepare('DELETE FROM chat_events').run()
    const threads = db.prepare('DELETE FROM chat_threads').run()
    const projects = db.prepare('DELETE FROM workspace_projects').run()
    return {
      ok: true,
      deletedEvents: Number(events.changes || 0),
      deletedThreads: Number(threads.changes || 0),
      deletedProjects: Number(projects.changes || 0),
    }
  })
  const result = tx()
  purgeAllWorkspaceDatabaseState()
  return {
    ...result,
    providerAssetCleanup: await cleanupAllWorkspaceProviderAssets(),
    attachmentCleanup: await cleanupAllWorkspaceAttachments(),
  }
}
