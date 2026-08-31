import { hasColumn } from './db-schema-utils.mjs'

export function ensureCoreTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id            TEXT PRIMARY KEY,
      sort_id       INTEGER,
      project       TEXT NOT NULL DEFAULT '',
      scope         TEXT NOT NULL DEFAULT 'project',
      thread_id     TEXT,
      origin_thread_id TEXT,
      origin_thread_title TEXT NOT NULL DEFAULT '',
      origin_thread_state TEXT NOT NULL DEFAULT 'active',
      origin_thread_deleted_at INTEGER,
      origin_project_id TEXT,
      origin_project_name TEXT NOT NULL DEFAULT '',
      origin_project_path TEXT NOT NULL DEFAULT '',
      origin_project_state TEXT NOT NULL DEFAULT 'active',
      origin_project_removed_at INTEGER,
      topic         TEXT NOT NULL DEFAULT '',
      content       TEXT NOT NULL DEFAULT '',
      tags          TEXT NOT NULL DEFAULT '[]',
      pinned        INTEGER NOT NULL DEFAULT 0,
      data_policy   TEXT NOT NULL DEFAULT 'standard',
      source        TEXT NOT NULL DEFAULT 'user',
      durability    TEXT NOT NULL DEFAULT 'standard',
      confidence    REAL NOT NULL DEFAULT 0.5,
      compressed    INTEGER NOT NULL DEFAULT 0,
      compressed_into TEXT,
      promoted_at   INTEGER,
      invalidated_at INTEGER,
      superseded_by TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      access_count  INTEGER NOT NULL DEFAULT 1,
      last_accessed INTEGER NOT NULL,
      last_used_at  INTEGER NOT NULL DEFAULT 0,
      embedding     BLOB
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id          TEXT PRIMARY KEY,
      project     TEXT NOT NULL DEFAULT '',
      file_path   TEXT NOT NULL DEFAULT '',
      rev         INTEGER NOT NULL DEFAULT 1,
      content     TEXT NOT NULL DEFAULT '',
      prev_rev_id TEXT,
      source      TEXT NOT NULL DEFAULT 'ai_write',
      note        TEXT NOT NULL DEFAULT '',
      origin_thread_id TEXT,
      origin_thread_title TEXT NOT NULL DEFAULT '',
      origin_turn_id TEXT,
      origin_thread_state TEXT NOT NULL DEFAULT 'active',
      origin_thread_deleted_at INTEGER,
      created_at  INTEGER NOT NULL
    );
  `)
}

export function ensureNodeColumns(db) {
  if (!hasColumn(db, 'nodes', 'sort_id')) {
    db.exec('ALTER TABLE nodes ADD COLUMN sort_id INTEGER')
  }
  if (!hasColumn(db, 'nodes', 'scope')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN scope TEXT NOT NULL DEFAULT 'project'`)
  }
  if (!hasColumn(db, 'nodes', 'thread_id')) {
    db.exec('ALTER TABLE nodes ADD COLUMN thread_id TEXT')
  }
  if (!hasColumn(db, 'nodes', 'origin_thread_id')) {
    db.exec('ALTER TABLE nodes ADD COLUMN origin_thread_id TEXT')
  }
  if (!hasColumn(db, 'nodes', 'origin_thread_title')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN origin_thread_title TEXT NOT NULL DEFAULT ''`)
  }
  if (!hasColumn(db, 'nodes', 'origin_thread_state')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN origin_thread_state TEXT NOT NULL DEFAULT 'active'`)
  }
  if (!hasColumn(db, 'nodes', 'origin_thread_deleted_at')) {
    db.exec('ALTER TABLE nodes ADD COLUMN origin_thread_deleted_at INTEGER')
  }
  if (!hasColumn(db, 'nodes', 'origin_project_id')) {
    db.exec('ALTER TABLE nodes ADD COLUMN origin_project_id TEXT')
  }
  if (!hasColumn(db, 'nodes', 'origin_project_name')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN origin_project_name TEXT NOT NULL DEFAULT ''`)
  }
  if (!hasColumn(db, 'nodes', 'origin_project_path')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN origin_project_path TEXT NOT NULL DEFAULT ''`)
  }
  if (!hasColumn(db, 'nodes', 'origin_project_state')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN origin_project_state TEXT NOT NULL DEFAULT 'active'`)
  }
  if (!hasColumn(db, 'nodes', 'origin_project_removed_at')) {
    db.exec('ALTER TABLE nodes ADD COLUMN origin_project_removed_at INTEGER')
  }
  if (!hasColumn(db, 'nodes', 'compressed')) {
    db.exec('ALTER TABLE nodes ADD COLUMN compressed INTEGER NOT NULL DEFAULT 0')
  }
  if (!hasColumn(db, 'nodes', 'durability')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN durability TEXT NOT NULL DEFAULT 'standard'`)
  }
  if (!hasColumn(db, 'nodes', 'confidence')) {
    db.exec('ALTER TABLE nodes ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5')
  }
  if (!hasColumn(db, 'nodes', 'compressed_into')) {
    db.exec('ALTER TABLE nodes ADD COLUMN compressed_into TEXT')
  }
  if (!hasColumn(db, 'nodes', 'promoted_at')) {
    db.exec('ALTER TABLE nodes ADD COLUMN promoted_at INTEGER')
  }
  if (!hasColumn(db, 'nodes', 'invalidated_at')) {
    db.exec('ALTER TABLE nodes ADD COLUMN invalidated_at INTEGER')
  }
  if (!hasColumn(db, 'nodes', 'superseded_by')) {
    db.exec('ALTER TABLE nodes ADD COLUMN superseded_by TEXT')
  }
  if (!hasColumn(db, 'nodes', 'last_used_at')) {
    db.exec('ALTER TABLE nodes ADD COLUMN last_used_at INTEGER NOT NULL DEFAULT 0')
  }

  db.exec('UPDATE nodes SET compressed = 0 WHERE compressed IS NULL')
  db.exec('UPDATE nodes SET sort_id = rowid WHERE sort_id IS NULL OR sort_id <= 0')
  db.exec(`UPDATE nodes SET scope = 'project' WHERE scope IS NULL OR TRIM(scope) = ''`)
  db.exec(`UPDATE nodes SET durability = 'standard' WHERE durability IS NULL OR TRIM(durability) = ''`)
  db.exec('UPDATE nodes SET confidence = 0.5 WHERE confidence IS NULL')
  db.exec(`
    UPDATE nodes
    SET last_used_at = COALESCE(NULLIF(last_accessed, 0), updated_at, created_at, 0)
    WHERE last_used_at IS NULL OR last_used_at <= 0
  `)
}

export function ensureArtifactColumns(db) {
  if (!hasColumn(db, 'artifacts', 'origin_thread_id')) {
    db.exec('ALTER TABLE artifacts ADD COLUMN origin_thread_id TEXT')
  }
  if (!hasColumn(db, 'artifacts', 'origin_thread_title')) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN origin_thread_title TEXT NOT NULL DEFAULT ''`)
  }
  if (!hasColumn(db, 'artifacts', 'origin_turn_id')) {
    db.exec('ALTER TABLE artifacts ADD COLUMN origin_turn_id TEXT')
  }
  if (!hasColumn(db, 'artifacts', 'origin_thread_state')) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN origin_thread_state TEXT NOT NULL DEFAULT 'active'`)
  }
  if (!hasColumn(db, 'artifacts', 'origin_thread_deleted_at')) {
    db.exec('ALTER TABLE artifacts ADD COLUMN origin_thread_deleted_at INTEGER')
  }
}
