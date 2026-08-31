import { createOpenAICompatibleProviderAdapter } from './ai-provider-openai-compatible-core.mjs'
import { extractOpenRouterReasoningFromRawChunk } from './ai-provider-openrouter-reasoning.mjs'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_APP_TITLE = 'ADDOM'
const OPENROUTER_SITE_URL = String(process.env.ADDOM_OPENROUTER_SITE_URL || '').trim()

function buildOpenRouterHeaders() {
  return {
    ...(OPENROUTER_APP_TITLE ? { 'X-OpenRouter-Title': OPENROUTER_APP_TITLE } : {}),
    ...(OPENROUTER_SITE_URL ? { 'HTTP-Referer': OPENROUTER_SITE_URL } : {}),
  }
}

const openrouterProviderAdapter = createOpenAICompatibleProviderAdapter({
  providerId: 'openrouter',
  providerName: 'openrouter',
  resolveBaseUrl: () => OPENROUTER_BASE_URL,
  resolveHeaders: () => buildOpenRouterHeaders(),
  includeUsage: true,
  // OpenRouter streams visible thinking via choices[].delta.reasoning_details.
  // @ai-sdk/openai-compatible only maps reasoning_content / reasoning, so keep
  // raw chunks and extract details into the canonical onReasoning lane.
  includeRawChunks: true,
  extractReasoningFromRawChunk: extractOpenRouterReasoningFromRawChunk,
})

export default openrouterProviderAdapter
