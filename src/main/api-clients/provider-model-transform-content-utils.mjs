export function trimString(value = '') {
  return String(value || '').trim()
}

export function normalizeProviderId(value = '') {
  return trimString(value).toLowerCase()
}

export function toStringSafe(value) {
  return String(value ?? '').trim()
}

export function normalizeMediaType(value = '', fallback = '') {
  const mediaType = String(value || '').trim().toLowerCase()
  return mediaType || String(fallback || '').trim().toLowerCase()
}

export function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null
}

export function normalizePartType(value = '') {
  const normalized = toStringSafe(value).toLowerCase()
  if (normalized === 'tool_call') return 'tool-call'
  if (normalized === 'tool_result') return 'tool-result'
  return normalized
}

export function normalizeProviderOptionsNamespace(value = '') {
  const normalized = trimString(value).toLowerCase()
  if (normalized === 'openaicompatible') return 'openaiCompatible'
  return trimString(value)
}

export function toAttachmentLabel(part = {}, fallback = 'attachment') {
  const fileName = toStringSafe(part?.filename || part?.fileName || '')
  if (fileName) return fileName
  const mediaType = toStringSafe(part?.mediaType || part?.mimeType || '').toLowerCase()
  if (mediaType) return mediaType
  return fallback
}

export function flattenContentPartsToString(
  content,
  {
    imagePrefix = 'Image attachment omitted for this provider',
    filePrefix = 'File attachment omitted for this provider',
  } = {},
) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')

  const lines = []
  for (const rawPart of content) {
    const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
    const type = toStringSafe(part.type).toLowerCase()
    if (type === 'text') {
      const text = toStringSafe(part.text)
      if (text) lines.push(text)
      continue
    }
    if (type === 'image') {
      lines.push(`[${imagePrefix}: ${toAttachmentLabel(part, 'image')}]`)
      continue
    }
    if (type === 'file') {
      lines.push(`[${filePrefix}: ${toAttachmentLabel(part, 'file')}]`)
      continue
    }
    const fallbackText = toStringSafe(part.text)
    if (fallbackText) lines.push(fallbackText)
  }
  return lines.join('\n').trim()
}

export function flattenUserContentPartsToString(content) {
  return flattenContentPartsToString(content, {
    imagePrefix: 'Image attachment omitted for this provider',
    filePrefix: 'File attachment omitted for this provider',
  })
}

export function serializeStructuredValue(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return String(value ?? '')
  }
}
