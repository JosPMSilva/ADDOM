import crypto from 'node:crypto'
import OpenAI from 'openai'
import { startOpenAIAccountBackgroundOperation } from './ai-provider-openai-account.mjs'
import { normalizeUsage } from './ai-provider-stream-utils.mjs'
import {
  normalizeOpenAIProviderRuntimeSettings,
  resolveOpenAIBaseUrl,
} from './openai-runtime-types.mjs'
import { applyOpenAIServerSideCompactionTransportShim } from './openai-server-side-compaction.mjs'
import { buildOpenAIServerSideCompactionResponseMeta } from './openai-server-side-compaction.mjs'
import { resolveProviderModelAdapter } from './provider-model-adapters.mjs'
import {
  createOpenAIExecutionAuthError,
  resolveOpenAIExecutionAuth,
} from '../openai-account/openai-execution-auth.mjs'

let openAIBackgroundPollIntervalMs = 1000
let openAIBackgroundMaxWaitMs = 10 * 60 * 1000
const TERMINAL_RESPONSE_STATUSES = new Set(['completed', 'failed', 'cancelled', 'incomplete'])
const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64

let openAIBackgroundClientFactory = null

function normalizeId(value = '') {
  return String(value || '').trim()
}

function resolveBackgroundAuthMethod(apiKey = '') {
  const auth = resolveOpenAIExecutionAuth({ apiKey, allowAccountRuntime: true })
  return normalizeId(auth?.authMethod).toLowerCase() === 'account'
    ? 'account'
    : 'api_key'
}

function normalizeOpenAIPromptCacheKey(value = '') {
  const normalized = normalizeId(value)
  if (!normalized) return ''
  if (normalized.length <= OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH) return normalized
  return `addom:openai:ck:${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 40)}`
}

function createAbortError(message = 'OpenAI background response aborted.') {
  const error = new Error(message)
  error.name = 'AbortError'
  error.code = 'ABORT_ERR'
  return error
}

function normalizeResponseStatus(value = '') {
  return normalizeId(value).toLowerCase()
}

function isTerminalResponseStatus(value = '') {
  return TERMINAL_RESPONSE_STATUSES.has(normalizeResponseStatus(value))
}

function buildOpenAIBackgroundClient(apiKey = '', { allowAccountRuntime = false } = {}) {
  const auth = resolveOpenAIExecutionAuth({ apiKey, allowAccountRuntime })
  const authMethod = normalizeId(auth.authMethod).toLowerCase()
  if (typeof openAIBackgroundClientFactory === 'function' && auth.ok !== true) {
    return openAIBackgroundClientFactory({
      apiKey: normalizeId(apiKey),
      baseURL: resolveOpenAIBaseUrl(),
      authMethod: authMethod || 'api_key',
      auth,
    })
  }
  if (auth.ok !== true) {
    throw createOpenAIExecutionAuthError(auth)
  }
  if (authMethod === 'account') {
    return {
      kind: 'account',
      authMethod: 'account',
    }
  }
  const resolvedApiKey = normalizeId(auth.apiKey)
  if (typeof openAIBackgroundClientFactory === 'function') {
    return openAIBackgroundClientFactory({
      apiKey: resolvedApiKey,
      baseURL: resolveOpenAIBaseUrl(),
    })
  }
  return new OpenAI({
    apiKey: resolvedApiKey,
    ...(resolveOpenAIBaseUrl() ? { baseURL: resolveOpenAIBaseUrl() } : {}),
  })
}

export function buildOpenAIBackgroundClientForResume(apiKey = '') {
  return buildOpenAIBackgroundClient(apiKey)
}

function flattenBackgroundMessageContent(content) {
  if (typeof content === 'string') {
    return { supported: true, text: content }
  }

  if (!Array.isArray(content)) {
    return { supported: false, text: '', reason: 'unsupported_content_shape' }
  }

  const lines = []
  for (const rawPart of content) {
    const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
    const type = normalizeId(part.type).toLowerCase()

    if (type === 'text' || (!type && typeof part.text === 'string')) {
      const text = String(part.text || '')
      if (text) lines.push(text)
      continue
    }

    if (type === 'reasoning') {
      continue
    }

    return {
      supported: false,
      text: '',
      reason: type ? `unsupported_part_${type}` : 'unsupported_part',
    }
  }

  return {
    supported: true,
    text: lines.join('\n').trim(),
  }
}

function convertMessagesToOpenAIBackgroundInput(messages = []) {
  const rows = Array.isArray(messages) ? messages : []
  const input = []

  for (const message of rows) {
    const role = normalizeId(message?.role).toLowerCase()
    if (!role) continue
    if (!['system', 'developer', 'user', 'assistant'].includes(role)) {
      return {
        supported: false,
        input: [],
        reason: role === 'tool' ? 'tool_messages_present' : `unsupported_role_${role}`,
      }
    }

    const flattened = flattenBackgroundMessageContent(message?.content)
    if (!flattened.supported) {
      return {
        supported: false,
        input: [],
        reason: `${role}_${flattened.reason}`,
      }
    }

    if (!flattened.text) continue
    input.push({
      role,
      content: flattened.text,
    })
  }

  if (input.length === 0) {
    return {
      supported: false,
      input: [],
      reason: 'no_supported_messages',
    }
  }

  return {
    supported: true,
    input,
    reason: '',
  }
}

function extractResponseConversationId(response = null) {
  return normalizeId(response?.conversation?.id || response?.conversation_id || '')
}

function extractResponseCachedTokens(response = null) {
  return Number(normalizeUsage(response?.usage || null)?.cachedInputTokens || 0) || 0
}

function normalizeOpenAIBackgroundUsage(rawUsage = null) {
  return normalizeUsage(rawUsage || null)
}

function extractReasoningText(response = null) {
  const output = Array.isArray(response?.output) ? response.output : []
  const lines = []
  for (const item of output) {
    if (normalizeId(item?.type).toLowerCase() !== 'reasoning') continue
    const content = Array.isArray(item?.content) ? item.content : []
    for (const row of content) {
      const text = normalizeId(row?.text)
      if (text) lines.push(text)
    }
    if (lines.length > 0) continue
    const summary = Array.isArray(item?.summary) ? item.summary : []
    for (const row of summary) {
      const text = normalizeId(row?.text)
      if (text) lines.push(text)
    }
  }
  return lines.join('\n').trim()
}

function resolveBackgroundStopReason(response = null) {
  const status = normalizeResponseStatus(response?.status)
  if (status === 'incomplete') {
    const reason = normalizeId(response?.incomplete_details?.reason).toLowerCase()
    if (reason === 'max_output_tokens') return 'length'
    if (reason === 'content_filter') return 'content_filter'
    return 'incomplete'
  }
  if (status === 'cancelled') return 'cancel'
  return 'stop'
}

function extractBackgroundErrorMessage(response = null) {
  const message = normalizeId(response?.error?.message || '')
  if (message) return message
  const status = normalizeResponseStatus(response?.status)
  if (status === 'cancelled') return 'OpenAI background response was cancelled.'
  if (status === 'failed') return 'OpenAI background response failed.'
  return 'OpenAI background response did not complete successfully.'
}

function buildOpenAIBackgroundCreateBody({
  modelId = '',
  input = [],
  openaiOptions = {},
} = {}) {
  const body = {
    model: String(modelId || '').trim(),
    input,
    background: true,
    store: true,
  }

  if (normalizeId(openaiOptions.previousResponseId)) {
    body.previous_response_id = normalizeId(openaiOptions.previousResponseId)
  } else if (normalizeId(openaiOptions.conversation)) {
    body.conversation = normalizeId(openaiOptions.conversation)
  }

  if (normalizeId(openaiOptions.serviceTier)) {
    body.service_tier = normalizeId(openaiOptions.serviceTier)
  }

  const promptCacheKey = normalizeOpenAIPromptCacheKey(openaiOptions.promptCacheKey)
  if (promptCacheKey) {
    body.prompt_cache_key = promptCacheKey
  }

  if (normalizeId(openaiOptions.promptCacheRetention)) {
    body.prompt_cache_retention = normalizeId(openaiOptions.promptCacheRetention)
  }

  if (openaiOptions.metadata && typeof openaiOptions.metadata === 'object' && !Array.isArray(openaiOptions.metadata)) {
    body.metadata = { ...openaiOptions.metadata }
  }

  if (normalizeId(openaiOptions.reasoningEffort) || normalizeId(openaiOptions.reasoningSummary)) {
    body.reasoning = {
      ...(normalizeId(openaiOptions.reasoningEffort)
        ? { effort: normalizeId(openaiOptions.reasoningEffort) }
        : {}),
      ...(normalizeId(openaiOptions.reasoningSummary)
        ? { summary: normalizeId(openaiOptions.reasoningSummary) }
        : {}),
    }
  }

  if (normalizeId(openaiOptions.textVerbosity)) {
    body.text = {
      verbosity: normalizeId(openaiOptions.textVerbosity),
    }
  }

  return applyOpenAIServerSideCompactionTransportShim(body)
}

function buildResponseMeta(response = null) {
  const compactionMeta = buildOpenAIServerSideCompactionResponseMeta({ response })
  const usageTelemetry = normalizeUsage(response?.usage || null)
  return {
    responseId: normalizeId(response?.id),
    conversationId: extractResponseConversationId(response),
    serviceTier: normalizeId(response?.service_tier),
    modelId: normalizeId(response?.model),
    cachedTokens: Number(usageTelemetry?.cachedInputTokens || extractResponseCachedTokens(response) || 0) || 0,
    ...(usageTelemetry ? { usageTelemetry } : {}),
    background: response?.background === true,
    status: normalizeResponseStatus(response?.status),
    autoCompactionApplied: compactionMeta.autoCompactionApplied === true,
    autoCompactionIds: Array.isArray(compactionMeta.autoCompactionIds)
      ? compactionMeta.autoCompactionIds
      : [],
  }
}

async function waitForBackgroundPollDelay(abortSignal = null) {
  if (abortSignal?.aborted) throw createAbortError()
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, openAIBackgroundPollIntervalMs)

    const onAbort = () => {
      cleanup()
      reject(createAbortError())
    }

    const cleanup = () => {
      clearTimeout(timer)
      abortSignal?.removeEventListener?.('abort', onAbort)
    }

    abortSignal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

export async function cancelOpenAIBackgroundResponse(client, responseId = '') {
  const normalizedResponseId = normalizeId(responseId)
  if (!normalizedResponseId) return
  if (typeof client?.cancelResponse === 'function') {
    try {
      await client.cancelResponse(normalizedResponseId)
    } catch {
      // Best-effort only.
    }
    return
  }
  if (!client?.responses?.cancel) return
  try {
    await client.responses.cancel(normalizedResponseId)
  } catch {
    // Best-effort only.
  }
}

export async function pollOpenAIBackgroundResponseUntilTerminal(client, responseId, abortSignal = null) {
  const startedAt = Date.now()
  const normalizedResponseId = normalizeId(responseId)
  if (!normalizedResponseId) {
    throw new Error('OpenAI background response id is required.')
  }

  while (true) {
    if (abortSignal?.aborted) {
      throw createAbortError()
    }

    const response = await client.responses.retrieve(normalizedResponseId)
    if (isTerminalResponseStatus(response?.status)) {
      return response
    }

    if ((Date.now() - startedAt) >= openAIBackgroundMaxWaitMs) {
      throw new Error(`OpenAI background response timed out before completion (${normalizedResponseId}).`)
    }

    await waitForBackgroundPollDelay(abortSignal)
  }
}

export function resolveOpenAIBackgroundModeEligibility({
  modelId = '',
  runtimeSettings = null,
  messages = [],
  toolCount = 0,
  store = true,
  authMethod = 'api_key',
} = {}) {
  const settings = normalizeOpenAIProviderRuntimeSettings(runtimeSettings || {})
  if (settings.enableBackgroundMode !== true) {
    return { eligible: false, reason: 'disabled', input: [] }
  }

  const adapterProfile = resolveProviderModelAdapter('openai', modelId, { authMethod })
  const support = adapterProfile?.openaiRuntimeSupport
  if (support?.supportsBackgroundMode !== true) {
    return { eligible: false, reason: 'unsupported_model', input: [] }
  }

  if (store !== true) {
    return { eligible: false, reason: 'store_disabled', input: [] }
  }

  if (Number(toolCount || 0) > 0) {
    return { eligible: false, reason: 'tools_present', input: [] }
  }

  const converted = convertMessagesToOpenAIBackgroundInput(messages)
  if (!converted.supported) {
    return { eligible: false, reason: converted.reason || 'unsupported_messages', input: [] }
  }

  return {
    eligible: true,
    reason: '',
    input: converted.input,
  }
}

export async function startOpenAIBackgroundResponse({
  apiKey = '',
  modelId = '',
  messages = [],
  runtimeSettings = null,
  openaiOptions = {},
  requestContext = {},
  onProviderWarning = null,
} = {}) {
  const authMethod = resolveBackgroundAuthMethod(apiKey)
  const eligibility = resolveOpenAIBackgroundModeEligibility({
    modelId,
    runtimeSettings,
    messages,
    toolCount: 0,
    store: openaiOptions?.store === true,
    authMethod,
  })
  if (eligibility.eligible !== true) {
    throw new Error(`OpenAI background mode is unavailable: ${String(eligibility.reason || 'unsupported').trim()}`)
  }

  const client = buildOpenAIBackgroundClient(apiKey, { allowAccountRuntime: true })
  if (normalizeId(client?.authMethod).toLowerCase() === 'account') {
    const operation = await startOpenAIAccountBackgroundOperation({
      messages,
      options: {
        model: modelId,
        requestContext: requestContext && typeof requestContext === 'object'
          ? { ...requestContext }
          : {},
      },
      onProviderWarning,
    })
    return {
      client: {
        kind: 'account',
        authMethod: 'account',
        awaitResponse: async (responseId = '', { abortSignal: signal = null } = {}) => {
          const normalizedResponseId = normalizeId(responseId)
          if (normalizedResponseId && normalizedResponseId !== normalizeId(operation?.response?.id)) {
            throw new Error(`OpenAI account background operation not found: ${normalizedResponseId}`)
          }
          if (signal?.aborted) {
            await operation.cancel().catch(() => {})
            throw createAbortError()
          }
          if (!signal) {
            return await operation.awaitResult()
          }
          return await new Promise((resolve, reject) => {
            const onAbort = () => {
              cleanup()
              void operation.cancel().catch(() => {})
              reject(createAbortError())
            }
            const cleanup = () => {
              signal.removeEventListener?.('abort', onAbort)
            }
            signal.addEventListener?.('abort', onAbort, { once: true })
            operation.awaitResult()
              .then((payload) => {
                cleanup()
                resolve(payload)
              })
              .catch((error) => {
                cleanup()
                reject(error)
              })
          })
        },
        cancelResponse: async (responseId = '') => {
          const normalizedResponseId = normalizeId(responseId)
          if (normalizedResponseId && normalizedResponseId !== normalizeId(operation?.response?.id)) return
          await operation.cancel()
        },
      },
      response: operation.response,
      providerResponseMeta: operation.providerResponseMeta,
    }
  }
  const createBody = buildOpenAIBackgroundCreateBody({
    modelId,
    input: eligibility.input,
    openaiOptions,
  })

  const response = await client.responses.create(createBody)
  return {
    client,
    response,
    providerResponseMeta: buildResponseMeta(response),
  }
}

export function buildOpenAIBackgroundResponsePayload(response = null) {
  const status = normalizeResponseStatus(response?.status)
  if (status === 'failed' || status === 'cancelled') {
    throw new Error(extractBackgroundErrorMessage(response))
  }

  return {
    stopReason: resolveBackgroundStopReason(response),
    text: String(response?.output_text || ''),
    reasoning: extractReasoningText(response),
    usage: normalizeOpenAIBackgroundUsage(response?.usage || null),
    toolCalls: [],
    sources: [],
    providerToolOutputs: [],
    providerToolStatuses: [],
    providerResponseMeta: buildResponseMeta(response),
  }
}

export async function awaitOpenAIBackgroundResponse({
  client = null,
  response = null,
  abortSignal = null,
} = {}) {
  if (!client) {
    throw new Error('OpenAI background client is required.')
  }
  let activeResponse = response
  try {
    if (typeof client.awaitResponse === 'function') {
      return await client.awaitResponse(normalizeId(activeResponse?.id), {
        response: activeResponse,
        abortSignal,
      })
    }
    if (!isTerminalResponseStatus(activeResponse?.status)) {
      activeResponse = await pollOpenAIBackgroundResponseUntilTerminal(client, activeResponse?.id, abortSignal)
    }
  } catch (error) {
    if (String(error?.name || '').toLowerCase() === 'aborterror' || String(error?.code || '').toUpperCase() === 'ABORT_ERR') {
      await cancelOpenAIBackgroundResponse(client, activeResponse?.id)
    }
    throw error
  }

  return buildOpenAIBackgroundResponsePayload(activeResponse)
}

export async function createOpenAIBackgroundResponse({
  apiKey = '',
  modelId = '',
  messages = [],
  runtimeSettings = null,
  openaiOptions = {},
  abortSignal = null,
  requestContext = {},
  onProviderWarning = null,
} = {}) {
  const { client, response } = await startOpenAIBackgroundResponse({
    apiKey,
    modelId,
    messages,
    runtimeSettings,
    openaiOptions,
    requestContext,
    onProviderWarning,
  })
  return await awaitOpenAIBackgroundResponse({
    client,
    response,
    abortSignal,
  })
}

export function __setOpenAIBackgroundClientFactoryForTests(factory = null) {
  openAIBackgroundClientFactory = typeof factory === 'function' ? factory : null
}

export function __resetOpenAIBackgroundClientFactoryForTests() {
  openAIBackgroundClientFactory = null
}

export function __setOpenAIBackgroundTimingForTests({
  pollIntervalMs = 1000,
  maxWaitMs = 10 * 60 * 1000,
} = {}) {
  openAIBackgroundPollIntervalMs = Math.max(0, Number(pollIntervalMs || 0) || 0)
  openAIBackgroundMaxWaitMs = Math.max(1, Number(maxWaitMs || 0) || 1)
}

export function __resetOpenAIBackgroundTimingForTests() {
  openAIBackgroundPollIntervalMs = 1000
  openAIBackgroundMaxWaitMs = 10 * 60 * 1000
}
