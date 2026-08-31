import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import {
  appendLogLine,
  looksLikeExplicitExecutablePath,
  normalizeId,
  sanitizeProtocolPayloadForLog,
} from './openai-account-bridge-shared.mjs'
import {
  buildBridgeLaunchEnv,
  buildOpenAIAccountBridgeLaunchSpec,
  buildOpenAIAccountBridgeRuntimeConfigSignature,
  normalizeOpenAIAccountBridgeRuntimeSettings,
  writeBridgeConfigFile,
} from './openai-account-bridge-config.mjs'
import {
  mapProbeFailureReason,
  mapProcessExitReason,
  mapSpawnFailureReason,
} from './openai-account-bridge-process.mjs'
import {
  createProtocolError,
  normalizeCollaborationModePresetList,
  validateInitializeResult,
} from './openai-account-bridge-protocol.mjs'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)
const REQUEST_TIMEOUT_MS = 15_000
const PROBE_TIMEOUT_MS = 4_000
const BRIDGE_CLIENT_INFO = Object.freeze({
  name: 'addom_desktop',
  title: 'ADDOM Desktop',
  version: '0.1.0',
})

function executableName(value = '') {
  return normalizeId(value).split(/[\\/]/).filter(Boolean).at(-1) || ''
}

function extractRuntimeVersion(value = '') {
  const match = String(value || '').match(/\b(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?)\b/)
  return normalizeId(match?.[1])
}

function loadElectronShell() {
  try {
    const electronModule = require('electron')
    if (electronModule?.shell && typeof electronModule.shell.openExternal === 'function') {
      return electronModule.shell
    }
  } catch {
    // Non-Electron runtime.
  }
  return null
}

async function defaultOpenExternalUrl(url = '') {
  const safeUrl = normalizeId(url)
  if (!safeUrl) return false
  const shell = loadElectronShell()
  if (!shell) return false
  await shell.openExternal(safeUrl)
  return true
}

export { defaultOpenExternalUrl as openOpenAIAccountExternalUrl }
export {
  buildOpenAIAccountBridgeLaunchSpec,
  buildOpenAIAccountBridgeRuntimeConfigSignature,
}

export class OpenAIAccountBridge extends EventEmitter {
  constructor({
    userDataPath = '',
    codexExecutablePath = '',
    runtimeSettings = null,
    spawnImpl = spawn,
    execFileImpl = execFileAsync,
    env = process.env,
    platform = process.platform,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
    probeTimeoutMs = PROBE_TIMEOUT_MS,
  } = {}) {
    super()
    this.userDataPath = normalizeId(userDataPath)
    this.spawnImpl = typeof spawnImpl === 'function' ? spawnImpl : spawn
    this.execFileImpl = typeof execFileImpl === 'function' ? execFileImpl : execFileAsync
    this.env = env && typeof env === 'object' ? env : process.env
    this.platform = normalizeId(platform) || process.platform
    this.requestTimeoutMs = Math.max(1_000, Number(requestTimeoutMs || REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS)
    this.probeTimeoutMs = Math.max(500, Number(probeTimeoutMs || PROBE_TIMEOUT_MS) || PROBE_TIMEOUT_MS)
    this.process = null
    this.pending = new Map()
    this.buffer = ''
    this.nextRequestId = 1
    this.startPromise = null
    this.initialized = false
    this.initializePromise = null
    this.collaborationModesCache = null
    this.availability = {
      supported: false,
      reason: 'bridge_not_checked',
      message: 'OpenAI account bridge availability has not been checked yet.',
      checkedAt: 0,
    }
    const launchSpec = buildOpenAIAccountBridgeLaunchSpec({
      userDataPath: this.userDataPath,
      codexExecutablePath,
      runtimeSettings,
      env: this.env,
      platform: this.platform,
    })
    this.launchSpec = launchSpec
    this.logFilePath = launchSpec.logFilePath
    this.runtimeIdentity = {
      executable: executableName(launchSpec.command),
      version: '',
      platformFamily: '',
      platformOs: '',
    }
  }

  getAvailability() {
    return { ...this.availability }
  }

  getRuntimeIdentity() {
    return { ...this.runtimeIdentity }
  }

  setAvailability(nextAvailability = {}) {
    const next = {
      supported: nextAvailability.supported === true,
      reason: normalizeId(nextAvailability.reason),
      message: normalizeId(nextAvailability.message),
      checkedAt: Number(nextAvailability.checkedAt || Date.now()) || Date.now(),
    }
    const previous = JSON.stringify(this.availability)
    this.availability = next
    if (JSON.stringify(this.availability) !== previous) {
      this.emit('availability-changed', this.getAvailability())
    }
  }

  async resolveLaunchCommand() {
    const currentCommand = normalizeId(this.launchSpec?.command)
    if (!currentCommand) return currentCommand
    if (this.platform !== 'win32') return currentCommand
    if (looksLikeExplicitExecutablePath(currentCommand)) return currentCommand
    try {
      const result = await this.execFileImpl('where.exe', [currentCommand], {
        cwd: this.launchSpec.cwd,
        env: this.launchSpec.env,
        windowsHide: this.launchSpec.windowsHide,
        timeout: this.probeTimeoutMs,
      })
      const resolvedCommand = String(result?.stdout || '')
        .split(/\r?\n/)
        .map((line) => normalizeId(line))
        .find(Boolean)
      if (resolvedCommand) {
        this.launchSpec.command = resolvedCommand
        return resolvedCommand
      }
    } catch {
      // Fall back to the original command and let the normal probe/spawn path classify the failure.
    }
    return currentCommand
  }

  async probeAvailability() {
    try {
      const resolvedCommand = await this.resolveLaunchCommand()
      const result = await this.execFileImpl(resolvedCommand, ['--version'], {
        cwd: this.launchSpec.cwd,
        env: this.launchSpec.env,
        timeout: this.probeTimeoutMs,
        windowsHide: this.launchSpec.windowsHide,
      })
      this.runtimeIdentity = {
        ...this.runtimeIdentity,
        executable: executableName(resolvedCommand),
        version: extractRuntimeVersion(result?.stdout || result?.stderr),
      }
      this.setAvailability({
        supported: true,
        reason: '',
        message: '',
      })
    } catch (error) {
      const timeoutHit = error?.killed === true && String(error?.signal || '').toUpperCase() === 'SIGTERM'
      if (timeoutHit) {
        this.setAvailability({
          supported: false,
          reason: 'bridge_probe_timeout',
          message: 'Codex app-server availability probe timed out.',
        })
        return this.getAvailability()
      }
      const mapped = mapProbeFailureReason(error)
      this.setAvailability({
        supported: false,
        reason: mapped.reason,
        message: mapped.message,
      })
    }
    return this.getAvailability()
  }

  async probeCompatibility() {
    const availability = await this.probeAvailability()
    if (availability.supported !== true) {
      return availability
    }
    try {
      await this.ensureInitialized()
      this.setAvailability({
        supported: true,
        reason: '',
        message: '',
      })
    } catch (error) {
      if (normalizeId(error?.reason) !== 'bridge_protocol_incompatible') {
        this.setAvailability({
          supported: false,
          reason: 'bridge_compatibility_failed',
          message: normalizeId(error?.message) || 'Codex app-server failed the compatibility probe ADDOM requires.',
        })
      }
    }
    return this.getAvailability()
  }

  handleProcessExit(code = 0, signal = '') {
    const mapped = mapProcessExitReason(code, signal)
    this.setAvailability({
      supported: false,
      reason: mapped.reason,
      message: mapped.message,
    })
    const pendingEntries = Array.from(this.pending.values())
    this.pending.clear()
    for (const entry of pendingEntries) {
      clearTimeout(entry.timer)
      entry.reject(new Error(mapped.message))
    }
    this.process = null
    this.startPromise = null
    this.initialized = false
    this.initializePromise = null
    this.collaborationModesCache = null
  }

  flushStdoutChunk(chunk = '') {
    this.buffer += String(chunk || '')
    while (this.buffer.includes('\n')) {
      const newlineIndex = this.buffer.indexOf('\n')
      const rawLine = this.buffer.slice(0, newlineIndex)
      this.buffer = this.buffer.slice(newlineIndex + 1)
      const line = rawLine.trim()
      if (!line) continue
      let payload = null
      try {
        payload = JSON.parse(line)
        appendLogLine(this.logFilePath, `[stdout] ${JSON.stringify(sanitizeProtocolPayloadForLog(payload))}`)
      } catch {
        appendLogLine(this.logFilePath, `[stdout] ${line}`)
        appendLogLine(this.logFilePath, '[protocol-error] non-json stdout payload')
        continue
      }
      this.handleProtocolMessage(payload)
    }
  }

  handleProtocolMessage(payload = null) {
    const source = payload && typeof payload === 'object' ? payload : {}
    if (Object.prototype.hasOwnProperty.call(source, 'id') && !Object.prototype.hasOwnProperty.call(source, 'method')) {
      const requestId = Number(source.id)
      const pending = this.pending.get(requestId)
      if (!pending) return
      this.pending.delete(requestId)
      clearTimeout(pending.timer)
      if (source.error) {
        pending.reject(createProtocolError(source, 'Codex app-server request failed.'))
        return
      }
      pending.resolve(source.result ?? null)
      return
    }

    const method = normalizeId(source.method)
    const params = source.params ?? null
    if (!method) return
    if (Object.prototype.hasOwnProperty.call(source, 'id')) {
      this.emit('server-request', {
        id: Number(source.id),
        method,
        params,
      })
      return
    }
    this.emit('notification', { method, params })
    if (method === 'account/login/completed') this.emit('account/login/completed', params)
    if (method === 'account/updated') this.emit('account/updated', params)
    if (method === 'account/rateLimits/updated') this.emit('account/rateLimits/updated', params)
  }

  async ensureStarted() {
    if (this.process) return this.process
    if (this.startPromise) return await this.startPromise
    this.startPromise = (async () => {
      await this.probeAvailability()
      if (this.availability.supported !== true) {
        throw new Error(this.availability.message || 'Codex app-server is unavailable.')
      }
      appendLogLine(this.logFilePath, `[spawn] ${this.launchSpec.command} ${this.launchSpec.args.join(' ')}`)
      const child = this.spawnImpl(this.launchSpec.command, this.launchSpec.args, {
        cwd: this.launchSpec.cwd,
        env: this.launchSpec.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: this.launchSpec.windowsHide,
      })
      await new Promise((resolve, reject) => {
        let settled = false
        const onError = (error) => {
          if (settled) return
          settled = true
          const mapped = mapSpawnFailureReason(error)
          this.setAvailability({
            supported: false,
            reason: mapped.reason,
            message: mapped.message,
          })
          reject(new Error(mapped.message))
        }
        child.once('error', onError)
        queueMicrotask(() => {
          if (settled) return
          settled = true
          child.removeListener('error', onError)
          resolve()
        })
      })
      child.stdout?.setEncoding?.('utf8')
      child.stderr?.setEncoding?.('utf8')
      child.on('error', (error) => {
        const mapped = mapSpawnFailureReason(error)
        appendLogLine(this.logFilePath, `[error] ${mapped.reason}: ${mapped.message}`)
        this.setAvailability({
          supported: false,
          reason: mapped.reason,
          message: mapped.message,
        })
        this.handleProcessExit(1, 'error')
      })
      child.stdout?.on?.('data', (chunk) => this.flushStdoutChunk(chunk))
      child.stderr?.on?.('data', (chunk) => appendLogLine(this.logFilePath, `[stderr] ${String(chunk || '').trim()}`))
      child.on('exit', (code, signal) => this.handleProcessExit(code, signal))
      this.process = child
      this.setAvailability({
        supported: true,
        reason: '',
        message: '',
      })
      this.initialized = false
      this.initializePromise = null
      return child
    })()
    try {
      return await this.startPromise
    } finally {
      if (!this.process) this.startPromise = null
    }
  }

  async notify(method = '', params = {}) {
    const safeMethod = normalizeId(method)
    if (!safeMethod) throw new Error('Bridge notification method is required.')
    const child = await this.ensureStarted()
    if (!child?.stdin || typeof child.stdin.write !== 'function') {
      throw new Error('Codex app-server stdin is unavailable.')
    }
    const payload = {
      method: safeMethod,
      params: params && typeof params === 'object' ? params : {},
    }
    const line = `${JSON.stringify(payload)}\n`
    await new Promise((resolve, reject) => {
      try {
        child.stdin.write(line, 'utf8', (error) => (error ? reject(error) : resolve()))
      } catch (error) {
        reject(error)
      }
    })
  }

  async ensureInitialized() {
    if (this.initialized === true) return true
    if (this.initializePromise) {
      await this.initializePromise
      return this.initialized === true
    }
    this.initializePromise = (async () => {
      const result = await this.request('initialize', {
        clientInfo: { ...BRIDGE_CLIENT_INFO },
        capabilities: {
          experimentalApi: true,
          mcpServerOpenaiFormElicitation: true,
          requestAttestation: false,
        },
      }, {
        timeoutMs: this.requestTimeoutMs,
        skipInitialization: true,
      })
      const protocolIdentity = validateInitializeResult(result)
      this.runtimeIdentity = {
        ...this.runtimeIdentity,
        platformFamily: protocolIdentity.platformFamily,
        platformOs: protocolIdentity.platformOs,
      }
      await this.notify('initialized', {})
      this.initialized = true
      return true
    })()
    try {
      await this.initializePromise
      return this.initialized === true
    } catch (error) {
      this.initialized = false
      if (normalizeId(error?.reason) === 'bridge_protocol_incompatible') {
        this.setAvailability({
          supported: false,
          reason: 'bridge_protocol_incompatible',
          message: normalizeId(error?.message) || 'Codex app-server initialize response is incompatible with the protocol ADDOM expects.',
        })
      }
      throw error
    } finally {
      this.initializePromise = null
    }
  }

  async respond(id = 0, result = null, error = null) {
    const requestId = Number(id)
    if (!Number.isFinite(requestId)) {
      throw new Error('Bridge response id is required.')
    }
    const child = await this.ensureStarted()
    if (!child?.stdin || typeof child.stdin.write !== 'function') {
      throw new Error('Codex app-server stdin is unavailable.')
    }
    const payload = {
      id: requestId,
      ...(error && typeof error === 'object'
        ? { error }
        : { result }),
    }
    const line = `${JSON.stringify(payload)}\n`
    await new Promise((resolve, reject) => {
      try {
        child.stdin.write(line, 'utf8', (writeError) => (writeError ? reject(writeError) : resolve()))
      } catch (writeError) {
        reject(writeError)
      }
    })
  }

  async request(method = '', params = {}, { timeoutMs = this.requestTimeoutMs, skipInitialization = false } = {}) {
    const safeMethod = normalizeId(method)
    if (!safeMethod) throw new Error('Bridge method is required.')
    if (skipInitialization !== true) {
      await this.ensureInitialized()
    }
    const child = await this.ensureStarted()
    if (!child?.stdin || typeof child.stdin.write !== 'function') {
      throw new Error('Codex app-server stdin is unavailable.')
    }
    const requestId = this.nextRequestId++
    const payload = {
      method: safeMethod,
      id: requestId,
      params: params && typeof params === 'object' ? params : {},
    }
    const line = `${JSON.stringify(payload)}\n`
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Codex app-server request timed out for ${safeMethod}.`))
      }, Math.max(1_000, Number(timeoutMs || this.requestTimeoutMs) || this.requestTimeoutMs))
      this.pending.set(requestId, { resolve, reject, timer })
      try {
        child.stdin.write(line, 'utf8', (error) => {
          if (!error) return
          const pending = this.pending.get(requestId)
          if (!pending) return
          this.pending.delete(requestId)
          clearTimeout(pending.timer)
          pending.reject(error)
        })
      } catch (error) {
        const pending = this.pending.get(requestId)
        if (!pending) return
        this.pending.delete(requestId)
        clearTimeout(pending.timer)
        pending.reject(error)
      }
    })
  }

  async readAccount(params = {}) {
    return await this.request('account/read', params)
  }

  async startLogin(params = { type: 'chatgpt' }) {
    return await this.request('account/login/start', params)
  }

  async cancelLogin(loginId = '') {
    return await this.request('account/login/cancel', { loginId: normalizeId(loginId) })
  }

  async logout() {
    return await this.request('account/logout', {})
  }

  async readRateLimits() {
    return await this.request('account/rateLimits/read', {})
  }

  async runCompatibilitySmokeTest({ includeMutatingAuthEndpoints = true } = {}) {
    await this.ensureInitialized()
    const account = await this.readAccount({})
    let login = null
    if (includeMutatingAuthEndpoints) {
      login = await this.startLogin({ type: 'chatgpt' })
      await this.cancelLogin(normalizeId(login?.loginId))
      await this.logout()
    }
    const rateLimits = await this.readRateLimits()
    return {
      ok: true,
      account,
      login,
      rateLimits,
      includeMutatingAuthEndpoints: includeMutatingAuthEndpoints === true,
    }
  }

  async startThread(params = {}) {
    return await this.request('thread/start', params)
  }

  async resumeThread(params = {}) {
    return await this.request('thread/resume', params)
  }

  async startThreadCompaction(threadId = '') {
    return await this.request('thread/compact/start', {
      threadId: normalizeId(threadId),
    })
  }

  async startTurn(params = {}) {
    return await this.request('turn/start', params)
  }

  async listCollaborationModes({ forceReload = false } = {}) {
    if (!forceReload && Array.isArray(this.collaborationModesCache)) {
      return this.collaborationModesCache.map((entry) => ({
        ...entry,
        raw: entry.raw && typeof entry.raw === 'object' ? { ...entry.raw } : entry.raw,
      }))
    }
    const result = await this.request('collaborationMode/list', {})
    const modes = normalizeCollaborationModePresetList(result)
    this.collaborationModesCache = modes
    return modes.map((entry) => ({
      ...entry,
      raw: entry.raw && typeof entry.raw === 'object' ? { ...entry.raw } : entry.raw,
    }))
  }

  async interruptTurn(threadId = '', turnId = '') {
    return await this.request('turn/interrupt', {
      threadId: normalizeId(threadId),
      turnId: normalizeId(turnId),
    })
  }

  async stop() {
    const child = this.process
    this.process = null
    this.startPromise = null
    if (!child) return { stopped: false }
    try {
      child.removeAllListeners('exit')
      child.kill()
    } catch {
      // Best-effort process stop only.
    }
    this.handleProcessExit(0, 'stopped')
    return { stopped: true }
  }
}

export function createOpenAIAccountBridge(options = {}) {
  return new OpenAIAccountBridge(options)
}

export const __testOpenAIAccountBridgeInternals = Object.freeze({
  writeBridgeConfigFile,
  buildOpenAIAccountBridgeLaunchSpec,
  buildOpenAIAccountBridgeRuntimeConfigSignature,
  normalizeOpenAIAccountBridgeRuntimeSettings,
  buildBridgeLaunchEnv,
  sanitizeProtocolPayloadForLog,
  mapSpawnFailureReason,
  mapProbeFailureReason,
  validateInitializeResult,
  normalizeCollaborationModePresetList,
  defaultOpenExternalUrl,
})
