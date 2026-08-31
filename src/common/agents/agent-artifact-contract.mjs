import {
  cloneContractInput,
  cloneSerializable,
  deepFreeze,
  validateEnum,
  validateInternalId,
  validateInteger,
  validateOptionalString,
  validateSchemaVersion,
  validateString,
  validateTimestamp,
} from './agent-contract-utils.mjs'
import { validateAgentWorkspaceMode } from './agent-workspace.mjs'

export const AGENT_ARTIFACT_KINDS = Object.freeze([
  'file_patch', 'file_snapshot', 'report', 'test_result', 'provider_reference',
])
export const AGENT_ARTIFACT_OPERATION_TYPES = Object.freeze([
  'write_file',
  'create_file',
  'update_file',
  'delete_file',
  'move_file',
  'report',
  'test_result',
  'provider_import',
])
export const AGENT_ARTIFACT_ORIGINS = Object.freeze([
  'local_workspace',
  'provider_reference',
])

function validateRelativeArtifactPath(value) {
  const path = validateString(value, 'artifact.path', { maxLength: 2_000 }).replaceAll('\\', '/')
  if (/^(?:[A-Za-z]:\/|\/)/.test(path) || path.split('/').includes('..')) {
    throw new TypeError('artifact.path must be a workspace-relative path')
  }
  return path
}

function validateDependencies(value) {
  if (!Array.isArray(value)) throw new TypeError('artifact.dependencies must be an array')
  if (value.length > 256) throw new TypeError('artifact.dependencies exceeds 256 entries')
  const dependencies = value.map((entry) => validateInternalId(entry, 'artifact.dependencies entry'))
  if (new Set(dependencies).size !== dependencies.length) {
    throw new TypeError('artifact.dependencies must not contain duplicates')
  }
  return dependencies
}

function validateProvenance(value, workspaceMode) {
  const provenance = cloneContractInput(value, 'artifact.provenance')
  const origin = validateEnum(
    provenance.origin,
    'artifact.provenance.origin',
    AGENT_ARTIFACT_ORIGINS,
  )
  if (typeof provenance.verifiedLocalImport !== 'boolean') {
    throw new TypeError('artifact.provenance.verifiedLocalImport must be a boolean')
  }
  const providerArtifactId = validateOptionalString(
    provenance.providerArtifactId,
    'artifact.provenance.providerArtifactId',
    { maxLength: 1_024 },
  )
  if (
    (origin === 'provider_reference' || workspaceMode === 'remote_provider_workspace')
    && providerArtifactId === null
  ) {
    throw new TypeError('artifact.provenance.providerArtifactId is required for provider artifacts')
  }
  if (workspaceMode === 'opaque_no_write_surface' && provenance.verifiedLocalImport) {
    throw new TypeError('opaque artifacts cannot claim a verified local import')
  }
  return {
    ...provenance,
    origin,
    verifiedLocalImport: provenance.verifiedLocalImport,
    providerArtifactId,
  }
}

export function validateAgentArtifact(input) {
  const source = cloneContractInput(input, 'agent artifact')
  validateSchemaVersion(source.schemaVersion)
  if (!AGENT_ARTIFACT_KINDS.includes(source.kind)) throw new TypeError('artifact.kind is invalid')
  const workspaceMode = validateAgentWorkspaceMode(source.workspaceMode, 'artifact.workspaceMode')
  return deepFreeze({
    ...source,
    schemaVersion: 1,
    id: validateInternalId(source.id, 'artifact.id'),
    runId: validateInternalId(source.runId, 'artifact.runId'),
    nodeId: validateInternalId(source.nodeId, 'artifact.nodeId'),
    attemptId: validateInternalId(source.attemptId, 'artifact.attemptId'),
    workspaceId: validateInternalId(source.workspaceId, 'artifact.workspaceId'),
    workspaceMode,
    baseRevision: validateString(source.baseRevision, 'artifact.baseRevision', { maxLength: 1_024 }),
    baseContentDigest: validateString(
      source.baseContentDigest,
      'artifact.baseContentDigest',
      { maxLength: 256 },
    ),
    kind: source.kind,
    operationType: validateEnum(
      source.operationType,
      'artifact.operationType',
      AGENT_ARTIFACT_OPERATION_TYPES,
    ),
    path: validateRelativeArtifactPath(source.path),
    originalPath: source.originalPath === null || source.originalPath === undefined
      ? null
      : validateRelativeArtifactPath(source.originalPath),
    digest: validateString(source.digest, 'artifact.digest', { maxLength: 256 }),
    sizeBytes: validateInteger(source.sizeBytes, 'artifact.sizeBytes'),
    dependencies: validateDependencies(source.dependencies),
    provenance: validateProvenance(source.provenance, workspaceMode),
    createdAt: validateTimestamp(source.createdAt, 'artifact.createdAt'),
    metadata: cloneSerializable(source.metadata, 'artifact.metadata'),
  })
}
