import { normalizeUsage } from '../../ai-provider-stream-utils.mjs'
import { normalizeAssistantPhase } from '../../../../common/chat/assistant-phase.mjs'
import {
  createOpenAIRawStreamMetaCollector,
  extractOpenAIResponseMeta,
} from '../../ai-provider-openai-runtime.mjs'

function normalizeStopReason(response = null) {
  const status = String(response?.status || '').trim().toLowerCase()
  if (status === 'completed') return 'stop'
  if (status === 'incomplete') {
    const reason = String(response?.incomplete_details?.reason || '').trim().toLowerCase()
    if (reason === 'max_output_tokens') return 'length'
    return 'incomplete'
  }
  if (status === 'failed') return 'error'
  return 'stop'
}

function buildResponseFailureError(response = null, fallbackMessage = 'OpenAI Responses WebSocket request failed.') {
  const message = String(
    response?.error?.message
    || response?.status_details?.error?.message
    || fallbackMessage,
  ).trim() || fallbackMessage
  const error = new Error(message)
  error.providerId = 'openai'
  error.code = String(response?.error?.code || '').trim().toLowerCase() || undefined
  error.status = Number(response?.error?.status || 0) || undefined
  return error
}

function applyChainResetRecoveryHint(error, emittedAnyChunk = false) {
  if (!error || typeof error !== 'object') return error
  if (String(error.code || '').trim().toLowerCase() === 'previous_response_not_found' && emittedAnyChunk !== true) {
    error.openaiWebSocketChainResetRecommended = true
  }
  if (String(error.code || '').trim().toLowerCase() === 'websocket_connection_limit_reached' && emittedAnyChunk !== true) {
    error.openaiWebSocketReconnectRecommended = true
  }
  return error
}

function safeParseFunctionCallArguments(argumentsText = '') {
  const source = String(argumentsText ?? '').trim()
  if (!source) return {}
  try {
    const parsed = JSON.parse(source)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeProviderToolItemType(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveAssistantPhase(payload = null) {
  if (!payload || typeof payload !== 'object') return ''
  return normalizeAssistantPhase(
    payload.phase
    || payload.text_phase
    || payload.assistant_phase,
  )
}

function resolveProviderToolNameFromItemType(value = '') {
  const type = normalizeProviderToolItemType(value)
  if (!type) return ''
  if (type === 'web_search_call') return 'web_search'
  if (type === 'file_search_call') return 'file_search'
  if (type === 'code_interpreter_call') return 'code_interpreter'
  if (type === 'image_generation_call') return 'image_generation'
  if (type === 'apply_patch_call' || type === 'apply_patch_call_output') return 'apply_patch'
  if (type === 'shell_call' || type === 'shell_call_output') return 'shell'
  if (type === 'local_shell_call' || type === 'local_shell_call_output') return 'local_shell'
  if (type === 'mcp_call') return 'mcp'
  return ''
}

function buildProviderToolStatusPayload(item = null) {
  const source = item && typeof item === 'object' ? item : {}
  const toolName = resolveProviderToolNameFromItemType(source.type)
  if (!toolName) return null
  return {
    type: 'tool-input-start',
    toolCallId: String(source.call_id || source.id || '').trim(),
    toolName,
    providerExecuted: true,
  }
}

function buildProviderToolOutputPayload(item = null) {
  const source = item && typeof item === 'object' ? item : {}
  const toolName = resolveProviderToolNameFromItemType(source.type)
  if (!toolName) return null
  return {
    type: 'tool-output-available',
    toolCallId: String(source.call_id || source.id || '').trim(),
    toolName,
    output: source,
    providerExecuted: true,
  }
}

export function createOpenAIResponsesWebSocketResponseState({
  modelId = '',
  onChunk = () => {},
  onReasoning = () => {},
  onProviderToolStatus = () => {},
  onProviderToolOutput = () => {},
  onProgress = () => {},
} = {}) {
  const rawCollector = createOpenAIRawStreamMetaCollector()
  let text = ''
  let reasoning = ''
  let response = null
  let lastKnownResponseId = ''
  let lastKnownConversationId = ''
  let lastKnownResponseStatus = ''
  let terminalEventType = ''
  let emittedAnyChunk = false
  let transportError = null
  const functionCallsByCallId = new Map()
  const functionCallOrder = []
  const itemIdToCallId = new Map()
  const providerToolStatuses = []
  const providerToolOutputs = []
  const providerToolStatusKeys = new Set()
  const providerToolOutputKeys = new Set()

  function appendText(delta = '', phase = '') {
    const textDelta = String(delta ?? '')
    if (!textDelta) return
    emittedAnyChunk = true
    text += textDelta
    onProgress()
    const normalizedPhase = normalizeAssistantPhase(phase)
    onChunk(normalizedPhase ? { chunk: textDelta, phase: normalizedPhase } : textDelta)
  }

  function appendReasoning(delta = '') {
    const reasoningDelta = String(delta ?? '')
    if (!reasoningDelta) return
    emittedAnyChunk = true
    reasoning += reasoningDelta
    onProgress()
    onReasoning(reasoningDelta)
  }

  function updateTrackedResponseState(event = null) {
    const source = event && typeof event === 'object' ? event : {}
    const responsePayload = source.response && typeof source.response === 'object'
      ? source.response
      : null
    const responseId = String(
      responsePayload?.id
      || source.response_id
      || ''
    ).trim()
    const conversationId = String(
      responsePayload?.conversation?.id
      || responsePayload?.conversation_id
      || source.conversation_id
      || ''
    ).trim()
    const responseStatus = String(
      responsePayload?.status
      || source.status
      || ''
    ).trim().toLowerCase()

    if (responseId) lastKnownResponseId = responseId
    if (conversationId) lastKnownConversationId = conversationId
    if (responseStatus) lastKnownResponseStatus = responseStatus
  }

  function upsertFunctionCall(item = null) {
    const row = item && typeof item === 'object' ? item : {}
    if (String(row.type || '').trim().toLowerCase() !== 'function_call') {
      return
    }

    const callId = String(row.call_id || '').trim()
    if (!callId) return

    const itemId = String(row.id || '').trim()
    if (itemId) itemIdToCallId.set(itemId, callId)

    const existing = functionCallsByCallId.get(callId) || {
      id: callId,
      name: '',
      argumentsText: '',
    }
    if (!functionCallsByCallId.has(callId)) {
      functionCallsByCallId.set(callId, existing)
      functionCallOrder.push(callId)
    }

    if (String(row.name || '').trim()) {
      existing.name = String(row.name || '').trim()
    }
    if (Object.prototype.hasOwnProperty.call(row, 'arguments')) {
      existing.argumentsText = String(row.arguments ?? '')
    }
  }

  function appendFunctionCallArgumentsDelta(itemId = '', delta = '') {
    const callId = itemIdToCallId.get(String(itemId || '').trim())
    if (!callId) return
    const existing = functionCallsByCallId.get(callId)
    if (!existing) return
    existing.argumentsText += String(delta ?? '')
  }

  function pushProviderToolStatus(item = null) {
    const payload = buildProviderToolStatusPayload(item)
    if (!payload) return
    const key = `${String(payload.toolCallId || '').trim()}::${payload.toolName}`
    if (providerToolStatusKeys.has(key)) return
    providerToolStatusKeys.add(key)
    providerToolStatuses.push(payload)
    onProgress()
    onProviderToolStatus(payload)
  }

  function pushProviderToolOutput(item = null) {
    const payload = buildProviderToolOutputPayload(item)
    if (!payload) return
    const key = `${String(payload.toolCallId || '').trim()}::${payload.toolName}`
    if (providerToolOutputKeys.has(key)) return
    providerToolOutputKeys.add(key)
    providerToolOutputs.push(payload)
    onProgress()
    onProviderToolOutput(payload)
  }

  function pushProviderToolInputDelta(toolName = '', toolCallId = '', delta = '') {
    const normalizedToolName = String(toolName || '').trim()
    const normalizedDelta = String(delta ?? '')
    if (!normalizedToolName || !normalizedDelta) return
    const payload = {
      type: 'tool-input-delta',
      toolCallId: String(toolCallId || '').trim(),
      toolName: normalizedToolName,
      delta: normalizedDelta,
      providerExecuted: true,
    }
    providerToolStatuses.push(payload)
    onProgress()
    onProviderToolStatus(payload)
  }

  return {
    get emittedAnyChunk() {
      return emittedAnyChunk
    },
    get hasTerminalEvent() {
      return !!terminalEventType
    },
    get responseId() {
      return lastKnownResponseId
    },
    get conversationId() {
      return lastKnownConversationId
    },
    get responseStatus() {
      return lastKnownResponseStatus
    },
    handleEvent(event = null) {
      if (!event || typeof event !== 'object') return false
      rawCollector.handleRawChunk?.(event)
      updateTrackedResponseState(event)

      switch (String(event.type || '').trim()) {
        case 'response.created':
        case 'response.in_progress':
          return false
        case 'response.output_text.delta':
          appendText(event.delta, resolveAssistantPhase(event))
          return false
        case 'response.output_text.done':
          if (!text) appendText(event.text, resolveAssistantPhase(event))
          return false
        case 'response.reasoning_summary_text.delta':
        case 'response.reasoning_text.delta':
          appendReasoning(event.delta)
          return false
        case 'response.output_item.added':
          pushProviderToolStatus(event.item)
          upsertFunctionCall(event.item)
          return false
        case 'response.output_item.done':
          pushProviderToolStatus(event.item)
          pushProviderToolOutput(event.item)
          upsertFunctionCall(event.item)
          return false
        case 'response.function_call_arguments.delta':
          appendFunctionCallArgumentsDelta(event.item_id, event.delta)
          return false
        case 'response.function_call_arguments.done':
          upsertFunctionCall(event.item)
          return false
        case 'response.code_interpreter_call_code.delta':
          pushProviderToolInputDelta('code_interpreter', event.item_id, event.delta)
          return false
        case 'response.code_interpreter_call_code.done':
          pushProviderToolInputDelta('code_interpreter', event.item_id, event.code)
          return false
        case 'response.apply_patch_call_operation_diff.delta':
          pushProviderToolInputDelta('apply_patch', event.item_id, event.delta)
          return false
        case 'response.apply_patch_call_operation_diff.done':
          pushProviderToolInputDelta('apply_patch', event.item_id, event.diff)
          return false
        case 'response.mcp_call_arguments.delta':
          pushProviderToolInputDelta('mcp', event.item_id, event.delta)
          return false
        case 'response.mcp_call_arguments.done':
          pushProviderToolInputDelta('mcp', event.item_id, event.arguments)
          return false
        case 'response.completed':
        case 'response.incomplete':
        case 'response.failed':
          response = event.response && typeof event.response === 'object' ? event.response : null
          terminalEventType = String(event.type || '').trim()
          if (!text && typeof response?.output_text === 'string') {
            appendText(response.output_text, resolveAssistantPhase(response))
          }
          return true
        case 'error': {
          const message = String(
            event?.error?.message
            || event?.message
            || 'OpenAI Responses WebSocket transport failed.',
          ).trim() || 'OpenAI Responses WebSocket transport failed.'
          const error = new Error(message)
          error.providerId = 'openai'
          error.code = String(event?.error?.code || '').trim().toLowerCase() || undefined
          if (lastKnownResponseId) error.openaiWebSocketResponseId = lastKnownResponseId
          if (lastKnownConversationId) error.openaiWebSocketConversationId = lastKnownConversationId
          transportError = applyChainResetRecoveryHint(error, emittedAnyChunk)
          return true
        }
        default:
          return false
      }
    },
    buildResult() {
      if (transportError) {
        const error = transportError
        error.openaiWebSocketEmittedAnyChunk = emittedAnyChunk === true
        if (lastKnownResponseId) error.openaiWebSocketResponseId = lastKnownResponseId
        if (lastKnownConversationId) error.openaiWebSocketConversationId = lastKnownConversationId
        throw error
      }

      if (!terminalEventType) {
        const error = new Error('OpenAI Responses WebSocket closed before a terminal response event was received.')
        error.providerId = 'openai'
        error.openaiWebSocketEmittedAnyChunk = emittedAnyChunk === true
        if (lastKnownResponseId) error.openaiWebSocketResponseId = lastKnownResponseId
        if (lastKnownConversationId) error.openaiWebSocketConversationId = lastKnownConversationId
        throw error
      }

      if (terminalEventType === 'response.failed') {
        const error = applyChainResetRecoveryHint(buildResponseFailureError(response), emittedAnyChunk)
        error.openaiWebSocketEmittedAnyChunk = emittedAnyChunk === true
        if (lastKnownResponseId) error.openaiWebSocketResponseId = lastKnownResponseId
        if (lastKnownConversationId) error.openaiWebSocketConversationId = lastKnownConversationId
        throw error
      }

      const toolCalls = functionCallOrder
        .map((callId) => functionCallsByCallId.get(callId))
        .filter(Boolean)
        .map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
          input: safeParseFunctionCallArguments(toolCall.argumentsText),
        }))
        .filter((toolCall) => toolCall.id && toolCall.name)

      for (const item of Array.isArray(response?.output) ? response.output : []) {
        pushProviderToolStatus(item)
        pushProviderToolOutput(item)
      }

      return {
        stopReason: toolCalls.length > 0 ? 'tool-calls' : normalizeStopReason(response),
        text,
        reasoning: reasoning.trim(),
        usage: normalizeUsage(response?.usage),
        toolCalls,
        sources: [],
        providerToolOutputs: providerToolOutputs,
        providerToolStatuses: providerToolStatuses,
        providerResponseMeta: {
          ...extractOpenAIResponseMeta(null, response, modelId, rawCollector.buildMeta?.() || null),
          transportMode: 'responses_websocket_experimental',
        },
      }
    },
  }
}
