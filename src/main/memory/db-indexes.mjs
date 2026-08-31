export function ensureIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project);
    CREATE INDEX IF NOT EXISTS idx_nodes_pinned ON nodes(pinned);
    CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_nodes_project_sort ON nodes(project, pinned DESC, sort_id DESC);
    CREATE INDEX IF NOT EXISTS idx_nodes_project_compressed ON nodes(project, compressed);
    CREATE INDEX IF NOT EXISTS idx_nodes_project_source_sort ON nodes(project, source, compressed, sort_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_project_scope_updated ON nodes(project, scope, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_nodes_thread_scope_updated ON nodes(thread_id, scope, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_nodes_project_scope_source_compressed_pinned
      ON nodes(project, scope, source, compressed, pinned);
    CREATE INDEX IF NOT EXISTS idx_nodes_scope_last_used ON nodes(scope, last_used_at DESC);
    CREATE INDEX IF NOT EXISTS idx_nodes_origin_thread_promoted
      ON nodes(origin_thread_id, promoted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_nodes_origin_thread_state_scope
      ON nodes(origin_thread_id, origin_thread_state, scope);
    CREATE INDEX IF NOT EXISTS idx_nodes_origin_project_state
      ON nodes(origin_project_id, origin_project_state);

    CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project);
    CREATE INDEX IF NOT EXISTS idx_artifacts_file ON artifacts(project, file_path);
    CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_artifacts_origin_thread
      ON artifacts(project, origin_thread_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_workspace_projects_last_worked
      ON workspace_projects(last_worked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_project_updated
      ON chat_threads(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_project_archived
      ON chat_threads(project_id, archived, id);
    CREATE INDEX IF NOT EXISTS idx_chat_events_thread_event
      ON chat_events(thread_id, event_id ASC);
    CREATE INDEX IF NOT EXISTS idx_chat_events_kind_thread_event_desc
      ON chat_events(kind, thread_id, event_id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_events_canonical_identity
      ON chat_events(thread_id, canonical_event_id)
      WHERE canonical_event_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_events_turn_sequence
      ON chat_events(thread_id, turn_id, local_sequence)
      WHERE schema_version > 0;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_events_progressive_identity
      ON chat_events(thread_id, turn_id, progressive_key)
      WHERE schema_version > 0 AND progressive_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_events_provider_delivery
      ON chat_events(thread_id, provider_correlation_key, provider_event_id)
      WHERE schema_version > 0
        AND provider_correlation_key IS NOT NULL
        AND provider_event_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_chat_attachments_thread_created
      ON chat_attachments(thread_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_attachments_project_created
      ON chat_attachments(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_attachments_created
      ON chat_attachments(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_moa_agent_memory_project_scope
      ON moa_agent_memory(project_id, scope_key, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_continuity_snapshots_thread_created
      ON continuity_snapshots(thread_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_continuity_facts_thread_status_used
      ON continuity_facts(thread_id, status, last_used_at DESC);
    CREATE INDEX IF NOT EXISTS idx_continuity_facts_project_status_updated
      ON continuity_facts(project, status, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_continuity_facts_thread_key
      ON continuity_facts(thread_id, fact_key);
    CREATE INDEX IF NOT EXISTS idx_continuity_invariants_thread_status_updated
      ON continuity_invariants(thread_id, status, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_continuity_invariants_thread_key
      ON continuity_invariants(thread_id, invariant_key);
    CREATE INDEX IF NOT EXISTS idx_thread_continuity_state_updated
      ON thread_continuity_state(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_thread_continuity_turns_thread_created
      ON thread_continuity_turns(thread_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_provider_files_provider_project
      ON provider_files(provider_id, project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_files_remote
      ON provider_files(provider_id, remote_file_id);
    CREATE INDEX IF NOT EXISTS idx_provider_files_sha
      ON provider_files(provider_id, project_id, sha256, size_bytes);
    CREATE INDEX IF NOT EXISTS idx_provider_files_last_used
      ON provider_files(last_used_at DESC);

    CREATE INDEX IF NOT EXISTS idx_provider_vector_stores_provider_project
      ON provider_vector_stores(provider_id, project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_vector_stores_remote
      ON provider_vector_stores(provider_id, remote_vector_store_id);
    CREATE INDEX IF NOT EXISTS idx_provider_vector_stores_last_used
      ON provider_vector_stores(last_used_at DESC);

    CREATE INDEX IF NOT EXISTS idx_provider_vector_store_files_store
      ON provider_vector_store_files(vector_store_record_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_vector_store_files_file
      ON provider_vector_store_files(provider_file_record_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_vector_store_files_remote
      ON provider_vector_store_files(provider_id, remote_vector_store_file_id);
    CREATE INDEX IF NOT EXISTS idx_provider_vector_store_files_last_used
      ON provider_vector_store_files(last_used_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_budget_profiles_identity
      ON provider_budget_profiles(provider_id, organization_id, workspace_id, credential_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_provider_budget_profiles_last_observed
      ON provider_budget_profiles(provider_id, last_observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_budget_profiles_last_resolved
      ON provider_budget_profiles(provider_id, last_resolved_at DESC);

    CREATE INDEX IF NOT EXISTS idx_openai_thread_state_project
      ON openai_thread_state(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_openai_thread_state_response
      ON openai_thread_state(last_response_id);
    CREATE INDEX IF NOT EXISTS idx_openai_thread_state_last_used
      ON openai_thread_state(last_used_at DESC);

    CREATE INDEX IF NOT EXISTS idx_openai_background_jobs_status
      ON openai_background_jobs(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_openai_background_jobs_thread_status
      ON openai_background_jobs(thread_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_openai_background_jobs_project_status
      ON openai_background_jobs(project_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_openai_background_jobs_response
      ON openai_background_jobs(remote_response_id);
    CREATE INDEX IF NOT EXISTS idx_openai_background_jobs_message
      ON openai_background_jobs(assistant_message_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_session_archive_session_id
      ON terminal_session_archive(session_id);
    CREATE INDEX IF NOT EXISTS idx_terminal_session_archive_project_closed
      ON terminal_session_archive(project, closed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_terminal_session_archive_project_thread_closed
      ON terminal_session_archive(project, thread_id, closed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_terminal_session_archive_project_payload
      ON terminal_session_archive(project, closed_at DESC)
      WHERE LENGTH(output_tail) > 0;
  `)
}
