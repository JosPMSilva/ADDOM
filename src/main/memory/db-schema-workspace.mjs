import { hasColumn } from './db-schema-utils.mjs'

export function ensureWorkspaceTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_projects (
      id               TEXT PRIMARY KEY,
      path             TEXT NOT NULL UNIQUE,
      name             TEXT NOT NULL DEFAULT '',
      created_at       INTEGER NOT NULL,
      last_opened_at   INTEGER NOT NULL,
      last_worked_at   INTEGER NOT NULL,
      last_provider    TEXT NOT NULL DEFAULT '',
      last_model       TEXT NOT NULL DEFAULT '',
      active_thread_id TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      title       TEXT NOT NULL DEFAULT 'Main',
      title_source TEXT NOT NULL DEFAULT 'manual',
      last_provider TEXT NOT NULL DEFAULT '',
      last_model  TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      last_viewed_at INTEGER NOT NULL DEFAULT 0,
      archived    INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(project_id) REFERENCES workspace_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_events (
      event_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id   TEXT NOT NULL,
      turn_id     TEXT NOT NULL DEFAULT '',
      kind        TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL DEFAULT '',
      meta_json   TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_attachments (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL DEFAULT '',
      thread_id       TEXT NOT NULL DEFAULT '',
      turn_id         TEXT NOT NULL DEFAULT '',
      kind            TEXT NOT NULL DEFAULT 'file',
      media_type      TEXT NOT NULL DEFAULT '',
      file_name       TEXT NOT NULL DEFAULT '',
      size_bytes      INTEGER NOT NULL DEFAULT 0,
      sha256          TEXT NOT NULL DEFAULT '',
      relative_path   TEXT NOT NULL DEFAULT '',
      created_at      INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL
    );
  `)
}

export function ensureWorkspaceThreadColumns(db) {
  if (!hasColumn(db, 'chat_threads', 'last_provider')) {
    db.exec(`ALTER TABLE chat_threads ADD COLUMN last_provider TEXT NOT NULL DEFAULT ''`)
  }
  if (!hasColumn(db, 'chat_threads', 'last_model')) {
    db.exec(`ALTER TABLE chat_threads ADD COLUMN last_model TEXT NOT NULL DEFAULT ''`)
  }
  if (!hasColumn(db, 'chat_threads', 'last_viewed_at')) {
    db.exec('ALTER TABLE chat_threads ADD COLUMN last_viewed_at INTEGER NOT NULL DEFAULT 0')
    db.exec('UPDATE chat_threads SET last_viewed_at = updated_at')
  }
  if (!hasColumn(db, 'chat_threads', 'title_source')) {
    db.exec("ALTER TABLE chat_threads ADD COLUMN title_source TEXT NOT NULL DEFAULT 'manual'")
    db.exec(`
      UPDATE chat_threads
      SET title_source = CASE
        WHEN lower(trim(title)) = 'new thread' THEN 'default'
        ELSE 'manual'
      END
    `)
  }
}

export function ensureCanonicalChatEventColumns(db) {
  const columns = [
    ['schema_version', 'INTEGER NOT NULL DEFAULT 0'],
    ['canonical_event_id', 'TEXT'],
    ['project_id', 'TEXT'],
    ['conversation_id', 'TEXT'],
    ['local_sequence', 'INTEGER'],
    ['occurred_at', 'INTEGER'],
    ['updated_at', 'INTEGER'],
    ['source_provider_id', 'TEXT'],
    ['source_transport', 'TEXT'],
    ['source_runtime', 'TEXT'],
    ['provider_event_id', 'TEXT'],
    ['provider_correlation_key', 'TEXT'],
    ['actor_kind', 'TEXT'],
    ['actor_id', 'TEXT'],
    ['actor_conversation_id', 'TEXT'],
    ['actor_run_id', 'TEXT'],
    ['semantic_kind', 'TEXT'],
    ['phase', 'TEXT'],
    ['lifecycle', 'TEXT'],
    ['payload_json', 'TEXT'],
    ['support_decision', 'TEXT'],
    ['progressive_key', 'TEXT'],
  ]
  for (const [name, definition] of columns) {
    if (!hasColumn(db, 'chat_events', name)) {
      db.exec(`ALTER TABLE chat_events ADD COLUMN ${name} ${definition}`)
    }
  }
}

export function backfillLegacyCanonicalChatEventColumns(db) {
  db.exec(`
    UPDATE chat_events
    SET
      project_id = COALESCE(
        project_id,
        (SELECT project_id FROM chat_threads WHERE chat_threads.id = chat_events.thread_id)
      ),
      conversation_id = COALESCE(conversation_id, thread_id),
      occurred_at = COALESCE(occurred_at, created_at),
      updated_at = COALESCE(updated_at, created_at),
      semantic_kind = COALESCE(semantic_kind, kind),
      support_decision = COALESCE(support_decision, 'legacy_unknown')
    WHERE schema_version = 0
  `)
}

export function ensureAttachmentColumns(db) {
  if (!hasColumn(db, 'chat_attachments', 'last_accessed_at')) {
    db.exec('ALTER TABLE chat_attachments ADD COLUMN last_accessed_at INTEGER NOT NULL DEFAULT 0')
  }
}

export function ensureLegacyMoaTransactionTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS moa_transactions (
      id                  TEXT PRIMARY KEY,
      thread_id           TEXT NOT NULL DEFAULT '',
      turn_id             TEXT NOT NULL DEFAULT '',
      delegation_id       TEXT NOT NULL DEFAULT '',
      timestamp           INTEGER NOT NULL,
      task_manifest       TEXT NOT NULL DEFAULT '[]',
      agent_outputs       TEXT NOT NULL DEFAULT '[]',
      token_cost_estimate REAL DEFAULT 0,
      started_at          INTEGER NOT NULL DEFAULT 0,
      finished_at         INTEGER NOT NULL DEFAULT 0,
      duration_ms         INTEGER NOT NULL DEFAULT 0,
      policy_snapshot     TEXT NOT NULL DEFAULT '{}',
      status_summary      TEXT NOT NULL DEFAULT '{}'
    );
  `)
}

export function ensureMoaAgentMemoryTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS moa_agent_memory (
      id               TEXT PRIMARY KEY,
      entry_id         TEXT NOT NULL,
      project_id       TEXT NOT NULL,
      scope_key        TEXT NOT NULL,
      timestamp        TEXT NOT NULL DEFAULT '',
      summary          TEXT NOT NULL DEFAULT '',
      context          TEXT NOT NULL DEFAULT '',
      task_instruction TEXT NOT NULL DEFAULT '',
      created_at       INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES workspace_projects(id) ON DELETE CASCADE
    );
  `)
}

export function ensureMoaTables(db) {
  ensureLegacyMoaTransactionTable(db)
  ensureMoaAgentMemoryTable(db)
}

export function ensureMoaColumns(db) {
  if (!hasColumn(db, 'moa_transactions', 'started_at')) {
    db.exec('ALTER TABLE moa_transactions ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0')
  }
  if (!hasColumn(db, 'moa_transactions', 'finished_at')) {
    db.exec('ALTER TABLE moa_transactions ADD COLUMN finished_at INTEGER NOT NULL DEFAULT 0')
  }
  if (!hasColumn(db, 'moa_transactions', 'duration_ms')) {
    db.exec('ALTER TABLE moa_transactions ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0')
  }
  if (!hasColumn(db, 'moa_transactions', 'policy_snapshot')) {
    db.exec(`ALTER TABLE moa_transactions ADD COLUMN policy_snapshot TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!hasColumn(db, 'moa_transactions', 'status_summary')) {
    db.exec(`ALTER TABLE moa_transactions ADD COLUMN status_summary TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!hasColumn(db, 'moa_transactions', 'agent_outputs')) {
    db.exec(`ALTER TABLE moa_transactions ADD COLUMN agent_outputs TEXT NOT NULL DEFAULT '[]'`)
  }

  db.exec(`UPDATE moa_transactions SET policy_snapshot = '{}' WHERE policy_snapshot IS NULL OR policy_snapshot = ''`)
  db.exec(`UPDATE moa_transactions SET status_summary = '{}' WHERE status_summary IS NULL OR status_summary = ''`)
}

export function ensureContinuityTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS continuity_snapshots (
      id                         TEXT PRIMARY KEY,
      thread_id                  TEXT NOT NULL DEFAULT '',
      turn_id                    TEXT NOT NULL DEFAULT '',
      project                    TEXT NOT NULL DEFAULT '',
      profile                    TEXT NOT NULL DEFAULT 'balanced',
      scope                      TEXT NOT NULL DEFAULT 'thread_project',
      token_budget               INTEGER NOT NULL DEFAULT 0,
      packet_tokens              INTEGER NOT NULL DEFAULT 0,
      packet_json                TEXT NOT NULL DEFAULT '{}',
      quality_meta_json          TEXT NOT NULL DEFAULT '{}',
      provider_native_meta_json  TEXT NOT NULL DEFAULT '{}',
      created_at                 INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS continuity_facts (
      id             TEXT PRIMARY KEY,
      thread_id      TEXT NOT NULL DEFAULT '',
      project        TEXT NOT NULL DEFAULT '',
      fact_type      TEXT NOT NULL DEFAULT 'decision',
      fact_key       TEXT NOT NULL DEFAULT '',
      fact_text      TEXT NOT NULL DEFAULT '',
      source_turn_id TEXT NOT NULL DEFAULT '',
      source_ref     TEXT NOT NULL DEFAULT '',
      confidence     REAL NOT NULL DEFAULT 0.6,
      status         TEXT NOT NULL DEFAULT 'active',
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL,
      last_used_at   INTEGER NOT NULL,
      metadata_json  TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS continuity_invariants (
      id             TEXT PRIMARY KEY,
      thread_id      TEXT NOT NULL DEFAULT '',
      project        TEXT NOT NULL DEFAULT '',
      invariant_type TEXT NOT NULL DEFAULT 'goal',
      invariant_key  TEXT NOT NULL DEFAULT '',
      invariant_text TEXT NOT NULL DEFAULT '',
      status         TEXT NOT NULL DEFAULT 'active',
      confidence     REAL NOT NULL DEFAULT 0.8,
      source_turn_id TEXT NOT NULL DEFAULT '',
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL,
      metadata_json  TEXT NOT NULL DEFAULT '{}'
    );
  `)
}

export function ensureThreadContinuityTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_continuity_state (
      thread_id                TEXT PRIMARY KEY,
      project                  TEXT NOT NULL DEFAULT '',
      epoch                    INTEGER NOT NULL DEFAULT 1,
      reducer_version          TEXT NOT NULL DEFAULT '',
      task_summary             TEXT NOT NULL DEFAULT '',
      confirmed_decisions_json TEXT NOT NULL DEFAULT '[]',
      open_loops_json          TEXT NOT NULL DEFAULT '[]',
      workspace_refs_json      TEXT NOT NULL DEFAULT '[]',
      blocking_questions_json  TEXT NOT NULL DEFAULT '[]',
      last_turn_id             TEXT NOT NULL DEFAULT '',
      metadata_json            TEXT NOT NULL DEFAULT '{}',
      updated_at               INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thread_continuity_turns (
      id                   TEXT PRIMARY KEY,
      thread_id            TEXT NOT NULL DEFAULT '',
      turn_id              TEXT NOT NULL DEFAULT '',
      project              TEXT NOT NULL DEFAULT '',
      intent_delta_json    TEXT NOT NULL DEFAULT '{}',
      outcome_delta_json   TEXT NOT NULL DEFAULT '{}',
      tool_effects_json    TEXT NOT NULL DEFAULT '[]',
      decision_delta_json  TEXT NOT NULL DEFAULT '[]',
      open_loop_delta_json TEXT NOT NULL DEFAULT '{}',
      quality_flags_json   TEXT NOT NULL DEFAULT '[]',
      created_at           INTEGER NOT NULL
    );
  `)
}
