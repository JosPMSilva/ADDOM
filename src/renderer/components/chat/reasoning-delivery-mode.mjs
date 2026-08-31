export function classifyReasoningDeliveryMode({
  chunkCount = 0,
  finalText = '',
  reasoningTokens = 0,
} = {}) {
  const chunks = Math.max(0, Number(chunkCount || 0) || 0)
  const text = String(finalText ?? '').trim()
  const tokens = Math.max(0, Number(reasoningTokens || 0) || 0)

  if (chunks > 0) return 'live'
  if (text) return 'summary_end'
  if (tokens > 0) return 'unavailable_redacted'
  return 'none'
}

function normalizeSourceToken(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function isLocalOpenAIStreamedReasoningEvent(event = {}) {
  const streamMeta = event?.streamMeta && typeof event.streamMeta === 'object'
    ? event.streamMeta
    : {}
  const reasoningMeta = event?.reasoningMeta && typeof event.reasoningMeta === 'object'
    ? event.reasoningMeta
    : {}
  const messageId = String(event?.messageId || '').trim()
  if (messageId.startsWith('execution_commentary:')) return false

  const providerId = normalizeSourceToken(streamMeta?.providerId || reasoningMeta?.providerId)
  if (providerId !== 'openai') return false

  const transportMode = normalizeSourceToken(streamMeta?.transportMode || reasoningMeta?.transportMode)
  if (transportMode !== 'responses_stream') return false

  const authMethod = normalizeSourceToken(streamMeta?.authMethod || reasoningMeta?.authMethod)
  if (authMethod === 'account') return false

  const mode = normalizeSourceToken(reasoningMeta?.mode)
  const chunkCount = Math.max(0, Number(reasoningMeta?.chunkCount || 0) || 0)
  const status = normalizeSourceToken(event?.status)

  return mode === 'live' || chunkCount > 0 || status === 'active'
}

export function nextReasoningMetaOnChunk(prevMeta = {}, chunk = '', timestamp = Date.now()) {
  const prev = prevMeta && typeof prevMeta === 'object' ? prevMeta : {}
  const delta = String(chunk ?? '')
  const chars = delta.length
  const chunkCount = Math.max(0, Number(prev.chunkCount || 0) || 0) + (chars > 0 ? 1 : 0)
  const charsStreamed = Math.max(0, Number(prev.charsStreamed || 0) || 0) + chars
  const firstChunkAt = Number(prev.firstChunkAt || 0) || (chars > 0 ? Number(timestamp || Date.now()) : 0)
  const lastChunkAt = chars > 0 ? Number(timestamp || Date.now()) : (Number(prev.lastChunkAt || 0) || 0)

  return {
    ...prev,
    mode: chunkCount > 0 ? 'live' : (prev.mode || 'none'),
    chunkCount,
    charsStreamed,
    firstChunkAt: firstChunkAt || undefined,
    lastChunkAt: lastChunkAt || undefined,
  }
}

export function finalizeReasoningMeta(prevMeta = {}, { finalText = '', reasoningTokens = 0, providerId = '', model = '' } = {}) {
  const prev = prevMeta && typeof prevMeta === 'object' ? prevMeta : {}
  const finalReasoningText = String(finalText ?? '')
  const rTokens = Math.max(0, Number(reasoningTokens || 0) || 0)
  const chunkCount = Math.max(0, Number(prev.chunkCount || 0) || 0)
  const charsStreamed = Math.max(0, Number(prev.charsStreamed || 0) || 0)
  const mode = classifyReasoningDeliveryMode({
    chunkCount,
    finalText: finalReasoningText,
    reasoningTokens: rTokens,
  })

  return {
    ...prev,
    mode,
    chunkCount,
    charsStreamed,
    reasoningTokens: rTokens,
    finalTextPresent: finalReasoningText.trim().length > 0,
    providerId: String(providerId || prev.providerId || '').trim() || undefined,
    model: String(model || prev.model || '').trim() || undefined,
  }
}
