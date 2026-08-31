/**
 * artifact-store.mjs — version every AI write_file call.
 */

import crypto from 'node:crypto'
import path from 'node:path'
import { getDb } from './db.mjs'

function genId() {
  return `a_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}

function normalisePath(filePath) {
  return String(filePath ?? '').replace(/\\/g, '/').trim()
}

function normalizeProjectKey(project) {
  const raw = String(project ?? '').trim()
  if (!raw) return ''
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\') || raw.startsWith('/') || raw.startsWith('.')) {
    return path.resolve(raw)
  }
  return raw
}

function normalizeNullableText(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function resolveArtifactOrigin(db, threadId = '', turnId = '') {
  const normalizedThreadId = normalizeNullableText(threadId)
  const thread = normalizedThreadId
    ? db.prepare('SELECT title FROM chat_threads WHERE id = ?').get(normalizedThreadId)
    : null
  return {
    threadId: normalizedThreadId,
    threadTitle: String(thread?.title || ''),
    turnId: normalizeNullableText(turnId),
  }
}

function clampInteger(value, { min = 1, max = 100, fallback = 1 } = {}) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function truncate(text, max = 240) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}...` : s
}

function buildRevisionResult(latest = null, {
  prevRevId = null,
  newRevId = '',
  rev = 0,
  recorded = true,
  skippedReason = '',
} = {}) {
  return {
    prevRevId: String(prevRevId ?? latest?.prev_rev_id ?? ''),
    newRevId: String(newRevId || latest?.id || ''),
    rev: Number(rev || latest?.rev || 0) || 0,
    recorded: recorded === true,
    skippedReason: String(skippedReason || '').trim(),
  }
}

export function listFiles(project, { threadId = '' } = {}) {
  const db = getDb()
  const projectKey = normalizeProjectKey(project)
  const normalizedThreadId = normalizeNullableText(threadId)
  const threadClause = normalizedThreadId
    ? `WHERE EXISTS (
        SELECT 1 FROM artifacts scoped
        WHERE scoped.project = ?
          AND scoped.file_path = latest.file_path
          AND scoped.origin_thread_id = ?
      )`
    : ''
  const args = normalizedThreadId
    ? [projectKey, projectKey, projectKey, projectKey, normalizedThreadId]
    : [projectKey, projectKey, projectKey]
  return db.prepare(`
    SELECT latest.file_path,
           latest.rev        AS latest_rev,
           latest.id         AS latest_id,
           latest.source     AS latest_source,
           latest.created_at AS latest_at,
           totals.total_revisions
    FROM (
      SELECT a.*
      FROM artifacts a
      INNER JOIN (
        SELECT file_path, MAX(rev) AS max_rev
        FROM artifacts
        WHERE project = ?
        GROUP BY file_path
      ) mx
        ON mx.file_path = a.file_path
       AND mx.max_rev = a.rev
      WHERE a.project = ?
    ) latest
    INNER JOIN (
      SELECT file_path, COUNT(*) AS total_revisions
      FROM artifacts
      WHERE project = ?
      GROUP BY file_path
    ) totals
      ON totals.file_path = latest.file_path
    ${threadClause}
    ORDER BY latest.created_at DESC
  `).all(...args)
}

export function listRevisions(project, filePath) {
  const db = getDb()
  const projectKey = normalizeProjectKey(project)
  return db.prepare(`
    SELECT id, rev, source, note, created_at, prev_rev_id,
           origin_thread_id, origin_thread_title, origin_turn_id,
           origin_thread_state, origin_thread_deleted_at,
           LENGTH(content) AS content_length
    FROM artifacts
    WHERE project = ? AND file_path = ?
    ORDER BY rev DESC
  `).all(projectKey, normalisePath(filePath))
}

export function getRevision(id) {
  const db = getDb()
  return db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id)
}

export function getLatestRevision(project, filePath) {
  const db = getDb()
  const projectKey = normalizeProjectKey(project)
  return db.prepare(`
    SELECT * FROM artifacts
    WHERE project = ? AND file_path = ?
    ORDER BY rev DESC
    LIMIT 1
  `).get(projectKey, normalisePath(filePath))
}

/**
 * Retrieve the current latest revision id for a given file.
 * Returns the revision id string, or '' if no revision exists.
 * Callers should capture this *before* tool execution and later pass it
 * as `expectedBaseRevId` to `recordWrite()` to enable conflict detection.
 */
export function getBaseRevisionId(project, filePath) {
  const latest = getLatestRevision(project, filePath)
  return String(latest?.id || '')
}

/**
 * Record a write to the artifact store.
 *
 * If `expectedBaseRevId` is provided and non-empty, the function compares it
 * against the current latest revision.  When they differ (i.e. another write
 * landed between the read and the write), the write is still recorded but the
 * returned object includes `conflict: true` together with the conflicting
 * revision metadata so the caller can decide whether to stage or reject.
 */
export function recordWrite({
  project,
  filePath,
  newContent,
  prevContent = null,
  source = 'ai_write',
  note = '',
  expectedBaseRevId = '',
  baselineNote = 'Pre-AI baseline',
  threadId = '',
  turnId = '',
}) {
  const db      = getDb()
  const relPath = normalisePath(filePath)
  const projectKey = normalizeProjectKey(project)
  const now     = Date.now()
  const origin = resolveArtifactOrigin(db, threadId, turnId)

  const existing = db.prepare(`
    SELECT id, rev FROM artifacts
    WHERE project = ? AND file_path = ?
    ORDER BY rev DESC LIMIT 1
  `).get(projectKey, relPath)

  // --- Conflict detection ---------------------------------------------------
  const normalizedExpected = String(expectedBaseRevId || '').trim()
  const actualBaseId = String(existing?.id || '')
  const hasConflict = (
    normalizedExpected !== ''
    && actualBaseId !== ''
    && normalizedExpected !== actualBaseId
  )

  let prevRevId = null
  let nextRev   = 1

  if (existing) {
    prevRevId = existing.id
    nextRev   = existing.rev + 1
  } else if (prevContent !== null && prevContent !== '') {
    const baselineId = genId()
    db.prepare(`
      INSERT INTO artifacts (id, project, file_path, rev, content, prev_rev_id, source, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(baselineId, projectKey, relPath, 0, prevContent, null, 'baseline', baselineNote, now - 1)
    prevRevId = baselineId
    nextRev   = 1
  }

  const newId = genId()
  db.prepare(`
    INSERT INTO artifacts (
      id, project, file_path, rev, content, prev_rev_id, source, note,
      origin_thread_id, origin_thread_title, origin_turn_id,
      origin_thread_state, origin_thread_deleted_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?)
  `).run(
    newId,
    projectKey,
    relPath,
    nextRev,
    newContent,
    prevRevId,
    source,
    note,
    origin.threadId,
    origin.threadTitle,
    origin.turnId,
    now,
  )

  const result = { prevRevId, newRevId: newId, rev: nextRev }
  if (hasConflict) {
    result.conflict = true
    result.conflictBaseRevId = normalizedExpected
    result.conflictActualRevId = actualBaseId
    result.conflictActualRev = Number(existing?.rev || 0) || 0
  }
  return result
}

export function recordManualEditSave({ project, filePath, newContent, prevContent = null, note = 'Saved from editor' }) {
  const normalizedNewContent = String(newContent ?? '')
  const normalizedPrevContent = prevContent === null ? null : String(prevContent)
  if (normalizedPrevContent !== null && normalizedPrevContent === normalizedNewContent) {
    const latest = getLatestRevision(project, filePath)
    return buildRevisionResult(latest, {
      recorded: false,
      skippedReason: 'unchanged',
    })
  }
  const record = recordWrite({
    project,
    filePath,
    newContent: normalizedNewContent,
    prevContent: normalizedPrevContent,
    source: 'manual_edit',
    note,
    baselineNote: 'Pre-manual-edit baseline',
  })
  return buildRevisionResult(null, {
    prevRevId: record.prevRevId,
    newRevId: record.newRevId,
    rev: record.rev,
    recorded: true,
  })
}

export function deleteFile(project, filePath) {
  const db = getDb()
  const projectKey = normalizeProjectKey(project)
  db.prepare('DELETE FROM artifacts WHERE project = ? AND file_path = ?')
    .run(projectKey, normalisePath(filePath))
}

export function deleteRevision(id) {
  const db = getDb()
  db.prepare('DELETE FROM artifacts WHERE id = ?').run(id)
}

export function clearArtifactsForProject(project = '') {
  const normalizedProject = normalizeProjectKey(project)
  if (!normalizedProject) return 0
  const db = getDb()
  return Number(db.prepare('DELETE FROM artifacts WHERE project = ?').run(normalizedProject)?.changes || 0) || 0
}

export function clearAllArtifacts() {
  const db = getDb()
  return Number(db.prepare('DELETE FROM artifacts').run()?.changes || 0) || 0
}

export function buildArtifactReviewContext(project, {
  filePaths = [],
  limit = 12,
  includeRevisions = true,
  revisionsPerFile = 3,
  fromRev = null,
  toRev = null,
} = {}) {
  const normalizedLimit = clampInteger(limit, { min: 1, max: 40, fallback: 12 })
  const normalizedRevisionsPerFile = clampInteger(revisionsPerFile, { min: 1, max: 8, fallback: 3 })
  const normalizedIncludeRevisions = includeRevisions !== false
  const normalizedFromRev = Number.isFinite(Number(fromRev)) ? Math.max(0, Math.round(Number(fromRev))) : null
  const normalizedToRev = Number.isFinite(Number(toRev)) ? Math.max(0, Math.round(Number(toRev))) : null

  const files = listFiles(project)
  if (!files.length) {
    return {
      context: 'No artifacts were found for this project.',
      traceSummary: 'No artifact files available.',
      files: [],
    }
  }

  const normalizedPathFilters = Array.isArray(filePaths)
    ? filePaths.map((p) => normalisePath(p).toLowerCase()).filter(Boolean)
    : []
  const filterSet = new Set(normalizedPathFilters)

  const filtered = filterSet.size > 0
    ? files.filter((row) => filterSet.has(normalisePath(row.file_path).toLowerCase()))
    : files

  const selected = filtered.slice(0, normalizedLimit)
  const lines = [
    `Artifact snapshot (${selected.length} files returned, ${filtered.length} matched):`,
  ]
  if (filterSet.size > 0) {
    lines.push(`Applied filters: filePaths=[${normalizedPathFilters.join(', ')}] | limit=${normalizedLimit}`)
  } else {
    lines.push(`Applied filters: limit=${normalizedLimit}`)
  }
  if (normalizedIncludeRevisions) {
    lines.push(`Revision window: revisionsPerFile=${normalizedRevisionsPerFile}${Number.isFinite(normalizedFromRev) ? ` | fromRev=${normalizedFromRev}` : ''}${Number.isFinite(normalizedToRev) ? ` | toRev=${normalizedToRev}` : ''}`)
  }

  const reviewedFiles = []

  const db = getDb()
  const projectKey = normalizeProjectKey(project)
  const revisionsWindowStmt = db.prepare(`
    SELECT id, rev, source, note, created_at, content
    FROM artifacts
    WHERE project = ?
      AND file_path = ?
      AND (? IS NULL OR rev >= ?)
      AND (? IS NULL OR rev <= ?)
    ORDER BY rev DESC
    LIMIT ?
  `)

  for (const row of selected) {
    lines.push(`- ${row.file_path} (latest rev: ${row.latest_rev}, total revisions: ${row.total_revisions}, source: ${row.latest_source})`)

    const fileMeta = {
      filePath: row.file_path,
      latestId: row.latest_id,
      latestRev: row.latest_rev,
      totalRevisions: row.total_revisions,
      latestSource: row.latest_source,
      revisions: [],
    }

    if (normalizedIncludeRevisions) {
      const revisions = revisionsWindowStmt.all(
        projectKey,
        row.file_path,
        normalizedFromRev,
        normalizedFromRev,
        normalizedToRev,
        normalizedToRev,
        normalizedRevisionsPerFile,
      )
      for (const revision of revisions) {
        const excerpt = truncate(revision.content, 180)
        const note = truncate(revision.note, 120)
        lines.push(`  - rev ${revision.rev} (${revision.source})${note ? ` note: ${note}` : ''}${excerpt ? ` excerpt: ${excerpt}` : ''}`)
        fileMeta.revisions.push({
          id: revision.id,
          rev: revision.rev,
          source: revision.source,
          createdAt: revision.created_at,
          note,
          excerpt,
        })
      }
      if (revisions.length === 0) {
        lines.push('  - No revisions matched the requested window.')
      }
    }

    reviewedFiles.push(fileMeta)
  }

  if (selected.length === 0) {
    lines.push('- No artifact files matched the requested filters.')
  }

  const usedFiles = reviewedFiles.map((f) => f.filePath)
  const usedRevisionIds = reviewedFiles
    .flatMap((f) => f.revisions.map((r) => r.id))
    .filter(Boolean)

  return {
    context: lines.join('\n'),
    traceSummary: [
      `usedFiles=${usedFiles.length ? usedFiles.join(', ') : 'none'}`,
      `usedRevisionIds=${usedRevisionIds.length ? usedRevisionIds.join(', ') : 'none'}`,
      `matched=${filtered.length}`,
      `returned=${selected.length}`,
    ].join(' | '),
    files: reviewedFiles,
  }
}
