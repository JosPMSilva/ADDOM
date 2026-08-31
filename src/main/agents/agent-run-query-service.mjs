import {
  projectAgentEvent,
  projectAgentRun,
  projectAgentRunGraph,
} from './agent-run-renderer-projection.mjs'
import { performance } from 'node:perf_hooks'
import { recordAgentRuntimeDiagnostic } from './agent-runtime-diagnostics.mjs'

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function requiredText(value, field, maxLength = 256) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new TypeError(`${field} is required`)
  if (normalized.length > maxLength) throw new TypeError(`${field} is too long`)
  return normalized
}

function boundedLimit(value, fallback = 50, maximum = 200) {
  const normalized = value == null ? fallback : Number(value)
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new TypeError(`limit must be an integer between 1 and ${maximum}`)
  }
  return normalized
}

function cursor(value) {
  if (value == null || value === '') return 0
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError('cursor must be a non-negative integer')
  }
  return normalized
}

function transcriptItem(segment, { turnId = null, transcriptSequence = 0 } = {}) {
  const payload = segment.payload && typeof segment.payload === 'object' ? segment.payload : {}
  return {
    id: segment.eventId,
    eventId: segment.eventId,
    runId: segment.runId,
    nodeId: segment.nodeId,
    attemptId: segment.attemptId || null,
    turnId: turnId || null,
    kind: segment.kind,
    content: payload.delta ?? payload.output ?? payload.text ?? '',
    toolCallId: payload.toolCallId || null,
    toolName: payload.toolName || null,
    toolClass: payload.toolClass || null,
    status: payload.status || null,
    boundary: payload.boundary || null,
    presentation: payload.presentation || null,
    runSequence: Number(segment.runSequence || 0),
    nodeSequence: Number(segment.nodeSequence || 0),
    createdAt: Number(segment.createdAt || 0),
    transcriptSequence: Number(transcriptSequence || 0),
  }
}

function conversationIdsForRun(db, runId) {
  return Object.fromEntries(db.prepare(`
    SELECT node_id, conversation_id
    FROM agent_node_conversation_bindings
    WHERE run_id = ?
  `).all(runId).map((row) => [row.node_id, row.conversation_id]))
}

export function createAgentRunQueryService({
  db,
  repository,
  diagnostics = null,
  monotonicNow = performance.now.bind(performance),
  warn = console.warn,
}) {
  if (!db || !repository) throw new TypeError('db and repository are required')

  function assertScope(input = {}, { requireRun = false, requireNode = false } = {}) {
    const projectId = requiredText(input.projectId, 'projectId')
    const threadId = requiredText(input.threadId, 'threadId')
    const thread = db.prepare(`
      SELECT id FROM chat_threads WHERE id = ? AND project_id = ?
    `).get(threadId, projectId)
    if (!thread) throw new TypeError('Agent operation is outside the owning project/thread scope')
    const result = { projectId, threadId }
    if (requireRun || input.runId) {
      const runId = requiredText(input.runId, 'runId')
      const run = db.prepare(`
        SELECT id FROM agent_runs WHERE id = ? AND project_id = ? AND thread_id = ?
      `).get(runId, projectId, threadId)
      if (!run) throw new TypeError('Agent run is outside the owning project/thread scope')
      result.runId = runId
    }
    if (requireNode || input.nodeId) {
      const nodeId = requiredText(input.nodeId, 'nodeId')
      const node = db.prepare(`
        SELECT id FROM agent_nodes WHERE id = ? AND run_id = ?
      `).get(nodeId, result.runId)
      if (!node) throw new TypeError('Agent node is outside the owning run scope')
      result.nodeId = nodeId
    }
    return result
  }

  function listRuns(input = {}) {
    const projectId = String(input.projectId || '').trim()
    const threadId = String(input.threadId || '').trim()
    if (!projectId || !threadId) {
      return {
        schemaVersion: 1,
        runs: [],
        hasMore: false,
        nextCursor: null,
      }
    }
    const scope = assertScope(input)
    const limit = boundedLimit(input.limit, 50, 100)
    const offset = cursor(input.cursor)
    const rows = db.prepare(`
      SELECT contract_json
      FROM agent_runs
      WHERE project_id = ? AND thread_id = ?
      ORDER BY updated_at DESC, id ASC
      LIMIT ? OFFSET ?
    `).all(scope.projectId, scope.threadId, limit + 1, offset)
    const runs = rows.slice(0, limit)
      .map((row) => parseJson(row.contract_json))
      .filter(Boolean)
      .map(projectAgentRun)
    return {
      schemaVersion: 1,
      runs,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? offset + limit : null,
    }
  }

  function getRun(input = {}) {
    const startedAt = monotonicNow()
    const scope = assertScope(input, { requireRun: true })
    const graph = repository.getRunProjectionGraph(scope.runId)
    if (!graph) throw new TypeError(`Agent run ${scope.runId} was not found`)
    const projected = projectAgentRunGraph(graph, {
      conversationIdsByNode: conversationIdsForRun(db, scope.runId),
    })
    recordAgentRuntimeDiagnostic(diagnostics, {
      kind: 'renderer_reconciliation',
      runId: scope.runId,
      nodeId: graph.run.rootNodeId,
      providerClass: 'unknown',
      monotonicAt: startedAt,
      durationMs: Math.max(0, monotonicNow() - startedAt),
      outcome: 'snapshot',
      attributes: { node_count: graph.nodes.length },
    }, warn)
    if (input.reconciliationReason === 'sequence_gap') {
      recordAgentRuntimeDiagnostic(diagnostics, {
        kind: 'sequence_gap',
        runId: scope.runId,
        nodeId: graph.run.rootNodeId,
        providerClass: 'unknown',
        monotonicAt: startedAt,
        durationMs: Math.max(0, monotonicNow() - startedAt),
        outcome: 'reconciled',
      }, warn)
    }
    return projected
  }

  function getTranscriptPage(input = {}) {
    const startedAt = monotonicNow()
    const scope = assertScope(input, { requireRun: true, requireNode: true })
    const limit = boundedLimit(input.limit)
    const after = cursor(input.cursor)
    const rows = db.prepare(`
      SELECT segment_json, node_sequence
      FROM agent_transcript_segments
      WHERE run_id = ? AND node_id = ? AND node_sequence > ?
      ORDER BY node_sequence ASC
      LIMIT ?
    `).all(scope.runId, scope.nodeId, after, limit + 1)
    const items = rows.slice(0, limit)
      .map((row) => parseJson(row.segment_json))
      .filter(Boolean)
      .map(transcriptItem)
    const page = {
      schemaVersion: 1,
      runId: scope.runId,
      nodeId: scope.nodeId,
      items,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? items.at(-1)?.nodeSequence || null : null,
    }
    recordAgentRuntimeDiagnostic(diagnostics, {
      kind: 'transcript_hydration',
      runId: scope.runId,
      nodeId: scope.nodeId,
      providerClass: 'unknown',
      monotonicAt: startedAt,
      durationMs: Math.max(0, monotonicNow() - startedAt),
      outcome: 'page',
      attributes: { item_count: items.length, has_more: page.hasMore },
    }, warn)
    return page
  }

  function getConversationTranscriptPage(input = {}) {
    const startedAt = monotonicNow()
    const scope = assertScope(input, { requireRun: true, requireNode: true })
    const binding = db.prepare(`
      SELECT bindings.conversation_id
      FROM agent_node_conversation_bindings AS bindings
      INNER JOIN agent_conversations AS conversations
        ON conversations.id = bindings.conversation_id
      WHERE bindings.node_id = ? AND bindings.run_id = ?
        AND conversations.project_id = ? AND conversations.root_thread_id = ?
    `).get(scope.nodeId, scope.runId, scope.projectId, scope.threadId)
    if (!binding) throw new TypeError('Agent conversation was not found for the selected node')
    const limit = boundedLimit(input.limit)
    const beforeSequence = cursor(input.cursor)
    const rows = db.prepare(`
      SELECT segments.rowid AS transcript_sequence, segments.segment_json, bindings.turn_id
      FROM agent_transcript_segments AS segments
      INNER JOIN agent_attempt_turn_bindings AS bindings
        ON bindings.attempt_id = segments.attempt_id
      INNER JOIN agent_turns AS turns
        ON turns.id = bindings.turn_id AND turns.conversation_id = bindings.conversation_id
      WHERE bindings.conversation_id = ?
        AND (? = 0 OR segments.rowid < ?)
        AND NOT (segments.kind = 'agent_assistant_delta' AND turns.final_message_id IS NOT NULL)
      ORDER BY segments.rowid DESC
      LIMIT ?
    `).all(binding.conversation_id, beforeSequence, beforeSequence, limit + 1)
    const items = rows.slice(0, limit)
      .map((row) => ({
        segment: parseJson(row.segment_json),
        turnId: row.turn_id,
        transcriptSequence: row.transcript_sequence,
      }))
      .filter((entry) => entry.segment)
      .map((entry) => transcriptItem(entry.segment, {
        turnId: entry.turnId,
        transcriptSequence: entry.transcriptSequence,
      }))
      .reverse()
    const page = {
      schemaVersion: 1,
      conversationId: binding.conversation_id,
      items,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? items[0]?.transcriptSequence || null : null,
    }
    recordAgentRuntimeDiagnostic(diagnostics, {
      kind: 'transcript_hydration',
      runId: scope.runId,
      nodeId: scope.nodeId,
      providerClass: 'unknown',
      monotonicAt: startedAt,
      durationMs: Math.max(0, monotonicNow() - startedAt),
      outcome: 'conversation_page',
      attributes: { item_count: items.length, has_more: page.hasMore },
    }, warn)
    return page
  }

  function getEventsPage(input = {}) {
    const scope = assertScope(input, { requireRun: true })
    const limit = boundedLimit(input.limit)
    const after = cursor(input.cursor)
    const rows = repository.listEventsPage(scope.runId, {
      afterRunSequence: after,
      nodeId: scope.nodeId || null,
      limit,
    })
    const items = rows.slice(0, limit).map(projectAgentEvent)
    return {
      schemaVersion: 1,
      runId: scope.runId,
      items,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? items.at(-1)?.runSequence || null : null,
    }
  }

  return Object.freeze({
    assertScope,
    getEventsPage,
    getRun,
    getConversationTranscriptPage,
    getTranscriptPage,
    listRuns,
  })
}
