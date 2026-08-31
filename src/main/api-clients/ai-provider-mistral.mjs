import { createMistral } from '@ai-sdk/mistral'
import { createIneligibleBackgroundTurnPayload, createSharedInlineCompletion, createSharedStreamWithTools } from './ai-provider-adapter-core.mjs'
import { resolveProviderCapabilities } from './ai-provider-capability-probes.mjs'
import { prepareDefaultContinuationMessages } from './continuation-request-context.mjs'
import { resolveProviderModelTransform } from './provider-model-transform.mjs'

const mistralProviderAdapter = {
  providerId: 'mistral',
  buildModel({ apiKey, modelId }) {
    return createMistral({ apiKey })(modelId)
  },
  buildProviderOptions({ modelId, runtimeSettings, requestContext, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'mistral',
      modelId,
      adapterProfile,
    }).buildProviderOptions({ runtimeSettings, requestContext })
  },
  resolveCapabilities({ apiKey, modelId, forceRefresh = false, failOnProbeError = false }) {
    return resolveProviderCapabilities({
      providerId: 'mistral',
      apiKey,
      modelId,
      forceRefresh,
      failOnProbeError,
    })
  },
  normalizeMessages({ messages, modelId, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'mistral',
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
    return createSharedStreamWithTools({ ...args, adapter: mistralProviderAdapter })
  },
  createInlineCompletion(args) {
    return createSharedInlineCompletion({ ...args, adapter: mistralProviderAdapter })
  },
}

export default mistralProviderAdapter
