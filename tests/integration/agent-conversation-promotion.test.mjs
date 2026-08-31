import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'

import {
  createAgentConversationPromotionService,
  sanitizeAgentPromotionSnapshot,
} from '../../src/main/agents/agent-conversation-promotion-service.mjs'
import { createPromotedProjectThread } from '../../src/main/workspace/workspace-promotion-service.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import { seedAgentWorkspace } from '../helpers/agent-runtime-fixtures.mjs'
import { listWorkspaceThreadsFromDb } from '../../src/main/workspace/workspace-thread-activity.mjs'

const NOW = 1_754_000_000_000

function message(overrides = {}) {
  return {
    id: 'message_01', conversationId: 'conversation_01', turnId: 'turn_01', sequence: 1,
    kind: 'final', authorKind: 'agent', authorId: 'agent_01', sourceConversationId: null,
    sourceTurnId: null, idempotencyKey: 'message_01', createdAt: NOW,
    contentParts: [
      { kind: 'markdown', text: 'Use the safe result.' },
      { kind: 'file', id: 'artifact_01', label: 'report.md' },
    ],
    ...overrides,
  }
}

function projection(overrides = {}) {
  return {
    conversation: {
      id: 'conversation_01', projectId: 'project_01', rootThreadId: 'thread_source', roleId: 'reviewer',
      providerRoute: { providerId: 'provider-a', modelId: 'model-a' },
    },
    turns: [
      { id: 'turn_01', sequence: 1, status: 'completed', finishedAt: NOW, finalMessageId: 'message_01' },
      { id: 'turn_02', sequence: 2, status: 'running', finishedAt: null, finalMessageId: null },
    ],
    messages: [message()],
    ...overrides,
  }
}

test('promotion sanitizer captures only canonical text, safe artifacts, registered tool summaries, and reset authority', () => {
  const snapshot = sanitizeAgentPromotionSnapshot({
    id: 'promotion_01', idempotencyKey: 'conversation_01:turn_01:promotion', createdAt: NOW,
    sourceRoleLabel: 'Architecture Reviewer',
    sourceRoute: {
      projectId: 'project_01', threadId: 'thread_source', runId: 'run_01', nodeId: 'node_01',
    },
    projection: projection(),
    artifacts: [
      { id: 'artifact_01', kind: 'report', path: 'report.md', status: 'staged', digest: 'abc', sizeBytes: 5, providerArtifactId: 'secret' },
      { id: 'artifact_unsafe', kind: 'arbitrary_payload', path: 'unsafe.bin', status: 'staged' },
    ],
    transcript: [
      { turnId: 'turn_01', kind: 'agent_tool_started', toolCallId: 'call_01', toolName: 'read_file', content: 'report.md' },
      { turnId: 'turn_01', kind: 'agent_tool_completed', toolCallId: 'call_01', content: 'safe summary', status: 'completed' },
      { turnId: 'turn_02', kind: 'agent_tool_completed', toolCallId: 'call_future', toolName: 'shell', content: 'must not cross the snapshot boundary' },
    ],
  })

  assert.equal(snapshot.sourceTurnId, 'turn_01')
  assert.equal(snapshot.sourceRoleLabel, 'Architecture Reviewer')
  assert.deepEqual(snapshot.sourceRoute, {
    projectId: 'project_01', threadId: 'thread_source', runId: 'run_01', nodeId: 'node_01',
  })
  assert.equal(snapshot.content.messages[0].contentParts[0].text, 'Use the safe result.')
  assert.deepEqual(snapshot.content.artifacts, [{ id: 'artifact_01', kind: 'report', label: 'report.md', digest: 'abc', sizeBytes: 5, status: 'unmerged' }])
  assert.deepEqual(snapshot.content.toolResults, [{ toolName: 'read_file', summary: 'safe summary' }])
  assert.deepEqual(snapshot.authority, {
    permissions: 'reset', approvals: 'reset', providerContinuation: 'reset', workspace: 'reset', stagedWrites: 'reset', merge: 'reset',
  })
  assert.throws(() => { snapshot.content.messages.push(message()) }, /read only|extensible|frozen/i)
})

test('promotion snapshots preserve the canonical conversation through the selected completed turn', () => {
  const snapshot = sanitizeAgentPromotionSnapshot({
    id: 'promotion_02', idempotencyKey: 'conversation_01:turn_02:promotion', createdAt: NOW,
    sourceRoute: {
      projectId: 'project_01', threadId: 'thread_source', runId: 'run_02', nodeId: 'node_02',
    },
    projection: projection({
      turns: [
        { id: 'turn_01', sequence: 1, status: 'completed', finishedAt: NOW - 10, finalMessageId: 'message_01' },
        { id: 'turn_02', sequence: 2, status: 'completed', finishedAt: NOW, finalMessageId: 'message_03' },
        { id: 'turn_03', sequence: 3, status: 'running', finishedAt: null, finalMessageId: null },
      ],
      messages: [
        message({ id: 'message_01', turnId: 'turn_01', sequence: 1, kind: 'authored', authorKind: 'orchestrator' }),
        message({ id: 'message_02', turnId: 'turn_01', sequence: 2, kind: 'final', contentParts: [{ kind: 'link', label: 'Unsafe', href: 'javascript:alert(1)' }, { kind: 'markdown', text: 'First answer.' }] }),
        message({ id: 'message_03', turnId: 'turn_02', sequence: 3, kind: 'authored', authorKind: 'user', contentParts: [{ kind: 'markdown', text: 'Follow up.' }] }),
        message({ id: 'message_04', turnId: 'turn_02', sequence: 4, kind: 'final', contentParts: [{ kind: 'markdown', text: 'Second answer.' }] }),
        message({ id: 'message_05', turnId: 'turn_03', sequence: 5, kind: 'authored', contentParts: [{ kind: 'markdown', text: 'Moving target.' }] }),
      ],
    }),
  })

  assert.equal(snapshot.sourceTurnId, 'turn_02')
  assert.deepEqual(snapshot.content.messages.map((entry) => [entry.id, entry.turnId]), [
    ['message_01', 'turn_01'], ['message_02', 'turn_01'], ['message_03', 'turn_02'], ['message_04', 'turn_02'],
  ])
  assert.deepEqual(snapshot.content.messages[1].contentParts, [{ kind: 'markdown', text: 'First answer.' }])
})

test('promotion service uses latest completed turn, survives interrupted creation, and recovers duplicate clicks', async () => {
  const calls = []
  const snapshots = new Map()
  const service = createAgentConversationPromotionService({
    conversationRepository: {
      getConversationProjection: () => projection(),
      createPromotionSnapshot(value) {
        const existing = snapshots.get(value.idempotencyKey)
        if (existing) return { inserted: false, item: existing }
        snapshots.set(value.idempotencyKey, value)
        return { inserted: true, item: value }
      },
    },
    getArtifacts: () => [{ id: 'artifact_01', kind: 'file', path: 'report.md', status: 'staged', digest: 'abc', sizeBytes: 5 }],
    getTranscript: () => [{ kind: 'tool_result', toolName: 'read_file', content: 'summary' }],
    createProjectThreadFromPromotion: async ({ snapshot }) => {
      calls.push(snapshot)
      if (calls.length === 1) throw new Error('interrupted')
      return { project: { id: 'project_01' }, thread: { id: 'thread_promoted' }, recovered: calls.length > 2 }
    },
    idFactory: () => 'promotion_01', now: () => NOW,
  })

  await assert.rejects(service.promote({ conversationId: 'conversation_01' }), /interrupted/)
  const recovered = await service.promote({ conversationId: 'conversation_01' })
  const duplicate = await service.promote({ conversationId: 'conversation_01' })
  assert.equal(calls.length, 3)
  assert.equal(recovered.thread.id, 'thread_promoted')
  assert.equal(duplicate.thread.id, 'thread_promoted')
  assert.equal(calls[0].sourceTurnId, 'turn_01')
})

test('promoted project threads import canonical dialogue once without fabricating assistant or tool events', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  try {
    runMigrations(db)
    seedAgentWorkspace(db)
    const snapshot = sanitizeAgentPromotionSnapshot({
      id: 'promotion_thread_01', idempotencyKey: 'conversation_01:turn_02:promotion', createdAt: NOW,
      sourceRoleLabel: 'Architecture Reviewer',
      sourceRoute: {
        projectId: 'project_01', threadId: 'thread_01', runId: 'run_02', nodeId: 'node_02',
      },
      projection: projection({
        turns: [
          { id: 'turn_01', sequence: 1, status: 'completed', finishedAt: NOW - 10, finalMessageId: 'message_02' },
          { id: 'turn_02', sequence: 2, status: 'completed', finishedAt: NOW, finalMessageId: 'message_04' },
        ],
        messages: [
          message({ id: 'message_01', turnId: 'turn_01', sequence: 1, kind: 'authored', authorKind: 'orchestrator', contentParts: [{ kind: 'markdown', text: 'Review this.' }] }),
          message({ id: 'message_02', turnId: 'turn_01', sequence: 2, kind: 'final', contentParts: [{ kind: 'markdown', text: 'First result.' }] }),
          message({ id: 'message_03', turnId: 'turn_02', sequence: 3, kind: 'authored', authorKind: 'user', contentParts: [{ kind: 'markdown', text: 'Check one detail.' }] }),
          message({ id: 'message_04', turnId: 'turn_02', sequence: 4, kind: 'final', contentParts: [{ kind: 'markdown', text: 'Final result.' }] }),
          message({ id: 'message_system', turnId: 'turn_02', sequence: 5, kind: 'system', authorKind: 'system', contentParts: [{ kind: 'markdown', text: 'Internal lifecycle note.' }] }),
        ],
      }),
      transcript: [{ turnId: 'turn_02', kind: 'tool_result', toolName: 'read_file', content: 'Read one file.' }],
      artifacts: [{ id: 'artifact_01', kind: 'report', path: 'review.md', digest: 'abc', sizeBytes: 12 }],
    })
    const options = {
      db, projectId: 'project_01', snapshot, title: 'Promoted review',
      now: () => NOW + 100, idFactory: () => 'thread_promoted',
    }
    db.prepare(`
      INSERT INTO agent_promotion_snapshots (
        id, source_conversation_id, source_turn_id, source_sequence,
        idempotency_key, contract_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.id, snapshot.sourceConversationId, snapshot.sourceTurnId, snapshot.sourceSequence,
      snapshot.idempotencyKey, JSON.stringify(snapshot), snapshot.createdAt,
    )
    const created = createPromotedProjectThread(options)
    const duplicate = createPromotedProjectThread(options)
    const events = db.prepare(`SELECT kind, role, content, meta_json FROM chat_events WHERE thread_id = ? ORDER BY event_id`).all(created.thread.id)

    assert.equal(created.recovered, false)
    assert.equal(duplicate.recovered, true)
    assert.equal(duplicate.thread.id, created.thread.id)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chat_threads WHERE id = ?').get(created.thread.id).count, 1)
    assert.deepEqual(events.map((entry) => [entry.kind, entry.role, entry.content]), [
      ['user_message', 'user', 'Review this.'],
      ['assistant_message', 'assistant', 'First result.'],
      ['user_message', 'user', 'Check one detail.'],
      ['assistant_message', 'assistant', 'Final result.'],
    ])
    assert.equal(events.some((entry) => entry.content.startsWith('Continued from agent:')), false)
    assert.equal(events.some((entry) => entry.kind === 'tool_result'), false)
    assert.equal(events.every((entry) => JSON.parse(entry.meta_json).importedReadOnly === true), true)
    const importedFinal = JSON.parse(events.at(-1).meta_json)
    assert.equal(importedFinal.assistantMessageId, 'message_04')
    assert.equal(importedFinal.finalDocument.parts[0].text, 'Final result.')
    assert.deepEqual(created.thread.origin, {
      kind: 'agent_promotion', snapshotId: 'promotion_thread_01', sourceConversationId: 'conversation_01',
      sourceTurnId: 'turn_02', sourceSequence: 2, sourceRoleId: 'reviewer', sourceRoleLabel: 'Architecture Reviewer',
      sourceRoute: { projectId: 'project_01', threadId: 'thread_01', runId: 'run_02', nodeId: 'node_02' },
      providerProvenance: { providerId: 'provider-a', modelId: 'model-a' },
      artifactCount: 1, toolResultCount: 1, sourceAvailable: false,
    })
    assert.deepEqual(listWorkspaceThreadsFromDb(db, 'project_01').find((thread) => thread.id === created.thread.id).origin, created.thread.origin)
  } finally {
    db.close()
  }
})
