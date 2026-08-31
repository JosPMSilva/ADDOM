import assert from 'node:assert/strict'
import test from 'node:test'

import Database from 'better-sqlite3'

import { ensureCoreTables, ensureNodeColumns } from '../../src/main/memory/db-schema-core.mjs'
import {
  ensureCanonicalChatEventColumns,
  ensureWorkspaceTables,
} from '../../src/main/memory/db-schema-workspace.mjs'
import { runMigrations, SCHEMA_VERSION } from '../../src/main/memory/db-migrations.mjs'
import { createRootEventRepository } from '../../src/main/workspace/root-event-repository.mjs'
import {
  MAX_EVENTS_PER_THREAD,
  pruneThreadEventsInternal,
} from '../../src/main/workspace/workspace-store-utils.mjs'

const BASE_TIME = 1_754_100_000_000

function database() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  db.prepare(`
    INSERT INTO workspace_projects (
      id, path, name, created_at, last_opened_at, last_worked_at,
      last_provider, last_model, active_thread_id
    ) VALUES (?, ?, ?, ?, ?, ?, '', '', ?)
  `).run('project_01', 'C:/workspace/project-01', 'Project 01', BASE_TIME, BASE_TIME, BASE_TIME, 'thread_01')
  db.prepare(`
    INSERT INTO chat_threads (
      id, project_id, title, created_at, updated_at, last_viewed_at, archived
    ) VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run('thread_01', 'project_01', 'Thread 01', BASE_TIME, BASE_TIME, BASE_TIME)
  return db
}

function draft(overrides = {}) {
  return {
    canonicalEventId: 'root_event_01',
    projectId: 'project_01',
    conversationId: 'thread_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    occurredAt: BASE_TIME + 10,
    source: {
      providerId: 'openai',
      transport: 'http',
      runtime: 'responses',
      providerEventId: 'provider_event_01',
      providerCorrelationKey: 'openai:response_01',
    },
    actor: { kind: 'root', id: 'root', conversationId: 'thread_01', runId: '' },
    semanticKind: 'commentary_delta',
    phase: 'commentary',
    lifecycle: 'completed',
    payload: { text: 'Same visible text.' },
    supportDecision: 'supported',
    ...overrides,
  }
}

test('root event repository assigns per-turn sequences and deduplicates only stable delivery identities', () => {
  const db = database()
  try {
    let clock = BASE_TIME + 100
    const repository = createRootEventRepository(db, {
      idFactory: () => 'generated_event_id',
      now: () => clock++,
    })

    const first = repository.append(draft())
    const second = repository.append(draft({
      canonicalEventId: 'root_event_02',
      source: {
        ...draft().source,
        providerEventId: 'provider_event_02',
      },
    }))
    const duplicateById = repository.append(draft())
    const duplicateByProvider = repository.append(draft({
      canonicalEventId: 'root_event_03',
    }))

    assert.equal(first.inserted, true)
    assert.equal(second.inserted, true)
    assert.equal(first.event.canonical.localSequence, 1)
    assert.equal(second.event.canonical.localSequence, 2)
    assert.notEqual(first.event.eventId, second.event.eventId)
    assert.equal(duplicateById.inserted, false)
    assert.equal(duplicateById.deduplicatedBy, 'canonical_event_id')
    assert.equal(duplicateByProvider.inserted, false)
    assert.equal(duplicateByProvider.deduplicatedBy, 'provider_event')

    const reopenedRepository = createRootEventRepository(db, { now: () => clock++ })
    const afterReload = reopenedRepository.append(draft({
      canonicalEventId: 'root_event_04',
      source: { ...draft().source, providerEventId: 'provider_event_04' },
    }))
    const otherTurn = reopenedRepository.append(draft({
      canonicalEventId: 'root_event_05',
      turnId: 'turn_02',
      source: { ...draft().source, providerEventId: 'provider_event_05' },
    }))
    assert.equal(afterReload.event.canonical.localSequence, 3)
    assert.equal(otherTurn.event.canonical.localSequence, 1)
    const orderedPayload = reopenedRepository.append(draft({
      canonicalEventId: 'root_event_06',
      payload: { details: { alpha: 1, beta: 2 } },
      source: { ...draft().source, providerEventId: 'provider_event_06' },
    }))
    const reorderedRetry = reopenedRepository.append(draft({
      canonicalEventId: 'root_event_06',
      payload: { details: { beta: 2, alpha: 1 } },
      source: { ...draft().source, providerEventId: 'provider_event_06' },
    }))
    assert.equal(orderedPayload.inserted, true)
    assert.equal(reorderedRetry.inserted, false)
    assert.equal(reorderedRetry.deduplicatedBy, 'canonical_event_id')
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chat_events').get().count, 5)
  } finally {
    db.close()
  }
})

test('root event repository advances progressive events in place without changing row or sequence identity', () => {
  const db = database()
  try {
    let clock = BASE_TIME + 100
    const repository = createRootEventRepository(db, { now: () => clock++ })
    const started = repository.append(draft({
      lifecycle: 'active',
      progressiveKey: 'tool:call_01',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'running' },
    }))
    const completed = repository.append(draft({
      lifecycle: 'succeeded',
      progressiveKey: 'tool:call_01',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'succeeded', output: 'done' },
    }))

    assert.equal(completed.inserted, false)
    assert.equal(completed.advanced, true)
    assert.equal(completed.deduplicatedBy, null)
    assert.equal(completed.event.eventId, started.event.eventId)
    assert.equal(completed.event.canonical.canonicalEventId, 'root_event_01')
    assert.equal(completed.event.canonical.localSequence, 1)
    assert.equal(completed.event.canonical.lifecycle, 'succeeded')
    assert.deepEqual(completed.event.canonical.payload, { state: 'succeeded', output: 'done' })
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chat_events').get().count, 1)

    assert.throws(() => repository.append(draft({
      canonicalEventId: 'root_event_late',
      lifecycle: 'active',
      progressiveKey: 'tool:call_01',
      semanticKind: 'tool_state',
      phase: 'tool',
      source: { ...draft().source, providerEventId: 'provider_event_late' },
    })), /terminal progressive event/i)
  } finally {
    db.close()
  }
})

test('root event repository rejects conflicting stable identities instead of silently dropping the new event', () => {
  const db = database()
  try {
    const repository = createRootEventRepository(db, { now: () => BASE_TIME + 100 })
    repository.append(draft())

    assert.throws(() => repository.append(draft({
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'running' },
    })), /identity collision/i)

    assert.throws(() => repository.append(draft({
      canonicalEventId: 'root_event_provider_collision',
      payload: { text: 'Conflicting provider delivery.' },
    })), /identity collision/i)
  } finally {
    db.close()
  }
})

test('root event repository rejects stable progressive identities reused across turns', () => {
  const db = database()
  try {
    const repository = createRootEventRepository(db, { now: () => BASE_TIME + 100 })
    repository.append(draft({
      lifecycle: 'active',
      progressiveKey: 'tool:call_01',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'running' },
    }))

    assert.throws(() => repository.append(draft({
      turnId: 'turn_02',
      lifecycle: 'succeeded',
      progressiveKey: 'tool:call_01',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'succeeded' },
    })), /identity collision/i)

    repository.append(draft({
      canonicalEventId: 'root_event_provider_base',
      lifecycle: 'active',
      progressiveKey: 'tool:call_02',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'running' },
      source: {
        ...draft().source,
        providerEventId: 'provider_event_02',
        providerCorrelationKey: 'openai:response_02',
      },
    }))

    assert.throws(() => repository.append(draft({
      canonicalEventId: 'root_event_provider_cross_turn',
      turnId: 'turn_02',
      lifecycle: 'succeeded',
      progressiveKey: 'tool:call_02',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'succeeded' },
      source: {
        ...draft().source,
        providerEventId: 'provider_event_02',
        providerCorrelationKey: 'openai:response_02',
      },
    })), /identity collision/i)

    assert.deepEqual(db.prepare(`
      SELECT canonical_event_id, turn_id, lifecycle
      FROM chat_events
      ORDER BY event_id ASC
    `).all(), [
      { canonical_event_id: 'root_event_01', turn_id: 'turn_01', lifecycle: 'active' },
      { canonical_event_id: 'root_event_provider_base', turn_id: 'turn_01', lifecycle: 'active' },
    ])
  } finally {
    db.close()
  }
})

test('root event repository rejects lifecycle regression and clamps progressive update timestamps', () => {
  const db = database()
  try {
    const clock = [BASE_TIME + 200, BASE_TIME + 100, BASE_TIME + 250, BASE_TIME + 300]
    const repository = createRootEventRepository(db, { now: () => clock.shift() })
    const started = repository.append(draft({
      lifecycle: 'active',
      progressiveKey: 'tool:call_01',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'running' },
    }))
    db.prepare('UPDATE chat_threads SET updated_at = ? WHERE id = ?')
      .run(BASE_TIME + 500, 'thread_01')
    db.prepare(`
      UPDATE workspace_projects
      SET last_worked_at = ?, last_opened_at = ?
      WHERE id = ?
    `).run(BASE_TIME + 500, BASE_TIME + 500, 'project_01')
    const updated = repository.append(draft({
      canonicalEventId: 'root_event_active_update',
      lifecycle: 'active',
      progressiveKey: 'tool:call_01',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'still_running' },
      source: { ...draft().source, providerEventId: 'provider_event_active_update' },
    }))

    assert.equal(updated.advanced, true)
    assert.equal(updated.event.canonical.updatedAt, started.event.canonical.updatedAt)
    assert.equal(
      db.prepare('SELECT updated_at FROM chat_threads WHERE id = ?').get('thread_01').updated_at,
      BASE_TIME + 500,
    )
    assert.deepEqual(
      db.prepare('SELECT last_worked_at, last_opened_at FROM workspace_projects WHERE id = ?').get('project_01'),
      { last_worked_at: BASE_TIME + 500, last_opened_at: BASE_TIME + 500 },
    )
    assert.throws(() => repository.append(draft({
      canonicalEventId: 'root_event_other_provider',
      lifecycle: 'active',
      progressiveKey: 'tool:call_01',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'still_running' },
      source: {
        ...draft().source,
        providerId: 'anthropic',
        providerEventId: 'provider_event_other_provider',
      },
    })), /source provider/i)
    assert.throws(() => repository.append(draft({
      canonicalEventId: 'root_event_created_late',
      lifecycle: 'created',
      progressiveKey: 'tool:call_01',
      semanticKind: 'tool_state',
      phase: 'tool',
      payload: { state: 'created_late' },
      source: { ...draft().source, providerEventId: 'provider_event_created_late' },
    })), /lifecycle.*regress/i)
  } finally {
    db.close()
  }
})

test('root event repository appendMany is atomic and surfaces persistence failures', () => {
  const db = database()
  try {
    const repository = createRootEventRepository(db, { now: () => BASE_TIME + 100 })
    assert.throws(() => repository.appendMany([
      draft(),
      draft({ canonicalEventId: 'root_event_invalid', lifecycle: 'mystery' }),
    ]), /lifecycle/i)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chat_events').get().count, 0)

    db.exec('DROP TABLE chat_events')
    assert.throws(() => repository.append(draft()), /chat_events|no such table/i)
  } finally {
    db.close()
  }
})

test('v27 migration preserves legacy row identity and projects only provable canonical metadata', () => {
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    ensureCoreTables(db)
    ensureNodeColumns(db)
    ensureWorkspaceTables(db)
    db.prepare(`
      INSERT INTO workspace_projects (
        id, path, name, created_at, last_opened_at, last_worked_at,
        last_provider, last_model, active_thread_id
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', ?)
    `).run('legacy_project', 'C:/workspace/legacy', 'Legacy', BASE_TIME, BASE_TIME, BASE_TIME, 'legacy_thread')
    db.prepare(`
      INSERT INTO chat_threads (
        id, project_id, title, created_at, updated_at, last_viewed_at, archived
      ) VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run('legacy_thread', 'legacy_project', 'Legacy thread', BASE_TIME, BASE_TIME, BASE_TIME)
    db.prepare(`
      INSERT INTO chat_events (event_id, thread_id, turn_id, kind, role, content, meta_json, created_at)
      VALUES (41, 'legacy_thread', 'legacy_turn', 'assistant_message', 'assistant', 'Historical answer.', '{}', ?)
    `).run(BASE_TIME)
    db.pragma('user_version = 27')

    runMigrations(db)

    const row = db.prepare('SELECT * FROM chat_events WHERE event_id = 41').get()
    assert.equal(Number(db.pragma('user_version', { simple: true })), SCHEMA_VERSION)
    assert.equal(row.event_id, 41)
    assert.equal(row.content, 'Historical answer.')
    assert.equal(row.schema_version, 0)
    assert.equal(row.project_id, 'legacy_project')
    assert.equal(row.conversation_id, 'legacy_thread')
    assert.equal(row.semantic_kind, 'assistant_message')
    assert.equal(row.support_decision, 'legacy_unknown')
    assert.equal(row.actor_kind, null)
    assert.equal(row.phase, null)
    assert.equal(row.source_provider_id, null)
    assert.equal(row.local_sequence, null)
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_chat_events_turn_sequence'").get().count,
      1,
    )
  } finally {
    db.close()
  }
})

test('canonical column assurance does not rewrite already-backfilled legacy rows', () => {
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    ensureCoreTables(db)
    ensureNodeColumns(db)
    ensureWorkspaceTables(db)
    db.prepare(`
      INSERT INTO workspace_projects (
        id, path, name, created_at, last_opened_at, last_worked_at,
        last_provider, last_model, active_thread_id
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', ?)
    `).run('legacy_project', 'C:/workspace/legacy', 'Legacy', BASE_TIME, BASE_TIME, BASE_TIME, 'legacy_thread')
    db.prepare(`
      INSERT INTO chat_threads (
        id, project_id, title, created_at, updated_at, last_viewed_at, archived
      ) VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run('legacy_thread', 'legacy_project', 'Legacy thread', BASE_TIME, BASE_TIME, BASE_TIME)
    db.prepare(`
      INSERT INTO chat_events (thread_id, turn_id, kind, role, content, meta_json, created_at)
      VALUES ('legacy_thread', 'legacy_turn', 'assistant_message', 'assistant', 'Historical answer.', '{}', ?)
    `).run(BASE_TIME)
    db.pragma('user_version = 27')
    runMigrations(db)

    const before = Number(db.prepare('SELECT total_changes() AS count').get().count || 0)
    ensureCanonicalChatEventColumns(db)
    const after = Number(db.prepare('SELECT total_changes() AS count').get().count || 0)

    assert.equal(after, before)
  } finally {
    db.close()
  }
})

test('legacy timeline pruning never removes canonical ledger rows', () => {
  const db = database()
  try {
    const repository = createRootEventRepository(db, { now: () => BASE_TIME + 100 })
    const canonical = repository.append(draft()).event
    const insertLegacy = db.prepare(`
      INSERT INTO chat_events (thread_id, turn_id, kind, role, content, meta_json, created_at)
      VALUES ('thread_01', 'legacy_turn', 'diagnostic', '', '', '{}', ?)
    `)
    db.transaction(() => {
      for (let index = 0; index < MAX_EVENTS_PER_THREAD + 1; index += 1) {
        insertLegacy.run(BASE_TIME + 200 + index)
      }
    })()

    assert.equal(pruneThreadEventsInternal(db, 'thread_01'), 1)
    assert.ok(db.prepare('SELECT event_id FROM chat_events WHERE event_id = ?').get(canonical.eventId))
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM chat_events WHERE schema_version = 0').get().count,
      MAX_EVENTS_PER_THREAD,
    )
  } finally {
    db.close()
  }
})
