const TOOL_OUTPUT_FLUSH_INTERVAL_MS = 48
const TOOL_OUTPUT_IMMEDIATE_FLUSH_CHARS = 1600

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

export function createToolOutputBufferRuntime({ useChatStore } = {}) {
  const toolOutputBuffers = new Map()

      const flushToolOutputBuffer = (bufferKey) => {
        const key = String(bufferKey || '').trim()
        if (!key) return
        const buffer = toolOutputBuffers.get(key)
        if (!buffer) return
        if (buffer.timer) {
          clearTimeout(buffer.timer)
          buffer.timer = null
        }
        if (!buffer.pendingText) return
        useChatStore.getState().appendLiveExecutionToolOutput({
          threadId: buffer.threadId,
          turnId: buffer.turnId,
          stepId: buffer.stepId,
          sequence: buffer.sequence,
          toolName: buffer.toolName,
          stream: buffer.stream,
          chunk: buffer.pendingText,
          emittedAt: buffer.lastEmittedAt || Date.now(),
        })
        buffer.pendingText = ''
        buffer.lastEmittedAt = 0
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
        const key = `${turnId}:${stepId}:${stream}`
        const existing = toolOutputBuffers.get(key) || {
          threadId: String(payload.threadId || '').trim(),
          turnId,
          stepId,
          sequence: Number(payload.sequence || 0) || 0,
          toolName: String(payload.toolName || '').trim(),
          stream,
          pendingText: '',
          lastEmittedAt: 0,
          timer: null,
        }
        existing.threadId = String(payload.threadId || existing.threadId || '').trim()
        existing.sequence = Number(payload.sequence || existing.sequence || 0) || 0
        existing.toolName = String(payload.toolName || existing.toolName || '').trim()
        existing.pendingText += chunk
        existing.lastEmittedAt = Number(payload.emittedAt || 0) || Date.now()
        toolOutputBuffers.set(key, existing)
  
        if (existing.pendingText.length >= TOOL_OUTPUT_IMMEDIATE_FLUSH_CHARS) {
          flushToolOutputBuffer(key)
          return
        }
        if (existing.timer) return
        existing.timer = setTimeout(() => {
          flushToolOutputBuffer(key)
        }, TOOL_OUTPUT_FLUSH_INTERVAL_MS)
      }

  return { toolOutputBuffers, flushToolOutputBuffer, flushToolOutputBuffersByStep, queueToolOutputChunk }
}
