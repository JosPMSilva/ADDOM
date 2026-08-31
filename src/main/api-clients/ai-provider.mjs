/**
 * ai-provider.mjs - facade over provider adapters using Vercel AI SDK v6.
 *
 * Exports:
 *   createStreamWithTools(providerId, apiKey, messages, options, onChunk, onReasoning)
 *   createInlineCompletion(providerId, apiKey, { model, messages, maxOutputTokens, abortSignal })
 *   getProviderManifest({ forceRefresh })
 *   resolveModelCapabilities(providerId, apiKey, modelId, { forceRefresh })
 *   __resetDynamicModelCache() / __testApplyDynamicRemoteModels(entry, options) (tests)
 */

import { normalizeAssistantPhase } from '../../common/chat/assistant-phase.mjs'
import {
  __resetDynamicModelCache,
  __testApplyDynamicRemoteModels,
  getCachedModelCapabilities,
  getProviderManifest as getSharedProviderManifest,
  getProviderModels as getSharedProviderModels,
  markToolsUnsupported,
  resolveProviderCapabilities,
} from './ai-provider-capability-probes.mjs'
import {
  normalizeProviderId,
  resolveProviderAdapter,
} from './ai-provider-adapter-core.mjs'
import {
  extractOpenAIResponseMeta,
  prepareOpenAIBackgroundTurnPayload,
  prepareOpenAIContinuationMessages,
} from './ai-provider-openai-runtime.mjs'
import {
  isNoOutputGeneratedStreamError,
  isToolsUnsupportedError,
  normalizeUsage,
  resolveResultUsage,
  resolveStreamRecoveryAction,
} from './ai-provider-stream-utils.mjs'
import { canonicalizeRequestedModel } from './ai-provider-model-utils.mjs'
import { resolveProviderModelAdapter } from './provider-model-adapters.mjs'
import { flattenUserContentPartsToString, resolveProviderModelTransform } from './provider-model-transform.mjs'

let createStreamWithToolsOverrideForTests = null

function normalizeMessagesForProvider(
  providerId,
  messages = [],
  { modelId = '', adapterProfile = null, preserveUserAttachments = false } = {},
) {
  return resolveProviderModelTransform({
    providerId,
    modelId,
    adapterProfile,
  }).normalizeMessages({ messages, preserveUserAttachments })
}

function buildProviderOptions(providerId, modelId, runtimeSettings = null, requestContext = {}) {
  const adapterProfile = resolveProviderModelAdapter(providerId, modelId)
  const adapter = resolveProviderAdapter(providerId)
  return adapter.buildProviderOptions({
    modelId,
    runtimeSettings,
    requestContext,
    adapterProfile,
  })
}

export { __resetDynamicModelCache, __testApplyDynamicRemoteModels, getCachedModelCapabilities }

export async function getProviderManifest({ forceRefresh = false } = {}) {
  return getSharedProviderManifest({ forceRefresh })
}

export async function getProviderModels({ providerId = '', apiKey = '', forceRefresh = false } = {}) {
  return getSharedProviderModels({ providerId, apiKey, forceRefresh })
}

export async function resolveModelCapabilities(providerId, apiKey, modelId, {
  authMethod = 'api_key',
  forceRefresh = false,
  failOnProbeError = false,
} = {}) {
  const adapter = resolveProviderAdapter(providerId, { allowMissing: true })
  if (!adapter?.resolveCapabilities) {
    return resolveProviderCapabilities({
      providerId,
      apiKey,
      modelId,
      authMethod,
      forceRefresh,
      failOnProbeError,
    })
  }
  return adapter.resolveCapabilities({
    apiKey,
    modelId,
    authMethod,
    forceRefresh,
    failOnProbeError,
  })
}

export async function prepareOpenAIBackgroundTurn(providerId, apiKey, messages, options = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  if (normalizedProviderId !== 'openai') {
    return {
      eligible: false,
      reason: 'not_openai',
      messages: Array.isArray(messages) ? messages : [],
      modelId: canonicalizeRequestedModel(providerId, options?.model).effectiveModelId,
      openaiOptions: null,
    }
  }

  const adapter = resolveProviderAdapter('openai')
  const payload = await prepareOpenAIBackgroundTurnPayload({
    apiKey,
    modelId: options?.model,
    originalMessages: Array.isArray(messages) ? messages : [],
    tools: options?.tools,
    providerRuntimeSettings: options?.providerRuntimeSettings,
    requestContext: options?.requestContext,
    buildProviderOptions: (args = {}) => adapter.buildProviderOptions({
      ...args,
      adapterProfile: resolveProviderModelAdapter('openai', args.modelId),
    }),
    resolveCapabilities: (args = {}) => adapter.resolveCapabilities(args),
  })

  return {
    eligible: payload.eligible === true,
    reason: String(payload.reason || '').trim(),
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    modelId: String(payload.modelId || '').trim(),
    openaiOptions: payload.openaiOptions || null,
  }
}

export async function createStreamWithTools(providerId, apiKey, messages, options, onChunk, onReasoning) {
  if (typeof createStreamWithToolsOverrideForTests === 'function') {
    return createStreamWithToolsOverrideForTests(providerId, apiKey, messages, options, onChunk, onReasoning)
  }
  const adapter = resolveProviderAdapter(providerId)
  return adapter.createStreamWithTools({
    providerId,
    apiKey,
    messages,
    options,
    onChunk,
    onReasoning,
  })
}

export async function createInlineCompletion(providerId, apiKey, options = {}) {
  const adapter = resolveProviderAdapter(providerId)
  return adapter.createInlineCompletion({
    providerId,
    apiKey,
    options,
  })
}

export const __testAiProviderInternals = Object.freeze({
  buildProviderOptions,
  buildAssistantHistoryParts,
  extractOpenAIResponseMeta,
  flattenUserContentPartsToString,
  normalizeMessagesForProvider,
  prepareOpenAIContinuationMessages,
  normalizeUsage,
  resolveResultUsage,
  isToolsUnsupportedError,
  isNoOutputGeneratedStreamError,
  markToolsUnsupported,
  resolveStreamRecoveryAction,
})

export function shouldIncludeReasoningPartInAssistantToolHistory(providerId = '') {
  const normalizedProviderId = normalizeProviderId(providerId)
  return normalizedProviderId !== 'openai' && normalizedProviderId !== 'anthropic'
}

export function buildAssistantHistoryParts(text, {
  reasoningText = '',
  includeReasoningPart = true,
  providerReasoningParts = [],
} = {}) {
  const content = []
  const normalizedProviderReasoningParts = Array.isArray(providerReasoningParts)
    ? providerReasoningParts.filter((part) => (
      part
      && typeof part === 'object'
      && String(part.type || '').trim().toLowerCase() === 'reasoning'
    ))
    : []
  if (normalizedProviderReasoningParts.length > 0) {
    content.push(...normalizedProviderReasoningParts)
  } else if (includeReasoningPart && reasoningText) {
    content.push({ type: 'reasoning', text: reasoningText })
  }
  if (text) content.push({ type: 'text', text })
  return content
}

export function buildAssistantToolUseMessage(text, toolCalls, {
  reasoningText = '',
  phase = '',
  includeReasoningPart = true,
  providerReasoningParts = [],
} = {}) {
  const content = buildAssistantHistoryParts(text, {
    reasoningText,
    includeReasoningPart,
    providerReasoningParts,
  })
  const assistantPhase = normalizeAssistantPhase(phase)

  for (const toolCall of toolCalls) {
    content.push({
      type: 'tool-call',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      input: toolCall.input ?? {},
    })
  }

  return {
    role: 'assistant',
    ...(assistantPhase ? { phase: assistantPhase } : {}),
    content,
  }
}

export function buildToolResultMessage(toolCallId, toolName, result, isError, metadata = {}) {
  const output = isError
    ? { type: 'error-text', value: String(result ?? '') }
    : (typeof result === 'string'
      ? { type: 'text', value: result }
      : { type: 'json', value: result ?? null })
  const normalizedMetadata = metadata && typeof metadata === 'object' ? metadata : {}

  return {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId,
      toolName,
      output,
      ...normalizedMetadata,
    }],
  }
}

export function __setCreateStreamWithToolsForTests(fn = null) {
  createStreamWithToolsOverrideForTests = typeof fn === 'function' ? fn : null
}

export function __resetCreateStreamWithToolsForTests() {
  createStreamWithToolsOverrideForTests = null
}
