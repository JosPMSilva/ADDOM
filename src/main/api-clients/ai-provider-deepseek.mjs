import { createOpenAICompatibleProviderAdapter } from './ai-provider-openai-compatible-core.mjs'

export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com'

const deepseekProviderAdapter = createOpenAICompatibleProviderAdapter({
  providerId: 'deepseek',
  providerName: 'deepseek',
  resolveBaseUrl: () => DEEPSEEK_API_BASE_URL,
})

export default deepseekProviderAdapter
