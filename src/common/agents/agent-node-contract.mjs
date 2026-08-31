import {
  cloneContractInput,
  deepFreeze,
  validateInternalId,
  validateInteger,
  validateOptionalExternalId,
  validateOptionalString,
  validateSchemaVersion,
  validateString,
  validateSummary,
  validateTerminalTimestamps,
  validateTimestamp,
} from './agent-contract-utils.mjs'
import { validateAgentCapabilities } from './agent-capabilities.mjs'
import {
  areAgentCapabilitiesEquivalent,
  validateAgentProviderCapabilitySnapshot,
} from './agent-provider-capability-snapshot.mjs'
import { validateAgentPermissionSnapshot } from './agent-permissions.mjs'
import {
  AGENT_TERMINAL_STATUSES,
  validateAgentStatus,
} from './agent-status.mjs'
import { validateAgentUsage } from './agent-usage.mjs'
import { validateAgentWorkspaceMode } from './agent-workspace.mjs'

function validateOptionalUsage(value, scope, field) {
  if (value === null) return null
  try {
    return validateAgentUsage(value, { expectedScope: scope })
  } catch (error) {
    throw new TypeError(`${field}: ${error.message}`)
  }
}

export function validateAgentNode(input) {
  const source = cloneContractInput(input, 'agent node')
  validateSchemaVersion(source.schemaVersion)
  const id = validateInternalId(source.id, 'node.id')
  const rootNodeId = validateInternalId(source.rootNodeId, 'node.rootNodeId')
  const isRoot = id === rootNodeId
  const parentNodeId = source.parentNodeId === null
    ? null
    : validateInternalId(source.parentNodeId, 'node.parentNodeId')
  const depth = validateInteger(source.depth, 'node.depth')
  const generation = validateInteger(source.generation, 'node.generation')

  if (isRoot && parentNodeId !== null) throw new TypeError('root node.parentNodeId must be null')
  if (!isRoot && parentNodeId === null) throw new TypeError('non-root node.parentNodeId is required')
  if (parentNodeId === id) throw new TypeError('node.parentNodeId cannot equal node.id')
  if (isRoot && depth !== 0) throw new TypeError('root node.depth must be 0')
  if (!isRoot && depth < 1) throw new TypeError('non-root node.depth must be at least 1')
  if (generation !== depth) throw new TypeError('node.generation must equal node.depth')
  if (!Array.isArray(source.branchPath)) throw new TypeError('node.branchPath must be an array')
  const branchPath = source.branchPath.map((value) => validateInternalId(value, 'node.branchPath entry'))
  if (branchPath.length !== depth + 1 || branchPath[0] !== rootNodeId || branchPath.at(-1) !== id) {
    throw new TypeError('node.branchPath must contain root-to-node identity for its depth')
  }
  if (new Set(branchPath).size !== branchPath.length) throw new TypeError('node.branchPath cannot contain cycles')

  const status = validateAgentStatus('node', source.status)
  const capabilitySnapshot = validateAgentCapabilities(source.capabilitySnapshot)
  const providerId = validateString(source.providerId, 'node.providerId', { maxLength: 512 })
  const modelId = validateString(source.modelId, 'node.modelId', { maxLength: 1_024 })
  const providerCapabilitySnapshot = source.providerCapabilitySnapshot == null
    ? null
    : validateAgentProviderCapabilitySnapshot(source.providerCapabilitySnapshot)
  if (providerCapabilitySnapshot && (
    providerCapabilitySnapshot.providerId !== providerId
    || providerCapabilitySnapshot.modelId !== modelId
  )) {
    throw new TypeError('node.providerCapabilitySnapshot route must match node provider and model')
  }
  if (providerCapabilitySnapshot && !areAgentCapabilitiesEquivalent(
    providerCapabilitySnapshot.nodeCapabilities,
    capabilitySnapshot,
  )) {
    throw new TypeError('node.capabilitySnapshot must match providerCapabilitySnapshot.nodeCapabilities')
  }
  const workspaceMode = validateAgentWorkspaceMode(source.workspaceMode, 'node.workspaceMode')
  if (capabilitySnapshot.mode === 'provider_opaque' && workspaceMode !== 'opaque_no_write_surface') {
    throw new TypeError('provider_opaque nodes require workspaceMode opaque_no_write_surface')
  }
  const createdAt = validateTimestamp(source.createdAt, 'node.createdAt')
  const startedAt = validateTimestamp(source.startedAt, 'node.startedAt', { nullable: true })
  const finishedAt = validateTimestamp(source.finishedAt, 'node.finishedAt', { nullable: true })
  if (startedAt !== null && startedAt < createdAt) throw new TypeError('node.startedAt cannot be earlier than createdAt')
  validateTerminalTimestamps(status, AGENT_TERMINAL_STATUSES, startedAt, finishedAt)

  return deepFreeze({
    ...source,
    schemaVersion: 1,
    id,
    runId: validateInternalId(source.runId, 'node.runId'),
    parentNodeId,
    rootNodeId,
    providerId,
    modelId,
    providerAgentId: validateOptionalExternalId(source.providerAgentId, 'node.providerAgentId'),
    providerThreadId: validateOptionalExternalId(source.providerThreadId, 'node.providerThreadId'),
    roleId: validateString(source.roleId, 'node.roleId', { maxLength: 256 }),
    roleLabel: validateString(source.roleLabel, 'node.roleLabel', { maxLength: 256 }),
    taskId: validateInternalId(source.taskId, 'node.taskId'),
    taskSummary: validateSummary(source.taskSummary, 'node.taskSummary', { maxLength: 1_000, nullable: false }),
    depth,
    branchPath,
    generation,
    spawnedByEventId: validateOptionalString(source.spawnedByEventId, 'node.spawnedByEventId', { maxLength: 256 }),
    spawnRequestId: validateOptionalString(source.spawnRequestId, 'node.spawnRequestId', { maxLength: 256 }),
    status,
    attemptId: validateOptionalString(source.attemptId, 'node.attemptId', { maxLength: 256 }),
    capabilitySnapshot,
    providerCapabilitySnapshot,
    permissionSnapshot: validateAgentPermissionSnapshot(source.permissionSnapshot),
    workspaceId: validateOptionalString(source.workspaceId, 'node.workspaceId', { maxLength: 256 }),
    workspaceMode,
    createdAt,
    startedAt,
    finishedAt,
    exclusiveUsage: validateOptionalUsage(source.exclusiveUsage, 'exclusive', 'node.exclusiveUsage'),
    inclusiveUsage: validateOptionalUsage(source.inclusiveUsage, 'inclusive', 'node.inclusiveUsage'),
    childCount: validateInteger(source.childCount, 'node.childCount'),
    resultSummary: validateSummary(source.resultSummary, 'node.resultSummary', {
      allowWhitespaceControl: true,
    }),
    errorSummary: validateSummary(source.errorSummary, 'node.errorSummary', {
      allowWhitespaceControl: true,
    }),
  })
}
