import { createAnthropic } from '@ai-sdk/anthropic'
import { createIneligibleBackgroundTurnPayload, createSharedInlineCompletion, createSharedStreamWithTools } from './ai-provider-adapter-core.mjs'
import {
  extractAnthropicReasoningHistoryParts,
  extractAnthropicResponseMeta,
} from './ai-provider-anthropic-runtime.mjs'
import { resolveProviderCapabilities } from './ai-provider-capability-probes.mjs'
import { prepareDefaultContinuationMessages } from './continuation-request-context.mjs'
import { resolveProviderModelTransform } from './provider-model-transform.mjs'

const anthropicProviderAdapter = {
  providerId: 'anthropic',
  extractResponseMeta: extractAnthropicResponseMeta,
  extractReasoningHistoryParts: extractAnthropicReasoningHistoryParts,
  buildModel({ apiKey, modelId }) {
    return createAnthropic({ apiKey })(modelId)
  },
  buildProviderOptions({ modelId, runtimeSettings, requestContext, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'anthropic',
      modelId,
      adapterProfile,
    }).buildProviderOptions({ runtimeSettings, requestContext })
  },
  resolveCapabilities({ apiKey, modelId, forceRefresh = false, failOnProbeError = false }) {
    return resolveProviderCapabilities({
      providerId: 'anthropic',
      apiKey,
      modelId,
      forceRefresh,
      failOnProbeError,
    })
  },
  normalizeMessages({ messages, modelId, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'anthropic',
      modelId,
      adapterProfile,
    }).normalizeMessages({ messages })
  },
  prepareContinuationMessages({ messages, requestContext }) {
    return prepareDefaultContinuationMessages({ messages, requestContext })
  },
  async prepareBackgroundTurn({ messages, modelId }) {
    return createIneligibleBackgroundTurnPayload({ messages, modelId })
  },
  createStreamWithTools(args) {
    return createSharedStreamWithTools({ ...args, adapter: anthropicProviderAdapter })
  },
  createInlineCompletion(args) {
    return createSharedInlineCompletion({ ...args, adapter: anthropicProviderAdapter })
  },
}

export default anthropicProviderAdapter
