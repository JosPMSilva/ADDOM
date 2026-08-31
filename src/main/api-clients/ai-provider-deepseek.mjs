import { createOpenAICompatibleProviderAdapter } from './ai-provider-openai-compatible-core.mjs'

const deepseekProviderAdapter = createOpenAICompatibleProviderAdapter({
  providerId: 'deepseek',
  providerName: 'deepseek',
  resolveBaseUrl: () => 'https://api.deepseek.com/v1',
})

export default deepseekProviderAdapter
