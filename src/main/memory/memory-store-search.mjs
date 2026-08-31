import { getDb } from './db.mjs'
import { embedder } from './embedder.mjs'
import { buildDeletedThreadVisibilityClause } from './list-visibility.mjs'
import {
  TERMINAL_SUMMARY_MAX_SEARCH_TEXT_CHARS,
  TERMINAL_SUMMARY_SEARCH_SCORE_MULTIPLIER,
  accessScore,
  bufferToVec,
  buildActiveNodeClause,
  buildDurableSourceClause,
  buildScopedNodeClause,
  cosine,
  normalizeStoredSource,
  normalizeProjectKey,
  now,
  recencyScore,
  rowToNode,
} from './memory-store-helpers.mjs'

function normalizeCandidateCap(value, fallback = 1500) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(100, Math.min(10_000, Math.round(n)))
}

function buildSearchableText(row = null) {
  const topic = String(row?.topic || '')
  const content = String(row?.content || '')
  if (normalizeStoredSource(row?.source) === 'terminal_summary') {
    return `${topic} ${content.slice(0, TERMINAL_SUMMARY_MAX_SEARCH_TEXT_CHARS)}`.toLowerCase()
  }
  return `${topic} ${content}`.toLowerCase()
}

function getSourceSearchScoreMultiplier(source = '') {
  return normalizeStoredSource(source) === 'terminal_summary'
    ? TERMINAL_SUMMARY_SEARCH_SCORE_MULTIPLIER
    : 1
}

function buildScopedSearchClause(project, {
  includeDeletedThreads = false,
  scopeFilter = '',
  threadId = '',
  includeThread = false,
  includeProject = true,
  includeGlobal = false,
} = {}) {
  const scoped = buildScopedNodeClause(project, {
    scopeFilter,
    threadId,
    includeThread,
    includeProject,
    includeGlobal,
  })
  const normalizedScopeFilter = String(scopeFilter || '').trim().toLowerCase()
  if (!includeDeletedThreads || normalizedScopeFilter === 'project' || normalizedScopeFilter === 'global') {
    return scoped
  }
  return {
    clause: `(${scoped.clause} OR (project = ? AND scope = 'thread' AND origin_thread_state = 'deleted'))`,
    args: [...scoped.args, normalizeProjectKey(project)],
  }
}

function collectSearchCandidates(db, project, {
  includeCompressed = false,
  includeDeletedThreads = false,
  includeGlobal = false,
  includeThread = false,
  includeProject = true,
  scopeFilter = '',
  threadId = '',
  queryLower = '',
  candidateCap = 1500,
} = {}) {
  const { clause, args } = buildScopedSearchClause(project, {
    includeDeletedThreads,
    scopeFilter,
    threadId,
    includeThread,
    includeProject,
    includeGlobal: !!includeGlobal,
  })
  const durable = buildDurableSourceClause()
  const active = buildActiveNodeClause()
  const deletedThreadVisibility = buildDeletedThreadVisibilityClause({ includeDeletedThreads })
  const cap = normalizeCandidateCap(candidateCap, 1500)
  const rowsById = new Map()

  const pinnedRows = includeCompressed
    ? db.prepare(`SELECT * FROM nodes WHERE ${clause} AND ${active.clause} AND ${durable.clause} AND ${deletedThreadVisibility} AND pinned = 1`).all(...args, ...active.args, ...durable.args)
    : db.prepare(`SELECT * FROM nodes WHERE ${clause} AND ${active.clause} AND ${durable.clause} AND ${deletedThreadVisibility} AND compressed = 0 AND pinned = 1`).all(...args, ...active.args, ...durable.args)
  for (const row of pinnedRows) {
    rowsById.set(String(row.id), row)
  }

  const recentRows = includeCompressed
    ? db.prepare(`
      SELECT *
      FROM nodes
      WHERE ${clause} AND ${active.clause} AND ${durable.clause} AND ${deletedThreadVisibility}
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(...args, ...active.args, ...durable.args, cap)
    : db.prepare(`
      SELECT *
      FROM nodes
      WHERE ${clause} AND ${active.clause} AND ${durable.clause} AND ${deletedThreadVisibility} AND compressed = 0
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(...args, ...active.args, ...durable.args, cap)
  for (const row of recentRows) {
    rowsById.set(String(row.id), row)
  }

  if (queryLower) {
    const like = `%${queryLower}%`
    const keywordRows = includeCompressed
      ? db.prepare(`
        SELECT *
        FROM nodes
        WHERE ${clause}
          AND ${active.clause}
          AND ${durable.clause}
          AND ${deletedThreadVisibility}
          AND (LOWER(topic) LIKE ? OR LOWER(content) LIKE ?)
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(...args, ...active.args, ...durable.args, like, like, cap)
      : db.prepare(`
        SELECT *
        FROM nodes
        WHERE ${clause}
          AND ${active.clause}
          AND ${durable.clause}
          AND ${deletedThreadVisibility}
          AND compressed = 0
          AND (LOWER(topic) LIKE ? OR LOWER(content) LIKE ?)
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(...args, ...active.args, ...durable.args, like, like, cap)
    for (const row of keywordRows) {
      rowsById.set(String(row.id), row)
    }
  }

  return Array.from(rowsById.values())
}

export async function searchNodes(project, queryText, {
  topK = 12,
  threshold = 0.1,
  includeCompressed = false,
  includeDeletedThreads = false,
  includeGlobal = false,
  includeThread = false,
  includeProject = true,
  scopeFilter = '',
  threadId = '',
  candidateCap = 1500,
} = {}) {
  const db = getDb()
  const queryLower = String(queryText || '').toLowerCase()
  const rows = collectSearchCandidates(db, project, {
    includeCompressed: !!includeCompressed,
    includeDeletedThreads: !!includeDeletedThreads,
    includeGlobal: !!includeGlobal,
    includeThread,
    includeProject,
    scopeFilter,
    threadId,
    queryLower,
    candidateCap,
  })

  if (rows.length === 0) return []

  let queryVec = null
  try {
    queryVec = await embedder.embed(queryText)
  } catch {
    // Embedder not ready.
  }

  const scored = rows.map((row) => {
    const nodeVec = bufferToVec(row.embedding)
    const searchableText = buildSearchableText(row)
    let semantic = 0
    if (queryVec && nodeVec) {
      semantic = Math.max(0, cosine(queryVec, nodeVec))
    }

    const keywordMatch = !!(queryLower && searchableText.includes(queryLower))
    const keyword = keywordMatch ? 0.5 : 0

    const recency = recencyScore(row.updated_at)
    const access = accessScore(row.access_count)
    const sourceMultiplier = getSourceSearchScoreMultiplier(row.source)

    const score = queryVec && nodeVec
      ? ((semantic * 0.6) + (recency * 0.2) + (access * 0.1) + (keyword * 0.1)) * sourceMultiplier
      : ((keyword * 0.7) + (recency * 0.2) + (access * 0.1)) * sourceMultiplier

    return { node: rowToNode(row), score, keywordMatch }
  })

  return scored
    .filter((r) => r.node.pinned || r.keywordMatch || r.score >= threshold)
    .sort((a, b) => {
      if (a.node.pinned && !b.node.pinned) return -1
      if (!a.node.pinned && b.node.pinned) return 1
      return b.score - a.score
    })
    .slice(0, topK)
    .map((r) => ({ ...r.node, _score: Number(r.score.toFixed(4)) }))
}

export function touchNode(id) {
  const db = getDb()
  const ts = now()
  db.prepare(`
    UPDATE nodes
    SET access_count = access_count + 1,
        last_accessed = ?,
        last_used_at = ?
    WHERE id = ?
  `).run(ts, ts, id)
}
