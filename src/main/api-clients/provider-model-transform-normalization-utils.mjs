import {
  normalizeMediaType,
  normalizeObject,
  normalizePartType,
  normalizeProviderId,
  toStringSafe,
} from './provider-model-transform-content-utils.mjs'

function sanitizeAnthropicToolCallId(value = '') {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').trim()
}

function sanitizeMistralToolCallId(value = '') {
  const raw = String(value || '')
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, '')
  const base = alnum.slice(0, 5).padEnd(5, '0')
  let hash = 0
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash * 31) + raw.charCodeAt(index)) % 1679616
  }
  const suffix = Math.abs(hash).toString(36).padStart(4, '0').slice(-4)
  return `${base}${suffix}`
}

function normalizeToolCallPart(part = {}) {
  const toolCallId = toStringSafe(
    part.toolCallId
    || part.call_id
    || part.callId
    || part.id,
  )
  const toolName = toStringSafe(
    part.toolName
    || part.name
    || part.tool
    || part.tool_name,
  )
  const input = normalizeObject(part.input)
    || normalizeObject(part.arguments)
    || normalizeObject(part.args)
    || {}

  return {
    ...part,
    type: 'tool-call',
    ...(toolCallId ? { toolCallId } : {}),
    ...(toolName ? { toolName } : {}),
    input,
  }
}

function normalizeToolResultPart(part = {}) {
  const toolCallId = toStringSafe(
    part.toolCallId
    || part.call_id
    || part.callId
    || part.id,
  )
  const toolName = toStringSafe(
    part.toolName
    || part.name
    || part.tool
    || part.tool_name,
  )
  const output = Object.prototype.hasOwnProperty.call(part, 'output')
    ? part.output
    : (Object.prototype.hasOwnProperty.call(part, 'result') ? part.result : undefined)
  const normalizedOutput = Object.prototype.hasOwnProperty.call(part, 'output')
    ? output
    : (
        Object.prototype.hasOwnProperty.call(part, 'result')
          ? (
              typeof output === 'string'
                ? { type: 'text', value: output }
                : { type: 'json', value: output ?? null }
            )
          : undefined
      )

  return {
    ...part,
    type: 'tool-result',
    ...(toolCallId ? { toolCallId } : {}),
    ...(toolName ? { toolName } : {}),
    ...(Object.prototype.hasOwnProperty.call(part, 'output') || normalizedOutput !== undefined
      ? { output: normalizedOutput }
      : {}),
  }
}

function normalizeStructuredPart(rawPart = {}) {
  const source = normalizeObject(rawPart) || {}
  const type = normalizePartType(source.type)

  if (!type) return null

  if (type === 'text') {
    const text = String(source.text ?? source.content ?? '')
    return {
      ...source,
      type: 'text',
      text,
    }
  }

  if (type === 'reasoning') {
    const text = String(source.text ?? source.content ?? source.reasoning ?? '')
    return {
      ...source,
      type: 'reasoning',
      text,
    }
  }

  if (type === 'tool-call') {
    return normalizeToolCallPart(source)
  }

  if (type === 'tool-result') {
    return normalizeToolResultPart(source)
  }

  if (type === 'image') {
    return {
      ...source,
      type: 'image',
      ...(toStringSafe(source.filename || source.fileName) ? { filename: toStringSafe(source.filename || source.fileName) } : {}),
      ...(normalizeMediaType(source.mediaType || source.mimeType || '') ? { mediaType: normalizeMediaType(source.mediaType || source.mimeType || '') } : {}),
    }
  }

  if (type === 'file') {
    return {
      ...source,
      type: 'file',
      ...(toStringSafe(source.filename || source.fileName) ? { filename: toStringSafe(source.filename || source.fileName) } : {}),
      ...(normalizeMediaType(source.mediaType || source.mimeType || '') ? { mediaType: normalizeMediaType(source.mediaType || source.mimeType || '') } : {}),
    }
  }

  return {
    ...source,
    type,
  }
}

export function normalizeStructuredContentParts(content = []) {
  return (Array.isArray(content) ? content : [])
    .map((part) => normalizeStructuredPart(part))
    .filter(Boolean)
}

function normalizeMessageShape(message = {}) {
  const nextMessage = message && typeof message === 'object' ? { ...message } : {}
  if (!Array.isArray(nextMessage.content)) return nextMessage
  nextMessage.content = normalizeStructuredContentParts(nextMessage.content)
  return nextMessage
}

export function normalizeMessageForProviderTransform(message = {}) {
  return normalizeMessageShape(message)
}

export function normalizeToolCallIdsForProvider({
  providerId = '',
  message = {},
  mistralIdMap = null,
} = {}) {
  const provider = normalizeProviderId(providerId)
  if (!Array.isArray(message?.content)) return message
  if (provider !== 'anthropic' && provider !== 'mistral') return message

  let changed = false
  const nextContent = message.content.map((part) => {
    const type = normalizePartType(part?.type)
    if (type !== 'tool-call' && type !== 'tool-result') return part

    const currentId = toStringSafe(part?.toolCallId)
    if (!currentId) return part

    let nextId = currentId
    if (provider === 'mistral') {
      const stableMap = mistralIdMap instanceof Map ? mistralIdMap : null
      if (stableMap?.has(currentId)) {
        nextId = stableMap.get(currentId)
      } else {
        nextId = sanitizeMistralToolCallId(currentId)
        stableMap?.set(currentId, nextId)
      }
    } else {
      nextId = sanitizeAnthropicToolCallId(currentId)
    }

    if (!nextId || nextId === currentId) return part
    changed = true
    return {
      ...part,
      toolCallId: nextId,
    }
  })

  return changed
    ? {
        ...message,
        content: nextContent,
      }
    : message
}

export function applyMistralSequenceShim(messages = []) {
  const rows = Array.isArray(messages) ? messages : []
  if (rows.length === 0) return rows

  const nextMessages = []
  for (let index = 0; index < rows.length; index += 1) {
    const message = rows[index]
    const nextMessage = rows[index + 1]
    nextMessages.push(message)
    if (
      String(message?.role || '').trim().toLowerCase() === 'tool'
      && String(nextMessage?.role || '').trim().toLowerCase() === 'user'
    ) {
      nextMessages.push({
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
      })
    }
  }

  return nextMessages
}
