import {
  validateAgentConversation,
  validateAgentMailboxEntry,
  validateAgentMessage,
  validateAgentPromotionSnapshot,
  validateAgentTurn,
} from '../../common/agents/agent-conversation-contract.mjs'

const MIGRATION_EXPECTATION = Object.freeze({
  fromSchemaVersion: 23,
  toSchemaVersion: 27,
  backupRequired: true,
  rollback: 'restore_backup_with_prior_binary',
})

function parseJson(value) {
  return JSON.parse(String(value || '{}'))
}

function readContract(db, table, id) {
  const row = db.prepare(`SELECT contract_json FROM ${table} WHERE id = ?`).get(id)
  return row ? parseJson(row.contract_json) : null
}

function requireNextSequence(db, table, column, conversationId, sequence, label) {
  const row = db.prepare(`SELECT COALESCE(MAX(${column}), 0) AS value FROM ${table} WHERE conversation_id = ?`).get(conversationId)
  const expected = Number(row?.value || 0) + 1
  if (sequence !== expected) throw new TypeError(`Expected next ${label} sequence ${expected}, received ${sequence}`)
}

function comparable(value, omittedKeys) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omittedKeys.includes(key)))
}

function assertCompatibleIdempotentValue(existing, requested, label) {
  const left = JSON.stringify(comparable(existing, ['id', 'createdAt']))
  const right = JSON.stringify(comparable(requested, ['id', 'createdAt']))
  if (left !== right) throw new TypeError(`${label} idempotency key was reused with a different payload`)
}

function projectConversation(value) {
  return {
    schemaVersion: 1,
    id: value.id,
    projectId: value.projectId,
    rootThreadId: value.rootThreadId,
    parentConversationId: value.parentConversationId,
    creatorTurnId: value.creatorTurnId,
    ownerKind: value.ownerKind,
    ownerId: value.ownerId,
    createdByKind: value.createdByKind,
    createdById: value.createdById,
    roleId: value.roleId,
    providerRoute: { ...value.providerRoute },
    scope: value.scope,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function projectTurn(value) {
  return {
    schemaVersion: 1,
    id: value.id,
    conversationId: value.conversationId,
    sequence: value.sequence,
    authorKind: value.authorKind,
    authorId: value.authorId,
    sourceTurnId: value.sourceTurnId,
    requestedAction: value.requestedAction,
    status: value.status,
    finalMessageId: value.finalMessageId,
    createdAt: value.createdAt,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
  }
}

function projectMessage(value) {
  return {
    schemaVersion: 1,
    id: value.id,
    conversationId: value.conversationId,
    turnId: value.turnId,
    sequence: value.sequence,
    kind: value.kind,
    authorKind: value.authorKind,
    authorId: value.authorId,
    sourceConversationId: value.sourceConversationId,
    sourceTurnId: value.sourceTurnId,
    contentParts: value.contentParts.map((part) => ({ ...part })),
    createdAt: value.createdAt,
  }
}

function projectMailbox(value) {
  return {
    schemaVersion: 1,
    id: value.id,
    messageId: value.messageId,
    conversationId: value.conversationId,
    targetTurnId: value.targetTurnId,
    authorKind: value.authorKind,
    authorId: value.authorId,
    enqueueSequence: value.enqueueSequence,
    deliveryState: value.deliveryState,
    deliveryAttempts: value.deliveryAttempts,
    createdAt: value.createdAt,
    deliveredAt: value.deliveredAt,
  }
}

const ACTIVE_TURN_STATUSES = new Set(['queued', 'running', 'waiting'])
const TURN_TRANSITIONS = Object.freeze({
  pending: new Set(['queued', 'failed', 'cancelled']),
  queued: new Set(['running', 'waiting', 'completed', 'failed', 'cancelled']),
  running: new Set(['waiting', 'completed', 'failed', 'cancelled']),
  waiting: new Set(['queued', 'running', 'completed', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
})

function readTurn(db, turnId) {
  const row = db.prepare('SELECT contract_json FROM agent_turns WHERE id = ?').get(turnId)
  return row ? validateAgentTurn(parseJson(row.contract_json)) : null
}

function readMailbox(db, mailboxId) {
  const row = db.prepare('SELECT contract_json FROM agent_mailbox_entries WHERE id = ?').get(mailboxId)
  return row ? validateAgentMailboxEntry(parseJson(row.contract_json)) : null
}

function assertNoOtherActiveTurn(db, conversationId, turnId = null) {
  const row = db.prepare(`
    SELECT id FROM agent_turns
    WHERE conversation_id = ? AND status IN ('queued', 'running', 'waiting')
      AND (? IS NULL OR id != ?)
    LIMIT 1
  `).get(conversationId, turnId, turnId)
  if (row) throw new TypeError(`Agent conversation ${conversationId} already has an active turn`)
}

function readNodeScope(db, nodeId) {
  return db.prepare(`
    SELECT nodes.id, nodes.run_id, runs.project_id, runs.thread_id, bindings.conversation_id
    FROM agent_nodes AS nodes
    INNER JOIN agent_runs AS runs ON runs.id = nodes.run_id
    LEFT JOIN agent_node_conversation_bindings AS bindings ON bindings.node_id = nodes.id
    WHERE nodes.id = ?
  `).get(nodeId)
}

function assertConversationMatchesNodeScope(value, node) {
  if (value.projectId !== node.project_id || value.rootThreadId !== node.thread_id) {
    throw new TypeError('Agent conversation does not match the AgentNode scope')
  }
}

export function createAgentConversationRepository(db) {
  if (!db) throw new TypeError('db is required')

  function createConversation(input, { nodeId } = {}) {
    const value = validateAgentConversation(input)
    if (!nodeId) throw new TypeError('nodeId is required when creating an agent conversation')
    return db.transaction(() => {
      const node = readNodeScope(db, nodeId)
      if (!node) throw new TypeError(`Agent node ${nodeId} was not found`)
      assertConversationMatchesNodeScope(value, node)
      if (node.conversation_id) throw new TypeError(`Agent node ${nodeId} is already bound to a conversation`)
      if (value.parentConversationId) {
        const parent = readContract(db, 'agent_conversations', value.parentConversationId)
        if (!parent) throw new TypeError(`Parent conversation ${value.parentConversationId} was not found`)
        if (parent.projectId !== value.projectId || parent.rootThreadId !== value.rootThreadId) {
          throw new TypeError('Parent conversation does not match the child conversation scope')
        }
      }
      db.prepare(`
        INSERT INTO agent_conversations (
          id, project_id, root_thread_id, parent_conversation_id, creator_turn_id,
          owner_kind, owner_id, role_id, provider_route_json, scope, status,
          contract_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        value.id, value.projectId, value.rootThreadId, value.parentConversationId, value.creatorTurnId,
        value.ownerKind, value.ownerId, value.roleId, JSON.stringify(value.providerRoute), value.scope,
        value.status, JSON.stringify(value), value.createdAt, value.updatedAt,
      )
      db.prepare(`
        INSERT INTO agent_node_conversation_bindings (node_id, run_id, conversation_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(nodeId, node.run_id, value.id, value.createdAt)
      return value
    })()
  }

  function createTurn(input) {
    const value = validateAgentTurn(input)
    return db.transaction(() => {
      if (!readContract(db, 'agent_conversations', value.conversationId)) {
        throw new TypeError(`Agent conversation ${value.conversationId} was not found`)
      }
      const existingRow = db.prepare(`
        SELECT contract_json FROM agent_turns WHERE conversation_id = ? AND idempotency_key = ?
      `).get(value.conversationId, value.idempotencyKey)
      if (existingRow) {
        const existing = validateAgentTurn(parseJson(existingRow.contract_json))
        assertCompatibleIdempotentValue(existing, value, 'Agent turn')
        return { inserted: false, item: existing }
      }
      if (ACTIVE_TURN_STATUSES.has(value.status)) assertNoOtherActiveTurn(db, value.conversationId)
      requireNextSequence(db, 'agent_turns', 'turn_sequence', value.conversationId, value.sequence, 'turn')
      db.prepare(`
        INSERT INTO agent_turns (
          id, conversation_id, turn_sequence, idempotency_key, status, final_message_id,
          contract_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        value.id, value.conversationId, value.sequence, value.idempotencyKey, value.status,
        value.finalMessageId, JSON.stringify(value), value.createdAt, value.createdAt,
      )
      return { inserted: true, item: value }
    })()
  }

  function appendMessage(input) {
    const value = validateAgentMessage(input)
    return db.transaction(() => {
      const turn = db.prepare('SELECT conversation_id FROM agent_turns WHERE id = ?').get(value.turnId)
      if (!turn || turn.conversation_id !== value.conversationId) {
        throw new TypeError('Agent message turn does not match its conversation scope')
      }
      const existingRow = db.prepare(`
        SELECT contract_json FROM agent_messages WHERE conversation_id = ? AND idempotency_key = ?
      `).get(value.conversationId, value.idempotencyKey)
      if (existingRow) {
        const existing = validateAgentMessage(parseJson(existingRow.contract_json))
        assertCompatibleIdempotentValue(existing, value, 'Agent message')
        return { inserted: false, item: existing }
      }
      requireNextSequence(db, 'agent_messages', 'message_sequence', value.conversationId, value.sequence, 'message')
      db.prepare(`
        INSERT INTO agent_messages (
          id, conversation_id, turn_id, message_sequence, kind, author_kind, author_id,
          idempotency_key, content_parts_json, contract_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        value.id, value.conversationId, value.turnId, value.sequence, value.kind, value.authorKind,
        value.authorId, value.idempotencyKey, JSON.stringify(value.contentParts), JSON.stringify(value), value.createdAt,
      )
      return { inserted: true, item: value }
    })()
  }

  function enqueueMailbox(input) {
    const value = validateAgentMailboxEntry(input)
    return db.transaction(() => {
      const message = db.prepare('SELECT conversation_id FROM agent_messages WHERE id = ?').get(value.messageId)
      if (!message || message.conversation_id !== value.conversationId) {
        throw new TypeError('Mailbox message does not match its conversation scope')
      }
      if (value.targetTurnId) {
        const turn = db.prepare('SELECT conversation_id FROM agent_turns WHERE id = ?').get(value.targetTurnId)
        if (!turn || turn.conversation_id !== value.conversationId) {
          throw new TypeError('Mailbox target turn does not match its conversation scope')
        }
      }
      const existingRow = db.prepare(`
        SELECT contract_json FROM agent_mailbox_entries WHERE conversation_id = ? AND idempotency_key = ?
      `).get(value.conversationId, value.idempotencyKey)
      if (existingRow) {
        const existing = validateAgentMailboxEntry(parseJson(existingRow.contract_json))
        assertCompatibleIdempotentValue(existing, value, 'Agent mailbox entry')
        return { inserted: false, item: existing }
      }
      requireNextSequence(db, 'agent_mailbox_entries', 'enqueue_sequence', value.conversationId, value.enqueueSequence, 'mailbox')
      db.prepare(`
        INSERT INTO agent_mailbox_entries (
          id, message_id, conversation_id, target_turn_id, enqueue_sequence, delivery_state,
          idempotency_key, contract_json, created_at, delivered_at,
          delivery_lease_id, delivery_lease_expires_at, delivery_attempts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        value.id, value.messageId, value.conversationId, value.targetTurnId, value.enqueueSequence,
        value.deliveryState, value.idempotencyKey, JSON.stringify(value), value.createdAt, value.deliveredAt,
        value.deliveryLeaseId, value.deliveryLeaseExpiresAt, value.deliveryAttempts,
      )
      return { inserted: true, item: value }
    })()
  }

  function enqueueInbound({ turn, message, mailbox }) {
    const turnValue = validateAgentTurn(turn)
    const messageValue = validateAgentMessage(message)
    const mailboxValue = validateAgentMailboxEntry(mailbox)
    if (turnValue.status !== 'pending') throw new TypeError('Inbound conversation turns must begin pending')
    if (messageValue.turnId !== turnValue.id || mailboxValue.messageId !== messageValue.id || mailboxValue.targetTurnId !== turnValue.id) {
      throw new TypeError('Inbound turn, message, and mailbox identities must match')
    }
    return db.transaction(() => {
      const existing = db.prepare(`
        SELECT contract_json FROM agent_turns WHERE conversation_id = ? AND idempotency_key = ?
      `).get(turnValue.conversationId, turnValue.idempotencyKey)
      if (existing) {
        const item = validateAgentTurn(parseJson(existing.contract_json))
        assertCompatibleIdempotentValue(item, turnValue, 'Agent turn')
        const messageExisting = db.prepare(`
          SELECT contract_json FROM agent_messages WHERE conversation_id = ? AND idempotency_key = ?
        `).get(messageValue.conversationId, messageValue.idempotencyKey)
        if (!messageExisting) throw new TypeError('Inbound turn idempotency record is incomplete')
        const messageItem = validateAgentMessage(parseJson(messageExisting.contract_json))
        assertCompatibleIdempotentValue(messageItem, messageValue, 'Agent message')
        const mailboxExisting = db.prepare(`
          SELECT contract_json FROM agent_mailbox_entries WHERE conversation_id = ? AND idempotency_key = ?
        `).get(mailboxValue.conversationId, mailboxValue.idempotencyKey)
        if (!mailboxExisting) throw new TypeError('Inbound turn idempotency record is incomplete')
        const mailboxItem = validateAgentMailboxEntry(parseJson(mailboxExisting.contract_json))
        assertCompatibleIdempotentValue(mailboxItem, mailboxValue, 'Agent mailbox entry')
        return { inserted: false, turn: item, message: messageItem, mailbox: mailboxItem }
      }
      const createdTurn = createTurn(turnValue).item
      const createdMessage = appendMessage(messageValue).item
      const createdMailbox = enqueueMailbox(mailboxValue).item
      const conversation = validateAgentConversation(readContract(db, 'agent_conversations', turnValue.conversationId))
      if (conversation.status !== 'active') {
        const activeConversation = validateAgentConversation({
          ...conversation,
          status: 'active',
          updatedAt: Math.max(conversation.updatedAt, turnValue.createdAt),
        })
        db.prepare(`UPDATE agent_conversations SET status = ?, contract_json = ?, updated_at = ? WHERE id = ?`).run(
          activeConversation.status,
          JSON.stringify(activeConversation),
          activeConversation.updatedAt,
          activeConversation.id,
        )
      }
      return { inserted: true, turn: createdTurn, message: createdMessage, mailbox: createdMailbox }
    })()
  }

  function claimNextMailbox({ conversationId, leaseId, leaseExpiresAt, now = Date.now() } = {}) {
    if (!conversationId || !leaseId || !Number.isFinite(leaseExpiresAt)) throw new TypeError('conversationId, leaseId, and leaseExpiresAt are required')
    return db.transaction(() => {
      recoverExpiredMailboxLeases({ now })
      const active = db.prepare(`
        SELECT id FROM agent_turns
        WHERE conversation_id = ? AND status IN ('queued', 'running', 'waiting') LIMIT 1
      `).get(conversationId)
      if (active) return null
      const existingLease = db.prepare(`
        SELECT id FROM agent_mailbox_entries
        WHERE conversation_id = ? AND delivery_state = 'leased'
        LIMIT 1
      `).get(conversationId)
      if (existingLease) return null
      const row = db.prepare(`
        SELECT id FROM agent_mailbox_entries
        WHERE conversation_id = ? AND delivery_state = 'queued'
        ORDER BY enqueue_sequence ASC LIMIT 1
      `).get(conversationId)
      if (!row) return null
      const mailbox = readMailbox(db, row.id)
      const turn = mailbox?.targetTurnId ? readTurn(db, mailbox.targetTurnId) : null
      if (!mailbox || !turn || turn.status !== 'pending') return null
      const leased = validateAgentMailboxEntry({
        ...mailbox,
        deliveryState: 'leased', deliveredAt: null,
        deliveryLeaseId: leaseId, deliveryLeaseExpiresAt: Math.max(leaseExpiresAt, now),
        deliveryAttempts: mailbox.deliveryAttempts + 1,
      })
      const changes = db.prepare(`
        UPDATE agent_mailbox_entries
        SET delivery_state = ?, delivery_lease_id = ?, delivery_lease_expires_at = ?, delivery_attempts = ?, contract_json = ?
        WHERE id = ? AND delivery_state = 'queued'
      `).run(leased.deliveryState, leased.deliveryLeaseId, leased.deliveryLeaseExpiresAt, leased.deliveryAttempts, JSON.stringify(leased), leased.id).changes
      return changes ? leased : null
    })()
  }

  function commitMailboxClaimWithinTransaction({ mailboxId, leaseId, deliveredAt = Date.now() } = {}) {
      const mailbox = readMailbox(db, mailboxId)
      if (!mailbox || mailbox.deliveryState !== 'leased' || mailbox.deliveryLeaseId !== leaseId) return null
      const turn = readTurn(db, mailbox.targetTurnId)
      if (!turn || turn.status !== 'pending') throw new TypeError('Mailbox claim does not target a pending turn')
      assertNoOtherActiveTurn(db, turn.conversationId, turn.id)
      const queuedTurn = validateAgentTurn({ ...turn, status: 'queued', startedAt: null, finishedAt: null })
      const delivered = validateAgentMailboxEntry({
        ...mailbox, deliveryState: 'delivered', deliveryLeaseId: null, deliveryLeaseExpiresAt: null,
        deliveredAt: Math.max(deliveredAt, mailbox.createdAt),
      })
      db.prepare(`UPDATE agent_turns SET status = ?, contract_json = ?, updated_at = ? WHERE id = ?`).run(
        queuedTurn.status, JSON.stringify(queuedTurn), deliveredAt, queuedTurn.id,
      )
      db.prepare(`
        UPDATE agent_mailbox_entries
        SET delivery_state = ?, delivered_at = ?, delivery_lease_id = NULL, delivery_lease_expires_at = NULL, contract_json = ?
        WHERE id = ? AND delivery_state = 'leased' AND delivery_lease_id = ?
      `).run(delivered.deliveryState, delivered.deliveredAt, JSON.stringify(delivered), delivered.id, leaseId)
      return { mailbox: delivered, turn: queuedTurn }
  }

  function commitMailboxClaim(input) {
    return db.transaction(() => commitMailboxClaimWithinTransaction(input))()
  }

  function failMailboxClaim({ mailboxId, leaseId, failedAt = Date.now() } = {}) {
    return db.transaction(() => {
      const mailbox = readMailbox(db, mailboxId)
      if (!mailbox || mailbox.deliveryState !== 'leased' || mailbox.deliveryLeaseId !== leaseId) return null
      const turn = readTurn(db, mailbox.targetTurnId)
      if (!turn || turn.status !== 'pending') return null
      const failedMailbox = validateAgentMailboxEntry({
        ...mailbox,
        deliveryState: 'failed',
        deliveredAt: null,
        deliveryLeaseId: null,
        deliveryLeaseExpiresAt: null,
      })
      db.prepare(`
        UPDATE agent_mailbox_entries
        SET delivery_state = ?, delivery_lease_id = NULL, delivery_lease_expires_at = NULL,
          contract_json = ?
        WHERE id = ? AND delivery_state = 'leased' AND delivery_lease_id = ?
      `).run(failedMailbox.deliveryState, JSON.stringify(failedMailbox), failedMailbox.id, leaseId)
      const failedTurn = transitionTurn({
        conversationId: turn.conversationId,
        turnId: turn.id,
        status: 'failed',
        now: Math.max(failedAt, turn.createdAt),
      })
      const conversation = validateAgentConversation(readContract(db, 'agent_conversations', turn.conversationId))
      const completedConversation = validateAgentConversation({
        ...conversation,
        status: 'completed',
        updatedAt: Math.max(conversation.updatedAt, failedAt),
      })
      db.prepare(`
        UPDATE agent_conversations SET status = ?, contract_json = ?, updated_at = ? WHERE id = ?
      `).run(
        completedConversation.status,
        JSON.stringify(completedConversation),
        completedConversation.updatedAt,
        completedConversation.id,
      )
      return { conversation: completedConversation, turn: failedTurn, mailbox: failedMailbox }
    })()
  }

  function recoverExpiredMailboxLeases({ now = Date.now() } = {}) {
    return db.transaction(() => db.prepare(`
      SELECT id FROM agent_mailbox_entries
      WHERE delivery_state = 'leased' AND delivery_lease_expires_at <= ?
      ORDER BY conversation_id ASC, enqueue_sequence ASC
    `).all(now).flatMap((row) => {
      const mailbox = readMailbox(db, row.id)
      if (!mailbox) return []
      const queued = validateAgentMailboxEntry({
        ...mailbox, deliveryState: 'queued', deliveredAt: null, deliveryLeaseId: null, deliveryLeaseExpiresAt: null,
      })
      const changes = db.prepare(`
        UPDATE agent_mailbox_entries
        SET delivery_state = 'queued', delivery_lease_id = NULL, delivery_lease_expires_at = NULL, contract_json = ?
        WHERE id = ? AND delivery_state = 'leased' AND delivery_lease_expires_at <= ?
      `).run(JSON.stringify(queued), queued.id, now).changes
      return changes ? [queued.id] : []
    }))()
  }

  function transitionTurn({ conversationId, turnId, status, finalMessageId = undefined, now = Date.now() } = {}) {
    return db.transaction(() => {
      const turn = readTurn(db, turnId)
      if (!turn || turn.conversationId !== conversationId) throw new TypeError('Agent turn does not match its conversation scope')
      if (turn.status !== status && !TURN_TRANSITIONS[turn.status]?.has(status)) {
        if (['completed', 'failed', 'cancelled'].includes(turn.status)) {
          throw new TypeError(`Cannot reopen terminal turn ${turnId}`)
        }
        throw new TypeError(`Invalid agent turn transition: ${turn.status} -> ${status}`)
      }
      if (ACTIVE_TURN_STATUSES.has(status)) assertNoOtherActiveTurn(db, conversationId, turn.id)
      const terminal = ['completed', 'failed', 'cancelled'].includes(status)
      if (finalMessageId !== undefined && finalMessageId !== null) {
        const final = db.prepare('SELECT conversation_id, turn_id, kind FROM agent_messages WHERE id = ?').get(finalMessageId)
        if (!final || final.conversation_id !== conversationId || final.turn_id !== turnId || final.kind !== 'final') {
          throw new TypeError('Final message does not belong to the target turn')
        }
      }
      const next = validateAgentTurn({
        ...turn, status, finalMessageId: finalMessageId === undefined ? turn.finalMessageId : finalMessageId,
        startedAt: status === 'running' ? (turn.startedAt ?? now) : turn.startedAt,
        finishedAt: terminal ? now : null,
      })
      db.prepare(`UPDATE agent_turns SET status = ?, final_message_id = ?, contract_json = ?, updated_at = ? WHERE id = ?`).run(
        next.status, next.finalMessageId, JSON.stringify(next), now, next.id,
      )
      return next
    })()
  }

  function appendFinalForAttempt({ attemptId, text, createdAt = Date.now() } = {}) {
    const binding = db.prepare(`
      SELECT bindings.conversation_id, bindings.turn_id, attempts.node_id
      FROM agent_attempt_turn_bindings AS bindings
      INNER JOIN agent_attempts AS attempts ON attempts.id = bindings.attempt_id
      WHERE bindings.attempt_id = ?
    `).get(attemptId)
    if (!binding) return null
    return db.transaction(() => {
      const existing = db.prepare(`
        SELECT contract_json FROM agent_messages WHERE conversation_id = ? AND idempotency_key = ?
      `).get(binding.conversation_id, `${binding.turn_id}:final:${attemptId}`)
      const message = existing
        ? validateAgentMessage(parseJson(existing.contract_json))
        : appendMessage({
            schemaVersion: 1,
            id: `agent_final:${attemptId}`,
            conversationId: binding.conversation_id,
            turnId: binding.turn_id,
            sequence: Number(db.prepare(`SELECT COALESCE(MAX(message_sequence), 0) + 1 AS next FROM agent_messages WHERE conversation_id = ?`).get(binding.conversation_id).next),
            kind: 'final',
            authorKind: 'agent',
            authorId: binding.node_id,
            sourceConversationId: null,
            sourceTurnId: null,
            idempotencyKey: `${binding.turn_id}:final:${attemptId}`,
            contentParts: [{
              kind: 'markdown',
              text: typeof text === 'string' && text.trim()
                ? text.trim()
                : 'Agent completed without a prose summary.',
            }],
            createdAt,
          }).item
      const turn = transitionTurn({
        conversationId: binding.conversation_id,
        turnId: binding.turn_id,
        status: 'completed',
        finalMessageId: message.id,
        now: createdAt,
      })
      const conversation = validateAgentConversation(readContract(db, 'agent_conversations', binding.conversation_id))
      const completedConversation = validateAgentConversation({ ...conversation, status: 'completed', updatedAt: createdAt })
      db.prepare(`UPDATE agent_conversations SET status = ?, contract_json = ?, updated_at = ? WHERE id = ?`).run(
        completedConversation.status, JSON.stringify(completedConversation), createdAt, completedConversation.id,
      )
      return { conversation: completedConversation, turn, message }
    })()
  }

  function transitionTurnForAttempt({ attemptId, status, now = Date.now() } = {}) {
    const binding = getTurnBindingForAttempt(attemptId)
    if (!binding) return null
    return transitionTurn({
      conversationId: binding.conversationId,
      turnId: binding.turnId,
      status,
      now,
    })
  }

  function closeTurnForAttempt({ attemptId, status, now = Date.now() } = {}) {
    if (!['failed', 'cancelled'].includes(status)) {
      throw new TypeError('Conversation turns may only close as failed or cancelled here')
    }
    const binding = getTurnBindingForAttempt(attemptId)
    if (!binding) return null
    return db.transaction(() => {
      const current = readTurn(db, binding.turnId)
      const turn = ['completed', 'failed', 'cancelled'].includes(current?.status)
        ? current
        : transitionTurn({
            conversationId: binding.conversationId,
            turnId: binding.turnId,
            status,
            now,
          })
      const conversation = validateAgentConversation(readContract(
        db, 'agent_conversations', binding.conversationId,
      ))
      const completed = validateAgentConversation({
        ...conversation,
        status: 'completed',
        updatedAt: Math.max(conversation.updatedAt, now),
      })
      db.prepare(`UPDATE agent_conversations SET status = ?, contract_json = ?, updated_at = ? WHERE id = ?`).run(
        completed.status, JSON.stringify(completed), completed.updatedAt, completed.id,
      )
      return { conversation: completed, turn }
    })()
  }

  function getTurnBindingForAttempt(attemptId) {
    const row = db.prepare(`
      SELECT conversation_id, turn_id FROM agent_attempt_turn_bindings WHERE attempt_id = ?
    `).get(attemptId)
    return row ? { conversationId: row.conversation_id, turnId: row.turn_id } : null
  }

  function getConversationBindingForNode(nodeId) {
    const row = db.prepare(`
      SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?
    `).get(nodeId)
    return row ? { conversationId: row.conversation_id } : null
  }

  function createPromotionSnapshot(input) {
    const value = validateAgentPromotionSnapshot(input)
    return db.transaction(() => {
      const turn = db.prepare('SELECT conversation_id FROM agent_turns WHERE id = ?').get(value.sourceTurnId)
      if (!turn || turn.conversation_id !== value.sourceConversationId) {
        throw new TypeError('Promotion source turn does not match its conversation scope')
      }
      const conversation = db.prepare(`
        SELECT project_id, root_thread_id FROM agent_conversations WHERE id = ?
      `).get(value.sourceConversationId)
      if (!conversation
        || conversation.project_id !== value.sourceRoute.projectId
        || conversation.root_thread_id !== value.sourceRoute.threadId) {
        throw new TypeError('Promotion source route does not match its conversation scope')
      }
      const nodeBinding = db.prepare(`
        SELECT run_id FROM agent_node_conversation_bindings
        WHERE node_id = ? AND conversation_id = ?
      `).get(value.sourceRoute.nodeId, value.sourceConversationId)
      if (!nodeBinding || nodeBinding.run_id !== value.sourceRoute.runId) {
        throw new TypeError('Promotion source node does not match its conversation scope')
      }
      if (value.content.messages.some((entry) => entry.conversationId !== value.sourceConversationId)) {
        throw new TypeError('Promotion messages must belong to the source conversation')
      }
      const existingRow = db.prepare(`
        SELECT contract_json FROM agent_promotion_snapshots WHERE idempotency_key = ?
      `).get(value.idempotencyKey)
      if (existingRow) {
        const existing = validateAgentPromotionSnapshot(parseJson(existingRow.contract_json))
        assertCompatibleIdempotentValue(existing, value, 'Agent promotion snapshot')
        return { inserted: false, item: existing }
      }
      db.prepare(`
        INSERT INTO agent_promotion_snapshots (
          id, source_conversation_id, source_turn_id, source_sequence,
          idempotency_key, contract_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        value.id, value.sourceConversationId, value.sourceTurnId, value.sourceSequence,
        value.idempotencyKey, JSON.stringify(value), value.createdAt,
      )
      return { inserted: true, item: value }
    })()
  }

  function bindNode({ nodeId, conversationId, createdAt = Date.now() } = {}) {
    const node = readNodeScope(db, nodeId)
    if (!node) throw new TypeError(`Agent node ${nodeId} was not found`)
    if (node.conversation_id && node.conversation_id !== conversationId) {
      throw new TypeError(`Agent node ${nodeId} is already bound to another conversation`)
    }
    const conversation = readContract(db, 'agent_conversations', conversationId)
    if (!conversation) throw new TypeError(`Agent conversation ${conversationId} was not found`)
    assertConversationMatchesNodeScope(conversation, node)
    if (!node.conversation_id) {
      db.prepare(`
        INSERT INTO agent_node_conversation_bindings (node_id, run_id, conversation_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(nodeId, node.run_id, conversationId, createdAt)
    }
  }

  function bindAttempt({ attemptId, turnId, createdAt = Date.now() } = {}) {
    const attempt = db.prepare(`
      SELECT attempts.node_id, bindings.turn_id AS bound_turn_id,
        node_bindings.conversation_id AS node_conversation_id
      FROM agent_attempts AS attempts
      LEFT JOIN agent_attempt_turn_bindings AS bindings ON bindings.attempt_id = attempts.id
      LEFT JOIN agent_node_conversation_bindings AS node_bindings ON node_bindings.node_id = attempts.node_id
      WHERE attempts.id = ?
    `).get(attemptId)
    if (!attempt) throw new TypeError(`Agent attempt ${attemptId} was not found`)
    if (attempt.bound_turn_id && attempt.bound_turn_id !== turnId) {
      throw new TypeError(`Agent attempt ${attemptId} is already bound to another turn`)
    }
    const turn = db.prepare('SELECT conversation_id FROM agent_turns WHERE id = ?').get(turnId)
    if (!turn) throw new TypeError(`Agent turn ${turnId} was not found`)
    if (!attempt.node_conversation_id || attempt.node_conversation_id !== turn.conversation_id) {
      throw new TypeError('Agent attempt and turn do not share the same conversation scope')
    }
    if (!attempt.bound_turn_id) {
      db.prepare(`
        INSERT INTO agent_attempt_turn_bindings (
          attempt_id, node_id, conversation_id, turn_id, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(attemptId, attempt.node_id, turn.conversation_id, turnId, createdAt)
    }
  }

  function getConversationProjection(conversationId) {
    const conversation = readContract(db, 'agent_conversations', conversationId)
    if (!conversation) return null
    const executionByTurn = new Map(db.prepare(`
      SELECT bindings.turn_id, bindings.node_id, attempts.run_id,
        bindings.attempt_id, attempts.attempt_number
      FROM agent_attempt_turn_bindings AS bindings
      INNER JOIN agent_attempts AS attempts ON attempts.id = bindings.attempt_id
      WHERE bindings.conversation_id = ?
      ORDER BY attempts.attempt_number ASC, bindings.created_at ASC
    `).all(conversationId).map((row) => [row.turn_id, {
      executionNodeId: row.node_id,
      executionRunId: row.run_id,
      executionAttemptId: row.attempt_id,
    }]))
    const turns = db.prepare('SELECT contract_json FROM agent_turns WHERE conversation_id = ? ORDER BY turn_sequence ASC').all(conversationId)
      .map((row) => projectTurn(validateAgentTurn(parseJson(row.contract_json))))
      .map((turn) => ({ ...turn, ...(executionByTurn.get(turn.id) || {}) }))
    const messages = db.prepare('SELECT contract_json FROM agent_messages WHERE conversation_id = ? ORDER BY message_sequence ASC').all(conversationId)
      .map((row) => projectMessage(validateAgentMessage(parseJson(row.contract_json))))
    const mailbox = db.prepare('SELECT contract_json FROM agent_mailbox_entries WHERE conversation_id = ? ORDER BY enqueue_sequence ASC').all(conversationId)
      .map((row) => projectMailbox(validateAgentMailboxEntry(parseJson(row.contract_json))))
    return { schemaVersion: 1, conversation: projectConversation(validateAgentConversation(conversation)), turns, messages, mailbox }
  }

  return Object.freeze({
    appendMessage,
    appendFinalForAttempt,
    closeTurnForAttempt,
    bindAttempt,
    bindNode,
    createConversation,
    enqueueInbound,
    createPromotionSnapshot,
    createTurn,
    enqueueMailbox,
    claimNextMailbox,
    commitMailboxClaim,
    commitMailboxClaimWithinTransaction,
    failMailboxClaim,
    recoverExpiredMailboxLeases,
    transitionTurn,
    transitionTurnForAttempt,
    getConversationProjection,
    getConversationBindingForNode,
    getTurnBindingForAttempt,
    getMigrationExpectation: () => ({ ...MIGRATION_EXPECTATION }),
  })
}
