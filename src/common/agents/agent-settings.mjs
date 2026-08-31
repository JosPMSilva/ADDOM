import {
  AGENT_POLICY_HARD_CEILINGS,
  AGENT_POLICY_PROFILE_IDS,
  resolveAgentPolicyProfile,
} from './agent-policy-profile.mjs'
import { deepFreeze } from './agent-contract-utils.mjs'

const EDITABLE_LIMIT_FIELDS = Object.freeze([
  'maxLiveAgents',
  'maxDepth',
  'maxDescendants',
  'maxTotalTokens',
  'maxCostUsd',
  'maxDurationMs',
])

function profileId(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return AGENT_POLICY_PROFILE_IDS.includes(normalized) ? normalized : 'balanced'
}

function boundedNumber(value, fallback, ceiling, { integer = true, minimum = 1 } = {}) {
  const parsed = Number(value)
  const candidate = Number.isFinite(parsed) ? parsed : fallback
  const bounded = Math.max(minimum, Math.min(ceiling, candidate))
  return integer ? Math.round(bounded) : bounded
}

function normalizeLimits(raw = {}, selectedProfile = 'balanced') {
  const source = raw && typeof raw === 'object' ? raw : {}
  const defaults = resolveAgentPolicyProfile(selectedProfile).limits
  const limits = {}
  for (const field of EDITABLE_LIMIT_FIELDS) {
    limits[field] = boundedNumber(
      source[field],
      defaults[field],
      AGENT_POLICY_HARD_CEILINGS[field],
      {
        integer: field !== 'maxCostUsd',
        minimum: field === 'maxCostUsd' ? 0 : 1,
      },
    )
  }
  return limits
}

function normalizeProviderConcurrencyCaps(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result = {}
  for (const [providerId, value] of Object.entries(raw).slice(0, 32)) {
    const id = String(providerId || '').trim().toLowerCase().slice(0, 128)
    if (!id) continue
    result[id] = boundedNumber(
      value,
      AGENT_POLICY_HARD_CEILINGS.maxLiveAgents,
      AGENT_POLICY_HARD_CEILINGS.maxLiveAgents,
    )
  }
  return result
}

export function normalizeAgentSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const defaultProfile = profileId(source.defaultProfile)
  return deepFreeze({
    enabled: source.enabled !== false,
    defaultProfile,
    fanoutConfirmationThreshold: boundedNumber(
      source.fanoutConfirmationThreshold,
      5,
      AGENT_POLICY_HARD_CEILINGS.maxDescendants,
    ),
    limits: normalizeLimits(source.limits, defaultProfile),
    writeIsolation: 'required',
    providerConcurrencyCaps: normalizeProviderConcurrencyCaps(source.providerConcurrencyCaps),
  })
}

export const DEFAULT_AGENT_SETTINGS = normalizeAgentSettings()

export function resolveAgentPolicyFromSettings(raw = {}, providerHints = {}) {
  const settings = normalizeAgentSettings(raw)
  const policy = resolveAgentPolicyProfile(settings.defaultProfile, {
    overrides: settings.limits,
    providerHints,
  })
  return deepFreeze({
    ...policy,
    effectiveLimits: {
      ...policy.effectiveLimits,
      providerConcurrencyCaps: settings.providerConcurrencyCaps,
    },
  })
}

export function listEditableAgentLimitFields() {
  return [...EDITABLE_LIMIT_FIELDS]
}
