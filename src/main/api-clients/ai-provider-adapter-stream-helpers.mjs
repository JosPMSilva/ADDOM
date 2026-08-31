import { normalizeAssistantPhase } from '../../common/chat/assistant-phase.mjs'

export function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function hasResponseMeta(payload = null) {
  if (!payload || typeof payload !== 'object') return false
  return Object.values(payload).some((value) => {
    if (typeof value === 'string') return value.trim().length > 0
    if (typeof value === 'number') return Number.isFinite(value) && value !== 0
    if (typeof value === 'boolean') return value === true
    if (Array.isArray(value)) return value.length > 0
    return !!(value && typeof value === 'object' && Object.keys(value).length > 0)
  })
}

export function defaultNormalizeWarningText(warning = {}) {
  const source = warning && typeof warning === 'object' ? warning : {}
  const parts = [
    String(source.feature || '').trim(),
    String(source.details || '').trim(),
    String(source.message || '').trim(),
  ].filter(Boolean)
  return parts.join(': ')
}

function shouldEmitReasoningClassificationDebug(providerId = '', modelId = '') {
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') return false
  const provider = normalizeProviderId(providerId)
  const model = String(modelId || '').trim().toLowerCase()
  return provider === 'openrouter' && model.startsWith('openai/gpt-5.3-codex')
}

export function shouldRouteTextDeltaToReasoning(replayTarget = null, onReasoning = null) {
  if (typeof onReasoning !== 'function') return false
  return !!replayTarget
}

export function createReasoningClassificationDebugState(providerId = '', modelId = '') {
  return {
    enabled: shouldEmitReasoningClassificationDebug(providerId, modelId),
    textDeltaCount: 0,
    reasoningDeltaCount: 0,
    textChars: 0,
    reasoningChars: 0,
    firstTextSample: '',
    firstReasoningSample: '',
  }
}

export function appendReasoningClassificationSample(state, channel = 'text', delta = '') {
  if (!state?.enabled) return
  const text = String(delta ?? '')
  if (!text) return
  if (channel === 'reasoning') {
    state.reasoningDeltaCount += 1
    state.reasoningChars += text.length
    if (!state.firstReasoningSample) state.firstReasoningSample = text.slice(0, 200)
    return
  }
  state.textDeltaCount += 1
  state.textChars += text.length
  if (!state.firstTextSample) state.firstTextSample = text.slice(0, 200)
}

export function emitReasoningClassificationDebug(state, {
  providerId = '',
  modelId = '',
  resolvedReasoningText = '',
} = {}) {
  if (!state?.enabled) return
  if (state.textDeltaCount <= 0 && state.reasoningDeltaCount <= 0) return
  const normalizedReasoningText = String(resolvedReasoningText || '').trim()
  const anomaly = state.textDeltaCount > 0 && state.reasoningDeltaCount === 0
  console.info('[reasoning-classification]', {
    providerId: normalizeProviderId(providerId),
    modelId: String(modelId || '').trim(),
    anomaly,
    textDeltaCount: state.textDeltaCount,
    reasoningDeltaCount: state.reasoningDeltaCount,
    textChars: state.textChars,
    reasoningChars: state.reasoningChars,
    finalReasoningTextPresent: normalizedReasoningText.length > 0,
    firstTextSample: state.firstTextSample,
    firstReasoningSample: state.firstReasoningSample,
  })
}

export function createStreamEventCollector({
  onSource = null,
  onProviderToolStatus = null,
  onProviderToolOutput = null,
} = {}) {
  const sources = []
  const providerToolOutputs = []
  const providerToolStatuses = []

  return {
    sources,
    providerToolOutputs,
    providerToolStatuses,
    handleChunk(chunk = null) {
      if (!chunk || typeof chunk !== 'object') return false
      if (chunk.type === 'source') {
        const payload = chunk.sourceType === 'document'
          ? {
            type: 'source-document',
            sourceId: String(chunk.id || ''),
            mediaType: String(chunk.mediaType || 'text/plain'),
            title: String(chunk.title || chunk.filename || 'Source document'),
            filename: String(chunk.filename || ''),
            providerMetadata: chunk.providerMetadata,
          }
          : {
            type: 'source-url',
            sourceId: String(chunk.id || ''),
            url: String(chunk.url || ''),
            title: String(chunk.title || ''),
            providerMetadata: chunk.providerMetadata,
          }
        sources.push(payload)
        if (typeof onSource === 'function') onSource(payload)
        return true
      }
      if (chunk.type === 'tool-input-start' && chunk.providerExecuted === true) {
        const payload = {
          type: 'tool-input-start',
          toolCallId: String(chunk.id || chunk.toolCallId || ''),
          toolName: String(chunk.toolName || ''),
          title: String(chunk.title || ''),
          providerExecuted: true,
        }
        providerToolStatuses.push(payload)
        if (typeof onProviderToolStatus === 'function') onProviderToolStatus(payload)
        return true
      }
      if (chunk.type === 'tool-input-delta') {
        const payload = {
          type: 'tool-input-delta',
          toolCallId: String(chunk.id || chunk.toolCallId || ''),
          delta: String(chunk.delta ?? chunk.inputTextDelta ?? ''),
        }
        providerToolStatuses.push(payload)
        if (typeof onProviderToolStatus === 'function') onProviderToolStatus(payload)
        return true
      }
      if (chunk.type === 'tool-result' && chunk.providerExecuted === true) {
        const payload = {
          type: 'tool-output-available',
          toolCallId: String(chunk.toolCallId || chunk.id || ''),
          toolName: String(chunk.toolName || ''),
          output: Object.prototype.hasOwnProperty.call(chunk, 'output')
            ? chunk.output
            : chunk.result,
          providerExecuted: true,
        }
        providerToolOutputs.push(payload)
        if (typeof onProviderToolOutput === 'function') onProviderToolOutput(payload)
        return true
      }
      return false
    },
  }
}

export function buildStructuredTextChunkPayload(delta = '', phase = '') {
  const chunk = String(delta ?? '')
  if (!chunk) return null
  const normalizedPhase = normalizeAssistantPhase(phase)
  return normalizedPhase
    ? { chunk, phase: normalizedPhase }
    : chunk
}

export function resolveAssistantPhaseFromChunk(chunk = null) {
  if (!chunk || typeof chunk !== 'object') return ''
  return normalizeAssistantPhase(
    chunk.phase
    || chunk.textPhase
    || chunk.assistantPhase
    || chunk?.providerMetadata?.phase
    || chunk?.metadata?.phase,
  )
}
