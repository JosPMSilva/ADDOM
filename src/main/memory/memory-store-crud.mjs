import crypto from 'node:crypto'
import path from 'node:path'
import { getDb } from './db.mjs'
import { embedder } from './embedder.mjs'
import {
  buildDeletedThreadVisibilityClause,
  sortAndFilterMemoryNodes,
} from './list-visibility.mjs'
import {
  GLOBAL_MEMORY_PROJECT_KEY,
  TERMINAL_SUMMARY_TAG_PREFIXES,
  buildActiveNodeClause,
  buildDurableSourceClause,
  buildScopedNodeClause,
  escapeSqlLikePattern,
  isGlobalProjectKey,
  normalizeMemoryConfidence,
  normalizeMemoryDurability,
  normalizeMemoryScope,
  normalizeMemorySource,
  normalizeNullableText,
  normalizeProjectKey,
  normalizeTags,
  normalizeTerminalAcceptedAt,
  now,
  rowToNode,
  vecToBuffer,
} from './memory-store-helpers.mjs'

function nanoid() {
  return crypto.randomUUID()
}

function nextSortId(db, project) {
  const row = db.prepare(
    'SELECT COALESCE(MAX(sort_id), 0) + 1 AS nextId FROM nodes WHERE project = ?'
  ).get(normalizeProjectKey(project))
  return Number(row?.nextId || 1)
}

function resolveOriginSnapshot(db, project, originThreadId = null) {
  const projectKey = normalizeProjectKey(project)
  let projectRow = projectKey
    ? db.prepare('SELECT id, name, path FROM workspace_projects WHERE path = ?').get(projectKey)
    : null
  if (!projectRow && path.isAbsolute(projectKey)) {
    projectRow = db.prepare('SELECT id, name, path FROM workspace_projects WHERE path = ?').get(path.resolve(projectKey))
  }
  const normalizedOriginThreadId = normalizeNullableText(originThreadId)
  const threadRow = normalizedOriginThreadId
    ? db.prepare('SELECT title FROM chat_threads WHERE id = ?').get(normalizedOriginThreadId)
    : null
  return {
    originThreadTitle: String(threadRow?.title || ''),
    originProjectId: normalizeNullableText(projectRow?.id),
    originProjectName: String(projectRow?.name || ''),
    originProjectPath: String(projectRow?.path || projectKey || ''),
  }
}

export async function addNode({
  project,
  topic,
  content,
  tags = [],
  source = 'user_memory',
  dataPolicy = 'standard',
  scope,
  threadId = null,
  originThreadId = null,
  durability = 'standard',
  confidence = 0.5,
  isGlobal = false,
  promotedAt = null,
}) {
  const db = getDb()
  const id = nanoid()
  const ts = now()
  const normalizedScope = normalizeMemoryScope(scope, { isGlobal })
  const projectKey = normalizedScope === 'global'
    ? GLOBAL_MEMORY_PROJECT_KEY
    : normalizeProjectKey(project)
  const sortId = nextSortId(db, projectKey)
  const normalizedTags = normalizeTags(tags)
  const normalizedSource = normalizeMemorySource(source, normalizedTags)
  const normalizedThreadId = normalizeNullableText(threadId)
  const normalizedOriginThreadId = normalizeNullableText(originThreadId)
    || (normalizedScope === 'thread' ? normalizedThreadId : null)
  const originSnapshot = resolveOriginSnapshot(db, project, normalizedOriginThreadId)
  const normalizedDurability = normalizeMemoryDurability(durability)
  const normalizedConfidence = normalizeMemoryConfidence(confidence)
  const normalizedPromotedAt = normalizeTerminalAcceptedAt(promotedAt)

  db.prepare(`
    INSERT INTO nodes (
      id, sort_id, project, scope, thread_id, origin_thread_id,
      origin_thread_title, origin_thread_state, origin_thread_deleted_at,
      origin_project_id, origin_project_name, origin_project_path,
      origin_project_state, origin_project_removed_at,
      topic, content, tags, pinned, data_policy, source, durability, confidence,
      compressed, compressed_into, promoted_at, invalidated_at, superseded_by,
      created_at, updated_at, access_count, last_accessed, last_used_at, embedding
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, 'active', NULL,
            ?, ?, ?, 0, ?, ?, ?, ?, 0, NULL, ?, NULL, NULL, ?, ?, 1, ?, ?, NULL)
  `).run(
    id,
    sortId,
    projectKey,
    normalizedScope,
    normalizedThreadId,
    normalizedOriginThreadId,
    originSnapshot.originThreadTitle,
    originSnapshot.originProjectId,
    originSnapshot.originProjectName,
    originSnapshot.originProjectPath,
    topic || '',
    content,
    JSON.stringify(normalizedTags),
    dataPolicy,
    normalizedSource,
    normalizedDurability,
    normalizedConfidence,
    normalizedPromotedAt,
    ts,
    ts,
    ts,
    ts,
  )

  const textToEmbed = `${topic} ${content}`.trim()
  const doEmbed = () => embedder.embed(textToEmbed)
    .then((vec) => {
      db.prepare('UPDATE nodes SET embedding = ? WHERE id = ?').run(vecToBuffer(vec), id)
    })
  doEmbed().catch(() => {
    setTimeout(() => {
      doEmbed().catch(() => { })
    }, 5000)
  })

  return id
}

export async function updateNode(id, { topic, content, tags, pinned, dataPolicy }) {
  const db = getDb()
  const ts = now()
  const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id)
  if (!row) throw new Error(`Node not found: ${id}`)

  db.prepare(`
    UPDATE nodes SET
      topic       = ?,
      content     = ?,
      tags        = ?,
      pinned      = ?,
      data_policy = ?,
      updated_at  = ?,
      embedding   = NULL
    WHERE id = ?
  `).run(
    topic ?? row.topic,
    content ?? row.content,
    JSON.stringify(tags ?? JSON.parse(row.tags || '[]')),
    pinned !== undefined ? (pinned ? 1 : 0) : row.pinned,
    dataPolicy ?? row.data_policy,
    ts,
    id,
  )

  const updated = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id)
  const text = `${updated.topic} ${updated.content}`.trim()
  const doUpdateEmbed = () => embedder.embed(text)
    .then((vec) => {
      db.prepare('UPDATE nodes SET embedding = ? WHERE id = ?').run(vecToBuffer(vec), id)
    })
  doUpdateEmbed().catch(() => {
    setTimeout(() => {
      doUpdateEmbed().catch(() => { })
    }, 5000)
  })
}

export function getNode(id) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(String(id || '').trim())
  return rowToNode(row)
}

function requireExistingNodeRow(db, id) {
  const normalizedId = String(id || '').trim()
  const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(normalizedId)
  if (!row) throw new Error(`Node not found: ${normalizedId}`)
  return row
}

function resolveScopeMutationProjectKey(node, targetScope, project = '') {
  if (targetScope === 'global') return GLOBAL_MEMORY_PROJECT_KEY
  const normalizedProject = normalizeProjectKey(project)
  if (normalizedProject) return normalizedProject
  const currentProjectKey = normalizeProjectKey(node?.projectKey)
  if (currentProjectKey && !isGlobalProjectKey(currentProjectKey)) return currentProjectKey
  throw new Error('project is required')
}

function resolveScopeMutationOriginThreadId(node, originThreadId, fallbackThreadId = null) {
  return normalizeNullableText(originThreadId)
    || normalizeNullableText(node?.originThreadId)
    || normalizeNullableText(node?.threadId)
    || normalizeNullableText(fallbackThreadId)
    || null
}

function mutateNodeScope(id, {
  targetScope,
  project = '',
  threadId = null,
  originThreadId = null,
  promotedAt,
} = {}) {
  const db = getDb()
  const row = requireExistingNodeRow(db, id)
  const node = rowToNode(row)
  const normalizedTargetScope = normalizeMemoryScope(targetScope)
  const nextProjectKey = resolveScopeMutationProjectKey(node, normalizedTargetScope, project)
  const nextThreadId = normalizedTargetScope === 'thread'
    ? normalizeNullableText(threadId)
      || normalizeNullableText(node?.threadId)
      || normalizeNullableText(node?.originThreadId)
    : null
  if (normalizedTargetScope === 'thread' && !nextThreadId) {
    throw new Error('threadId is required when targetScope is thread')
  }
  const nextOriginThreadId = resolveScopeMutationOriginThreadId(node, originThreadId, nextThreadId)
  const originSnapshot = resolveOriginSnapshot(db, node?.originProjectPath || node?.projectKey, nextOriginThreadId)
  const currentProjectKey = normalizeProjectKey(node?.projectKey)
  const nextSortIdValue = nextProjectKey !== currentProjectKey
    ? nextSortId(db, nextProjectKey)
    : Number(row?.sort_id || 0) || nextSortId(db, nextProjectKey)
  const ts = now()

  db.prepare(`
    UPDATE nodes
    SET project = ?,
        scope = ?,
        thread_id = ?,
        origin_thread_id = ?,
        origin_thread_title = CASE WHEN TRIM(origin_thread_title) = '' THEN ? ELSE origin_thread_title END,
        origin_project_id = COALESCE(origin_project_id, ?),
        origin_project_name = CASE WHEN TRIM(origin_project_name) = '' THEN ? ELSE origin_project_name END,
        origin_project_path = CASE WHEN TRIM(origin_project_path) = '' THEN ? ELSE origin_project_path END,
        sort_id = ?,
        promoted_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    nextProjectKey,
    normalizedTargetScope,
    nextThreadId,
    nextOriginThreadId,
    originSnapshot.originThreadTitle,
    originSnapshot.originProjectId,
    originSnapshot.originProjectName,
    originSnapshot.originProjectPath,
    nextSortIdValue,
    promotedAt === undefined ? row.promoted_at : promotedAt,
    ts,
    String(id || '').trim(),
  )

  return getNode(id)
}

export function promoteNode(id, {
  targetScope = 'project',
  project = '',
  threadId = null,
  originThreadId = null,
} = {}) {
  const normalizedTargetScope = normalizeMemoryScope(targetScope)
  if (normalizedTargetScope === 'thread') {
    throw new Error('targetScope must be project or global')
  }
  return mutateNodeScope(id, {
    targetScope: normalizedTargetScope,
    project,
    threadId,
    originThreadId,
    promotedAt: now(),
  })
}

export function demoteNode(id, {
  targetScope = 'thread',
  project = '',
  threadId = null,
  originThreadId = null,
} = {}) {
  const normalizedTargetScope = normalizeMemoryScope(targetScope)
  if (normalizedTargetScope === 'global') {
    throw new Error('targetScope must be thread or project')
  }
  return mutateNodeScope(id, {
    targetScope: normalizedTargetScope,
    project,
    threadId,
    originThreadId,
  })
}

export function invalidateNode(id, {
  supersededBy,
} = {}) {
  const db = getDb()
  const row = requireExistingNodeRow(db, id)
  const ts = now()
  db.prepare(`
    UPDATE nodes
    SET invalidated_at = ?,
        superseded_by = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    ts,
    supersededBy === undefined ? row.superseded_by : normalizeNullableText(supersededBy),
    ts,
    String(id || '').trim(),
  )
  return getNode(id)
}

export function deleteNode(id, force = false) {
  const db = getDb()
  const row = db.prepare('SELECT data_policy FROM nodes WHERE id = ?').get(id)
  if (!row) return false
  if (row.data_policy === 'preserve' && !force) {
    throw new Error('This node is protected (dataPolicy=preserve). Use force=true to delete.')
  }
  db.prepare('DELETE FROM nodes WHERE id = ?').run(id)
  return true
}

export function clearNodes(project = null) {
  const db = getDb()

  if (project && String(project).trim()) {
    const result = db.prepare('DELETE FROM nodes WHERE project = ?').run(normalizeProjectKey(project))
    return Number(result.changes || 0)
  }

  const result = db.prepare('DELETE FROM nodes').run()
  return Number(result.changes || 0)
}

export function listNodes(project, {
  includeCompressed = false,
  includeDeletedThreads = false,
  includeGlobal = false,
  includeProject = true,
  globalOnly = false,
  scopeFilter = '',
  threadId = '',
} = {}) {
  const db = getDb()
  const scoped = buildScopedNodeClause(project, {
    scopeFilter,
    threadId,
    includeThread: true,
    includeProject,
    includeGlobal: !!includeGlobal,
    forceGlobalOnly: !!globalOnly,
  })
  const normalizedScopeFilter = String(scopeFilter || '').trim().toLowerCase()
  const shouldAppendDeletedArchive = includeDeletedThreads
    && normalizedScopeFilter !== 'project'
    && normalizedScopeFilter !== 'global'
  const clause = shouldAppendDeletedArchive
    ? `(${scoped.clause} OR (project = ? AND scope = 'thread' AND origin_thread_state = 'deleted'))`
    : scoped.clause
  const args = shouldAppendDeletedArchive
    ? [...scoped.args, normalizeProjectKey(project)]
    : scoped.args
  const durable = buildDurableSourceClause()
  const deletedThreadVisibility = buildDeletedThreadVisibilityClause({ includeDeletedThreads })
  const rows = db.prepare(`
    SELECT * FROM nodes
    WHERE ${clause} AND ${durable.clause} AND ${deletedThreadVisibility}
  `).all(...args, ...durable.args)
  const mapped = rows.map(rowToNode)
  return sortAndFilterMemoryNodes(mapped, {
    includeCompressed: !!includeCompressed,
    includeDeletedThreads: !!includeDeletedThreads,
  })
}

export function findTerminalSummaryNodeBySessionId(project = '', sessionId = '', options = {}) {
  const normalizedProject = normalizeProjectKey(project)
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) return null
  const db = getDb()
  const active = buildActiveNodeClause()
  const normalizedScope = String(options.scope || '').trim().toLowerCase()
  const normalizedThreadId = normalizeNullableText(options.threadId)
  let scopeClause = ''
  const args = [
    normalizedProject,
    `%"${escapeSqlLikePattern(TERMINAL_SUMMARY_TAG_PREFIXES.sessionId + normalizedSessionId)}"%`,
  ]
  if (normalizedScope === 'thread') {
    if (!normalizedThreadId) return null
    scopeClause = ' AND scope = ? AND thread_id = ?'
    args.push('thread', normalizedThreadId)
  } else if (normalizedScope === 'project') {
    scopeClause = ' AND scope = ?'
    args.push('project')
  }
  const row = db.prepare(`
    SELECT *
    FROM nodes
    WHERE project = ?
      AND source = 'terminal_summary'
      AND ${active.clause}
      AND tags LIKE ? ESCAPE '\\'${scopeClause}
    ORDER BY updated_at DESC, sort_id DESC
    LIMIT 1
  `).get(...args)
  return rowToNode(row)
}
