export const EXECUTION_CAPABILITY_PROFILES = Object.freeze({
  reasoning_and_tools: Object.freeze({ reasoning: true, commentary: true, tools: true }),
  reasoning_and_tools_no_answer: Object.freeze({ reasoning: true, commentary: false, tools: true }),
  commentary_and_tools: Object.freeze({ reasoning: false, commentary: true, tools: true }),
  tools_only: Object.freeze({ reasoning: false, commentary: false, tools: true }),
})

const PROFILE_BY_FAMILY = Object.freeze({
  openai_account: 'reasoning_and_tools',
  openai_api: 'reasoning_and_tools',
  anthropic: 'reasoning_and_tools',
  gemini: 'reasoning_and_tools',
  deepseek: 'reasoning_and_tools',
  openrouter: 'reasoning_and_tools',
  cursor: 'reasoning_and_tools_no_answer',
  generic: 'tools_only',
})

/**
 * Map a turn/provider id onto an execution capability family.
 * Provider ids like `openrouter` are not families by themselves; without this
 * mapping they previously fell through to tools_only and hid thinking UI.
 */
export function resolveExecutionFamilyFromProviderId(providerId = '') {
  const id = String(providerId || '').trim().toLowerCase()
  if (!id) return ''
  if (id === 'openrouter') return 'openrouter'
  if (id === 'openai' || id === 'openai_api') return 'openai_api'
  if (id === 'openai_account' || id === 'codex') return 'openai_account'
  if (id === 'anthropic') return 'anthropic'
  if (id === 'gemini' || id === 'google') return 'gemini'
  if (id === 'cursor') return 'cursor'
  if (Object.prototype.hasOwnProperty.call(PROFILE_BY_FAMILY, id)) return id
  return id
}

export function resolveExecutionCapabilityProfile({ family = '', providerId = '' } = {}) {
  const normalizedFamily = String(family || resolveExecutionFamilyFromProviderId(providerId) || '')
    .trim()
    .toLowerCase()
  const profileId = PROFILE_BY_FAMILY[normalizedFamily] || 'tools_only'
  return EXECUTION_CAPABILITY_PROFILES[profileId]
}
