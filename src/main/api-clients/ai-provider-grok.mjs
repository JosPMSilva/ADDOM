import { createXai } from '@ai-sdk/xai'
import { createIneligibleBackgroundTurnPayload, createSharedInlineCompletion, createSharedStreamWithTools } from './ai-provider-adapter-core.mjs'
import { resolveProviderCapabilities } from './ai-provider-capability-probes.mjs'
import { prepareDefaultContinuationMessages } from './continuation-request-context.mjs'
import { resolveProviderModelTransform } from './provider-model-transform.mjs'

const grokProviderAdapter = {
  providerId: 'grok',
  buildModel({ apiKey, modelId }) {
    return createXai({ apiKey })(modelId)
  },
  buildProviderOptions({ modelId, runtimeSettings, requestContext, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'grok',
      modelId,
      adapterProfile,
    }).buildProviderOptions({ runtimeSettings, requestContext })
  },
  resolveCapabilities({ apiKey, modelId, forceRefresh = false, failOnProbeError = false }) {
    return resolveProviderCapabilities({
      providerId: 'grok',
      apiKey,
      modelId,
      forceRefresh,
      failOnProbeError,
    })
  },
  normalizeMessages({ messages, modelId, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'grok',
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
    return createSharedStreamWithTools({ ...args, adapter: grokProviderAdapter })
  },
  createInlineCompletion(args) {
    return createSharedInlineCompletion({ ...args, adapter: grokProviderAdapter })
  },
}

export default grokProviderAdapter
