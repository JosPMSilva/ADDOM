import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import {
  CANONICAL_ROOT_EVENT_SCHEMA_VERSION,
  isTerminalCanonicalRootLifecycle,
  normalizeCanonicalRootEvent,
} from '../../common/chat/execution-event-contract.mjs'
import { mapEventRow } from './workspace-store-utils.mjs'

const MAX_CANONICAL_PAYLOAD_JSON_CHARS = 2_000_000
const NON_TERMINAL_LIFECYCLE_RANK = new Map([
  ['created', 0],
  ['active', 1],
])

function textPayload(event) {
  return typeof event?.payload?.text === 'string' ? event.payload.text : ''
}

function compatibilityRole(event) {
  if (event?.actor?.kind === 'root') return 'assistant'
  if (event?.actor?.kind === 'system') return 'system'
  return ''
}

function payloadJson(event) {
  const serialized = JSON.stringify(event?.payload ?? {})
  if (serialized.length > MAX_CANONICAL_PAYLOAD_JSON_CHARS) {
    throw new TypeError('Canonical root event payload is too large; store large or binary data as a managed artifact')
  }
  return serialized
}

function sameJson(left, right) {
  return isDeepStrictEqual(left, right)
}

function sameCanonicalScope(existing, next) {
  const current = existing.canonical
  return current.projectId === next.projectId
    && current.conversationId === next.conversationId
    && current.threadId === next.threadId
    && current.turnId === next.turnId
}

function sameCanonicalState(existing, next) {
  const current = existing.canonical
  return sameCanonicalScope(existing, next)
    && current.semanticKind === next.semanticKind
    && current.phase === next.phase
    && current.lifecycle === next.lifecycle
    && current.supportDecision === next.supportDecision
    && current.progressiveKey === next.progressiveKey
    && sameJson(current.actor, next.actor)
    && sameJson(current.payload, next.payload)
    && current.source?.providerId === next.source?.providerId
    && current.source?.runtime === next.source?.runtime
    && current.source?.providerEventId === next.source?.providerEventId
    && current.source?.providerCorrelationKey === next.source?.providerCorrelationKey
}

function assertProgressiveAdvance(existing, next) {
  const current = existing.canonical
  if (current.semanticKind !== next.semanticKind) {
    throw new TypeError('Progressive event semanticKind cannot change')
  }
  if (current.phase !== next.phase) {
    throw new TypeError('Progressive event phase cannot change')
  }
  if (current.progressiveKey !== next.progressiveKey) {
    throw new TypeError('Progressive event progressiveKey cannot change')
  }
  if (!sameJson(current.actor, next.actor)) {
    throw new TypeError('Progressive event actor cannot change')
  }
  if (current.source?.providerId !== next.source?.providerId) {
    throw new TypeError('Progressive event source provider cannot change')
  }
  if (current.source?.runtime !== next.source?.runtime) {
    throw new TypeError('Progressive event source runtime cannot change')
  }
  if (current.supportDecision !== next.supportDecision) {
    throw new TypeError('Progressive event supportDecision cannot change')
  }
  if (isTerminalCanonicalRootLifecycle(current.lifecycle)) {
    if (current.lifecycle === next.lifecycle && sameJson(current.payload, next.payload)) {
      return false
    }
    throw new TypeError('A terminal progressive event cannot be advanced')
  }
  const currentRank = NON_TERMINAL_LIFECYCLE_RANK.get(current.lifecycle)
  const nextRank = NON_TERMINAL_LIFECYCLE_RANK.get(next.lifecycle)
  if (currentRank != null && nextRank != null && nextRank < currentRank) {
    throw new TypeError(`Progressive event lifecycle cannot regress from ${current.lifecycle} to ${next.lifecycle}`)
  }
  return true
}

function normalizeImportedCanonical(raw, { projectId, threadId, fallbackCreatedAt }) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const actorSource = source.actor && typeof source.actor === 'object' ? source.actor : {}
  const createdAt = Number(fallbackCreatedAt) > 0 ? Number(fallbackCreatedAt) : source.createdAt
  const maxFuture = Date.now() + (5 * 60 * 1_000)
  const safeCreatedAt = Math.min(Math.max(1, Math.round(createdAt)), maxFuture)
  const occurredAt = Math.min(
    Math.max(1, Math.round(Number(source.occurredAt) || safeCreatedAt)),
    maxFuture,
  )
  const updatedAt = Math.max(
    safeCreatedAt,
    Math.min(Math.max(1, Math.round(Number(source.updatedAt) || safeCreatedAt)), maxFuture),
  )
  return normalizeCanonicalRootEvent({
    ...source,
    schemaVersion: CANONICAL_ROOT_EVENT_SCHEMA_VERSION,
    projectId,
    conversationId: threadId,
    threadId,
    occurredAt,
    createdAt: safeCreatedAt,
    updatedAt,
    actor: {
      ...actorSource,
      ...(String(actorSource.kind || '').trim().toLowerCase() === 'root'
        ? { conversationId: threadId }
        : {}),
    },
  })
}

export function createRootEventRepository(db, {
  idFactory = randomUUID,
  now = Date.now,
} = {}) {
  const findThread = db.prepare('SELECT id, project_id, archived FROM chat_threads WHERE id = ?')
  const findByCanonicalId = db.prepare(`
    SELECT * FROM chat_events WHERE thread_id = ? AND canonical_event_id = ?
  `)
  const findByProviderDelivery = db.prepare(`
    SELECT * FROM chat_events
    WHERE thread_id = ? AND provider_correlation_key = ? AND provider_event_id = ?
  `)
  const findByProgressiveKey = db.prepare(`
    SELECT * FROM chat_events
    WHERE thread_id = ? AND turn_id = ? AND progressive_key = ?
  `)
  const nextSequence = db.prepare(`
    SELECT COALESCE(MAX(local_sequence), 0) + 1 AS next_sequence
    FROM chat_events
    WHERE thread_id = ? AND turn_id = ? AND schema_version > 0
  `)
  const selectByRowId = db.prepare('SELECT * FROM chat_events WHERE event_id = ?')
  const insert = db.prepare(`
    INSERT INTO chat_events (
      thread_id, turn_id, kind, role, content, meta_json, created_at,
      schema_version, canonical_event_id, project_id, conversation_id, local_sequence,
      occurred_at, updated_at, source_provider_id, source_transport, source_runtime,
      provider_event_id, provider_correlation_key, actor_kind, actor_id,
      actor_conversation_id, actor_run_id, semantic_kind, phase, lifecycle,
      payload_json, support_decision, progressive_key
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `)
  const updateProgressive = db.prepare(`
    UPDATE chat_events
    SET kind = ?, role = ?, content = ?, updated_at = ?, lifecycle = ?, payload_json = ?
    WHERE event_id = ?
  `)
  const updateThread = db.prepare(`
    UPDATE chat_threads SET updated_at = MAX(updated_at, ?) WHERE id = ?
  `)
  const updateProject = db.prepare(`
    UPDATE workspace_projects
    SET
      last_worked_at = MAX(last_worked_at, ?),
      last_opened_at = MAX(last_opened_at, ?)
    WHERE id = ?
  `)

  function requireThread(threadId, projectId = '') {
    const thread = findThread.get(threadId)
    if (!thread || Number(thread.archived || 0) === 1) throw new Error('Thread not found.')
    if (projectId && String(thread.project_id || '') !== projectId) {
      throw new TypeError('Canonical root event projectId does not own threadId')
    }
    return thread
  }

  function duplicate(row, deduplicatedBy) {
    return {
      inserted: false,
      advanced: false,
      deduplicatedBy,
      event: mapEventRow(row),
    }
  }

  function insertCanonical(event, compatibility = null) {
    const legacy = compatibility && typeof compatibility === 'object' ? compatibility : {}
    const result = insert.run(
      event.threadId,
      event.turnId,
      String(legacy.kind || event.semanticKind),
      String(legacy.role ?? compatibilityRole(event)),
      String(legacy.content ?? textPayload(event)),
      String(legacy.metaJson || '{}'),
      event.createdAt,
      event.schemaVersion,
      event.canonicalEventId,
      event.projectId,
      event.conversationId,
      event.localSequence,
      event.occurredAt,
      event.updatedAt,
      event.source.providerId || null,
      event.source.transport || null,
      event.source.runtime || null,
      event.source.providerEventId || null,
      event.source.providerCorrelationKey || null,
      event.actor.kind,
      event.actor.id,
      event.actor.conversationId || null,
      event.actor.runId || null,
      event.semanticKind,
      event.phase,
      event.lifecycle,
      payloadJson(event),
      event.supportDecision,
      event.progressiveKey || null,
    )
    return selectByRowId.get(Number(result.lastInsertRowid || 0))
  }

  function advanceProgressive(existingRow, event, deduplicatedBy = 'progressive_key') {
    const existing = mapEventRow(existingRow)
    if (sameCanonicalState(existing, event)) return duplicate(existingRow, deduplicatedBy)
    if (!assertProgressiveAdvance(existing, event)) return duplicate(existingRow, deduplicatedBy)
    const effectiveUpdatedAt = Math.max(existing.canonical.updatedAt, event.updatedAt)
    updateProgressive.run(
      event.semanticKind,
      compatibilityRole(event),
      textPayload(event),
      effectiveUpdatedAt,
      event.lifecycle,
      payloadJson(event),
      existing.eventId,
    )
    updateThread.run(effectiveUpdatedAt, event.threadId)
    updateProject.run(effectiveUpdatedAt, effectiveUpdatedAt, event.projectId)
    return {
      inserted: false,
      advanced: true,
      deduplicatedBy: null,
      event: mapEventRow(selectByRowId.get(existing.eventId)),
    }
  }

  function resolveStableIdentity(existingRow, event, deduplicatedBy) {
    const existing = mapEventRow(existingRow)
    if (sameCanonicalState(existing, event)) return duplicate(existingRow, deduplicatedBy)
    if (!sameCanonicalScope(existing, event)) {
      throw new TypeError(`Canonical root event identity collision (${deduplicatedBy})`)
    }
    if (existing.canonical.progressiveKey && existing.canonical.progressiveKey === event.progressiveKey) {
      return advanceProgressive(existingRow, event, deduplicatedBy)
    }
    throw new TypeError(`Canonical root event identity collision (${deduplicatedBy})`)
  }

  function normalizeDraft(input, thread) {
    const timestamp = Math.max(1, Math.round(Number(now()) || Date.now()))
    const threadId = String(input?.threadId || thread.id || '').trim()
    const turnId = String(input?.turnId || '').trim()
    const localSequence = Number(nextSequence.get(threadId, turnId)?.next_sequence || 1)
    return normalizeCanonicalRootEvent({
      ...input,
      schemaVersion: CANONICAL_ROOT_EVENT_SCHEMA_VERSION,
      canonicalEventId: String(input?.canonicalEventId || idFactory()).trim(),
      projectId: String(input?.projectId || thread.project_id || '').trim(),
      conversationId: String(input?.conversationId || threadId).trim(),
      threadId,
      localSequence,
      occurredAt: Number(input?.occurredAt) > 0 ? Number(input.occurredAt) : timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  function appendInside(input) {
    const inputThreadId = String(input?.threadId || '').trim()
    if (!inputThreadId) throw new TypeError('Canonical root event threadId is required')
    const thread = requireThread(inputThreadId, String(input?.projectId || '').trim())
    const event = normalizeDraft(input, thread)

    const existingByCanonicalId = findByCanonicalId.get(inputThreadId, event.canonicalEventId)
    if (existingByCanonicalId) {
      return resolveStableIdentity(existingByCanonicalId, event, 'canonical_event_id')
    }
    const providerEventId = event.source.providerEventId
    const providerCorrelationKey = event.source.providerCorrelationKey
    if (providerEventId && providerCorrelationKey) {
      const existing = findByProviderDelivery.get(inputThreadId, providerCorrelationKey, providerEventId)
      if (existing) return resolveStableIdentity(existing, event, 'provider_event')
    }

    if (event.progressiveKey) {
      const existingRow = findByProgressiveKey.get(event.threadId, event.turnId, event.progressiveKey)
      if (existingRow) {
        return advanceProgressive(existingRow, event)
      }
    }

    const row = insertCanonical(event)
    updateThread.run(event.updatedAt, event.threadId)
    updateProject.run(event.updatedAt, event.updatedAt, event.projectId)
    return {
      inserted: true,
      advanced: false,
      deduplicatedBy: null,
      event: mapEventRow(row),
    }
  }

  const appendTransaction = db.transaction((inputs) => inputs.map(appendInside))

  function appendMany(inputs) {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new TypeError('appendMany requires at least one canonical root event draft')
    }
    return appendTransaction(inputs)
  }

  function append(input) {
    return appendMany([input])[0]
  }

  const importTransaction = db.transaction((threadId, legacyEvent, rawCanonical) => {
    const thread = requireThread(threadId)
    const canonical = normalizeImportedCanonical(rawCanonical, {
      projectId: String(thread.project_id || ''),
      threadId,
      fallbackCreatedAt: Number(legacyEvent?.createdAt || now()),
    })
    const row = insertCanonical(canonical, legacyEvent)
    return mapEventRow(row)
  })

  function importOne(threadId, legacyEvent, rawCanonical) {
    return importTransaction(String(threadId || '').trim(), legacyEvent, rawCanonical)
  }

  return Object.freeze({ append, appendMany, importOne })
}

export { MAX_CANONICAL_PAYLOAD_JSON_CHARS }
