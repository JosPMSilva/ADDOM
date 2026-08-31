export function ensureAgentConversationTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_conversations (
      id                    TEXT PRIMARY KEY,
      project_id            TEXT NOT NULL,
      root_thread_id        TEXT NOT NULL,
      parent_conversation_id TEXT,
      creator_turn_id       TEXT,
      owner_kind            TEXT NOT NULL,
      owner_id              TEXT NOT NULL,
      role_id               TEXT NOT NULL,
      provider_route_json   TEXT NOT NULL,
      scope                 TEXT NOT NULL,
      status                TEXT NOT NULL,
      contract_json         TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES workspace_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(root_thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_turns (
      id                    TEXT PRIMARY KEY,
      conversation_id       TEXT NOT NULL,
      turn_sequence         INTEGER NOT NULL,
      idempotency_key       TEXT NOT NULL,
      status                TEXT NOT NULL,
      final_message_id      TEXT,
      contract_json         TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL,
      UNIQUE(conversation_id, id),
      UNIQUE(conversation_id, turn_sequence),
      UNIQUE(conversation_id, idempotency_key),
      FOREIGN KEY(conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id                    TEXT PRIMARY KEY,
      conversation_id       TEXT NOT NULL,
      turn_id               TEXT NOT NULL,
      message_sequence      INTEGER NOT NULL,
      kind                  TEXT NOT NULL,
      author_kind           TEXT NOT NULL,
      author_id             TEXT NOT NULL,
      idempotency_key       TEXT NOT NULL,
      content_parts_json    TEXT NOT NULL,
      contract_json         TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      UNIQUE(conversation_id, id),
      UNIQUE(conversation_id, message_sequence),
      UNIQUE(conversation_id, idempotency_key),
      FOREIGN KEY(conversation_id, turn_id)
        REFERENCES agent_turns(conversation_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_mailbox_entries (
      id                    TEXT PRIMARY KEY,
      message_id            TEXT NOT NULL,
      conversation_id       TEXT NOT NULL,
      target_turn_id        TEXT,
      enqueue_sequence      INTEGER NOT NULL,
      delivery_state        TEXT NOT NULL,
      idempotency_key       TEXT NOT NULL,
      contract_json         TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      delivered_at          INTEGER,
      delivery_lease_id     TEXT,
      delivery_lease_expires_at INTEGER,
      delivery_attempts     INTEGER NOT NULL DEFAULT 0,
      UNIQUE(conversation_id, enqueue_sequence),
      UNIQUE(conversation_id, idempotency_key),
      FOREIGN KEY(conversation_id, message_id)
        REFERENCES agent_messages(conversation_id, id) ON DELETE CASCADE,
      FOREIGN KEY(target_turn_id) REFERENCES agent_turns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS agent_promotion_snapshots (
      id                    TEXT PRIMARY KEY,
      source_conversation_id TEXT NOT NULL,
      source_turn_id        TEXT NOT NULL,
      source_sequence       INTEGER NOT NULL,
      idempotency_key       TEXT NOT NULL UNIQUE,
      contract_json         TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      FOREIGN KEY(source_conversation_id, source_turn_id)
        REFERENCES agent_turns(conversation_id, id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_nodes_id_run
      ON agent_nodes(id, run_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_attempts_id_node
      ON agent_attempts(id, node_id);

    CREATE TABLE IF NOT EXISTS agent_node_conversation_bindings (
      node_id               TEXT PRIMARY KEY,
      run_id                TEXT NOT NULL,
      conversation_id       TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      UNIQUE(node_id, conversation_id),
      FOREIGN KEY(node_id, run_id) REFERENCES agent_nodes(id, run_id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_attempt_turn_bindings (
      attempt_id            TEXT PRIMARY KEY,
      node_id               TEXT NOT NULL,
      conversation_id       TEXT NOT NULL,
      turn_id               TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      FOREIGN KEY(attempt_id, node_id) REFERENCES agent_attempts(id, node_id) ON DELETE CASCADE,
      FOREIGN KEY(node_id, conversation_id)
        REFERENCES agent_node_conversation_bindings(node_id, conversation_id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id, turn_id)
        REFERENCES agent_turns(conversation_id, id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_conversations_thread_status
      ON agent_conversations(root_thread_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_conversations_parent
      ON agent_conversations(parent_conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation_sequence
      ON agent_turns(conversation_id, turn_sequence ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation_sequence
      ON agent_messages(conversation_id, message_sequence ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_mailbox_conversation_sequence
      ON agent_mailbox_entries(conversation_id, enqueue_sequence ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_attempt_turn_bindings_turn
      ON agent_attempt_turn_bindings(turn_id, attempt_id);
  `)
}

export function ensureAgentConversationMailboxDeliveryColumns(db) {
  const columns = new Set(db.prepare('PRAGMA table_info(agent_mailbox_entries)').all().map((row) => row.name))
  if (!columns.has('delivery_lease_id')) db.exec('ALTER TABLE agent_mailbox_entries ADD COLUMN delivery_lease_id TEXT')
  if (!columns.has('delivery_lease_expires_at')) db.exec('ALTER TABLE agent_mailbox_entries ADD COLUMN delivery_lease_expires_at INTEGER')
  if (!columns.has('delivery_attempts')) db.exec('ALTER TABLE agent_mailbox_entries ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0')
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_mailbox_delivery_claim
      ON agent_mailbox_entries(conversation_id, delivery_state, enqueue_sequence ASC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_turns_one_active_per_conversation
      ON agent_turns(conversation_id)
      WHERE status IN ('queued', 'running', 'waiting');
  `)
}

export function ensureAgentPromotionRetentionTables(db) {
  const promotionForeignKeys = db.prepare('PRAGMA foreign_key_list(agent_promotion_snapshots)').all()
  if (promotionForeignKeys.some((row) => row.table === 'agent_turns')) {
    db.exec(`
      ALTER TABLE agent_promotion_snapshots RENAME TO agent_promotion_snapshots_legacy;
      CREATE TABLE agent_promotion_snapshots (
        id                    TEXT PRIMARY KEY,
        source_conversation_id TEXT NOT NULL,
        source_turn_id        TEXT NOT NULL,
        source_sequence       INTEGER NOT NULL,
        idempotency_key       TEXT NOT NULL UNIQUE,
        contract_json         TEXT NOT NULL,
        created_at            INTEGER NOT NULL
      );
      INSERT INTO agent_promotion_snapshots (
        id, source_conversation_id, source_turn_id, source_sequence, idempotency_key, contract_json, created_at
      ) SELECT id, source_conversation_id, source_turn_id, source_sequence, idempotency_key, contract_json, created_at
        FROM agent_promotion_snapshots_legacy;
      DROP TABLE agent_promotion_snapshots_legacy;
    `)
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_thread_origins (
      thread_id              TEXT PRIMARY KEY,
      snapshot_id            TEXT NOT NULL UNIQUE,
      source_conversation_id TEXT NOT NULL,
      source_turn_id         TEXT NOT NULL,
      source_sequence        INTEGER,
      source_role_id         TEXT NOT NULL,
      source_project_id      TEXT,
      source_thread_id       TEXT,
      source_run_id          TEXT,
      source_node_id         TEXT,
      provider_provenance_json TEXT NOT NULL,
      authority_json         TEXT NOT NULL,
      created_at             INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_project_thread_origins_source
      ON project_thread_origins(source_conversation_id, source_turn_id);
  `)
  const originColumns = new Set(db.prepare('PRAGMA table_info(project_thread_origins)').all().map((row) => row.name))
  for (const [name, type] of [
    ['source_sequence', 'INTEGER'],
    ['source_project_id', 'TEXT'],
    ['source_thread_id', 'TEXT'],
    ['source_run_id', 'TEXT'],
    ['source_node_id', 'TEXT'],
  ]) {
    if (!originColumns.has(name)) db.exec(`ALTER TABLE project_thread_origins ADD COLUMN ${name} ${type}`)
  }
}
