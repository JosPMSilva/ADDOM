import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import Database from 'better-sqlite3'

import { createVerifiedPreMigrationBackup } from '../../src/main/memory/db-migration-backup.mjs'
import { runMigrations, SCHEMA_VERSION } from '../../src/main/memory/db-migrations.mjs'

test('v23 to v24 backup is a verified consistent SQLite snapshot created before migration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-conversation-backup-'))
  const sourcePath = path.join(root, 'memory.db')
  const backupRoot = path.join(root, 'migration-backups')
  const db = new Database(sourcePath)
  try {
    db.exec('CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker (value) VALUES (\'before-v24\')')
    db.pragma('user_version = 23')

    const result = createVerifiedPreMigrationBackup({
      db,
      dbPath: sourcePath,
      backupRoot,
      fromSchemaVersion: 23,
      toSchemaVersion: 24,
      now: () => 1_754_000_000_000,
    })

    assert.equal(result.fromSchemaVersion, 23)
    assert.equal(result.toSchemaVersion, 24)
    assert.equal(result.integrity, 'ok')
    assert.equal(fs.existsSync(result.path), true)
    const backup = new Database(result.path, { readonly: true, fileMustExist: true })
    try {
      assert.equal(Number(backup.pragma('user_version', { simple: true })), 23)
      assert.equal(backup.prepare('SELECT value FROM marker').get().value, 'before-v24')
    } finally {
      backup.close()
    }
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('normal database startup backs up v23 before the automatic current-schema migration', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-conversation-startup-'))
  const sourcePath = path.join(root, 'memory.db')
  const seeded = new Database(sourcePath)
  try {
    seeded.exec('CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker (value) VALUES (\'startup-v23\')')
    seeded.pragma('user_version = 23')
  } finally {
    seeded.close()
  }

  const priorUserDataPath = process.env.ADDOM_USER_DATA_PATH
  process.env.ADDOM_USER_DATA_PATH = root
  const dbModule = await import(`../../src/main/memory/db.mjs?agent_backup=${Date.now()}`)
  try {
    const migrated = dbModule.getDb()
    assert.equal(Number(migrated.pragma('user_version', { simple: true })), SCHEMA_VERSION)
    const backups = fs.readdirSync(path.join(root, 'migration-backups')).filter((name) => name.endsWith('.db'))
    assert.equal(backups.length, 1)
    const backup = new Database(path.join(root, 'migration-backups', backups[0]), {
      readonly: true,
      fileMustExist: true,
    })
    try {
      assert.equal(Number(backup.pragma('user_version', { simple: true })), 23)
      assert.equal(backup.prepare('SELECT value FROM marker').get().value, 'startup-v23')
    } finally {
      backup.close()
    }
  } finally {
    dbModule.closeDb()
    if (priorUserDataPath === undefined) delete process.env.ADDOM_USER_DATA_PATH
    else process.env.ADDOM_USER_DATA_PATH = priorUserDataPath
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('normal database startup backs up an existing v24 database before the current schema', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-agent-conversation-v24-startup-'))
  const sourcePath = path.join(root, 'memory.db')
  const seeded = new Database(sourcePath)
  try {
    runMigrations(seeded)
    seeded.exec('CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker (value) VALUES (\'startup-v24\')')
    seeded.pragma('user_version = 24')
  } finally {
    seeded.close()
  }

  const priorUserDataPath = process.env.ADDOM_USER_DATA_PATH
  process.env.ADDOM_USER_DATA_PATH = root
  const dbModule = await import(`../../src/main/memory/db.mjs?agent_v24_backup=${Date.now()}`)
  try {
    const migrated = dbModule.getDb()
    assert.equal(Number(migrated.pragma('user_version', { simple: true })), SCHEMA_VERSION)
    const [backupName] = fs.readdirSync(path.join(root, 'migration-backups'))
      .filter((name) => name.endsWith('.db'))
    const backup = new Database(path.join(root, 'migration-backups', backupName), {
      readonly: true,
      fileMustExist: true,
    })
    try {
      assert.equal(Number(backup.pragma('user_version', { simple: true })), 24)
      assert.equal(backup.prepare('SELECT value FROM marker').get().value, 'startup-v24')
    } finally {
      backup.close()
    }
  } finally {
    dbModule.closeDb()
    if (priorUserDataPath === undefined) delete process.env.ADDOM_USER_DATA_PATH
    else process.env.ADDOM_USER_DATA_PATH = priorUserDataPath
    fs.rmSync(root, { recursive: true, force: true })
  }
})
