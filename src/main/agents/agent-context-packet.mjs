import { createHash } from 'node:crypto'

import {
  cloneContractInput,
  deepFreeze,
  validateEnum,
  validateInteger,
  validateNumber,
  validateString,
  validateTimestamp,
} from '../../common/agents/agent-contract-utils.mjs'
import { AGENT_TOOL_CLASSES } from '../../common/agents/agent-permissions.mjs'
import { validateAgentWorkspaceMode } from '../../common/agents/agent-workspace.mjs'

const CONTEXT_RELATIONS = Object.freeze(['parent_child', 'child_parent', 'sibling'])
const EVIDENCE_VISIBILITY = Object.freeze(['private', 'selected', 'shared'])
const PROHIBITED_KEYS = new Set([
  'apikey',
  'authorization',
  'credential',
  'credentials',
  'env',
  'environment',
  'headers',
  'password',
  'secret',
  'secrets',
  'token',
])

function rejectSensitiveKeys(value, path = 'context packet') {
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key.toLowerCase().replace(/[^a-z]/g, ''))) {
      throw new TypeError(`${path}.${key} is prohibited inherited credential or environment data`)
    }
    rejectSensitiveKeys(nested, `${path}.${key}`)
  }
}

function validateHash(value, field) {
  const normalized = validateString(value, field, { maxLength: 64 })
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw new TypeError(`${field} must be a sha256 hex digest`)
  }
  return normalized
}

function validateOptionalEvidenceDigest(value, field) {
  if (value === undefined || value === null) return undefined
  return validateHash(value, field)
}

function validateOptionalEvidenceBytes(value, field) {
  if (value === undefined || value === null) return undefined
  return validateInteger(value, field, { min: 0 })
}

function validateOptionalEvidenceKind(value, field) {
  if (value === undefined || value === null) return undefined
  return validateString(value, field, { maxLength: 64 })
}

function validateSelectedEvidence(values, relation) {
  if (!Array.isArray(values) || values.length > 32) {
    throw new TypeError('context packet selected evidence must contain at most 32 entries')
  }
  return values.map((input) => {
    const source = cloneContractInput(input, 'context packet selected evidence')
    const visibility = validateEnum(
      source.visibility,
      'context packet evidence.visibility',
      EVIDENCE_VISIBILITY,
    )
    if (relation === 'sibling' && visibility === 'private') {
      throw new TypeError('Private context cannot be delegated to a sibling')
    }
    const evidence = {
      evidenceId: validateString(source.evidenceId, 'context packet evidence.evidenceId', {
        maxLength: 256,
      }),
      sourceNodeId: validateString(
        source.sourceNodeId,
        'context packet evidence.sourceNodeId',
        { maxLength: 256 },
      ),
      summary: validateString(source.summary, 'context packet evidence.summary', {
        maxLength: 4_000,
      }),
      visibility,
    }
    const contentDigest = validateOptionalEvidenceDigest(
      source.contentDigest,
      'context packet evidence.contentDigest',
    )
    const contentBytes = validateOptionalEvidenceBytes(
      source.contentBytes,
      'context packet evidence.contentBytes',
    )
    const contentKind = validateOptionalEvidenceKind(
      source.contentKind,
      'context packet evidence.contentKind',
    )
    if (contentDigest !== undefined) evidence.contentDigest = contentDigest
    if (contentBytes !== undefined) evidence.contentBytes = contentBytes
    if (contentKind !== undefined) evidence.contentKind = contentKind
    return evidence
  })
}

function validateDescriptors(values, kind) {
  if (!Array.isArray(values) || values.length > 32) {
    throw new TypeError(`context packet ${kind} descriptors must contain at most 32 entries`)
  }
  return values.map((input) => {
    const source = cloneContractInput(input, `context packet ${kind} descriptor`)
    if (kind === 'tool') {
      return {
        name: validateString(source.name, 'context packet tool.name', { maxLength: 256 }),
        toolClass: validateEnum(
          source.toolClass,
          'context packet tool.toolClass',
          AGENT_TOOL_CLASSES,
        ),
      }
    }
    return {
      name: validateString(source.name, 'context packet service.name', { maxLength: 256 }),
      capability: validateString(
        source.capability,
        'context packet service.capability',
        { maxLength: 256 },
      ),
    }
  })
}

export function validateAgentContextPacket(input) {
  rejectSensitiveKeys(input)
  const source = cloneContractInput(input, 'agent context packet')
  const relation = validateEnum(source.relation, 'context packet.relation', CONTEXT_RELATIONS)
  const selectedEvidence = validateSelectedEvidence(source.selectedEvidence, relation)
  if (!Array.isArray(source.ancestry) || source.ancestry.length === 0 || source.ancestry.length > 64) {
    throw new TypeError('context packet.ancestry must contain 1-64 node IDs')
  }
  if (!Array.isArray(source.provenance) || source.provenance.length > 64) {
    throw new TypeError('context packet.provenance must contain at most 64 entries')
  }
  const workspaceLease = cloneContractInput(source.workspaceLease, 'context workspace lease')
  const budgetLease = cloneContractInput(source.budgetLease, 'context budget lease')
  const providerRoute = cloneContractInput(source.providerRoute, 'context provider route')
  const packetBody = {
    packetId: validateString(source.packetId, 'context packet.packetId', { maxLength: 256 }),
    fromNodeId: validateString(source.fromNodeId, 'context packet.fromNodeId', {
      maxLength: 256,
    }),
    toNodeId: validateString(source.toNodeId, 'context packet.toNodeId', { maxLength: 256 }),
    relation,
    selectedEvidence,
    ancestry: source.ancestry.map((value) => (
      validateString(value, 'context packet ancestry entry', { maxLength: 256 })
    )),
    provenance: source.provenance.map((input) => {
      const entry = cloneContractInput(input, 'context packet provenance entry')
      return {
        source: validateString(entry.source, 'context packet provenance.source', {
          maxLength: 256,
        }),
        sourceId: validateString(entry.sourceId, 'context packet provenance.sourceId', {
          maxLength: 256,
        }),
      }
    }),
    effectiveCapabilityHash: validateHash(
      source.effectiveCapabilityHash,
      'context packet.effectiveCapabilityHash',
    ),
    effectivePermissionHash: validateHash(
      source.effectivePermissionHash,
      'context packet.effectivePermissionHash',
    ),
    workspaceLease: {
      leaseId: validateString(workspaceLease.leaseId, 'context workspace lease.leaseId', {
        maxLength: 256,
      }),
      workspaceId: validateString(workspaceLease.workspaceId, 'context workspace lease.workspaceId', {
        maxLength: 256,
      }),
      workspaceMode: validateAgentWorkspaceMode(
        workspaceLease.workspaceMode,
        'context workspace lease.workspaceMode',
      ),
      baseRevision: validateString(
        workspaceLease.baseRevision,
        'context workspace lease.baseRevision',
        { maxLength: 512 },
      ),
      expiresAt: validateTimestamp(workspaceLease.expiresAt, 'context workspace lease.expiresAt'),
    },
    budgetLease: {
      leaseId: validateString(budgetLease.leaseId, 'context budget lease.leaseId', {
        maxLength: 256,
      }),
      tokenLimit: validateInteger(budgetLease.tokenLimit, 'context budget lease.tokenLimit'),
      costLimitUsd: validateNumber(
        budgetLease.costLimitUsd,
        'context budget lease.costLimitUsd',
      ),
      toolCallLimit: validateInteger(
        budgetLease.toolCallLimit,
        'context budget lease.toolCallLimit',
      ),
      expiresAt: validateTimestamp(budgetLease.expiresAt, 'context budget lease.expiresAt'),
    },
    providerRoute: {
      adapterId: validateString(providerRoute.adapterId, 'context route.adapterId', {
        maxLength: 256,
      }),
      providerId: validateString(providerRoute.providerId, 'context route.providerId', {
        maxLength: 512,
      }),
      modelId: validateString(providerRoute.modelId, 'context route.modelId', {
        maxLength: 1_024,
      }),
    },
    toolDescriptors: validateDescriptors(source.toolDescriptors, 'tool'),
    serviceDescriptors: validateDescriptors(source.serviceDescriptors, 'service'),
    createdAt: validateTimestamp(source.createdAt, 'context packet.createdAt'),
  }
  const serialized = JSON.stringify(packetBody)
  if (serialized.length > 64_000) {
    throw new TypeError('context packet exceeds the 64 KB serialized limit')
  }
  const packetHash = createHash('sha256').update(serialized).digest('hex')
  if (source.packetHash !== undefined && validateHash(
    source.packetHash,
    'context packet.packetHash',
  ) !== packetHash) {
    throw new TypeError('context packet.packetHash does not match the packet body')
  }
  const packet = { ...packetBody, packetHash }
  return deepFreeze(packet)
}

export function createAgentContextPacket(input) {
  return validateAgentContextPacket(input)
}
