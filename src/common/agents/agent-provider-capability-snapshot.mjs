import {
  cloneContractInput,
  deepFreeze,
  validateEnum,
  validateInteger,
  validateInternalId,
  validateOptionalString,
  validateSchemaVersion,
  validateString,
} from './agent-contract-utils.mjs'
import {
  assertCapabilitySubset,
  validateAgentCapabilities,
} from './agent-capabilities.mjs'

export const AGENT_PROVIDER_CAPABILITY_FIELDS = Object.freeze([
  'create',
  'start',
  'resume',
  'message',
  'interrupt',
  'cancel',
  'dispose',
  'retry',
  'streaming',
  'usage',
  'artifacts',
])

export const AGENT_PROVIDER_RUNTIME_AVAILABILITY = Object.freeze([
  'available',
  'unavailable',
  'unknown',
])

const EVIDENCE_CONFIDENCE = Object.freeze(['verified', 'declared', 'inferred', 'unknown'])

function validateOperations(input, field) {
  const source = cloneContractInput(input, field)
  const result = {}
  for (const capability of AGENT_PROVIDER_CAPABILITY_FIELDS) {
    if (typeof source[capability] !== 'boolean') {
      throw new TypeError(`${field}.${capability} must be boolean`)
    }
    result[capability] = source[capability]
  }
  return deepFreeze(result)
}

function validateRuntimeAvailability(input) {
  const source = cloneContractInput(input, 'provider capability runtimeAvailability')
  const status = validateEnum(
    source.status,
    'runtimeAvailability.status',
    AGENT_PROVIDER_RUNTIME_AVAILABILITY,
  )
  const reason = validateOptionalString(
    source.reason,
    'runtimeAvailability.reason',
    { maxLength: 1_000 },
  )
  if (status !== 'available' && !reason) {
    throw new TypeError(`runtimeAvailability.reason is required when status is ${status}`)
  }
  return deepFreeze({ status, reason })
}

function validateEvidence(input) {
  const source = cloneContractInput(input, 'provider capability evidence')
  if (!Array.isArray(source.provenance) || source.provenance.length === 0) {
    throw new TypeError('provider capability evidence.provenance must not be empty')
  }
  const provenance = source.provenance.map((entry) => (
    validateString(entry, 'provider capability evidence.provenance entry', { maxLength: 1_024 })
  ))
  return deepFreeze({
    sourceClass: validateString(source.sourceClass, 'provider capability evidence.sourceClass', {
      maxLength: 256,
    }),
    confidence: validateEnum(
      source.confidence,
      'provider capability evidence.confidence',
      EVIDENCE_CONFIDENCE,
    ),
    provenance: [...new Set(provenance)],
  })
}

function validateModelCapabilities(input) {
  const source = cloneContractInput(input, 'model agent capabilities')
  if (source.agentRuntime !== null && typeof source.agentRuntime !== 'boolean') {
    throw new TypeError('modelCapabilities.agentRuntime must be boolean or null')
  }
  if (!Array.isArray(source.disabledCapabilities)) {
    throw new TypeError('modelCapabilities.disabledCapabilities must be an array')
  }
  const disabledCapabilities = source.disabledCapabilities.map((entry) => (
    validateEnum(entry, 'modelCapabilities.disabledCapabilities entry', AGENT_PROVIDER_CAPABILITY_FIELDS)
  ))
  if (new Set(disabledCapabilities).size !== disabledCapabilities.length) {
    throw new TypeError('modelCapabilities.disabledCapabilities must not contain duplicates')
  }
  const validateHint = (value, field) => (
    value === null ? null : validateInteger(value, field, { min: 1, max: 100_000 })
  )
  return deepFreeze({
    agentRuntime: source.agentRuntime,
    disabledCapabilities,
    maxDepthHint: validateHint(source.maxDepthHint, 'modelCapabilities.maxDepthHint'),
    maxConcurrencyHint: validateHint(
      source.maxConcurrencyHint,
      'modelCapabilities.maxConcurrencyHint',
    ),
  })
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

export function areAgentCapabilitiesEquivalent(left, right) {
  return canonicalJson(validateAgentCapabilities(left)) === canonicalJson(validateAgentCapabilities(right))
}

export function validateAgentProviderCapabilitySnapshot(input) {
  const source = cloneContractInput(input, 'agent provider capability snapshot')
  validateSchemaVersion(source.schemaVersion)
  const providerCapabilities = cloneContractInput(
    source.providerCapabilities,
    'providerCapabilities',
  )
  const providerNode = validateAgentCapabilities(providerCapabilities.node)
  const nodeCapabilities = validateAgentCapabilities(source.nodeCapabilities)
  const runtimeAvailability = validateRuntimeAvailability(source.runtimeAvailability)
  const modelCapabilities = validateModelCapabilities(source.modelCapabilities)
  const providerOperations = validateOperations(
    providerCapabilities.operations,
    'providerCapabilities.operations',
  )
  const runCapabilities = validateOperations(source.runCapabilities, 'runCapabilities')

  for (const capability of AGENT_PROVIDER_CAPABILITY_FIELDS) {
    if (runCapabilities[capability] && !providerOperations[capability]) {
      throw new TypeError(`runCapabilities.${capability} would widen provider evidence`)
    }
    if (modelCapabilities.disabledCapabilities.includes(capability) && runCapabilities[capability]) {
      throw new TypeError(`runCapabilities.${capability} is disabled by model capabilities`)
    }
  }
  if (runtimeAvailability.status !== 'available' && Object.values(runCapabilities).some(Boolean)) {
    throw new TypeError('unavailable or unknown runtimes cannot expose run capabilities')
  }
  if (nodeCapabilities.mode !== 'contract_only') {
    assertCapabilitySubset(providerNode, nodeCapabilities)
  }

  return deepFreeze({
    schemaVersion: 1,
    adapterId: validateInternalId(
      source.adapterId ?? source.providerId,
      'provider capability adapterId',
    ),
    providerId: validateInternalId(source.providerId, 'provider capability providerId'),
    modelId: validateString(source.modelId, 'provider capability modelId', { maxLength: 1_024 }),
    capturedAt: validateInteger(source.capturedAt, 'provider capability capturedAt'),
    runtimeAvailability,
    providerCapabilities: {
      operations: providerOperations,
      node: providerNode,
      evidence: validateEvidence(providerCapabilities.evidence),
    },
    modelCapabilities,
    runCapabilities,
    nodeCapabilities,
  })
}
