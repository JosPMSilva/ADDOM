const SEGMENTED_PROVIDERS = new Set(['deepseek', 'openai'])

export function createReasoningPhaseRuntime({
  providerId = '',
  round = 0,
  threadId = '',
  turnId = '',
  model = '',
  send = () => {},
  onProviderToolStatus = () => {},
  onProviderToolOutput = () => {},
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  let currentBuffer = ''
  let currentCommentaryBuffer = ''
  let segment = SEGMENTED_PROVIDERS.has(normalizedProviderId)
    ? Math.max(0, Number(round || 0) - 1)
    : null
  const observedToolCalls = new Set()
  let anonymousBoundarySequence = 0

  const markToolBoundary = (payload = {}) => {
    const toolCallId = String(payload?.toolCallId || '').trim()
    const toolName = String(payload?.toolName || '').trim().toLowerCase()
    const forcedBoundary = payload?.forceBoundary === true
    const boundaryIdentity = toolCallId || (forcedBoundary ? `anonymous:${++anonymousBoundarySequence}` : '')
    const isBoundary = normalizedProviderId === 'openai'
      && boundaryIdentity
      && toolName
      && toolName !== 'model_reroute'
      && toolName !== 'provider_error'
      && !observedToolCalls.has(boundaryIdentity)
    if (!isBoundary) return
    observedToolCalls.add(boundaryIdentity)
    if (currentBuffer) {
      send('chat:reasoning-chunk', {
        chunk: '', flushPending: true, threadId, turnId, round, reasoningSegment: segment,
        providerId: String(providerId || ''), model: String(model ?? ''), emittedAt: Date.now(),
      })
    }
    if (currentCommentaryBuffer) {
      send('chat:chunk', {
        chunk: '', flushPending: true, phase: 'commentary', threadId, turnId, round,
        reasoningSegment: segment, providerId: String(providerId || ''),
        model: String(model ?? ''), emittedAt: Date.now(),
      })
    }
    segment = Math.max(0, Number(segment) || 0) + 1
    currentBuffer = ''
    currentCommentaryBuffer = ''
  }

  return {
    append(chunk = '') {
      currentBuffer += String(chunk || '')
      return { currentBuffer, segment }
    },
    appendCommentary(chunk = '') {
      currentCommentaryBuffer += String(chunk || '')
      return { currentBuffer: currentCommentaryBuffer, segment }
    },
    markProviderToolBoundary(payload = {}) {
      markToolBoundary({ ...payload, forceBoundary: true })
    },
    handleProviderToolStatus(payload = {}) {
      markToolBoundary(payload)
      onProviderToolStatus(payload)
    },
    handleProviderToolOutput(payload = {}) {
      markToolBoundary(payload)
      onProviderToolOutput(payload)
    },
    snapshot() {
      return { currentBuffer, currentCommentaryBuffer, segment }
    },
  }
}
