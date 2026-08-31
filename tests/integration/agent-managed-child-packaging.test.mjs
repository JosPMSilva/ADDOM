import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  createManagedChildContracts,
  rebuildManagedContextPacketFromTask,
  assertInjectedContextEvidenceIntegrity,
} from '../../src/main/agents/agent-managed-child-contracts.mjs'
import { createAgentContextPacket } from '../../src/main/agents/agent-context-packet.mjs'
import { makeAgentCapabilities, makeAgentPermission } from '../helpers/agent-runtime-fixtures.mjs'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function makeGraph() {
  return {
    run: {
      id: 'run_01',
      projectId: 'project_01',
      rootNodeId: 'agent_root',
      budgetSnapshot: {
        maxDurationMs: 60_000,
        maxTotalTokens: 100_000,
        maxCostUsd: 10,
        maxToolCalls: 64,
      },
    },
    attempts: [{ id: 'attempt_parent' }],
  }
}

function makeParent() {
  return {
    id: 'agent_parent',
    depth: 0,
    branchPath: ['agent_root', 'agent_parent'],
    permissionSnapshot: makeAgentPermission('read_write'),
  }
}

function makeSnapshot() {
  return {
    providerId: 'openai',
    modelId: 'gpt-5.4',
    nodeCapabilities: makeAgentCapabilities(),
  }
}

function idFactory(prefix) {
  let n = 0
  return (kind = prefix) => `${kind}_${++n}`
}

test('multiline injected_context packs with Cc-safe label and optional digests', () => {
  const injected = 'File: subagent-test.txt\n\nhello world\nsecond line'
  const contracts = createManagedChildContracts({
    graph: makeGraph(),
    parent: makeParent(),
    owner: { attemptId: 'attempt_parent' },
    task: {
      task_id: 'task_01',
      instruction: 'Check the file\nand report',
      injected_context: injected,
    },
    role: { id: 'reviewer', name: 'Reviewer', canWriteFiles: false },
    snapshot: makeSnapshot(),
    background: false,
    adapterId: 'addom-managed',
    createdAt: 1_752_600_000_000,
    idFactory: idFactory('id'),
  })

  assert.equal(contracts.contextPacket.selectedEvidence.length, 1)
  const evidence = contracts.contextPacket.selectedEvidence[0]
  assert.equal(evidence.summary.includes('\n'), false)
  assert.doesNotMatch(evidence.summary, /\p{Cc}/u)
  assert.equal(evidence.contentKind, 'injected_context')
  assert.equal(
    evidence.contentDigest,
    createHash('sha256').update(Buffer.from(injected, 'utf8')).digest('hex'),
  )
  assert.equal(evidence.contentBytes, Buffer.byteLength(injected, 'utf8'))
  assert.equal(contracts.node.taskSummary.includes('\n'), false)
  assert.doesNotMatch(contracts.node.taskSummary, /\p{Cc}/u)
  const packetJson = JSON.stringify(contracts.contextPacket)
  assert.equal(packetJson.includes(injected), false)
  assert.equal(packetJson.includes('hello world'), false)
  assert.doesNotThrow(() => assertInjectedContextEvidenceIntegrity(
    contracts.contextPacket,
    { injected_context: injected },
  ))
})

test('context packets without digests still validate', () => {
  const packet = createAgentContextPacket({
    packetId: 'context_packet_01',
    fromNodeId: 'agent_parent',
    toNodeId: 'agent_child',
    relation: 'parent_child',
    selectedEvidence: [{
      evidenceId: 'evidence_01',
      sourceNodeId: 'agent_parent',
      summary: 'Legacy one-line evidence',
      visibility: 'private',
    }],
    ancestry: ['agent_root', 'agent_parent', 'agent_child'],
    provenance: [{ source: 'agent_message', sourceId: 'message_01' }],
    effectiveCapabilityHash: HASH_A,
    effectivePermissionHash: HASH_B,
    workspaceLease: {
      leaseId: 'workspace_lease_01',
      workspaceId: 'workspace_01',
      workspaceMode: 'local_overlay',
      baseRevision: 'sha256:base-a',
      expiresAt: 1_752_600_100_000,
    },
    budgetLease: {
      leaseId: 'budget_lease_01',
      tokenLimit: 10_000,
      costLimitUsd: 1,
      toolCallLimit: 20,
      expiresAt: 1_752_600_100_000,
    },
    providerRoute: {
      adapterId: 'addom-managed',
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-5',
    },
    toolDescriptors: [{ name: 'read_file', toolClass: 'read' }],
    serviceDescriptors: [],
    createdAt: 1_752_600_000_000,
  })
  assert.equal(packet.selectedEvidence[0].contentDigest, undefined)
  assert.equal(packet.selectedEvidence[0].summary, 'Legacy one-line evidence')
})

test('integrity check fails closed only when digest is present and mismatched', () => {
  const injected = 'line one\nline two'
  const contracts = createManagedChildContracts({
    graph: makeGraph(),
    parent: makeParent(),
    owner: { attemptId: 'attempt_parent' },
    task: { task_id: 'task_01', instruction: 'Do work', injected_context: injected },
    role: { id: 'reviewer', name: 'Reviewer', canWriteFiles: false },
    snapshot: makeSnapshot(),
    background: false,
    adapterId: 'addom-managed',
    createdAt: 1_752_600_000_000,
    idFactory: idFactory('id'),
  })
  assert.throws(
    () => assertInjectedContextEvidenceIntegrity(
      contracts.contextPacket,
      { injected_context: 'different body' },
    ),
    /digest/i,
  )
  assert.doesNotThrow(() => assertInjectedContextEvidenceIntegrity(
    {
      selectedEvidence: [{
        evidenceId: 'evidence_01',
        sourceNodeId: 'agent_parent',
        summary: 'No digest row',
        visibility: 'private',
      }],
    },
    { injected_context: 'anything\nwith newlines' },
  ))
})

test('retry rebuild refreshes evidence from live task instead of keeping summary blob', () => {
  const first = createManagedChildContracts({
    graph: makeGraph(),
    parent: makeParent(),
    owner: { attemptId: 'attempt_parent' },
    task: {
      task_id: 'task_01',
      instruction: 'First',
      injected_context: 'old context\nblob',
    },
    role: { id: 'reviewer', name: 'Reviewer', canWriteFiles: false },
    snapshot: makeSnapshot(),
    background: false,
    adapterId: 'addom-managed',
    createdAt: 1_752_600_000_000,
    idFactory: idFactory('first'),
  })
  const nextBody = 'new context\nwith more lines'
  const rebuilt = rebuildManagedContextPacketFromTask({
    priorPacket: first.contextPacket,
    task: { injected_context: nextBody },
    packetId: 'context_retry_01',
    workspaceLease: {
      ...first.contextPacket.workspaceLease,
      leaseId: 'workspace_lease_retry',
      baseRevision: 'sha256:retry',
    },
    createdAt: 1_752_600_200_000,
    idFactory: idFactory('retry'),
  })
  const evidence = rebuilt.selectedEvidence[0]
  assert.equal(
    evidence.contentDigest,
    createHash('sha256').update(Buffer.from(nextBody, 'utf8')).digest('hex'),
  )
  assert.notEqual(evidence.summary, first.contextPacket.selectedEvidence[0].summary)
  assert.equal(evidence.summary.includes('\n'), false)
})
