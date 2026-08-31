import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-vault-concurrency-'))
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
      if (!text.startsWith('enc:')) throw new Error('decrypt_failed')
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

test('vault write queue preserves call order under concurrent setKey calls', async () => {
  await Promise.all([
    setKey('openai', 'sk-openai-a'),
    setKey('openai', 'sk-openai-b'),
    setKey('anthropic', 'sk-anthropic'),
  ])

  assert.equal(getKey('openai'), 'sk-openai-b')
  assert.equal(getKey('anthropic'), 'sk-anthropic')
  assert.deepEqual(listConfiguredProviders(), {
    openai: true,
    anthropic: true,
  })
  assert.deepEqual(listVaultTempPaths(), [])
})

test('vault write queue handles interleaved set/delete deterministically', async () => {
  await Promise.all([
    setKey('openai', 'sk-initial'),
    deleteKey('openai'),
    setKey('openai', 'sk-final'),
  ])

  assert.equal(getKey('openai'), 'sk-final')
  assert.deepEqual(listConfiguredProviders(), { openai: true })
})

test('vault queue continues processing after a rejected write', async () => {
  __setSafeStorageForTests(createMockSafeStorage({ available: false }))
  await assert.rejects(
    () => setKey('openai', 'sk-fail'),
    /OS encryption is not available/i,
  )

  __setSafeStorageForTests(createMockSafeStorage({ available: true }))
  await setKey('openai', 'sk-recovered')

  assert.equal(getKey('openai'), 'sk-recovered')
  assert.deepEqual(listConfiguredProviders(), { openai: true })
})
