import {
  cloneContractInput,
  deepFreeze,
  validateEnum,
  validateOptionalExternalId,
  validateString,
} from '../../../common/agents/agent-contract-utils.mjs'
import { validateAgentNode } from '../../../common/agents/agent-node-contract.mjs'
import {
  validateAgentProviderCapabilitySnapshot,
} from '../../../common/agents/agent-provider-capability-snapshot.mjs'

const TRANSCRIPT_EVIDENCE = Object.freeze([
  'status_only',
  'root_summary',
  'provider_excerpt',
])
const PROVENANCE_CONFIDENCE = Object.freeze(['provider_asserted', 'observed'])
const PROHIBITED_CONTROLS = Object.freeze({
  message: false,
  interrupt: false,
  cancel: false,
  retry: false,
  usage: false,
  artifacts: false,
})

function validateProvenance(input) {
  const source = cloneContractInput(input, 'opaque provider provenance')
  return deepFreeze({
    source: validateString(source.source, 'opaque provider provenance.source', {
      maxLength: 256,
    }),
    providerEventId: validateOptionalExternalId(
      source.providerEventId,
      'opaque provider provenance.providerEventId',
    ),
    confidence: validateEnum(
      source.confidence,
      'opaque provider provenance.confidence',
      PROVENANCE_CONFIDENCE,
    ),
  })
}

export function createProviderOpaqueNode(input) {
  const providerCapabilitySnapshot = validateAgentProviderCapabilitySnapshot(
    input.capabilitySnapshot,
  )
  const capabilitySnapshot = providerCapabilitySnapshot.nodeCapabilities
  if (capabilitySnapshot.mode !== 'provider_opaque') {
    throw new TypeError('createProviderOpaqueNode requires provider_opaque capabilities')
  }
  if (providerCapabilitySnapshot.providerId !== input.providerId) {
    throw new TypeError('opaque node providerId must match its capability snapshot')
  }
  if (providerCapabilitySnapshot.modelId !== input.modelId) {
    throw new TypeError('opaque node modelId must match its capability snapshot')
  }
  const providerActivityId = validateString(
    input.providerActivityId,
    'opaque node providerActivityId',
    { maxLength: 1_024 },
  )
  const transcriptEvidence = validateEnum(
    input.transcriptEvidence,
    'opaque node transcriptEvidence',
    TRANSCRIPT_EVIDENCE,
  )
  const node = validateAgentNode({
    schemaVersion: 1,
    id: input.id,
    runId: input.runId,
    parentNodeId: input.parentNodeId,
    rootNodeId: input.rootNodeId,
    providerId: input.providerId,
    modelId: input.modelId,
    providerAgentId: null,
    providerThreadId: input.providerThreadId ?? null,
    roleId: input.roleId,
    roleLabel: input.roleLabel,
    taskId: input.taskId,
    taskSummary: input.taskSummary,
    depth: input.depth,
    branchPath: input.branchPath,
    generation: input.depth,
    spawnedByEventId: null,
    spawnRequestId: null,
    status: input.status,
    attemptId: input.attemptId ?? null,
    capabilitySnapshot,
    providerCapabilitySnapshot,
    permissionSnapshot: { level: 'read_only', toolClasses: ['read'] },
    workspaceId: null,
    workspaceMode: 'opaque_no_write_surface',
    createdAt: input.createdAt,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    exclusiveUsage: null,
    inclusiveUsage: null,
    childCount: 0,
    resultSummary: input.resultSummary ?? null,
    errorSummary: input.errorSummary ?? null,
    providerActivityId,
    provenance: validateProvenance(input.provenance),
    transcriptEvidence,
    usageConfidence: 'unknown',
    controls: PROHIBITED_CONTROLS,
    omissionReason: capabilitySnapshot.visibilityReason,
  })
  return deepFreeze(node)
}
