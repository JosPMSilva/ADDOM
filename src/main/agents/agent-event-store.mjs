import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import { validateAgentEvent } from '../../common/agents/agent-event-contract.mjs'
import { projectAgentEvent } from './agent-event-projector.mjs'
import { recordAgentRuntimeDiagnostic } from './agent-runtime-diagnostics.mjs'

const PROVIDER_DIAGNOSTIC_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000
const TRANSCRIPT_DELTA_KINDS = new Set([
  'agent_commentary_delta',
  'agent_assistant_delta',
  'agent_reasoning_delta',
  'agent_reasoning_boundary',
  'agent_tool_output',
])
const APPROVAL_KINDS = new Set([
  'agent_approval_requested',
  'agent_approval_resolved',
  'agent_approval_consumed',
])
const ARTIFACT_KINDS = new Set([
  'agent_artifact_staged',
  'agent_workspace_ready',
  'agent_merge_requested',
  'agent_merge_completed',
])

function retentionClassForKind(kind) {
  if (TRANSCRIPT_DELTA_KINDS.has(kind)) return 'transcript_delta'
  if (APPROVAL_KINDS.has(kind)) return 'approval'
  if (ARTIFACT_KINDS.has(kind)) return 'artifact'
  return 'lifecycle'
}

function stripProviderDiagnostics(input) {
  const event = JSON.parse(JSON.stringify(input))
  const metadata = {}
  if (event.adapterMetadata && typeof event.adapterMetadata === 'object') {
    metadata.adapter = event.adapterMetadata
    delete event.adapterMetadata
  }
  if (event.payload?.providerMetadata && typeof event.payload.providerMetadata === 'object') {
    metadata.provider = event.payload.providerMetadata
    delete event.payload.providerMetadata
  }
  return {
    event,
    diagnostics: Object.keys(metadata).length > 0 ? metadata : null,
  }
}

function mapEventRow(row) {
  if (!row) return null
  try {
    return JSON.parse(row.event_json)
  } catch {
    return null
  }
}

export function createAgentEventStore(db, {
  diagnostics = null,
  idFactory = randomUUID,
  monotonicNow = performance.now.bind(performance),
  warn = console.warn,
} = {}) {
  const listeners = new Set()
  const findReceiptByEventId = db.prepare(`
    SELECT * FROM agent_event_receipts WHERE event_id = ?
  `)
  const findReceiptByIdempotency = db.prepare(`
    SELECT * FROM agent_event_receipts WHERE run_id = ? AND idempotency_key = ?
  `)
  const findReceiptByProviderEvent = db.prepare(`
    SELECT * FROM agent_event_receipts
    WHERE provider_correlation_key = ? AND provider_event_id = ?
  `)
  const findEvent = db.prepare(`SELECT event_json FROM agent_events WHERE event_id = ?`)
  const findCompaction = db.prepare(`
    SELECT compactions.events_json
    FROM agent_event_receipts AS receipts
    JOIN agent_event_compactions AS compactions ON compactions.id = receipts.compaction_id
    WHERE receipts.event_id = ?
  `)
  const maxRunSequence = db.prepare(`
    SELECT COALESCE(MAX(run_sequence), 0) AS sequence
    FROM agent_event_receipts WHERE run_id = ?
  `)
  const maxNodeSequence = db.prepare(`
    SELECT COALESCE(MAX(node_sequence), 0) AS sequence
    FROM agent_event_receipts WHERE run_id = ? AND node_id = ?
  `)
  const insertReceipt = db.prepare(`
    INSERT INTO agent_event_receipts (
      event_id, run_id, node_id, run_sequence, node_sequence, idempotency_key,
      provider_event_id, provider_correlation_key, kind, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertEvent = db.prepare(`
    INSERT INTO agent_events (
      event_id, run_id, node_id, parent_node_id, run_sequence, node_sequence,
      attempt_id, provider_event_id, provider_correlation_key, idempotency_key,
      kind, payload_json, event_json, retention_class, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertDiagnostics = db.prepare(`
    INSERT INTO agent_provider_diagnostics (
      event_id, run_id, node_id, provider_event_id, metadata_json, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const findNodeContract = db.prepare(`
    SELECT contract_json FROM agent_nodes WHERE id = ? AND run_id = ?
  `)

  function providerClassFor(runId, nodeId) {
    try {
      const row = findNodeContract.get(nodeId, runId)
      const contract = row ? JSON.parse(row.contract_json || '{}') : {}
      return String(
        contract?.providerCapabilitySnapshot?.nodeCapabilities?.mode
        || contract?.capabilitySnapshot?.mode
        || 'unknown',
      ).trim().toLowerCase() || 'unknown'
    } catch {
      return 'unknown'
    }
  }

  function duplicateResult(receipt, deduplicatedBy) {
    let event = mapEventRow(findEvent.get(receipt.event_id))
    if (!event && receipt.compaction_id) {
      const row = findCompaction.get(receipt.event_id)
      const events = row ? JSON.parse(row.events_json) : []
      event = events.find((candidate) => candidate.eventId === receipt.event_id) || null
    }
    recordAgentRuntimeDiagnostic(diagnostics, {
      kind: 'dedupe',
      runId: receipt.run_id,
      nodeId: receipt.node_id,
      providerClass: providerClassFor(receipt.run_id, receipt.node_id),
      outcome: 'dropped',
      attributes: { reason_code: deduplicatedBy },
    }, warn)
    return { inserted: false, deduplicatedBy, event, diagnostics: null }
  }

  function findDuplicate(draft) {
    const byEventId = findReceiptByEventId.get(draft.eventId)
    if (byEventId) return duplicateResult(byEventId, 'event_id')
    const byIdempotency = findReceiptByIdempotency.get(draft.runId, draft.idempotencyKey)
    if (byIdempotency) return duplicateResult(byIdempotency, 'idempotency_key')
    if (draft.providerEventId && draft.providerCorrelationKey) {
      const byProvider = findReceiptByProviderEvent.get(
        draft.providerCorrelationKey,
        draft.providerEventId,
      )
      if (byProvider) return duplicateResult(byProvider, 'provider_event')
    }
    return null
  }

  function appendInsideTransaction(input) {
    const draft = {
      ...input,
      eventId: String(input?.eventId || idFactory()),
      idempotencyKey: String(input?.idempotencyKey || input?.eventId || ''),
    }
    const duplicate = findDuplicate(draft)
    if (duplicate) return duplicate

    const runSequence = Number(maxRunSequence.get(draft.runId)?.sequence || 0) + 1
    const nodeSequence = Number(maxNodeSequence.get(draft.runId, draft.nodeId)?.sequence || 0) + 1
    const withSequences = validateAgentEvent({
      ...draft,
      schemaVersion: 1,
      runSequence,
      nodeSequence,
    })
    const { event, diagnostics: providerDiagnostics } = stripProviderDiagnostics(withSequences)
    const canonicalEvent = validateAgentEvent(event)

    insertReceipt.run(
      canonicalEvent.eventId,
      canonicalEvent.runId,
      canonicalEvent.nodeId,
      canonicalEvent.runSequence,
      canonicalEvent.nodeSequence,
      canonicalEvent.idempotencyKey,
      canonicalEvent.providerEventId,
      canonicalEvent.providerCorrelationKey,
      canonicalEvent.kind,
      canonicalEvent.createdAt,
    )
    const payloadJson = JSON.stringify(canonicalEvent.payload)
    const eventJson = JSON.stringify(canonicalEvent)
    insertEvent.run(
      canonicalEvent.eventId,
      canonicalEvent.runId,
      canonicalEvent.nodeId,
      canonicalEvent.parentNodeId,
      canonicalEvent.runSequence,
      canonicalEvent.nodeSequence,
      canonicalEvent.attemptId,
      canonicalEvent.providerEventId,
      canonicalEvent.providerCorrelationKey,
      canonicalEvent.idempotencyKey,
      canonicalEvent.kind,
      payloadJson,
      eventJson,
      retentionClassForKind(canonicalEvent.kind),
      canonicalEvent.createdAt,
    )
    if (providerDiagnostics) {
      insertDiagnostics.run(
        canonicalEvent.eventId,
        canonicalEvent.runId,
        canonicalEvent.nodeId,
        canonicalEvent.providerEventId,
        JSON.stringify(providerDiagnostics),
        canonicalEvent.createdAt,
        canonicalEvent.createdAt + PROVIDER_DIAGNOSTIC_RETENTION_MS,
      )
    }
    const projectionStartedAt = monotonicNow()
    projectAgentEvent(db, canonicalEvent)
    recordAgentRuntimeDiagnostic(diagnostics, {
      kind: 'projection_replay',
      runId: canonicalEvent.runId,
      nodeId: canonicalEvent.nodeId,
      attemptId: canonicalEvent.attemptId,
      providerClass: providerClassFor(canonicalEvent.runId, canonicalEvent.nodeId),
      monotonicAt: projectionStartedAt,
      durationMs: Math.max(0, monotonicNow() - projectionStartedAt),
      outcome: 'projected',
      attributes: { event_kind: canonicalEvent.kind },
    }, warn)
    return {
      inserted: true,
      deduplicatedBy: null,
      event: canonicalEvent,
      diagnostics: providerDiagnostics,
    }
  }

  const appendTransaction = db.transaction((drafts) => drafts.map(appendInsideTransaction))

  function appendMany(drafts) {
    if (!Array.isArray(drafts) || drafts.length === 0) {
      throw new TypeError('appendMany requires at least one agent event draft')
    }
    const results = appendTransaction(drafts)
    const insertedEvents = results
      .filter((result) => result.inserted && result.event)
      .map((result) => result.event)
    if (insertedEvents.length > 0) {
      for (const listener of [...listeners]) {
        try {
          listener(insertedEvents)
        } catch (error) {
          warn('[agent-event-store] Subscriber delivery failed after commit.', error)
        }
      }
    }
    return results
  }

  function append(draft) {
    return appendMany([draft])[0]
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Agent event listener is required')
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return Object.freeze({ append, appendMany, subscribe })
}

export { PROVIDER_DIAGNOSTIC_RETENTION_MS }
