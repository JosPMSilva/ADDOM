import {
  cloneContractInput,
  deepFreeze,
  validateInternalId,
  validateInteger,
  validateOptionalExternalId,
  validateOptionalString,
  validateSchemaVersion,
  validateTerminalTimestamps,
  validateTimestamp,
} from './agent-contract-utils.mjs'
import { validateAgentCapabilities } from './agent-capabilities.mjs'
import {
  areAgentCapabilitiesEquivalent,
  validateAgentProviderCapabilitySnapshot,
} from './agent-provider-capability-snapshot.mjs'
import { validateAgentBackgroundKind } from './agent-cancellation.mjs'
import { validateAgentPermissionSnapshot } from './agent-permissions.mjs'
import {
  AGENT_RECONCILIATION_STATES,
  AGENT_TERMINAL_STATUSES,
  validateAgentStatus,
} from './agent-status.mjs'
import { validateAgentUsage } from './agent-usage.mjs'
import { validateAgentWorkspaceMode } from './agent-workspace.mjs'

export function validateAgentAttempt(input) {
  const source = cloneContractInput(input, 'agent attempt')
  validateSchemaVersion(source.schemaVersion)
  const id = validateInternalId(source.id, 'attempt.id')
  const status = validateAgentStatus('attempt', source.status)
  const startedAt = validateTimestamp(source.startedAt, 'attempt.startedAt', { nullable: true })
  const finishedAt = validateTimestamp(source.finishedAt, 'attempt.finishedAt', { nullable: true })
  validateTerminalTimestamps(status, AGENT_TERMINAL_STATUSES, startedAt, finishedAt)
  if (!AGENT_RECONCILIATION_STATES.includes(source.reconciliationState)) {
    throw new TypeError('attempt.reconciliationState is invalid')
  }
  if (typeof source.background !== 'boolean') throw new TypeError('attempt.background must be boolean')
  const capabilitySnapshot = validateAgentCapabilities(source.capabilitySnapshot)
  const providerCapabilitySnapshot = source.providerCapabilitySnapshot == null
    ? null
    : validateAgentProviderCapabilitySnapshot(source.providerCapabilitySnapshot)
  if (providerCapabilitySnapshot && !areAgentCapabilitiesEquivalent(
    providerCapabilitySnapshot.nodeCapabilities,
    capabilitySnapshot,
  )) {
    throw new TypeError('attempt.capabilitySnapshot must match providerCapabilitySnapshot.nodeCapabilities')
  }
  const workspaceMode = validateAgentWorkspaceMode(source.workspaceMode, 'attempt.workspaceMode')
  if (capabilitySnapshot.mode === 'provider_opaque' && workspaceMode !== 'opaque_no_write_surface') {
    throw new TypeError('provider_opaque attempts require workspaceMode opaque_no_write_surface')
  }
  const providerCorrelationKey = validateOptionalExternalId(
    source.providerCorrelationKey,
    'attempt.providerCorrelationKey',
  )
  if (providerCorrelationKey !== null && !providerCorrelationKey.includes(':')) {
    throw new TypeError('attempt.providerCorrelationKey must be namespaced by its adapter')
  }

  return deepFreeze({
    ...source,
    schemaVersion: 1,
    id,
    runId: validateInternalId(source.runId, 'attempt.runId'),
    nodeId: validateInternalId(source.nodeId, 'attempt.nodeId'),
    attemptNumber: validateInteger(source.attemptNumber, 'attempt.attemptNumber', { min: 1 }),
    parentAttemptId: validateOptionalString(source.parentAttemptId, 'attempt.parentAttemptId', { maxLength: 256 }),
    providerRequestId: validateOptionalExternalId(source.providerRequestId, 'attempt.providerRequestId'),
    providerCorrelationKey,
    reconciliationState: source.reconciliationState,
    status,
    capabilitySnapshot,
    providerCapabilitySnapshot,
    permissionSnapshot: validateAgentPermissionSnapshot(source.permissionSnapshot),
    workspaceId: validateOptionalString(source.workspaceId, 'attempt.workspaceId', { maxLength: 256 }),
    workspaceMode,
    background: source.background,
    backgroundKind: validateAgentBackgroundKind(source.backgroundKind, source.background),
    startedAt,
    finishedAt,
    stopReason: validateOptionalString(source.stopReason, 'attempt.stopReason', { maxLength: 1_000 }),
    errorCode: validateOptionalString(source.errorCode, 'attempt.errorCode', { maxLength: 256 }),
    usage: source.usage === null ? null : validateAgentUsage(source.usage),
    recoveryOfAttemptId: validateOptionalString(source.recoveryOfAttemptId, 'attempt.recoveryOfAttemptId', { maxLength: 256 }),
  })
}
