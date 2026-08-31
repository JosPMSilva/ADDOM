import { normalizeCanonicalRootEvent } from '../../common/chat/execution-event-contract.mjs'

function parsePayload(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new TypeError('Canonical root event payload_json is required')
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      throw new TypeError('Canonical root event payload_json must contain an object or array')
    }
    return parsed
  } catch (error) {
    if (error instanceof TypeError) throw error
    throw new TypeError('Canonical root event payload_json is invalid JSON', { cause: error })
  }
}

export function mapCanonicalRootEventRow(row) {
  if (!row) return null
  const schemaVersion = Number(row.schema_version || 0)
  if (schemaVersion < 1) {
    const createdAt = Number(row.created_at || 0)
    return {
      schemaVersion: 0,
      canonicalEventId: '',
      projectId: String(row.project_id || ''),
      conversationId: String(row.conversation_id || row.thread_id || ''),
      threadId: String(row.thread_id || ''),
      turnId: String(row.turn_id || ''),
      localSequence: 0,
      occurredAt: Number(row.occurred_at || createdAt),
      createdAt,
      updatedAt: Number(row.updated_at || createdAt),
      source: null,
      actor: null,
      semanticKind: String(row.semantic_kind || row.kind || ''),
      phase: '',
      lifecycle: '',
      payload: null,
      supportDecision: 'legacy_unknown',
      progressiveKey: '',
    }
  }

  return normalizeCanonicalRootEvent({
    schemaVersion,
    canonicalEventId: String(row.canonical_event_id || ''),
    projectId: String(row.project_id || ''),
    conversationId: String(row.conversation_id || ''),
    threadId: String(row.thread_id || ''),
    turnId: String(row.turn_id || ''),
    localSequence: Number(row.local_sequence || 0),
    occurredAt: Number(row.occurred_at || 0),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || row.created_at || 0),
    source: {
      providerId: String(row.source_provider_id || ''),
      transport: String(row.source_transport || ''),
      runtime: String(row.source_runtime || ''),
      providerEventId: String(row.provider_event_id || ''),
      providerCorrelationKey: String(row.provider_correlation_key || ''),
    },
    actor: {
      kind: String(row.actor_kind || ''),
      id: String(row.actor_id || ''),
      conversationId: String(row.actor_conversation_id || ''),
      runId: String(row.actor_run_id || ''),
    },
    semanticKind: String(row.semantic_kind || row.kind || ''),
    phase: String(row.phase || ''),
    lifecycle: String(row.lifecycle || ''),
    payload: parsePayload(row.payload_json),
    supportDecision: String(row.support_decision || ''),
    progressiveKey: String(row.progressive_key || ''),
  })
}
