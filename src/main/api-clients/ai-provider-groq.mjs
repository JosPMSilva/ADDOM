import { createGroq } from '@ai-sdk/groq'
import { createIneligibleBackgroundTurnPayload, createSharedInlineCompletion, createSharedStreamWithTools } from './ai-provider-adapter-core.mjs'
import { resolveProviderCapabilities } from './ai-provider-capability-probes.mjs'
import { prepareDefaultContinuationMessages } from './continuation-request-context.mjs'
import { resolveProviderModelTransform } from './provider-model-transform.mjs'

const groqProviderAdapter = {
  providerId: 'groq',
  buildModel({ apiKey, modelId }) {
    return createGroq({ apiKey })(modelId)
  },
  buildProviderOptions({ modelId, runtimeSettings, requestContext, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'groq',
      modelId,
      adapterProfile,
    }).buildProviderOptions({ runtimeSettings, requestContext })
  },
  resolveCapabilities({ apiKey, modelId, forceRefresh = false, failOnProbeError = false }) {
    return resolveProviderCapabilities({
      providerId: 'groq',
      apiKey,
      modelId,
      forceRefresh,
      failOnProbeError,
    })
  },
  normalizeMessages({ messages, modelId, adapterProfile }) {
    return resolveProviderModelTransform({
      providerId: 'groq',
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
    return createSharedStreamWithTools({ ...args, adapter: groqProviderAdapter })
  },
  createInlineCompletion(args) {
    return createSharedInlineCompletion({ ...args, adapter: groqProviderAdapter })
  },
}

export default groqProviderAdapter
