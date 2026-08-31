export const OPENROUTER_COMPATIBILITY_ENTRIES = Object.freeze([
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-fable-5', routeId: 'anthropic/claude-fable-5', status: 'direct', notes: '' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-opus-4-8', routeId: 'anthropic/claude-opus-4.8', status: 'direct', notes: 'ID punctuation differs.' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-sonnet-5', routeId: 'anthropic/claude-sonnet-5', status: 'direct', notes: '' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-opus-4-7', routeId: 'anthropic/claude-opus-4.7', status: 'direct', notes: 'ID punctuation differs.' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-opus-4-6', routeId: 'anthropic/claude-opus-4.6', status: 'direct', notes: 'ID punctuation differs.' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-sonnet-4-6', routeId: 'anthropic/claude-sonnet-4.6', status: 'direct', notes: 'ID punctuation differs.' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-haiku-4-5', routeId: 'anthropic/claude-haiku-4.5', status: 'direct', notes: 'ID punctuation differs.' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-opus-4-5', routeId: 'anthropic/claude-opus-4.5', status: 'direct', notes: 'ID punctuation differs.' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-sonnet-4-5', routeId: 'anthropic/claude-sonnet-4.5', status: 'direct', notes: 'ID punctuation differs.' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-opus-4-0', routeId: 'anthropic/claude-opus-4', status: 'remap', notes: 'Drop trailing `.0`.' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-sonnet-4-0', routeId: 'anthropic/claude-sonnet-4', status: 'remap', notes: 'Drop trailing `.0`.' },
  { sourceProviderId: 'anthropic', sourceModelId: 'claude-opus-4-1', routeId: 'anthropic/claude-opus-4.1', status: 'direct', notes: 'ID punctuation differs.' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.6-sol', routeId: 'openai/gpt-5.6-sol', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.6-terra', routeId: 'openai/gpt-5.6-terra', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.6-luna', routeId: 'openai/gpt-5.6-luna', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.5', routeId: 'openai/gpt-5.5', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.5-pro', routeId: 'openai/gpt-5.5-pro', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.4-pro', routeId: 'openai/gpt-5.4-pro', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.4-mini', routeId: 'openai/gpt-5.4-mini', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.4-nano', routeId: 'openai/gpt-5.4-nano', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.4', routeId: 'openai/gpt-5.4', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.3-codex', routeId: 'openai/gpt-5.3-codex', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.2', routeId: 'openai/gpt-5.2', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.1', routeId: 'openai/gpt-5.1', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5-mini', routeId: 'openai/gpt-5-mini', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5-nano', routeId: 'openai/gpt-5-nano', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.2-codex', routeId: 'openai/gpt-5.2-codex', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.1-codex', routeId: 'openai/gpt-5.1-codex', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.1-codex-mini', routeId: 'openai/gpt-5.1-codex-mini', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5-codex', routeId: 'openai/gpt-5-codex', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-5.1-codex-max', routeId: 'openai/gpt-5.1-codex-max', status: 'direct', notes: '' },
  { sourceProviderId: 'openai', sourceModelId: 'gpt-4.1-mini', routeId: 'openai/gpt-4.1-mini', status: 'direct', notes: '' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-3.5-flash', routeId: 'google/gemini-3.5-flash', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-3.1-pro-preview', routeId: 'google/gemini-3.1-pro-preview', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-3.1-flash-lite', routeId: 'google/gemini-3.1-flash-lite', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-3-pro-preview', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-3-flash-preview', routeId: 'google/gemini-3-flash-preview', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-2.5-pro', routeId: 'google/gemini-2.5-pro', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-2.5-flash', routeId: 'google/gemini-2.5-flash', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-2.5-flash-lite', routeId: 'google/gemini-2.5-flash-lite', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-2.0-flash', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'gemini', sourceModelId: 'gemini-2.0-flash-lite', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'moonshot', sourceModelId: 'kimi-k2.5', routeId: 'moonshotai/kimi-k2.5', status: 'direct', notes: '' },
  { sourceProviderId: 'moonshot', sourceModelId: 'kimi-k2.6', routeId: 'moonshotai/kimi-k2.6', status: 'direct', notes: '' },
  { sourceProviderId: 'moonshot', sourceModelId: 'kimi-k2.7-code', routeId: 'moonshotai/kimi-k2.7-code', status: 'direct', notes: '' },
  { sourceProviderId: 'moonshot', sourceModelId: 'kimi-k2.7-code-highspeed', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'moonshot', sourceModelId: 'kimi-k2-0905-preview', routeId: 'moonshotai/kimi-k2-0905', status: 'remap', notes: 'Preview suffix differs.' },
  { sourceProviderId: 'moonshot', sourceModelId: 'kimi-k2-turbo-preview', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'moonshot', sourceModelId: 'kimi-k2-thinking', routeId: 'moonshotai/kimi-k2-thinking', status: 'direct', notes: '' },
  { sourceProviderId: 'moonshot', sourceModelId: 'kimi-k2-thinking-turbo', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4.5', routeId: 'x-ai/grok-4.5', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4.3', routeId: 'x-ai/grok-4.3', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4.20-0309-reasoning', routeId: 'x-ai/grok-4.20', status: 'remap', notes: 'OpenRouter does not expose the dated reasoning suffix.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4.20-0309-non-reasoning', routeId: 'x-ai/grok-4.20', status: 'remap', notes: 'OpenRouter does not expose the dated non-reasoning suffix.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4.20-multi-agent-0309', routeId: 'x-ai/grok-4.20-multi-agent', status: 'remap', notes: 'OpenRouter does not expose the dated suffix.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4-fast-reasoning', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4-fast-non-reasoning', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4-1-fast-reasoning', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-4-1-fast-non-reasoning', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-code-fast-1', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-3', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'grok', sourceModelId: 'grok-3-mini', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'groq', sourceModelId: 'llama-3.3-70b-versatile', routeId: '', status: 'unsupported', notes: 'No current non-free OpenRouter route found.' },
  { sourceProviderId: 'groq', sourceModelId: 'llama-3.1-8b-instant', routeId: '', status: 'unsupported', notes: 'No current non-free OpenRouter route found.' },
  { sourceProviderId: 'groq', sourceModelId: 'meta-llama/llama-4-scout-17b-16e-instruct', routeId: '', status: 'unsupported', notes: 'Current OpenRouter catalog did not expose this exact route.' },
  { sourceProviderId: 'groq', sourceModelId: 'moonshotai/kimi-k2-instruct-0905', routeId: 'moonshotai/kimi-k2-0905', status: 'remap', notes: 'Similar family; requires explicit remap.' },
  { sourceProviderId: 'groq', sourceModelId: 'openai/gpt-oss-120b', routeId: 'openai/gpt-oss-120b', status: 'direct', notes: '' },
  { sourceProviderId: 'groq', sourceModelId: 'openai/gpt-oss-20b', routeId: 'openai/gpt-oss-20b', status: 'direct', notes: '' },
  { sourceProviderId: 'groq', sourceModelId: 'openai/gpt-oss-safeguard-20b', routeId: 'openai/gpt-oss-safeguard-20b', status: 'direct', notes: '' },
  { sourceProviderId: 'groq', sourceModelId: 'qwen/qwen3-32b', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'mistral', sourceModelId: 'mistral-large-2512', routeId: 'mistralai/mistral-large-2512', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'mistral', sourceModelId: 'mistral-medium-2604', routeId: 'mistralai/mistral-medium-3-5', status: 'remap', notes: 'OpenRouter uses the marketed version name.' },
  { sourceProviderId: 'mistral', sourceModelId: 'mistral-small-2603', routeId: 'mistralai/mistral-small-2603', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'mistral', sourceModelId: 'mistral-medium-2508', routeId: 'mistralai/mistral-medium-3.1', status: 'remap', notes: 'Branding/version naming differs.' },
  { sourceProviderId: 'mistral', sourceModelId: 'mistral-small-2506', routeId: '', status: 'unsupported', notes: 'No current non-free OpenRouter route found.' },
  { sourceProviderId: 'mistral', sourceModelId: 'magistral-medium-2509', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'mistral', sourceModelId: 'magistral-small-2509', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'mistral', sourceModelId: 'devstral-2512', routeId: 'mistralai/devstral-2512', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'mistral', sourceModelId: 'codestral-2508', routeId: 'mistralai/codestral-2508', status: 'direct', notes: 'Provider namespace changes.' },
  { sourceProviderId: 'mistral', sourceModelId: 'devstral-medium-2507', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'mistral', sourceModelId: 'devstral-small-2507', routeId: '', status: 'unsupported', notes: 'Retired OpenRouter route.' },
  { sourceProviderId: 'deepseek', sourceModelId: 'deepseek-v4-flash', routeId: 'deepseek/deepseek-v4-flash', status: 'direct', notes: '' },
  { sourceProviderId: 'deepseek', sourceModelId: 'deepseek-v4-pro', routeId: 'deepseek/deepseek-v4-pro', status: 'direct', notes: '' },
  { sourceProviderId: 'deepseek', sourceModelId: 'deepseek-chat', routeId: 'deepseek/deepseek-chat-v3.1', status: 'remap', notes: 'Current OpenRouter chat route is versioned as v3.1.' },
  { sourceProviderId: 'deepseek', sourceModelId: 'deepseek-chat', routeId: 'deepseek/deepseek-v3.2', status: 'remap', notes: 'Current native DeepSeek chat family corresponds to V3.2; keep the explicit OpenRouter V3.2 route reviewed.' },
  { sourceProviderId: 'deepseek', sourceModelId: 'deepseek-reasoner', routeId: '', status: 'unsupported', notes: 'No current non-free OpenRouter R1 route found.' },
  { sourceProviderId: 'perplexity', sourceModelId: 'sonar-pro', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'perplexity', sourceModelId: 'sonar', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'perplexity', sourceModelId: 'sonar-reasoning-pro', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
  { sourceProviderId: 'perplexity', sourceModelId: 'sonar-deep-research', routeId: '', status: 'unsupported', notes: 'No current OpenRouter route found.' },
])

export const OPENROUTER_SUPPORTED_COMPATIBILITY_ENTRIES = Object.freeze(
  OPENROUTER_COMPATIBILITY_ENTRIES.filter((entry) => entry.status !== 'unsupported' && entry.routeId),
)

export const OPENROUTER_SUPPORTED_ROUTE_IDS = Object.freeze(
  Array.from(new Set(OPENROUTER_SUPPORTED_COMPATIBILITY_ENTRIES.map((entry) => entry.routeId))),
)

export function findOpenRouterCompatibilityByRouteId(routeId = '') {
  const normalized = String(routeId || '').trim().toLowerCase()
  if (!normalized) return null
  return OPENROUTER_SUPPORTED_COMPATIBILITY_ENTRIES.find((entry) => entry.routeId.toLowerCase() === normalized) || null
}

export function listOpenRouterCompatibilityBySource(providerId = '', modelId = '') {
  const provider = String(providerId || '').trim().toLowerCase()
  const model = String(modelId || '').trim().toLowerCase()
  return OPENROUTER_SUPPORTED_COMPATIBILITY_ENTRIES.filter((entry) => {
    return (
      (!provider || entry.sourceProviderId === provider)
      && (!model || entry.sourceModelId.toLowerCase() === model)
    )
  })
}
