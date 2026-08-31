import { createOpenAICompatibleProviderAdapter } from './ai-provider-openai-compatible-core.mjs'

const ollamaProviderAdapter = createOpenAICompatibleProviderAdapter({
  providerId: 'ollama',
  providerName: 'ollama',
  resolveBaseUrl: () => 'http://localhost:11434/v1',
  resolveApiKey: () => 'ollama',
})

export default ollamaProviderAdapter
