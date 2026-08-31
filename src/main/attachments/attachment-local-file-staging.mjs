import fs from 'node:fs'
import path from 'node:path'
import { stageAttachmentFromBytes } from './attachment-cache.mjs'

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MIME_BY_EXTENSION = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
])

export async function stageAttachmentFromLocalFile({
  projectId = '',
  threadId = '',
  turnId = '',
  sourcePath = '',
  kind = '',
  mediaType = '',
  fileName = '',
} = {}) {
  const rawSourcePath = String(sourcePath || '').trim()
  if (!rawSourcePath) return { ok: false, error: 'attachment_source_missing' }
  const absoluteSourcePath = path.resolve(rawSourcePath)
  let sourceStat = null
  try {
    sourceStat = await fs.promises.stat(absoluteSourcePath)
  } catch {
    return { ok: false, error: 'attachment_source_missing' }
  }
  if (!sourceStat.isFile()) return { ok: false, error: 'attachment_source_missing' }
  if (Number(sourceStat.size || 0) > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: 'attachment_too_large' }
  }

  const resolvedFileName = String(fileName || path.basename(absoluteSourcePath) || 'attachment').trim()
  const resolvedMediaType = String(
    mediaType
    || MIME_BY_EXTENSION.get(path.extname(resolvedFileName).toLowerCase())
    || '',
  ).trim().toLowerCase()
  let bytes = null
  try {
    bytes = await fs.promises.readFile(absoluteSourcePath)
  } catch {
    return { ok: false, error: 'attachment_source_read_failed' }
  }
  return stageAttachmentFromBytes({
    projectId,
    threadId,
    turnId,
    kind,
    mediaType: resolvedMediaType,
    fileName: resolvedFileName,
    bytes,
  })
}
