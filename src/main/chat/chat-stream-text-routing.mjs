import { normalizeProviderTextChunk } from '../../common/chat/canonical-turn-engine.mjs'

export function appendBoundedStreamText(currentValue = '', chunk = '', boundaryBefore = false) {
  const current = String(currentValue || '')
  const next = String(chunk || '')
  if (!next || boundaryBefore !== true || !current) {
    return { content: `${current}${next}`, delta: next }
  }
  const trailingNewlines = current.match(/\n*$/)?.[0]?.length || 0
  const leadingNewlines = next.match(/^\n*/)?.[0]?.length || 0
  const separator = '\n'.repeat(Math.max(0, 2 - trailingNewlines - leadingNewlines))
  return { content: `${current}${separator}${next}`, delta: `${separator}${next}` }
}

export function shouldDeferUnphasedProviderText(payload = {}, tools = {}) {
  return !payload?.phase && Object.keys(tools || {}).length > 0
}

export function createProviderTextChunkRouter({
  tools = {}, send = () => {}, executionChunks = null, reasoningPhases = null,
  threadId = '', turnId = '', round = 0, providerId = '', model = '',
} = {}) {
  let commentaryBuffer = ''
  let deferredUnphasedTextBuffer = ''
  let textChunkSequence = 0
  let commentaryChunkSequence = 0
  const handle = (chunkPayload) => {
    const payload = normalizeProviderTextChunk(chunkPayload)
    if (!payload.chunk) return
    if (shouldDeferUnphasedProviderText(payload, tools)) {
      deferredUnphasedTextBuffer += payload.chunk
      return
    }
    const emittedAt = Date.now()
    const sequence = ++textChunkSequence
    if (String(payload.phase || '').trim().toLowerCase() === 'commentary') {
      const bounded = appendBoundedStreamText(commentaryBuffer, payload.chunk, payload.boundaryBefore === true)
      commentaryBuffer = bounded.content
      const commentaryPhase = reasoningPhases.appendCommentary(bounded.delta)
      commentaryChunkSequence += 1
      executionChunks.write('execution_commentary_chunk', {
        content: commentaryPhase.currentBuffer, phase: payload.phase,
        sequence: commentaryChunkSequence, emittedAt, reasoningSegment: commentaryPhase.segment,
      })
      payload.chunk = bounded.delta
      payload.reasoningSegment = commentaryPhase.segment
    }
    send('chat:chunk', {
      ...payload, threadId, turnId, round, providerId: String(providerId || ''),
      model: String(model ?? ''), sequence, emittedAt,
    })
  }
  return {
    handle,
    snapshot: () => ({
      commentaryBuffer, deferredUnphasedTextBuffer, textChunkSequence, commentaryChunkSequence,
    }),
  }
}

export function buildDeferredFinalTextPayload({
  deferredText = '', streamResult = null, threadId = '', turnId = '', round = 0,
  providerId = '', model = '', sequence = 0, emittedAt = Date.now(),
} = {}) {
  const chunk = String(deferredText || '')
  if (!chunk || (Array.isArray(streamResult?.toolCalls) && streamResult.toolCalls.length > 0)) return null
  return {
    chunk, threadId, turnId, round, providerId: String(providerId || ''),
    model: String(model ?? ''), sequence, emittedAt,
  }
}
