import {
  cloneContractInput,
  cloneSerializable,
  deepFreeze,
  validateEnum,
  validateInteger,
  validateNumber,
} from './agent-contract-utils.mjs'

export const AGENT_USAGE_SCOPES = Object.freeze(['exclusive', 'inclusive', 'unknown_scope'])

export function validateAgentUsage(input, { expectedScope = null } = {}) {
  const source = cloneContractInput(input, 'agent usage')
  const scope = validateEnum(source.scope, 'usage.scope', AGENT_USAGE_SCOPES)
  if (expectedScope && scope !== expectedScope) {
    throw new TypeError(`usage scope must be ${expectedScope}`)
  }
  const inputTokens = validateInteger(source.inputTokens, 'usage.inputTokens')
  const outputTokens = validateInteger(source.outputTokens, 'usage.outputTokens')
  const cachedInputTokens = validateInteger(source.cachedInputTokens, 'usage.cachedInputTokens')
  const reasoningTokens = validateInteger(source.reasoningTokens, 'usage.reasoningTokens')
  const totalTokens = validateInteger(source.totalTokens, 'usage.totalTokens')
  if (totalTokens < inputTokens + outputTokens) {
    throw new TypeError('usage.totalTokens cannot be smaller than inputTokens + outputTokens')
  }
  if (cachedInputTokens > inputTokens) throw new TypeError('usage.cachedInputTokens cannot exceed inputTokens')
  if (reasoningTokens > outputTokens) throw new TypeError('usage.reasoningTokens cannot exceed outputTokens')

  return deepFreeze({
    ...source,
    scope,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    totalTokens,
    costUsd: validateNumber(source.costUsd, 'usage.costUsd'),
    rawProviderUsage: source.rawProviderUsage === null
      ? null
      : cloneSerializable(source.rawProviderUsage, 'usage.rawProviderUsage'),
  })
}

export function isAuthoritativeAgentUsage(usage) {
  return usage?.scope === 'exclusive' || usage?.scope === 'inclusive'
}
