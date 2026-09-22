import {
  flattenContentPartsToString,
  normalizeMediaType,
  serializeStructuredValue,
  toAttachmentLabel,
  toStringSafe,
} from './provider-model-transform-content-utils.mjs'

function createToolResultMediaPlaceholder(part = {}, prefix = 'Tool result attachment omitted') {
  return {
    type: 'text',
    text: `[${String(prefix || 'Tool result attachment omitted').trim()}: ${toAttachmentLabel(part)}]`,
  }
}

function sanitizeToolResultContentParts(
  parts = [],
  {
    supportsVision = false,
    imagePlaceholderPrefix = 'Tool result image omitted',
  } = {},
) {
  const sourceParts = Array.isArray(parts) ? parts : []
  const sanitizedParts = []
  let changed = false

  for (const rawPart of sourceParts) {
    const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
    const type = toStringSafe(part?.type).toLowerCase()
    const mediaType = normalizeMediaType(part?.mediaType || part?.mimeType || '')
    const isImage = type === 'image' || (type === 'media' && mediaType.startsWith('image/'))
    if (type === 'media' && isImage && supportsVision === true) {
      sanitizedParts.push(rawPart)
      continue
    }
    if (isImage) {
      changed = true
      sanitizedParts.push(createToolResultMediaPlaceholder(part, imagePlaceholderPrefix))
      continue
    }
    if (type === 'file') {
      changed = true
      sanitizedParts.push(createToolResultMediaPlaceholder(part, 'Tool result file omitted'))
      continue
    }
    sanitizedParts.push(rawPart)
  }

  return {
    changed,
    sanitizedParts,
  }
}

function flattenToolResultContentParts(parts = []) {
  return flattenContentPartsToString(parts, {
    imagePrefix: 'Tool result image omitted',
    filePrefix: 'Tool result file omitted',
  })
}

function flattenStructuredToolResultValue(value = {}) {
  const contentParts = Array.isArray(value?.content)
    ? value.content
    : (Array.isArray(value?.parts) ? value.parts : null)
  const lines = []
  const summary = toStringSafe(value?.message || value?.summary || value?.result || '')
  if (summary) lines.push(summary)
  if (contentParts) {
    const flattenedContent = flattenToolResultContentParts(contentParts)
    if (flattenedContent) lines.push(flattenedContent)
  }
  const screenshotPlaceholder = toStringSafe(value?.screenshotPlaceholder || '')
  if (screenshotPlaceholder) lines.push(screenshotPlaceholder)
  return lines.join('\n').trim() || serializeStructuredValue(value)
}

function sanitizeToolResultOutput(
  output = null,
  {
    supportsVision = false,
    imagePlaceholderPrefix = 'Tool result image omitted',
  } = {},
) {
  const payload = output && typeof output === 'object' ? output : null
  if (!payload) {
    return { changed: false, output }
  }

  const outputType = toStringSafe(payload.type).toLowerCase()
  const value = payload.value

  if (Array.isArray(value)) {
    const sanitized = sanitizeToolResultContentParts(value, {
      supportsVision,
      imagePlaceholderPrefix,
    })
    if (!sanitized.changed) {
      return { changed: false, output }
    }
    return {
      changed: true,
      output: {
        ...payload,
        value: outputType === 'text' || outputType === 'error-text'
          ? flattenToolResultContentParts(sanitized.sanitizedParts)
          : sanitized.sanitizedParts,
      },
    }
  }

  if (value && typeof value === 'object') {
    const nextValue = { ...value }
    let changed = false

    for (const key of ['content', 'parts']) {
      if (!Array.isArray(nextValue[key])) continue
      const sanitized = sanitizeToolResultContentParts(nextValue[key], {
        supportsVision,
        imagePlaceholderPrefix,
      })
      if (!sanitized.changed) continue
      nextValue[key] = sanitized.sanitizedParts
      changed = true
    }

    const screenshotBase64 = toStringSafe(nextValue.screenshotBase64 || '')
    if (screenshotBase64) {
      delete nextValue.screenshotBase64
      nextValue.screenshotOmitted = true
      nextValue.screenshotPlaceholder = createToolResultMediaPlaceholder({
        filename: toStringSafe(nextValue.screenshotFilepath || ''),
        mediaType: normalizeMediaType(nextValue.screenshotMediaType || '', 'image/jpeg'),
      }, imagePlaceholderPrefix).text
      changed = true
    }

    if (!changed) {
      return { changed: false, output }
    }

    return {
      changed: true,
      output: {
        ...payload,
        ...(outputType === 'text' || outputType === 'error-text'
          ? { value: flattenStructuredToolResultValue(nextValue) }
          : { value: nextValue }),
      },
    }
  }

  return { changed: false, output }
}

function adaptToolResultMediaMessage({
  message = {},
  supportsVision = false,
  imagePlaceholderPrefix = 'Tool result image omitted',
} = {}) {
  const content = Array.isArray(message?.content) ? message.content : []
  if (content.length === 0) {
    return message
  }

  let changed = false
  const nextContent = []

  for (const rawPart of content) {
    const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
    const type = toStringSafe(part?.type).toLowerCase()
    if (type !== 'tool-result') {
      nextContent.push(rawPart)
      continue
    }
    const sanitized = sanitizeToolResultOutput(part?.output, {
      supportsVision,
      imagePlaceholderPrefix,
    })
    if (sanitized.changed) changed = true
    nextContent.push({
      ...part,
      output: sanitized.output,
    })
  }

  if (!changed) {
    return message
  }

  return {
    ...message,
    content: nextContent,
  }
}

function adaptNormalizedMessage({
  message = {},
  supportsVision = false,
  imagePlaceholderPrefix = 'Tool result image omitted',
} = {}) {
  const role = String(message?.role || '').trim().toLowerCase()
  if (role !== 'tool') return message
  return adaptToolResultMediaMessage({
    message: {
      ...message,
    },
    supportsVision,
    imagePlaceholderPrefix,
  })
}

function collectImageParts(parts = [], images = []) {
  for (const rawPart of Array.isArray(parts) ? parts : []) {
    const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
    const type = toStringSafe(part?.type).toLowerCase()
    const mediaType = normalizeMediaType(part?.mediaType || part?.mimeType || '')
    const isImage = type === 'image' || (type === 'media' && mediaType.startsWith('image/'))
    const data = toStringSafe(part?.data || part?.image || '')
    if (!isImage || !data) continue
    images.push({
      type: 'file',
      data,
      mediaType: mediaType || 'image/jpeg',
      ...(toStringSafe(part?.filename || '') ? { filename: toStringSafe(part.filename) } : {}),
    })
  }
  return images
}

function collectToolResultImages(message = {}) {
  const images = []
  for (const rawPart of Array.isArray(message?.content) ? message.content : []) {
    const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
    if (toStringSafe(part?.type).toLowerCase() !== 'tool-result') continue
    const value = part?.output?.value
    if (Array.isArray(value)) {
      collectImageParts(value, images)
      continue
    }
    if (!value || typeof value !== 'object') continue
    collectImageParts(value.content, images)
    collectImageParts(value.parts, images)
    const screenshotBase64 = toStringSafe(value.screenshotBase64 || '')
    if (screenshotBase64) {
      images.push({
        type: 'file',
        data: screenshotBase64,
        mediaType: normalizeMediaType(value.screenshotMediaType || '', 'image/jpeg'),
        ...(toStringSafe(value.screenshotFilepath || '')
          ? { filename: toStringSafe(value.screenshotFilepath) }
          : {}),
      })
    }
  }
  const seen = new Set()
  return images.filter((image) => {
    const key = `${image.mediaType}:${image.data}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizeToolResultMediaMessages(messages = [], options = {}) {
  return (Array.isArray(messages) ? messages : []).map((message) => adaptNormalizedMessage({ message, ...options }))
}

export function adaptNormalizedToolResultMessage(message = {}, options = {}) {
  return adaptNormalizedMessage({ message, ...options })
}

export function adaptNormalizedToolResultMessages(message = {}, options = {}) {
  if (options?.separateToolResultImages !== true) {
    return [adaptNormalizedMessage({ message, ...options })]
  }
  const images = collectToolResultImages(message)
  if (images.length === 0) {
    return [adaptNormalizedMessage({ message, ...options })]
  }
  const adaptedToolMessage = adaptNormalizedMessage({
    message,
    ...options,
    supportsVision: false,
    imagePlaceholderPrefix: 'Tool result image attached separately',
  })
  return [
    adaptedToolMessage,
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Visual output from the preceding tool result.' },
        ...images,
      ],
    },
  ]
}
