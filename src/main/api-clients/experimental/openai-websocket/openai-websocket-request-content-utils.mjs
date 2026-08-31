import {
  flattenStructuredTextOnlyContent,
  normalizeStructuredContentParts,
} from '../../provider-model-transform.mjs'

export function normalizeRequestedTools(tools = {}) {
  return tools && typeof tools === 'object' ? tools : {}
}

export function normalizeRole(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function extractPostAssistantDeltaMessages(messages = []) {
  const rows = Array.isArray(messages) ? messages : []
  let lastAssistantIndex = -1
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (normalizeRole(rows[index]?.role) === 'assistant') {
      lastAssistantIndex = index
      break
    }
  }

  return (lastAssistantIndex >= 0 ? rows.slice(lastAssistantIndex + 1) : rows)
    .filter((message) => {
      const role = normalizeRole(message?.role)
      return role !== 'system' && role !== 'developer'
    })
}

export function flattenTextOnlyContent(content, { allowAttachments = false, role = 'message' } = {}) {
  return flattenStructuredTextOnlyContent(content, { allowAttachments, role })
}

function parseDataUrlPayload(rawValue = '') {
  const raw = String(rawValue || '').trim()
  if (!raw) return { mediaType: '', data: '', isDataUrl: false }
  const match = raw.match(/^data:([^;,]+)?;base64,([\s\S]+)$/i)
  if (!match) {
    return { mediaType: '', data: raw, isDataUrl: false }
  }
  return {
    mediaType: String(match[1] || '').trim().toLowerCase(),
    data: String(match[2] || '').trim(),
    isDataUrl: true,
  }
}

function normalizeAttachmentMediaType(value = '', fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || String(fallback || '').trim().toLowerCase()
}

function normalizeImageDetail(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'low' || normalized === 'high' || normalized === 'auto') {
    return normalized
  }
  return ''
}

function isLikelyUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function isLikelyOpenAIFileId(value = '') {
  return /^file[-_]/i.test(String(value || '').trim())
}

export function convertUserContentParts(parts = []) {
  const sourceParts = normalizeStructuredContentParts(parts)
  const content = []

  for (let index = 0; index < sourceParts.length; index += 1) {
    const part = sourceParts[index] && typeof sourceParts[index] === 'object' ? sourceParts[index] : {}
    const type = normalizeRole(part.type)

    if (type === 'text') {
      const text = String(part.text ?? '').trim()
      if (text) content.push({ type: 'input_text', text })
      continue
    }

    if (type === 'image') {
      const parsedImage = parseDataUrlPayload(part.image || '')
      const explicitMediaType = normalizeAttachmentMediaType(
        part.mediaType || part.mimeType || parsedImage.mediaType || '',
        'image/png',
      )
      const imagePayload = String(parsedImage.data || '').trim()
      if (!imagePayload) {
        return { ok: false, content: [], reason: 'input_image_missing_data' }
      }
      const detail = normalizeImageDetail(part.detail || part.imageDetail || part?.providerOptions?.openai?.imageDetail)
      const imagePart = {
        type: 'input_image',
        ...(isLikelyOpenAIFileId(imagePayload)
          ? { file_id: imagePayload }
          : {
              image_url: parsedImage.isDataUrl
                ? String(part.image || '').trim()
                : (
                    isLikelyUrl(imagePayload)
                      ? imagePayload
                      : `data:${explicitMediaType};base64,${imagePayload}`
                  ),
            }),
      }
      if (detail) imagePart.detail = detail
      content.push(imagePart)
      continue
    }

    if (type === 'file') {
      const parsedFile = parseDataUrlPayload(part.data || '')
      const explicitMediaType = normalizeAttachmentMediaType(
        part.mediaType || part.mimeType || parsedFile.mediaType || '',
        'application/octet-stream',
      )
      const filePayload = String(parsedFile.data || '').trim()
      const filename = String(part.filename || part.fileName || '').trim()
      if (!filePayload) {
        return { ok: false, content: [], reason: 'input_file_missing_data' }
      }
      content.push({
        type: 'input_file',
        ...(isLikelyOpenAIFileId(filePayload)
          ? { file_id: filePayload }
          : (
              isLikelyUrl(filePayload)
                ? { file_url: filePayload }
                : {
                    filename: filename || `attachment-${index + 1}`,
                    file_data: parsedFile.isDataUrl
                      ? String(part.data || '').trim()
                      : `data:${explicitMediaType};base64,${filePayload}`,
                  }
            )),
      })
      continue
    }

    if (type === 'reasoning') {
      continue
    }

    if (type === 'tool-call' || type === 'tool-result') {
      return { ok: false, content: [], reason: 'tool_history_present' }
    }

    return { ok: false, content: [], reason: 'unsupported_content_shape' }
  }

  return { ok: true, content, reason: '' }
}
