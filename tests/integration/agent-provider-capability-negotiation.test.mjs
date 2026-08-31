import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  createAgentProviderCapabilitySnapshot,
} from '../../src/main/agents/providers/agent-provider-capability-probe.mjs'
import {
  createProviderOpaqueNode,
} from '../../src/main/agents/providers/provider-opaque-node.mjs'
import {
  AGENT_PROVIDER_CAPABILITY_FIELDS,
  validateAgentProviderCapabilitySnapshot,
} from '../../src/common/agents/agent-provider-capability-snapshot.mjs'
import { validateAgentRun } from '../../src/common/agents/agent-run-contract.mjs'
import { validateAgentNode } from '../../src/common/agents/agent-node-contract.mjs'
import { validateAgentAttempt } from '../../src/common/agents/agent-attempt-contract.mjs'

const TS = 1_752_600_000_000

function readManifest(name) {
  return JSON.parse(readFileSync(
    new URL(`../fixtures/agent-runs/${name}/manifest.json`, import.meta.url),
    'utf8',
  ))
}

function capabilities(mode = 'managed_hierarchy', overrides = {}) {
  const enabled = mode !== 'contract_only' && mode !== 'provider_opaque'
  return {
    mode,
    nativeAgents: mode === 'native_hierarchy' || mode === 'partial_native_projection',
    recursiveAgents: enabled,
    childStreams: enabled,
    addressableChildren: enabled,
    childMessaging: enabled,
    childCancellation: enabled,
    childRetry: enabled,
    resumableChildren: enabled,
    perNodeUsage: enabled,
    approvalAttribution: enabled,
    workspaceIsolation: enabled,
    maxDepthHint: enabled ? 8 : null,
    maxConcurrencyHint: enabled ? 32 : null,
    visibilityReason: mode === 'provider_opaque'
      ? 'Provider exposes activity without addressable child controls.'
      : null,
    capabilityKey: mode === 'provider_opaque'
      ? 'provider_managed_partial_visibility'
      : mode,
    ...overrides,
  }
}

function operationCapabilities(value = true) {
  return Object.fromEntries(AGENT_PROVIDER_CAPABILITY_FIELDS.map((field) => [field, value]))
}

function snapshotInput(overrides = {}) {
  return {
    providerId: 'provider-test',
    modelId: 'model-test',
    capturedAt: TS,
    runtimeAvailability: { status: 'available', reason: null },
    providerCapabilities: {
      operations: operationCapabilities(),
      node: capabilities(),
      evidence: {
        sourceClass: 'conformance_fixture',
        confidence: 'verified',
        provenance: ['tests/integration/agent-provider-capability-negotiation.test.mjs'],
      },
    },
    modelCapabilities: {
      agentRuntime: true,
      disabledCapabilities: [],
      maxDepthHint: null,
      maxConcurrencyHint: null,
    },
    ...overrides,
  }
}

test('capability negotiation preserves provider evidence and narrows effective controls by model', () => {
  const source = snapshotInput({
    modelCapabilities: {
      agentRuntime: true,
      disabledCapabilities: ['message', 'cancel', 'retry', 'usage'],
      maxDepthHint: 3,
      maxConcurrencyHint: 5,
    },
  })
  const snapshot = createAgentProviderCapabilitySnapshot(source)

  assert.equal(snapshot.providerCapabilities.operations.message, true)
  assert.deepEqual(snapshot.modelCapabilities.disabledCapabilities, ['message', 'cancel', 'retry', 'usage'])
  assert.equal(snapshot.runCapabilities.message, false)
  assert.equal(snapshot.runCapabilities.cancel, false)
  assert.equal(snapshot.runCapabilities.retry, false)
  assert.equal(snapshot.runCapabilities.usage, false)
  assert.equal(snapshot.nodeCapabilities.childMessaging, false)
  assert.equal(snapshot.nodeCapabilities.childCancellation, false)
  assert.equal(snapshot.nodeCapabilities.childRetry, false)
  assert.equal(snapshot.nodeCapabilities.perNodeUsage, false)
  assert.equal(snapshot.nodeCapabilities.maxDepthHint, 3)
  assert.equal(snapshot.nodeCapabilities.maxConcurrencyHint, 5)
  assert.ok(Object.isFrozen(snapshot))
  assert.ok(Object.isFrozen(snapshot.providerCapabilities.operations))

  source.providerCapabilities.operations.message = false
  source.providerCapabilities.node.maxDepthHint = 1
  assert.equal(snapshot.providerCapabilities.operations.message, true)
  assert.equal(snapshot.providerCapabilities.node.maxDepthHint, 8)
})

test('unavailable runtimes degrade to contract-only without losing the evidence snapshot', () => {
  const snapshot = createAgentProviderCapabilitySnapshot(snapshotInput({
    runtimeAvailability: {
      status: 'unavailable',
      reason: 'Account session is disconnected.',
    },
  }))

  assert.ok(Object.values(snapshot.runCapabilities).every((value) => value === false))
  assert.equal(snapshot.nodeCapabilities.mode, 'contract_only')
  assert.equal(snapshot.providerCapabilities.node.mode, 'managed_hierarchy')
  assert.equal(snapshot.runtimeAvailability.reason, 'Account session is disconnected.')
})

test('fixture evidence is represented without upgrading unproven provider behavior', () => {
  const openai = readManifest('openai-native-collaboration')
  const cursor = readManifest('cursor-root-session')
  const generic = readManifest('generic-provider-tool-stream')

  const partialNative = createAgentProviderCapabilitySnapshot(snapshotInput({
    providerId: 'openai-account',
    providerCapabilities: {
      operations: operationCapabilities(false),
      node: capabilities('partial_native_projection', {
        recursiveAgents: false,
        childStreams: openai.expectedCapabilities.nodeScopedStream,
        addressableChildren: openai.expectedCapabilities.addressableChildIdentity,
        childMessaging: false,
        childCancellation: openai.expectedCapabilities.nodeCancellation,
        childRetry: false,
        resumableChildren: false,
        perNodeUsage: false,
        approvalAttribution: false,
        workspaceIsolation: false,
        maxDepthHint: null,
        maxConcurrencyHint: null,
        visibilityReason: openai.knownGaps.join(' '),
      }),
      evidence: {
        sourceClass: openai.sourceClass,
        confidence: 'verified',
        provenance: openai.sourceReferences,
      },
    },
  }))
  assert.equal(partialNative.nodeCapabilities.addressableChildren, true)
  assert.equal(partialNative.nodeCapabilities.childStreams, false)
  assert.equal(partialNative.nodeCapabilities.childCancellation, false)

  for (const manifest of [cursor, generic]) {
    const contractOnly = createAgentProviderCapabilitySnapshot(snapshotInput({
      providerId: manifest.fixtureId,
      providerCapabilities: {
        operations: operationCapabilities(false),
        node: capabilities('contract_only', {
          visibilityReason: manifest.knownGaps.join(' '),
        }),
        evidence: {
          sourceClass: manifest.sourceClass,
          confidence: 'verified',
          provenance: manifest.sourceReferences,
        },
      },
    }))
    assert.equal(contractOnly.nodeCapabilities.mode, 'contract_only')
    assert.equal(contractOnly.nodeCapabilities.addressableChildren, false)
  }
})

test('opaque snapshots and nodes expose explanations but no unsupported actions or attribution', () => {
  const opaqueSnapshot = createAgentProviderCapabilitySnapshot(snapshotInput({
    providerCapabilities: {
      operations: {
        ...operationCapabilities(false),
        create: true,
        start: true,
        dispose: true,
      },
      node: capabilities('provider_opaque'),
      evidence: {
        sourceClass: 'provider_observation',
        confidence: 'declared',
        provenance: ['provider:activity-list'],
      },
    },
  }))

  for (const field of ['message', 'interrupt', 'cancel', 'retry', 'usage', 'artifacts']) {
    assert.equal(opaqueSnapshot.runCapabilities[field], false)
  }

  const node = createProviderOpaqueNode({
    id: 'agent_opaque_01',
    runId: 'run_01',
    parentNodeId: 'agent_root',
    rootNodeId: 'agent_root',
    providerId: 'provider-test',
    modelId: 'model-test',
    providerActivityId: 'activity_01',
    providerThreadId: 'thread_external_01',
    roleId: 'provider_activity',
    roleLabel: 'Provider activity',
    taskId: 'task_opaque_01',
    taskSummary: 'Provider-managed work',
    depth: 1,
    branchPath: ['agent_root', 'agent_opaque_01'],
    status: 'running',
    capabilitySnapshot: opaqueSnapshot,
    createdAt: TS,
    startedAt: TS,
    provenance: {
      source: 'provider_activity',
      providerEventId: 'event_external_01',
      confidence: 'provider_asserted',
    },
    transcriptEvidence: 'status_only',
  })

  assert.doesNotThrow(() => validateAgentNode(node))
  assert.equal(node.capabilitySnapshot.mode, 'provider_opaque')
  assert.equal(node.workspaceMode, 'opaque_no_write_surface')
  assert.equal(node.providerAgentId, null)
  assert.equal(node.providerActivityId, 'activity_01')
  assert.equal(node.usageConfidence, 'unknown')
  assert.deepEqual(node.controls, {
    message: false,
    interrupt: false,
    cancel: false,
    retry: false,
    usage: false,
    artifacts: false,
  })
  assert.match(node.omissionReason, /without addressable child controls/i)
})

test('run, node, and attempt persistence validators retain immutable route snapshots', () => {
  const providerSnapshot = createAgentProviderCapabilitySnapshot(snapshotInput())
  const run = validateAgentRun({
    schemaVersion: 1,
    id: 'run_01',
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    rootNodeId: 'agent_root',
    status: 'running',
    policyProfileId: 'high',
    createdAt: TS,
    startedAt: TS,
    finishedAt: null,
    providerMix: ['provider-test'],
    providerCapabilitySnapshots: [providerSnapshot],
    activeNodeCount: 1,
    queuedNodeCount: 0,
    terminalNodeCount: 0,
    exclusiveUsage: null,
    inclusiveUsage: null,
    budgetSnapshot: {},
    finalAuthorityNodeId: 'agent_root',
    completionReason: null,
    reconciliationStatus: 'matched',
  })

  assert.deepEqual(
    validateAgentProviderCapabilitySnapshot(run.providerCapabilitySnapshots[0]),
    providerSnapshot,
  )
  assert.ok(Object.isFrozen(run.providerCapabilitySnapshots[0]))

  const attempt = validateAgentAttempt({
    schemaVersion: 1,
    id: 'attempt_01',
    runId: 'run_01',
    nodeId: 'agent_root',
    attemptNumber: 1,
    parentAttemptId: null,
    providerRequestId: null,
    providerCorrelationKey: 'provider-test:request_01',
    reconciliationState: 'pending_match',
    status: 'running',
    capabilitySnapshot: providerSnapshot.nodeCapabilities,
    providerCapabilitySnapshot: providerSnapshot,
    permissionSnapshot: { level: 'read_only', toolClasses: ['read'] },
    workspaceId: 'workspace_01',
    workspaceMode: 'local_shared_read',
    background: false,
    backgroundKind: 'foreground',
    startedAt: TS,
    finishedAt: null,
    stopReason: null,
    errorCode: null,
    usage: null,
    recoveryOfAttemptId: null,
  })
  assert.deepEqual(attempt.providerCapabilitySnapshot, providerSnapshot)
  assert.ok(Object.isFrozen(attempt.providerCapabilitySnapshot))
})
