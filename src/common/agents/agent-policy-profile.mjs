import {
  cloneContractInput,
  deepFreeze,
  validateEnum,
  validateInteger,
  validateNumber,
} from './agent-contract-utils.mjs'

export const AGENT_POLICY_PROFILE_IDS = Object.freeze(['conservative', 'balanced', 'high', 'ultra'])

export const AGENT_POLICY_HARD_CEILINGS = deepFreeze({
  maxDepth: 8,
  maxLiveAgents: 64,
  maxDescendants: 512,
  maxFanOut: 64,
  maxQueuedNodes: 1_024,
  maxSpawnsPerMinute: 240,
  maxAttemptsPerNode: 16,
  maxTotalTokens: 2_000_000,
  maxCostUsd: 1_000,
  maxDurationMs: 14_400_000,
  maxToolCalls: 10_000,
  cancellationDeadlineMs: 60_000,
})

const AGENT_POLICY_PROFILES = deepFreeze({
  conservative: {
    maxDepth: 2,
    maxLiveAgents: 4,
    maxDescendants: 16,
    maxFanOut: 4,
    maxQueuedNodes: 32,
    maxSpawnsPerMinute: 12,
    maxAttemptsPerNode: 2,
    maxTotalTokens: 120_000,
    maxCostUsd: 20,
    maxDurationMs: 600_000,
    maxToolCalls: 200,
    cancellationDeadlineMs: 15_000,
  },
  balanced: {
    maxDepth: 4,
    maxLiveAgents: 8,
    maxDescendants: 64,
    maxFanOut: 8,
    maxQueuedNodes: 128,
    maxSpawnsPerMinute: 30,
    maxAttemptsPerNode: 3,
    maxTotalTokens: 400_000,
    maxCostUsd: 75,
    maxDurationMs: 1_800_000,
    maxToolCalls: 600,
    cancellationDeadlineMs: 20_000,
  },
  high: {
    maxDepth: 6,
    maxLiveAgents: 24,
    maxDescendants: 160,
    maxFanOut: 16,
    maxQueuedNodes: 320,
    maxSpawnsPerMinute: 90,
    maxAttemptsPerNode: 5,
    maxTotalTokens: 1_000_000,
    maxCostUsd: 250,
    maxDurationMs: 7_200_000,
    maxToolCalls: 2_000,
    cancellationDeadlineMs: 30_000,
  },
  ultra: { ...AGENT_POLICY_HARD_CEILINGS },
})

function validateLimits(input) {
  const result = {}
  for (const [field, ceiling] of Object.entries(AGENT_POLICY_HARD_CEILINGS)) {
    const value = field === 'maxCostUsd'
      ? validateNumber(input[field], `policy.${field}`, { min: 0, max: ceiling })
      : validateInteger(input[field], `policy.${field}`, { min: 1, max: ceiling })
    if (value > ceiling) throw new TypeError(`policy.${field} exceeds its hard ceiling`)
    result[field] = value
  }
  return result
}

function validateOverrides(input) {
  if (input === undefined || input === null) return {}
  const source = cloneContractInput(input, 'policy overrides')
  for (const key of Object.keys(source)) {
    if (!(key in AGENT_POLICY_HARD_CEILINGS)) throw new TypeError(`Unknown policy override: ${key}`)
    const ceiling = AGENT_POLICY_HARD_CEILINGS[key]
    const value = source[key]
    if (!Number.isFinite(value) || value < 0 || value > ceiling) {
      throw new TypeError(`policy.${key} exceeds its hard ceiling`)
    }
  }
  return source
}

function validateProviderHints(input = {}) {
  const source = cloneContractInput(input, 'provider hints')
  const validateHint = (value, field) => value === null || value === undefined
    ? null
    : validateInteger(value, field, { min: 1, max: 100_000 })
  return {
    maxDepthHint: validateHint(source.maxDepthHint, 'providerHints.maxDepthHint'),
    maxConcurrencyHint: validateHint(source.maxConcurrencyHint, 'providerHints.maxConcurrencyHint'),
  }
}

export function resolveAgentPolicyProfile(profileId, { overrides, providerHints = {} } = {}) {
  validateEnum(profileId, 'agent policy profile', AGENT_POLICY_PROFILE_IDS)
  const limits = validateLimits({ ...AGENT_POLICY_PROFILES[profileId], ...validateOverrides(overrides) })
  const hints = validateProviderHints(providerHints)
  const effectiveLimits = {
    ...limits,
    maxDepth: hints.maxDepthHint === null ? limits.maxDepth : Math.min(limits.maxDepth, hints.maxDepthHint),
    maxLiveAgents: hints.maxConcurrencyHint === null
      ? limits.maxLiveAgents
      : Math.min(limits.maxLiveAgents, hints.maxConcurrencyHint),
  }
  return deepFreeze({ id: profileId, limits, providerHints: hints, effectiveLimits })
}
