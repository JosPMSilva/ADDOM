import { getDb } from '../memory/db.mjs'
import { resolveCachedAttachmentFilePath } from './attachment-cache.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

export async function listCachedAttachmentsForThread({ projectId = '', threadId = '' } = {}) {
  const pid = normalizeId(projectId)
  const tid = normalizeId(threadId)
  if (!pid || !tid) {
    return { ok: false, attachments: [], errors: [{ error: 'project_or_thread_missing' }] }
  }
  const rows = getDb().prepare(`
    SELECT id, turn_id, kind, media_type, file_name, size_bytes, sha256, created_at
    FROM chat_attachments
    WHERE project_id = ? AND thread_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(pid, tid)
  const attachments = []
  const errors = []
  for (const row of rows) {
    const attachmentId = normalizeId(row.id || '')
    const resolved = await resolveCachedAttachmentFilePath(attachmentId, {
      projectId: pid,
      threadId: tid,
    })
    if (!resolved.ok) {
      errors.push({
        attachmentId,
        fileName: String(row.file_name || ''),
        error: String(resolved.error || 'attachment_missing'),
      })
      continue
    }
    attachments.push({
      attachmentId,
      kind: String(row.kind || resolved.kind || 'file'),
      mediaType: String(row.media_type || resolved.mediaType || 'application/octet-stream'),
      fileName: String(row.file_name || resolved.fileName || ''),
      sizeBytes: Number(row.size_bytes || 0) || 0,
      sha256: String(row.sha256 || ''),
      projectId: pid,
      threadId: tid,
      turnId: normalizeId(row.turn_id || ''),
      createdAt: Number(row.created_at || 0) || 0,
      absolutePath: resolved.absolutePath,
    })
  }
  return { ok: true, attachments, errors }
}
