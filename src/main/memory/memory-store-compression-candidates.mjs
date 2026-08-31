import { getDb } from './db.mjs'
import {
  COMPRESSIBLE_MEMORY_SOURCE_SET,
  buildActiveNodeClause,
  normalizeNullableText,
  normalizeProjectKey,
  now,
  rowToNode,
} from './memory-store-helpers.mjs'

function resolveCompressionScopeOptions(options = {}) {
  const normalizedThreadId = normalizeNullableText(options.threadId)
  let normalizedScope = String(options.scope || '').trim().toLowerCase()
  if (normalizedScope !== 'thread' && normalizedScope !== 'project') {
    normalizedScope = normalizedThreadId ? 'thread' : 'project'
  }
  return {
    scope: normalizedScope,
    threadId: normalizedThreadId,
  }
}

function buildCompressionCandidateScopeClause(project, options = {}) {
  const normalizedProject = normalizeProjectKey(project)
  const resolved = resolveCompressionScopeOptions(options)
  if (resolved.scope === 'thread') {
    if (!resolved.threadId) return { clause: '1 = 0', args: [], scope: 'thread', threadId: null }
    return {
      clause: 'project = ? AND scope = ? AND thread_id = ?',
      args: [normalizedProject, 'thread', resolved.threadId],
      scope: 'thread',
      threadId: resolved.threadId,
    }
  }
  return {
    clause: 'project = ? AND scope = ?',
    args: [normalizedProject, 'project'],
    scope: 'project',
    threadId: null,
  }
}

export function listCompressionCandidates(project, limit = 200, options = {}) {
  const db = getDb()
  const placeholders = Array.from(COMPRESSIBLE_MEMORY_SOURCE_SET).map(() => '?').join(', ')
  const { clause, args } = buildCompressionCandidateScopeClause(project, options)
  const active = buildActiveNodeClause()
  return db.prepare(`
    SELECT *
    FROM nodes
    WHERE ${clause}
      AND ${active.clause}
      AND source IN (${placeholders})
      AND compressed = 0
      AND pinned = 0
      AND data_policy = 'standard'
    ORDER BY sort_id ASC
    LIMIT ?
  `).all(
    ...args,
    ...active.args,
    ...Array.from(COMPRESSIBLE_MEMORY_SOURCE_SET),
    Math.max(1, Math.round(limit || 1)),
  ).map(rowToNode)
}

export function getCompressionCandidateStats(project, options = {}) {
  const db = getDb()
  const placeholders = Array.from(COMPRESSIBLE_MEMORY_SOURCE_SET).map(() => '?').join(', ')
  const { clause, args } = buildCompressionCandidateScopeClause(project, options)
  const active = buildActiveNodeClause()
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      MIN(sort_id) AS min_sort_id,
      MAX(sort_id) AS max_sort_id
    FROM nodes
    WHERE ${clause}
      AND ${active.clause}
      AND source IN (${placeholders})
      AND compressed = 0
      AND pinned = 0
      AND data_policy = 'standard'
  `).get(...args, ...active.args, ...Array.from(COMPRESSIBLE_MEMORY_SOURCE_SET))

  return {
    totalCount: Number(row?.total_count || 0),
    oldestSortId: Number(row?.min_sort_id || 0),
    newestSortId: Number(row?.max_sort_id || 0),
  }
}

export function markNodesCompressed(nodeIds, summaryNodeId) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0 || !summaryNodeId) return 0
  const db = getDb()
  const ts = now()
  const placeholders = nodeIds.map(() => '?').join(',')
  const stmt = db.prepare(`
    UPDATE nodes
    SET compressed = 1,
        compressed_into = ?,
        updated_at = ?
    WHERE id IN (${placeholders})
  `)
  const result = stmt.run(summaryNodeId, ts, ...nodeIds)
  return Number(result.changes || 0)
}
