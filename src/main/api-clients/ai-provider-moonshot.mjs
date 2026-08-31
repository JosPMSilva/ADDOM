import { resolveMoonshotBaseUrl } from './moonshot-formula-types.mjs'
import { createOpenAICompatibleProviderAdapter } from './ai-provider-openai-compatible-core.mjs'
import { resolveProviderProcessingMode } from '../../common/api-clients/provider-processing-mode.mjs'

const moonshotProviderAdapter = createOpenAICompatibleProviderAdapter({
  providerId: 'moonshot',
  providerName: 'moonshot',
  resolveBaseUrl: () => resolveMoonshotBaseUrl(),
  resolveRequestModelId: ({ modelId, requestContext }) => {
    const processing = resolveProviderProcessingMode({
      providerId: 'moonshot',
      modelId,
      authMethod: 'api_key',
      providerConfigured: true,
      requestedMode: requestContext?.processingMode,
    })
    return processing.request?.modelId || modelId
  },
  includeUsage: true,
})

export default moonshotProviderAdapter
