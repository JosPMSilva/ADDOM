import { supportsNativeFileMediaTypeForProvider } from '../../common/attachments/attachment-support-policy.mjs'
import {
  normalizeMediaType,
  normalizePartType,
  toAttachmentLabel,
  toStringSafe,
} from './provider-model-transform-content-utils.mjs'

function buildUnsupportedAttachmentPlaceholder(part = {}, attachment = {}) {
  const type = normalizePartType(part.type)
  const label = toAttachmentLabel(part, type === 'image' ? 'image' : 'file')
  const suffix = type === 'image'
    ? 'this model does not support image input'
    : 'this model does not support this file input'

  if (type === 'image') {
    return {
      type: 'text',
      text: `[Image attachment omitted: ${label}; ${suffix}]`,
    }
  }

  const mediaType = normalizeMediaType(part.mediaType || part.mimeType || '')
  const supportsPdf = attachment?.supportsPdf === true
  const looksLikePdf = mediaType === 'application/pdf'
    || label.toLowerCase().endsWith('.pdf')
  const fileSuffix = looksLikePdf && !supportsPdf
    ? 'this model does not support PDF input'
    : suffix

  return {
    type: 'text',
    text: `[File attachment omitted: ${label}; ${fileSuffix}]`,
  }
}

function partIsSupportedByAttachment({
  providerId = '',
  part = {},
  attachment = {},
} = {}) {
  if (String(attachment?.family || '').trim().toLowerCase() === 'unknown') {
    return true
  }
  const type = normalizePartType(part?.type)
  if (type === 'image') {
    return attachment?.supportsVision === true
  }
  if (type !== 'file') return true
  return supportsNativeFileMediaTypeForProvider({
    providerId,
    modelAttachmentSupport: attachment,
    mediaType: normalizeMediaType(part?.mediaType || part?.mimeType || ''),
    fileName: toStringSafe(part?.filename || part?.fileName || ''),
  })
}

export function downgradeUnsupportedUserAttachments({
  providerId = '',
  message = {},
  attachment = {},
} = {}) {
  if (String(message?.role || '').trim().toLowerCase() !== 'user') return message
  if (!Array.isArray(message?.content)) return message

  let changed = false
  const nextContent = message.content.map((part) => {
    const type = normalizePartType(part?.type)
    if (type !== 'image' && type !== 'file') return part
    if (partIsSupportedByAttachment({ providerId, part, attachment })) return part
    changed = true
    return buildUnsupportedAttachmentPlaceholder(part, attachment)
  })

  return changed
    ? {
        ...message,
        content: nextContent,
      }
    : message
}
