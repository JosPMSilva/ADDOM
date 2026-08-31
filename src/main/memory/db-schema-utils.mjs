const ALLOWED_PRAGMA_TABLES = new Set([
  'nodes',
  'artifacts',
  'workspace_projects',
  'chat_threads',
  'chat_events',
  'chat_attachments',
  'moa_transactions',
  'moa_agent_memory',
  'continuity_snapshots',
  'continuity_facts',
  'continuity_invariants',
  'provider_files',
  'provider_vector_stores',
  'provider_vector_store_files',
  'provider_budget_profiles',
  'openai_thread_state',
  'openai_background_jobs',
  'thread_continuity_state',
  'thread_continuity_turns',
  'terminal_session_archive',
])
const SAFE_PRAGMA_TABLE_NAME_RE = /^[a-z_]+$/

export function hasColumn(db, table, column) {
  const tableName = String(table || '').trim()
  if (!ALLOWED_PRAGMA_TABLES.has(tableName)) return false
  if (!SAFE_PRAGMA_TABLE_NAME_RE.test(tableName)) return false
  const cols = db.prepare(`PRAGMA table_info('${tableName}')`).all()
  return cols.some((c) => c.name === column)
}
