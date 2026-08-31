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

function sanitizeToolResultContentParts(parts = []) {
  const sourceParts = Array.isArray(parts) ? parts : []
  const sanitizedParts = []
  let changed = false

  for (const rawPart of sourceParts) {
    const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
    const type = toStringSafe(part?.type).toLowerCase()
    if (type === 'image') {
      changed = true
      sanitizedParts.push(createToolResultMediaPlaceholder(part, 'Tool result image omitted'))
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

function sanitizeToolResultOutput(output = null) {
  const payload = output && typeof output === 'object' ? output : null
  if (!payload) {
    return { changed: false, output }
  }

  const outputType = toStringSafe(payload.type).toLowerCase()
  const value = payload.value

  if (Array.isArray(value)) {
    const sanitized = sanitizeToolResultContentParts(value)
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
      const sanitized = sanitizeToolResultContentParts(nextValue[key])
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
      }, 'Tool result image omitted').text
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
    const sanitized = sanitizeToolResultOutput(part?.output)
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
} = {}) {
  const role = String(message?.role || '').trim().toLowerCase()
  if (role !== 'tool') return message
  return adaptToolResultMediaMessage({
    message: {
      ...message,
    },
  })
}

export function normalizeToolResultMediaMessages(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((message) => adaptNormalizedMessage({ message }))
}

export function adaptNormalizedToolResultMessage(message = {}) {
  return adaptNormalizedMessage({ message })
}
