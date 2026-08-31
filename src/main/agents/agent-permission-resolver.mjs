import { createHash } from 'node:crypto'

import {
  assertPermissionNarrowing,
  validateAgentPermissionSnapshot,
} from '../../common/agents/agent-permissions.mjs'

const EXPLICIT_POLICY_LEVELS = new Set(['read_write', 'execute', 'all'])

function normalizedPolicyLevels(policy = {}) {
  return new Set(
    Array.isArray(policy?.allowedChildLevels)
      ? policy.allowedChildLevels.map((value) => String(value || '').trim())
      : [],
  )
}

export function hashAgentPermissionSnapshot(input) {
  const snapshot = validateAgentPermissionSnapshot(input)
  const canonical = JSON.stringify({
    level: snapshot.level,
    toolClasses: [...snapshot.toolClasses].sort(),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export function resolveAgentChildPermission({
  parentSnapshot,
  requestedSnapshot,
  policy = {},
} = {}) {
  const parent = validateAgentPermissionSnapshot(parentSnapshot)
  const requested = validateAgentPermissionSnapshot(requestedSnapshot)
  assertPermissionNarrowing(parent, requested)

  if (
    parent.level === 'all'
    && EXPLICIT_POLICY_LEVELS.has(requested.level)
    && !normalizedPolicyLevels(policy).has(requested.level)
  ) {
    throw new TypeError(
      `Child permission ${requested.level} requires an explicit policy grant from an all parent`,
    )
  }

  return Object.freeze({
    permissionSnapshot: requested,
    permissionSnapshotHash: hashAgentPermissionSnapshot(requested),
  })
}
