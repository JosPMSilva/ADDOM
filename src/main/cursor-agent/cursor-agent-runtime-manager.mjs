import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ensureCursorAgentStorage, resolveCursorAgentStoragePaths } from './cursor-agent-storage.mjs'

const execFileAsync = promisify(execFile)
const CURSOR_LATEST_INSTALLER_URL = 'https://cursor.com/install'
const ACTIVE_RUNTIME_MANIFEST_FILE = 'active-runtime.json'

export const CURSOR_AGENT_PINNED_RUNTIME = Object.freeze({
  version: '2026.07.09-a3815c0',
  url: 'https://downloads.cursor.com/lab/2026.07.09-a3815c0/windows/x64/agent-cli-package.zip',
  checksum: '798fbeea54d3a77a3becf6746147a944f917a62e534c85912e9a171f7bc15e1f',
})

function remove(targetPath) {
  try { fs.rmSync(targetPath, { recursive: true, force: true }) } catch { /* best effort */ }
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256')
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolve(hash.digest('hex')))
  })
}

function defaultDownloadFile({ url, destinationPath, onProgress }) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'ADDOM-Desktop' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        resolve(defaultDownloadFile({ url: response.headers.location, destinationPath, onProgress }))
        return
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume()
        reject(new Error(`Cursor runtime download failed with status ${response.statusCode || 0}.`))
        return
      }
      const totalBytes = Number(response.headers['content-length'] || 0) || 0
      let bytesDownloaded = 0
      const output = fs.createWriteStream(destinationPath)
      response.on('data', (chunk) => {
        bytesDownloaded += chunk.length
        onProgress?.({ bytesDownloaded, totalBytes })
      })
      response.pipe(output)
      output.once('error', reject)
      output.once('finish', () => output.close(() => resolve({ bytesDownloaded, totalBytes })))
    })
    request.once('error', reject)
  })
}

function defaultFetchLatestInstaller(url = CURSOR_LATEST_INSTALLER_URL) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'ADDOM-Desktop' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        resolve(defaultFetchLatestInstaller(response.headers.location))
        return
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume()
        reject(new Error(`Cursor runtime metadata request failed with status ${response.statusCode || 0}.`))
        return
      }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += String(chunk || '') })
      response.once('end', () => resolve(body))
    })
    request.once('error', reject)
  })
}

function parseLatestRuntimeVersion(installer = '') {
  const match = String(installer || '').match(/downloads\.cursor\.com\/lab\/([^/"'\s]+)\//i)
  return String(match?.[1] || '').trim()
}

function buildOfficialRuntimeSpec(version = '') {
  const safeVersion = String(version || '').trim()
  return {
    version: safeVersion,
    url: `https://downloads.cursor.com/lab/${encodeURIComponent(safeVersion)}/windows/x64/agent-cli-package.zip`,
    checksum: '',
  }
}

async function defaultExtractArchive({ archivePath, destinationPath }) {
  fs.mkdirSync(destinationPath, { recursive: true })
  const powershell = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  await execFileAsync(powershell, [
    '-NoProfile', '-NonInteractive', '-Command',
    '& { param($archivePath, $destinationPath) Expand-Archive -LiteralPath $archivePath -DestinationPath $destinationPath -Force }',
    archivePath, destinationPath,
  ], { windowsHide: true, timeout: 120_000 })
}

async function defaultVerifyRuntimeVersion({ commandPath, expectedVersion }) {
  const powershellScript = path.join(path.dirname(commandPath), 'cursor-agent.ps1')
  const { stdout } = await execFileAsync(
    `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', powershellScript, '--version'],
    { windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024 },
  )
  const reportedVersion = String(stdout || '').trim().split(/\s+/)[0]
  if (reportedVersion !== expectedVersion) {
    throw Object.assign(new Error(`Cursor Agent package reported ${reportedVersion || 'an unknown version'} instead of ${expectedVersion}.`), {
      code: 'runtime_version_mismatch',
    })
  }
  return reportedVersion
}

function state(patch = {}) {
  return {
    status: 'runtime_missing', reason: 'runtime_missing', message: 'Cursor Agent runtime is not installed.',
    version: CURSOR_AGENT_PINNED_RUNTIME.version, commandPath: '', percent: 0,
    updateStatus: 'idle', updateAvailable: false, latestVersion: '', updateMessage: '',
    ...patch,
  }
}

export class CursorAgentRuntimeManager {
  constructor({
    userDataPath = '', platform = process.platform, arch = process.arch,
    runtimeSpec = CURSOR_AGENT_PINNED_RUNTIME,
    downloadFile = defaultDownloadFile, extractArchive = defaultExtractArchive,
    fetchLatestInstaller = defaultFetchLatestInstaller,
    verifyRuntimeVersion = defaultVerifyRuntimeVersion,
  } = {}) {
    this.userDataPath = userDataPath
    this.platform = platform
    this.arch = arch
    this.runtimeSpec = { ...runtimeSpec }
    this.downloadFile = downloadFile
    this.extractArchive = extractArchive
    this.fetchLatestInstaller = fetchLatestInstaller
    this.verifyRuntimeVersion = verifyRuntimeVersion
    this.currentState = state({ version: this.runtimeSpec.version })
    this.preparePromise = null
  }

  getActiveRuntimeManifestPath() {
    return path.join(resolveCursorAgentStoragePaths(this.userDataPath).runtimeRootPath, ACTIVE_RUNTIME_MANIFEST_FILE)
  }

  resolveActiveRuntimeVersion() {
    try {
      const manifest = JSON.parse(fs.readFileSync(this.getActiveRuntimeManifestPath(), 'utf8'))
      return String(manifest?.version || '').trim() || this.runtimeSpec.version
    } catch {
      return this.runtimeSpec.version
    }
  }

  writeActiveRuntimeVersion(version) {
    const manifestPath = this.getActiveRuntimeManifestPath()
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(manifestPath, JSON.stringify({ version, updatedAt: Date.now() }, null, 2), 'utf8')
  }

  getPaths({ version = this.resolveActiveRuntimeVersion() } = {}) {
    const storage = resolveCursorAgentStoragePaths(this.userDataPath)
    const runtimePath = path.join(storage.runtimeRootPath, version)
    return {
      ...storage,
      runtimePath,
      commandPath: path.join(runtimePath, 'cursor-agent.cmd'),
      temporaryPath: path.join(storage.runtimeRootPath, `.tmp-${version}`),
      archivePath: path.join(storage.runtimeRootPath, `.tmp-${version}.zip`),
    }
  }

  getState() { return { ...this.currentState } }

  refreshState() {
    if (this.platform !== 'win32' || this.arch !== 'x64') {
      this.currentState = state({
        status: 'runtime_failed', reason: 'runtime_platform_not_supported',
        message: `Cursor Agent runtime is unavailable for ${this.platform}/${this.arch}.`,
      })
      return this.getState()
    }
    const version = this.resolveActiveRuntimeVersion()
    const { commandPath } = this.getPaths({ version })
    const updateState = {
      updateStatus: this.currentState.updateStatus,
      updateAvailable: this.currentState.updateAvailable,
      latestVersion: this.currentState.latestVersion,
      updateMessage: this.currentState.updateMessage,
    }
    this.currentState = fs.existsSync(commandPath)
      ? state({ ...updateState, status: 'runtime_ready', reason: '', message: 'Cursor Agent runtime is ready.', commandPath, version })
      : state({ ...updateState, version })
    return this.getState()
  }

  async ensureRuntimeReady() {
    const current = this.refreshState()
    if (current.status === 'runtime_ready') return current
    if (this.preparePromise) return await this.preparePromise
    this.preparePromise = this.installRuntime({
      runtimeSpec: this.resolveActiveRuntimeVersion() === this.runtimeSpec.version
        ? this.runtimeSpec
        : buildOfficialRuntimeSpec(this.resolveActiveRuntimeVersion()),
    })
    try { return await this.preparePromise } finally { this.preparePromise = null }
  }

  async installRuntime({ runtimeSpec = this.runtimeSpec } = {}) {
    const spec = { ...runtimeSpec }
    const paths = this.getPaths({ version: spec.version })
    ensureCursorAgentStorage(this.userDataPath)
    remove(paths.temporaryPath)
    remove(paths.archivePath)
    fs.mkdirSync(paths.temporaryPath, { recursive: true })
    this.currentState = state({ status: 'runtime_downloading', reason: '', message: 'Downloading Cursor Agent runtime.', version: spec.version })
    try {
      await this.downloadFile({
        url: spec.url,
        destinationPath: paths.archivePath,
        onProgress: ({ bytesDownloaded = 0, totalBytes = 0 } = {}) => {
          const percent = totalBytes ? Math.round((bytesDownloaded / totalBytes) * 100) : 0
          this.currentState = state({ status: 'runtime_downloading', reason: '', message: 'Downloading Cursor Agent runtime.', percent, version: spec.version })
        },
      })
      const expectedChecksum = String(spec.checksum || '').trim().toLowerCase()
      const digest = expectedChecksum ? await hashFile(paths.archivePath) : ''
      if (expectedChecksum && digest.toLowerCase() !== expectedChecksum) {
        const error = new Error('Cursor Agent runtime checksum mismatch.')
        error.code = 'runtime_checksum_mismatch'
        throw error
      }
      this.currentState = state({ status: 'runtime_installing', reason: '', message: 'Installing Cursor Agent runtime.', version: spec.version })
      await this.extractArchive({ archivePath: paths.archivePath, destinationPath: paths.temporaryPath })
      const extractedPath = path.join(paths.temporaryPath, 'dist-package')
      const extractedCommandPath = path.join(extractedPath, 'cursor-agent.cmd')
      if (!fs.existsSync(extractedCommandPath)) {
        throw Object.assign(new Error('Cursor Agent package is incomplete.'), { code: 'runtime_package_invalid' })
      }
      await this.verifyRuntimeVersion({ commandPath: extractedCommandPath, expectedVersion: spec.version })
      remove(paths.runtimePath)
      fs.renameSync(extractedPath, paths.runtimePath)
      this.writeActiveRuntimeVersion(spec.version)
      remove(paths.temporaryPath)
      remove(paths.archivePath)
      return this.refreshState()
    } catch (error) {
      remove(paths.temporaryPath)
      remove(paths.archivePath)
      this.currentState = state({
        status: 'runtime_failed',
        reason: typeof error?.code === 'string' ? error.code : 'runtime_install_failed',
        message: error?.message || 'Cursor Agent runtime installation failed.',
        version: spec.version,
      })
      return this.getState()
    }
  }

  async checkForUpdates() {
    const current = this.refreshState()
    this.currentState = state({ ...current, updateStatus: 'checking', updateAvailable: false, updateMessage: 'Checking for Cursor Agent runtime updates.' })
    try {
      const installer = await this.fetchLatestInstaller()
      const latestVersion = parseLatestRuntimeVersion(installer)
      if (!latestVersion) throw new Error('Cursor installer metadata did not include a runtime version.')
      const updateAvailable = latestVersion !== current.version
      this.currentState = state({
        ...current,
        updateStatus: updateAvailable ? 'available' : 'current',
        updateAvailable,
        latestVersion,
        updateMessage: updateAvailable
          ? `Cursor Agent runtime ${latestVersion} is available.`
          : 'Cursor Agent runtime is current.',
      })
      return this.getState()
    } catch (error) {
      this.currentState = state({
        ...current,
        updateStatus: 'failed',
        updateAvailable: false,
        updateMessage: error?.message || 'Cursor Agent runtime update check failed.',
      })
      return this.getState()
    }
  }

  async installLatestRuntime() {
    const checked = await this.checkForUpdates()
    if (checked.updateAvailable !== true || !checked.latestVersion) return checked
    const installed = await this.installRuntime({ runtimeSpec: buildOfficialRuntimeSpec(checked.latestVersion) })
    if (installed.status !== 'runtime_ready') return installed
    this.currentState = state({
      ...installed,
      updateStatus: 'current',
      updateAvailable: false,
      latestVersion: checked.latestVersion,
      updateMessage: 'Cursor Agent runtime updated.',
    })
    return this.getState()
  }
}

export function createCursorAgentRuntimeManager(options = {}) {
  return new CursorAgentRuntimeManager(options)
}

export const __testCursorAgentRuntimeManagerInternals = Object.freeze({
  parseLatestRuntimeVersion,
  buildOfficialRuntimeSpec,
})
