import {
  cloneContractInput,
  deepFreeze,
  validateInternalId,
  validateInteger,
  validateOptionalString,
  validateSchemaVersion,
  validateTerminalTimestamps,
  validateTimestamp,
} from './agent-contract-utils.mjs'
import {
  AGENT_RECONCILIATION_STATES,
  AGENT_TERMINAL_STATUSES,
  validateAgentStatus,
} from './agent-status.mjs'
import { validateAgentUsage } from './agent-usage.mjs'
import { AGENT_POLICY_PROFILE_IDS } from './agent-policy-profile.mjs'
import {
  validateAgentProviderCapabilitySnapshot,
} from './agent-provider-capability-snapshot.mjs'

function validateUsage(value, expectedScope, field) {
  if (value === null) return null
  try {
    return validateAgentUsage(value, { expectedScope })
  } catch (error) {
    throw new TypeError(`${field}: ${error.message}`)
  }
}

export function validateAgentRun(input) {
  const source = cloneContractInput(input, 'agent run')
  validateSchemaVersion(source.schemaVersion)
  const id = validateInternalId(source.id, 'run.id')
  const rootNodeId = validateInternalId(source.rootNodeId, 'run.rootNodeId')
  const status = validateAgentStatus('run', source.status)
  if (!AGENT_POLICY_PROFILE_IDS.includes(source.policyProfileId)) {
    throw new TypeError('run.policyProfileId is invalid')
  }
  if (!Array.isArray(source.providerMix) || source.providerMix.length === 0) {
    throw new TypeError('run.providerMix must contain at least one provider ID')
  }
  const providerMix = [...new Set(source.providerMix.map((value) => validateInternalId(value, 'run.providerMix provider ID')))]
  if (providerMix.length !== source.providerMix.length) throw new TypeError('run.providerMix must not contain duplicates')
  const providerCapabilitySnapshots = (source.providerCapabilitySnapshots ?? []).map((snapshot) => (
    validateAgentProviderCapabilitySnapshot(snapshot)
  ))
  const routeKeys = providerCapabilitySnapshots.map((snapshot) => (
    `${snapshot.providerId}\u0000${snapshot.modelId}`
  ))
  if (new Set(routeKeys).size !== routeKeys.length) {
    throw new TypeError('run.providerCapabilitySnapshots must not contain duplicate routes')
  }
  if (providerCapabilitySnapshots.some((snapshot) => !providerMix.includes(snapshot.providerId))) {
    throw new TypeError('run.providerCapabilitySnapshots providerId must appear in providerMix')
  }

  const createdAt = validateTimestamp(source.createdAt, 'run.createdAt')
  const startedAt = validateTimestamp(source.startedAt, 'run.startedAt', { nullable: true })
  const finishedAt = validateTimestamp(source.finishedAt, 'run.finishedAt', { nullable: true })
  if (startedAt !== null && startedAt < createdAt) throw new TypeError('run.startedAt cannot be earlier than createdAt')
  validateTerminalTimestamps(status, AGENT_TERMINAL_STATUSES, startedAt, finishedAt)

  const finalAuthorityNodeId = validateInternalId(source.finalAuthorityNodeId, 'run.finalAuthorityNodeId')
  if (finalAuthorityNodeId !== rootNodeId) {
    throw new TypeError('run.finalAuthorityNodeId must equal rootNodeId')
  }

  const result = {
    ...source,
    schemaVersion: 1,
    id,
    projectId: validateInternalId(source.projectId, 'run.projectId'),
    threadId: validateInternalId(source.threadId, 'run.threadId'),
    turnId: validateInternalId(source.turnId, 'run.turnId'),
    rootNodeId,
    status,
    policyProfileId: source.policyProfileId,
    createdAt,
    startedAt,
    finishedAt,
    providerMix,
    providerCapabilitySnapshots,
    activeNodeCount: validateInteger(source.activeNodeCount, 'run.activeNodeCount'),
    queuedNodeCount: validateInteger(source.queuedNodeCount, 'run.queuedNodeCount'),
    terminalNodeCount: validateInteger(source.terminalNodeCount, 'run.terminalNodeCount'),
    exclusiveUsage: validateUsage(source.exclusiveUsage, 'exclusive', 'run.exclusiveUsage'),
    inclusiveUsage: validateUsage(source.inclusiveUsage, 'inclusive', 'run.inclusiveUsage'),
    budgetSnapshot: cloneContractInput(source.budgetSnapshot, 'run.budgetSnapshot'),
    finalAuthorityNodeId,
    completionReason: validateOptionalString(source.completionReason, 'run.completionReason', { maxLength: 1_000 }),
    reconciliationStatus: AGENT_RECONCILIATION_STATES.includes(source.reconciliationStatus)
      ? source.reconciliationStatus
      : (() => { throw new TypeError('run.reconciliationStatus is invalid') })(),
  }
  return deepFreeze(result)
}
