const TOOL_OUTPUT_FLUSH_INTERVAL_MS = 48
const MAX_PENDING_TOOL_OUTPUT_CHARS = 64_000
const MAX_PENDING_TOOL_OUTPUT_SEGMENTS = 64
const OMITTED_OUTPUT_MARKER = '[Earlier buffered output omitted]\n'

export function flushMatchingToolOutputBuffers(toolOutputBuffers, flushToolOutputBuffer, {
  threadId = '',
  turnId = '',
  stepId = '',
} = {}) {
  const normalizedThreadId = String(threadId || '').trim()
  const normalizedTurnId = String(turnId || '').trim()
  const normalizedStepId = String(stepId || '').trim()
  if (!normalizedThreadId && !normalizedTurnId && !normalizedStepId) return 0
  let flushedCount = 0
  for (const [key, buffer] of toolOutputBuffers.entries()) {
    if (normalizedThreadId && String(buffer?.threadId || '').trim() !== normalizedThreadId) continue
    if (normalizedTurnId && String(buffer?.turnId || '').trim() !== normalizedTurnId) continue
    if (normalizedStepId && String(buffer?.stepId || '').trim() !== normalizedStepId) continue
    flushToolOutputBuffer(key)
    flushedCount += 1
  }
  return flushedCount
}

function trimPendingSegments(buffer) {
  while (
    buffer.segments.length > MAX_PENDING_TOOL_OUTPUT_SEGMENTS
    || (buffer.pendingChars > MAX_PENDING_TOOL_OUTPUT_CHARS && buffer.segments.length > 1)
  ) {
    const removed = buffer.segments.shift()
    buffer.pendingChars -= String(removed?.chunk || '').length
    buffer.outputOmitted = true
  }

  if (buffer.pendingChars <= MAX_PENDING_TOOL_OUTPUT_CHARS || buffer.segments.length === 0) return
  const first = buffer.segments[0]
  const chunk = String(first?.chunk || '')
  first.chunk = chunk.slice(-MAX_PENDING_TOOL_OUTPUT_CHARS)
  buffer.pendingChars = first.chunk.length
  buffer.outputOmitted = true
}

export function createToolOutputBufferRuntime({ useChatStore } = {}) {
  const toolOutputBuffers = new Map()

  const flushToolOutputBuffer = (bufferKey) => {
    const key = String(bufferKey || '').trim()
    if (!key) return
    const buffer = toolOutputBuffers.get(key)
    if (!buffer) return
    if (buffer.timer) clearTimeout(buffer.timer)
    toolOutputBuffers.delete(key)
    if (!Array.isArray(buffer.segments) || buffer.segments.length === 0) return

    const segments = buffer.segments.map((segment) => ({ ...segment }))
    if (buffer.outputOmitted === true) {
      segments[0].chunk = `${OMITTED_OUTPUT_MARKER}${segments[0].chunk}`
    }
    for (const segment of segments) {
      useChatStore.getState().appendLiveExecutionToolOutput({
        threadId: buffer.threadId,
        turnId: buffer.turnId,
        stepId: buffer.stepId,
        sequence: segment.sequence,
        toolName: buffer.toolName,
        stream: segment.stream,
        chunk: segment.chunk,
        emittedAt: segment.emittedAt || Date.now(),
      })
    }
  }

  const flushToolOutputBuffersByStep = ({ turnId = '', stepId = '' } = {}) => {
    flushMatchingToolOutputBuffers(toolOutputBuffers, flushToolOutputBuffer, { turnId, stepId })
  }

  const queueToolOutputChunk = (payload = {}) => {
    const turnId = String(payload.turnId || '').trim()
    const stepId = String(payload.stepId || '').trim()
    const stream = String(payload.stream || '').trim().toLowerCase() === 'stderr' ? 'stderr' : 'stdout'
    const chunk = String(payload.chunk ?? '')
    if (!turnId || !stepId || !chunk) return
    const key = `${turnId}:${stepId}`
    const buffer = toolOutputBuffers.get(key) || {
      threadId: String(payload.threadId || '').trim(),
      turnId,
      stepId,
      toolName: String(payload.toolName || '').trim(),
      segments: [],
      pendingChars: 0,
      outputOmitted: false,
      timer: null,
    }
    buffer.threadId = String(payload.threadId || buffer.threadId || '').trim()
    buffer.toolName = String(payload.toolName || buffer.toolName || '').trim()

    const sequence = Number(payload.sequence || 0) || 0
    const emittedAt = Number(payload.emittedAt || 0) || Date.now()
    const previous = buffer.segments.at(-1)
    if (previous?.stream === stream) {
      previous.chunk += chunk
      previous.sequence = sequence || previous.sequence
      previous.emittedAt = emittedAt
    } else {
      buffer.segments.push({ stream, chunk, sequence, emittedAt })
    }
    buffer.pendingChars += chunk.length
    trimPendingSegments(buffer)
    toolOutputBuffers.set(key, buffer)

    if (buffer.timer) return
    buffer.timer = setTimeout(() => flushToolOutputBuffer(key), TOOL_OUTPUT_FLUSH_INTERVAL_MS)
  }

  return { toolOutputBuffers, flushToolOutputBuffer, flushToolOutputBuffersByStep, queueToolOutputChunk }
}

export const __testToolOutputBuffer = Object.freeze({
  MAX_PENDING_TOOL_OUTPUT_CHARS,
  MAX_PENDING_TOOL_OUTPUT_SEGMENTS,
})
