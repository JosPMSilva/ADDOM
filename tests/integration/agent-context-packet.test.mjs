import assert from 'node:assert/strict'
import test from 'node:test'

import Database from 'better-sqlite3'

import {
  createAgentContextPacket,
  validateAgentContextPacket,
} from '../../src/main/agents/agent-context-packet.mjs'
import { createAgentContextService } from '../../src/main/agents/agent-context-service.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  AGENT_TEST_TIMESTAMP,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentRun,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'

const BASE = {
  packetId: 'context_packet_01',
  fromNodeId: 'agent_parent',
  toNodeId: 'agent_child',
  relation: 'parent_child',
  selectedEvidence: [
    {
      evidenceId: 'evidence_01',
      sourceNodeId: 'agent_parent',
      summary: 'The API contract requires stable opaque identifiers.',
      visibility: 'private',
    },
  ],
  ancestry: ['agent_root', 'agent_parent', 'agent_child'],
  provenance: [{ source: 'agent_message', sourceId: 'message_01' }],
  effectiveCapabilityHash: 'a'.repeat(64),
  effectivePermissionHash: 'b'.repeat(64),
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
  serviceDescriptors: [{ name: 'memory', capability: 'read_selected' }],
  createdAt: 1_752_600_000_000,
}

test('context packets are immutable, bounded, provider-neutral, and contain only selected evidence', () => {
  const packet = createAgentContextPacket(BASE)

  assert.deepEqual(validateAgentContextPacket(packet), packet)
  assert.equal(Object.isFrozen(packet), true)
  assert.equal(Object.isFrozen(packet.selectedEvidence), true)
  assert.equal(JSON.stringify(packet).includes('fullTranscript'), false)
  assert.throws(
    () => createAgentContextPacket({ ...BASE, environment: { TOKEN: 'secret' } }),
    /environment|prohibited/i,
  )
  assert.throws(
    () => createAgentContextPacket({
      ...BASE,
      selectedEvidence: Array.from({ length: 33 }, (_, index) => ({
        evidenceId: `evidence_${index}`,
        sourceNodeId: 'agent_parent',
        summary: `Evidence ${index}`,
        visibility: 'selected',
      })),
    }),
    /selected evidence/i,
  )
})

test('sibling packets cannot carry private context while explicit selected evidence remains shareable', () => {
  assert.throws(
    () => createAgentContextPacket({
      ...BASE,
      relation: 'sibling',
      fromNodeId: 'agent_child_a',
      toNodeId: 'agent_child_b',
    }),
    /private.*sibling/i,
  )
  const shared = createAgentContextPacket({
    ...BASE,
    relation: 'sibling',
    fromNodeId: 'agent_child_a',
    toNodeId: 'agent_child_b',
    selectedEvidence: BASE.selectedEvidence.map((entry) => ({
      ...entry,
      visibility: 'selected',
    })),
  })
  assert.equal(shared.relation, 'sibling')
  assert.equal(shared.selectedEvidence[0].visibility, 'selected')
})

test('optional evidence digests round-trip and reject bad hex; unknown keys stay out of packetHash', () => {
  const withDigest = createAgentContextPacket({
    ...BASE,
    selectedEvidence: [{
      evidenceId: 'evidence_01',
      sourceNodeId: 'agent_parent',
      summary: 'One-line label',
      visibility: 'private',
      contentKind: 'injected_context',
      contentDigest: 'c'.repeat(64),
      contentBytes: 42,
      unexpectedField: 'drop-me',
    }],
  })
  assert.equal(withDigest.selectedEvidence[0].contentDigest, 'c'.repeat(64))
  assert.equal(withDigest.selectedEvidence[0].contentBytes, 42)
  assert.equal(withDigest.selectedEvidence[0].contentKind, 'injected_context')
  assert.equal(withDigest.selectedEvidence[0].unexpectedField, undefined)

  const withoutDigest = createAgentContextPacket(BASE)
  assert.equal(withoutDigest.selectedEvidence[0].contentDigest, undefined)
  assert.doesNotThrow(() => validateAgentContextPacket(withoutDigest))

  assert.throws(
    () => createAgentContextPacket({
      ...BASE,
      selectedEvidence: [{
        evidenceId: 'evidence_01',
        sourceNodeId: 'agent_parent',
        summary: 'One-line label',
        visibility: 'private',
        contentDigest: 'not-a-hash',
      }],
    }),
    /contentDigest|sha256/i,
  )
})

test('context delivery is persisted as an auditable sent and received pair', () => {
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    seedAgentWorkspace(db)
    const eventStore = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    const root = makeAgentNode({ status: 'running', attemptId: null })
    const child = makeAgentNode({
      id: 'agent_child',
      status: 'queued',
      attemptId: null,
    })
    eventStore.append(makeAgentEventDraft('agent_run_created', {
      policyProfileId: 'high',
      run: makeAgentRun({ status: 'running', startedAt: AGENT_TEST_TIMESTAMP }),
      rootNode: root,
    }, { attemptId: null }))
    eventStore.append(makeAgentEventDraft('agent_spawned', {
      spawnRequestId: 'spawn_agent_child',
      childNodeId: child.id,
      node: child,
    }, {
      nodeId: child.id,
      attemptId: null,
      eventId: 'event_context_child_spawned',
      idempotencyKey: 'run_01:context-child:spawned',
    }))

    const service = createAgentContextService({
      eventStore,
      repository,
      now: () => AGENT_TEST_TIMESTAMP + 10,
    })
    const packet = service.deliver({
      runId: 'run_01',
      packet: createAgentContextPacket({
        ...BASE,
        packetId: 'context_packet_delivery',
        fromNodeId: root.id,
        toNodeId: child.id,
        ancestry: [root.id, child.id],
        selectedEvidence: [{
          evidenceId: 'evidence_delivery',
          sourceNodeId: root.id,
          summary: 'Only this selected contract fact is delegated.',
          visibility: 'private',
        }],
      }),
    })

    assert.equal(packet.packetId, 'context_packet_delivery')
    const graph = createAgentRunRepository(db).getRunGraph('run_01')
    const contextSegments = graph.transcript.filter((segment) => (
      segment.payload.packetId === packet.packetId
    ))
    assert.deepEqual(contextSegments.map((segment) => segment.kind), [
      'agent_context_sent',
      'agent_context_received',
    ])
    assert.deepEqual(contextSegments[0].payload.packet, packet)
    assert.equal(contextSegments[1].payload.packetHash, packet.packetHash)
  } finally {
    db.close()
  }
})
