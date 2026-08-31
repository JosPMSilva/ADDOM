import test from 'node:test'
import assert from 'node:assert/strict'

import { validateAgentRun } from '../../src/common/agents/agent-run-contract.mjs'
import { validateAgentNode } from '../../src/common/agents/agent-node-contract.mjs'
import { validateAgentAttempt } from '../../src/common/agents/agent-attempt-contract.mjs'
import { validateAgentDelegationRequest } from '../../src/common/agents/agent-delegation-contract.mjs'
import { validateAgentArtifact } from '../../src/common/agents/agent-artifact-contract.mjs'
import {
  assertAgentStatusTransition,
  AGENT_RECONCILIATION_STATES,
} from '../../src/common/agents/agent-status.mjs'
import {
  assertCapabilitySubset,
  intersectAgentCapabilities,
  validateAgentCapabilities,
} from '../../src/common/agents/agent-capabilities.mjs'
import {
  assertPermissionNarrowing,
  validateAgentPermissionSnapshot,
} from '../../src/common/agents/agent-permissions.mjs'
import {
  isAuthoritativeAgentUsage,
  validateAgentUsage,
} from '../../src/common/agents/agent-usage.mjs'
import {
  AGENT_POLICY_HARD_CEILINGS,
  resolveAgentPolicyProfile,
} from '../../src/common/agents/agent-policy-profile.mjs'
import {
  AGENT_BACKGROUND_KINDS,
  resolveAgentCancellationSemantics,
} from '../../src/common/agents/agent-cancellation.mjs'

const TS = 1_752_600_000_000

function capability(overrides = {}) {
  return {
    mode: 'managed_hierarchy',
    nativeAgents: false,
    recursiveAgents: true,
    childStreams: true,
    addressableChildren: true,
    childMessaging: true,
    childCancellation: true,
    childRetry: true,
    resumableChildren: true,
    perNodeUsage: true,
    approvalAttribution: true,
    workspaceIsolation: true,
    maxDepthHint: 6,
    maxConcurrencyHint: 16,
    visibilityReason: null,
    capabilityKey: 'managed_hierarchy',
    ...overrides,
  }
}

function permission(level = 'read_only', toolClasses = ['read']) {
  return { level, toolClasses }
}

function usage(scope = 'exclusive', overrides = {}) {
  return {
    scope,
    inputTokens: 100,
    outputTokens: 40,
    cachedInputTokens: 10,
    reasoningTokens: 12,
    totalTokens: 140,
    costUsd: 0.0042,
    rawProviderUsage: { input_tokens: 100, output_tokens: 40 },
    ...overrides,
  }
}

function rootNode(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'agent_root',
    runId: 'run_01',
    parentNodeId: null,
    rootNodeId: 'agent_root',
    providerId: 'openai-account',
    modelId: 'gpt-5.6-sol',
    providerAgentId: 'native_agent_01',
    providerThreadId: 'native_thread_01',
    roleId: 'root',
    roleLabel: 'Primary agent',
    taskId: 'task_root',
    taskSummary: 'Coordinate the implementation',
    depth: 0,
    branchPath: ['agent_root'],
    generation: 0,
    spawnedByEventId: null,
    spawnRequestId: null,
    status: 'running',
    attemptId: 'attempt_root_1',
    capabilitySnapshot: capability({ nativeAgents: true }),
    permissionSnapshot: permission('all', ['read', 'write', 'execute']),
    workspaceId: 'workspace_01',
    workspaceMode: 'local_worktree',
    createdAt: TS,
    startedAt: TS + 1,
    finishedAt: null,
    exclusiveUsage: usage('exclusive'),
    inclusiveUsage: usage('inclusive', { totalTokens: 300 }),
    childCount: 2,
    resultSummary: null,
    errorSummary: null,
    ...overrides,
  }
}

function run(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'run_01',
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    rootNodeId: 'agent_root',
    status: 'running',
    policyProfileId: 'high',
    createdAt: TS,
    startedAt: TS + 1,
    finishedAt: null,
    providerMix: ['openai-account', 'cursor', 'openrouter'],
    activeNodeCount: 2,
    queuedNodeCount: 1,
    terminalNodeCount: 0,
    exclusiveUsage: usage('exclusive'),
    inclusiveUsage: usage('inclusive', { totalTokens: 300 }),
    budgetSnapshot: resolveAgentPolicyProfile('high').limits,
    finalAuthorityNodeId: 'agent_root',
    completionReason: null,
    reconciliationStatus: 'matched',
    ...overrides,
  }
}

function attempt(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'attempt_root_1',
    runId: 'run_01',
    nodeId: 'agent_root',
    attemptNumber: 1,
    parentAttemptId: null,
    providerRequestId: 'response_01',
    providerCorrelationKey: 'openai-account:response_01',
    reconciliationState: 'matched',
    status: 'running',
    capabilitySnapshot: capability({ nativeAgents: true }),
    permissionSnapshot: permission('all', ['read', 'write', 'execute']),
    workspaceId: 'workspace_01',
    workspaceMode: 'local_worktree',
    background: false,
    backgroundKind: 'foreground',
    startedAt: TS + 1,
    finishedAt: null,
    stopReason: null,
    errorCode: null,
    usage: usage('exclusive'),
    recoveryOfAttemptId: null,
    ...overrides,
  }
}

test('canonical run, node, and attempt accept arbitrary cross-provider identities and additive metadata', () => {
  const runContract = validateAgentRun({ ...run(), futureField: { safe: true } })
  const rootContract = validateAgentNode(rootNode())
  const childContract = validateAgentNode(rootNode({
    id: 'agent_child',
    parentNodeId: 'agent_root',
    providerId: 'a-future-provider',
    modelId: 'vendor/model-that-does-not-exist-in-the-catalog-yet',
    providerAgentId: null,
    providerThreadId: null,
    roleId: 'reviewer',
    roleLabel: 'Reviewer',
    taskId: 'task_child',
    taskSummary: 'Review the implementation',
    depth: 1,
    branchPath: ['agent_root', 'agent_child'],
    generation: 1,
    spawnedByEventId: 'event_spawn_01',
    spawnRequestId: 'spawn_01',
    attemptId: 'attempt_child_1',
    capabilitySnapshot: capability(),
    permissionSnapshot: permission('read_only', ['read']),
    workspaceMode: 'local_shared_read',
    childCount: 0,
  }))
  const attemptContract = validateAgentAttempt(attempt())

  assert.equal(runContract.futureField.safe, true)
  assert.equal(rootContract.id, 'agent_root')
  assert.equal(childContract.providerId, 'a-future-provider')
  assert.equal(attemptContract.reconciliationState, 'matched')
  assert.ok(Object.isFrozen(runContract))
  assert.ok(Object.isFrozen(childContract.branchPath))

  const recursiveGrandchild = validateAgentNode(rootNode({
    id: 'agent_grandchild',
    parentNodeId: 'agent_child',
    providerId: 'openrouter',
    modelId: 'some-org/some-new-model',
    depth: 2,
    branchPath: ['agent_root', 'agent_child', 'agent_grandchild'],
    generation: 2,
    spawnedByEventId: 'event_spawn_02',
    spawnRequestId: 'spawn_02',
  }))
  assert.equal(recursiveGrandchild.depth, 2)
  assert.deepEqual(validateAgentNode(JSON.parse(JSON.stringify(recursiveGrandchild))), recursiveGrandchild)
})

test('run validation rejects invalid identity, authority, usage scope, and terminal timestamps', () => {
  assert.throws(() => validateAgentRun(run({ id: '   ' })), /id/i)
  assert.throws(() => validateAgentRun(run({ schemaVersion: 2 })), /schemaVersion/i)
  assert.throws(() => validateAgentRun(run({ finalAuthorityNodeId: 'agent_child' })), /finalAuthorityNodeId/i)
  assert.throws(() => validateAgentRun(run({ exclusiveUsage: usage('inclusive') })), /exclusive/i)
  assert.throws(() => validateAgentRun(run({ budgetSnapshot: [] })), /budgetSnapshot/i)
  assert.throws(() => validateAgentRun(run({ status: 'completed', finishedAt: null })), /finishedAt/i)
})

test('node validation enforces root parentage, recursive depth, branch path, and summary safety', () => {
  assert.throws(() => validateAgentNode(rootNode({ parentNodeId: 'agent_parent' })), /parentNodeId/i)
  assert.throws(() => validateAgentNode(rootNode({ depth: 1 })), /depth/i)
  assert.throws(() => validateAgentNode(rootNode({ branchPath: ['agent_other'] })), /branchPath/i)
  assert.throws(() => validateAgentNode(rootNode({ resultSummary: new Error('not serializable') })), /resultSummary/i)

  const completed = validateAgentNode(rootNode({
    status: 'completed',
    finishedAt: TS + 2,
    resultSummary: 'Verified the contract.',
  }))
  assert.equal(completed.resultSummary, 'Verified the contract.')
})

test('attempt validation preserves retry identity and explicit degraded reconciliation states', () => {
  for (const reconciliationState of AGENT_RECONCILIATION_STATES) {
    const value = validateAgentAttempt(attempt({ reconciliationState }))
    assert.equal(value.reconciliationState, reconciliationState)
  }

  const retry = validateAgentAttempt(attempt({
    id: 'attempt_root_2',
    attemptNumber: 2,
    recoveryOfAttemptId: 'attempt_root_1',
    providerId: 'openrouter',
    modelId: 'anthropic/claude-sonnet-5',
  }))
  assert.equal(retry.recoveryOfAttemptId, 'attempt_root_1')
  assert.throws(() => validateAgentAttempt(attempt({ workspaceMode: 'invented_mode' })), /workspaceMode/i)
  assert.throws(() => validateAgentAttempt(attempt({ providerCorrelationKey: 'not-namespaced' })), /namespaced/i)
})

test('attempt background kinds preserve provider-neutral parent-turn cancellation semantics', () => {
  assert.deepEqual(AGENT_BACKGROUND_KINDS, [
    'foreground',
    'native_background',
    'auto_backgrounded',
    'explicitly_detached',
  ])
  for (const backgroundKind of AGENT_BACKGROUND_KINDS.slice(1)) {
    assert.equal(validateAgentAttempt(attempt({
      background: true,
      backgroundKind,
    })).backgroundKind, backgroundKind)
  }
  assert.throws(() => validateAgentAttempt(attempt({
    background: false,
    backgroundKind: 'native_background',
  })), /backgroundKind/i)
  assert.throws(() => validateAgentAttempt(attempt({
    background: true,
    backgroundKind: 'foreground',
  })), /backgroundKind/i)
})

test('status transitions are explicit and terminal states cannot reopen', () => {
  assert.doesNotThrow(() => assertAgentStatusTransition('node', 'queued', 'starting'))
  assert.doesNotThrow(() => assertAgentStatusTransition('node', 'running', 'waiting'))
  assert.doesNotThrow(() => assertAgentStatusTransition('node', 'running', 'cancelling'))
  assert.doesNotThrow(() => assertAgentStatusTransition('attempt', 'cancelling', 'cancelled'))
  assert.doesNotThrow(() => assertAgentStatusTransition('run', 'running', 'finalizing'))
  assert.doesNotThrow(() => assertAgentStatusTransition('run', 'running', 'cancelling'))
  assert.throws(() => assertAgentStatusTransition('node', 'completed', 'running'), /transition/i)
  assert.throws(() => assertAgentStatusTransition('attempt', 'failed', 'starting'), /transition/i)
  assert.throws(() => assertAgentStatusTransition('unknown', 'queued', 'running'), /entity/i)
})

test('provider capability snapshots are class-based, opaque-safe, and cannot widen', () => {
  const parent = validateAgentCapabilities(capability({ maxDepthHint: 4, maxConcurrencyHint: 8 }))
  const child = validateAgentCapabilities(capability({
    childRetry: false,
    maxDepthHint: 2,
    maxConcurrencyHint: 4,
  }))
  assert.doesNotThrow(() => assertCapabilitySubset(parent, child))

  assert.throws(() => assertCapabilitySubset(
    validateAgentCapabilities(capability({ childCancellation: false })),
    validateAgentCapabilities(capability({ childCancellation: true })),
  ), /widen/i)
  assert.throws(() => assertCapabilitySubset(parent, validateAgentCapabilities(capability({ maxDepthHint: 5 }))), /widen/i)

  const negotiated = intersectAgentCapabilities(parent, capability({
    childRetry: false,
    maxDepthHint: 10,
    maxConcurrencyHint: 2,
  }))
  assert.equal(negotiated.childRetry, false)
  assert.equal(negotiated.maxDepthHint, 4)
  assert.equal(negotiated.maxConcurrencyHint, 2)

  const opaque = validateAgentCapabilities(capability({
    mode: 'provider_opaque',
    recursiveAgents: false,
    childStreams: false,
    addressableChildren: false,
    childMessaging: false,
    childCancellation: false,
    childRetry: false,
    resumableChildren: false,
    perNodeUsage: false,
    approvalAttribution: false,
    workspaceIsolation: false,
    maxDepthHint: null,
    maxConcurrencyHint: null,
    visibilityReason: 'Provider exposes activity but no stable child identity.',
    capabilityKey: 'provider_managed_partial_visibility',
  }))
  assert.equal(opaque.mode, 'provider_opaque')
  assert.throws(() => validateAgentCapabilities({ ...opaque, childCancellation: true }), /provider_opaque/i)
  assert.throws(() => validateAgentNode(rootNode({
    capabilitySnapshot: opaque,
    workspaceMode: 'remote_provider_workspace',
  })), /opaque_no_write_surface/i)

  const capabilityClasses = [
    capability({ mode: 'native_hierarchy', nativeAgents: true, capabilityKey: 'native_hierarchy' }),
    capability({ mode: 'partial_native_projection', nativeAgents: true, capabilityKey: 'partial_native_projection' }),
    capability(),
    opaque,
    capability({
      mode: 'contract_only',
      nativeAgents: false,
      recursiveAgents: false,
      childStreams: false,
      addressableChildren: false,
      childMessaging: false,
      childCancellation: false,
      childRetry: false,
      resumableChildren: false,
      perNodeUsage: false,
      approvalAttribution: false,
      workspaceIsolation: false,
      maxDepthHint: null,
      maxConcurrencyHint: null,
      capabilityKey: 'contract_only',
    }),
  ]
  assert.deepEqual(
    capabilityClasses.map((entry) => validateAgentCapabilities(entry).mode),
    ['native_hierarchy', 'partial_native_projection', 'managed_hierarchy', 'provider_opaque', 'contract_only'],
  )
  assert.throws(() => validateAgentCapabilities(capability({
    mode: 'contract_only',
    nativeAgents: false,
    recursiveAgents: false,
    childStreams: false,
    addressableChildren: false,
    childMessaging: false,
    childCancellation: false,
    childRetry: false,
    resumableChildren: false,
    perNodeUsage: false,
    approvalAttribution: false,
    workspaceIsolation: false,
    maxDepthHint: 1,
    maxConcurrencyHint: null,
    capabilityKey: 'contract_only',
  })), /contract_only capability hints/i)
})

test('permission inheritance implements the required partial order and exhaustive tool classes', () => {
  const all = validateAgentPermissionSnapshot(permission('all', ['read', 'write', 'execute']))
  const readWrite = validateAgentPermissionSnapshot(permission('read_write', ['read', 'write']))
  const execute = validateAgentPermissionSnapshot(permission('execute', ['read', 'execute']))
  const readOnly = validateAgentPermissionSnapshot(permission('read_only', ['read']))

  assert.doesNotThrow(() => assertPermissionNarrowing(all, readWrite))
  assert.doesNotThrow(() => assertPermissionNarrowing(readWrite, readOnly))
  assert.doesNotThrow(() => assertPermissionNarrowing(execute, readOnly))
  assert.throws(() => assertPermissionNarrowing(readWrite, execute), /widen|incomparable/i)
  assert.throws(() => assertPermissionNarrowing(execute, readWrite), /widen|incomparable/i)
  assert.throws(() => validateAgentPermissionSnapshot(permission('read_only', ['write'])), /toolClasses/i)
  assert.throws(() => validateAgentPermissionSnapshot(permission('all', ['network'])), /tool class/i)
})

test('usage keeps raw counters and excludes unknown scope from authoritative totals', () => {
  const exclusive = validateAgentUsage(usage('exclusive'))
  const unknown = validateAgentUsage(usage('unknown_scope', {
    rawProviderUsage: { vendor_total: 140, billing_scope: 'undocumented' },
  }))
  assert.equal(isAuthoritativeAgentUsage(exclusive), true)
  assert.equal(isAuthoritativeAgentUsage(unknown), false)
  assert.equal(unknown.rawProviderUsage.vendor_total, 140)
  assert.throws(() => validateAgentUsage(usage('exclusive', { totalTokens: 10 })), /totalTokens/i)
  assert.throws(() => validateAgentUsage(usage('exclusive', { costUsd: -1 })), /costUsd/i)
})

test('policy profiles are bounded and provider hints only narrow effective limits', () => {
  const conservative = resolveAgentPolicyProfile('conservative')
  const ultra = resolveAgentPolicyProfile('ultra', {
    providerHints: { maxDepthHint: 3, maxConcurrencyHint: 12 },
  })

  assert.ok(conservative.limits.maxLiveAgents < ultra.limits.maxLiveAgents)
  assert.ok(ultra.limits.maxDescendants >= 100)
  assert.ok(ultra.limits.maxAttemptsPerNode >= 3)
  assert.equal(ultra.providerHints.maxDepthHint, 3)
  assert.equal(ultra.effectiveLimits.maxDepth, 3)
  assert.equal(ultra.effectiveLimits.maxLiveAgents, 12)
  assert.ok(ultra.limits.maxDepth <= AGENT_POLICY_HARD_CEILINGS.maxDepth)
  assert.throws(() => resolveAgentPolicyProfile('unbounded'), /profile/i)
  assert.throws(() => resolveAgentPolicyProfile('ultra', {
    overrides: { maxDepth: AGENT_POLICY_HARD_CEILINGS.maxDepth + 1 },
  }), /hard ceiling/i)
})

test('cancellation scopes have deterministic background-descendant behavior', () => {
  assert.deepEqual(resolveAgentCancellationSemantics('node'), {
    scope: 'node',
    cancelTarget: true,
    descendantSelection: 'none',
    backgroundDescendants: 'survive',
  })
  assert.equal(resolveAgentCancellationSemantics('parent_turn').backgroundDescendants, 'survive')
  assert.equal(resolveAgentCancellationSemantics('subtree').backgroundDescendants, 'cancel')
  assert.equal(resolveAgentCancellationSemantics('run').backgroundDescendants, 'cancel')
  assert.throws(() => resolveAgentCancellationSemantics('maybe'), /scope/i)
})

test('delegation and artifact contracts bind lineage, capability, permission, and workspace provenance', () => {
  const delegation = validateAgentDelegationRequest({
    schemaVersion: 1,
    id: 'spawn_01',
    runId: 'run_01',
    parentNodeId: 'agent_root',
    parentAttemptId: 'attempt_root_1',
    taskId: 'task_child',
    taskSummary: 'Inspect the renderer',
    roleId: 'reviewer',
    providerId: 'cursor',
    modelId: 'composer-2.5',
    capabilitySnapshot: capability({ maxDepthHint: 2 }),
    permissionSnapshot: permission('read_only', ['read']),
    workspaceMode: 'local_shared_read',
    background: true,
    createdAt: TS,
  })
  const artifact = validateAgentArtifact({
    schemaVersion: 1,
    id: 'artifact_01',
    runId: 'run_01',
    nodeId: 'agent_child',
    attemptId: 'attempt_child_1',
    workspaceId: 'workspace_01',
    workspaceMode: 'local_overlay',
    baseRevision: 'snapshot:base',
    baseContentDigest: 'sha256:base-content',
    kind: 'file_patch',
    operationType: 'write_file',
    path: 'src/example.mjs',
    originalPath: null,
    digest: 'sha256:abc123',
    sizeBytes: 42,
    dependencies: [],
    provenance: {
      origin: 'local_workspace',
      verifiedLocalImport: false,
      providerArtifactId: null,
    },
    createdAt: TS,
    metadata: { staged: true },
  })

  assert.equal(delegation.providerId, 'cursor')
  assert.equal(artifact.workspaceMode, 'local_overlay')
  assert.throws(() => validateAgentDelegationRequest({ ...delegation, parentNodeId: '' }), /parentNodeId/i)
  assert.throws(() => validateAgentArtifact({ ...artifact, path: 'C:\\private\\absolute.txt' }), /relative/i)
  assert.throws(() => validateAgentArtifact({ ...artifact, baseRevision: '' }), /baseRevision/i)
  assert.throws(() => validateAgentArtifact({
    ...artifact,
    workspaceMode: 'remote_provider_workspace',
    provenance: {
      origin: 'provider_reference',
      verifiedLocalImport: true,
      providerArtifactId: null,
    },
  }), /providerArtifactId/i)
})
