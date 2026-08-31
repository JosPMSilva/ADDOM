export const GLOBAL_MEMORY_PROJECT_KEY = '__addom_global__'
export const DURABLE_MEMORY_SOURCES = Object.freeze([
  'user_memory',
  'workspace_event',
  'terminal_summary',
  'validated_decision',
  'reference_note',
])
export const SCOPED_CONTEXT_DEFAULT_QUOTAS = Object.freeze({
  thread: 4,
  project: 2,
  global: 1,
})

export const DURABLE_MEMORY_SOURCE_SET = new Set(DURABLE_MEMORY_SOURCES)
export const COMPRESSIBLE_MEMORY_SOURCE_SET = new Set([
  'workspace_event',
  'validated_decision',
  'reference_note',
])
export const TERMINAL_SUMMARY_SYSTEM_TAG_SET = new Set([
  'terminal_summary',
  'terminal_session',
])
export const TERMINAL_SUMMARY_SEARCH_SCORE_MULTIPLIER = 0.9
export const TERMINAL_SUMMARY_MAX_SEARCH_TEXT_CHARS = 360
export const TERMINAL_SUMMARY_TAG_PREFIXES = Object.freeze({
  sessionId: 'terminal_session:',
  threadId: 'terminal_thread:',
  acceptedAt: 'terminal_accepted_at:',
})

export function now() {
  return Date.now()
}

export function vecToBuffer(vec) {
  return Buffer.from(vec.buffer)
}

export function bufferToVec(buf) {
  if (!buf) return null
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

export function cosine(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function recencyScore(updatedAt) {
  const ageDays = (now() - updatedAt) / 86_400_000
  return Math.exp(-ageDays / 30)
}

export function accessScore(count) {
  return Math.min(1, Math.log1p(count) / Math.log1p(100))
}

export function normalizeProjectKey(project) {
  const raw = String(project ?? '').trim()
  return raw || ''
}

export function normalizeNullableText(value) {
  const raw = String(value ?? '').trim()
  return raw || null
}

export function normalizeMemoryScope(scope, { isGlobal = false } = {}) {
  const normalizedScope = String(scope || '').trim().toLowerCase()
  if (normalizedScope === 'thread' || normalizedScope === 'project' || normalizedScope === 'global') {
    return normalizedScope
  }
  return isGlobal ? 'global' : 'project'
}

export function normalizeMemoryDurability(durability) {
  const normalized = String(durability || '').trim().toLowerCase()
  if (
    normalized === 'ephemeral'
    || normalized === 'standard'
    || normalized === 'promoted'
    || normalized === 'pinned'
  ) {
    return normalized
  }
  return 'standard'
}

export function normalizeMemoryConfidence(confidence, fallback = 0.5) {
  const n = Number(confidence)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

export function normalizePositiveInteger(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.round(n))
}

export function escapeSqlLikePattern(value = '') {
  return String(value || '').replace(/[\\%_]/g, '\\$&')
}

export function normalizeTags(tags = []) {
  return Array.isArray(tags)
    ? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : []
}

export function getTagValueByPrefix(tags = [], prefix = '') {
  const normalizedPrefix = String(prefix || '')
  if (!normalizedPrefix) return ''
  for (const tag of tags) {
    if (!String(tag).startsWith(normalizedPrefix)) continue
    return String(tag).slice(normalizedPrefix.length).trim()
  }
  return ''
}

export function normalizeTerminalAcceptedAt(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

export function normalizeStoredSource(source = '') {
  return String(source || '').trim().toLowerCase()
}

export function buildMemoryNodeProvenance(source = '', tags = [], projectKey = '') {
  if (String(source || '').trim().toLowerCase() !== 'terminal_summary') return null
  const sessionId = getTagValueByPrefix(tags, TERMINAL_SUMMARY_TAG_PREFIXES.sessionId)
  const threadId = getTagValueByPrefix(tags, TERMINAL_SUMMARY_TAG_PREFIXES.threadId)
  const acceptedAt = normalizeTerminalAcceptedAt(
    getTagValueByPrefix(tags, TERMINAL_SUMMARY_TAG_PREFIXES.acceptedAt),
  )
  return {
    kind: 'terminal',
    sessionId,
    threadId,
    acceptedAt,
    projectKey: normalizeProjectKey(projectKey),
  }
}

export function buildMemoryNodeDisplayTags(source = '', tags = []) {
  if (String(source || '').trim().toLowerCase() !== 'terminal_summary') return [...tags]
  return tags.filter((tag) => {
    if (TERMINAL_SUMMARY_SYSTEM_TAG_SET.has(tag)) return false
    if (String(tag).startsWith(TERMINAL_SUMMARY_TAG_PREFIXES.sessionId)) return false
    if (String(tag).startsWith(TERMINAL_SUMMARY_TAG_PREFIXES.threadId)) return false
    if (String(tag).startsWith(TERMINAL_SUMMARY_TAG_PREFIXES.acceptedAt)) return false
    return true
  })
}

export function normalizeMemorySource(source = '', tags = []) {
  const normalizedSource = normalizeStoredSource(source)
  const normalizedTags = normalizeTags(tags).map((tag) => tag.toLowerCase())
  const tagSet = new Set(normalizedTags)

  if (tagSet.has('terminal_summary')) return 'terminal_summary'
  if (DURABLE_MEMORY_SOURCE_SET.has(normalizedSource)) return normalizedSource

  if (normalizedSource === 'user') return 'user_memory'
  if (normalizedSource === 'web_ingest') return 'reference_note'
  if (normalizedSource === 'tool_result') return 'workspace_event'
  if (normalizedSource === 'auto_log') {
    if (tagSet.has('file_write')) return 'workspace_event'
    if (tagSet.has('decision')) return 'validated_decision'
  }

  return 'reference_note'
}

export function isGlobalProjectKey(projectKey) {
  return String(projectKey || '').trim() === GLOBAL_MEMORY_PROJECT_KEY
}

export function buildScopedNodeClause(project, {
  scopeFilter = '',
  threadId = '',
  includeThread = false,
  includeProject = true,
  includeGlobal = false,
  forceGlobalOnly = false,
} = {}) {
  const normalizedScopeFilter = String(scopeFilter || '').trim().toLowerCase()
  const normalizedProject = normalizeProjectKey(project)
  const normalizedThreadId = normalizeNullableText(threadId)

  if (forceGlobalOnly || normalizedScopeFilter === 'global') {
    return {
      clause: 'project = ? AND scope = ?',
      args: [GLOBAL_MEMORY_PROJECT_KEY, 'global'],
    }
  }
  if (normalizedScopeFilter === 'thread') {
    if (!normalizedThreadId) return { clause: '1 = 0', args: [] }
    return {
      clause: 'project = ? AND scope = ? AND thread_id = ?',
      args: [normalizedProject, 'thread', normalizedThreadId],
    }
  }
  if (normalizedScopeFilter === 'project') {
    return {
      clause: 'project = ? AND scope = ?',
      args: [normalizedProject, 'project'],
    }
  }

  const clauses = []
  const args = []
  if (includeThread === true && normalizedThreadId) {
    clauses.push('(project = ? AND scope = ? AND thread_id = ?)')
    args.push(normalizedProject, 'thread', normalizedThreadId)
  }
  if (includeProject !== false) {
    clauses.push('(project = ? AND scope = ?)')
    args.push(normalizedProject, 'project')
  }
  if (includeGlobal === true) {
    clauses.push('(project = ? AND scope = ?)')
    args.push(GLOBAL_MEMORY_PROJECT_KEY, 'global')
  }
  if (clauses.length === 0) return { clause: '1 = 0', args: [] }
  return {
    clause: clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`,
    args,
  }
}

export function buildDurableSourceClause(alias = '') {
  const prefix = alias ? `${alias}.` : ''
  const placeholders = DURABLE_MEMORY_SOURCES.map(() => '?').join(', ')
  return {
    clause: `${prefix}source IN (${placeholders})`,
    args: [...DURABLE_MEMORY_SOURCES],
  }
}

export function buildActiveNodeClause(alias = '') {
  const prefix = alias ? `${alias}.` : ''
  return {
    clause: `${prefix}invalidated_at IS NULL AND (${prefix}superseded_by IS NULL OR TRIM(${prefix}superseded_by) = '')`,
    args: [],
  }
}

export function rowToNode(row) {
  if (!row) return null
  const projectKey = String(row.project || '')
  const derivedIsGlobal = isGlobalProjectKey(projectKey)
  const scope = normalizeMemoryScope(row.scope, { isGlobal: derivedIsGlobal })
  const isGlobal = scope === 'global'
  const tags = normalizeTags(JSON.parse(row.tags || '[]'))
  const source = String(row.source || '').trim()
  const provenance = buildMemoryNodeProvenance(source, tags, projectKey)
  const threadId = normalizeNullableText(row.thread_id)
  const originThreadId = normalizeNullableText(row.origin_thread_id) || normalizeNullableText(provenance?.threadId)
  return {
    id: row.id,
    sortId: Number(row.sort_id || 0),
    project: isGlobal ? '' : projectKey,
    projectKey,
    scope,
    isGlobal,
    threadId,
    originThreadId,
    originThreadTitle: String(row.origin_thread_title || ''),
    originThreadState: String(row.origin_thread_state || 'active'),
    originThreadDeletedAt: row.origin_thread_deleted_at ?? null,
    originProjectId: normalizeNullableText(row.origin_project_id),
    originProjectName: String(row.origin_project_name || ''),
    originProjectPath: String(row.origin_project_path || ''),
    originProjectState: String(row.origin_project_state || 'active'),
    originProjectRemovedAt: row.origin_project_removed_at ?? null,
    topic: row.topic,
    content: row.content,
    tags,
    displayTags: buildMemoryNodeDisplayTags(source, tags),
    pinned: !!row.pinned,
    dataPolicy: row.data_policy,
    source,
    durability: normalizeMemoryDurability(row.durability),
    confidence: normalizeMemoryConfidence(row.confidence),
    provenance,
    compressed: !!row.compressed,
    compressedInto: row.compressed_into ?? null,
    promotedAt: row.promoted_at ?? null,
    invalidatedAt: row.invalidated_at ?? null,
    supersededBy: normalizeNullableText(row.superseded_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accessCount: row.access_count,
    lastAccessed: row.last_accessed,
    lastUsedAt: row.last_used_at ?? 0,
  }
}
