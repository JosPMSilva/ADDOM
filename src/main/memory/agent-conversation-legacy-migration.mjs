import { createHash } from 'node:crypto'

import {
  validateAgentConversation,
  validateAgentMessage,
  validateAgentTurn,
} from '../../common/agents/agent-conversation-contract.mjs'
import { isInvalidObjectSentinel, readRegisteredText } from '../../common/chat/canonical-turn-engine.mjs'

const FORENSIC_TABLE = 'agent_conversation_legacy_forensics'
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function parseJson(value, fallback = null) {
  try { return JSON.parse(String(value || '')) } catch { return fallback }
}

function stableId(prefix, value) {
  return `${prefix}_${createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`
}

function integer(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function safeText(value) {
  return typeof value === 'string' && !isInvalidObjectSentinel(value) ? value : ''
}

function safeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) ? value : ''
}

function contentParts(segment, messageId) {
  const source = segment?.finalDocument?.parts || segment?.payload?.finalDocument?.parts
  if (Array.isArray(source)) {
    const parts = source.map((part, index) => {
      if (!part || typeof part !== 'object') return null
      const kind = typeof part.kind === 'string' ? part.kind : 'markdown'
      const metadata = {
        partId: safeId(part.partId) || `${messageId}:part:${index + 1}`,
        appendOrder: Number.isInteger(part.appendOrder) && part.appendOrder > 0
          ? part.appendOrder
          : index + 1,
        status: ['completed', 'failed', 'cancelled'].includes(part.status) ? part.status : 'completed',
      }
      const text = safeText(part.text ?? part.content)
      if (['markdown', 'text', 'citation'].includes(kind) && text) return {
        kind,
        text,
        ...metadata,
      }
      if (kind === 'link' && safeText(part.label) && safeText(part.href)) {
        return { kind, label: safeText(part.label), href: safeText(part.href), ...metadata }
      }
      if (['file', 'image'].includes(kind) && safeId(part.id) && safeText(part.label)) {
        return { kind, id: safeId(part.id), label: safeText(part.label), ...metadata }
      }
      return null
    }).filter(Boolean)
    if (parts.length > 0) return parts
  }
  const text = readRegisteredText(segment?.payload)
  return text ? [{ kind: 'markdown', text, partId: `${messageId}:part:1`, appendOrder: 1, status: 'completed' }] : []
}

function turnStatus(node) {
  const status = String(node.status || '')
  if (TERMINAL_STATUSES.has(status)) return status
  if (status === 'queued' || status === 'starting') return 'queued'
  if (status === 'approval_required' || status === 'paused') return 'waiting'
  return 'running'
}

function forensicRecord(db, segment, reason) {
  const source = JSON.stringify(segment)
  db.prepare(`
    INSERT OR IGNORE INTO ${FORENSIC_TABLE} (
      event_id, run_id, node_id, attempt_id, kind, reason, source_digest, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(segment.eventId), String(segment.runId), String(segment.nodeId),
    segment.attemptId == null ? null : String(segment.attemptId), String(segment.kind), reason,
    createHash('sha256').update(source).digest('hex'), integer(segment.createdAt, Date.now()),
  )
}

function containsInvalidSentinel(value) {
  if (isInvalidObjectSentinel(value)) return true
  if (Array.isArray(value)) return value.some(containsInvalidSentinel)
  return !!value && typeof value === 'object' && Object.values(value).some(containsInvalidSentinel)
}

function readSegments(db, nodeId) {
  return db.prepare(`
    SELECT segment_json FROM agent_transcript_segments
    WHERE node_id = ? ORDER BY node_sequence ASC, event_id ASC
  `).all(nodeId).map((row) => parseJson(row.segment_json)).filter(Boolean)
}

function migrateNode(db, row) {
  const node = parseJson(row.node_contract)
  const run = parseJson(row.run_contract)
  if (!node || !run) return false
  const segments = readSegments(db, node.id)
  if (segments.length === 0) return false
  const conversationId = stableId('legacy_conversation', node.id)
  const turnId = stableId('legacy_turn', node.id)
  const createdAt = integer(node.createdAt, integer(run.createdAt, 0))
  const status = turnStatus(node)
  const startedAt = status === 'queued' ? null : integer(node.startedAt, createdAt)
  const finishedAt = TERMINAL_STATUSES.has(status) ? integer(node.finishedAt, startedAt || createdAt) : null
  const parent = node.parentNodeId ? db.prepare(`
    SELECT bindings.conversation_id, turns.id AS turn_id
    FROM agent_node_conversation_bindings AS bindings
    LEFT JOIN agent_turns AS turns ON turns.conversation_id = bindings.conversation_id
    WHERE bindings.node_id = ?
    ORDER BY turns.turn_sequence DESC LIMIT 1
  `).get(node.parentNodeId) : null
  const conversation = validateAgentConversation({
    schemaVersion: 1, id: conversationId, projectId: run.projectId, rootThreadId: run.threadId,
    parentConversationId: parent?.conversation_id || null, creatorTurnId: parent?.turn_id || null,
    ownerKind: 'agent', ownerId: node.id,
    createdByKind: 'orchestrator', createdById: node.parentNodeId || node.id, roleId: node.roleId,
    providerRoute: { providerId: node.providerId, modelId: node.modelId }, scope: 'nested_agent',
    status: TERMINAL_STATUSES.has(status) ? 'completed' : 'active', createdAt, updatedAt: finishedAt || createdAt,
  })
  const final = [...segments].reverse().find((segment) => String(segment.kind) === 'agent_final_message') || null
  const messageId = final ? stableId('legacy_message', final.eventId) : null
  const parts = final ? contentParts(final, messageId) : []
  const turn = validateAgentTurn({
    schemaVersion: 1, id: turnId, conversationId, sequence: 1,
    authorKind: 'orchestrator', authorId: node.parentNodeId || node.id, sourceTurnId: run.turnId,
    requestedAction: 'legacy_import', idempotencyKey: `${conversationId}:legacy-import`, status,
    finalMessageId: parts.length > 0 ? messageId : null, createdAt, startedAt, finishedAt,
  })
  db.prepare(`
    INSERT INTO agent_conversations (
      id, project_id, root_thread_id, parent_conversation_id, creator_turn_id, owner_kind, owner_id,
      role_id, provider_route_json, scope, status, contract_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(conversation.id, conversation.projectId, conversation.rootThreadId,
    conversation.parentConversationId, conversation.creatorTurnId, conversation.ownerKind, conversation.ownerId,
    conversation.roleId, JSON.stringify(conversation.providerRoute), conversation.scope, conversation.status,
    JSON.stringify(conversation), conversation.createdAt, conversation.updatedAt)
  db.prepare(`
    INSERT INTO agent_node_conversation_bindings (node_id, run_id, conversation_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(node.id, node.runId, conversationId, createdAt)
  db.prepare(`
    INSERT INTO agent_turns (
      id, conversation_id, turn_sequence, idempotency_key, status, final_message_id, contract_json, created_at, updated_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
  `).run(turn.id, turn.conversationId, turn.idempotencyKey, turn.status, turn.finalMessageId,
    JSON.stringify(turn), turn.createdAt, finishedAt || turn.createdAt)
  if (parts.length > 0) {
    const message = validateAgentMessage({
      schemaVersion: 1, id: messageId, conversationId, turnId, sequence: 1, kind: 'final',
      authorKind: 'agent', authorId: node.id, sourceConversationId: null, sourceTurnId: run.turnId,
      idempotencyKey: `${turnId}:final:${final.eventId}`, contentParts: parts, createdAt: integer(final.createdAt, finishedAt || createdAt),
    })
    db.prepare(`
      INSERT INTO agent_messages (
        id, conversation_id, turn_id, message_sequence, kind, author_kind, author_id, idempotency_key,
        content_parts_json, contract_json, created_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    `).run(message.id, message.conversationId, message.turnId, message.kind, message.authorKind,
      message.authorId, message.idempotencyKey, JSON.stringify(message.contentParts), JSON.stringify(message), message.createdAt)
  }
  const attempts = db.prepare('SELECT id FROM agent_attempts WHERE node_id = ? ORDER BY attempt_number ASC').all(node.id)
  for (const attempt of attempts) {
    db.prepare(`
      INSERT OR IGNORE INTO agent_attempt_turn_bindings (attempt_id, node_id, conversation_id, turn_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(attempt.id, node.id, conversationId, turnId, createdAt)
  }
  for (const segment of segments) if (containsInvalidSentinel(segment)) forensicRecord(db, segment, 'invalid_object_sentinel')
  return true
}

export function ensureAgentConversationLegacyForensicsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${FORENSIC_TABLE} (
      event_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, node_id TEXT NOT NULL, attempt_id TEXT,
      kind TEXT NOT NULL, reason TEXT NOT NULL, source_digest TEXT NOT NULL, recorded_at INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );
  `)
}

/** Forward-only best-effort import of pre-conversation child evidence. Raw segments remain local forensic source. */
export function migrateLegacyAgentChildConversations(db) {
  ensureAgentConversationLegacyForensicsTable(db)
  const rows = db.prepare(`
    SELECT nodes.contract_json AS node_contract, runs.contract_json AS run_contract
    FROM agent_nodes AS nodes
    INNER JOIN agent_runs AS runs ON runs.id = nodes.run_id
    LEFT JOIN agent_node_conversation_bindings AS bindings ON bindings.node_id = nodes.id
    WHERE nodes.parent_node_id IS NOT NULL AND bindings.node_id IS NULL
    ORDER BY nodes.depth ASC, nodes.created_at ASC, nodes.id ASC
  `).all()
  let migrated = 0
  for (const row of rows) if (migrateNode(db, row)) migrated += 1
  return { migrated }
}
