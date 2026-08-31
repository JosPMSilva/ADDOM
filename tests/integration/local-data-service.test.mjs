import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-local-data-'))
const tempAttachmentPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-local-data-temp-'))
const siblingPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-local-data-sibling-'))

process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  setKey,
  __setSafeStorageForTests,
  __resetVaultStateForTests,
} = await import('../../src/main/vault.mjs')
const {
  deleteAllApiKeys,
  resolveLocalDataSummary,
  resetCurrentProfileAndRestart,
} = await import('../../src/main/local-data/local-data-service.mjs')

function createMockSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (raw = '') => Buffer.from(`enc:${String(raw || '')}`, 'utf8'),
    decryptString: (buffer) => {
      const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '')
      if (!text.startsWith('enc:')) throw new Error('decrypt_failed')
      return text.slice(4)
    },
  }
}

function ensureFile(targetPath, contents = 'test') {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, contents, 'utf8')
}

test.beforeEach(async () => {
  __resetVaultStateForTests()
  __setSafeStorageForTests(createMockSafeStorage())
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(tempAttachmentPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(siblingPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  fs.mkdirSync(userDataPath, { recursive: true })
  fs.mkdirSync(tempAttachmentPath, { recursive: true })
  fs.mkdirSync(siblingPath, { recursive: true })
  await setKey('openai', 'sk-openai')
})

test.after(() => {
  __setSafeStorageForTests(null)
  __resetVaultStateForTests()
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(tempAttachmentPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(siblingPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('resolveLocalDataSummary reports owned local profile data without exposing secrets', () => {
  ensureFile(path.join(userDataPath, 'settings.json'), '{}')
  ensureFile(path.join(userDataPath, 'settings-security-audit.json'), '{}')
  ensureFile(path.join(userDataPath, 'memory.db'), 'sqlite')
  ensureFile(path.join(userDataPath, 'attachment-cache', 'projects', 'project-1', 'cached.txt'), 'cached')
  ensureFile(path.join(userDataPath, 'models', 'weights.bin'), 'weights')
  ensureFile(path.join(userDataPath, 'openai-account', 'session-summary.json'), '{"hasSession":true}')
  ensureFile(path.join(tempAttachmentPath, 'temp.pdf'), 'temp')

  const summary = resolveLocalDataSummary({ tempAttachmentPath })

  assert.equal(summary.profileKind, 'test')
  assert.equal(summary.userDataPath, userDataPath)
  assert.equal(summary.tempAttachmentPath, tempAttachmentPath)
  assert.equal(summary.configuredProviderCount, 1)
  assert.equal(summary.workspaceDataPresent, true)
  assert.equal(summary.settingsPresent, true)
  assert.equal(summary.attachmentCachePresent, true)
  assert.equal(summary.modelCachePresent, true)
  assert.equal(summary.openAIAccountDataPresent, true)
  assert.equal('apiKey' in summary, false)
})

test('deleteAllApiKeys removes vault file and temp files only', async () => {
  const isolatedProfilesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-delete-profiles-'))
  const activeUserDataPath = path.join(isolatedProfilesRoot, 'addom-dev')
  const legacyUserDataPath = path.join(isolatedProfilesRoot, 'ADDOM')
  const staleTempPath = path.join(activeUserDataPath, 'vault.json.stale-write.tmp')

  try {
    process.env.ADDOM_USER_DATA_PATH = activeUserDataPath
    __resetVaultStateForTests()
    await setKey('openai', 'sk-openai')
    ensureFile(staleTempPath, '{}')
    ensureFile(path.join(activeUserDataPath, 'settings.json'), '{}')
    ensureFile(path.join(activeUserDataPath, 'openai-account', 'session-summary.json'), '{"hasSession":true}')
    ensureFile(path.join(legacyUserDataPath, 'vault.json'), '{"openai":"legacy"}')
    ensureFile(path.join(legacyUserDataPath, 'settings.json'), '{}')

    const result = deleteAllApiKeys()

    assert.equal(result.ok, true)
    assert.equal(fs.existsSync(path.join(activeUserDataPath, 'vault.json')), false)
    assert.equal(fs.existsSync(staleTempPath), false)
    assert.equal(fs.existsSync(path.join(activeUserDataPath, 'settings.json')), true)
    assert.equal(fs.existsSync(path.join(activeUserDataPath, 'openai-account', 'session-summary.json')), true)
    assert.equal(fs.existsSync(path.join(legacyUserDataPath, 'vault.json')), false)
    assert.equal(fs.existsSync(path.join(legacyUserDataPath, 'settings.json')), true)
  } finally {
    process.env.ADDOM_USER_DATA_PATH = userDataPath
    __resetVaultStateForTests()
    try { fs.rmSync(isolatedProfilesRoot, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('resetCurrentProfileAndRestart removes owned local data, clears browser storage, and preserves unrelated siblings', async () => {
  ensureFile(path.join(userDataPath, 'settings.json'), '{}')
  ensureFile(path.join(userDataPath, 'settings-security-audit.json'), '{}')
  ensureFile(path.join(userDataPath, 'memory.db'), 'sqlite')
  ensureFile(path.join(userDataPath, 'memory.db-wal'), 'wal')
  ensureFile(path.join(userDataPath, 'memory.db-shm'), 'shm')
  ensureFile(path.join(userDataPath, 'migration-backups', 'memory-v23-before-v24.db'), 'backup')
  ensureFile(path.join(userDataPath, 'attachment-cache', 'projects', 'project-1', 'cached.txt'), 'cached')
  ensureFile(path.join(userDataPath, 'models', 'weights.bin'), 'weights')
  ensureFile(path.join(userDataPath, 'openai-account', 'session-summary.json'), '{"hasSession":true}')
  ensureFile(path.join(userDataPath, 'openai-account', 'logs', 'bridge.log'), 'sensitive')
  ensureFile(path.join(tempAttachmentPath, 'temp.pdf'), 'temp')
  ensureFile(path.join(siblingPath, 'keep.txt'), 'keep')

  const sessionCalls = []
  const appCalls = []
  const electronSession = {
    async clearStorageData(options = {}) {
      sessionCalls.push({ fn: 'clearStorageData', options })
    },
    async clearCache() {
      sessionCalls.push({ fn: 'clearCache' })
    },
  }
  const appOverride = {
    relaunch() {
      appCalls.push({ fn: 'relaunch' })
    },
    exit(code) {
      appCalls.push({ fn: 'exit', code })
    },
  }

  const result = await resetCurrentProfileAndRestart({
    electronSession,
    tempAttachmentPath,
    appOverride,
  })

  assert.equal(result.ok, true)
  assert.equal(fs.existsSync(path.join(userDataPath, 'vault.json')), false)
  assert.equal(fs.existsSync(path.join(userDataPath, 'settings.json')), false)
  assert.equal(fs.existsSync(path.join(userDataPath, 'settings-security-audit.json')), false)
  assert.equal(fs.existsSync(path.join(userDataPath, 'memory.db')), false)
  assert.equal(fs.existsSync(path.join(userDataPath, 'memory.db-wal')), false)
  assert.equal(fs.existsSync(path.join(userDataPath, 'memory.db-shm')), false)
  assert.equal(fs.existsSync(path.join(userDataPath, 'migration-backups')), false)
  assert.equal(fs.existsSync(path.join(userDataPath, 'attachment-cache')), false)
  assert.equal(fs.existsSync(path.join(userDataPath, 'models')), false)
  assert.equal(fs.existsSync(path.join(userDataPath, 'openai-account')), false)
  assert.equal(fs.existsSync(tempAttachmentPath), false)
  assert.equal(fs.existsSync(path.join(siblingPath, 'keep.txt')), true)

  assert.deepEqual(
    sessionCalls.map((entry) => entry.fn),
    ['clearStorageData', 'clearCache'],
  )
  assert.deepEqual(appCalls, [
    { fn: 'relaunch' },
    { fn: 'exit', code: 0 },
  ])
})
