import { createOpenAICompatibleProviderAdapter } from './ai-provider-openai-compatible-core.mjs'

const lmstudioProviderAdapter = createOpenAICompatibleProviderAdapter({
  providerId: 'lmstudio',
  providerName: 'lmstudio',
  resolveBaseUrl: () => 'http://localhost:1234/v1',
  resolveApiKey: () => 'lmstudio',
})

export default lmstudioProviderAdapter
