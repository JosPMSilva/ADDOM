import { createHash } from 'node:crypto'

function parseEvents(value) {
  try {
    const events = JSON.parse(value)
    return Array.isArray(events) ? events : []
  } catch {
    return []
  }
}

export function hashAgentEvents(events) {
  return createHash('sha256').update(JSON.stringify(events)).digest('hex')
}

function expandCompactions(rows, runId) {
  return rows.flatMap((row) => {
    const compacted = parseEvents(row.events_json)
    if (hashAgentEvents(compacted) !== row.content_hash) {
      throw new Error(`Agent event compaction hash mismatch for run ${runId}`)
    }
    return compacted
  })
}

function bySequence(left, right) {
  return left.runSequence - right.runSequence
}

export function readAgentRunEvents(db, runId) {
  const events = db.prepare(`
    SELECT event_json FROM agent_events WHERE run_id = ?
  `).all(runId).flatMap((row) => parseEvents(`[${row.event_json}]`))
  const compactedEvents = expandCompactions(db.prepare(`
    SELECT events_json, content_hash
    FROM agent_event_compactions
    WHERE run_id = ?
  `).all(runId), runId)
  return [...events, ...compactedEvents].sort(bySequence)
}

/**
 * Reads at most `limit + 1` events after `afterRunSequence` so callers can detect a further page.
 *
 * Compacted history lives in `agent_event_compactions` rather than `agent_events`, so a page is
 * assembled from both. The live page establishes an upper sequence bound; only compaction rows
 * starting at or below that bound can contain events belonging to this page, and every excluded
 * row holds events strictly beyond it. A run whose remaining history is entirely compacted has no
 * live bound, so its trailing compaction rows are read in full.
 */
export function readAgentRunEventsPage(db, runId, {
  afterRunSequence = 0,
  nodeId = null,
  limit = 50,
} = {}) {
  const after = Number(afterRunSequence) || 0
  const node = nodeId ? String(nodeId) : null
  const liveRows = node
    ? db.prepare(`
      SELECT event_json FROM agent_events
      WHERE run_id = ? AND node_id = ? AND run_sequence > ?
      ORDER BY run_sequence ASC
      LIMIT ?
    `).all(runId, node, after, limit + 1)
    : db.prepare(`
      SELECT event_json FROM agent_events
      WHERE run_id = ? AND run_sequence > ?
      ORDER BY run_sequence ASC
      LIMIT ?
    `).all(runId, after, limit + 1)
  const live = liveRows.flatMap((row) => parseEvents(`[${row.event_json}]`))
  const bound = live.length > limit ? live[limit].runSequence : Number.MAX_SAFE_INTEGER

  const compactionRows = node
    ? db.prepare(`
      SELECT events_json, content_hash FROM agent_event_compactions
      WHERE run_id = ? AND node_id = ?
        AND source_sequence_end > ? AND source_sequence_start <= ?
      ORDER BY source_sequence_start ASC
    `).all(runId, node, after, bound)
    : db.prepare(`
      SELECT events_json, content_hash FROM agent_event_compactions
      WHERE run_id = ?
        AND source_sequence_end > ? AND source_sequence_start <= ?
      ORDER BY source_sequence_start ASC
    `).all(runId, after, bound)
  const compacted = expandCompactions(compactionRows, runId)
    .filter((event) => event.runSequence > after && event.runSequence <= bound)

  if (compacted.length === 0) return live
  return [...live, ...compacted].sort(bySequence).slice(0, limit + 1)
}
