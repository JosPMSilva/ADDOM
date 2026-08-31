import crypto from 'node:crypto'
import path from 'node:path'
import { getDb } from '../memory/db.mjs'

const MAX_ENTRIES_PER_SCOPE = 50

function cleanString(value) {
  return String(value ?? '').trim()
}

function resolveProject(db, projectFolder) {
  const rawPath = cleanString(projectFolder)
  if (!rawPath) return null
  const normalizedPath = path.resolve(rawPath)
  return db.prepare('SELECT id FROM workspace_projects WHERE path = ?').get(normalizedPath)
}

function mapEntry(row) {
  return {
    id: String(row?.entry_id || ''),
    timestamp: String(row?.timestamp || ''),
    summary: String(row?.summary || ''),
    context: String(row?.context || ''),
    taskInstruction: String(row?.task_instruction || ''),
  }
}

export function readAgentMemory(projectFolder, scopeKeys = []) {
  const keys = [...new Set(scopeKeys.map(cleanString).filter(Boolean))]
  if (keys.length === 0) return []
  const db = getDb()
  const project = resolveProject(db, projectFolder)
  if (!project) return []
  const placeholders = keys.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT entry_id, timestamp, summary, context, task_instruction, created_at, rowid
    FROM moa_agent_memory
    WHERE project_id = ? AND scope_key IN (${placeholders})
    ORDER BY created_at ASC, rowid ASC
  `).all(project.id, ...keys)
  const deduped = new Map()
  for (const row of rows) {
    const entryId = String(row?.entry_id || '')
    if (!entryId || deduped.has(entryId)) continue
    deduped.set(entryId, mapEntry(row))
  }
  return [...deduped.values()]
}

export function writeAgentMemory(projectFolder, scopeKeys = [], entry = {}) {
  const keys = [...new Set(scopeKeys.map(cleanString).filter(Boolean))]
  if (keys.length === 0) return false
  const db = getDb()
  const project = resolveProject(db, projectFolder)
  if (!project) return false
  const entryId = `mem_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const timestamp = String(entry?.timestamp || new Date().toISOString())
  const createdAt = Date.now()
  const insert = db.prepare(`
    INSERT INTO moa_agent_memory (
      id, entry_id, project_id, scope_key, timestamp, summary, context,
      task_instruction, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const trimScope = db.prepare(`
    DELETE FROM moa_agent_memory
    WHERE rowid IN (
      SELECT rowid
      FROM moa_agent_memory
      WHERE project_id = ? AND scope_key = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT -1 OFFSET ${MAX_ENTRIES_PER_SCOPE}
    )
  `)
  db.transaction(() => {
    for (const scopeKey of keys) {
      insert.run(
        crypto.randomUUID(),
        entryId,
        project.id,
        scopeKey,
        timestamp,
        cleanString(entry?.summary),
        cleanString(entry?.context),
        cleanString(entry?.taskInstruction),
        createdAt,
      )
      trimScope.run(project.id, scopeKey)
    }
  })()
  return true
}

export function clearAgentMemory(projectFolder, scopeKey) {
  const normalizedScopeKey = cleanString(scopeKey)
  if (!normalizedScopeKey) return 0
  const db = getDb()
  const project = resolveProject(db, projectFolder)
  if (!project) return 0
  return Number(db.prepare(`
    DELETE FROM moa_agent_memory WHERE project_id = ? AND scope_key = ?
  `).run(project.id, normalizedScopeKey)?.changes || 0)
}

export function clearProjectAgentMemory(projectFolder) {
  const db = getDb()
  const project = resolveProject(db, projectFolder)
  if (!project) return 0
  return Number(db.prepare(`
    DELETE FROM moa_agent_memory WHERE project_id = ?
  `).run(project.id)?.changes || 0)
}

export function listAgentMemoryScopes(projectFolder) {
  const db = getDb()
  const project = resolveProject(db, projectFolder)
  if (!project) return []
  return db.prepare(`
    SELECT scope_key AS roleId,
           COUNT(*) AS entryCount,
           MAX(timestamp) AS lastUpdated
    FROM moa_agent_memory
    WHERE project_id = ?
    GROUP BY scope_key
    ORDER BY scope_key ASC
  `).all(project.id).map((row) => ({
    roleId: String(row?.roleId || ''),
    entryCount: Number(row?.entryCount || 0),
    lastUpdated: String(row?.lastUpdated || ''),
  }))
}
