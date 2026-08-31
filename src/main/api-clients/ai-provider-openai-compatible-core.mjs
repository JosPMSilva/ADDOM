import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createIneligibleBackgroundTurnPayload, createSharedInlineCompletion, createSharedStreamWithTools } from './ai-provider-adapter-core.mjs'
import {
  probeLMStudioModelCapabilities,
  probeOllamaModelCapabilities,
  resolveProviderCapabilities,
} from './ai-provider-capability-probes.mjs'
import { prepareDefaultContinuationMessages } from './continuation-request-context.mjs'
import { resolveProviderModelAdapter } from './provider-model-adapters.mjs'
import { resolveProviderModelTransform } from './provider-model-transform.mjs'

const CAPABILITY_PROBE_BY_PROVIDER = Object.freeze({
  ollama: probeOllamaModelCapabilities,
  lmstudio: probeLMStudioModelCapabilities,
})

export function buildOpenAICompatibleModel({
  providerName,
  modelId,
  apiKey,
  baseURL,
  headers = undefined,
  includeUsage = false,
} = {}) {
  return createOpenAICompatible({
    name: providerName,
    baseURL,
    apiKey,
    ...(headers && typeof headers === 'object' ? { headers } : {}),
    ...(includeUsage ? { includeUsage: true } : {}),
  })(modelId)
}

export function createOpenAICompatibleProviderAdapter({
  providerId,
  providerName = providerId,
  resolveBaseUrl,
  resolveApiKey = ({ apiKey }) => apiKey,
  resolveHeaders = () => undefined,
  includeUsage = false,
  includeRawChunks = false,
  extractReasoningFromRawChunk = null,
  probeCapabilities = null,
  resolveRequestModelId = ({ modelId }) => modelId,
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()

  const adapter = {
    providerId: normalizedProviderId,
    ...(includeRawChunks === true ? { includeRawChunks: true } : {}),
    ...(typeof extractReasoningFromRawChunk === 'function'
      ? { extractReasoningFromRawChunk }
      : {}),
    buildModel({ apiKey, modelId, requestContext = {} }) {
      const requestModelId = resolveRequestModelId({ modelId, requestContext }) || modelId
      return buildOpenAICompatibleModel({
        providerName,
        modelId: requestModelId,
        apiKey: resolveApiKey({ apiKey, modelId }),
        baseURL: resolveBaseUrl(),
        headers: resolveHeaders({ apiKey, modelId }),
        includeUsage,
      })
    },
    buildProviderOptions({ modelId, runtimeSettings, requestContext, adapterProfile }) {
      return resolveProviderModelTransform({
        providerId: normalizedProviderId,
        modelId,
        adapterProfile,
      }).buildProviderOptions({ runtimeSettings, requestContext })
    },
    resolveCapabilities({ apiKey, modelId, forceRefresh = false, failOnProbeError = false }) {
      const sharedProbe = typeof probeCapabilities === 'function'
        ? probeCapabilities
        : CAPABILITY_PROBE_BY_PROVIDER[normalizedProviderId] || null
      return resolveProviderCapabilities({
        providerId: normalizedProviderId,
        apiKey,
        modelId,
        forceRefresh,
        failOnProbeError,
        probeCapabilities: sharedProbe,
      })
    },
    normalizeMessages({ messages, modelId, adapterProfile }) {
      return resolveProviderModelTransform({
        providerId: normalizedProviderId,
        modelId,
        adapterProfile,
      }).normalizeMessages({ messages })
    },
    prepareContinuationMessages({ messages, requestContext }) {
      return prepareDefaultContinuationMessages({ messages, requestContext })
    },
    async prepareBackgroundTurn({ messages, modelId }) {
      return createIneligibleBackgroundTurnPayload({
        messages,
        modelId,
      })
    },
    createStreamWithTools(args) {
      return createSharedStreamWithTools({ ...args, adapter })
    },
    createInlineCompletion(args) {
      return createSharedInlineCompletion({ ...args, adapter })
    },
  }

  adapter.resolveAdapterProfile = (modelId = '') => resolveProviderModelAdapter(normalizedProviderId, modelId)
  return adapter
}
