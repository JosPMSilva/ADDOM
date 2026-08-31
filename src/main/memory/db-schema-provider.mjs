import { hasColumn } from './db-schema-utils.mjs'

export function ensureOpenAIProviderTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_files (
      id               TEXT PRIMARY KEY,
      provider_id      TEXT NOT NULL DEFAULT '',
      project_id       TEXT NOT NULL DEFAULT '',
      thread_id        TEXT NOT NULL DEFAULT '',
      attachment_id    TEXT NOT NULL DEFAULT '',
      local_path       TEXT NOT NULL DEFAULT '',
      sha256           TEXT NOT NULL DEFAULT '',
      file_name        TEXT NOT NULL DEFAULT '',
      mime_type        TEXT NOT NULL DEFAULT '',
      size_bytes       INTEGER NOT NULL DEFAULT 0,
      remote_file_id   TEXT NOT NULL DEFAULT '',
      purpose          TEXT NOT NULL DEFAULT 'user_data',
      status           TEXT NOT NULL DEFAULT 'pending_remote_phase',
      retention_policy TEXT NOT NULL DEFAULT 'project_reusable',
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL,
      last_used_at     INTEGER NOT NULL,
      deleted_remote_at INTEGER NOT NULL DEFAULT 0,
      metadata_json    TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS provider_vector_stores (
      id                     TEXT PRIMARY KEY,
      provider_id            TEXT NOT NULL DEFAULT '',
      project_id             TEXT NOT NULL DEFAULT '',
      thread_id              TEXT NOT NULL DEFAULT '',
      scope                  TEXT NOT NULL DEFAULT 'project',
      name                   TEXT NOT NULL DEFAULT '',
      remote_vector_store_id TEXT NOT NULL DEFAULT '',
      status                 TEXT NOT NULL DEFAULT 'pending_remote_phase',
      retention_policy       TEXT NOT NULL DEFAULT 'project_reusable',
      created_at             INTEGER NOT NULL,
      updated_at             INTEGER NOT NULL,
      last_used_at           INTEGER NOT NULL,
      metadata_json          TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS provider_vector_store_files (
      id                        TEXT PRIMARY KEY,
      provider_id               TEXT NOT NULL DEFAULT '',
      vector_store_record_id    TEXT NOT NULL DEFAULT '',
      provider_file_record_id   TEXT NOT NULL DEFAULT '',
      remote_vector_store_file_id TEXT NOT NULL DEFAULT '',
      status                    TEXT NOT NULL DEFAULT 'pending_remote_phase',
      attributes_json           TEXT NOT NULL DEFAULT '{}',
      created_at                INTEGER NOT NULL,
      updated_at                INTEGER NOT NULL,
      last_used_at              INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS openai_thread_state (
      thread_id             TEXT PRIMARY KEY,
      project_id            TEXT NOT NULL DEFAULT '',
      provider_id           TEXT NOT NULL DEFAULT 'openai',
      model                 TEXT NOT NULL DEFAULT '',
      last_response_id      TEXT NOT NULL DEFAULT '',
      conversation_id       TEXT NOT NULL DEFAULT '',
      store_enabled         INTEGER NOT NULL DEFAULT 0,
      toolset_hash          TEXT NOT NULL DEFAULT '',
      system_prompt_hash    TEXT NOT NULL DEFAULT '',
      continuity_signature  TEXT NOT NULL DEFAULT '',
      last_compaction_id    TEXT NOT NULL DEFAULT '',
      chain_valid           INTEGER NOT NULL DEFAULT 1,
      chain_invalid_reason  TEXT NOT NULL DEFAULT '',
      continuity_epoch      INTEGER NOT NULL DEFAULT 1,
      continuity_reducer_version TEXT NOT NULL DEFAULT '',
      mode_signature        TEXT NOT NULL DEFAULT '',
      model_signature       TEXT NOT NULL DEFAULT '',
      metadata_json         TEXT NOT NULL DEFAULT '{}',
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      last_used_at          INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS openai_background_jobs (
      id                       TEXT PRIMARY KEY,
      provider_id              TEXT NOT NULL DEFAULT 'openai',
      project_id               TEXT NOT NULL DEFAULT '',
      thread_id                TEXT NOT NULL DEFAULT '',
      assistant_message_id     TEXT NOT NULL DEFAULT '',
      model                    TEXT NOT NULL DEFAULT '',
      status                   TEXT NOT NULL DEFAULT 'queued',
      remote_response_id       TEXT NOT NULL DEFAULT '',
      conversation_id          TEXT NOT NULL DEFAULT '',
      toolset_hash             TEXT NOT NULL DEFAULT '',
      system_prompt_hash       TEXT NOT NULL DEFAULT '',
      continuity_signature     TEXT NOT NULL DEFAULT '',
      store_enabled            INTEGER NOT NULL DEFAULT 0,
      background_mode_enabled  INTEGER NOT NULL DEFAULT 0,
      queued_event_persisted   INTEGER NOT NULL DEFAULT 0,
      completion_event_persisted INTEGER NOT NULL DEFAULT 0,
      failure_event_persisted  INTEGER NOT NULL DEFAULT 0,
      last_polled_at           INTEGER NOT NULL DEFAULT 0,
      cancel_requested_at      INTEGER NOT NULL DEFAULT 0,
      completed_at             INTEGER NOT NULL DEFAULT 0,
      error_code               TEXT NOT NULL DEFAULT '',
      error_message            TEXT NOT NULL DEFAULT '',
      result_summary_json      TEXT NOT NULL DEFAULT '{}',
      created_at               INTEGER NOT NULL,
      updated_at               INTEGER NOT NULL
    );
  `)
}

export function ensureProviderBudgetTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_budget_profiles (
      id                        TEXT PRIMARY KEY,
      provider_id               TEXT NOT NULL DEFAULT '',
      organization_id           TEXT NOT NULL DEFAULT '',
      workspace_id              TEXT NOT NULL DEFAULT '',
      credential_fingerprint    TEXT NOT NULL DEFAULT '',
      profile_source            TEXT NOT NULL DEFAULT 'fallback',
      input_tpm_limit           INTEGER NOT NULL DEFAULT 0,
      output_tpm_limit          INTEGER NOT NULL DEFAULT 0,
      requests_per_minute_limit INTEGER NOT NULL DEFAULT 0,
      retry_after_seconds       INTEGER NOT NULL DEFAULT 0,
      confidence                TEXT NOT NULL DEFAULT 'fallback',
      observation_count         INTEGER NOT NULL DEFAULT 0,
      first_observed_at         INTEGER NOT NULL DEFAULT 0,
      last_observed_at          INTEGER NOT NULL DEFAULT 0,
      last_success_observed_at  INTEGER NOT NULL DEFAULT 0,
      last_rate_limit_observed_at INTEGER NOT NULL DEFAULT 0,
      last_observation_source   TEXT NOT NULL DEFAULT '',
      last_model_id             TEXT NOT NULL DEFAULT '',
      last_response_headers_json TEXT NOT NULL DEFAULT '{}',
      manual_override_json      TEXT NOT NULL DEFAULT '{}',
      last_resolved_at          INTEGER NOT NULL DEFAULT 0,
      created_at                INTEGER NOT NULL DEFAULT 0,
      updated_at                INTEGER NOT NULL DEFAULT 0
    );
  `)
}

export function ensureProviderBudgetColumns(db) {
  if (!hasColumn(db, 'provider_budget_profiles', 'last_resolved_at')) {
    db.exec('ALTER TABLE provider_budget_profiles ADD COLUMN last_resolved_at INTEGER NOT NULL DEFAULT 0')
  }
  db.exec('UPDATE provider_budget_profiles SET last_resolved_at = 0 WHERE last_resolved_at IS NULL OR last_resolved_at < 0')
}

export function ensureOpenAIProviderColumns(db) {
  if (!hasColumn(db, 'openai_thread_state', 'metadata_json')) {
    db.exec(`ALTER TABLE openai_thread_state ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'`)
  }
  if (!hasColumn(db, 'openai_thread_state', 'continuity_epoch')) {
    db.exec(`ALTER TABLE openai_thread_state ADD COLUMN continuity_epoch INTEGER NOT NULL DEFAULT 1`)
  }
  if (!hasColumn(db, 'openai_thread_state', 'continuity_reducer_version')) {
    db.exec(`ALTER TABLE openai_thread_state ADD COLUMN continuity_reducer_version TEXT NOT NULL DEFAULT ''`)
  }
  if (!hasColumn(db, 'openai_thread_state', 'mode_signature')) {
    db.exec(`ALTER TABLE openai_thread_state ADD COLUMN mode_signature TEXT NOT NULL DEFAULT ''`)
  }
  if (!hasColumn(db, 'openai_thread_state', 'model_signature')) {
    db.exec(`ALTER TABLE openai_thread_state ADD COLUMN model_signature TEXT NOT NULL DEFAULT ''`)
  }
  db.exec(`UPDATE openai_thread_state SET metadata_json = '{}' WHERE metadata_json IS NULL OR TRIM(metadata_json) = ''`)
  db.exec(`UPDATE openai_thread_state SET continuity_epoch = 1 WHERE continuity_epoch IS NULL OR continuity_epoch <= 0`)
  db.exec(`UPDATE openai_thread_state SET continuity_reducer_version = '' WHERE continuity_reducer_version IS NULL`)
  db.exec(`UPDATE openai_thread_state SET mode_signature = '' WHERE mode_signature IS NULL`)
  db.exec(`UPDATE openai_thread_state SET model_signature = '' WHERE model_signature IS NULL`)
}
