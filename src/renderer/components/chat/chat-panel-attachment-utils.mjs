import {
  supportsNativeFileAttachmentForSelection,
  supportsNativeImageAttachmentForSelection,
} from '../../../common/attachments/attachment-support-policy.mjs'
import { normalizeAssistantPhase } from '../../../common/chat/assistant-phase.mjs'

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeMediaType(value = '', fallback = '') {
  const mediaType = String(value || '').trim().toLowerCase()
  return mediaType || String(fallback || '').trim().toLowerCase()
}

function normalizeAttachmentId(value = '') {
  return String(value || '').trim()
}

function resolveAttachmentKind(attachment = {}, mediaType = '') {
  const explicitKind = String(attachment?.kind || '').trim().toLowerCase()
  if (explicitKind === 'image' || explicitKind === 'file') return explicitKind
  const type = String(attachment?.type || '').trim().toLowerCase()
  if (type === 'image' || type === 'file') return type
  return String(mediaType || '').startsWith('image/') ? 'image' : 'file'
}

function parseDataUrlPayload(rawValue = '') {
  const raw = String(rawValue || '')
  const match = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/i.exec(raw)
  if (!match) return { mediaType: '', data: raw }
  return {
    mediaType: normalizeMediaType(match[1] || ''),
    data: String(match[2] || ''),
  }
}

export function isPdfAttachment(attachment = {}) {
  const mediaType = normalizeMediaType(attachment?.mediaType || attachment?.mimeType || '')
  if (mediaType === 'application/pdf' || mediaType === 'application/x-pdf') return true
  const fileName = String(attachment?.fileName || attachment?.filename || '').trim().toLowerCase()
  return fileName.endsWith('.pdf')
}

export function summarizePendingAttachments(attachments = []) {
  const rows = Array.isArray(attachments) ? attachments : []
  if (rows.length === 0) return ''
  const pdfCount = rows.filter((entry) => isPdfAttachment(entry)).length
  const imageCount = rows.filter((entry) => {
    const mediaType = normalizeMediaType(entry?.mediaType || entry?.mimeType || '')
    const kind = resolveAttachmentKind(entry, mediaType)
    return kind === 'image' && !isPdfAttachment(entry)
  }).length
  const fileCount = Math.max(0, rows.length - imageCount - pdfCount)
  if (pdfCount === 0 && fileCount === 0) return `[${imageCount} image${imageCount === 1 ? '' : 's'} attached]`
  if (imageCount === 0 && fileCount === 0) return `[${pdfCount} PDF${pdfCount === 1 ? '' : 's'} attached]`
  if (pdfCount === 0 && imageCount === 0) return `[${fileCount} file${fileCount === 1 ? '' : 's'} attached]`
  const labels = [
    imageCount > 0 ? `${imageCount} image${imageCount === 1 ? '' : 's'}` : '',
    pdfCount > 0 ? `${pdfCount} PDF${pdfCount === 1 ? '' : 's'}` : '',
    fileCount > 0 ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return `[${rows.length} attachments (${labels.join(', ')})]`
}

export function buildAttachmentPart(attachment = {}) {
  const attachmentId = normalizeAttachmentId(attachment?.attachmentId || '')
  const explicitMediaType = normalizeMediaType(attachment?.mediaType || attachment?.mimeType || '')
  const fileName = String(attachment?.fileName || attachment?.filename || '').trim()
  const previewUrl = String(attachment?.previewUrl || '').trim()
  const kind = resolveAttachmentKind(attachment, explicitMediaType)
  if (attachmentId) {
    if (kind === 'image') {
      return {
        type: 'image',
        attachmentId,
        kind: 'image',
        mediaType: normalizeMediaType(explicitMediaType, 'image/png'),
        ...(fileName ? { filename: fileName } : {}),
        ...(previewUrl ? { previewUrl } : {}),
      }
    }
    return {
      type: 'file',
      attachmentId,
      kind: 'file',
      mediaType: normalizeMediaType(explicitMediaType, 'application/octet-stream'),
      ...(fileName ? { filename: fileName } : {}),
      ...(previewUrl ? { previewUrl } : {}),
    }
  }

  const { mediaType: dataUrlMediaType, data } = parseDataUrlPayload(attachment?.dataUrl)
  const mediaType = normalizeMediaType(explicitMediaType || dataUrlMediaType || '', 'application/octet-stream')

  if (isPdfAttachment({ mediaType, fileName })) {
    return {
      type: 'file',
      data,
      mediaType: normalizeMediaType(mediaType, 'application/pdf'),
      ...(fileName ? { filename: fileName } : {}),
    }
  }
  if (resolveAttachmentKind(attachment, mediaType) === 'file') {
    return {
      type: 'file',
      data,
      mediaType: normalizeMediaType(mediaType, 'application/octet-stream'),
      ...(fileName ? { filename: fileName } : {}),
    }
  }
  return {
    type: 'image',
    image: data,
    mediaType: normalizeMediaType(mediaType, 'image/png'),
  }
}

function compactUserParts(parts = []) {
  const normalized = Array.isArray(parts) ? parts.filter(Boolean) : []
  if (normalized.length === 0) return ''
  if (normalized.length === 1 && normalized[0]?.type === 'text') return String(normalized[0].text || '')
  return normalized
}

function sanitizeUserHistoryContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')
  const out = []
  for (const rawPart of content) {
    const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
    const type = String(part.type || '').trim().toLowerCase()
    if (type === 'text') {
      const text = String(part.text || '').trim()
      if (text) out.push({ type: 'text', text })
      continue
    }
    if (type === 'image') {
      const attachmentId = normalizeAttachmentId(part.attachmentId || '')
      const mediaType = normalizeMediaType(part.mediaType || part.mimeType || '', 'image/png')
      const filename = String(part.filename || part.fileName || '').trim()
      const previewUrl = String(part.previewUrl || '').trim()
      if (attachmentId) {
        out.push({ type: 'image', attachmentId, kind: 'image', mediaType, ...(filename ? { filename } : {}), ...(previewUrl ? { previewUrl } : {}) })
        continue
      }
      const image = String(part.image || '').trim()
      if (image) out.push({ type: 'image', image, mediaType })
      continue
    }
    if (type === 'file') {
      const attachmentId = normalizeAttachmentId(part.attachmentId || '')
      const data = String(part.data || '').trim()
      const mediaType = normalizeMediaType(part.mediaType || part.mimeType || '', 'application/octet-stream')
      const filename = String(part.filename || part.fileName || '').trim()
      const previewUrl = String(part.previewUrl || '').trim()
      if (attachmentId) {
        out.push({ type: 'file', attachmentId, kind: 'file', mediaType, ...(filename ? { filename } : {}), ...(previewUrl ? { previewUrl } : {}) })
      } else if (data) {
        out.push({ type: 'file', data, mediaType, ...(filename ? { filename } : {}) })
      } else if (filename || mediaType) {
        out.push({ type: 'text', text: `[Attachment omitted: ${filename || mediaType || 'file'}]` })
      }
      continue
    }
    if (type === 'file_ref' || type === 'image_ref') {
      const attachmentId = normalizeAttachmentId(part.attachmentId || '')
      if (!attachmentId) continue
      const isImage = type === 'image_ref'
      const mediaType = normalizeMediaType(part.mediaType || part.mimeType || '', isImage ? 'image/png' : 'application/octet-stream')
      const filename = String(part.filename || part.fileName || '').trim()
      const previewUrl = String(part.previewUrl || '').trim()
      out.push({ type: isImage ? 'image' : 'file', attachmentId, kind: isImage ? 'image' : 'file', mediaType, ...(filename ? { filename } : {}), ...(previewUrl ? { previewUrl } : {}) })
      continue
    }
    if (type === 'attachment') {
      const attachmentPart = buildAttachmentPart(part)
      if (attachmentPart) out.push(attachmentPart)
      continue
    }
    if (type === 'file_legacy') {
      const data = String(part.data || '').trim()
      const mediaType = normalizeMediaType(part.mediaType || part.mimeType || '', 'application/octet-stream')
      const filename = String(part.filename || part.fileName || '').trim()
      if (data) out.push({ type: 'file', data, mediaType, ...(filename ? { filename } : {}) })
      else if (filename || mediaType) out.push({ type: 'text', text: `[Attachment omitted: ${filename || mediaType || 'file'}]` })
    }
  }
  return compactUserParts(out)
}

function sanitizeAssistantHistoryContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')
  return content
    .filter((part) => part && typeof part === 'object' && String(part.type || '').trim().toLowerCase() === 'text')
    .map((part) => String(part.text || '').trim())
    .filter(Boolean)
    .join('\n')
}

function hasMeaningfulHistoryContent(content) {
  if (typeof content === 'string') return content.trim().length > 0
  if (Array.isArray(content)) return content.length > 0
  return false
}

export function sanitizeHistoryMessageForModel(message = {}) {
  const role = String(message?.role || '').trim()
  if (role !== 'user' && role !== 'assistant') return null
  const content = role === 'user' ? sanitizeUserHistoryContent(message?.content) : sanitizeAssistantHistoryContent(message?.content)
  if (!hasMeaningfulHistoryContent(content)) return null
  const assistantPhase = role === 'assistant' ? normalizeAssistantPhase(message?.phase) : ''
  return { role, content, ...(assistantPhase ? { phase: assistantPhase } : {}) }
}

export function supportsPdfAttachmentsForSelection({ providerId = '', modelManifest = null } = {}) {
  return supportsNativeFileAttachmentForSelection({
    providerId: normalizeProviderId(providerId),
    modelManifest,
  })
}

export function resolveAttachmentCapabilityGates({
  providerId = '',
  modelManifest = null,
  attachmentTextExtractionEnabled = false,
  attachmentTextExtractionRuntimeReady = false,
} = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const nativeImageAttachmentsEnabled = supportsNativeImageAttachmentForSelection({ providerId: normalizedProviderId, modelManifest })
  const nativeFileAttachmentsEnabled = supportsNativeFileAttachmentForSelection({ providerId: normalizedProviderId, modelManifest })
  const extractionFallbackReady = attachmentTextExtractionEnabled === true && attachmentTextExtractionRuntimeReady === true
  const imageAttachmentsEnabled = nativeImageAttachmentsEnabled
  const fileAttachmentsEnabled = nativeFileAttachmentsEnabled || extractionFallbackReady
  return {
    nativeImageAttachmentsEnabled,
    nativeFileAttachmentsEnabled,
    extractionFallbackReady,
    imageAttachmentsEnabled,
    fileAttachmentsEnabled,
    attachmentsEnabled: imageAttachmentsEnabled || fileAttachmentsEnabled,
  }
}

export function partitionAttachmentsByCapability(
  attachments = [],
  { fileAttachmentsEnabled = false, imageAttachmentsEnabled = false } = {},
) {
  const rows = Array.isArray(attachments) ? attachments : []
  const allowed = []
  const blocked = []
  for (const raw of rows) {
    const attachment = raw && typeof raw === 'object' ? raw : {}
    const mediaType = normalizeMediaType(attachment.mediaType || attachment.mimeType || attachment.type || '')
    const kind = resolveAttachmentKind(attachment, mediaType)
    if (kind === 'image' && !imageAttachmentsEnabled) {
      blocked.push({ attachment: raw, kind, reason: 'images_disabled' })
      continue
    }
    if (kind === 'file' && !fileAttachmentsEnabled) {
      blocked.push({ attachment: raw, kind, reason: 'files_disabled' })
      continue
    }
    allowed.push(raw)
  }
  return { allowed, blocked }
}
