import {
  cloneContractInput,
  deepFreeze,
  validateInternalId,
  validateSchemaVersion,
  validateString,
  validateSummary,
  validateTimestamp,
} from './agent-contract-utils.mjs'
import { validateAgentCapabilities } from './agent-capabilities.mjs'
import { validateAgentPermissionSnapshot } from './agent-permissions.mjs'
import { validateAgentWorkspaceMode } from './agent-workspace.mjs'

export function validateAgentDelegationRequest(input) {
  const source = cloneContractInput(input, 'agent delegation request')
  validateSchemaVersion(source.schemaVersion)
  if (typeof source.background !== 'boolean') throw new TypeError('delegation.background must be boolean')

  return deepFreeze({
    ...source,
    schemaVersion: 1,
    id: validateInternalId(source.id, 'delegation.id'),
    runId: validateInternalId(source.runId, 'delegation.runId'),
    parentNodeId: validateInternalId(source.parentNodeId, 'delegation.parentNodeId'),
    parentAttemptId: validateInternalId(source.parentAttemptId, 'delegation.parentAttemptId'),
    taskId: validateInternalId(source.taskId, 'delegation.taskId'),
    taskSummary: validateSummary(source.taskSummary, 'delegation.taskSummary', { maxLength: 1_000, nullable: false }),
    roleId: validateString(source.roleId, 'delegation.roleId', { maxLength: 256 }),
    providerId: validateString(source.providerId, 'delegation.providerId', { maxLength: 512 }),
    modelId: validateString(source.modelId, 'delegation.modelId', { maxLength: 1_024 }),
    capabilitySnapshot: validateAgentCapabilities(source.capabilitySnapshot),
    permissionSnapshot: validateAgentPermissionSnapshot(source.permissionSnapshot),
    workspaceMode: validateAgentWorkspaceMode(source.workspaceMode, 'delegation.workspaceMode'),
    background: source.background,
    createdAt: validateTimestamp(source.createdAt, 'delegation.createdAt'),
  })
}
