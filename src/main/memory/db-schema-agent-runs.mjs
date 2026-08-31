export function ensureAgentRunTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id                    TEXT PRIMARY KEY,
      project_id            TEXT NOT NULL,
      thread_id             TEXT NOT NULL,
      turn_id               TEXT NOT NULL,
      root_node_id          TEXT NOT NULL,
      status                TEXT NOT NULL,
      contract_json         TEXT NOT NULL,
      last_run_sequence     INTEGER NOT NULL DEFAULT 0,
      recovery_json         TEXT NOT NULL DEFAULT '{}',
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES workspace_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_nodes (
      id                    TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      parent_node_id        TEXT,
      status                TEXT NOT NULL,
      provider_id           TEXT NOT NULL,
      model_id              TEXT NOT NULL,
      depth                 INTEGER NOT NULL,
      contract_json         TEXT NOT NULL,
      last_node_sequence    INTEGER NOT NULL DEFAULT 0,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    );

    CREATE TABLE IF NOT EXISTS agent_attempts (
      id                    TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      node_id               TEXT NOT NULL,
      attempt_number        INTEGER NOT NULL,
      status                TEXT NOT NULL,
      reconciliation_state  TEXT NOT NULL,
      workspace_mode        TEXT NOT NULL,
      contract_json         TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      FOREIGN KEY(node_id) REFERENCES agent_nodes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      UNIQUE(node_id, attempt_number)
    );

    CREATE TABLE IF NOT EXISTS agent_event_receipts (
      event_id                TEXT PRIMARY KEY,
      run_id                  TEXT NOT NULL,
      node_id                 TEXT NOT NULL,
      run_sequence            INTEGER NOT NULL,
      node_sequence           INTEGER NOT NULL,
      idempotency_key         TEXT NOT NULL,
      provider_event_id       TEXT,
      provider_correlation_key TEXT,
      kind                    TEXT NOT NULL,
      compaction_id           TEXT,
      created_at              INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      UNIQUE(run_id, run_sequence),
      UNIQUE(run_id, node_id, node_sequence),
      UNIQUE(run_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS agent_events (
      event_id                TEXT PRIMARY KEY,
      run_id                  TEXT NOT NULL,
      node_id                 TEXT NOT NULL,
      parent_node_id          TEXT,
      run_sequence            INTEGER NOT NULL,
      node_sequence           INTEGER NOT NULL,
      attempt_id              TEXT,
      provider_event_id       TEXT,
      provider_correlation_key TEXT,
      idempotency_key         TEXT NOT NULL,
      kind                    TEXT NOT NULL,
      payload_json            TEXT NOT NULL,
      event_json              TEXT NOT NULL,
      retention_class         TEXT NOT NULL,
      created_at              INTEGER NOT NULL,
      FOREIGN KEY(event_id) REFERENCES agent_event_receipts(event_id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    );

    CREATE TABLE IF NOT EXISTS agent_transcript_segments (
      event_id              TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      node_id               TEXT NOT NULL,
      attempt_id            TEXT,
      kind                  TEXT NOT NULL,
      run_sequence          INTEGER NOT NULL,
      node_sequence         INTEGER NOT NULL,
      segment_json          TEXT NOT NULL,
      content_hash          TEXT NOT NULL,
      source_sequence_start INTEGER NOT NULL,
      source_sequence_end   INTEGER NOT NULL,
      created_at            INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_approval_projections (
      approval_id           TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      node_id               TEXT NOT NULL,
      attempt_id            TEXT,
      status                TEXT NOT NULL,
      projection_json       TEXT NOT NULL,
      updated_sequence      INTEGER NOT NULL,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_artifact_projections (
      artifact_id           TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      node_id               TEXT NOT NULL,
      attempt_id            TEXT NOT NULL,
      status                TEXT NOT NULL,
      projection_json       TEXT NOT NULL,
      updated_sequence      INTEGER NOT NULL,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_usage_projections (
      run_id                TEXT NOT NULL,
      owner_type            TEXT NOT NULL,
      owner_id              TEXT NOT NULL,
      exclusive_usage_json  TEXT,
      inclusive_usage_json  TEXT,
      updated_sequence      INTEGER NOT NULL,
      PRIMARY KEY(run_id, owner_type, owner_id),
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_event_compactions (
      id                    TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      node_id               TEXT NOT NULL,
      source_sequence_start INTEGER NOT NULL,
      source_sequence_end   INTEGER NOT NULL,
      event_count           INTEGER NOT NULL,
      events_json           TEXT NOT NULL,
      content_hash          TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_provider_diagnostics (
      event_id              TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      node_id               TEXT NOT NULL,
      provider_event_id     TEXT,
      metadata_json         TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      expires_at            INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_runtime_diagnostics (
      diagnostic_id         TEXT PRIMARY KEY,
      kind                  TEXT NOT NULL,
      run_id                TEXT NOT NULL,
      node_id               TEXT,
      attempt_id            TEXT,
      provider_class        TEXT NOT NULL,
      monotonic_at          REAL NOT NULL,
      duration_ms           REAL,
      outcome               TEXT NOT NULL,
      correlation_id        TEXT,
      attributes_json       TEXT NOT NULL DEFAULT '{}',
      created_at            INTEGER NOT NULL,
      expires_at            INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_scheduler_entries (
      attempt_id             TEXT PRIMARY KEY,
      run_id                 TEXT NOT NULL,
      node_id                TEXT NOT NULL,
      parent_node_id         TEXT,
      project_id             TEXT NOT NULL,
      thread_id              TEXT NOT NULL,
      provider_id            TEXT NOT NULL,
      status                 TEXT NOT NULL,
      depth                  INTEGER NOT NULL,
      token_reservation      INTEGER NOT NULL,
      cost_reservation_usd   REAL NOT NULL,
      tool_call_reservation  INTEGER NOT NULL,
      enqueue_order          INTEGER NOT NULL,
      eligible_at            INTEGER NOT NULL,
      lease_expires_at       INTEGER,
      heartbeat_at           INTEGER,
      created_at             INTEGER NOT NULL,
      updated_at             INTEGER NOT NULL,
      FOREIGN KEY(attempt_id) REFERENCES agent_attempts(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      FOREIGN KEY(node_id) REFERENCES agent_nodes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    );

    CREATE TABLE IF NOT EXISTS agent_scheduler_state (
      id                          INTEGER PRIMARY KEY CHECK (id = 1),
      paused                      INTEGER NOT NULL DEFAULT 0,
      last_project_id             TEXT,
      last_run_by_project_json    TEXT NOT NULL DEFAULT '{}',
      updated_at                  INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO agent_scheduler_state (
      id, paused, last_project_id, last_run_by_project_json, updated_at
    ) VALUES (1, 0, NULL, '{}', 0);

    CREATE TABLE IF NOT EXISTS agent_completion_leases (
      attempt_id             TEXT PRIMARY KEY,
      run_id                 TEXT NOT NULL,
      node_id                TEXT NOT NULL,
      consumer               TEXT NOT NULL,
      acquired_at            INTEGER NOT NULL,
      FOREIGN KEY(attempt_id) REFERENCES agent_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_workspaces (
      id                    TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      node_id               TEXT NOT NULL,
      attempt_id            TEXT NOT NULL UNIQUE,
      project_id            TEXT NOT NULL,
      mode                  TEXT NOT NULL,
      status                TEXT NOT NULL,
      source_root           TEXT,
      workspace_root        TEXT,
      project_view_root     TEXT,
      base_revision         TEXT NOT NULL,
      lease_expires_at      INTEGER NOT NULL,
      ownership_json        TEXT NOT NULL DEFAULT '{}',
      recovery_json         TEXT NOT NULL DEFAULT '{}',
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(node_id) REFERENCES agent_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY(attempt_id) REFERENCES agent_attempts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_merge_queue (
      id                    TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      artifact_id           TEXT NOT NULL,
      workspace_id          TEXT NOT NULL,
      project_id            TEXT NOT NULL,
      operation             TEXT NOT NULL,
      status                TEXT NOT NULL,
      dependency_ids_json   TEXT NOT NULL DEFAULT '[]',
      enqueue_order         INTEGER NOT NULL,
      decision_json         TEXT NOT NULL DEFAULT '{}',
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      UNIQUE(artifact_id, operation),
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(artifact_id) REFERENCES agent_artifact_projections(artifact_id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES agent_workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_merge_operations (
      merge_id              TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      artifact_id           TEXT NOT NULL,
      phase                 TEXT NOT NULL,
      plan_json             TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(merge_id) REFERENCES agent_merge_queue(id) ON DELETE CASCADE,
      FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
      FOREIGN KEY(artifact_id) REFERENCES agent_artifact_projections(artifact_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_workspace_base_files (
      workspace_id          TEXT NOT NULL,
      relative_path         TEXT NOT NULL,
      content_digest        TEXT NOT NULL,
      size_bytes            INTEGER NOT NULL,
      PRIMARY KEY(workspace_id, relative_path),
      FOREIGN KEY(workspace_id) REFERENCES agent_workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_runs_thread_status
      ON agent_runs(thread_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_project_status
      ON agent_runs(project_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_nodes_run_parent
      ON agent_nodes(run_id, parent_node_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_attempts_run_node
      ON agent_attempts(run_id, node_id, attempt_number ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_events_run_sequence
      ON agent_events(run_id, run_sequence ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_events_node_sequence
      ON agent_events(run_id, node_id, node_sequence ASC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_event_receipts_provider_identity
      ON agent_event_receipts(provider_correlation_key, provider_event_id)
      WHERE provider_correlation_key IS NOT NULL AND provider_event_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_agent_transcript_run_node_sequence
      ON agent_transcript_segments(run_id, node_id, node_sequence ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_approvals_run_status
      ON agent_approval_projections(run_id, status, updated_sequence ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_node
      ON agent_artifact_projections(run_id, node_id, updated_sequence ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_compactions_run_sequence
      ON agent_event_compactions(run_id, source_sequence_start ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_provider_diagnostics_expiry
      ON agent_provider_diagnostics(expires_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_runtime_diagnostics_expiry
      ON agent_runtime_diagnostics(expires_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_runtime_diagnostics_run_kind
      ON agent_runtime_diagnostics(run_id, kind, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_runtime_diagnostics_aggregate
      ON agent_runtime_diagnostics(kind, provider_class, outcome, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_scheduler_status_eligible
      ON agent_scheduler_entries(status, eligible_at, enqueue_order);
    CREATE INDEX IF NOT EXISTS idx_agent_scheduler_live_scopes
      ON agent_scheduler_entries(status, provider_id, project_id, thread_id, run_id);
    CREATE INDEX IF NOT EXISTS idx_agent_scheduler_parent
      ON agent_scheduler_entries(run_id, parent_node_id, status);
    CREATE INDEX IF NOT EXISTS idx_agent_completion_leases_run
      ON agent_completion_leases(run_id, acquired_at);
    CREATE INDEX IF NOT EXISTS idx_agent_workspaces_run_status
      ON agent_workspaces(run_id, status, updated_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_workspaces_project_status
      ON agent_workspaces(project_id, status, updated_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_merge_queue_status_order
      ON agent_merge_queue(status, enqueue_order ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_merge_queue_run
      ON agent_merge_queue(run_id, enqueue_order ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_merge_operations_phase
      ON agent_merge_operations(phase, updated_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_workspace_base_files_workspace
      ON agent_workspace_base_files(workspace_id, relative_path ASC);
  `)
}
