import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

import { hardenDatabaseFiles } from './db-hardening.mjs'

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function availableBackupPath(backupRoot, fromSchemaVersion, toSchemaVersion, now) {
  const stamp = new Date(now()).toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')
  const base = `memory-v${fromSchemaVersion}-before-v${toSchemaVersion}-${stamp}`
  let candidate = path.join(backupRoot, `${base}.db`)
  let suffix = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(backupRoot, `${base}-${suffix}.db`)
    suffix += 1
  }
  return candidate
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

export function createVerifiedPreMigrationBackup({
  db,
  dbPath,
  backupRoot,
  fromSchemaVersion,
  toSchemaVersion,
  now = Date.now,
} = {}) {
  if (!db) throw new TypeError('db is required')
  if (!dbPath || !backupRoot) throw new TypeError('dbPath and backupRoot are required')
  const currentVersion = Number(db.pragma('user_version', { simple: true }) || 0)
  if (currentVersion !== fromSchemaVersion) {
    throw new Error(`Expected schema v${fromSchemaVersion} before backup, found v${currentVersion}`)
  }
  fs.mkdirSync(backupRoot, { recursive: true })
  const backupPath = availableBackupPath(backupRoot, fromSchemaVersion, toSchemaVersion, now)
  try {
    db.exec(`VACUUM INTO ${sqlString(backupPath)}`)
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true })
    let integrity
    let backupVersion
    try {
      integrity = String(backup.pragma('integrity_check', { simple: true }) || '')
      backupVersion = Number(backup.pragma('user_version', { simple: true }) || 0)
    } finally {
      backup.close()
    }
    if (integrity !== 'ok' || backupVersion !== fromSchemaVersion) {
      throw new Error(`Pre-migration backup verification failed (integrity=${integrity}, schema=v${backupVersion})`)
    }
    hardenDatabaseFiles(backupPath)
    return Object.freeze({
      path: backupPath,
      fromSchemaVersion,
      toSchemaVersion,
      integrity,
      sizeBytes: fs.statSync(backupPath).size,
      sha256: sha256(backupPath),
    })
  } catch (error) {
    fs.rmSync(backupPath, { force: true })
    throw error
  }
}
