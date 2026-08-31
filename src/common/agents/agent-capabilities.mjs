import {
  cloneContractInput,
  deepFreeze,
  validateEnum,
  validateInteger,
  validateOptionalString,
} from './agent-contract-utils.mjs'

export const AGENT_CAPABILITY_MODES = Object.freeze([
  'native_hierarchy',
  'partial_native_projection',
  'managed_hierarchy',
  'provider_opaque',
  'contract_only',
])

export const AGENT_CAPABILITY_KEYS = Object.freeze({
  native_hierarchy: 'native_hierarchy',
  partial_native_projection: 'partial_native_projection',
  managed_hierarchy: 'managed_hierarchy',
  provider_opaque: 'provider_managed_partial_visibility',
  contract_only: 'contract_only',
})

const BOOLEAN_FIELDS = Object.freeze([
  'nativeAgents',
  'recursiveAgents',
  'childStreams',
  'addressableChildren',
  'childMessaging',
  'childCancellation',
  'childRetry',
  'resumableChildren',
  'perNodeUsage',
  'approvalAttribution',
  'workspaceIsolation',
])

const NEGOTIABLE_BOOLEAN_FIELDS = Object.freeze(
  BOOLEAN_FIELDS.filter((field) => field !== 'nativeAgents'),
)

const ADDRESSABLE_CHILD_FEATURES = Object.freeze([
  'childStreams',
  'childMessaging',
  'childCancellation',
  'childRetry',
  'resumableChildren',
])

function validateHint(value, field) {
  if (value === null) return null
  return validateInteger(value, field, { min: 1, max: 100_000 })
}

export function validateAgentCapabilities(input) {
  const source = cloneContractInput(input, 'agent capability snapshot')
  const mode = validateEnum(source.mode, 'capability.mode', AGENT_CAPABILITY_MODES)
  const result = { ...source, mode }
  for (const field of BOOLEAN_FIELDS) {
    if (typeof source[field] !== 'boolean') throw new TypeError(`capability.${field} must be boolean`)
    result[field] = source[field]
  }
  result.maxDepthHint = validateHint(source.maxDepthHint, 'capability.maxDepthHint')
  result.maxConcurrencyHint = validateHint(source.maxConcurrencyHint, 'capability.maxConcurrencyHint')
  result.visibilityReason = validateOptionalString(source.visibilityReason, 'capability.visibilityReason', { maxLength: 1_000 })
  result.capabilityKey = validateEnum(
    source.capabilityKey,
    'capability.capabilityKey',
    Object.values(AGENT_CAPABILITY_KEYS),
  )

  if (result.capabilityKey !== AGENT_CAPABILITY_KEYS[mode]) {
    throw new TypeError(`capability.capabilityKey must match mode ${mode}`)
  }
  if (mode === 'native_hierarchy' && !result.nativeAgents) {
    throw new TypeError('native_hierarchy requires nativeAgents')
  }
  if (mode === 'partial_native_projection' && !result.nativeAgents) {
    throw new TypeError('partial_native_projection requires nativeAgents')
  }
  if (mode === 'provider_opaque') {
    const prohibited = [
      'recursiveAgents',
      'childStreams',
      'addressableChildren',
      'childMessaging',
      'childCancellation',
      'childRetry',
      'resumableChildren',
      'perNodeUsage',
      'approvalAttribution',
      'workspaceIsolation',
    ]
    if (prohibited.some((field) => result[field])) {
      throw new TypeError('provider_opaque capabilities cannot claim addressable child controls or attribution')
    }
    if (result.maxDepthHint !== null || result.maxConcurrencyHint !== null) {
      throw new TypeError('provider_opaque capability hints must be null')
    }
    if (!result.visibilityReason) throw new TypeError('provider_opaque requires a visibilityReason')
  }
  for (const field of ADDRESSABLE_CHILD_FEATURES) {
    if (result[field] && !result.addressableChildren) {
      throw new TypeError(`capability.${field} requires addressableChildren`)
    }
  }
  if (mode === 'contract_only') {
    if (BOOLEAN_FIELDS.some((field) => result[field])) {
      throw new TypeError('contract_only capabilities cannot claim runtime support')
    }
    if (result.maxDepthHint !== null || result.maxConcurrencyHint !== null) {
      throw new TypeError('contract_only capability hints must be null')
    }
  }

  return deepFreeze(result)
}

export function assertCapabilitySubset(availableInput, requestedInput) {
  const available = validateAgentCapabilities(availableInput)
  const requested = validateAgentCapabilities(requestedInput)
  for (const field of BOOLEAN_FIELDS) {
    if (requested[field] && !available[field]) {
      throw new TypeError(`Capability ${field} would widen the available snapshot`)
    }
  }
  for (const field of ['maxDepthHint', 'maxConcurrencyHint']) {
    if (available[field] !== null && (requested[field] === null || requested[field] > available[field])) {
      throw new TypeError(`Capability ${field} would widen the available snapshot`)
    }
  }
  return true
}

export function intersectAgentCapabilities(availableInput, requestedInput) {
  const available = validateAgentCapabilities(availableInput)
  const requested = validateAgentCapabilities(requestedInput)
  const result = { ...available }
  for (const field of NEGOTIABLE_BOOLEAN_FIELDS) result[field] = available[field] && requested[field]
  for (const field of ['maxDepthHint', 'maxConcurrencyHint']) {
    const values = [available[field], requested[field]].filter((value) => value !== null)
    result[field] = values.length > 0 ? Math.min(...values) : null
  }
  return validateAgentCapabilities(result)
}
