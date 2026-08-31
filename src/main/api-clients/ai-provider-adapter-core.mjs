import { streamText } from 'ai'
import {
  PROVIDER_POLICY,
  buildTimeoutSignal,
  combineSignals,
  createProgressTimeoutMonitor,
  createProviderStreamStaleError,
  isRetryableProviderError,
  withRetry,
} from './provider-policy.mjs'
import { canonicalizeRequestedModel } from './ai-provider-model-utils.mjs'
import { resolveProviderModelAdapter } from './provider-model-adapters.mjs'
import {
  appendReasoningClassificationSample,
  buildStructuredTextChunkPayload,
  createReasoningClassificationDebugState,
  createStreamEventCollector,
  defaultNormalizeWarningText,
  emitReasoningClassificationDebug,
  hasResponseMeta,
  normalizeProviderId,
  resolveAssistantPhaseFromChunk,
  shouldRouteTextDeltaToReasoning,
} from './ai-provider-adapter-stream-helpers.mjs'
import {
  resolveInterleavedReasoningReplayTarget,
  resolveProviderModelTransform,
} from './provider-model-transform.mjs'
import {
  extractReasoningTextFromParts,
  isNoOutputGeneratedStreamError,
  resolveResultUsage,
  resolveStreamRecoveryAction,
} from './ai-provider-stream-utils.mjs'
import { normalizeProviderBudgetObservation } from './provider-budget-observation.mjs'
import { upsertProviderBudgetObservation } from './provider-budget-store.mjs'
import { resolveContinuationRequestContext } from './continuation-request-context.mjs'
import {
  canExecuteResolvedToolSurface,
  markToolsUnsupported,
} from './ai-provider-capability-probes.mjs'
import openaiProviderAdapter from './ai-provider-openai.mjs'
import moonshotProviderAdapter from './ai-provider-moonshot.mjs'
import anthropicProviderAdapter from './ai-provider-anthropic.mjs'
import geminiProviderAdapter from './ai-provider-gemini.mjs'
import grokProviderAdapter from './ai-provider-grok.mjs'
import groqProviderAdapter from './ai-provider-groq.mjs'
import mistralProviderAdapter from './ai-provider-mistral.mjs'
import deepseekProviderAdapter from './ai-provider-deepseek.mjs'
import perplexityProviderAdapter from './ai-provider-perplexity.mjs'
import openrouterProviderAdapter from './ai-provider-openrouter.mjs'
import ollamaProviderAdapter from './ai-provider-ollama.mjs'
import lmstudioProviderAdapter from './ai-provider-lmstudio.mjs'

const PROVIDER_ADAPTERS = Object.freeze({
  openai: openaiProviderAdapter,
  moonshot: moonshotProviderAdapter,
  anthropic: anthropicProviderAdapter,
  gemini: geminiProviderAdapter,
  grok: grokProviderAdapter,
  groq: groqProviderAdapter,
  mistral: mistralProviderAdapter,
  deepseek: deepseekProviderAdapter,
  perplexity: perplexityProviderAdapter,
  openrouter: openrouterProviderAdapter,
  ollama: ollamaProviderAdapter,
  lmstudio: lmstudioProviderAdapter,
})

let streamTextImplForTests = null

function resolveStreamTextImpl() {
  return typeof streamTextImplForTests === 'function' ? streamTextImplForTests : streamText
}
export { normalizeProviderId }

export function resolveProviderAdapter(providerId = '', { allowMissing = false } = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const adapter = PROVIDER_ADAPTERS[normalizedProviderId]
  if (adapter) return adapter
  if (allowMissing) return null
  throw new Error(`Unknown provider: ${providerId}`)
}

export function createIneligibleBackgroundTurnPayload({ messages = [], modelId = '', reason = 'not_openai' } = {}) {
  return {
    eligible: false,
    reason,
    messages: Array.isArray(messages) ? messages : [],
    modelId: String(modelId || '').trim(),
    openaiOptions: null,
    warning: null,
    execute: null,
  }
}


function persistProviderBudgetObservation({
  providerId = '',
  apiKey = '',
  modelId = '',
  observationSource = 'success_response',
  headers = null,
  error = null,
  observedAt = Date.now(),
} = {}) {
  const observation = normalizeProviderBudgetObservation({
    providerId,
    apiKey,
    modelId,
    observationSource,
    headers,
    error,
    observedAt,
  })
  if (!observation) return null

  try {
    return upsertProviderBudgetObservation(observation)
  } catch (persistError) {
    console.warn('[provider-budget-observation]', {
      providerId: normalizeProviderId(providerId),
      modelId: String(modelId || '').trim(),
      observationSource,
      error: String(persistError?.message || persistError || '').trim(),
    })
    return null
  }
}

export async function createSharedStreamWithTools({
  adapter,
  providerId,
  apiKey,
  messages,
  options = {},
  onChunk = () => {},
  onReasoning = null,
} = {}) {
  const {
    model: modelId,
    tools = {},
    resolvedModelCapabilities = null,
    maxOutputTokens = null,
    abortSignal,
    streamTimeoutMs = 0,
    streamIdleTimeoutMs,
    providerRuntimeSettings = null,
    requestContext = {},
    onSource = null,
    onProviderToolStatus = null,
    onProviderToolOutput = null,
    onProviderWarning = null,
    onProviderResponseMeta = null,
  } = options

  const canonicalModel = canonicalizeRequestedModel(providerId, modelId)
  const effectiveModelId = canonicalModel.effectiveModelId
  const resolvedAdapterProfile = resolveProviderModelAdapter(providerId, effectiveModelId)
  const providerTransform = resolveProviderModelTransform({
    providerId,
    modelId: effectiveModelId,
    adapterProfile: resolvedAdapterProfile,
  })
  const requestedMessages = Array.isArray(messages) ? messages : []
  const continuationPrep = await Promise.resolve(adapter.prepareContinuationMessages({
    messages: requestedMessages,
    requestContext,
    modelId: effectiveModelId,
    adapterProfile: resolvedAdapterProfile,
  }))
  const continuationMessages = Array.isArray(continuationPrep?.messages)
    ? continuationPrep.messages
    : requestedMessages
  const normalizedRequestContext = resolveContinuationRequestContext(requestContext, continuationPrep)
  const rawRequestedTools = tools && typeof tools === 'object' ? tools : {}
  const requestedTools = typeof adapter.normalizeTools === 'function'
    ? (adapter.normalizeTools({
      tools: rawRequestedTools,
      modelId: effectiveModelId,
      adapterProfile: resolvedAdapterProfile,
    }) || rawRequestedTools)
    : rawRequestedTools
  const requestedToolNames = Object.keys(requestedTools)
  const reasoningClassificationDebug = createReasoningClassificationDebugState(providerId, effectiveModelId)

  const providerModel = adapter.buildModel({
    apiKey,
    modelId: effectiveModelId,
    runtimeSettings: providerRuntimeSettings,
    requestContext: normalizedRequestContext,
  })

  const requestConfig = providerTransform.resolveInvocationConfig({
    runtimeSettings: providerRuntimeSettings,
    requestContext: {
      ...normalizedRequestContext,
      messages: requestedMessages,
      toolNames: requestedToolNames,
    },
    requestedMaxOutputTokens: maxOutputTokens,
  })
  const providerOptions = requestConfig.providerOptions

  let activeTools = requestedTools
  let hasTools = requestedToolNames.length > 0
  let activeProviderOptions = providerOptions
  const routeTextDeltasToReasoning = shouldRouteTextDeltaToReasoning(
    resolveInterleavedReasoningReplayTarget(providerTransform?.registryModel?.capabilities?.interleavedReasoning),
    onReasoning,
  )

  if (hasTools) {
    const hasPreResolvedCapabilityDecision = (
      resolvedModelCapabilities
      && typeof resolvedModelCapabilities === 'object'
      && typeof resolvedModelCapabilities.supportsTools === 'boolean'
    )
    if (hasPreResolvedCapabilityDecision && !canExecuteResolvedToolSurface(resolvedModelCapabilities)) {
      activeTools = {}
      hasTools = false
    } else if (!hasPreResolvedCapabilityDecision) {
      const capabilities = await adapter.resolveCapabilities({
        apiKey,
        modelId: effectiveModelId,
        forceRefresh: false,
        failOnProbeError: true,
      })
      if (!canExecuteResolvedToolSurface(capabilities)) {
        activeTools = {}
        hasTools = false
      }
    }
  }

  const backgroundTurn = await Promise.resolve(adapter.prepareBackgroundTurn({
    providerId,
    apiKey,
    modelId: effectiveModelId,
    originalMessages: requestedMessages,
    messages: continuationMessages,
    tools: requestedTools,
    activeTools,
    hasTools,
    providerRuntimeSettings,
    requestContext: normalizedRequestContext,
    providerOptions: activeProviderOptions,
    adapterProfile: resolvedAdapterProfile,
    onProviderWarning,
  }))

  if (backgroundTurn?.warning && typeof onProviderWarning === 'function') {
    onProviderWarning(backgroundTurn.warning)
  }

  if (backgroundTurn?.eligible === true && typeof backgroundTurn.execute === 'function') {
    const backgroundPayload = await backgroundTurn.execute({ abortSignal })
    if (backgroundPayload.reasoning && typeof onReasoning === 'function') {
      const reasoning = String(backgroundPayload.reasoning || '')
      if (reasoning.trim()) onReasoning(reasoning)
    }
    if (backgroundPayload.text) {
      onChunk(buildStructuredTextChunkPayload(
        backgroundPayload.text,
        backgroundPayload.phase,
      ) || backgroundPayload.text)
    }
    if (typeof onProviderResponseMeta === 'function' && backgroundPayload.providerResponseMeta) {
      onProviderResponseMeta(backgroundPayload.providerResponseMeta)
    }
    return {
      stopReason: backgroundPayload.stopReason,
      text: backgroundPayload.text ?? '',
      reasoning: backgroundPayload.reasoning ?? '',
      usage: backgroundPayload.usage ?? null,
      toolCalls: [],
      sources: [],
      providerToolOutputs: [],
      providerToolStatuses: [],
      providerResponseMeta: backgroundPayload.providerResponseMeta || null,
    }
  }

  let emittedAnyChunk = false
  const resolvedStreamTimeoutMs = Number.isFinite(Number(streamTimeoutMs)) && Number(streamTimeoutMs) > 0
    ? Number(streamTimeoutMs)
    : 0
  const requestedStreamIdleTimeoutMs = Number(streamIdleTimeoutMs)
  const defaultStreamIdleTimeoutMs = Number(PROVIDER_POLICY.stream.idleTimeoutMs || 0)
  const resolvedStreamIdleTimeoutMs = Number.isFinite(requestedStreamIdleTimeoutMs)
    ? (
      requestedStreamIdleTimeoutMs > 0
        ? (resolvedStreamTimeoutMs > 0
            ? Math.min(requestedStreamIdleTimeoutMs, resolvedStreamTimeoutMs)
            : requestedStreamIdleTimeoutMs)
        : 0
    )
    : (
      defaultStreamIdleTimeoutMs > 0
        ? (resolvedStreamTimeoutMs > 0
            ? Math.min(defaultStreamIdleTimeoutMs, resolvedStreamTimeoutMs)
            : defaultStreamIdleTimeoutMs)
        : 0
    )
  const eventCollector = createStreamEventCollector({
    onSource,
    onProviderToolStatus,
    onProviderToolOutput,
  })
  const preparedMessages = adapter.normalizeMessages({
    messages: continuationMessages,
    modelId: effectiveModelId,
    adapterProfile: resolvedAdapterProfile,
  })

  const runStreamAttempt = async () => {
    let streamChunkError = null
    const rawStreamMetaCollector = typeof adapter.createRawStreamMetaCollector === 'function'
      ? adapter.createRawStreamMetaCollector({
        modelId: effectiveModelId,
        requestContext: normalizedRequestContext,
        adapterProfile: resolvedAdapterProfile,
      })
      : null
    const staleMonitor = createProgressTimeoutMonitor({
      timeoutMs: resolvedStreamIdleTimeoutMs,
      buildError: () => createProviderStreamStaleError({
        providerId,
        timeoutMs: resolvedStreamIdleTimeoutMs,
      }),
    })
    try {
        staleMonitor.markProgress()
        const result = await resolveStreamTextImpl()({
          model: providerModel,
          messages: preparedMessages,
          maxRetries: 0,
          ...(hasTools ? { tools: activeTools, maxSteps: 1 } : {}),
          ...(Number.isFinite(requestConfig.maxOutputTokens) ? { maxOutputTokens: requestConfig.maxOutputTokens } : {}),
          ...(activeProviderOptions ? { providerOptions: activeProviderOptions } : {}),
          ...(adapter.includeRawChunks === true ? { includeRawChunks: true } : {}),
          abortSignal: combineSignals(
            buildTimeoutSignal(resolvedStreamTimeoutMs, abortSignal),
            staleMonitor.signal,
          ),
          onChunk({ chunk }) {
            if (chunk?.type === 'raw') {
              rawStreamMetaCollector?.handleRawChunk?.(chunk.rawValue)
              if (typeof adapter.toStreamChunkError === 'function') {
                const providerChunkError = adapter.toStreamChunkError(chunk.rawValue, effectiveModelId)
                if (providerChunkError) {
                  streamChunkError = providerChunkError
                }
              }
              if (
                typeof adapter.extractReasoningFromRawChunk === 'function'
                && typeof onReasoning === 'function'
              ) {
                const reasoningDelta = String(
                  adapter.extractReasoningFromRawChunk(chunk.rawValue) || '',
                )
                if (reasoningDelta) {
                  emittedAnyChunk = true
                  staleMonitor.markProgress()
                  appendReasoningClassificationSample(reasoningClassificationDebug, 'reasoning', reasoningDelta)
                  onReasoning(reasoningDelta, { boundaryBefore: true })
                }
              }
              return
            }
            if (chunk?.type === 'text-delta') {
              const delta = chunk.delta ?? chunk.text ?? ''
              if (!String(delta)) return
              emittedAnyChunk = true
              staleMonitor.markProgress()
              const phase = resolveAssistantPhaseFromChunk(chunk)
              if (routeTextDeltasToReasoning) {
                appendReasoningClassificationSample(reasoningClassificationDebug, 'reasoning', delta)
                onReasoning(delta)
                return
              }
              appendReasoningClassificationSample(reasoningClassificationDebug, 'text', delta)
              onChunk(buildStructuredTextChunkPayload(delta, phase) || delta)
              return
            }
            if (chunk?.type === 'reasoning-delta') {
              const delta = chunk.delta ?? chunk.text ?? ''
              if (!String(delta)) return
              emittedAnyChunk = true
              staleMonitor.markProgress()
              appendReasoningClassificationSample(reasoningClassificationDebug, 'reasoning', delta)
              if (typeof onReasoning === 'function') {
                onReasoning(delta)
              }
              return
            }
            if (eventCollector.handleChunk(chunk)) {
              emittedAnyChunk = true
              staleMonitor.markProgress()
            }
          },
        })

        let text
        let reasoningText
        let reasoningParts
        let toolCalls
        let finishReason
        let usage
        let providerMetadata
        let response
        let warnings
        try {
          [text, reasoningText, reasoningParts, toolCalls, finishReason, usage, providerMetadata, response, warnings] = await Promise.all([
            result.text,
            result.reasoningText,
            result.reasoning,
            result.toolCalls,
            result.finishReason,
            resolveResultUsage(result),
            result.providerMetadata,
            result.response,
            result.warnings,
          ])
        } catch (error) {
          if (staleMonitor.timedOut()) {
            throw staleMonitor.error() || error
          }
          if (streamChunkError && isNoOutputGeneratedStreamError(error)) {
            throw streamChunkError
          }
          throw error
        }

        const resolvedReasoningText = String(reasoningText ?? '').trim()
          || extractReasoningTextFromParts(reasoningParts)
        emitReasoningClassificationDebug(reasoningClassificationDebug, {
          providerId,
          modelId: effectiveModelId,
          resolvedReasoningText,
        })

        if (streamChunkError) {
          throw streamChunkError
        }

        const responseMeta = typeof adapter.extractResponseMeta === 'function'
          ? adapter.extractResponseMeta(
            providerMetadata,
            response,
            effectiveModelId,
            rawStreamMetaCollector?.buildMeta?.() || null,
          )
          : null
        persistProviderBudgetObservation({
          providerId,
          apiKey,
          modelId: effectiveModelId,
          observationSource: 'success_response',
          headers: response?.headers,
          observedAt: response?.timestamp instanceof Date ? response.timestamp.getTime() : Date.now(),
        })
        const providerReasoningParts = typeof adapter.extractReasoningHistoryParts === 'function'
          ? adapter.extractReasoningHistoryParts(
            reasoningParts,
            providerMetadata,
            response,
            effectiveModelId,
          )
          : []
        if (typeof onProviderResponseMeta === 'function' && hasResponseMeta(responseMeta)) {
          onProviderResponseMeta(responseMeta)
        }

        if (Array.isArray(warnings) && typeof onProviderWarning === 'function') {
          for (const warning of warnings) {
            const textValue = typeof adapter.normalizeWarningText === 'function'
              ? adapter.normalizeWarningText(warning)
              : defaultNormalizeWarningText(warning)
            if (!textValue) continue
            if (typeof adapter.isIgnorableWarning === 'function' && adapter.isIgnorableWarning(textValue, warning)) {
              continue
            }
            onProviderWarning({
              type: 'warning',
              text: textValue,
              meta: {
                providerId,
                modelId: effectiveModelId,
                warning,
              },
            })
          }
        }

        return {
          text,
          reasoningText: resolvedReasoningText,
          toolCalls,
          finishReason,
          usage,
          sources: eventCollector.sources,
          providerToolOutputs: eventCollector.providerToolOutputs,
          providerToolStatuses: eventCollector.providerToolStatuses,
          providerResponseMeta: responseMeta,
          providerReasoningParts,
        }
    } finally {
      staleMonitor.dispose()
    }
  }

  const streamRetryOptions = {
    retries: PROVIDER_POLICY.stream.retries,
    baseDelayMs: PROVIDER_POLICY.stream.baseDelayMs,
    maxDelayMs: PROVIDER_POLICY.stream.maxDelayMs,
    retryableFn: (err) => (
      !emittedAnyChunk
      && !abortSignal?.aborted
      && String(err?.name ?? '').toLowerCase() !== 'aborterror'
      && String(err?.code ?? '').toUpperCase() !== 'ABORT_ERR'
      && isRetryableProviderError(err)
    ),
  }

  const runObservedStreamAttempt = async (attemptState = {}) => {
    try {
      return await runStreamAttempt(attemptState)
    } catch (err) {
      if (isRetryableProviderError(err)) {
        persistProviderBudgetObservation({
          providerId,
          apiKey,
          modelId: effectiveModelId,
          observationSource: 'rate_limit_error',
          error: err,
        })
      }
      throw err
    }
  }

  let streamPayload
  try {
    streamPayload = await withRetry(runObservedStreamAttempt, streamRetryOptions)
  } catch (err) {
    const recoveryAction = resolveStreamRecoveryAction({
      providerId,
      effectiveModelId,
      hasTools,
      activeProviderOptions,
      err,
    })
    if (recoveryAction === 'minimal_ollama_alias_retry') {
      if (hasTools) {
        markToolsUnsupported(providerId, effectiveModelId, err)
      }
      activeTools = {}
      hasTools = false
      activeProviderOptions = undefined
      emittedAnyChunk = false
      streamPayload = await withRetry(runObservedStreamAttempt, streamRetryOptions)
    } else {
      throw err
    }
  }

  return {
    stopReason: streamPayload.finishReason,
    text: streamPayload.text ?? '',
    reasoning: streamPayload.reasoningText ?? '',
    usage: streamPayload.usage ?? null,
    toolCalls: (streamPayload.toolCalls || []).map((toolCall) => ({
      id: toolCall.toolCallId,
      name: toolCall.toolName,
      input: toolCall.input ?? {},
    })),
    sources: Array.isArray(streamPayload.sources) ? streamPayload.sources : [],
    providerToolOutputs: Array.isArray(streamPayload.providerToolOutputs) ? streamPayload.providerToolOutputs : [],
    providerToolStatuses: Array.isArray(streamPayload.providerToolStatuses) ? streamPayload.providerToolStatuses : [],
    providerResponseMeta: streamPayload.providerResponseMeta && typeof streamPayload.providerResponseMeta === 'object'
      ? streamPayload.providerResponseMeta
      : null,
    providerReasoningParts: Array.isArray(streamPayload.providerReasoningParts)
      ? streamPayload.providerReasoningParts
      : [],
  }
}

export async function createSharedInlineCompletion({
  adapter,
  providerId,
  apiKey,
  options = {},
} = {}) {
  const {
    model: modelId,
    messages = [],
    maxOutputTokens = 160,
    abortSignal = null,
    providerRuntimeSettings = null,
    requestContext = {},
  } = options

  const canonicalModel = canonicalizeRequestedModel(providerId, modelId)
  const effectiveModelId = canonicalModel.effectiveModelId
  const resolvedAdapterProfile = resolveProviderModelAdapter(providerId, effectiveModelId)
  const providerTransform = resolveProviderModelTransform({
    providerId,
    modelId: effectiveModelId,
    adapterProfile: resolvedAdapterProfile,
  })
  const providerModel = adapter.buildModel({
    apiKey,
    modelId: effectiveModelId,
    runtimeSettings: providerRuntimeSettings,
    requestContext,
  })
  const promptMessages = adapter.normalizeMessages({
    messages: Array.isArray(messages) ? messages : [],
    modelId: effectiveModelId,
    adapterProfile: resolvedAdapterProfile,
  })
  const requestedInlineMaxOutputTokens = Math.max(32, Number(maxOutputTokens || 160) || 160)
  const requestConfig = providerTransform.resolveInvocationConfig({
    runtimeSettings: providerRuntimeSettings,
    requestContext: {
      ...(requestContext && typeof requestContext === 'object' ? requestContext : {}),
      messages,
      toolNames: [],
    },
    requestedMaxOutputTokens: requestedInlineMaxOutputTokens,
  })
  const providerOptions = requestConfig.providerOptions
  const safeMaxOutputTokens = Number.isFinite(requestConfig.maxOutputTokens)
    ? requestConfig.maxOutputTokens
    : requestedInlineMaxOutputTokens

  let emittedAnyChunk = false

  const runStreamAttempt = async () => {
    const result = await resolveStreamTextImpl()({
      model: providerModel,
      messages: promptMessages,
      maxRetries: 0,
      maxOutputTokens: safeMaxOutputTokens,
      ...(providerOptions ? { providerOptions } : {}),
      abortSignal: buildTimeoutSignal(PROVIDER_POLICY.stream.timeoutMs, abortSignal),
      onChunk({ chunk }) {
        if (chunk?.type === 'text-delta') emittedAnyChunk = true
      },
    })

    const [text, usage, response] = await Promise.all([
      result.text,
      resolveResultUsage(result),
      result.response,
    ])

    persistProviderBudgetObservation({
      providerId,
      apiKey,
      modelId: effectiveModelId,
      observationSource: 'success_response',
      headers: response?.headers,
      observedAt: response?.timestamp instanceof Date ? response.timestamp.getTime() : Date.now(),
    })

    return {
      text: String(text ?? ''),
      usage: usage ?? null,
      model: effectiveModelId,
      providerId: String(providerId || ''),
    }
  }

  const runObservedStreamAttempt = async (attemptState = {}) => {
    try {
      return await runStreamAttempt(attemptState)
    } catch (err) {
      if (isRetryableProviderError(err)) {
        persistProviderBudgetObservation({
          providerId,
          apiKey,
          modelId: effectiveModelId,
          observationSource: 'rate_limit_error',
          error: err,
        })
      }
      throw err
    }
  }

  return withRetry(runObservedStreamAttempt, {
    retries: PROVIDER_POLICY.stream.retries,
    baseDelayMs: PROVIDER_POLICY.stream.baseDelayMs,
    maxDelayMs: PROVIDER_POLICY.stream.maxDelayMs,
    retryableFn: (err) => (
      !emittedAnyChunk
      && !abortSignal?.aborted
      && String(err?.name ?? '').toLowerCase() !== 'aborterror'
      && String(err?.code ?? '').toUpperCase() !== 'ABORT_ERR'
      && isRetryableProviderError(err)
    ),
  })
}

export function __setSharedStreamTextForTests(fn = null) {
  streamTextImplForTests = typeof fn === 'function' ? fn : null
}

export function __resetSharedStreamTextForTests() {
  streamTextImplForTests = null
}
