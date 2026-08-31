import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../memory/db.mjs'
import { getUserDataPath } from '../platform/electron-app.mjs'

const MAX_STAGE_ATTACHMENTS = 24
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const EXPORT_BASE64_CHUNK_CHARS = 6_000
const EXPORT_MAX_BASE64_CHUNKS = 4_000
const ORPHAN_CLEANUP_DETAIL_LIMIT = 25
export const ATTACHMENT_PREVIEW_SCHEME = 'addom-attachment'

const ATTACHMENT_EXTENSION_BY_MIME = new Map([
  ['application/pdf', '.pdf'],
  ['application/x-pdf', '.pdf'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/svg+xml', '.svg'],
  ['text/plain', '.txt'],
  ['text/markdown', '.md'],
  ['application/json', '.json'],
  ['text/csv', '.csv'],
])

function now() {
  return Date.now()
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeScope(scope = null) {
  const input = scope && typeof scope === 'object' ? scope : {}
  return {
    projectId: normalizeId(input.projectId || input.project_id || ''),
    threadId: normalizeId(input.threadId || input.thread_id || ''),
  }
}

function normalizeMediaType(value = '', fallback = '') {
  const raw = String(value || '').trim().toLowerCase()
  return raw || String(fallback || '').trim().toLowerCase()
}

function replaceForbiddenWindowsNameChars(value = '') {
  return Array.from(String(value || ''), (char) => {
    const code = char.charCodeAt(0)
    if (code <= 0x1f || /[<>:"/\\|?*]/.test(char)) return '_'
    return char
  }).join('')
}

function safePathSegment(value = '', fallback = 'unknown') {
  const text = String(value || '').trim()
  const cleaned = text
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .slice(0, 120)
  return cleaned || fallback
}

function sanitizeAttachmentBaseName(rawName = '', fallback = 'attachment') {
  const text = String(rawName || '').trim()
  const normalized = replaceForbiddenWindowsNameChars(text || fallback)
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  if (!normalized) return fallback
  return normalized.slice(0, 120)
}

function parseAttachmentPayload(raw = '') {
  const text = String(raw || '').trim()
  if (!text) return { mediaType: '', base64: '' }
  if (!text.startsWith('data:')) return { mediaType: '', base64: text }
  const match = text.match(/^data:([^;,]+)?;base64,([\s\S]+)$/i)
  if (!match) return { mediaType: '', base64: '' }
  return {
    mediaType: normalizeMediaType(match[1] || '', ''),
    base64: String(match[2] || '').trim(),
  }
}

function decodeBase64Attachment(rawBase64 = '') {
  const compact = String(rawBase64 || '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  if (!compact || compact.length % 4 === 1) return null
  if (!/^[a-z0-9+/=]+$/i.test(compact)) return null
  try {
    const data = Buffer.from(compact, 'base64')
    return data.length > 0 ? data : null
  } catch {
    return null
  }
}

function resolveAttachmentKind(rawKind = '', mediaType = '') {
  const kind = String(rawKind || '').trim().toLowerCase()
  if (kind === 'image' || kind === 'file') return kind
  return String(mediaType || '').trim().toLowerCase().startsWith('image/')
    ? 'image'
    : 'file'
}

function resolveAttachmentExtension(mediaType = '', fileName = '', kind = 'file') {
  const normalizedMediaType = normalizeMediaType(mediaType, '')
  const mappedExtension = ATTACHMENT_EXTENSION_BY_MIME.get(normalizedMediaType)
  if (mappedExtension) return mappedExtension

  const ext = String(path.extname(String(fileName || '').trim()) || '').toLowerCase()
  if (/^\.[a-z0-9]{1,10}$/i.test(ext)) return ext
  return kind === 'image' ? '.png' : '.bin'
}

function toCacheRootAbsolutePath() {
  return path.resolve(path.join(getUserDataPath(), 'attachment-cache'))
}

function normalizeRelativePath(value = '') {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
}

function isPathInsideRoot(rootPath, candidatePath) {
  const root = path.resolve(rootPath)
  const candidate = path.resolve(candidatePath)
  if (process.platform === 'win32') {
    const rootLower = root.toLowerCase()
    const candidateLower = candidate.toLowerCase()
    return candidateLower === rootLower || candidateLower.startsWith(`${rootLower}\\`)
  }
  return candidate === root || candidate.startsWith(`${root}/`)
}

function resolveAbsolutePathFromRelative(relativePath = '') {
  const root = toCacheRootAbsolutePath()
  const rel = normalizeRelativePath(relativePath)
  if (!rel) return ''
  const absolute = path.resolve(root, rel)
  return isPathInsideRoot(root, absolute) ? absolute : ''
}

async function isExistingFile(absolutePath = '') {
  const target = String(absolutePath || '').trim()
  if (!target) return false
  try {
    const stat = await fs.promises.stat(target)
    return stat.isFile()
  } catch {
    return false
  }
}

async function isExistingDirectory(absolutePath = '') {
  const target = String(absolutePath || '').trim()
  if (!target) return false
  try {
    const stat = await fs.promises.stat(target)
    return stat.isDirectory()
  } catch {
    return false
  }
}

function toAttachmentPreviewUrl(attachmentId = '') {
  const id = normalizeId(attachmentId)
  if (!id) return ''
  return `${ATTACHMENT_PREVIEW_SCHEME}://attachment/${encodeURIComponent(id)}`
}

function attachmentRowToDescriptor(row = {}) {
  const absolutePath = resolveAbsolutePathFromRelative(row.relative_path || '')
  const kind = resolveAttachmentKind(row.kind || '', row.media_type || '')
  return {
    attachmentId: String(row.id || ''),
    kind,
    mediaType: normalizeMediaType(row.media_type || '', kind === 'image' ? 'image/png' : 'application/octet-stream'),
    fileName: String(row.file_name || ''),
    sizeBytes: Number(row.size_bytes || 0) || 0,
    previewUrl: (kind === 'image' && absolutePath) ? toAttachmentPreviewUrl(row.id || '') : '',
    lastAccessedAt: Number(row.last_accessed_at || 0) || 0,
    createdAt: Number(row.created_at || 0) || 0,
  }
}

function attachmentMatchesScope(row = {}, scope = null) {
  const normalizedScope = normalizeScope(scope)
  if (!normalizedScope.projectId && !normalizedScope.threadId) return true
  if (normalizedScope.projectId && normalizeId(row.project_id || '') !== normalizedScope.projectId) return false
  if (normalizedScope.threadId && normalizeId(row.thread_id || '') !== normalizedScope.threadId) return false
  return true
}

function getAttachmentRowById(attachmentId = '') {
  const db = getDb()
  const id = normalizeId(attachmentId)
  if (!id) return null
  return db.prepare(`
    SELECT id, project_id, thread_id, turn_id, kind, media_type, file_name, size_bytes, sha256, relative_path, created_at, last_accessed_at
    FROM chat_attachments
    WHERE id = ?
  `).get(id) || null
}

function touchAttachment(attachmentId = '') {
  const db = getDb()
  const id = normalizeId(attachmentId)
  if (!id) return
  db.prepare('UPDATE chat_attachments SET last_accessed_at = ? WHERE id = ?').run(now(), id)
}

function buildRelativeAttachmentPath({ projectId = '', threadId = '', attachmentId = '', fileName = '', mediaType = '', kind = 'file' } = {}) {
  const ext = resolveAttachmentExtension(mediaType, fileName, kind)
  const base = sanitizeAttachmentBaseName(fileName || 'attachment')
  const finalName = base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`
  return path.join(
    'projects',
    safePathSegment(projectId, 'project'),
    'threads',
    safePathSegment(threadId, 'thread'),
    `${safePathSegment(attachmentId, 'attachment')}_${finalName}`,
  )
}

function splitBase64ForExport(raw = '') {
  const source = String(raw || '')
  if (!source) return []
  if (source.length <= EXPORT_BASE64_CHUNK_CHARS) return [source]
  if (source.length > EXPORT_BASE64_CHUNK_CHARS * EXPORT_MAX_BASE64_CHUNKS) return []
  const out = []
  for (let i = 0; i < source.length && out.length < EXPORT_MAX_BASE64_CHUNKS; i += EXPORT_BASE64_CHUNK_CHARS) {
    out.push(source.slice(i, i + EXPORT_BASE64_CHUNK_CHARS))
  }
  return out
}

export async function stageAttachmentFromBytes({
  projectId = '',
  threadId = '',
  turnId = '',
  mediaType = '',
  kind = '',
  fileName = '',
  bytes = null,
} = {}) {
  const pid = normalizeId(projectId)
  const tid = normalizeId(threadId)
  if (!pid || !tid) return { ok: false, error: 'project_or_thread_missing' }
  if (!bytes || !Buffer.isBuffer(bytes) || bytes.length <= 0) return { ok: false, error: 'invalid_attachment_data' }
  if (bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'attachment_too_large' }

  const resolvedKind = resolveAttachmentKind(kind, mediaType)
  const resolvedMediaType = normalizeMediaType(
    mediaType,
    resolvedKind === 'image' ? 'image/png' : 'application/octet-stream',
  )
  const attachmentId = `att_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const relativePath = normalizeRelativePath(buildRelativeAttachmentPath({
    projectId: pid,
    threadId: tid,
    attachmentId,
    fileName,
    mediaType: resolvedMediaType,
    kind: resolvedKind,
  }))
  const absolutePath = resolveAbsolutePathFromRelative(relativePath)
  if (!absolutePath) return { ok: false, error: 'invalid_attachment_path' }

  try {
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.promises.writeFile(absolutePath, bytes)
  } catch {
    return { ok: false, error: 'attachment_write_failed' }
  }

  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  const ts = now()
  const db = getDb()
  try {
    db.prepare(`
      INSERT INTO chat_attachments (
        id, project_id, thread_id, turn_id, kind, media_type, file_name, size_bytes, sha256, relative_path, created_at, last_accessed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attachmentId,
      pid,
      tid,
      normalizeId(turnId),
      resolvedKind,
      resolvedMediaType,
      String(fileName || ''),
      Number(bytes.length || 0),
      sha256,
      relativePath,
      ts,
      ts,
    )
  } catch {
    try {
      await fs.promises.rm(absolutePath, { force: true })
    } catch {
      /* best-effort cleanup after attachment database insert failure */
    }
    return { ok: false, error: 'attachment_db_insert_failed' }
  }

  return {
    ok: true,
    descriptor: attachmentRowToDescriptor({
      id: attachmentId,
      kind: resolvedKind,
      media_type: resolvedMediaType,
      file_name: String(fileName || ''),
      size_bytes: Number(bytes.length || 0),
      relative_path: relativePath,
      created_at: ts,
      last_accessed_at: ts,
    }),
  }
}

async function listFilesRecursively(dirPath = '') {
  const out = []
  const root = String(dirPath || '').trim()
  if (!root || !(await isExistingDirectory(root))) return out
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries = []
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile()) {
        out.push(fullPath)
      }
    }
  }
  return out
}

async function pruneEmptyDirectories(startDir = '', stopAt = '') {
  let current = String(startDir || '').trim()
  const stopPath = path.resolve(String(stopAt || '').trim() || toCacheRootAbsolutePath())
  while (current) {
    const resolved = path.resolve(current)
    if (!isPathInsideRoot(stopPath, resolved)) break
    if (resolved === stopPath) break
    let entries = []
    try {
      entries = await fs.promises.readdir(resolved)
    } catch {
      break
    }
    if (entries.length > 0) break
    try {
      await fs.promises.rmdir(resolved)
    } catch {
      break
    }
    current = path.dirname(resolved)
  }
}

export function getAttachmentCacheRoot() {
  return toCacheRootAbsolutePath()
}

export async function stageAttachmentBatch({ projectId = '', threadId = '', turnId = '', attachments = [] } = {}) {
  const pid = normalizeId(projectId)
  const tid = normalizeId(threadId)
  if (!pid || !tid) {
    return { ok: false, attachments: [], errors: [{ index: -1, error: 'project_or_thread_missing' }] }
  }

  const source = Array.isArray(attachments) ? attachments.slice(0, MAX_STAGE_ATTACHMENTS) : []
  const staged = []
  const errors = []

  for (let idx = 0; idx < source.length; idx += 1) {
    const item = source[idx] && typeof source[idx] === 'object' ? source[idx] : {}
    const parsed = parseAttachmentPayload(item.dataUrl || item.data || item.base64 || '')
    const mediaType = normalizeMediaType(item.mediaType || item.mimeType || parsed.mediaType || '', '')
    const bytes = decodeBase64Attachment(parsed.base64)
    const stagedResult = await stageAttachmentFromBytes({
      projectId: pid,
      threadId: tid,
      turnId,
      mediaType,
      kind: String(item.kind || item.type || '').trim().toLowerCase(),
      fileName: String(item.fileName || item.filename || '').trim(),
      bytes,
    })
    if (!stagedResult.ok) {
      errors.push({ index: idx, error: stagedResult.error || 'stage_failed' })
      continue
    }
    staged.push(stagedResult.descriptor)
  }

  return {
    ok: staged.length > 0 && errors.length === 0,
    attachments: staged,
    errors,
  }
}

export async function statCachedAttachment(attachmentId = '', scope = null) {
  const row = getAttachmentRowById(attachmentId)
  if (!row) return { ok: false, error: 'attachment_not_found' }
  if (!attachmentMatchesScope(row, scope)) {
    return { ok: false, error: 'attachment_scope_violation' }
  }
  const absolutePath = resolveAbsolutePathFromRelative(row.relative_path || '')
  if (!(await isExistingFile(absolutePath))) {
    return { ok: false, error: 'attachment_missing' }
  }
  touchAttachment(attachmentId)
  return { ok: true, attachment: attachmentRowToDescriptor(row) }
}

export async function readCachedAttachmentBase64(attachmentId = '', scope = null) {
  const row = getAttachmentRowById(attachmentId)
  if (!row) return { ok: false, error: 'attachment_not_found' }
  if (!attachmentMatchesScope(row, scope)) {
    return { ok: false, error: 'attachment_scope_violation' }
  }
  const absolutePath = resolveAbsolutePathFromRelative(row.relative_path || '')
  if (!(await isExistingFile(absolutePath))) {
    return { ok: false, error: 'attachment_missing' }
  }
  let bytes = null
  try {
    bytes = await fs.promises.readFile(absolutePath)
  } catch {
    return { ok: false, error: 'attachment_unreadable' }
  }
  touchAttachment(attachmentId)
  return {
    ok: true,
    attachment: attachmentRowToDescriptor(row),
    absolutePath,
    base64: bytes.toString('base64'),
    sizeBytes: Number(bytes.length || 0),
    kind: resolveAttachmentKind(row.kind || '', row.media_type || ''),
    mediaType: normalizeMediaType(row.media_type || '', ''),
    fileName: String(row.file_name || ''),
  }
}

export async function resolveCachedAttachmentFilePath(attachmentId = '', scope = null) {
  const row = getAttachmentRowById(attachmentId)
  if (!row) return { ok: false, error: 'attachment_not_found' }
  if (!attachmentMatchesScope(row, scope)) {
    return { ok: false, error: 'attachment_scope_violation' }
  }
  const absolutePath = resolveAbsolutePathFromRelative(row.relative_path || '')
  if (!(await isExistingFile(absolutePath))) {
    return { ok: false, error: 'attachment_missing' }
  }
  touchAttachment(attachmentId)
  return {
    ok: true,
    absolutePath,
    kind: resolveAttachmentKind(row.kind || '', row.media_type || ''),
    mediaType: normalizeMediaType(row.media_type || '', 'application/octet-stream'),
    fileName: String(row.file_name || ''),
    attachment: attachmentRowToDescriptor(row),
  }
}

export async function openCachedAttachment(attachmentId = '', openPath = async () => '', scope = null) {
  const resolved = await readCachedAttachmentBase64(attachmentId, scope)
  if (!resolved.ok) return resolved
  const openError = await openPath(resolved.absolutePath)
  if (openError) return { ok: false, error: String(openError) }
  return {
    ok: true,
    path: resolved.absolutePath,
    attachment: resolved.attachment,
  }
}

export async function exportCachedAttachmentsByIds(threadId = '', attachmentIds = []) {
  const tid = normalizeId(threadId)
  const ids = Array.isArray(attachmentIds)
    ? [...new Set(attachmentIds.map((value) => normalizeId(value)).filter(Boolean))]
    : []
  if (!tid || ids.length === 0) return []
  const db = getDb()
  const placeholders = ids.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT id, project_id, thread_id, turn_id, kind, media_type, file_name, size_bytes, sha256, relative_path, created_at, last_accessed_at
    FROM chat_attachments
    WHERE thread_id = ? AND id IN (${placeholders})
  `).all(tid, ...ids)
  const out = []
  for (const row of rows) {
    const absolutePath = resolveAbsolutePathFromRelative(row.relative_path || '')
    if (!absolutePath || !(await isExistingFile(absolutePath))) continue
    let bytes = null
    try {
      bytes = await fs.promises.readFile(absolutePath)
    } catch {
      continue
    }
    const base64 = bytes.toString('base64')
    const chunks = splitBase64ForExport(base64)
    if (chunks.length === 0) continue
    out.push({
      id: String(row.id || ''),
      kind: resolveAttachmentKind(row.kind || '', row.media_type || ''),
      mediaType: normalizeMediaType(row.media_type || '', 'application/octet-stream'),
      fileName: String(row.file_name || ''),
      sizeBytes: Number(row.size_bytes || bytes.length || 0) || 0,
      sha256: String(row.sha256 || ''),
      ...(chunks.length === 1
        ? { data: chunks[0] }
        : { dataChunks: chunks }),
    })
  }
  return out
}

export async function importThreadAttachmentPayloads({ projectId = '', threadId = '', turnId = '', attachments = [] } = {}) {
  const pid = normalizeId(projectId)
  const tid = normalizeId(threadId)
  if (!pid || !tid) {
    return { ok: false, mapping: {}, attachments: [], errors: [{ index: -1, error: 'project_or_thread_missing' }] }
  }
  const source = Array.isArray(attachments) ? attachments.slice(0, MAX_STAGE_ATTACHMENTS * 20) : []
  const mapping = {}
  const imported = []
  const errors = []

  for (let idx = 0; idx < source.length; idx += 1) {
    const item = source[idx] && typeof source[idx] === 'object' ? source[idx] : {}
    const sourceId = normalizeId(item.id)
    let base64 = String(item.data || '').trim()
    if (!base64 && Array.isArray(item.dataChunks)) {
      base64 = item.dataChunks
        .slice(0, EXPORT_MAX_BASE64_CHUNKS)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .join('')
    }
    const bytes = decodeBase64Attachment(base64)
    const staged = await stageAttachmentFromBytes({
      projectId: pid,
      threadId: tid,
      turnId,
      mediaType: normalizeMediaType(item.mediaType || item.mimeType || '', ''),
      kind: String(item.kind || '').trim().toLowerCase(),
      fileName: String(item.fileName || item.filename || '').trim(),
      bytes,
    })
    if (!staged.ok) {
      errors.push({ index: idx, id: sourceId, error: staged.error || 'import_stage_failed' })
      continue
    }
    imported.push(staged.descriptor)
    if (sourceId) mapping[sourceId] = staged.descriptor
  }

  return {
    ok: imported.length > 0 && errors.length === 0,
    mapping,
    attachments: imported,
    errors,
  }
}

export async function clearCachedAttachmentsForThread(threadId = '') {
  const tid = normalizeId(threadId)
  if (!tid) return { ok: false, deletedRows: 0, deletedDirs: 0 }
  const db = getDb()
  const projectRows = db.prepare(`
    SELECT DISTINCT project_id
    FROM chat_attachments
    WHERE thread_id = ?
  `).all(tid)
  const deletedRows = Number(db.prepare('DELETE FROM chat_attachments WHERE thread_id = ?').run(tid).changes || 0)
  let deletedDirs = 0
  for (const row of projectRows) {
    const projectId = normalizeId(row?.project_id || '')
    if (!projectId) continue
    const threadDir = path.join(
      toCacheRootAbsolutePath(),
      'projects',
      safePathSegment(projectId, 'project'),
      'threads',
      safePathSegment(tid, 'thread'),
    )
    if (await isExistingDirectory(threadDir)) {
      try {
        await fs.promises.rm(threadDir, { recursive: true, force: true })
        deletedDirs += 1
      } catch (error) {
        console.warn('[attachment-cache] failed to remove thread cache directory:', error?.message || error)
      }
    }
    await pruneEmptyDirectories(
      path.dirname(threadDir),
      path.join(toCacheRootAbsolutePath(), 'projects', safePathSegment(projectId, 'project')),
    )
  }
  return { ok: true, deletedRows, deletedDirs }
}

export async function clearCachedAttachmentsForProject(projectId = '') {
  const pid = normalizeId(projectId)
  if (!pid) return { ok: false, deletedRows: 0, deletedDirs: 0 }
  const db = getDb()
  const deletedRows = Number(db.prepare('DELETE FROM chat_attachments WHERE project_id = ?').run(pid).changes || 0)
  const projectDir = path.join(toCacheRootAbsolutePath(), 'projects', safePathSegment(pid, 'project'))
  let deletedDirs = 0
  if (await isExistingDirectory(projectDir)) {
    try {
      await fs.promises.rm(projectDir, { recursive: true, force: true })
      deletedDirs = 1
    } catch (error) {
      console.warn('[attachment-cache] failed to remove project cache directory:', error?.message || error)
    }
  }
  return { ok: true, deletedRows, deletedDirs }
}

export function getMostRecentWorkspaceScope() {
  const db = getDb()
  try {
    const row = db.prepare(`
      SELECT id AS project_id, active_thread_id
      FROM workspace_projects
      ORDER BY last_opened_at DESC, last_worked_at DESC
      LIMIT 1
    `).get()
    return normalizeScope({
      projectId: row?.project_id || '',
      threadId: row?.active_thread_id || '',
    })
  } catch {
    return { projectId: '', threadId: '' }
  }
}

export async function clearAllCachedAttachments() {
  const db = getDb()
  const deletedRows = Number(db.prepare('DELETE FROM chat_attachments').run().changes || 0)
  const root = toCacheRootAbsolutePath()
  let deletedDirs = 0
  if (await isExistingDirectory(root)) {
    try {
      await fs.promises.rm(root, { recursive: true, force: true })
      deletedDirs = 1
    } catch (error) {
      console.warn('[attachment-cache] failed to remove cache root:', error?.message || error)
    }
  }
  return { ok: true, deletedRows, deletedDirs }
}

export async function cleanupAttachmentCacheOrphans() {
  const db = getDb()
  const root = toCacheRootAbsolutePath()
  const deletedRowIds = []
  const deletedFilePaths = []
  const errors = []
  const pushDetail = (collection = [], value = null) => {
    if (collection.length >= ORPHAN_CLEANUP_DETAIL_LIMIT) return
    collection.push(value)
  }
  let scannedRows = 0
  let scannedFiles = 0
  let deletedRows = 0
  let deletedFiles = 0
  let errorCount = 0

  if (!(await isExistingDirectory(root))) {
    return {
      ok: true,
      scannedRows,
      scannedFiles,
      deletedRows,
      deletedFiles,
      deletedRowIds,
      deletedFilePaths,
      errors,
      errorCount,
    }
  }

  const rows = db.prepare('SELECT id, relative_path FROM chat_attachments').all()
  scannedRows = rows.length
  const validFiles = new Set()
  for (const row of rows) {
    const attachmentId = normalizeId(row?.id || '')
    const absolutePath = resolveAbsolutePathFromRelative(row?.relative_path || '')
    if (!attachmentId || !absolutePath || !(await isExistingFile(absolutePath))) {
      if (attachmentId) {
        try {
          const removed = Number(db.prepare('DELETE FROM chat_attachments WHERE id = ?').run(attachmentId).changes || 0)
          deletedRows += removed
          if (removed > 0) pushDetail(deletedRowIds, attachmentId)
        } catch (error) {
          errorCount += 1
          pushDetail(errors, {
            type: 'db_delete_failed',
            attachmentId,
            message: String(error?.message || error || 'db_delete_failed'),
          })
        }
      }
      continue
    }
    validFiles.add(path.resolve(absolutePath))
  }

  const allFiles = await listFilesRecursively(root)
  scannedFiles = allFiles.length
  for (const filePath of allFiles) {
    const resolved = path.resolve(filePath)
    if (validFiles.has(resolved)) continue
    try {
      await fs.promises.rm(resolved, { force: true })
      deletedFiles += 1
      pushDetail(deletedFilePaths, resolved)
    } catch (error) {
      errorCount += 1
      pushDetail(errors, {
        type: 'file_delete_failed',
        path: resolved,
        message: String(error?.message || error || 'file_delete_failed'),
      })
    }
  }
  try {
    await pruneEmptyDirectories(root, root)
  } catch (error) {
    errorCount += 1
    pushDetail(errors, {
      type: 'prune_failed',
      path: root,
      message: String(error?.message || error || 'prune_failed'),
    })
  }

  return {
    ok: errorCount === 0,
    scannedRows,
    scannedFiles,
    deletedRows,
    deletedFiles,
    deletedRowIds,
    deletedFilePaths,
    errors,
    errorCount,
  }
}
