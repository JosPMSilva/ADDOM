import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-vault-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const vaultFilePath = path.join(userDataPath, 'vault.json')

function listVaultTempPaths() {
  try {
    return fs.readdirSync(userDataPath)
      .filter((name) => name.startsWith('vault.json.') && name.endsWith('.tmp'))
      .map((name) => path.join(userDataPath, name))
  } catch {
    return []
  }
}

const {
  setKey,
  getKey,
  deleteKey,
  listConfiguredProviders,
  __setSafeStorageForTests,
  __resetVaultStateForTests,
} = await import('../../src/main/vault.mjs')

function createMockSafeStorage({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (raw = '') => Buffer.from(`enc:${String(raw || '')}`, 'utf8'),
    decryptString: (buffer) => {
      const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '')
      if (!text.startsWith('enc:')) {
        throw new Error('decrypt_failed')
      }
      return text.slice(4)
    },
  }
}

function resetVaultFile() {
  try { fs.rmSync(vaultFilePath, { force: true }) } catch { /* best-effort test cleanup */ }
  for (const tempPath of listVaultTempPaths()) {
    try { fs.rmSync(tempPath, { force: true }) } catch { /* best-effort test cleanup */ }
  }
}

test.beforeEach(() => {
  __resetVaultStateForTests()
  __setSafeStorageForTests(createMockSafeStorage({ available: true }))
  resetVaultFile()
})

test.after(() => {
  __setSafeStorageForTests(null)
  __resetVaultStateForTests()
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('setKey/getKey round-trip and configured providers listing', async () => {
  await setKey('openai', 'sk-openai')
  await setKey('anthropic', 'sk-anthropic')

  assert.equal(getKey('openai'), 'sk-openai')
  assert.equal(getKey('anthropic'), 'sk-anthropic')
  assert.deepEqual(listConfiguredProviders(), {
    openai: true,
    anthropic: true,
  })
})

test('deleteKey removes provider entry from vault', async () => {
  await setKey('openai', 'sk-openai')
  assert.equal(getKey('openai'), 'sk-openai')

  await deleteKey('openai')
  assert.equal(getKey('openai'), null)
  assert.deepEqual(listConfiguredProviders(), {})
})

test('write path falls back to direct write when rename fails and cleans temp file', async () => {
  const originalRename = fs.renameSync
  let renameCalls = 0
  fs.renameSync = () => {
    renameCalls += 1
    throw new Error('rename_blocked_for_test')
  }

  try {
    await setKey('openai', 'sk-openai')
  } finally {
    fs.renameSync = originalRename
  }

  assert.ok(renameCalls >= 1)
  assert.equal(fs.existsSync(vaultFilePath), true)
  assert.deepEqual(listVaultTempPaths(), [])
  assert.equal(getKey('openai'), 'sk-openai')
})

test('vault writes clean up stale temp files from prior interrupted writes', async () => {
  const staleTempPath = path.join(userDataPath, 'vault.json.stale-write.tmp')
  fs.writeFileSync(staleTempPath, '{}', 'utf8')
  assert.equal(fs.existsSync(staleTempPath), true)

  await setKey('openai', 'sk-openai')

  assert.equal(fs.existsSync(staleTempPath), false)
  assert.deepEqual(listVaultTempPaths(), [])
})

test('vault cache invalidates when vault file is modified externally', async () => {
  await setKey('openai', 'sk-old')
  assert.equal(getKey('openai'), 'sk-old')

  const replacement = {
    anthropic: Buffer.from('enc:sk-new', 'utf8').toString('base64'),
  }
  fs.writeFileSync(vaultFilePath, JSON.stringify(replacement), 'utf8')
  const bump = new Date(Date.now() + 2_000)
  fs.utimesSync(vaultFilePath, bump, bump)

  assert.equal(getKey('openai'), null)
  assert.equal(getKey('anthropic'), 'sk-new')
  assert.deepEqual(listConfiguredProviders(), { anthropic: true })
})

test('vault follows the active user-data path when it changes after module import', async () => {
  const nextUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-vault-next-'))
  const nextVaultFilePath = path.join(nextUserDataPath, 'vault.json')

  try {
    process.env.ADDOM_USER_DATA_PATH = nextUserDataPath
    __resetVaultStateForTests()

    await setKey('openai', 'sk-next')

    assert.equal(fs.existsSync(nextVaultFilePath), true)
    assert.equal(fs.existsSync(vaultFilePath), false)
    assert.equal(getKey('openai'), 'sk-next')
    assert.deepEqual(listConfiguredProviders(), { openai: true })
  } finally {
    process.env.ADDOM_USER_DATA_PATH = userDataPath
    __resetVaultStateForTests()
    try { fs.rmSync(nextUserDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('setKey/getKey fall back safely when encryption is unavailable', async () => {
  __setSafeStorageForTests(createMockSafeStorage({ available: false }))

  await assert.rejects(
    () => setKey('openai', 'sk-openai'),
    /OS encryption is not available/i,
  )
  assert.equal(getKey('openai'), null)
  assert.deepEqual(listConfiguredProviders(), {})
})

test('vault file permissions are hardened on unix-like platforms', async (t) => {
  if (process.platform === 'win32') {
    t.skip('vault permission hardening is skipped on Windows')
    return
  }

  await setKey('openai', 'sk-openai')
  const stat = fs.statSync(vaultFilePath)
  const mode = stat.mode & 0o777
  assert.equal(mode, 0o600)
})
