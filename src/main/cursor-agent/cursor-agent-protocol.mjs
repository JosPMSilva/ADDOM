const MAX_STREAM_LINE_LENGTH = 1024 * 1024

function text(value = '') {
  return String(value || '').trim()
}

function requireText(value, field) {
  const normalized = text(value)
  if (!normalized) throw new Error(`Cursor Agent event requires ${field}.`)
  return normalized
}

function extractAssistantText(message = null) {
  const content = Array.isArray(message?.content) ? message.content : []
  return content
    .filter((entry) => entry?.type === 'text')
    .map((entry) => String(entry?.text || ''))
    .join('')
}

function readOptionalTimestampMs(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

// Cursor --stream-partial-output emits three assistant shapes; only the first
// carries new text (docs: timestamp present + model_call_id absent).
export function shouldAcceptCursorAssistantEvent(event = {}, { sawStreamingTimestamp = false } = {}) {
  if (text(event.modelCallId)) return false
  if (event.timestampMs != null) return true
  // Final end-of-turn flush under partial streaming (no timestamp, no model_call_id).
  if (sawStreamingTimestamp) return false
  // Non-partial stream-json: complete assistant segments without timestamp fields.
  return true
}

export function normalizeCursorAgentEvent(event = null) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Cursor Agent stream line must be a JSON object.')
  }
  const type = text(event.type)
  const subtype = text(event.subtype)
  if (type === 'system' && subtype === 'init') {
    return {
      kind: 'init',
      sessionId: requireText(event.session_id, 'session_id'),
      cwd: requireText(event.cwd, 'cwd'),
      model: requireText(event.model, 'model'),
      authSource: text(event.apiKeySource),
      permissionMode: text(event.permissionMode),
    }
  }
  if (type === 'user') {
    return { kind: 'user', sessionId: text(event.session_id), message: event.message || null }
  }
  if (type === 'assistant') {
    return {
      kind: 'assistant_delta',
      sessionId: text(event.session_id),
      text: extractAssistantText(event.message),
      timestampMs: readOptionalTimestampMs(event.timestamp_ms),
      modelCallId: text(event.model_call_id),
    }
  }
  if (type === 'thinking' && ['delta', 'completed'].includes(subtype)) {
    return {
      kind: subtype === 'delta' ? 'thinking_delta' : 'thinking_completed',
      sessionId: text(event.session_id),
      ...(subtype === 'delta' ? { text: String(event.text || '') } : {}),
    }
  }
  if (type === 'tool_call' && ['started', 'completed'].includes(subtype)) {
    return {
      kind: subtype === 'started' ? 'tool_started' : 'tool_completed',
      sessionId: text(event.session_id),
      callId: requireText(event.call_id, 'call_id'),
      toolCall: event.tool_call || {},
    }
  }
  if (type === 'result') {
    return {
      kind: 'result',
      sessionId: requireText(event.session_id, 'session_id'),
      status: subtype || (event.is_error ? 'error' : 'success'),
      isError: event.is_error === true,
      result: String(event.result || ''),
      requestId: text(event.request_id),
      durationMs: Number(event.duration_ms || 0) || 0,
    }
  }
  return { kind: 'unknown', type, subtype, raw: event }
}

export function createCursorAgentStreamParser() {
  let buffer = ''
  let finished = false
  let sawStreamingTimestamp = false
  const parseLines = (flush = false) => {
    const rows = buffer.split(/\r?\n/)
    buffer = flush ? '' : (rows.pop() || '')
    if (buffer.length > MAX_STREAM_LINE_LENGTH) throw new Error('Cursor Agent stream line exceeded the limit.')
    const events = []
    for (const row of rows) {
      const line = row.trim()
      if (!line) continue
      if (line.length > MAX_STREAM_LINE_LENGTH) throw new Error('Cursor Agent stream line exceeded the limit.')
      try {
        const normalized = normalizeCursorAgentEvent(JSON.parse(line))
        if (normalized.kind === 'assistant_delta') {
          if (!shouldAcceptCursorAssistantEvent(normalized, { sawStreamingTimestamp })) continue
          if (normalized.timestampMs != null) sawStreamingTimestamp = true
        }
        events.push(normalized)
      } catch (error) {
        throw new Error(`Malformed Cursor Agent stream: ${error?.message || error}`)
      }
    }
    return events
  }
  return {
    push(chunk = '') {
      if (finished) throw new Error('Cursor Agent stream parser is already finished.')
      buffer += String(chunk || '')
      return parseLines(false)
    },
    finish() {
      if (finished) return []
      finished = true
      if (!buffer.trim()) return []
      buffer += '\n'
      return parseLines(true)
    },
  }
}
