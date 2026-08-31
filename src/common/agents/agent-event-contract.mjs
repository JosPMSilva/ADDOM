import {
  cloneContractInput,
  deepFreeze,
  validateEnum,
  validateInternalId,
  validateInteger,
  validateOptionalExternalId,
  validateOptionalString,
  validateSchemaVersion,
  validateString,
  validateSummary,
  validateTimestamp,
} from './agent-contract-utils.mjs'
import { AGENT_CANCELLATION_SCOPES } from './agent-cancellation.mjs'
import { validateAgentArtifact } from './agent-artifact-contract.mjs'
import { AGENT_PERMISSION_LEVELS, AGENT_TOOL_CLASSES } from './agent-permissions.mjs'
import { AGENT_POLICY_PROFILE_IDS } from './agent-policy-profile.mjs'
import { AGENT_RECONCILIATION_STATES, assertAgentStatusTransition } from './agent-status.mjs'
import { validateAgentWorkspaceMode } from './agent-workspace.mjs'
import { validateAgentOrchestrationContinuation } from './agent-orchestration-continuation-contract.mjs'

export const AGENT_EVENT_KINDS = Object.freeze([
  'agent_run_created',
  'agent_run_started',
  'agent_spawn_requested',
  'agent_spawn_queued',
  'agent_spawned',
  'agent_attempt_queued',
  'agent_started',
  'agent_status_changed',
  'agent_commentary_delta',
  'agent_assistant_delta',
  'agent_reasoning_delta',
  'agent_reasoning_boundary',
  'agent_tool_started',
  'agent_tool_output',
  'agent_tool_completed',
  'agent_message_sent',
  'agent_message_received',
  'agent_orchestration_continuation_sent',
  'agent_orchestration_continuation_received',
  'agent_context_sent',
  'agent_context_received',
  'agent_final_message',
  'agent_waiting',
  'agent_resumed',
  'agent_approval_requested',
  'agent_approval_resolved',
  'agent_approval_consumed',
  'agent_artifact_staged',
  'agent_workspace_ready',
  'agent_merge_requested',
  'agent_merge_completed',
  'agent_completed',
  'agent_failed',
  'agent_cancel_requested',
  'agent_cancelled',
  'agent_run_finalizing',
  'agent_run_completed',
  'agent_run_failed',
  'agent_run_cancelled',
  'agent_reconciliation_recorded',
])

function requiredId(payload, field) {
  payload[field] = validateInternalId(payload[field], `event.payload.${field}`)
}

function requiredText(payload, field, maxLength = 4_000, {
  allowWhitespaceControl = false,
  preserveWhitespace = false,
} = {}) {
  payload[field] = validateString(payload[field], `event.payload.${field}`, {
    maxLength,
    allowWhitespaceControl,
    preserveWhitespace,
  })
}

function requiredHash(payload, field) {
  requiredText(payload, field, 64)
  if (!/^[a-f0-9]{64}$/u.test(payload[field])) {
    throw new TypeError(`event.payload.${field} must be a SHA-256 hash`)
  }
}

function validateNoRequiredPayload() {}

function validateSpawnRequested(payload) {
  requiredId(payload, 'spawnRequestId')
  requiredId(payload, 'parentAttemptId')
  requiredText(payload, 'taskSummary', 1_000)
}

function validateSpawnQueued(payload) {
  requiredId(payload, 'spawnRequestId')
}

function validateSpawned(payload) {
  requiredId(payload, 'spawnRequestId')
  requiredId(payload, 'childNodeId')
}

function validateStarted(payload) {
  requiredId(payload, 'attemptId')
}

function validateStatusChanged(payload) {
  payload.entity = validateEnum(payload.entity, 'event.payload.entity', ['run', 'node', 'attempt'])
  assertAgentStatusTransition(payload.entity, payload.from, payload.to)
}

function validateDelta(payload) {
  requiredText(payload, 'delta', 200_000, {
    allowWhitespaceControl: true,
    preserveWhitespace: true,
  })
}

function validateReasoningBoundary(payload) {
  payload.boundary = validateEnum(payload.boundary, 'event.payload.boundary', ['start', 'end'])
}

function validateToolStarted(payload) {
  requiredId(payload, 'toolCallId')
  requiredText(payload, 'toolName', 256)
  payload.toolClass = validateEnum(payload.toolClass, 'event.payload.toolClass', AGENT_TOOL_CLASSES)
}

function validateToolReference(payload) {
  requiredId(payload, 'toolCallId')
}

function validateToolOutput(payload) {
  validateToolReference(payload)
  if (!Object.hasOwn(payload, 'output')) throw new TypeError('event.payload.output is required')
}

function validateToolCompleted(payload) {
  validateToolReference(payload)
  payload.status = validateEnum(payload.status, 'event.payload.status', ['completed', 'failed', 'cancelled'])
}

function validateMessage(payload) {
  requiredId(payload, 'messageId')
  requiredId(payload, 'peerNodeId')
  requiredText(payload, 'text', 200_000, { allowWhitespaceControl: true })
}

function validateOrchestrationContinuation(payload) {
  requiredId(payload, 'messageId')
  requiredId(payload, 'peerNodeId')
  payload.continuation = validateAgentOrchestrationContinuation(payload.continuation)
}

function validateContext(payload) {
  requiredId(payload, 'packetId')
  requiredId(payload, 'peerNodeId')
  requiredHash(payload, 'packetHash')
  if (payload.packet !== undefined && (!payload.packet || typeof payload.packet !== 'object')) {
    throw new TypeError('event.payload.packet must be an object when present')
  }
}

function validateFinalMessage(payload) {
  requiredText(payload, 'text', 200_000, { allowWhitespaceControl: true })
}

function validateReason(payload) {
  requiredText(payload, 'reason', 1_000)
}

function validateApprovalRequested(payload) {
  requiredId(payload, 'approvalId')
  payload.permissionLevel = validateEnum(
    payload.permissionLevel,
    'event.payload.permissionLevel',
    AGENT_PERMISSION_LEVELS,
  )
  requiredText(payload, 'operationSummary', 1_000)
  requiredId(payload, 'toolCallId')
  requiredText(payload, 'projectId', 256)
  requiredText(payload, 'threadId', 256)
  requiredText(payload, 'providerId', 512)
  requiredText(payload, 'modelId', 1_024)
  requiredHash(payload, 'permissionSnapshotHash')
  requiredHash(payload, 'workspaceSnapshotHash')
  requiredHash(payload, 'operationScopeHash')
  if (!payload.operationScope || typeof payload.operationScope !== 'object') {
    throw new TypeError('event.payload.operationScope must be an object')
  }
  if (!payload.workspaceSnapshot || typeof payload.workspaceSnapshot !== 'object') {
    throw new TypeError('event.payload.workspaceSnapshot must be an object')
  }
  if (!Array.isArray(payload.parentPath) || payload.parentPath.length === 0) {
    throw new TypeError('event.payload.parentPath must be a non-empty array')
  }
  payload.parentPath.forEach((value) => validateInternalId(value, 'event.payload.parentPath entry'))
  if (!Array.isArray(payload.allowedResolutionScopes) || payload.allowedResolutionScopes.length === 0) {
    throw new TypeError('event.payload.allowedResolutionScopes must be a non-empty array')
  }
  payload.allowedResolutionScopes.forEach((value) => (
    validateEnum(value, 'event.payload resolution scope', ['once', 'node', 'subtree', 'run'])
  ))
  if (new Set(payload.allowedResolutionScopes).size !== payload.allowedResolutionScopes.length) {
    throw new TypeError('event.payload.allowedResolutionScopes must not contain duplicates')
  }
}

function validateApprovalResolved(payload) {
  requiredId(payload, 'approvalId')
  payload.outcome = validateEnum(payload.outcome, 'event.payload.outcome', ['approved', 'denied', 'expired', 'revoked'])
  if (payload.outcome === 'approved') {
    payload.resolutionScope = validateEnum(
      payload.resolutionScope,
      'event.payload.resolutionScope',
      ['once', 'node', 'subtree', 'run'],
    )
    if (!payload.grant || typeof payload.grant !== 'object') {
      throw new TypeError('event.payload.grant is required for approved outcomes')
    }
    const grant = cloneContractInput(payload.grant, 'event.payload.grant')
    requiredId(grant, 'id')
    requiredId(grant, 'runId')
    requiredId(grant, 'nodeId')
    requiredId(grant, 'attemptId')
    requiredHash(grant, 'permissionSnapshotHash')
    requiredHash(grant, 'workspaceSnapshotHash')
    requiredHash(grant, 'operationScopeHash')
    grant.resolutionScope = validateEnum(
      grant.resolutionScope,
      'event.payload.grant.resolutionScope',
      ['once', 'node', 'subtree', 'run'],
    )
    if (grant.resolutionScope !== payload.resolutionScope) {
      throw new TypeError('event.payload.grant resolution scope must match the decision')
    }
    grant.grantedAt = validateTimestamp(grant.grantedAt, 'event.payload.grant.grantedAt')
    grant.expiresAt = validateTimestamp(grant.expiresAt, 'event.payload.grant.expiresAt')
    if (grant.expiresAt <= grant.grantedAt) {
      throw new TypeError('event.payload.grant must expire after it is granted')
    }
    payload.grant = grant
  }
}

function validateApprovalConsumed(payload) {
  requiredId(payload, 'approvalId')
  requiredId(payload, 'grantId')
  payload.usedAt = validateTimestamp(payload.usedAt, 'event.payload.usedAt')
}

function validateArtifactStaged(payload) {
  requiredId(payload, 'artifactId')
  payload.workspaceMode = validateAgentWorkspaceMode(payload.workspaceMode, 'event.payload.workspaceMode')
  requiredText(payload, 'path', 2_000)
  payload.artifact = validateAgentArtifact(payload.artifact)
  if (payload.artifact.id !== payload.artifactId) {
    throw new TypeError('event.payload.artifactId must match event.payload.artifact.id')
  }
  if (payload.artifact.workspaceMode !== payload.workspaceMode) {
    throw new TypeError('event.payload.workspaceMode must match event.payload.artifact.workspaceMode')
  }
  if (payload.artifact.path !== payload.path.replaceAll('\\', '/')) {
    throw new TypeError('event.payload.path must match event.payload.artifact.path')
  }
}

function validateWorkspaceReady(payload) {
  requiredId(payload, 'workspaceId')
  payload.workspaceMode = validateAgentWorkspaceMode(payload.workspaceMode, 'event.payload.workspaceMode')
  requiredText(payload, 'baseRevision', 1_024)
  payload.leaseExpiresAt = validateTimestamp(
    payload.leaseExpiresAt,
    'event.payload.leaseExpiresAt',
  )
}

function validateMergeRequested(payload) {
  requiredId(payload, 'mergeId')
  if (!Array.isArray(payload.artifactIds) || payload.artifactIds.length === 0) {
    throw new TypeError('event.payload.artifactIds must be a non-empty array')
  }
  payload.artifactIds = payload.artifactIds.map((value) => validateInternalId(value, 'event.payload.artifactIds entry'))
  if (new Set(payload.artifactIds).size !== payload.artifactIds.length) {
    throw new TypeError('event.payload.artifactIds must not contain duplicates')
  }
  payload.operation = validateEnum(
    payload.operation,
    'event.payload.operation',
    ['apply', 'discard'],
  )
}

function validateMergeCompleted(payload) {
  requiredId(payload, 'mergeId')
  if (!Array.isArray(payload.artifactIds) || payload.artifactIds.length === 0) {
    throw new TypeError('event.payload.artifactIds must be a non-empty array')
  }
  payload.artifactIds = payload.artifactIds.map((value) => (
    validateInternalId(value, 'event.payload.artifactIds entry')
  ))
  payload.status = validateEnum(
    payload.status,
    'event.payload.status',
    ['completed', 'discarded', 'failed', 'conflicted'],
  )
  if (!payload.decision || typeof payload.decision !== 'object' || Array.isArray(payload.decision)) {
    throw new TypeError('event.payload.decision must be an object')
  }
}

function validateResult(payload) {
  payload.resultSummary = validateSummary(payload.resultSummary, 'event.payload.resultSummary', {
    nullable: false,
    allowWhitespaceControl: true,
  })
}

function validateError(payload) {
  payload.errorSummary = validateSummary(payload.errorSummary, 'event.payload.errorSummary', {
    nullable: false,
    allowWhitespaceControl: true,
  })
}

function validateCancelRequested(payload) {
  payload.scope = validateEnum(payload.scope, 'event.payload.scope', AGENT_CANCELLATION_SCOPES)
  requiredId(payload, 'targetNodeId')
}

function validateCancelled(payload) {
  payload.scope = validateEnum(payload.scope, 'event.payload.scope', AGENT_CANCELLATION_SCOPES)
}

function validateFinalAuthority(payload) {
  requiredId(payload, 'finalAuthorityNodeId')
}

function validateRunCompleted(payload) {
  validateFinalAuthority(payload)
  requiredText(payload, 'completionReason', 1_000)
}

function validateRunCancelled(payload) {
  requiredText(payload, 'completionReason', 1_000)
}

function validateReconciliation(payload) {
  payload.state = validateEnum(
    payload.state,
    'event.payload.state',
    AGENT_RECONCILIATION_STATES,
  )
  requiredText(payload, 'reason', 1_000)
  requiredText(payload, 'sourceEventId', 1_024)
}

const PAYLOAD_VALIDATORS = Object.freeze({
  agent_run_created(payload) {
    payload.policyProfileId = validateEnum(
      payload.policyProfileId,
      'event.payload.policyProfileId',
      AGENT_POLICY_PROFILE_IDS,
    )
  },
  agent_run_started: validateNoRequiredPayload,
  agent_spawn_requested: validateSpawnRequested,
  agent_spawn_queued: validateSpawnQueued,
  agent_spawned: validateSpawned,
  agent_attempt_queued: validateStarted,
  agent_started: validateStarted,
  agent_status_changed: validateStatusChanged,
  agent_commentary_delta: validateDelta,
  agent_assistant_delta: validateDelta,
  agent_reasoning_delta: validateDelta,
  agent_reasoning_boundary: validateReasoningBoundary,
  agent_tool_started: validateToolStarted,
  agent_tool_output: validateToolOutput,
  agent_tool_completed: validateToolCompleted,
  agent_message_sent: validateMessage,
  agent_message_received: validateMessage,
  agent_orchestration_continuation_sent: validateOrchestrationContinuation,
  agent_orchestration_continuation_received: validateOrchestrationContinuation,
  agent_context_sent: validateContext,
  agent_context_received: validateContext,
  agent_final_message: validateFinalMessage,
  agent_waiting: validateReason,
  agent_resumed: validateReason,
  agent_approval_requested: validateApprovalRequested,
  agent_approval_resolved: validateApprovalResolved,
  agent_approval_consumed: validateApprovalConsumed,
  agent_artifact_staged: validateArtifactStaged,
  agent_workspace_ready: validateWorkspaceReady,
  agent_merge_requested: validateMergeRequested,
  agent_merge_completed: validateMergeCompleted,
  agent_completed: validateResult,
  agent_failed: validateError,
  agent_cancel_requested: validateCancelRequested,
  agent_cancelled: validateCancelled,
  agent_run_finalizing: validateFinalAuthority,
  agent_run_completed: validateRunCompleted,
  agent_run_failed: validateError,
  agent_run_cancelled: validateRunCancelled,
  agent_reconciliation_recorded: validateReconciliation,
})

export function validateAgentEvent(input) {
  const source = cloneContractInput(input, 'agent event')
  validateSchemaVersion(source.schemaVersion)
  const kind = validateEnum(source.kind, 'event.kind', AGENT_EVENT_KINDS)
  const payload = cloneContractInput(source.payload, 'event.payload')
  PAYLOAD_VALIDATORS[kind](payload)
  const nodeId = validateInternalId(source.nodeId, 'event.nodeId')
  if ((kind === 'agent_run_finalizing' || kind === 'agent_run_completed') && payload.finalAuthorityNodeId !== nodeId) {
    throw new TypeError(`${kind} must be emitted by finalAuthorityNodeId`)
  }
  const providerCorrelationKey = validateOptionalExternalId(
    source.providerCorrelationKey,
    'event.providerCorrelationKey',
  )
  if (providerCorrelationKey !== null && !providerCorrelationKey.includes(':')) {
    throw new TypeError('event.providerCorrelationKey must be namespaced by its adapter')
  }

  return deepFreeze({
    ...source,
    schemaVersion: 1,
    eventId: validateInternalId(source.eventId, 'event.eventId'),
    runId: validateInternalId(source.runId, 'event.runId'),
    nodeId,
    parentNodeId: source.parentNodeId === null
      ? null
      : validateInternalId(source.parentNodeId, 'event.parentNodeId'),
    runSequence: validateInteger(source.runSequence, 'event.runSequence', { min: 1 }),
    nodeSequence: validateInteger(source.nodeSequence, 'event.nodeSequence', { min: 1 }),
    attemptId: validateOptionalString(source.attemptId, 'event.attemptId', { maxLength: 256 }),
    providerEventId: validateOptionalExternalId(source.providerEventId, 'event.providerEventId'),
    providerCorrelationKey,
    idempotencyKey: validateString(source.idempotencyKey, 'event.idempotencyKey', { maxLength: 1_024 }),
    kind,
    payload,
    createdAt: validateTimestamp(source.createdAt, 'event.createdAt'),
  })
}

export function validateAgentEventSequence(input) {
  if (!Array.isArray(input)) throw new TypeError('Agent event sequence must be an array')
  const events = input.map((event) => validateAgentEvent(event))
  if (events.length === 0) return deepFreeze([])
  const runId = events[0].runId
  const eventIds = new Set()
  const idempotencyKeys = new Set()
  const nodeSequences = new Map()
  let expectedRunSequence = 1

  for (const event of events) {
    if (event.runId !== runId) throw new TypeError('Agent event sequence must contain one run')
    if (event.runSequence !== expectedRunSequence) {
      throw new TypeError(`Invalid run sequence: expected ${expectedRunSequence}, received ${event.runSequence}`)
    }
    expectedRunSequence += 1
    if (eventIds.has(event.eventId)) throw new TypeError(`Duplicate eventId: ${event.eventId}`)
    if (idempotencyKeys.has(event.idempotencyKey)) throw new TypeError(`Duplicate idempotencyKey: ${event.idempotencyKey}`)
    eventIds.add(event.eventId)
    idempotencyKeys.add(event.idempotencyKey)

    const expectedNodeSequence = (nodeSequences.get(event.nodeId) || 0) + 1
    if (event.nodeSequence !== expectedNodeSequence) {
      throw new TypeError(`Invalid node sequence for ${event.nodeId}: expected ${expectedNodeSequence}, received ${event.nodeSequence}`)
    }
    nodeSequences.set(event.nodeId, expectedNodeSequence)
  }
  return deepFreeze(events)
}
