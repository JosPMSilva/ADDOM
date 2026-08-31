import { createOpenAI } from '@ai-sdk/openai'
import { createSharedInlineCompletion, createSharedStreamWithTools } from './ai-provider-adapter-core.mjs'
import { resolveProviderCapabilities } from './ai-provider-capability-probes.mjs'
import {
  createOpenAIRawStreamMetaCollector,
  extractOpenAIResponseMeta,
  isIgnorableOpenAIProviderWarning,
  normalizeCallWarningText,
  prepareOpenAIBackgroundTurnPayload,
  prepareOpenAIContinuationMessages,
  toOpenAIStreamChunkError,
} from './ai-provider-openai-runtime.mjs'
import { createExperimentalOpenAIResponsesWebSocketStream } from './experimental/openai-websocket/openai-websocket-runtime.mjs'
import { prepareOpenAIResponsesWebSocketRequest } from './experimental/openai-websocket/openai-websocket-request-builder.mjs'
import { createOpenAIAccountStreamPayload } from './ai-provider-openai-account.mjs'
import {
  classifyOpenAIWebSocketRecovery,
  OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
} from './experimental/openai-websocket/openai-websocket-reconnect-policy.mjs'
import { applyOpenAIServerSideCompactionTransportShim } from './openai-server-side-compaction.mjs'
import { resolveProviderModelTransform } from './provider-model-transform.mjs'
import {
  normalizeOpenAIProviderRuntimeSettings,
  resolveOpenAIBaseUrl,
  resolveOpenAIModelRuntimeSupport,
} from './openai-runtime-types.mjs'
import { resolveOpenAIAssistantPhase } from '../chat/assistant-phase-policy.mjs'

let openAILegacyStreamFactoryForTests = null

function createOpenAIFetchWithServerSideCompactionShim(baseFetch = globalThis.fetch) {
  return async (input, init = {}) => {
    if (typeof baseFetch !== 'function') {
      throw new Error('Fetch is unavailable for the OpenAI provider.')
    }
    const rawBody = init && typeof init === 'object' ? init.body : undefined
    if (typeof rawBody !== 'string' || rawBody.trim().length === 0) {
      return baseFetch(input, init)
    }

    let parsedBody = null
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = null
    }
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return baseFetch(input, init)
    }

    const nextBody = applyOpenAIServerSideCompactionTransportShim(parsedBody)
    if (nextBody === parsedBody) {
      return baseFetch(input, init)
    }
    return baseFetch(input, {
      ...init,
      body: JSON.stringify(nextBody),
    })
  }
}

function createOpenAIWebSocketIneligibleError(reason = 'unknown_reason') {
  const error = new Error(`OpenAI Responses WebSocket transport is not available for this turn (${String(reason || 'unknown_reason')}).`)
  error.providerId = 'openai'
  error.code = 'openai_websocket_ineligible'
  error.openaiWebSocketFallbackRecommended = true
  error.openaiWebSocketFallbackReason = String(reason || 'unknown_reason')
  error.openaiWebSocketEmittedAnyChunk = false
  return error
}

function createOpenAIWebSocketChainResetRetryOptions(options = {}) {
  const source = options && typeof options === 'object' ? options : {}
  const requestContext = source.requestContext && typeof source.requestContext === 'object'
    ? source.requestContext
    : {}
  const openai = requestContext.openai && typeof requestContext.openai === 'object'
    ? requestContext.openai
    : {}
  return {
    ...source,
    requestContext: {
      ...requestContext,
      openai: {
        ...openai,
        previousResponseId: '',
        conversationId: '',
      },
    },
  }
}

function emitOpenAIWebSocketTransportStatus(options = {}, payload = {}) {
  if (typeof options?.onTransportStatus !== 'function') return
  options.onTransportStatus({
    transportMode: 'responses_websocket_experimental',
    ...payload,
  })
}

async function createOpenAILegacyStreamPayload(args) {
  if (typeof openAILegacyStreamFactoryForTests === 'function') {
    return openAILegacyStreamFactoryForTests(args)
  }
  return createSharedStreamWithTools(args)
}

function withOpenAITransportMode(runtimeSettings = {}, transportMode = 'responses_stream') {
  return normalizeOpenAIProviderRuntimeSettings({
    ...(runtimeSettings && typeof runtimeSettings === 'object' ? runtimeSettings : {}),
    transportMode,
  })
}

export function resolveOpenAITransportDecision({
  modelId = '',
  runtimeSettings = {},
  websocketQualification = null,
} = {}) {
  const configuredTransportMode = String(runtimeSettings?.transportMode || '').trim().toLowerCase() || 'responses_auto'
  const modelSupport = resolveOpenAIModelRuntimeSupport(modelId)
  const qualifiedWebSocket = websocketQualification && typeof websocketQualification === 'object'
    ? websocketQualification
    : modelSupport?.apiCapabilityContract?.betaFeatures?.responses_websocket
  if (configuredTransportMode === 'responses_stream') {
    return {
      configuredTransportMode,
      effectiveTransportMode: 'responses_stream',
      transportSelectionReason: 'manual_stream',
    }
  }
  if (configuredTransportMode === 'responses_websocket_experimental') {
    if (qualifiedWebSocket?.supported !== true) {
      return {
        configuredTransportMode,
        effectiveTransportMode: 'responses_stream',
        transportSelectionReason: 'manual_websocket_not_qualified',
        transportSelectionDetail: String(
          qualifiedWebSocket?.reason
          || 'The loaded OpenAI WebSocket runtime is not qualified.',
        ).trim(),
      }
    }
    return {
      configuredTransportMode,
      effectiveTransportMode: 'responses_websocket_experimental',
      transportSelectionReason: 'manual_websocket',
    }
  }

  if (runtimeSettings?.enableBackgroundMode === true) {
    return {
      configuredTransportMode,
      effectiveTransportMode: 'responses_stream',
      transportSelectionReason: 'auto_background_bypass',
    }
  }
  if (modelSupport?.prefersResponsesWebSocket === true) {
    return {
      configuredTransportMode,
      effectiveTransportMode: 'responses_websocket_experimental',
      transportSelectionReason: 'auto_preferred_model',
    }
  }
  return {
    configuredTransportMode,
    effectiveTransportMode: 'responses_stream',
    transportSelectionReason: 'auto_model_not_preferred',
  }
}

function attachOpenAITransportDecisionMeta(payload, {
  configuredTransportMode = '',
  transportSelectionReason = '',
  transportMode = '',
} = {}) {
  const nextPayload = payload && typeof payload === 'object' ? payload : {}
  const providerResponseMeta = nextPayload.providerResponseMeta && typeof nextPayload.providerResponseMeta === 'object'
    ? nextPayload.providerResponseMeta
    : {}
  return {
    ...nextPayload,
    providerResponseMeta: {
      ...providerResponseMeta,
      transportMode: String(transportMode || providerResponseMeta.transportMode || '').trim(),
      configuredTransportMode: String(
        configuredTransportMode
        || providerResponseMeta.configuredTransportMode
        || ''
      ).trim(),
      transportSelectionReason: String(
        transportSelectionReason
        || providerResponseMeta.transportSelectionReason
        || ''
      ).trim(),
    },
  }
}

function normalizeOpenAIChunkPhase(chunkPayload, {
  modelId = '',
  authMethod = 'api_key',
  transportMode = '',
  activityKind = '',
} = {}) {
  const source = chunkPayload && typeof chunkPayload === 'object' && !Array.isArray(chunkPayload)
    ? chunkPayload
    : null
  const chunk = String(
    source?.chunk
    ?? source?.text
    ?? source?.delta
    ?? chunkPayload
    ?? '',
  )
  if (!chunk) return chunkPayload
  const explicitPhase = String(
    source?.phase
    ?? source?.textPhase
    ?? source?.assistantPhase
    ?? '',
  )
  const normalizedPhase = resolveOpenAIAssistantPhase({
    providerId: 'openai',
    modelId,
    phase: explicitPhase,
    authMethod,
    transportMode,
    activityKind,
  })
  return normalizedPhase ? { chunk, phase: normalizedPhase } : chunk
}

function wrapOpenAIChunkHandler(onChunk, phaseOptions = {}) {
  if (typeof onChunk !== 'function') return onChunk
  return (chunkPayload) => {
    onChunk(normalizeOpenAIChunkPhase(chunkPayload, phaseOptions))
  }
}

const openaiProviderAdapter = {
  providerId: 'openai',
  includeRawChunks: true,
  createRawStreamMetaCollector: createOpenAIRawStreamMetaCollector,
  normalizeWarningText: normalizeCallWarningText,
  isIgnorableWarning: isIgnorableOpenAIProviderWarning,
  toStreamChunkError: toOpenAIStreamChunkError,
  extractResponseMeta: extractOpenAIResponseMeta,
  buildModel({ apiKey, modelId }) {
    return createOpenAI({
      apiKey,
      baseURL: resolveOpenAIBaseUrl(),
      fetch: createOpenAIFetchWithServerSideCompactionShim(globalThis.fetch),
    })(modelId)
  },
  buildProviderOptions({ modelId, runtimeSettings, requestContext, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'openai',
      modelId,
      adapterProfile,
    }).buildProviderOptions({ runtimeSettings, requestContext })
  },
  resolveCapabilities({ apiKey, modelId, authMethod = 'api_key', forceRefresh = false, failOnProbeError = false }) {
    return resolveProviderCapabilities({
      providerId: 'openai',
      apiKey,
      modelId,
      authMethod,
      forceRefresh,
      failOnProbeError,
    })
  },
  normalizeMessages({ messages, modelId, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'openai',
      modelId,
      adapterProfile,
    }).normalizeMessages({ messages })
  },
  prepareContinuationMessages({ messages, requestContext }) {
    return prepareOpenAIContinuationMessages(messages, requestContext)
  },
  async prepareBackgroundTurn({
    apiKey,
    modelId,
    originalMessages,
    messages,
    tools,
    activeTools,
    hasTools,
    providerRuntimeSettings,
    requestContext,
    providerOptions,
    onProviderWarning,
  }) {
    return prepareOpenAIBackgroundTurnPayload({
      apiKey,
      modelId,
      originalMessages,
      preparedMessages: messages,
      tools,
      activeTools,
      hasTools,
      providerRuntimeSettings,
      requestContext,
      providerOptions,
      onProviderWarning,
      buildProviderOptions: (payload = {}) => openaiProviderAdapter.buildProviderOptions(payload),
      resolveCapabilities: (payload = {}) => openaiProviderAdapter.resolveCapabilities(payload),
    })
  },
  async createStreamWithTools(args) {
    const options = args?.options && typeof args.options === 'object' ? args.options : {}
    const authContext = options?.openAIExecutionAuthContext && typeof options.openAIExecutionAuthContext === 'object'
      ? options.openAIExecutionAuthContext
      : null
    if (String(authContext?.authMethod || '').trim().toLowerCase() === 'account') {
      return createOpenAIAccountStreamPayload({
        messages: args?.messages,
        options,
        onChunk: args?.onChunk,
        onReasoning: args?.onReasoning,
        onProviderToolStatus: args?.options?.onProviderToolStatus,
        onProviderToolOutput: args?.options?.onProviderToolOutput,
        onProviderToolBoundary: args?.options?.onProviderToolBoundary,
        onContextUsageUpdate: args?.options?.onContextUsageUpdate,
        onCompactionEvent: args?.options?.onCompactionEvent,
        onCollaborationEvent: args?.options?.onCollaborationEvent,
        onProviderWarning: args?.options?.onProviderWarning,
      })
    }
    const requestedModelId = args?.options?.model || args?.modelId
    const runtimeSettings = normalizeOpenAIProviderRuntimeSettings(options.providerRuntimeSettings || {})
    const transportDecision = resolveOpenAITransportDecision({
      modelId: requestedModelId,
      runtimeSettings,
    })
    const allowLegacyFallback = (
      transportDecision.configuredTransportMode === 'responses_auto'
      && runtimeSettings.websocketFallbackToStream !== false
    )
    if (transportDecision.transportSelectionReason === 'manual_websocket_not_qualified') {
      throw createOpenAIWebSocketIneligibleError(
        transportDecision.transportSelectionDetail || 'runtime_not_qualified',
      )
    }
    if (transportDecision.effectiveTransportMode !== 'responses_websocket_experimental') {
      const fallbackPayload = await createOpenAILegacyStreamPayload({
        ...args,
        onChunk: wrapOpenAIChunkHandler(args?.onChunk, {
          modelId: args?.options?.model || args?.modelId,
          authMethod: 'api_key',
          transportMode: 'responses_stream',
          activityKind: 'text-delta',
        }),
        options: {
          ...options,
          providerRuntimeSettings: withOpenAITransportMode(runtimeSettings, 'responses_stream'),
        },
        adapter: openaiProviderAdapter,
      })
      return attachOpenAITransportDecisionMeta(fallbackPayload, {
        configuredTransportMode: transportDecision.configuredTransportMode,
        transportSelectionReason: transportDecision.transportSelectionReason,
        transportMode: 'responses_stream',
      })
    }

    const requestPreparation = prepareOpenAIResponsesWebSocketRequest({
      messages: args?.messages,
      options: {
        ...options,
        providerRuntimeSettings: withOpenAITransportMode(runtimeSettings, 'responses_websocket_experimental'),
      },
    })
    if (!requestPreparation.eligible) {
      const transportSelectionReason = (
        transportDecision.configuredTransportMode === 'responses_auto'
          ? 'auto_ineligible_request_shape'
          : transportDecision.transportSelectionReason
      )
      if (allowLegacyFallback) {
        emitOpenAIWebSocketTransportStatus(options, {
          status: 'bypassed',
          reason: String(requestPreparation.reason || 'unknown_reason'),
        })
        const fallbackPayload = await createOpenAILegacyStreamPayload({
          ...args,
          onChunk: wrapOpenAIChunkHandler(args?.onChunk, {
            modelId: args?.options?.model || args?.modelId,
            authMethod: 'api_key',
            transportMode: 'responses_stream',
            activityKind: 'text-delta',
          }),
          options: {
            ...options,
            providerRuntimeSettings: withOpenAITransportMode(runtimeSettings, 'responses_stream'),
          },
          adapter: openaiProviderAdapter,
        })
        return attachOpenAITransportDecisionMeta({
          ...fallbackPayload,
          providerResponseMeta: {
            ...(fallbackPayload.providerResponseMeta && typeof fallbackPayload.providerResponseMeta === 'object'
              ? fallbackPayload.providerResponseMeta
              : {}),
            websocketBypassReason: String(requestPreparation.reason || 'unknown_reason'),
          },
        }, {
          configuredTransportMode: transportDecision.configuredTransportMode,
          transportSelectionReason,
          transportMode: 'responses_stream',
        })
      }
      throw createOpenAIWebSocketIneligibleError(requestPreparation.reason)
    }

    try {
      const payload = await createExperimentalOpenAIResponsesWebSocketStream({
        ...args,
        onChunk: wrapOpenAIChunkHandler(args?.onChunk, {
          modelId: args?.options?.model || args?.modelId,
          authMethod: 'api_key',
          transportMode: 'responses_websocket_experimental',
          activityKind: 'response.output_text.delta',
        }),
        options: {
          ...options,
          providerRuntimeSettings: withOpenAITransportMode(runtimeSettings, 'responses_websocket_experimental'),
        },
        requestPreparation,
      })
      return attachOpenAITransportDecisionMeta(payload, {
        configuredTransportMode: transportDecision.configuredTransportMode,
        transportSelectionReason: transportDecision.transportSelectionReason,
        transportMode: 'responses_websocket_experimental',
      })
    } catch (error) {
      const recovery = classifyOpenAIWebSocketRecovery({
        error,
        reconnectAttempt: Number(error?.openaiWebSocketReconnectAttempt || 0) || 0,
        fallbackEnabled: allowLegacyFallback,
        abortSignal: options?.abortSignal,
      })
      if (recovery.action === 'fresh_chain_retry') {
        const payload = await createExperimentalOpenAIResponsesWebSocketStream({
          ...args,
          onChunk: wrapOpenAIChunkHandler(args?.onChunk, {
            modelId: args?.options?.model || args?.modelId,
            authMethod: 'api_key',
            transportMode: 'responses_websocket_experimental',
            activityKind: 'response.output_text.delta',
          }),
          options: createOpenAIWebSocketChainResetRetryOptions({
            ...options,
            providerRuntimeSettings: withOpenAITransportMode(runtimeSettings, 'responses_websocket_experimental'),
          }),
          requestPreparation: null,
        })
        return attachOpenAITransportDecisionMeta(payload, {
          configuredTransportMode: transportDecision.configuredTransportMode,
          transportSelectionReason: transportDecision.transportSelectionReason,
          transportMode: 'responses_websocket_experimental',
        })
      }
      if (recovery.action === 'fallback_to_legacy') {
        emitOpenAIWebSocketTransportStatus(options, {
          status: 'fallback',
          attempt: Number(error?.openaiWebSocketReconnectAttempt || 0) || OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
          maxAttempts: Number(error?.openaiWebSocketReconnectMaxAttempts || 0) || OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
          reason: String(error?.openaiWebSocketReconnectReason || recovery.reason || 'transport_fallback'),
        })
        const fallbackPayload = await createOpenAILegacyStreamPayload({
          ...args,
          onChunk: wrapOpenAIChunkHandler(args?.onChunk, {
            modelId: args?.options?.model || args?.modelId,
            authMethod: 'api_key',
            transportMode: 'responses_stream',
            activityKind: 'text-delta',
          }),
          options: {
            ...options,
            providerRuntimeSettings: withOpenAITransportMode(runtimeSettings, 'responses_stream'),
          },
          adapter: openaiProviderAdapter,
        })
        return attachOpenAITransportDecisionMeta({
          ...fallbackPayload,
          providerResponseMeta: {
            ...(fallbackPayload.providerResponseMeta && typeof fallbackPayload.providerResponseMeta === 'object'
              ? fallbackPayload.providerResponseMeta
              : {}),
            websocketReconnectAttempt: Number(error?.openaiWebSocketReconnectAttempt || 0) || OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
            websocketReconnectMaxAttempts: Number(error?.openaiWebSocketReconnectMaxAttempts || 0) || OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
            websocketReconnectReason: String(error?.openaiWebSocketReconnectReason || recovery.reason || ''),
            websocketRecovered: false,
            websocketFallbackAfterReconnectExhausted: error?.openaiWebSocketReconnectExhausted === true,
          },
        }, {
          configuredTransportMode: transportDecision.configuredTransportMode,
          transportSelectionReason: transportDecision.transportSelectionReason,
          transportMode: 'responses_stream',
        })
      }
      throw error
    }
  },
  createInlineCompletion(args) {
    return createSharedInlineCompletion({ ...args, adapter: openaiProviderAdapter })
  },
}

export default openaiProviderAdapter

export function __setOpenAILegacyStreamFactoryForTests(factory = null) {
  openAILegacyStreamFactoryForTests = typeof factory === 'function' ? factory : null
}

export function __resetOpenAILegacyStreamFactoryForTests() {
  openAILegacyStreamFactoryForTests = null
}
