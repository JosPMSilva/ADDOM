import { trimText } from './tool-event-mapper.mjs'
import { readCachedAttachmentBase64 } from '../attachments/attachment-cache.mjs'

const MAX_TIMELINE_USER_PARTS = 16
const MAX_TIMELINE_TEXT_PART_CHARS = 6_000
const MAX_TIMELINE_IMAGE_INLINE_BASE64_CHARS = 7_000
const TIMELINE_IMAGE_CHUNK_BASE64_CHARS = 6_000
const MAX_TIMELINE_IMAGE_CHUNKS = 120
const MAX_TIMELINE_FILE_DATA_INLINE_BASE64_CHARS = 7_000
const TIMELINE_FILE_DATA_CHUNK_BASE64_CHARS = 6_000
const MAX_TIMELINE_FILE_DATA_CHUNKS = 120

function normalizeAttachmentMediaType(value = '', fallback = 'application/octet-stream') {
  const raw = String(value || '').trim().toLowerCase()
  return raw || String(fallback || '').trim().toLowerCase()
}

function splitIntoChunks(text = '', chunkSize = 6_000, maxChunks = 120) {
  const source = String(text || '')
  if (!source) return []
  if (source.length > chunkSize * maxChunks) return []
  const out = []
  for (let i = 0; i < source.length && out.length < maxChunks; i += chunkSize) {
    out.push(source.slice(i, i + chunkSize))
  }
  return out
}

function parseAttachmentDataPayload(rawValue = '') {
  const raw = String(rawValue || '').trim()
  if (!raw) return { mediaType: '', base64Data: '' }
  if (!raw.startsWith('data:')) return { mediaType: '', base64Data: raw }
  const match = raw.match(/^data:([^;,]+)?;base64,([\s\S]+)$/i)
  if (!match) return { mediaType: '', base64Data: '' }
  return {
    mediaType: normalizeAttachmentMediaType(match[1] || '', ''),
    base64Data: String(match[2] || '').trim(),
  }
}

function normalizeAttachmentId(value = '') {
  return String(value || '').trim()
}

function createTimelineImagePart(part = {}) {
  const attachmentId = normalizeAttachmentId(part?.attachmentId || '')
  if (attachmentId) {
    const mediaType = normalizeAttachmentMediaType(
      part?.mediaType || part?.mimeType || '',
      'image/png',
    )
    const fileName = String(part?.filename || part?.fileName || '').trim()
    const previewUrl = String(part?.previewUrl || '').trim()
    return {
      type: 'image',
      attachmentId,
      kind: 'image',
      mediaType,
      ...(fileName ? { filename: fileName } : {}),
      ...(previewUrl ? { previewUrl } : {}),
    }
  }

  const parsedImage = parseAttachmentDataPayload(part?.image || '')
  const mediaType = normalizeAttachmentMediaType(
    part?.mediaType || part?.mimeType || parsedImage.mediaType || '',
    'image/png',
  )
  const base64Image = String(parsedImage.base64Data || '').trim()
  if (!base64Image) return null

  const chunkedImage = base64Image.length > MAX_TIMELINE_IMAGE_INLINE_BASE64_CHARS
    ? splitIntoChunks(
      base64Image,
      TIMELINE_IMAGE_CHUNK_BASE64_CHARS,
      MAX_TIMELINE_IMAGE_CHUNKS,
    )
    : []
  const imagePayload = base64Image.length <= MAX_TIMELINE_IMAGE_INLINE_BASE64_CHARS
    ? { image: base64Image }
    : (chunkedImage.length > 0 ? { imageChunks: chunkedImage } : {})
  if (!imagePayload.image && !imagePayload.imageChunks) return null

  return {
    type: 'image',
    mediaType,
    ...imagePayload,
  }
}

function createTimelineFilePart(part = {}) {
  const attachmentId = normalizeAttachmentId(part?.attachmentId || '')
  if (attachmentId) {
    const mediaType = normalizeAttachmentMediaType(part?.mediaType || part?.mimeType || '', '')
    const filename = String(part?.filename || part?.fileName || '').trim()
    const previewUrl = String(part?.previewUrl || '').trim()
    return {
      type: 'file',
      attachmentId,
      kind: 'file',
      ...(mediaType ? { mediaType } : {}),
      ...(filename ? { filename } : {}),
      ...(previewUrl ? { previewUrl } : {}),
    }
  }

  const parsedData = parseAttachmentDataPayload(part?.data || '')
  const mediaType = normalizeAttachmentMediaType(part?.mediaType || part?.mimeType || parsedData.mediaType || '', '')
  const filename = String(part?.filename || part?.fileName || '').trim()
  const base64Data = String(parsedData.base64Data || '').trim()
  if (!mediaType && !filename && !base64Data) return null
  const chunkedData = base64Data.length > MAX_TIMELINE_FILE_DATA_INLINE_BASE64_CHARS
    ? splitIntoChunks(
      base64Data,
      TIMELINE_FILE_DATA_CHUNK_BASE64_CHARS,
      MAX_TIMELINE_FILE_DATA_CHUNKS,
    )
    : []
  const dataPayload = base64Data
    ? (
        base64Data.length <= MAX_TIMELINE_FILE_DATA_INLINE_BASE64_CHARS
          ? { data: base64Data }
          : (chunkedData.length > 0 ? { dataChunks: chunkedData } : {})
      )
    : {}
  return {
    type: 'file',
    ...(mediaType ? { mediaType } : {}),
    ...(filename ? { filename } : {}),
    ...dataPayload,
  }
}

function createTimelineTextPart(part = {}) {
  const text = trimText(String(part?.text || '').trim(), MAX_TIMELINE_TEXT_PART_CHARS)
  if (!text) return null
  return { type: 'text', text }
}

export function buildPersistedUserContentParts(rawContent) {
  if (!Array.isArray(rawContent)) return []
  const parts = []
  for (const part of rawContent) {
    if (parts.length >= MAX_TIMELINE_USER_PARTS) break
    const type = String(part?.type || '').trim().toLowerCase()
    if (type === 'text') {
      const textPart = createTimelineTextPart(part)
      if (textPart) parts.push(textPart)
      continue
    }
    if (type === 'image') {
      const imagePart = createTimelineImagePart(part)
      if (imagePart) parts.push(imagePart)
      continue
    }
    if (type === 'file') {
      const filePart = createTimelineFilePart(part)
      if (filePart) parts.push(filePart)
    }
  }
  return parts
}

function toHydratedAttachmentFallbackText(part = {}) {
  const fileName = String(part?.filename || part?.fileName || '').trim()
  const mediaType = String(part?.mediaType || part?.mimeType || '').trim().toLowerCase()
  const label = fileName || mediaType || 'attachment'
  return `[Attachment unavailable: ${label}]`
}

function resolveAttachmentPartKind(part = {}) {
  const type = String(part?.type || '').trim().toLowerCase()
  if (type === 'image' || type === 'file') return type
  const mediaType = String(part?.mediaType || part?.mimeType || '').trim().toLowerCase()
  return mediaType.startsWith('image/') ? 'image' : 'file'
}

async function hydrateUserContentPartForModel(part = {}, attachmentReadCache = new Map(), {
  preferLocalImagePaths = false,
} = {}) {
  const source = part && typeof part === 'object' ? part : {}
  const type = String(source.type || '').trim().toLowerCase()
  if (type === 'text') {
    const text = trimText(String(source.text || '').trim(), MAX_TIMELINE_TEXT_PART_CHARS)
    return text ? { type: 'text', text } : null
  }
  if (type !== 'image' && type !== 'file') return null

  const attachmentId = normalizeAttachmentId(source.attachmentId || '')
  if (attachmentId) {
    let readResult = attachmentReadCache.get(attachmentId)
    if (!readResult) {
      readResult = await readCachedAttachmentBase64(attachmentId)
      attachmentReadCache.set(attachmentId, readResult)
    }
    if (!readResult?.ok || !String(readResult.base64 || '').trim()) {
      return { type: 'text', text: toHydratedAttachmentFallbackText(source) }
    }
    const resolvedKind = resolveAttachmentPartKind({
      type: readResult.kind || type,
      mediaType: readResult.mediaType || source.mediaType || source.mimeType || '',
    })
    const resolvedMediaType = normalizeAttachmentMediaType(
      readResult.mediaType || source.mediaType || source.mimeType || '',
      resolvedKind === 'image' ? 'image/png' : 'application/octet-stream',
    )
    if (resolvedKind === 'image') {
      const localPath = String(readResult.absolutePath || '').trim()
      if (preferLocalImagePaths && localPath) {
        return {
          type: 'image',
          mediaType: resolvedMediaType,
          localPath,
        }
      }
      return {
        type: 'image',
        mediaType: resolvedMediaType,
        image: String(readResult.base64 || ''),
      }
    }
    const fileName = String(readResult.fileName || source.filename || source.fileName || '').trim()
    return {
      type: 'file',
      mediaType: resolvedMediaType,
      ...(fileName ? { filename: fileName } : {}),
      data: String(readResult.base64 || ''),
    }
  }

  if (type === 'image') {
    const parsedImage = parseAttachmentDataPayload(source.image || '')
    const mediaType = normalizeAttachmentMediaType(
      source.mediaType || source.mimeType || parsedImage.mediaType || '',
      'image/png',
    )
    const base64 = String(parsedImage.base64Data || '').trim()
    if (!base64) return null
    return {
      type: 'image',
      mediaType,
      image: base64,
    }
  }

  const parsedData = parseAttachmentDataPayload(source.data || '')
  const mediaType = normalizeAttachmentMediaType(
    source.mediaType || source.mimeType || parsedData.mediaType || '',
    'application/octet-stream',
  )
  const filename = String(source.filename || source.fileName || '').trim()
  const base64 = String(parsedData.base64Data || '').trim()
  if (!base64) {
    return { type: 'text', text: toHydratedAttachmentFallbackText({ filename, mediaType }) }
  }
  return {
    type: 'file',
    mediaType,
    ...(filename ? { filename } : {}),
    data: base64,
  }
}

export async function hydrateHistoryAttachmentsForModel(messages = [], {
  preferLocalImagePaths = false,
} = {}) {
  const rows = Array.isArray(messages) ? messages : []
  const attachmentReadCache = new Map()
  const hydratedRows = []
  for (const message of rows) {
    const role = String(message?.role || '').trim()
    if (role !== 'user' || !Array.isArray(message?.content)) {
      hydratedRows.push(message)
      continue
    }
    const nextParts = []
    for (const part of message.content) {
      const hydrated = await hydrateUserContentPartForModel(part, attachmentReadCache, {
        preferLocalImagePaths,
      })
      if (hydrated) nextParts.push(hydrated)
    }
    if (nextParts.length === 0) {
      hydratedRows.push({ ...message, content: '' })
      continue
    }
    if (nextParts.length === 1 && nextParts[0].type === 'text') {
      hydratedRows.push({ ...message, content: String(nextParts[0].text || '') })
      continue
    }
    hydratedRows.push({ ...message, content: nextParts })
  }
  return hydratedRows
}
