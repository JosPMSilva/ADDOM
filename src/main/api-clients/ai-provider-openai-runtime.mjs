import crypto from 'node:crypto'
import { canonicalizeRequestedModel } from './ai-provider-model-utils.mjs'
import { canExecuteResolvedToolSurface } from './ai-provider-capability-probes.mjs'
import { normalizeUsage } from './ai-provider-stream-utils.mjs'
import { createOpenAIBackgroundResponse, resolveOpenAIBackgroundModeEligibility } from './openai-background-runtime.mjs'
import { resolveModelContextLimit } from './model-context-limits.mjs'
import {
  normalizeProviderProcessingMode,
  resolveProviderProcessingMode,
} from '../../common/api-clients/provider-processing-mode.mjs'
import { resolveProviderModelAdapter } from './provider-model-adapters.mjs'
import { normalizeOpenAIProviderRuntimeSettings } from './openai-runtime-types.mjs'
import {
  buildOpenAIServerSideCompactionResponseMeta,
  createOpenAIServerSideCompactionStreamCollector,
  injectOpenAIServerSideCompactionMetadata,
  resolveOpenAIServerSideCompactionPolicy,
} from './openai-server-side-compaction.mjs'
import { resolveOpenAIExecutionAuth } from '../openai-account/openai-execution-auth.mjs'

function toStringSafe(value) {
  return String(value ?? '').trim()
}

function resolveOpenAIBackgroundAuthMethod(apiKey = '') {
  const auth = resolveOpenAIExecutionAuth({ apiKey, allowAccountRuntime: true })
  return String(auth?.authMethod || '').trim().toLowerCase() === 'account'
    ? 'account'
    : 'api_key'
}

function supportsOpenAIResponsesControls(adapterProfile = {}) {
  return String(adapterProfile?.optionFamily || '').trim().toLowerCase() === 'openai_responses'
}

function flattenContentForHash(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')
  return content.map((part) => {
    if (!part || typeof part !== 'object') return String(part ?? '')
    if (typeof part.text === 'string') return part.text
    try {
      return JSON.stringify(part)
    } catch {
      return String(part ?? '')
    }
  }).join('\n')
}

function hashPromptCacheParts(parts = []) {
  const hash = crypto.createHash('sha256')
  for (const part of parts) {
    hash.update(String(part || ''))
    hash.update('\n')
  }
  return hash.digest('hex').slice(0, 16)
}

function resolveModelFamily(modelId = '') {
  const lower = String(modelId || '').trim().toLowerCase()
  if (lower.startsWith('gpt-5.5')) return 'gpt-5.5'
  if (lower.startsWith('gpt-5.4')) return 'gpt-5.4'
  if (lower.startsWith('gpt-5.3-codex')) return 'gpt-5.3-codex'
  if (lower.startsWith('gpt-5.2')) return 'gpt-5.2'
  if (lower.startsWith('gpt-5.1')) return 'gpt-5.1'
  if (lower.startsWith('gpt-5')) return 'gpt-5'
  if (lower.startsWith('gpt-4.1')) return 'gpt-4.1'
  if (lower.startsWith('gpt-4o')) return 'gpt-4o'
  if (lower.startsWith('o4')) return 'o4'
  if (lower.startsWith('o3')) return 'o3'
  if (lower.startsWith('o1')) return 'o1'
  return lower || 'model'
}

function usesImplicitPromptCacheRetention(modelId = '') {
  return String(modelId || '')
    .trim()
    .toLowerCase()
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .startsWith('gpt-5.6-')
}

function normalizePromptCacheSegment(value = '', fallback = 'segment') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function resolveOpenAIPromptCacheModelSegment(modelId = '') {
  const family = normalizePromptCacheSegment(resolveModelFamily(modelId), 'model')
  if (family.length <= 16) return family
  return `m-${hashPromptCacheParts([family]).slice(0, 13)}`
}

function resolveOpenAIPromptCacheScopeHash(scopeId = '', fallback = 'global') {
  const normalizedScopeId = String(scopeId || '').trim() || fallback
  return hashPromptCacheParts([normalizedScopeId]).slice(0, 8)
}

export function buildOpenAIPromptCacheKey({
  modelId = '',
  projectId = '',
  threadId = '',
  messages = [],
  toolNames = [],
} = {}) {
  const stableMessagePrefix = []
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = String(message?.role || '').trim().toLowerCase()
    if (role !== 'system' && role !== 'developer') continue
    const content = flattenContentForHash(message?.content)
    if (!content) continue
    stableMessagePrefix.push(`${role}:${content}`)
  }
  const normalizedToolNames = Array.isArray(toolNames)
    ? toolNames.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).sort()
    : []
  const modelSegment = resolveOpenAIPromptCacheModelSegment(modelId)
  const projectScopeHash = resolveOpenAIPromptCacheScopeHash(projectId, 'global')
  const threadScopeHash = resolveOpenAIPromptCacheScopeHash(threadId, 'session')
  const contentHash = hashPromptCacheParts([
    resolveModelFamily(modelId),
    String(projectId || '').trim() || 'global',
    String(threadId || '').trim() || 'session',
    ...stableMessagePrefix,
    ...normalizedToolNames,
  ])
  return [
    'addom',
    'openai',
    modelSegment,
    projectScopeHash,
    threadScopeHash,
    contentHash,
  ].join(':')
}

export function buildOpenAIProviderOptions({
  modelId,
  runtimeSettings = null,
  requestContext = {},
  adapterProfile = {},
} = {}) {
  const settings = normalizeOpenAIProviderRuntimeSettings(runtimeSettings || {})
  const modelSupport = adapterProfile.openaiRuntimeSupport
  const openAIRequestContext = requestContext?.openai && typeof requestContext.openai === 'object'
    ? requestContext.openai
    : {}
  const requestedToolNames = Array.isArray(requestContext?.toolNames)
    ? requestContext.toolNames.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : []
  const include = []
  if (String(adapterProfile?.toolFamily || '').trim().toLowerCase() === 'openai_hosted' && requestedToolNames.includes('file_search')) {
    include.push('file_search_call.results')
  }

  const openaiOptions = {
    store: openAIRequestContext.store === true,
  }
  const supportsResponsesControls = supportsOpenAIResponsesControls(adapterProfile)
  const modelContext = resolveModelContextLimit('openai', modelId)
  const hasExplicitProcessingMode = Object.prototype.hasOwnProperty.call(
    requestContext || {},
    'processingMode',
  )

  if (
    supportsResponsesControls
    && modelSupport?.supportsReasoningSummary
    && settings.reasoningSummary !== 'none'
  ) {
    openaiOptions.reasoningSummary = settings.reasoningSummary
  }

  if (
    supportsResponsesControls
    && settings.reasoningEffort !== 'provider_default'
    && modelSupport?.reasoningEffortOptions?.includes(settings.reasoningEffort)
  ) {
    openaiOptions.reasoningEffort = settings.reasoningEffort
  }

  if (
    supportsResponsesControls
    && settings.textVerbosity !== 'provider_default'
    && modelSupport?.supportsTextVerbosity
  ) {
    openaiOptions.textVerbosity = settings.textVerbosity
  }

  if (supportsResponsesControls && hasExplicitProcessingMode) {
    const requestedProcessingMode = normalizeProviderProcessingMode(requestContext.processingMode)
    const processing = resolveProviderProcessingMode({
      providerId: 'openai',
      modelId,
      authMethod: 'api_key',
      providerConfigured: true,
      requestedMode: requestedProcessingMode,
    })
    if (requestedProcessingMode === 'standard') {
      openaiOptions.serviceTier = 'default'
    } else if (processing.request?.serviceTier) {
      openaiOptions.serviceTier = processing.request.serviceTier
    }
  } else if (!hasExplicitProcessingMode) {
    if (
      supportsResponsesControls
      && settings.serviceTier === 'flex'
      && modelSupport?.supportsServiceTierFlex
    ) {
      openaiOptions.serviceTier = 'flex'
    } else if (
      supportsResponsesControls
      && settings.serviceTier === 'priority'
      && modelSupport?.supportsServiceTierPriority
    ) {
      openaiOptions.serviceTier = 'priority'
    } else if (
      supportsResponsesControls
      && settings.serviceTier === 'default'
    ) {
      openaiOptions.serviceTier = 'default'
    }
  }

  if (settings.promptCachingEnabled !== false) {
    openaiOptions.promptCacheKey = buildOpenAIPromptCacheKey({
      modelId,
      projectId: requestContext.projectId,
      threadId: requestContext.threadId,
      messages: requestContext.messages,
      toolNames: requestContext.toolNames,
    })
    const useExtendedPromptCache = (
      supportsResponsesControls
        && settings.promptCacheRetention === '24h'
        && modelSupport?.supportsPromptCache24h
    )
    if (useExtendedPromptCache) {
      openaiOptions.promptCacheRetention = '24h'
    } else if (!usesImplicitPromptCacheRetention(modelId)) {
      openaiOptions.promptCacheRetention = 'in_memory'
    }
  }

  const serverSideCompaction = resolveOpenAIServerSideCompactionPolicy({
    runtimeSettings: settings,
    requestContext,
    modelSupport,
    forBackground: false,
    modelContextLimitTokens: modelContext.limitTokens,
  })
  if (serverSideCompaction.enabled) {
    openaiOptions.metadata = injectOpenAIServerSideCompactionMetadata(
      openaiOptions.metadata,
      serverSideCompaction.thresholdTokens,
    )
  }

  if (openAIRequestContext.store === true && toStringSafe(openAIRequestContext.conversationId)) {
    openaiOptions.conversation = toStringSafe(openAIRequestContext.conversationId)
  } else if (openAIRequestContext.store === true && toStringSafe(openAIRequestContext.previousResponseId)) {
    openaiOptions.previousResponseId = toStringSafe(openAIRequestContext.previousResponseId)
  }

  if (include.length > 0) {
    openaiOptions.include = include
  }

  return { openai: openaiOptions }
}

export function createOpenAIRawStreamMetaCollector() {
  return createOpenAIServerSideCompactionStreamCollector()
}

export function extractOpenAIResponseMeta(providerMetadata = null, response = null, fallbackModelId = '', rawStreamMeta = null) {
  const openaiMetadata = providerMetadata?.openai && typeof providerMetadata.openai === 'object'
    ? providerMetadata.openai
    : {}
  const compactionMeta = buildOpenAIServerSideCompactionResponseMeta({
    response,
    rawStreamMeta,
  })
  const usageTelemetry = normalizeUsage(
    response?.usage
    || openaiMetadata.usage
    || openaiMetadata.responseUsage
    || null,
  )

  return {
    responseId: String(openaiMetadata.responseId || response?.id || '').trim(),
    conversationId: String(
      openaiMetadata.conversationId
      || response?.conversation?.id
      || response?.conversation_id
      || ''
    ).trim(),
    serviceTier: String(openaiMetadata.serviceTier || response?.service_tier || '').trim(),
    modelId: String(response?.modelId || response?.model || fallbackModelId || '').trim(),
    cachedTokens: Number(
      usageTelemetry?.cachedInputTokens
      || openaiMetadata.cachedTokens
      || 0
    ) || 0,
    ...(usageTelemetry ? { usageTelemetry } : {}),
    background: response?.background === true,
    status: String(response?.status || '').trim().toLowerCase(),
    autoCompactionApplied: compactionMeta.autoCompactionApplied === true,
    autoCompactionIds: Array.isArray(compactionMeta.autoCompactionIds)
      ? compactionMeta.autoCompactionIds
      : [],
  }
}

export function normalizeCallWarningText(warning = {}) {
  const source = warning && typeof warning === 'object' ? warning : {}
  const parts = [
    String(source.feature || '').trim(),
    String(source.details || '').trim(),
    String(source.message || '').trim(),
  ].filter(Boolean)
  return parts.join(': ')
}

export function isIgnorableOpenAIProviderWarning(warningText = '') {
  const normalized = String(warningText || '').trim().toLowerCase()
  if (!normalized) return false
  return normalized.includes('non-openai reasoning parts are not supported')
}

export function toOpenAIStreamChunkError(rawChunk = null, fallbackModelId = '') {
  const source = rawChunk && typeof rawChunk === 'object' ? rawChunk : null
  if (!source) return null
  if (String(source.type || '').trim().toLowerCase() !== 'error') return null

  const payload = source.error && typeof source.error === 'object' ? source.error : {}
  const message = String(payload.message || 'OpenAI streaming response failed.').trim()
  const code = String(payload.code || '').trim().toLowerCase()
  const param = String(payload.param || '').trim()
  const type = String(payload.type || '').trim().toLowerCase()

  const error = new Error(message || 'OpenAI streaming response failed.')
  if (code) error.code = code
  if (type) error.providerErrorType = type
  if (param) error.providerErrorParam = param
  if (fallbackModelId) error.modelId = String(fallbackModelId || '').trim()
  error.providerId = 'openai'
  return error
}

function isOpenAIToolResultMessage(message = null) {
  if (!message || typeof message !== 'object') return false
  if (String(message.role || '').trim().toLowerCase() !== 'tool') return false
  const content = Array.isArray(message.content) ? message.content : []
  return content.some((part) => String(part?.type || '').trim().toLowerCase() === 'tool-result')
}

export function prepareOpenAIContinuationMessages(messages = [], requestContext = {}) {
  const rows = Array.isArray(messages) ? messages : []
  const openAIContext = requestContext?.openai && typeof requestContext.openai === 'object'
    ? { ...requestContext.openai }
    : null
  if (!openAIContext?.previousResponseId) {
    return { messages: rows, openAIContext }
  }

  const systemMessages = []
  for (const message of rows) {
    const role = String(message?.role || '').trim().toLowerCase()
    if (role === 'system' || role === 'developer') {
      systemMessages.push(message)
    }
  }

  let lastAssistantIndex = -1
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const role = String(rows[index]?.role || '').trim().toLowerCase()
    if (role === 'assistant') {
      lastAssistantIndex = index
      break
    }
  }

  const deltaMessages = (lastAssistantIndex >= 0 ? rows.slice(lastAssistantIndex + 1) : rows)
    .filter((message) => {
      const role = String(message?.role || '').trim().toLowerCase()
      return role !== 'system' && role !== 'developer'
    })
  const firstToolResultIndex = deltaMessages.findIndex((message) => isOpenAIToolResultMessage(message))
  const reducedDeltaMessages = firstToolResultIndex >= 0
    ? deltaMessages.slice(firstToolResultIndex)
    : deltaMessages

  if (reducedDeltaMessages.length === 0) {
    return {
      messages: rows,
      openAIContext: {
        ...openAIContext,
        previousResponseId: '',
        conversationId: '',
      },
    }
  }

  return {
    messages: [...systemMessages, ...reducedDeltaMessages],
    openAIContext,
  }
}

function buildOpenAIBackgroundWarning(reason = '', modelId = '') {
  switch (reason) {
    case 'tools_present':
      return 'OpenAI background mode was skipped because this turn uses tools and must stay on the interactive stream path.'
    case 'store_disabled':
      return 'OpenAI background mode was skipped because provider-side response storage is disabled for this turn.'
    case 'unsupported_model':
      return `OpenAI background mode is not enabled for ${String(modelId || 'the selected model')}.`
    default:
      return 'OpenAI background mode was skipped because this turn includes message content that requires the interactive stream path.'
  }
}

export async function prepareOpenAIBackgroundTurnPayload({
  apiKey,
  modelId,
  originalMessages = [],
  preparedMessages = null,
  tools = {},
  activeTools = null,
  hasTools = undefined,
  providerRuntimeSettings = null,
  requestContext = {},
  providerOptions = null,
  onProviderWarning = null,
  buildProviderOptions = null,
  resolveCapabilities = null,
} = {}) {
  const effectiveModelId = canonicalizeRequestedModel('openai', modelId).effectiveModelId
  const authMethod = resolveOpenAIBackgroundAuthMethod(apiKey)
  const continuationPrep = Array.isArray(preparedMessages)
    ? {
      messages: preparedMessages,
      openAIContext: requestContext?.openai && typeof requestContext.openai === 'object'
        ? requestContext.openai
        : null,
    }
    : prepareOpenAIContinuationMessages(originalMessages, requestContext)
  const normalizedRequestContext = {
    ...requestContext,
    openai: continuationPrep.openAIContext,
  }

  let resolvedProviderOptions = providerOptions
  if (!resolvedProviderOptions && typeof buildProviderOptions === 'function') {
    resolvedProviderOptions = buildProviderOptions({
      modelId: effectiveModelId,
      runtimeSettings: providerRuntimeSettings,
      requestContext: {
        ...normalizedRequestContext,
        messages: originalMessages,
        toolNames: Object.keys(tools && typeof tools === 'object' ? tools : {}),
      },
    })
  }

  const requestedTools = tools && typeof tools === 'object' ? tools : {}
  const callerProvidedResolvedToolState = (
    typeof hasTools === 'boolean'
    || (activeTools && typeof activeTools === 'object' && !Array.isArray(activeTools))
  )
  let resolvedActiveTools = activeTools && typeof activeTools === 'object' ? activeTools : requestedTools
  let resolvedHasTools = typeof hasTools === 'boolean'
    ? hasTools
    : Object.keys(resolvedActiveTools).length > 0

  if (!callerProvidedResolvedToolState && resolvedHasTools && typeof resolveCapabilities === 'function') {
    const capabilities = await resolveCapabilities({
      apiKey,
      modelId: effectiveModelId,
      forceRefresh: false,
      failOnProbeError: true,
    })
    if (!canExecuteResolvedToolSurface(capabilities)) {
      resolvedActiveTools = {}
      resolvedHasTools = false
    }
  }

  const openAIBackgroundEligibility = resolveOpenAIBackgroundModeEligibility({
    modelId: effectiveModelId,
    runtimeSettings: providerRuntimeSettings,
    messages: continuationPrep.messages,
    toolCount: resolvedHasTools ? Object.keys(resolvedActiveTools || {}).length : 0,
    store: resolvedProviderOptions?.openai?.store === true,
    authMethod,
  })
  const normalizedSettings = normalizeOpenAIProviderRuntimeSettings(providerRuntimeSettings || {})
  const modelSupport = resolveProviderModelAdapter('openai', effectiveModelId, { authMethod })?.openaiRuntimeSupport || null
  const backgroundServerSideCompaction = resolveOpenAIServerSideCompactionPolicy({
    runtimeSettings: normalizedSettings,
    requestContext: normalizedRequestContext,
    modelSupport,
    forBackground: true,
    modelContextLimitTokens: resolveModelContextLimit('openai', effectiveModelId).limitTokens,
  })
  if (resolvedProviderOptions?.openai && typeof resolvedProviderOptions.openai === 'object') {
    resolvedProviderOptions = {
      ...resolvedProviderOptions,
      openai: {
        ...resolvedProviderOptions.openai,
        metadata: injectOpenAIServerSideCompactionMetadata(
          resolvedProviderOptions.openai.metadata,
          backgroundServerSideCompaction.enabled
            ? backgroundServerSideCompaction.thresholdTokens
            : 0,
        ),
      },
    }
  }

  return {
    eligible: openAIBackgroundEligibility.eligible === true,
    reason: String(openAIBackgroundEligibility.reason || '').trim(),
    messages: continuationPrep.messages,
    modelId: effectiveModelId,
    openaiOptions: resolvedProviderOptions?.openai || null,
    warning: (
      normalizedSettings.enableBackgroundMode === true
      && openAIBackgroundEligibility.eligible !== true
      && openAIBackgroundEligibility.reason !== 'disabled'
    )
      ? {
        type: 'info',
        text: buildOpenAIBackgroundWarning(openAIBackgroundEligibility.reason, effectiveModelId),
        meta: {
          providerId: 'openai',
          modelId: String(effectiveModelId || ''),
          reason: String(openAIBackgroundEligibility.reason || 'unsupported').trim(),
        },
      }
      : null,
    execute: openAIBackgroundEligibility.eligible === true
      ? async ({ abortSignal } = {}) => createOpenAIBackgroundResponse({
        apiKey,
        modelId: effectiveModelId,
        messages: continuationPrep.messages,
        runtimeSettings: providerRuntimeSettings,
        openaiOptions: resolvedProviderOptions?.openai || {},
        abortSignal,
        requestContext: normalizedRequestContext,
        onProviderWarning,
      })
      : null,
  }
}
