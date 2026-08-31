import { createHash, randomUUID } from 'node:crypto'

import { validateAgentPermissionSnapshot } from '../../common/agents/agent-permissions.mjs'
import { validateAgentWorkspaceMode } from '../../common/agents/agent-workspace.mjs'
import { hashAgentPermissionSnapshot } from './agent-permission-resolver.mjs'
import { recordAgentRuntimeDiagnostic } from './agent-runtime-diagnostics.mjs'

const RESOLUTION_SCOPES = Object.freeze(['once', 'node', 'subtree', 'run'])
const TERMINAL_APPROVAL_STATUSES = new Set(['denied', 'expired', 'revoked', 'consumed'])

function text(value, field, maxLength = 1_000) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new TypeError(`${field} is required`)
  if (normalized.length > maxLength) throw new TypeError(`${field} exceeds ${maxLength} characters`)
  return normalized
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  )
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

function operationScope(input = {}) {
  return Object.freeze({
    toolName: text(input.toolName, 'operationScope.toolName', 256),
    toolClass: text(input.toolClass, 'operationScope.toolClass', 64),
    resource: text(input.resource, 'operationScope.resource', 2_000),
  })
}

function workspaceSnapshot(input = {}) {
  return Object.freeze({
    workspaceId: text(input.workspaceId, 'workspaceSnapshot.workspaceId', 256),
    workspaceMode: validateAgentWorkspaceMode(
      input.workspaceMode,
      'workspaceSnapshot.workspaceMode',
    ),
    baseRevision: text(input.baseRevision, 'workspaceSnapshot.baseRevision', 512),
  })
}

function requireGraphEntity(repository, { runId, nodeId, attemptId }) {
  const graph = repository.getRunGraph(runId)
  if (!graph) throw new TypeError(`Agent run ${runId} was not found`)
  const node = graph.nodes.find((entry) => entry.id === nodeId)
  if (!node) throw new TypeError(`Agent node ${nodeId} was not found`)
  const attempt = graph.attempts.find((entry) => entry.id === attemptId)
  if (!attempt || attempt.nodeId !== nodeId) {
    throw new TypeError(`Agent attempt ${attemptId} is not owned by node ${nodeId}`)
  }
  return { graph, node, attempt }
}

function approvalDraft(kind, approval, payload, createdAt, suffix) {
  return {
    runId: approval.runId,
    nodeId: approval.nodeId,
    parentNodeId: approval.parentPath.at(-2) || null,
    attemptId: approval.attemptId,
    providerEventId: null,
    providerCorrelationKey: null,
    idempotencyKey: `${approval.runId}:${kind}:${approval.id}:${suffix}`,
    kind,
    payload,
    createdAt,
  }
}

export function createAgentApprovalRouter({
  eventStore,
  repository,
  now = Date.now,
  idFactory = randomUUID,
  diagnostics = null,
  warn = console.warn,
} = {}) {
  if (!eventStore || !repository) {
    throw new TypeError('Agent approval router requires eventStore and repository')
  }

  function get(approvalId) {
    const approval = repository.getApproval(text(approvalId, 'approvalId', 256))
    if (!approval) throw new TypeError(`Approval ${approvalId} was not found`)
    return approval
  }

  function request(input = {}) {
    const runId = text(input.runId, 'runId', 256)
    const nodeId = text(input.nodeId, 'nodeId', 256)
    const attemptId = text(input.attemptId, 'attemptId', 256)
    const { graph, node, attempt } = requireGraphEntity(repository, {
      runId,
      nodeId,
      attemptId,
    })
    const permissionSnapshot = validateAgentPermissionSnapshot(input.permissionSnapshot)
    const permissionSnapshotHash = hashAgentPermissionSnapshot(permissionSnapshot)
    if (permissionSnapshotHash !== hashAgentPermissionSnapshot(attempt.permissionSnapshot)) {
      throw new TypeError('Approval permission snapshot does not match the active attempt')
    }
    const workspace = workspaceSnapshot(input.workspaceSnapshot)
    if (
      workspace.workspaceId !== attempt.workspaceId
      || workspace.workspaceMode !== attempt.workspaceMode
    ) {
      throw new TypeError('Approval workspace snapshot does not match the active attempt')
    }
    const operation = operationScope(input.operationScope)
    const allowedResolutionScopes = [...new Set(
      Array.isArray(input.allowedResolutionScopes)
        ? input.allowedResolutionScopes
        : ['once'],
    )]
    if (
      allowedResolutionScopes.length === 0
      || allowedResolutionScopes.some((scope) => !RESOLUTION_SCOPES.includes(scope))
    ) {
      throw new TypeError('Approval allowed resolution scopes are invalid')
    }
    const approvalId = text(idFactory(), 'approvalId', 256)
    const createdAt = now()
    const payload = {
      approvalId,
      permissionLevel: permissionSnapshot.level,
      operationSummary: text(input.operationSummary, 'operationSummary'),
      toolCallId: text(input.toolCallId, 'toolCallId', 256),
      operationScope: operation,
      operationScopeHash: hash(operation),
      parentPath: [...node.branchPath],
      projectId: graph.run.projectId,
      threadId: graph.run.threadId,
      providerId: node.providerId,
      modelId: node.modelId,
      permissionSnapshotHash,
      workspaceSnapshot: workspace,
      workspaceSnapshotHash: hash(workspace),
      allowedResolutionScopes,
    }
    eventStore.append(approvalDraft(
      'agent_approval_requested',
      { id: approvalId, runId, nodeId, attemptId, parentPath: payload.parentPath },
      payload,
      createdAt,
      'requested',
    ))
    return get(approvalId)
  }

  function resolve({
    approvalId,
    outcome,
    resolutionScope = null,
    expiresAt = null,
    reason = null,
  } = {}) {
    const approval = get(approvalId)
    const resolvesApprovedGrant = approval.status === 'approved'
      && ['expired', 'revoked'].includes(outcome)
    if (approval.status !== 'pending' && !resolvesApprovedGrant) {
      throw new TypeError(`Approval ${approvalId} is not actionable from ${approval.status}`)
    }
    if (!['approved', 'denied', 'expired', 'revoked'].includes(outcome)) {
      throw new TypeError('Approval outcome is invalid')
    }
    const resolvedAt = now()
    let grant = null
    if (outcome === 'approved') {
      if (!approval.allowedResolutionScopes.includes(resolutionScope)) {
        throw new TypeError(`Approval resolution scope ${resolutionScope} is not permitted`)
      }
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= resolvedAt) {
        throw new TypeError('Approved grant expiresAt must be later than grant time')
      }
      grant = {
        id: `${approval.id}_grant`,
        resolutionScope,
        runId: approval.runId,
        nodeId: approval.nodeId,
        attemptId: approval.attemptId,
        permissionSnapshotHash: approval.permissionSnapshotHash,
        workspaceSnapshotHash: approval.workspaceSnapshotHash,
        operationScopeHash: approval.operationScopeHash,
        grantedAt: resolvedAt,
        expiresAt,
        usedAt: null,
        revokedAt: null,
        revocationReason: null,
      }
    } else if (outcome === 'expired') {
      grant = approval.grant
        ? {
            ...approval.grant,
            expiredAt: resolvedAt,
            expirationReason: text(reason || 'expired', 'expiration reason'),
          }
        : null
    } else if (outcome === 'revoked') {
      grant = approval.grant
        ? {
            ...approval.grant,
            revokedAt: resolvedAt,
            revocationReason: text(reason || 'revoked', 'revocation reason'),
          }
        : null
    }
    eventStore.append(approvalDraft(
      'agent_approval_resolved',
      approval,
      {
        approvalId: approval.id,
        outcome,
        resolutionScope,
        grant,
        reason: reason ? text(reason, 'approval reason') : null,
      },
      resolvedAt,
      `${outcome}:${resolvedAt}`,
    ))
    recordAgentRuntimeDiagnostic(diagnostics, {
      kind: 'approval_age',
      runId: approval.runId,
      nodeId: approval.nodeId,
      attemptId: approval.attemptId,
      providerClass: 'managed_hierarchy',
      durationMs: Math.max(0, resolvedAt - Number(approval.createdAt || resolvedAt)),
      outcome,
      attributes: { resolution_scope: resolutionScope || 'none' },
    }, warn)
    return get(approval.id)
  }

  function authorize(input = {}) {
    const approval = get(input.approvalId)
    if (TERMINAL_APPROVAL_STATUSES.has(approval.status)) {
      throw new TypeError(`Approval grant is ${approval.status}`)
    }
    if (approval.status !== 'approved' || !approval.grant) {
      throw new TypeError('Approval grant is not approved')
    }
    if (now() > approval.grant.expiresAt) {
      resolve({
        approvalId: approval.id,
        outcome: 'expired',
        reason: 'grant_expired',
      })
      throw new TypeError('Approval grant has expired')
    }
    if (input.runId !== approval.runId) throw new TypeError('Approval run does not match')
    if (input.nodeId !== approval.nodeId) throw new TypeError('Approval node does not match')
    if (input.attemptId !== approval.attemptId) throw new TypeError('Approval attempt does not match')
    const { graph, node, attempt } = requireGraphEntity(repository, input)
    if (hashAgentPermissionSnapshot(input.permissionSnapshot) !== approval.permissionSnapshotHash) {
      throw new TypeError('Approval permission snapshot no longer matches')
    }
    if (hashAgentPermissionSnapshot(attempt.permissionSnapshot) !== approval.permissionSnapshotHash) {
      throw new TypeError('Approval permission snapshot was narrowed after grant')
    }
    if (hash(workspaceSnapshot(input.workspaceSnapshot)) !== approval.workspaceSnapshotHash) {
      throw new TypeError('Approval workspace snapshot no longer matches')
    }
    if (hash(operationScope(input.operationScope)) !== approval.operationScopeHash) {
      throw new TypeError('Approval operation scope does not match')
    }
    const ancestors = node.branchPath
      .map((nodeId) => graph.nodes.find((entry) => entry.id === nodeId))
      .filter(Boolean)
    if (ancestors.some((entry) => ['cancelling', 'cancelled'].includes(entry.status))) {
      throw new TypeError('Approval grant was invalidated by ancestor cancellation')
    }
    if (approval.grant.resolutionScope === 'once') {
      const usedAt = now()
      eventStore.append(approvalDraft(
        'agent_approval_consumed',
        approval,
        {
          approvalId: approval.id,
          grantId: approval.grant.id,
          usedAt,
        },
        usedAt,
        `consumed:${usedAt}`,
      ))
    }
    return { authorized: true, grant: get(approval.id).grant }
  }

  function revokeDescendantGrants({ runId, ancestorNodeId, reason } = {}) {
    const graph = repository.getRunGraph(runId)
    if (!graph) throw new TypeError(`Agent run ${runId} was not found`)
    if (!graph.nodes.some((node) => node.id === ancestorNodeId)) {
      throw new TypeError(`Ancestor node ${ancestorNodeId} was not found`)
    }
    const approvalIds = graph.approvals
      .filter((approval) => (
        ['pending', 'approved'].includes(approval.status)
        && approval.parentPath.includes(ancestorNodeId)
        && approval.grant?.usedAt == null
      ))
      .map((approval) => approval.id)
    for (const approvalId of approvalIds) {
      resolve({
        approvalId,
        outcome: 'revoked',
        reason: reason || 'ancestor_cancelled',
      })
    }
    return { approvalIds }
  }

  return Object.freeze({
    authorize,
    get,
    request,
    resolve,
    revokeDescendantGrants,
  })
}
