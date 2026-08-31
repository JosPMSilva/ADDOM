import {
  MAX_THREAD_TITLE_CHARS,
  getProjectByIdInternal,
  mapProjectRow,
  mapThreadRow,
  safeMetaJson,
  trimString,
} from './workspace-store-utils.mjs'

function messageText(message = {}) {
  return (Array.isArray(message.contentParts) ? message.contentParts : [])
    .map((part) => {
      if (typeof part?.text === 'string') return part.text
      if (part?.kind === 'link') return `[${String(part.label || '')}](${String(part.href || '')})`
      if ((part?.kind === 'file' || part?.kind === 'image') && typeof part?.label === 'string') return part.label
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function rootRole(message = {}) {
  if (message.authorKind === 'user' || message.authorKind === 'orchestrator') return 'user'
  if (message.authorKind === 'agent') return 'assistant'
  return ''
}

function importedFinalDocument(message = {}, threadId, turnId) {
  if (message.kind !== 'final') return null
  const parts = (Array.isArray(message.contentParts) ? message.contentParts : [])
    .filter((part) => typeof part?.text === 'string' && part.text.length > 0)
    .map((part, index) => ({
      kind: part.kind || 'markdown',
      text: part.text,
      partId: part.partId || `${message.id}:promotion:${index + 1}`,
      appendOrder: Number(part.appendOrder || 0) || index + 1,
      status: part.status || 'completed',
    }))
  if (parts.length === 0) return null
  return {
    schemaVersion: 1,
    threadId,
    turnId,
    messageId: message.id,
    ownership: 'final-document',
    text: parts.map((part) => part.text).join(''),
    parts,
  }
}

function sourceIsAvailable(db, sourceRoute = {}, conversationId = '') {
  return Boolean(db.prepare(`
    SELECT 1
    FROM agent_node_conversation_bindings AS bindings
    INNER JOIN agent_conversations AS conversations ON conversations.id = bindings.conversation_id
    INNER JOIN agent_runs AS runs ON runs.id = bindings.run_id
    INNER JOIN agent_nodes AS nodes ON nodes.id = bindings.node_id AND nodes.run_id = bindings.run_id
    WHERE bindings.conversation_id = ? AND bindings.run_id = ? AND bindings.node_id = ?
      AND conversations.project_id = ? AND conversations.root_thread_id = ?
  `).get(
    conversationId, sourceRoute.runId, sourceRoute.nodeId,
    sourceRoute.projectId, sourceRoute.threadId,
  ))
}

function promotionOrigin(db, snapshot = {}) {
  const sourceRoute = { ...snapshot.sourceRoute }
  return {
    kind: 'agent_promotion',
    snapshotId: snapshot.id,
    sourceConversationId: snapshot.sourceConversationId,
    sourceTurnId: snapshot.sourceTurnId,
    sourceSequence: Number(snapshot.sourceSequence || 0),
    sourceRoleId: snapshot.sourceRoleId,
    sourceRoleLabel: snapshot.sourceRoleLabel || snapshot.sourceRoleId,
    sourceRoute,
    providerProvenance: { ...snapshot.providerProvenance },
    artifactCount: snapshot.content?.artifacts?.length || 0,
    toolResultCount: snapshot.content?.toolResults?.length || 0,
    sourceAvailable: sourceIsAvailable(db, sourceRoute, snapshot.sourceConversationId),
  }
}

function promotedThread(db, row, snapshot) {
  return { ...mapThreadRow(row), origin: promotionOrigin(db, snapshot) }
}

export function createPromotedProjectThread({
  db,
  projectId,
  snapshot,
  title = '',
  now = Date.now,
  idFactory = () => `thread_${Date.now()}`,
} = {}) {
  if (!db) throw new TypeError('db is required')
  const pid = String(projectId || '').trim()
  const snapshotId = String(snapshot?.id || '').trim()
  if (!pid || !snapshotId) throw new TypeError('projectId and promotion snapshot are required')
  return db.transaction(() => {
    const existing = db.prepare(`
      SELECT threads.* FROM project_thread_origins AS origins
      INNER JOIN chat_threads AS threads ON threads.id = origins.thread_id
      WHERE origins.snapshot_id = ?
    `).get(snapshotId)
    if (existing) {
      if (existing.project_id !== pid) throw new TypeError('Promotion snapshot is already bound to another project')
      return {
        project: mapProjectRow(getProjectByIdInternal(db, pid)),
        thread: promotedThread(db, existing, snapshot),
        recovered: true,
      }
    }
    const project = getProjectByIdInternal(db, pid)
    if (!project) throw new TypeError('Project not found')
    if (snapshot.sourceRoute?.projectId !== pid) throw new TypeError('Promotion snapshot belongs to another project')
    const createdAt = Number(now())
    const threadId = String(idFactory('thread') || '').trim()
    if (!threadId) throw new TypeError('thread id is required')
    const cleanTitle = trimString(
      String(title || '').trim() || `Continue: ${String(snapshot.sourceRoleLabel || snapshot.sourceRoleId || 'agent')}`,
      MAX_THREAD_TITLE_CHARS,
    )
    db.prepare(`
      INSERT INTO chat_threads (id, project_id, title, last_provider, last_model, created_at, updated_at, last_viewed_at, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      threadId, pid, cleanTitle, String(project.last_provider || ''), String(project.last_model || ''),
      createdAt, createdAt, createdAt,
    )
    db.prepare(`
      INSERT INTO project_thread_origins (
        thread_id, snapshot_id, source_conversation_id, source_turn_id, source_sequence,
        source_role_id, source_project_id, source_thread_id, source_run_id, source_node_id,
        provider_provenance_json, authority_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      threadId, snapshotId, snapshot.sourceConversationId, snapshot.sourceTurnId,
      snapshot.sourceSequence, snapshot.sourceRoleId, snapshot.sourceRoute.projectId,
      snapshot.sourceRoute.threadId, snapshot.sourceRoute.runId, snapshot.sourceRoute.nodeId,
      safeMetaJson(snapshot.providerProvenance), safeMetaJson(snapshot.authority), createdAt,
    )
    const insertEvent = db.prepare(`
      INSERT INTO chat_events (thread_id, turn_id, kind, role, content, meta_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const sourceMeta = {
      importedReadOnly: true,
      promotionSnapshotId: snapshotId,
      promotionOrigin: promotionOrigin(db, snapshot),
    }
    let index = 1
    for (const message of snapshot.content?.messages || []) {
      const role = rootRole(message)
      const content = messageText(message)
      if (!role || !content) continue
      const importedTurnId = `promotion:${snapshotId}:${message.turnId}`
      const finalDocument = importedFinalDocument(message, threadId, importedTurnId)
      insertEvent.run(
        threadId,
        importedTurnId,
        role === 'user' ? 'user_message' : 'assistant_message',
        role,
        content,
        safeMetaJson({
          ...sourceMeta,
          importedMessageId: message.id,
          importedAuthorKind: message.authorKind,
          contentParts: message.contentParts,
          ...(finalDocument ? { assistantMessageId: message.id, finalDocument } : {}),
        }),
        createdAt + index,
      )
      index += 1
    }
    const updatedAt = createdAt + index
    db.prepare('UPDATE chat_threads SET updated_at = ? WHERE id = ?').run(updatedAt, threadId)
    db.prepare(`
      UPDATE workspace_projects
      SET active_thread_id = ?, last_opened_at = ?, last_worked_at = ?
      WHERE id = ?
    `).run(threadId, updatedAt, updatedAt, pid)
    const row = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(threadId)
    return {
      project: mapProjectRow(getProjectByIdInternal(db, pid)),
      thread: promotedThread(db, row, snapshot),
      recovered: false,
    }
  })()
}
