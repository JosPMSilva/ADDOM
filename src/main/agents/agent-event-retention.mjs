import { hashAgentEvents } from './agent-event-log.mjs'

const TERMINAL_STATUSES = Object.freeze(['completed', 'failed', 'cancelled'])
const TERMINAL_TRANSCRIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

function compactionId(runId, nodeId, start, end, contentHash) {
  return `compact:${runId}:${nodeId}:${start}:${end}:${contentHash}`
}

export function pruneExpiredAgentProviderDiagnostics(db, { now = Date.now() } = {}) {
  const result = db.prepare(`
    DELETE FROM agent_provider_diagnostics WHERE expires_at <= ?
  `).run(now)
  return { deleted: result.changes }
}

export function compactTerminalAgentTranscriptDeltas(
  db,
  { now = Date.now(), olderThanMs = TERMINAL_TRANSCRIPT_RETENTION_MS } = {},
) {
  const rows = db.prepare(`
    SELECT events.run_id, events.node_id, events.event_id, events.run_sequence, events.event_json
    FROM agent_events AS events
    JOIN agent_runs AS runs ON runs.id = events.run_id
    WHERE events.retention_class = 'transcript_delta'
      AND events.created_at <= ?
      AND runs.status IN (${TERMINAL_STATUSES.map(() => '?').join(', ')})
      AND NOT EXISTS (
        SELECT 1 FROM agent_approval_projections AS approvals
        WHERE approvals.run_id = events.run_id AND approvals.status = 'pending'
      )
    ORDER BY events.run_id ASC, events.node_id ASC, events.run_sequence ASC
  `).all(now - olderThanMs, ...TERMINAL_STATUSES)

  const groups = new Map()
  for (const row of rows) {
    const key = `${row.run_id}\0${row.node_id}`
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }

  const compact = db.transaction(() => {
    let compactions = 0
    let compactedEvents = 0
    const insert = db.prepare(`
      INSERT INTO agent_event_compactions (
        id, run_id, node_id, source_sequence_start, source_sequence_end,
        event_count, events_json, content_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const markReceipt = db.prepare(`
      UPDATE agent_event_receipts SET compaction_id = ? WHERE event_id = ?
    `)
    const removeEvent = db.prepare(`DELETE FROM agent_events WHERE event_id = ?`)

    for (const group of groups.values()) {
      const events = group.map((row) => JSON.parse(row.event_json))
      const contentHash = hashAgentEvents(events)
      const start = group[0].run_sequence
      const end = group.at(-1).run_sequence
      const id = compactionId(group[0].run_id, group[0].node_id, start, end, contentHash)
      insert.run(
        id,
        group[0].run_id,
        group[0].node_id,
        start,
        end,
        group.length,
        JSON.stringify(events),
        contentHash,
        now,
      )
      for (const row of group) {
        markReceipt.run(id, row.event_id)
        removeEvent.run(row.event_id)
      }
      compactions += 1
      compactedEvents += group.length
    }
    return { compactions, compactedEvents }
  })

  return compact()
}

export { TERMINAL_TRANSCRIPT_RETENTION_MS }
