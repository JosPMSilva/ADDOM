import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AGENT_EVENT_KINDS,
  validateAgentEvent,
  validateAgentEventSequence,
} from '../../src/common/agents/agent-event-contract.mjs'
import { makeAgentArtifact } from '../helpers/agent-runtime-fixtures.mjs'

const TS = 1_752_600_000_000

const VALID_PAYLOADS = Object.freeze({
  agent_run_created: { policyProfileId: 'balanced' },
  agent_run_started: {},
  agent_spawn_requested: { spawnRequestId: 'spawn_01', parentAttemptId: 'attempt_root_1', taskSummary: 'Review code' },
  agent_spawn_queued: { spawnRequestId: 'spawn_01' },
  agent_spawned: { spawnRequestId: 'spawn_01', childNodeId: 'agent_child' },
  agent_attempt_queued: { attemptId: 'attempt_root_1' },
  agent_started: { attemptId: 'attempt_root_1' },
  agent_status_changed: { entity: 'node', from: 'starting', to: 'running' },
  agent_commentary_delta: { delta: 'Checking the implementation.' },
  agent_assistant_delta: { delta: 'Drafting the final answer.' },
  agent_reasoning_delta: { delta: 'Inspecting the relevant boundary.' },
  agent_reasoning_boundary: { boundary: 'end' },
  agent_tool_started: { toolCallId: 'tool_01', toolName: 'read_file', toolClass: 'read' },
  agent_tool_output: { toolCallId: 'tool_01', output: 'file contents' },
  agent_tool_completed: { toolCallId: 'tool_01', status: 'completed' },
  agent_message_sent: { messageId: 'message_01', peerNodeId: 'agent_child', text: 'Please inspect this.' },
  agent_message_received: { messageId: 'message_02', peerNodeId: 'agent_child', text: 'Inspection complete.' },
  agent_orchestration_continuation_sent: {
    messageId: 'continuation_01', peerNodeId: 'agent_child', continuation: {
      schemaVersion: 1, kind: 'child_turn_final',
      source: { conversationId: 'conversation_01', turnId: 'turn_01', nodeId: 'agent_root', finalMessageId: 'final_01' },
      status: 'completed', provenance: { authorKind: 'agent', authorId: 'agent_root' },
      conclusion: 'Completed the review.', artifacts: [], inspectable: true,
    },
  },
  agent_orchestration_continuation_received: {
    messageId: 'continuation_02', peerNodeId: 'agent_child', continuation: {
      schemaVersion: 1, kind: 'child_turn_final',
      source: { conversationId: 'conversation_01', turnId: 'turn_01', nodeId: 'agent_child', finalMessageId: 'final_01' },
      status: 'completed', provenance: { authorKind: 'agent', authorId: 'agent_child' },
      conclusion: 'Completed the review.', artifacts: [], inspectable: true,
    },
  },
  agent_context_sent: {
    packetId: 'context_01',
    peerNodeId: 'agent_child',
    packetHash: 'd'.repeat(64),
    packet: { packetId: 'context_01' },
  },
  agent_context_received: {
    packetId: 'context_01',
    peerNodeId: 'agent_root',
    packetHash: 'd'.repeat(64),
    packet: { packetId: 'context_01' },
  },
  agent_final_message: { text: 'Completed the review.\n\n- No blockers found.' },
  agent_waiting: { reason: 'waiting_for_children' },
  agent_resumed: { reason: 'child_result_received' },
  agent_approval_requested: {
    approvalId: 'approval_01',
    permissionLevel: 'execute',
    operationSummary: 'Run tests',
    toolCallId: 'tool_approval_01',
    projectId: 'project_01',
    threadId: 'thread_01',
    providerId: 'openai-account',
    modelId: 'gpt-5.6-sol',
    permissionSnapshotHash: 'a'.repeat(64),
    workspaceSnapshotHash: 'b'.repeat(64),
    operationScopeHash: 'c'.repeat(64),
    operationScope: { toolName: 'shell', toolClass: 'execute', resource: 'tests' },
    workspaceSnapshot: {
      workspaceId: 'workspace_01',
      workspaceMode: 'local_worktree',
      baseRevision: 'sha256:test',
    },
    parentPath: ['agent_root'],
    allowedResolutionScopes: ['once'],
  },
  agent_approval_resolved: {
    approvalId: 'approval_01',
    outcome: 'approved',
    resolutionScope: 'once',
    grant: {
      id: 'grant_01',
      resolutionScope: 'once',
      runId: 'run_01',
      nodeId: 'agent_root',
      attemptId: 'attempt_root_1',
      permissionSnapshotHash: 'a'.repeat(64),
      workspaceSnapshotHash: 'b'.repeat(64),
      operationScopeHash: 'c'.repeat(64),
      grantedAt: TS,
      expiresAt: TS + 1_000,
    },
  },
  agent_approval_consumed: {
    approvalId: 'approval_01',
    grantId: 'grant_01',
    usedAt: TS,
  },
  agent_artifact_staged: {
    artifactId: 'artifact_01',
    workspaceMode: 'local_overlay',
    path: 'src/example.mjs',
    artifact: makeAgentArtifact(),
  },
  agent_workspace_ready: {
    workspaceId: 'workspace_01',
    workspaceMode: 'local_worktree',
    baseRevision: 'git:0123456789012345678901234567890123456789',
    leaseExpiresAt: TS + 10_000,
  },
  agent_merge_requested: {
    mergeId: 'merge_01',
    artifactIds: ['artifact_01'],
    operation: 'apply',
  },
  agent_merge_completed: {
    mergeId: 'merge_01',
    artifactIds: ['artifact_01'],
    status: 'completed',
    decision: { appliedAt: TS },
  },
  agent_completed: { resultSummary: 'Task complete.' },
  agent_failed: { errorSummary: 'Provider request failed.' },
  agent_cancel_requested: { scope: 'subtree', targetNodeId: 'agent_child' },
  agent_cancelled: { scope: 'subtree' },
  agent_run_finalizing: { finalAuthorityNodeId: 'agent_root' },
  agent_run_completed: { finalAuthorityNodeId: 'agent_root', completionReason: 'root_final_emitted' },
  agent_run_failed: { errorSummary: 'Root attempt failed.' },
  agent_run_cancelled: { completionReason: 'user_cancelled' },
  agent_reconciliation_recorded: {
    state: 'provider_ahead',
    reason: 'Provider emitted a late event.',
    sourceEventId: 'provider_event_late_01',
  },
})

function event(kind, overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: `event_${kind}`,
    runId: 'run_01',
    nodeId: 'agent_root',
    parentNodeId: null,
    runSequence: 1,
    nodeSequence: 1,
    attemptId: 'attempt_root_1',
    providerEventId: null,
    providerCorrelationKey: 'openai-account:response_01',
    idempotencyKey: `run_01:${kind}:1`,
    kind,
    payload: VALID_PAYLOADS[kind],
    createdAt: TS,
    ...overrides,
  }
}

test('every canonical event kind has a runtime payload validator', () => {
  assert.deepEqual(new Set(Object.keys(VALID_PAYLOADS)), new Set(AGENT_EVENT_KINDS))
  for (const kind of AGENT_EVENT_KINDS) {
    const validated = validateAgentEvent(event(kind))
    assert.equal(validated.kind, kind)
    assert.ok(Object.isFrozen(validated.payload))
  }
})

test('event validation rejects invalid envelope identity, sequence, kind, and payload', () => {
  assert.throws(() => validateAgentEvent(event('agent_run_started', { schemaVersion: 2 })), /schemaVersion/i)
  assert.throws(() => validateAgentEvent(event('agent_run_started', { eventId: '' })), /eventId/i)
  assert.throws(() => validateAgentEvent(event('agent_run_started', { runSequence: 0 })), /runSequence/i)
  assert.throws(() => validateAgentEvent(event('not_real', { payload: {} })), /kind/i)
  assert.throws(() => validateAgentEvent(event('agent_spawned', { payload: { spawnRequestId: 'spawn_01' } })), /childNodeId/i)
  assert.throws(() => validateAgentEvent(event('agent_tool_output', { payload: { toolCallId: 'tool_01' } })), /output/i)
  assert.throws(() => validateAgentEvent(event('agent_artifact_staged', {
    payload: {
      artifactId: 'artifact_01',
      workspaceMode: 'local_overlay',
      path: 'src/example.mjs',
    },
  })), /artifact/i)
  assert.throws(() => validateAgentEvent(event('agent_merge_requested', {
    payload: { mergeId: 'merge_01', artifactIds: ['artifact_01'], operation: 'force' },
  })), /operation/i)
  assert.throws(() => validateAgentEvent(event('agent_run_started', { providerCorrelationKey: 'not-namespaced' })), /namespaced/i)
  assert.throws(() => validateAgentEvent(event('agent_status_changed', {
    payload: { entity: 'node', from: 'completed', to: 'running' },
  })), /transition/i)
  assert.throws(() => validateAgentEvent(event('agent_run_completed', {
    nodeId: 'agent_child',
    parentNodeId: 'agent_root',
  })), /finalAuthorityNodeId/i)
})

test('event validation accepts safe additive metadata without provider-specific SDK types', () => {
  const validated = validateAgentEvent(event('agent_commentary_delta', {
    adapterMetadata: { source: 'future-provider', vendor_counter: 7 },
    payload: {
      delta: 'Hello',
      providerMetadata: { custom_event_shape: true },
    },
  }))
  assert.equal(validated.adapterMetadata.vendor_counter, 7)
  assert.equal(validated.payload.providerMetadata.custom_event_shape, true)
  assert.throws(() => validateAgentEvent(event('agent_commentary_delta', {
    payload: { delta: 'Hello', providerMetadata: { invalid: 1n } },
  })), /serializable/i)
})

test('stream delta validation preserves provider whitespace byte-for-byte', () => {
  const delta = ' leading and trailing whitespace \n'
  for (const kind of [
    'agent_commentary_delta',
    'agent_assistant_delta',
    'agent_reasoning_delta',
  ]) {
    const validated = validateAgentEvent(event(kind, { payload: { delta } }))
    assert.equal(validated.payload.delta, delta, kind)
  }
})

test('sequence validation enforces monotonic run order and independent per-node FIFO order', () => {
  const events = [
    event('agent_run_created', { eventId: 'event_01', runSequence: 1, nodeSequence: 1 }),
    event('agent_run_started', { eventId: 'event_02', runSequence: 2, nodeSequence: 2 }),
    event('agent_spawned', {
      eventId: 'event_03',
      runSequence: 3,
      nodeSequence: 3,
      payload: VALID_PAYLOADS.agent_spawned,
    }),
    event('agent_started', {
      eventId: 'event_04',
      nodeId: 'agent_child',
      parentNodeId: 'agent_root',
      runSequence: 4,
      nodeSequence: 1,
      attemptId: 'attempt_child_1',
      payload: { attemptId: 'attempt_child_1' },
    }),
  ]

  assert.doesNotThrow(() => validateAgentEventSequence(events))
  assert.throws(() => validateAgentEventSequence([
    events[0],
    { ...events[1], runSequence: 1 },
  ]), /run sequence/i)
  assert.throws(() => validateAgentEventSequence([
    events[0],
    { ...events[1], nodeSequence: 3 },
  ]), /node sequence/i)
  assert.throws(() => validateAgentEventSequence([
    events[0],
    { ...events[1], eventId: events[0].eventId },
  ]), /eventId/i)
})

test('event sequence validation does not use wall-clock timestamps as ordering authority', () => {
  assert.doesNotThrow(() => validateAgentEventSequence([
    event('agent_run_created', { eventId: 'event_01', runSequence: 1, nodeSequence: 1, createdAt: TS + 100 }),
    event('agent_run_started', { eventId: 'event_02', runSequence: 2, nodeSequence: 2, createdAt: TS }),
  ]))
})

test('resultSummary and broker message text accept TAB/LF/CR but reject other control characters', () => {
  const multiline = 'Line one\nLine two\r\nLine three\tcontinue'
  assert.doesNotThrow(() => validateAgentEvent(event('agent_completed', {
    payload: { resultSummary: multiline },
  })))
  assert.doesNotThrow(() => validateAgentEvent(event('agent_failed', {
    payload: { errorSummary: multiline },
  })))
  assert.doesNotThrow(() => validateAgentEvent(event('agent_message_sent', {
    payload: { messageId: 'message_01', peerNodeId: 'agent_child', text: multiline },
  })))
  assert.doesNotThrow(() => validateAgentEvent(event('agent_message_received', {
    payload: { messageId: 'message_02', peerNodeId: 'agent_child', text: multiline },
  })))
  assert.doesNotThrow(() => validateAgentEvent(event('agent_commentary_delta', {
    payload: { delta: 'delta\nwith newline' },
  })))
  assert.doesNotThrow(() => validateAgentEvent(event('agent_final_message', {
    payload: { text: 'Final answer\n\n- Verified' },
  })))

  assert.throws(
    () => validateAgentEvent(event('agent_completed', {
      payload: { resultSummary: `bad${String.fromCharCode(0x07)}bell` },
    })),
    /control character/i,
  )
  assert.throws(
    () => validateAgentEvent(event('agent_message_sent', {
      payload: { messageId: 'message_01', peerNodeId: 'agent_child', text: `c1${String.fromCharCode(0x85)}nel` },
    })),
    /control character/i,
  )
  assert.throws(
    () => validateAgentEvent(event('agent_completed', {
      payload: { resultSummary: `c1${String.fromCharCode(0x9F)}` },
    })),
    /control character/i,
  )
  assert.throws(
    () => validateAgentEvent(event('agent_final_message', {
      payload: { text: 'x'.repeat(200_001) },
    })),
    /exceeds 200000/i,
  )
})
