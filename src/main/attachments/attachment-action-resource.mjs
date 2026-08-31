import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveCachedAttachmentFilePath } from './attachment-cache.mjs'

export const MAX_ATTACHMENT_ACTION_BYTES = 20 * 1024 * 1024
export const ATTACHMENT_ACTION_TEMP_DIR = path.join(os.tmpdir(), 'addom-attachments')

const ATTACHMENT_EXTENSION_BY_MIME = new Map([
  ['application/pdf', '.pdf'],
  ['application/x-pdf', '.pdf'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeMediaType(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeAttachmentKind(value = '', mediaType = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'image' || normalized === 'file') return normalized
  return normalizeMediaType(mediaType).startsWith('image/') ? 'image' : 'file'
}

function sanitizeAttachmentBaseName(rawName = '') {
  const text = normalizeText(rawName) || 'attachment'
  const withoutReservedChars = text
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
  const withoutControlChars = Array.from(withoutReservedChars, (char) => (
    char.charCodeAt(0) < 32 ? '_' : char
  )).join('')
  const normalized = withoutControlChars.replace(/^\.+/, '').trim()
  return (normalized || 'attachment').slice(0, 80)
}

function resolveAttachmentExtension(mediaType = '', fileName = '') {
  const mapped = ATTACHMENT_EXTENSION_BY_MIME.get(normalizeMediaType(mediaType))
  if (mapped) return mapped
  const extension = String(path.extname(normalizeText(fileName)) || '').toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '.bin'
}

function extractBase64Payload(raw = '') {
  const text = normalizeText(raw)
  if (!text) return ''
  if (!text.startsWith('data:')) return text
  const match = text.match(/^data:([^;,]+)?;base64,([\s\S]+)$/i)
  return match ? normalizeText(match[2]) : ''
}

function decodeBase64Payload(raw = '') {
  const compact = normalizeText(raw)
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  if (!compact || compact.length % 4 === 1 || !/^[a-z0-9+/=]+$/i.test(compact)) return null
  try {
    const bytes = Buffer.from(compact, 'base64')
    return bytes.length > 0 ? bytes : null
  } catch {
    return null
  }
}

export function normalizeAttachmentActionDescriptor(descriptor = {}) {
  const source = descriptor && typeof descriptor === 'object' ? descriptor : {}
  const mediaType = normalizeMediaType(source.mediaType || source.mimeType)
  return {
    attachmentId: normalizeText(source.attachmentId),
    data: normalizeText(source.data || source.dataUrl || source.image),
    fileName: normalizeText(source.fileName || source.filename),
    mediaType,
    kind: normalizeAttachmentKind(source.kind || source.type, mediaType),
  }
}

export async function materializeLegacyAttachment(descriptor = {}, deps = {}) {
  const input = normalizeAttachmentActionDescriptor(descriptor)
  const bytes = decodeBase64Payload(extractBase64Payload(input.data))
  if (!bytes) return { ok: false, error: 'invalid_attachment_data' }
  const maxBytes = Number(deps.maxBytes || MAX_ATTACHMENT_ACTION_BYTES)
  if (bytes.length > maxBytes) return { ok: false, error: 'attachment_too_large' }

  const attachmentTempDir = normalizeText(deps.attachmentTempDir) || ATTACHMENT_ACTION_TEMP_DIR
  const mkdir = typeof deps.mkdir === 'function' ? deps.mkdir : fs.mkdir
  const writeFile = typeof deps.writeFile === 'function' ? deps.writeFile : fs.writeFile
  const safeName = sanitizeAttachmentBaseName(input.fileName)
  const extension = resolveAttachmentExtension(input.mediaType, input.fileName)
  const finalName = safeName.toLowerCase().endsWith(extension) ? safeName : `${safeName}${extension}`
  const tempPath = path.join(
    attachmentTempDir,
    `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${finalName}`,
  )

  try {
    await mkdir(attachmentTempDir, { recursive: true })
    await writeFile(tempPath, bytes, { mode: 0o600 })
    return {
      ok: true,
      path: tempPath,
      bytes,
      fileName: finalName,
      mediaType: input.mediaType,
      kind: input.kind,
      temporary: true,
    }
  } catch {
    return { ok: false, error: 'attachment_materialization_failed' }
  }
}

export async function resolveAttachmentActionResource(descriptor = {}, scope = {}, deps = {}) {
  const input = normalizeAttachmentActionDescriptor(descriptor)
  const resolveCachedPath = typeof deps.resolveCachedPath === 'function'
    ? deps.resolveCachedPath
    : resolveCachedAttachmentFilePath
  const readFile = typeof deps.readFile === 'function' ? deps.readFile : fs.readFile

  if (input.attachmentId) {
    const cached = await resolveCachedPath(input.attachmentId, scope)
    if (cached?.ok && cached.absolutePath) {
      try {
        const bytes = await readFile(cached.absolutePath)
        if (bytes.length > Number(deps.maxBytes || MAX_ATTACHMENT_ACTION_BYTES)) {
          return { ok: false, error: 'attachment_too_large' }
        }
        return {
          ok: true,
          path: cached.absolutePath,
          bytes,
          fileName: normalizeText(cached.fileName) || input.fileName,
          mediaType: normalizeMediaType(cached.mediaType) || input.mediaType,
          kind: normalizeAttachmentKind(cached.kind, cached.mediaType || input.mediaType),
          temporary: false,
        }
      } catch {
        if (!input.data) return { ok: false, error: 'attachment_unreadable' }
      }
    } else if (cached?.error === 'attachment_scope_violation' || !input.data) {
      return { ok: false, error: normalizeText(cached?.error) || 'attachment_not_found' }
    }
  }

  return materializeLegacyAttachment(input, deps)
}
