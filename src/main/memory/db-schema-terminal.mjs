import { hasColumn } from './db-schema-utils.mjs'

export function ensureTerminalSessionArchiveTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS terminal_session_archive (
      id                       TEXT PRIMARY KEY,
      project                  TEXT NOT NULL DEFAULT '',
      thread_id                TEXT NOT NULL DEFAULT '',
      turn_id                  TEXT NOT NULL DEFAULT '',
      session_id               TEXT NOT NULL DEFAULT '',
      display_name             TEXT NOT NULL DEFAULT '',
      display_label_primary    TEXT NOT NULL DEFAULT '',
      display_label_secondary  TEXT NOT NULL DEFAULT '',
      scope                    TEXT NOT NULL DEFAULT 'workspace',
      cwd                      TEXT NOT NULL DEFAULT '',
      shell                    TEXT NOT NULL DEFAULT '',
      shell_kind               TEXT NOT NULL DEFAULT '',
      profile_hint             TEXT NOT NULL DEFAULT '',
      host_access_required     INTEGER NOT NULL DEFAULT 0,
      opened_at                INTEGER NOT NULL DEFAULT 0,
      closed_at                INTEGER NOT NULL DEFAULT 0,
      close_reason             TEXT NOT NULL DEFAULT '',
      failure_reason           TEXT NOT NULL DEFAULT '',
      exit_code                INTEGER,
      exit_signal              TEXT NOT NULL DEFAULT '',
      opened_by                TEXT NOT NULL DEFAULT '',
      closed_by                TEXT NOT NULL DEFAULT '',
      status                   TEXT NOT NULL DEFAULT 'ended',
      session_title            TEXT NOT NULL DEFAULT '',
      output_tail              TEXT NOT NULL DEFAULT '',
      output_truncated         INTEGER NOT NULL DEFAULT 0,
      output_sequence          INTEGER NOT NULL DEFAULT 0,
      output_mode              TEXT NOT NULL DEFAULT 'tail',
      policy_json              TEXT NOT NULL DEFAULT '{}',
      metadata_json            TEXT NOT NULL DEFAULT '{}',
      memory_candidate_status  TEXT NOT NULL DEFAULT 'none',
      memory_candidate_summary TEXT NOT NULL DEFAULT '',
      memory_candidate_reason  TEXT NOT NULL DEFAULT '',
      memory_node_id           TEXT NOT NULL DEFAULT ''
    );
  `)
}

export function ensureTerminalSessionArchiveColumns(db) {
  const columnDefinitions = [
    ['project', `TEXT NOT NULL DEFAULT ''`],
    ['thread_id', `TEXT NOT NULL DEFAULT ''`],
    ['turn_id', `TEXT NOT NULL DEFAULT ''`],
    ['session_id', `TEXT NOT NULL DEFAULT ''`],
    ['display_name', `TEXT NOT NULL DEFAULT ''`],
    ['display_label_primary', `TEXT NOT NULL DEFAULT ''`],
    ['display_label_secondary', `TEXT NOT NULL DEFAULT ''`],
    ['scope', `TEXT NOT NULL DEFAULT 'workspace'`],
    ['cwd', `TEXT NOT NULL DEFAULT ''`],
    ['shell', `TEXT NOT NULL DEFAULT ''`],
    ['shell_kind', `TEXT NOT NULL DEFAULT ''`],
    ['profile_hint', `TEXT NOT NULL DEFAULT ''`],
    ['host_access_required', `INTEGER NOT NULL DEFAULT 0`],
    ['opened_at', `INTEGER NOT NULL DEFAULT 0`],
    ['closed_at', `INTEGER NOT NULL DEFAULT 0`],
    ['close_reason', `TEXT NOT NULL DEFAULT ''`],
    ['failure_reason', `TEXT NOT NULL DEFAULT ''`],
    ['exit_code', `INTEGER`],
    ['exit_signal', `TEXT NOT NULL DEFAULT ''`],
    ['opened_by', `TEXT NOT NULL DEFAULT ''`],
    ['closed_by', `TEXT NOT NULL DEFAULT ''`],
    ['status', `TEXT NOT NULL DEFAULT 'ended'`],
    ['session_title', `TEXT NOT NULL DEFAULT ''`],
    ['output_tail', `TEXT NOT NULL DEFAULT ''`],
    ['output_truncated', `INTEGER NOT NULL DEFAULT 0`],
    ['output_sequence', `INTEGER NOT NULL DEFAULT 0`],
    ['output_mode', `TEXT NOT NULL DEFAULT 'tail'`],
    ['policy_json', `TEXT NOT NULL DEFAULT '{}'`],
    ['metadata_json', `TEXT NOT NULL DEFAULT '{}'`],
    ['memory_candidate_status', `TEXT NOT NULL DEFAULT 'none'`],
    ['memory_candidate_summary', `TEXT NOT NULL DEFAULT ''`],
    ['memory_candidate_reason', `TEXT NOT NULL DEFAULT ''`],
    ['memory_node_id', `TEXT NOT NULL DEFAULT ''`],
  ]

  for (const [columnName, columnDefinition] of columnDefinitions) {
    if (hasColumn(db, 'terminal_session_archive', columnName)) continue
    db.exec(`ALTER TABLE terminal_session_archive ADD COLUMN ${columnName} ${columnDefinition}`)
  }
}
