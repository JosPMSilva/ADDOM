import { resolveAgentPolicyProfile } from '../../src/common/agents/agent-policy-profile.mjs'

export const AGENT_TEST_TIMESTAMP = 1_752_600_000_000

export function makeAgentUsage(scope = 'exclusive', overrides = {}) {
  return {
    scope,
    inputTokens: 10,
    outputTokens: 5,
    cachedInputTokens: 0,
    reasoningTokens: 2,
    totalTokens: 15,
    costUsd: 0.001,
    rawProviderUsage: { input_tokens: 10, output_tokens: 5 },
    ...overrides,
  }
}

export function makeAgentCapabilities(overrides = {}) {
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

export function makeAgentPermission(level = 'all') {
  const toolClasses = level === 'read_only'
    ? ['read']
    : level === 'read_write'
      ? ['read', 'write']
      : level === 'execute'
        ? ['read', 'execute']
        : ['read', 'write', 'execute']
  return { level, toolClasses }
}

export function makeAgentRun(overrides = {}) {
  const status = overrides.status || 'created'
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(status)
  return {
    schemaVersion: 1,
    id: 'run_01',
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    rootNodeId: 'agent_root',
    status,
    policyProfileId: 'high',
    createdAt: AGENT_TEST_TIMESTAMP,
    startedAt: status === 'created' ? null : AGENT_TEST_TIMESTAMP + 1,
    finishedAt: isTerminal ? AGENT_TEST_TIMESTAMP + 100 : null,
    providerMix: ['openai-account', 'openrouter'],
    activeNodeCount: isTerminal ? 0 : 1,
    queuedNodeCount: status === 'created' ? 1 : 0,
    terminalNodeCount: isTerminal ? 1 : 0,
    exclusiveUsage: makeAgentUsage('exclusive'),
    inclusiveUsage: makeAgentUsage('inclusive'),
    budgetSnapshot: resolveAgentPolicyProfile('high').limits,
    finalAuthorityNodeId: 'agent_root',
    completionReason: isTerminal ? `${status}_for_test` : null,
    reconciliationStatus: 'matched',
    ...overrides,
  }
}

export function makeAgentNode(overrides = {}) {
  const id = overrides.id || 'agent_root'
  const rootNodeId = overrides.rootNodeId || 'agent_root'
  const depth = overrides.depth ?? (id === rootNodeId ? 0 : 1)
  const status = overrides.status || 'queued'
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(status)
  const started = !['queued', 'starting'].includes(status)
  return {
    schemaVersion: 1,
    id,
    runId: 'run_01',
    parentNodeId: id === rootNodeId ? null : 'agent_root',
    rootNodeId,
    providerId: id === rootNodeId ? 'openai-account' : 'openrouter',
    modelId: id === rootNodeId ? 'gpt-5.6-sol' : 'anthropic/claude-sonnet-5',
    providerAgentId: null,
    providerThreadId: null,
    roleId: id === rootNodeId ? 'root' : 'reviewer',
    roleLabel: id === rootNodeId ? 'Primary agent' : 'Reviewer',
    taskId: `task_${id}`,
    taskSummary: `Task for ${id}`,
    depth,
    branchPath: depth === 0 ? [rootNodeId] : [rootNodeId, id],
    generation: depth,
    spawnedByEventId: depth === 0 ? null : `event_spawn_${id}`,
    spawnRequestId: depth === 0 ? null : `spawn_${id}`,
    status,
    attemptId: started ? `attempt_${id}_1` : null,
    capabilitySnapshot: makeAgentCapabilities(),
    permissionSnapshot: makeAgentPermission(depth === 0 ? 'all' : 'read_only'),
    workspaceId: 'workspace_01',
    workspaceMode: depth === 0 ? 'local_worktree' : 'local_shared_read',
    createdAt: AGENT_TEST_TIMESTAMP,
    startedAt: started ? AGENT_TEST_TIMESTAMP + 1 : null,
    finishedAt: isTerminal ? AGENT_TEST_TIMESTAMP + 100 : null,
    exclusiveUsage: makeAgentUsage('exclusive'),
    inclusiveUsage: makeAgentUsage('inclusive'),
    childCount: 0,
    resultSummary: status === 'completed' ? `Result for ${id}` : null,
    errorSummary: status === 'failed' ? `Failure for ${id}` : null,
    ...overrides,
  }
}

export function makeAgentAttempt(nodeId = 'agent_root', overrides = {}) {
  const status = overrides.status || 'running'
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(status)
  return {
    schemaVersion: 1,
    id: `attempt_${nodeId}_1`,
    runId: 'run_01',
    nodeId,
    attemptNumber: 1,
    parentAttemptId: nodeId === 'agent_root' ? null : 'attempt_agent_root_1',
    providerRequestId: `provider_request_${nodeId}`,
    providerCorrelationKey: `test-adapter:${nodeId}`,
    reconciliationState: 'matched',
    status,
    capabilitySnapshot: makeAgentCapabilities(),
    permissionSnapshot: makeAgentPermission(nodeId === 'agent_root' ? 'all' : 'read_only'),
    workspaceId: 'workspace_01',
    workspaceMode: nodeId === 'agent_root' ? 'local_worktree' : 'local_shared_read',
    background: false,
    backgroundKind: 'foreground',
    startedAt: AGENT_TEST_TIMESTAMP + 1,
    finishedAt: isTerminal ? AGENT_TEST_TIMESTAMP + 100 : null,
    stopReason: isTerminal ? `${status}_for_test` : null,
    errorCode: status === 'failed' ? 'TEST_FAILURE' : null,
    usage: makeAgentUsage('exclusive'),
    recoveryOfAttemptId: null,
    ...overrides,
  }
}

export function makeAgentArtifact(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'artifact_01',
    runId: 'run_01',
    nodeId: 'agent_root',
    attemptId: 'attempt_agent_root_1',
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
    createdAt: AGENT_TEST_TIMESTAMP,
    metadata: { staged: true },
    ...overrides,
  }
}

export function makeAgentEventDraft(kind, payload, overrides = {}) {
  const nodeId = overrides.nodeId || 'agent_root'
  return {
    eventId: overrides.eventId || `event_${kind}_${nodeId}`,
    runId: 'run_01',
    nodeId,
    parentNodeId: nodeId === 'agent_root' ? null : 'agent_root',
    attemptId: overrides.attemptId === undefined ? `attempt_${nodeId}_1` : overrides.attemptId,
    providerEventId: overrides.providerEventId ?? null,
    providerCorrelationKey: overrides.providerCorrelationKey ?? 'test-adapter:run_01',
    idempotencyKey: overrides.idempotencyKey || `run_01:${kind}:${nodeId}`,
    kind,
    payload,
    createdAt: overrides.createdAt ?? AGENT_TEST_TIMESTAMP,
    ...overrides,
  }
}

export function seedAgentWorkspace(db) {
  db.prepare(`
    INSERT INTO workspace_projects (
      id, path, name, created_at, last_opened_at, last_worked_at, last_provider, last_model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'project_01',
    'C:/workspace/project-01',
    'Project 01',
    AGENT_TEST_TIMESTAMP,
    AGENT_TEST_TIMESTAMP,
    AGENT_TEST_TIMESTAMP,
    'openai-account',
    'gpt-5.6-sol',
  )
  db.prepare(`
    INSERT INTO chat_threads (
      id, project_id, title, created_at, updated_at, last_viewed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'thread_01',
    'project_01',
    'Agent runtime test',
    AGENT_TEST_TIMESTAMP,
    AGENT_TEST_TIMESTAMP,
    AGENT_TEST_TIMESTAMP,
  )
}
