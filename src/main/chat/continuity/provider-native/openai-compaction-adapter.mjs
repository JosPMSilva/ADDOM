import crypto from 'node:crypto'
import OpenAI from 'openai'
import {
  createProviderNativeCompactionReference,
  createProviderNativeCompactionResult,
  PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS,
  PROVIDER_NATIVE_COMPACTION_SUCCESS_REASONS,
} from './provider-native-compaction-contract.mjs'
import {
  createOpenAIExecutionAuthError,
  resolveOpenAIExecutionAuth,
} from '../../../openai-account/openai-execution-auth.mjs'

let openAICompactionClientFactory = null
const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64

function now() {
  return Date.now()
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeOpenAIPromptCacheKey(value = '') {
  const normalized = normalizeId(value)
  if (!normalized) return ''
  if (normalized.length <= OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH) return normalized
  return `addom:openai:ck:${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 40)}`
}

function normalizeUsage(usage = null) {
  if (!usage || typeof usage !== 'object') return null
  const inputTokens = Number(usage.input_tokens || usage.inputTokens || 0) || 0
  const outputTokens = Number(usage.output_tokens || usage.outputTokens || 0) || 0
  const reasoningTokens = Number(
    usage.output_tokens_details?.reasoning_tokens
    || usage.reasoning_tokens
    || usage.reasoningTokens
    || 0,
  ) || 0
  const totalTokens = Number(usage.total_tokens || usage.totalTokens || (inputTokens + outputTokens + reasoningTokens)) || 0
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  }
}

function resolveOpenAIBaseUrl() {
  return normalizeId(process.env.ADDOM_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL).replace(/\/+$/, '')
}

function buildOpenAICompactionClient(apiKey = '') {
  const auth = resolveOpenAIExecutionAuth({ apiKey })
  const resolvedApiKey = normalizeId(auth.apiKey)
  if (typeof openAICompactionClientFactory === 'function') {
    return openAICompactionClientFactory({
      apiKey: resolvedApiKey,
      baseURL: resolveOpenAIBaseUrl(),
    })
  }
  if (!resolvedApiKey) {
    throw createOpenAIExecutionAuthError(auth)
  }
  return new OpenAI({
    apiKey: resolvedApiKey,
    ...(resolveOpenAIBaseUrl() ? { baseURL: resolveOpenAIBaseUrl() } : {}),
  })
}

function extractCompactionItems(output = []) {
  return Array.isArray(output)
    ? output.filter((item) => item && typeof item === 'object' && String(item.type || '').trim().toLowerCase() === 'compaction')
    : []
}

function normalizeCompactedWindow(output = []) {
  return Array.isArray(output)
    ? output.filter((item) => item && typeof item === 'object')
    : []
}

export function __setOpenAICompactionClientFactoryForTests(factory) {
  openAICompactionClientFactory = typeof factory === 'function' ? factory : null
}

export function __resetOpenAICompactionClientFactoryForTests() {
  openAICompactionClientFactory = null
}

export async function applyOpenAIProviderNativeCompaction({
  model = '',
  previousResponseId = '',
  apiKey = '',
  promptCacheKey = '',
} = {}) {
  const normalizedModel = normalizeId(model)
  const normalizedPreviousResponseId = normalizeId(previousResponseId)

  try {
    const client = buildOpenAICompactionClient(apiKey)
    const promptCacheKeyForRequest = normalizeOpenAIPromptCacheKey(promptCacheKey)
    const compactedResponse = await client.responses.compact({
      model: normalizedModel,
      previous_response_id: normalizedPreviousResponseId,
      ...(promptCacheKeyForRequest ? { prompt_cache_key: promptCacheKeyForRequest } : {}),
    })
    const compactionItems = extractCompactionItems(compactedResponse?.output)
    const compactionIds = compactionItems
      .map((item) => normalizeId(item.id))
      .filter(Boolean)
    const compactedWindow = normalizeCompactedWindow(compactedResponse?.output)

    return createProviderNativeCompactionResult({
      used: compactionIds.length > 0,
      providerId: 'openai',
      reason: compactionIds.length > 0
        ? PROVIDER_NATIVE_COMPACTION_SUCCESS_REASONS.COMPACTED
        : PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.MISSING_COMPACTION_ITEM,
      compactionId: compactionIds[0] || '',
      compactionIds,
      compactedWindow,
      responseId: normalizeId(compactedResponse?.id),
      reference: createProviderNativeCompactionReference({
        providerId: 'openai',
        stage: 'applied',
        at: now(),
        responseId: normalizeId(compactedResponse?.id),
        compactionIds,
        usage: normalizeUsage(compactedResponse?.usage),
      }),
    })
  } catch (error) {
    return createProviderNativeCompactionResult({
      providerId: 'openai',
      reason: PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.PROVIDER_ERROR,
      reference: createProviderNativeCompactionReference({
        providerId: 'openai',
        stage: 'error',
        at: now(),
        message: normalizeId(error?.message || 'OpenAI provider-native compaction failed.'),
        status: Number(error?.status || 0) || 0,
      }),
    })
  }
}
