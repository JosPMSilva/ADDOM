import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-account-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  setKey,
  __setSafeStorageForTests,
  __resetVaultStateForTests,
} = await import('../../src/main/vault.mjs')
const {
  createOpenAIAccountAuthService,
} = await import('../../src/main/openai-account/openai-account-auth-service.mjs')
const {
  createOpenAIAccountRuntimeManager,
} = await import('../../src/main/openai-account/openai-account-runtime-manager.mjs')
const {
  OpenAIAccountBridge,
} = await import('../../src/main/openai-account/openai-account-bridge.mjs')
const {
  clearOpenAIAccountStorage,
  resolveOpenAIAccountStoragePaths,
} = await import('../../src/main/openai-account/openai-account-storage.mjs')

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

function createBridgeStub({
  availability = { supported: true, reason: '', message: '' },
  loginResult = { loginId: 'login_1', authUrl: 'https://chatgpt.com/auth' },
  accountResult = {
    account: { type: 'chatgpt', email: 'dev@example.com', planType: 'plus' },
    requiresOpenaiAuth: true,
  },
  rateLimitsResult = { tier: 'plus' },
  collaborationModesResult = [
    { id: 'default', name: 'Default', isDefault: true },
    { id: 'plan', name: 'Plan', isDefault: false },
  ],
} = {}) {
  const bridge = new EventEmitter()
  bridge.getAvailability = () => ({ ...availability })
  bridge.probeAvailability = async () => ({ ...availability })
  bridge.startLogin = async () => ({ ...loginResult })
  bridge.cancelLogin = async () => ({ ok: true })
  bridge.logout = async () => ({ ok: true })
  bridge.stop = async () => ({ stopped: true })
  bridge.readAccount = async () => ({ ...accountResult })
  bridge.readRateLimits = async () => ({ ...rateLimitsResult })
  bridge.listCollaborationModes = async () => collaborationModesResult.map((entry) => ({ ...entry }))
  return bridge
}

function createRuntimeManagerStub(initialState = {}) {
  const state = {
    status: 'runtime_ready',
    reason: '',
    message: 'Pinned Codex runtime is ready.',
    version: 'rust-v0.116.0',
    assetName: 'codex-x86_64-pc-windows-msvc.exe',
    executablePath: 'C:\\runtime\\codex.exe',
    source: 'managed',
    bytesDownloaded: 0,
    totalBytes: 0,
    percent: 0,
    checkedAt: Date.now(),
    ...initialState,
  }
  return {
    getState: () => ({ ...state }),
    refreshState: () => ({ ...state }),
    ensureRuntimeReady: async () => ({ ...state }),
    on: () => {},
  }
}

function createBridgeProcessStubForAuthService() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdout.setEncoding = () => {}
  child.stderr.setEncoding = () => {}
  child.writes = []
  child.stdin = {
    write: (line, _encoding, callback) => {
      const payload = JSON.parse(String(line || '').trim())
      child.writes.push(payload)
      queueMicrotask(() => {
        if (payload.method === 'initialize') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: { platformFamily: 'desktop', platformOs: 'windows' },
          })}\n`)
        } else if (payload.method === 'account/read') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: {
              account: { type: 'chatgpt', email: 'dev@example.com', planType: 'plus' },
              requiresOpenaiAuth: true,
            },
          })}\n`)
        } else if (payload.method === 'account/rateLimits/read') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: { tier: 'plus' },
          })}\n`)
        } else if (payload.method === 'collaborationMode/list') {
          child.stdout.emit('data', `${JSON.stringify({
            id: payload.id,
            result: {
              collaborationModes: [
                { id: 'default', name: 'Default', default: true },
                { id: 'plan', name: 'Plan' },
              ],
            },
          })}\n`)
        }
        callback?.(null)
      })
    },
  }
  child.kill = () => {
    child.emit('exit', 0, 'SIGTERM')
  }
  return child
}

test.beforeEach(async () => {
  __resetVaultStateForTests()
  __setSafeStorageForTests(createMockSafeStorage())
  clearOpenAIAccountStorage(userDataPath)
  try { fs.rmSync(path.join(userDataPath, 'vault.json'), { force: true }) } catch { /* best-effort cleanup */ }
  fs.mkdirSync(userDataPath, { recursive: true })
  await setKey('openai', 'sk-openai')
})

test.after(() => {
  __setSafeStorageForTests(null)
  __resetVaultStateForTests()
  clearOpenAIAccountStorage(userDataPath)
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('startLogin fails closed without writing account tokens into the vault', async () => {
  const service = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager: createRuntimeManagerStub(),
    bridgeSupported: false,
    now: () => 1_710_000_000_000,
    openExternalUrl: async () => false,
  })
  const vaultBefore = fs.readFileSync(path.join(userDataPath, 'vault.json'), 'utf8')

  const result = await service.startLogin()
  const storagePaths = resolveOpenAIAccountStoragePaths(userDataPath)
  const persistedLogin = JSON.parse(fs.readFileSync(storagePaths.activeLoginFilePath, 'utf8'))
  const vaultAfter = fs.readFileSync(path.join(userDataPath, 'vault.json'), 'utf8')

  assert.equal(result.ok, false)
  assert.equal(result.reused, false)
  assert.equal(result.sessionSummary.hasSession, false)
  assert.equal(result.activeLogin.phase, 'failed')
  assert.equal(result.activeLogin.errorCode, 'bridge_unavailable')
  assert.equal(persistedLogin.phase, 'failed')
  assert.equal(vaultAfter, vaultBefore)
  assert.equal(fs.existsSync(storagePaths.codexHomePath), true)
  assert.equal(fs.existsSync(storagePaths.logsPath), true)
  assert.equal(fs.existsSync(storagePaths.sessionsPath), true)
})

test('startLogin opens browser flow, tracks waiting state, and hydrates connected account after bridge notifications', async () => {
  const bridge = createBridgeStub()
  let openedUrl = ''
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_200_000,
    openExternalUrl: async (url) => {
      openedUrl = String(url || '')
      return true
    },
  })

  const started = await service.startLogin()
  assert.equal(started.ok, true)
  assert.equal(started.activeLogin.phase, 'waiting_for_callback')
  assert.equal(started.activeLogin.browserOpened, true)
  assert.equal(started.activeLogin.authUrl, 'https://chatgpt.com/auth')
  assert.equal(openedUrl, 'https://chatgpt.com/auth')

  const storagePaths = resolveOpenAIAccountStoragePaths(userDataPath)
  const persistedLogin = JSON.parse(fs.readFileSync(storagePaths.activeLoginFilePath, 'utf8'))
  assert.equal(persistedLogin.authUrl, '')

  bridge.emit('account/login/completed', {
    loginId: 'login_1',
    success: true,
    error: null,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const state = service.getState()
  assert.equal(state.activeLogin.phase, 'succeeded')
  assert.equal(state.sessionSummary.hasSession, true)
  assert.equal(state.sessionSummary.status, 'connected')
  assert.equal(state.sessionSummary.email, 'dev@example.com')
  assert.equal(state.sessionSummary.label, 'dev@example.com')
  assert.equal(state.sessionSummary.planType, 'plus')
  assert.deepEqual(state.sessionSummary.rateLimitSummary, { tier: 'plus' })
  assert.deepEqual(state.sessionSummary.collaborationModes, [
    { id: 'default', name: 'Default', description: '', isDefault: true },
    { id: 'plan', name: 'Plan', description: '', isDefault: false },
  ])
  assert.equal(state.sessionSummary.defaultCollaborationModeId, 'default')
})

test('refreshState eagerly loads collaboration modes for connected account sessions', async () => {
  let listCalls = 0
  const bridge = createBridgeStub()
  bridge.listCollaborationModes = async () => {
    listCalls += 1
    return [
      { id: 'default', name: 'Default', isDefault: true },
      { id: 'plan', name: 'Plan', isDefault: false },
    ]
  }
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_210_000,
    openExternalUrl: async () => false,
  })

  const state = await service.refreshState()

  assert.equal(listCalls, 1)
  assert.equal(state.sessionSummary.defaultCollaborationModeId, 'default')
  assert.deepEqual(state.sessionSummary.collaborationModes, [
    { id: 'default', name: 'Default', description: '', isDefault: true },
    { id: 'plan', name: 'Plan', description: '', isDefault: false },
  ])
})

test('resolveNativeCollaborationModeId reuses collaboration modes already loaded during refreshState', async () => {
  let listCalls = 0
  const bridge = createBridgeStub()
  bridge.listCollaborationModes = async () => {
    listCalls += 1
    return [
      { id: 'default', name: 'Default', isDefault: true },
      { id: 'plan', name: 'Plan', isDefault: false },
    ]
  }
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_210_000,
    openExternalUrl: async () => false,
  })

  await service.refreshState()
  const selectedModeId = await service.resolveNativeCollaborationModeId()

  assert.equal(selectedModeId, 'default')
  assert.equal(listCalls, 1)
})

test('login completion waits for a validated connected session before marking success', async () => {
  let accountReads = 0
  const bridge = createBridgeStub({
    accountResult: {
      authMode: '',
    },
  })
  bridge.readAccount = async () => {
    accountReads += 1
    if (accountReads === 1) {
      return { authMode: '' }
    }
    return {
      authMode: 'chatgpt',
      user: { email: 'dev@example.com', name: 'Dev User' },
      plan: { type: 'plus' },
    }
  }
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_240_000,
    sleep: async () => {},
    openExternalUrl: async () => true,
  })

  const started = await service.startLogin()
  assert.equal(started.activeLogin.phase, 'waiting_for_callback')

  bridge.emit('account/login/completed', {
    loginId: 'login_1',
    success: true,
    error: null,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const state = service.getState()
  assert.equal(accountReads, 2)
  assert.equal(state.activeLogin.phase, 'succeeded')
  assert.equal(state.sessionSummary.hasSession, true)
  assert.equal(state.sessionSummary.status, 'connected')
  assert.equal(state.sessionSummary.defaultCollaborationModeId, 'default')
})

test('reopenLoginBrowser reopens a pending login url through the auth service', async () => {
  const bridge = createBridgeStub()
  const openedUrls = []
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_250_000,
    openExternalUrl: async (url) => {
      openedUrls.push(String(url || ''))
      return true
    },
  })

  const started = await service.startLogin()
  assert.equal(started.activeLogin.phase, 'waiting_for_callback')

  const reopened = await service.reopenLoginBrowser(started.activeLogin.loginId)

  assert.equal(reopened.ok, true)
  assert.equal(reopened.opened, true)
  assert.equal(reopened.activeLogin.phase, 'waiting_for_callback')
  assert.equal(reopened.activeLogin.browserOpened, true)
  assert.deepEqual(openedUrls, [
    'https://chatgpt.com/auth',
    'https://chatgpt.com/auth',
  ])
})

test('reopenLoginBrowser fails closed when the pending login url is unavailable', async () => {
  const service = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager: createRuntimeManagerStub(),
    bridgeSupported: true,
    now: () => 1_710_000_260_000,
    openExternalUrl: async () => true,
  })

  service.setActiveLogin({
    loginId: 'login_missing_url',
    phase: 'waiting_for_browser',
    authUrl: '',
    browserOpened: false,
    startedAt: 1_710_000_260_000,
    updatedAt: 1_710_000_260_000,
    completedAt: 0,
    errorCode: '',
    errorMessage: '',
  })

  const result = await service.reopenLoginBrowser('login_missing_url')

  assert.equal(result.ok, false)
  assert.equal(result.opened, false)
  assert.equal(result.reason, 'missing_auth_url')
  assert.equal(result.activeLogin.phase, 'waiting_for_browser')
  assert.equal(result.activeLogin.errorCode, 'missing_auth_url')
  assert.match(String(result.activeLogin.errorMessage || ''), /browser url is no longer available/i)
})

test('late login completion is ignored after cancellation', async () => {
  const bridge = createBridgeStub()
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_300_000,
    openExternalUrl: async () => true,
  })

  const started = await service.startLogin()
  assert.equal(started.activeLogin.phase, 'waiting_for_callback')

  const cancelled = await service.cancelLogin(started.activeLogin.loginId)
  assert.equal(cancelled.activeLogin.phase, 'cancelled')

  bridge.emit('account/login/completed', {
    loginId: started.activeLogin.loginId,
    success: true,
    error: null,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const state = service.getState()
  assert.equal(state.activeLogin.phase, 'cancelled')
  assert.equal(state.sessionSummary.hasSession, false)
})

test('pending login fails immediately when the bridge becomes unavailable during callback wait', async () => {
  const bridge = createBridgeStub()
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_305_000,
    openExternalUrl: async () => true,
  })

  const started = await service.startLogin()
  assert.equal(started.activeLogin.phase, 'waiting_for_callback')

  bridge.emit('availability-changed', {
    supported: false,
    reason: 'bridge_process_exited',
    message: 'Codex app-server exited with code 1.',
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const state = service.getState()
  assert.equal(state.activeLogin.phase, 'failed')
  assert.equal(state.activeLogin.errorCode, 'bridge_process_exited')
  assert.match(String(state.activeLogin.errorMessage || ''), /exited with code 1/i)
})

test('startLogin maps callback-port conflicts to a stable retryable failure', async () => {
  const bridge = createBridgeStub()
  bridge.startLogin = async () => {
    const error = new Error('listen EADDRINUSE: callback port is already in use')
    error.code = 'EADDRINUSE'
    throw error
  }
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_320_000,
    openExternalUrl: async () => true,
  })

  const result = await service.startLogin()

  assert.equal(result.ok, false)
  assert.equal(result.activeLogin.phase, 'failed')
  assert.equal(result.activeLogin.errorCode, 'callback_port_in_use')
  assert.match(String(result.activeLogin.errorMessage || ''), /callback port is already in use/i)
})

test('startLogin fails closed when the bridge does not return an auth url', async () => {
  const bridge = createBridgeStub({
    loginResult: { loginId: 'login_missing_url', authUrl: '' },
  })
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_325_000,
    openExternalUrl: async () => true,
  })

  const result = await service.startLogin()

  assert.equal(result.ok, false)
  assert.equal(result.activeLogin.phase, 'failed')
  assert.equal(result.activeLogin.errorCode, 'missing_auth_url')
  assert.match(String(result.activeLogin.errorMessage || ''), /did not return a browser url/i)
})

test('startLogin sanitizes bridge error messages before persisting active login state', async () => {
  const bridge = createBridgeStub()
  bridge.startLogin = async () => {
    throw new Error('Login failed at https://localhost:3210/callback?code=abc123&state=xyz access_token=tok_123')
  }
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_326_000,
    openExternalUrl: async () => true,
  })

  const result = await service.startLogin()
  const storagePaths = resolveOpenAIAccountStoragePaths(userDataPath)
  const persistedLogin = JSON.parse(fs.readFileSync(storagePaths.activeLoginFilePath, 'utf8'))

  assert.equal(result.ok, false)
  assert.equal(result.activeLogin.phase, 'failed')
  assert.doesNotMatch(String(result.activeLogin.errorMessage || ''), /code=abc123/i)
  assert.doesNotMatch(String(result.activeLogin.errorMessage || ''), /access_token=tok_123/i)
  assert.match(String(result.activeLogin.errorMessage || ''), /\[redacted-query\]/i)
  assert.doesNotMatch(String(persistedLogin.errorMessage || ''), /code=abc123|access_token=tok_123/i)
})

test('login completion maps consent denial to a stable browser-consent failure', async () => {
  const bridge = createBridgeStub()
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_330_000,
    openExternalUrl: async () => true,
  })

  const started = await service.startLogin()
  assert.equal(started.activeLogin.phase, 'waiting_for_callback')

  bridge.emit('account/login/completed', {
    loginId: started.activeLogin.loginId,
    success: false,
    error: {
      code: 'access_denied',
      message: 'User denied consent in browser',
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const state = service.getState()
  assert.equal(state.activeLogin.phase, 'failed')
  assert.equal(state.activeLogin.errorCode, 'consent_denied')
  assert.match(String(state.activeLogin.errorMessage || ''), /browser consent step/i)
})

test('stale pending login is timed out before startLogin reuse logic runs', async () => {
  const bridge = createBridgeStub({
    loginResult: { loginId: 'login_2', authUrl: 'https://chatgpt.com/auth-2' },
  })
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_500_000,
    openExternalUrl: async () => true,
  })

  service.setActiveLogin({
    loginId: 'login_stale',
    phase: 'waiting_for_callback',
    authUrl: 'https://chatgpt.com/auth-stale',
    browserOpened: true,
    startedAt: 1_710_000_500_000 - (16 * 60 * 1000),
    updatedAt: 1_710_000_500_000 - (16 * 60 * 1000),
    completedAt: 0,
    errorCode: '',
    errorMessage: '',
  })

  const started = await service.startLogin()

  assert.equal(started.ok, true)
  assert.equal(started.reused, false)
  assert.equal(started.activeLogin.loginId, 'login_2')
  assert.equal(started.activeLogin.phase, 'waiting_for_callback')
})

test('refreshState preserves unsupported bridge auth modes instead of collapsing them into needs_login', async () => {
  const bridge = createBridgeStub({
    accountResult: {
      authMode: 'chatgptAuthTokens',
      user: { email: 'dev@example.com', name: 'Dev User' },
    },
  })
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_400_000,
    openExternalUrl: async () => false,
  })

  const state = await service.refreshState()

  assert.equal(state.sessionSummary.hasSession, false)
  assert.equal(state.sessionSummary.status, 'unsupported_auth_mode')
  assert.equal(state.sessionSummary.bridgeAuthMode, 'chatgptauthtokens')
  assert.equal(state.sessionSummary.lastErrorCode, 'unsupported_auth_mode')
  assert.match(String(state.sessionSummary.lastErrorMessage || ''), /unsupported auth mode/i)
  assert.equal(state.sessionSummary.defaultCollaborationModeId, '')
})

test('refreshState sanitizes bridge account error details before persisting session summary state', async () => {
  const bridge = createBridgeStub({
    accountResult: {
      authMode: '',
      error: {
        code: 'bridge_account_error',
        message: 'Callback failed at https://localhost:3210/callback?code=abc123&state=xyz token=tok_123',
      },
    },
  })
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_405_000,
    openExternalUrl: async () => false,
  })

  const state = await service.refreshState()
  const storagePaths = resolveOpenAIAccountStoragePaths(userDataPath)
  const persistedSummary = JSON.parse(fs.readFileSync(storagePaths.sessionSummaryFilePath, 'utf8'))

  assert.equal(state.sessionSummary.hasSession, false)
  assert.equal(state.sessionSummary.lastErrorCode, 'bridge_account_error')
  assert.doesNotMatch(String(state.sessionSummary.lastErrorMessage || ''), /code=abc123|token=tok_123/i)
  assert.match(String(state.sessionSummary.lastErrorMessage || ''), /\[redacted-query\]/i)
  assert.doesNotMatch(String(persistedSummary.lastErrorMessage || ''), /code=abc123|token=tok_123/i)
})

test('refreshState coalesces concurrent account refreshes into one bridge read', async () => {
  let readAccountCalls = 0
  let releaseRead = null
  const bridge = createBridgeStub()
  bridge.readAccount = async () => {
    readAccountCalls += 1
    await new Promise((resolve) => {
      releaseRead = resolve
    })
    return {
      account: { type: 'chatgpt', email: 'dev@example.com', planType: 'plus' },
      requiresOpenaiAuth: true,
    }
  }
  const service = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager: createRuntimeManagerStub(),
    bridge,
  })

  const first = service.refreshState()
  const second = service.refreshState()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(readAccountCalls, 1)
  releaseRead()
  const [firstState, secondState] = await Promise.all([first, second])

  assert.equal(firstState.sessionSummary.hasSession, true)
  assert.equal(secondState.sessionSummary.hasSession, true)
  assert.equal(readAccountCalls, 1)
})

test('refreshState prefers bridge compatibility probing before account reads', async () => {
  let readAccountCalls = 0
  let currentAvailability = { supported: true, reason: '', message: '' }
  const bridge = createBridgeStub()
  bridge.getAvailability = () => ({ ...currentAvailability })
  bridge.probeCompatibility = async () => ({
    ...(currentAvailability = {
      supported: false,
      reason: 'bridge_protocol_incompatible',
      message: 'Codex app-server initialize response is incompatible with the protocol ADDOM expects.',
    }),
  })
  bridge.readAccount = async () => {
    readAccountCalls += 1
    return {
      authMode: 'chatgpt',
      user: { email: 'dev@example.com' },
    }
  }
  const service = createOpenAIAccountAuthService({
    userDataPath,
    bridge,
    runtimeManager: createRuntimeManagerStub(),
    now: () => 1_710_000_410_000,
    openExternalUrl: async () => false,
  })

  const state = await service.refreshState()

  assert.equal(readAccountCalls, 0)
  assert.equal(state.storage.availability.supported, false)
  assert.equal(state.storage.availability.reason, 'bridge_protocol_incompatible')
  assert.equal(state.sessionSummary.availability.reason, 'bridge_protocol_incompatible')
})

test('session summary persists across service restart and disconnect clears owned storage', async () => {
  const initialService = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager: createRuntimeManagerStub(),
    bridgeSupported: true,
    openExternalUrl: async () => false,
  })
  initialService.setSessionSummary({
    hasSession: true,
    status: 'connected',
    email: 'dev@example.com',
    label: 'dev@example.com',
    planType: 'plus',
    connectedAt: 1_710_000_100_000,
    updatedAt: 1_710_000_100_000,
  })

  const restartedService = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager: createRuntimeManagerStub(),
    bridgeSupported: true,
    openExternalUrl: async () => false,
  })
  const refreshedState = restartedService.getState()

  assert.equal(refreshedState.sessionSummary.hasSession, true)
  assert.equal(refreshedState.sessionSummary.status, 'connected')
  assert.equal(refreshedState.sessionSummary.email, 'dev@example.com')
  assert.equal(refreshedState.sessionSummary.planType, 'plus')
  assert.equal(refreshedState.sessionSummary.defaultCollaborationModeId, '')

  const disconnectedState = await restartedService.disconnect()
  const storagePaths = resolveOpenAIAccountStoragePaths(userDataPath)

  assert.equal(disconnectedState.sessionSummary.hasSession, false)
  assert.equal(disconnectedState.activeLogin, null)
  assert.equal(fs.existsSync(storagePaths.runtimeRootPath), true)
  assert.equal(fs.existsSync(storagePaths.sessionSummaryFilePath), false)
  assert.equal(fs.existsSync(storagePaths.activeLoginFilePath), false)
})

test('service does not create the OpenAI account bridge until account runtime is actually queried', async () => {
  let bridgeFactoryCalls = 0
  const bridge = createBridgeStub({
    availability: {
      supported: true,
      reason: '',
      message: '',
    },
  })
  const service = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager: createRuntimeManagerStub(),
    bridgeFactory: ({ userDataPath: nextUserDataPath }) => {
      bridgeFactoryCalls += 1
      assert.equal(nextUserDataPath, userDataPath)
      return bridge
    },
    openExternalUrl: async () => false,
  })

  const initialState = service.getState()
  assert.equal(bridgeFactoryCalls, 0)
  assert.equal(initialState.sessionSummary.availability.reason, 'bridge_not_checked')

  await service.refreshState()
  assert.equal(bridgeFactoryCalls, 1)

  await service.refreshState()
  assert.equal(bridgeFactoryCalls, 1)
})

test('service passes the managed runtime executable path to the bridge factory', async () => {
  const bridge = createBridgeStub()
  const runtimeManager = createRuntimeManagerStub({
    executablePath: 'C:\\managed-runtime\\codex.exe',
  })
  const bridgeFactoryCalls = []
  const service = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager,
    bridgeFactory: ({ userDataPath: nextUserDataPath, codexExecutablePath }) => {
      bridgeFactoryCalls.push({ userDataPath: nextUserDataPath, codexExecutablePath })
      return bridge
    },
    openExternalUrl: async () => false,
  })

  await service.refreshState()

  assert.deepEqual(bridgeFactoryCalls, [{
    userDataPath,
    codexExecutablePath: 'C:\\managed-runtime\\codex.exe',
  }])
})

test('prepareRuntime updates storage with ready managed runtime state before login starts', async () => {
  const runtimeManager = createRuntimeManagerStub({
    status: 'runtime_ready',
    reason: '',
    message: 'Pinned Codex runtime is ready.',
    executablePath: 'C:\\managed\\codex.exe',
  })
  const service = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager,
    bridgeSupported: true,
    openExternalUrl: async () => false,
  })

  const state = await service.prepareRuntime()

  assert.equal(state.storage.runtime.status, 'runtime_ready')
  assert.equal(state.storage.runtime.executablePath, 'C:\\managed\\codex.exe')
  assert.equal(state.sessionSummary.availability.supported, true)
})

test('runtime state events publish storage without re-entering runtime refresh', () => {
  const runtimeState = {
    status: 'runtime_ready',
    reason: '',
    message: 'Pinned Codex runtime is ready.',
    executablePath: 'C:\\managed\\codex.exe',
  }
  const runtimeManager = new EventEmitter()
  runtimeManager.getState = () => ({ ...runtimeState })
  runtimeManager.refreshState = () => {
    throw new Error('runtime refresh must not be re-entered from its own state event')
  }
  runtimeManager.ensureRuntimeReady = async () => ({ ...runtimeState })
  const service = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager,
    bridgeSupported: true,
    openExternalUrl: async () => false,
  })
  let storageUpdate = null
  service.on('storage-updated', (storage) => {
    storageUpdate = storage
  })

  service.getRuntimeManager()
  runtimeManager.emit('state-updated', runtimeState)

  assert.equal(storageUpdate?.runtime?.status, 'runtime_ready')
  assert.equal(storageUpdate?.runtime?.executablePath, 'C:\\managed\\codex.exe')
})

test('service integrates managed runtime preparation with compatibility probe and bridge launch', async () => {
  const binaryContents = Buffer.from('codex-runtime-binary', 'utf8')
  const digest = `sha256:${createHash('sha256').update(binaryContents).digest('hex')}`
  const runtimeManager = createOpenAIAccountRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
    fetchJsonImpl: async () => ({
      assets: [{
        name: 'codex-x86_64-pc-windows-msvc.exe',
        browser_download_url: 'https://example.com/codex.exe',
        digest,
        size: binaryContents.length,
      }],
    }),
    downloadFileImpl: async ({ destinationPath, onProgress }) => {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
      onProgress?.({ bytesDownloaded: binaryContents.length, totalBytes: binaryContents.length })
      fs.writeFileSync(destinationPath, binaryContents)
      return {
        bytesDownloaded: binaryContents.length,
        totalBytes: binaryContents.length,
      }
    },
  })
  const child = createBridgeProcessStubForAuthService()
  const spawnCalls = []
  const service = createOpenAIAccountAuthService({
    userDataPath,
    runtimeManager,
    bridgeFactory: ({ userDataPath: nextUserDataPath, codexExecutablePath }) => new OpenAIAccountBridge({
      userDataPath: nextUserDataPath,
      codexExecutablePath,
      execFileImpl: async (command, args) => {
        assert.equal(Array.isArray(args), true)
        assert.equal(args[0], '--version')
        return { stdout: 'Codex 1.0.0', stderr: '' }
      },
      spawnImpl: (command, args) => {
        spawnCalls.push({ command, args })
        return child
      },
    }),
    now: () => 1_710_000_600_000,
    openExternalUrl: async () => false,
  })

  const initialState = service.getState()
  assert.equal(initialState.storage.runtime.status, 'runtime_missing')

  const preparedState = await service.prepareRuntime()
  const refreshedState = await service.refreshState()

  assert.equal(preparedState.storage.runtime.status, 'runtime_ready')
  assert.equal(refreshedState.storage.runtime.status, 'runtime_ready')
  assert.equal(refreshedState.storage.availability.supported, true)
  assert.equal(refreshedState.sessionSummary.hasSession, true)
  assert.equal(refreshedState.sessionSummary.status, 'connected')
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0]?.command, preparedState.storage.runtime.executablePath)
  assert.deepEqual(spawnCalls[0]?.args, ['app-server', '--listen', 'stdio://'])
  assert.deepEqual(
    child.writes.map((entry) => entry.method),
    ['initialize', 'initialized', 'account/read', 'account/rateLimits/read', 'collaborationMode/list'],
  )
  assert.equal(refreshedState.sessionSummary.defaultCollaborationModeId, 'default')
})
