import { createPerplexity } from '@ai-sdk/perplexity'
import { createIneligibleBackgroundTurnPayload, createSharedInlineCompletion, createSharedStreamWithTools } from './ai-provider-adapter-core.mjs'
import { resolveProviderCapabilities } from './ai-provider-capability-probes.mjs'
import { prepareDefaultContinuationMessages } from './continuation-request-context.mjs'
import { resolveProviderModelTransform } from './provider-model-transform.mjs'

const perplexityProviderAdapter = {
  providerId: 'perplexity',
  buildModel({ apiKey, modelId }) {
    return createPerplexity({ apiKey })(modelId)
  },
  buildProviderOptions({ modelId, runtimeSettings, requestContext, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'perplexity',
      modelId,
      adapterProfile,
    }).buildProviderOptions({ runtimeSettings, requestContext })
  },
  resolveCapabilities({ apiKey, modelId, forceRefresh = false, failOnProbeError = false }) {
    return resolveProviderCapabilities({
      providerId: 'perplexity',
      apiKey,
      modelId,
      forceRefresh,
      failOnProbeError,
    })
  },
  normalizeMessages({ messages, modelId, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'perplexity',
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
    return createSharedStreamWithTools({ ...args, adapter: perplexityProviderAdapter })
  },
  createInlineCompletion(args) {
    return createSharedInlineCompletion({ ...args, adapter: perplexityProviderAdapter })
  },
}

export default perplexityProviderAdapter
