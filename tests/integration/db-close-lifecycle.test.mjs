import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-db-close-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getDb, closeDb } = await import('../../src/main/memory/db.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('closeDb is idempotent and allows reopening', (t) => {
  try {
    const db = getDb()
    const row = db.prepare('SELECT 1 AS ok').get()
    assert.equal(Number(row?.ok || 0), 1)

    assert.equal(closeDb(), true)
    assert.equal(closeDb(), false)

    const reopened = getDb()
    const reopenedRow = reopened.prepare('SELECT 1 AS ok').get()
    assert.equal(Number(reopenedRow?.ok || 0), 1)
    assert.equal(closeDb(), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('main process wires coordinated runtime settlement on quit lifecycle', () => {
  const indexSource = fs.readFileSync(path.join(process.cwd(), 'src/main/index.mjs'), 'utf8')
  const shutdownSource = fs.readFileSync(path.join(process.cwd(), 'src/main/app-runtime-shutdown.mjs'), 'utf8')
  const registrationSource = fs.readFileSync(path.join(process.cwd(), 'src/main/main-ipc-registration.mjs'), 'utf8')
  assert.match(indexSource, /createAppQuitCoordinator\(/)
  assert.match(indexSource, /app\.on\('before-quit',\s*appQuitCoordinator\.handleBeforeQuit\)/)
  assert.match(indexSource, /prepareAppRuntimeShutdown/)
  assert.match(shutdownSource, /interruptAndWait\(\s*\{\},\s*\{\s*reason:\s*'Application quit\.'\s*\}\s*,?\s*\)/)
  assert.match(indexSource, /await reconcileWorkspaceTurnsOnStartup\(\)/)
  assert.doesNotMatch(indexSource, /app\.on\('will-quit',\s*closeDbOnQuit\)/)
  assert.match(registrationSource, /beforeReset:\s*prepareForExit/)
})

test('memory db source validates PRAGMA table names strictly', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/main/memory/db-schema-utils.mjs'), 'utf8')
  assert.match(source, /const SAFE_PRAGMA_TABLE_NAME_RE = \/\^\[a-z_\]\+\$\//)
  assert.match(source, /if \(!SAFE_PRAGMA_TABLE_NAME_RE\.test\(tableName\)\) return false/)
})

test('memory db and sidecar file permissions are hardened on unix-like platforms', (t) => {
  if (process.platform === 'win32') {
    t.skip('memory db permission hardening is skipped on Windows')
    return
  }

  try {
    const db = getDb()
    const row = db.prepare('SELECT 1 AS ok').get()
    assert.equal(Number(row?.ok || 0), 1)
    db.prepare('INSERT INTO nodes (id, created_at, updated_at, last_accessed) VALUES (?, ?, ?, ?)').run(
      `perm_probe_${Date.now()}`,
      Date.now(),
      Date.now(),
      Date.now(),
    )

    const candidatePaths = [
      path.join(userDataPath, 'memory.db'),
      path.join(userDataPath, 'memory.db-wal'),
      path.join(userDataPath, 'memory.db-shm'),
    ]

    for (const candidatePath of candidatePaths) {
      if (!fs.existsSync(candidatePath)) continue
      const stat = fs.statSync(candidatePath)
      assert.equal(stat.mode & 0o777, 0o600, `${path.basename(candidatePath)} should be owner-only`)
    }
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  } finally {
    closeDb()
  }
})
