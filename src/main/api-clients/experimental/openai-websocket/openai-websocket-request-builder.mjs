import { canonicalizeRequestedModel } from '../../ai-provider-model-utils.mjs'
import {
  prepareOpenAIContinuationMessages,
} from '../../ai-provider-openai-runtime.mjs'
import {
  normalizeStructuredContentParts,
  normalizeToolResultMediaMessages,
  resolveProviderModelTransform,
} from '../../provider-model-transform.mjs'
import { resolveProviderModelAdapter } from '../../provider-model-adapters.mjs'
import { normalizeOpenAIProviderRuntimeSettings } from '../../openai-runtime-types.mjs'
import { applyOpenAIServerSideCompactionTransportShim } from '../../openai-server-side-compaction.mjs'
import { resolveOpenAIRequestContextCompaction } from '../../openai-request-context-compaction.mjs'
import { resolveContinuationRequestContext } from '../../continuation-request-context.mjs'
import { COMPACTION_MODES } from '../../../chat/continuity/compaction-mode-contract.mjs'
import { convertUserContentParts, extractPostAssistantDeltaMessages, flattenTextOnlyContent, normalizeRequestedTools, normalizeRole } from './openai-websocket-request-content-utils.mjs'
import { normalizeRequestedToolDefinitions, serializeStructuredValue, serializeToolResultOutput } from './openai-websocket-tool-normalizers.mjs'

function normalizePromptCacheRetention(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'in_memory') return 'in_memory'
  if (normalized === '24h') return '24h'
  return ''
}

function supportsOpenAIResponsesControls(adapterProfile = {}) {
  return String(adapterProfile?.optionFamily || '').trim().toLowerCase() === 'openai_responses'
}

function createReasoningConfig(openaiOptions = {}) {
  const reasoning = {}
  const summary = String(openaiOptions.reasoningSummary || '').trim().toLowerCase()
  const effort = String(openaiOptions.reasoningEffort || '').trim().toLowerCase()
  if (summary) reasoning.summary = summary
  if (effort) reasoning.effort = effort
  return Object.keys(reasoning).length > 0 ? reasoning : null
}

function createTextConfig(openaiOptions = {}) {
  const verbosity = String(openaiOptions.textVerbosity || '').trim().toLowerCase()
  if (!verbosity) return null
  return { verbosity }
}

function normalizeCompactedWindow(openAIContext = {}) {
  return Array.isArray(openAIContext?.manualCompactedWindow)
    ? openAIContext.manualCompactedWindow.filter((item) => item && typeof item === 'object')
    : []
}

function normalizeMessagesForWebSocketCreateBodyBoundary(messages = []) {
  const normalizedShape = (Array.isArray(messages) ? messages : []).map((rawMessage) => {
    const message = rawMessage && typeof rawMessage === 'object' ? { ...rawMessage } : {}
    if (!Array.isArray(message.content)) return message
    message.content = normalizeStructuredContentParts(message.content).filter((part) => normalizeRole(part?.type) !== 'reasoning')
    return message
  })
  return normalizeToolResultMediaMessages(normalizedShape)
}

function splitWarmupInputItems(input = []) {
  const rows = Array.isArray(input) ? input : []
  const prefix = []
  const tail = []
  for (const item of rows) {
    const role = normalizeRole(item?.role)
    if (
      tail.length === 0
      && item
      && typeof item === 'object'
      && item.type === 'message'
      && (role === 'system' || role === 'developer')
    ) {
      prefix.push(item)
      continue
    }
    tail.push(item)
  }
  return { prefix, tail }
}

function resolveWarmupBodies(createBody = null, runtimeSettings = null, requestContext = {}) {
  const body = createBody && typeof createBody === 'object' ? createBody : null
  if (!body) return { warmupBody: null, createBody: body }

  const settings = normalizeOpenAIProviderRuntimeSettings(runtimeSettings || {})
  if (settings.websocketWarmupEnabled !== true) {
    return { warmupBody: null, createBody: body }
  }

  const openAIContext = requestContext?.openai && typeof requestContext.openai === 'object'
    ? requestContext.openai
    : {}
  if (
    String(body.previous_response_id || '').trim()
    || String(body.conversation || '').trim()
    || normalizeCompactedWindow(openAIContext).length > 0
  ) {
    return { warmupBody: null, createBody: body }
  }

  const { prefix, tail } = splitWarmupInputItems(body.input)
  if (prefix.length === 0 || tail.length !== 1) {
    return { warmupBody: null, createBody: body }
  }
  const tailItem = tail[0]
  if (
    !tailItem
    || typeof tailItem !== 'object'
    || tailItem.type !== 'message'
    || normalizeRole(tailItem.role) !== 'user'
  ) {
    return { warmupBody: null, createBody: body }
  }

  return {
    warmupBody: {
      ...body,
      input: prefix,
      generate: false,
    },
    createBody: {
      ...body,
      input: tail,
    },
  }
}

function convertMessagesToInput(messages = []) {
  const input = []
  for (const rawMessage of Array.isArray(messages) ? messages : []) {
    const message = rawMessage && typeof rawMessage === 'object' ? rawMessage : {}
    const role = normalizeRole(message.role)
    if (!role || !['user', 'assistant', 'system', 'developer', 'tool'].includes(role)) {
      return {
        ok: false,
        input: [],
        reason: 'unsupported_role_present',
      }
    }

    if (role === 'tool') {
      const content = normalizeStructuredContentParts(message.content)
      let sawToolResult = false
      for (const part of content) {
        const type = normalizeRole(part.type)
        if (type !== 'tool-result') {
          return {
            ok: false,
            input: [],
            reason: type ? 'unsupported_tool_result_shape' : 'unsupported_content_shape',
          }
        }
        const callId = String(part.toolCallId || '').trim()
        if (!callId) {
          return {
            ok: false,
            input: [],
            reason: 'tool_result_missing_call_id',
          }
        }
        sawToolResult = true
        input.push({
          type: 'function_call_output',
          call_id: callId,
          output: serializeToolResultOutput(part.output),
        })
      }
      if (!sawToolResult) {
        return {
          ok: false,
          input: [],
          reason: 'unsupported_tool_result_shape',
        }
      }
      continue
    }

    if (role === 'assistant' && Array.isArray(message.content)) {
      const normalizedContent = normalizeStructuredContentParts(message.content)
      const textChunks = []
      const functionCalls = []
      for (const part of normalizedContent) {
        const type = normalizeRole(part.type)
        if (type === 'text') {
          const text = String(part.text ?? '')
          if (text) textChunks.push(text)
          continue
        }
        if (type === 'reasoning') {
          continue
        }
        if (type === 'image' || type === 'file') {
          const flattened = flattenTextOnlyContent([part], {
            allowAttachments: true,
            role: 'Assistant',
          })
          if (flattened.ok && flattened.text) textChunks.push(flattened.text)
          continue
        }
        if (type === 'tool-call') {
          const callId = String(part.toolCallId || '').trim()
          const name = String(part.toolName || '').trim()
          if (!callId || !name) {
            return {
              ok: false,
              input: [],
              reason: 'tool_call_missing_identity',
            }
          }
          functionCalls.push({
            type: 'function_call',
            call_id: callId,
            name,
            arguments: serializeStructuredValue(part.input ?? {}),
          })
          continue
        }
        return {
          ok: false,
          input: [],
          reason: type ? 'non_text_content_present' : 'unsupported_content_shape',
        }
      }

      if (textChunks.length > 0) {
        const nextMessage = {
          type: 'message',
          role,
          content: textChunks.join('\n').trim(),
        }
        const phase = String(message.phase || '').trim().toLowerCase()
        if (phase === 'commentary' || phase === 'final_answer') {
          nextMessage.phase = phase
        }
        if (nextMessage.content) input.push(nextMessage)
      }

      input.push(...functionCalls)
      continue
    }

    if (role === 'user' && Array.isArray(message.content)) {
      const multipart = convertUserContentParts(message.content)
      if (!multipart.ok) {
        return {
          ok: false,
          input: [],
          reason: multipart.reason,
        }
      }
      if (multipart.content.length === 0) continue
      if (
        multipart.content.length === 1
        && multipart.content[0]?.type === 'input_text'
      ) {
        input.push({
          type: 'message',
          role,
          content: String(multipart.content[0].text || ''),
        })
      } else {
        input.push({
          type: 'message',
          role,
          content: multipart.content,
        })
      }
      continue
    }

    const flattened = flattenTextOnlyContent(message.content, {
      allowAttachments: true,
      role,
    })
    if (!flattened.ok) {
      return {
        ok: false,
        input: [],
        reason: flattened.reason,
      }
    }
    if (!flattened.text) continue
    const nextMessage = {
      type: 'message',
      role,
      content: flattened.text,
    }
    if (role === 'assistant') {
      const phase = String(message.phase || '').trim().toLowerCase()
      if (phase === 'commentary' || phase === 'final_answer') {
        nextMessage.phase = phase
      }
    }
    input.push(nextMessage)
  }
  return {
    ok: true,
    input,
    reason: '',
  }
}

export function resolveOpenAIResponsesWebSocketEligibility({
  modelId = '',
  messages = [],
  tools = {},
  runtimeSettings = null,
  requestContext = {},
  adapterProfile = null,
} = {}) {
  const normalizedRuntimeSettings = normalizeOpenAIProviderRuntimeSettings(runtimeSettings || {})
  if (normalizedRuntimeSettings.transportMode !== 'responses_websocket_experimental') {
    return { eligible: false, reason: 'transport_not_selected' }
  }

  const resolvedAdapterProfile = adapterProfile || resolveProviderModelAdapter('openai', modelId)
  if (!supportsOpenAIResponsesControls(resolvedAdapterProfile)) {
    return { eligible: false, reason: 'model_not_curated' }
  }

  if (normalizedRuntimeSettings.enableBackgroundMode === true) {
    return { eligible: false, reason: 'background_mode_enabled' }
  }

  const openAIContext = requestContext?.openai && typeof requestContext.openai === 'object'
    ? requestContext.openai
    : {}
  const requestCompaction = resolveOpenAIRequestContextCompaction(openAIContext)
  const compactedWindow = normalizeCompactedWindow(openAIContext)
  if (
    (
      openAIContext.forceManualCompaction === true
      || requestCompaction.requestedCompactionMode === COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION
    )
    && compactedWindow.length === 0
  ) {
    return { eligible: false, reason: 'manual_compaction_unsupported' }
  }

  for (const rawMessage of Array.isArray(messages) ? messages : []) {
    const message = rawMessage && typeof rawMessage === 'object' ? rawMessage : {}
    const inputPayload = convertMessagesToInput([message])
    if (!inputPayload.ok) {
      return { eligible: false, reason: inputPayload.reason }
    }
  }

  const normalizedTools = normalizeRequestedToolDefinitions(tools)
  if (!normalizedTools.ok) {
    return { eligible: false, reason: normalizedTools.reason }
  }

  return { eligible: true, reason: '' }
}

export function buildOpenAIResponsesWebSocketCreateBody({
  modelId = '',
  messages = [],
  providerOptions = {},
  maxOutputTokens = null,
  requestContext = {},
  tools = {},
  messagesNormalized = false,
} = {}) {
  const normalizedMessages = messagesNormalized === true
    ? (Array.isArray(messages) ? messages : [])
    : normalizeMessagesForWebSocketCreateBodyBoundary(messages)
  const openAIContext = requestContext?.openai && typeof requestContext.openai === 'object'
    ? requestContext.openai
    : {}
  const compactedWindow = normalizeCompactedWindow(openAIContext)
  const inputPayload = convertMessagesToInput(normalizedMessages)
  if (!inputPayload.ok) {
    return {
      ok: false,
      body: null,
      reason: inputPayload.reason,
    }
  }

  const openaiOptions = providerOptions?.openai && typeof providerOptions.openai === 'object'
    ? providerOptions.openai
    : {}
  const normalizedTools = normalizeRequestedToolDefinitions(tools)
  if (!normalizedTools.ok) {
    return {
      ok: false,
      body: null,
      reason: normalizedTools.reason,
    }
  }
  const body = {
    model: String(modelId || '').trim(),
    input: compactedWindow.length > 0
      ? [...compactedWindow, ...inputPayload.input]
      : inputPayload.input,
  }

  if (typeof openaiOptions.store === 'boolean') {
    body.store = openaiOptions.store
  }
  if (openaiOptions.include) {
    body.include = Array.isArray(openaiOptions.include) ? openaiOptions.include : []
  }
  if (openaiOptions.metadata && typeof openaiOptions.metadata === 'object') {
    body.metadata = openaiOptions.metadata
  }
  if (compactedWindow.length > 0) {
    // Standalone /responses/compact starts a fresh chain; the returned window is the new base input.
  } else if (String(openaiOptions.conversation || '').trim()) {
    body.conversation = String(openaiOptions.conversation || '').trim()
  } else if (String(openaiOptions.previousResponseId || '').trim()) {
    body.previous_response_id = String(openaiOptions.previousResponseId || '').trim()
  }
  if (String(openaiOptions.serviceTier || '').trim()) {
    body.service_tier = String(openaiOptions.serviceTier || '').trim().toLowerCase()
  }
  if (String(openaiOptions.promptCacheKey || '').trim()) {
    body.prompt_cache_key = String(openaiOptions.promptCacheKey || '').trim()
  }
  const promptCacheRetention = normalizePromptCacheRetention(openaiOptions.promptCacheRetention)
  if (promptCacheRetention) {
    body.prompt_cache_retention = promptCacheRetention
  }
  const reasoning = createReasoningConfig(openaiOptions)
  if (reasoning) {
    body.reasoning = reasoning
  }
  const text = createTextConfig(openaiOptions)
  if (text) {
    body.text = text
  }
  if (normalizedTools.tools.length > 0) {
    body.tools = normalizedTools.tools
  }
  if (Number.isFinite(Number(maxOutputTokens)) && Number(maxOutputTokens) > 0) {
    body.max_output_tokens = Math.round(Number(maxOutputTokens))
  }

  return {
    ok: true,
    body: applyOpenAIServerSideCompactionTransportShim(body),
    reason: '',
  }
}

export function prepareOpenAIResponsesWebSocketRequest({
  messages = [],
  options = {},
} = {}) {
  const requestedOptions = options && typeof options === 'object' ? options : {}
  const requestedMessages = Array.isArray(messages) ? messages : []
  const canonicalModel = canonicalizeRequestedModel('openai', requestedOptions.model)
  const modelId = canonicalModel.effectiveModelId
  const adapterProfile = resolveProviderModelAdapter('openai', modelId)
  const providerTransform = resolveProviderModelTransform({
    providerId: 'openai',
    modelId,
    adapterProfile,
  })
  const continuationPrep = prepareOpenAIContinuationMessages(
    requestedMessages,
    requestedOptions.requestContext,
  )
  const continuationMessages = Array.isArray(continuationPrep?.messages)
    ? continuationPrep.messages
    : requestedMessages
  const requestContext = resolveContinuationRequestContext(
    requestedOptions.requestContext,
    continuationPrep,
  )
  const openAIContext = requestContext?.openai && typeof requestContext.openai === 'object'
    ? requestContext.openai
    : {}
  const hasCompactedWindow = normalizeCompactedWindow(openAIContext).length > 0
  const effectiveMessages = hasCompactedWindow
    ? extractPostAssistantDeltaMessages(requestedMessages)
    : continuationMessages
  const normalizedMessages = providerTransform.normalizeMessages({
    messages: effectiveMessages,
    preserveUserAttachments: true,
  })
  const eligibility = resolveOpenAIResponsesWebSocketEligibility({
    modelId,
    messages: normalizedMessages,
    tools: requestedOptions.tools,
    runtimeSettings: requestedOptions.providerRuntimeSettings,
    requestContext,
    adapterProfile,
  })
  const requestedToolNames = Object.keys(normalizeRequestedTools(requestedOptions.tools))
  const requestConfig = providerTransform.resolveInvocationConfig({
    runtimeSettings: requestedOptions.providerRuntimeSettings,
    requestContext: {
      ...(requestContext && typeof requestContext === 'object' ? requestContext : {}),
      messages: requestedMessages,
      toolNames: requestedToolNames,
      tools: normalizeRequestedTools(requestedOptions.tools),
    },
    requestedMaxOutputTokens: requestedOptions.maxOutputTokens ?? null,
  })
  const providerOptions = requestConfig.providerOptions

  if (!eligibility.eligible) {
    return {
      eligible: false,
      reason: eligibility.reason,
      modelId,
      adapterProfile,
      messages: normalizedMessages,
      requestContext,
      providerOptions,
      maxOutputTokens: requestConfig.maxOutputTokens,
      createBody: null,
    }
  }

  const createBody = buildOpenAIResponsesWebSocketCreateBody({
    modelId,
    messages: normalizedMessages,
    providerOptions,
    maxOutputTokens: requestConfig.maxOutputTokens,
    requestContext,
    tools: requestedOptions.tools,
    messagesNormalized: true,
  })
  if (!createBody.ok) {
    return {
      eligible: false,
      reason: createBody.reason,
      modelId,
      adapterProfile,
      messages: normalizedMessages,
      requestContext,
      providerOptions,
      maxOutputTokens: requestConfig.maxOutputTokens,
      createBody: null,
    }
  }

  const warmupBodies = resolveWarmupBodies(
    createBody.body,
    requestedOptions.providerRuntimeSettings,
    requestContext,
  )

  return {
    eligible: true,
    reason: '',
    modelId,
    adapterProfile,
    messages: normalizedMessages,
    requestContext,
    providerOptions,
    maxOutputTokens: requestConfig.maxOutputTokens,
    createBody: warmupBodies.createBody,
    warmupBody: warmupBodies.warmupBody,
  }
}
