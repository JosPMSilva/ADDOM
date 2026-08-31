import { execFile, spawn } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { createCursorAgentRuntimeManager } from './cursor-agent-runtime-manager.mjs'
import { ensureCursorAgentStorage } from './cursor-agent-storage.mjs'
import { sanitizeCursorAgentText } from './cursor-agent-sanitization.mjs'
import { killCursorAgentProcessTree } from './cursor-agent-process.mjs'

const execFileAsync = promisify(execFile)
const DEFAULT_ACCOUNT_STATUS_TTL_MS = 30_000

function authEnvironment(paths, env = process.env) {
  return {
    ...env,
    USERPROFILE: paths.profilePath,
    HOME: paths.profilePath,
    LOCALAPPDATA: paths.profileLocalAppDataPath,
    APPDATA: paths.profileRoamingAppDataPath,
  }
}

async function defaultRunCommand({ commandPath, args = [], env = process.env, timeout = 15_000 }) {
  const powershellScript = path.join(path.dirname(commandPath), 'cursor-agent.ps1')
  try {
    const result = await execFileAsync(
      `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', powershellScript, ...args],
      { env, windowsHide: true, timeout, maxBuffer: 256 * 1024 },
    )
    return { code: 0, stdout: sanitizeCursorAgentText(result.stdout), stderr: sanitizeCursorAgentText(result.stderr) }
  } catch (error) {
    return {
      code: Number.isFinite(error?.code) ? error.code : null,
      stdout: sanitizeCursorAgentText(error?.stdout),
      stderr: sanitizeCursorAgentText(error?.stderr || error?.message),
    }
  }
}

function parseStatus(stdout = '') {
  const value = String(stdout || '').trim()
  if (!value || /not logged in/i.test(value)) return { status: 'unauthenticated', accountLabel: '' }
  const match = value.match(/logged in as\s+([^\r\n]+)/i)
  return { status: 'authenticated', accountLabel: String(match?.[1] || '').trim() }
}

function defaultStartLoginProcess({ commandPath, env }) {
  const powershellScript = path.join(path.dirname(commandPath), 'cursor-agent.ps1')
  const child = spawn(
    `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', powershellScript, 'login'],
    { env: { ...env, NO_OPEN_BROWSER: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let output = ''
  let urlSettled = false
  let cancelPromise = null
  let resolveUrl
  let rejectUrl
  const authUrl = new Promise((resolve, reject) => { resolveUrl = resolve; rejectUrl = reject })
  const inspect = (chunk) => {
    output += sanitizeCursorAgentText(chunk)
    const match = output.match(/https:\/\/\S+/i)
    if (!urlSettled && match) { urlSettled = true; resolveUrl(match[0]) }
  }
  child.stdout?.setEncoding?.('utf8')
  child.stderr?.setEncoding?.('utf8')
  child.stdout?.on?.('data', inspect)
  child.stderr?.on?.('data', inspect)
  const completed = new Promise((resolve) => {
    child.once('error', (error) => {
      if (!urlSettled) { urlSettled = true; rejectUrl(error) }
      resolve({ code: null, output, error })
    })
    child.once('close', (code) => {
      if (!urlSettled) {
        urlSettled = true
        if (code === 0) resolveUrl('')
        else rejectUrl(new Error(output || 'Cursor login ended before authentication started.'))
      }
      resolve({ code: Number.isFinite(code) ? code : null, output, error: null })
    })
  })
  const cancel = () => {
    if (!cancelPromise) cancelPromise = killCursorAgentProcessTree(child.pid)
    return cancelPromise
  }
  return { authUrl, completed, cancel }
}

export function createCursorAgentAuthService({
  userDataPath = '',
  runtimeManager = null,
  runCommand = defaultRunCommand,
  startLoginProcess = defaultStartLoginProcess,
  env = process.env,
  now = () => Date.now(),
  accountStatusTtlMs = DEFAULT_ACCOUNT_STATUS_TTL_MS,
} = {}) {
  const manager = runtimeManager || createCursorAgentRuntimeManager({ userDataPath })
  const paths = ensureCursorAgentStorage(userDataPath)
  const command = async (args, options = {}) => {
    const runtime = options.prepare === false ? manager.refreshState() : await manager.ensureRuntimeReady()
    if (runtime.status !== 'runtime_ready') return { code: null, stdout: '', stderr: runtime.message, runtime }
    return await runCommand({
      commandPath: runtime.commandPath,
      args,
      env: authEnvironment(paths, env),
      timeout: options.timeout,
    })
  }

  let activeLogin = null
  let accountCache = null
  let accountInFlight = null
  let cacheGeneration = 0

  const invalidateAccountStatus = () => {
    cacheGeneration += 1
    accountCache = null
  }

  const readAccountStatus = async ({ forceRefresh = false } = {}) => {
    // forceRefresh skips the TTL cache only. In-flight probes always coalesce so
    // concurrent chat/settings/vault reads cannot stack Cursor status CLIs.
    if (!forceRefresh && accountCache && accountCache.expiresAt > now()) {
      return accountCache.value
    }
    if (accountInFlight) return accountInFlight

    const generation = cacheGeneration
    const ttl = Math.max(1_000, Number(accountStatusTtlMs) || DEFAULT_ACCOUNT_STATUS_TTL_MS)
    const load = async () => {
      const result = await command(['status'], { prepare: false })
      const value = parseStatus(result.stdout)
      if (generation === cacheGeneration) {
        accountCache = { value, expiresAt: now() + ttl }
      }
      return value
    }

    // Assign before any await so concurrent callers share one in-flight CLI probe.
    accountInFlight = load().finally(() => {
      accountInFlight = null
    })
    return accountInFlight
  }

  return {
    async getState({ forceRefresh = false } = {}) {
      const runtime = manager.refreshState()
      const account = runtime.status === 'runtime_ready'
        ? await readAccountStatus({ forceRefresh: forceRefresh === true })
        : { status: 'unavailable', accountLabel: '' }
      return { runtime, account, loginPending: activeLogin !== null }
    },
    async prepareRuntime() {
      invalidateAccountStatus()
      return await manager.ensureRuntimeReady()
    },
    async checkRuntimeUpdate() {
      return await manager.checkForUpdates()
    },
    async installRuntimeUpdate() {
      invalidateAccountStatus()
      return await manager.installLatestRuntime()
    },
    async getStatus({ forceRefresh = false } = {}) {
      return await readAccountStatus({ forceRefresh: forceRefresh === true })
    },
    async startLogin() {
      if (activeLogin) return { status: 'pending', authUrl: await activeLogin.authUrl }
      invalidateAccountStatus()
      const runtime = await manager.ensureRuntimeReady()
      if (runtime.status !== 'runtime_ready') return { status: 'failed', authUrl: '' }
      activeLogin = startLoginProcess({
        commandPath: runtime.commandPath,
        env: authEnvironment(paths, env),
      })
      activeLogin.completed.finally(() => {
        activeLogin = null
        invalidateAccountStatus()
      })
      return { status: 'pending', authUrl: await activeLogin.authUrl }
    },
    async cancelLogin() {
      if (!activeLogin) return { cancelled: false }
      const cancelled = await activeLogin.cancel()
      invalidateAccountStatus()
      return { cancelled }
    },
    async logout() {
      invalidateAccountStatus()
      const result = await command(['logout'])
      invalidateAccountStatus()
      return { ok: result.code === 0 }
    },
    getRuntimeState: () => manager.refreshState(),
    peekAccountStatus: () => (accountCache?.value || null),
    invalidateAccountStatus,
    async shutdown() {
      if (activeLogin) {
        try { await activeLogin.cancel() } catch { /* best-effort login cleanup */ }
        activeLogin = null
      }
      invalidateAccountStatus()
      accountInFlight = null
    },
  }
}

export const __testCursorAgentAuthInternals = Object.freeze({ parseStatus, authEnvironment })

let cursorAgentAuthServiceSingleton = null

export function getCursorAgentAuthService(options = null) {
  if (!cursorAgentAuthServiceSingleton || options) {
    cursorAgentAuthServiceSingleton = createCursorAgentAuthService(options || {})
  }
  return cursorAgentAuthServiceSingleton
}

export function __resetCursorAgentAuthServiceForTests() {
  cursorAgentAuthServiceSingleton = null
}
