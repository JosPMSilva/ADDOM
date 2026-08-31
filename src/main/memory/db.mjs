/**
 * db.mjs - SQLite connection singleton.
 *
 * Database lives at: <userData>/memory.db
 */

import Database from 'better-sqlite3'
import path from 'path'
import { getUserDataPath } from '../platform/electron-app.mjs'
import { hardenDatabaseFiles } from './db-hardening.mjs'
import { createVerifiedPreMigrationBackup } from './db-migration-backup.mjs'
import { runMigrations, SCHEMA_VERSION } from './db-migrations.mjs'

let _db = null

export function getDb() {
  if (_db) return _db

  const userDataPath = getUserDataPath()
  const dbPath = path.join(userDataPath, 'memory.db')
  _db = new Database(dbPath)
  try {
    hardenDatabaseFiles(dbPath)

    _db.pragma('journal_mode = WAL')
    hardenDatabaseFiles(dbPath)
    _db.pragma('foreign_keys = ON')

    const schemaVersion = Number(_db.pragma('user_version', { simple: true }) || 0)
    if (schemaVersion >= 23 && schemaVersion < SCHEMA_VERSION) {
      createVerifiedPreMigrationBackup({
        db: _db,
        dbPath,
        backupRoot: path.join(userDataPath, 'migration-backups'),
        fromSchemaVersion: schemaVersion,
        toSchemaVersion: SCHEMA_VERSION,
      })
    }

    runMigrations(_db)
    hardenDatabaseFiles(dbPath)
    return _db
  } catch (error) {
    try { _db.close() } catch { /* Preserve the migration failure. */ }
    _db = null
    throw error
  }
}

export function closeDb() {
  if (!_db) return false
  try {
    _db.close()
  } catch {
    // Non-fatal on shutdown.
  }
  _db = null
  return true
}
