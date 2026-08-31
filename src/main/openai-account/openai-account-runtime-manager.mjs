import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveOpenAIAccountStoragePaths } from './openai-account-storage.mjs'
import {
  requiresCodeModeHost,
  resolveAssetLayout,
  resolvePinnedAssetSpec,
} from './openai-account-runtime-assets.mjs'

const execFileAsync = promisify(execFile)

const OPENAI_CODEX_REPOSITORY = 'openai/codex'
const DEFAULT_CODEX_RELEASE_TAG = 'rust-v0.116.0'
const GITHUB_API_BASE_URL = 'https://api.github.com'
const ACTIVE_RUNTIME_MANIFEST_FILE_NAME = 'active-runtime.json'

function normalizeString(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.round(numeric)
}

function runtimeDirectoryName(version = DEFAULT_CODEX_RELEASE_TAG) {
  return encodeURIComponent(normalizeString(version) || DEFAULT_CODEX_RELEASE_TAG)
}

function cloneJson(value = null) {
  return JSON.parse(JSON.stringify(value))
}

function emitPercent(downloaded = 0, total = 0) {
  const safeDownloaded = normalizeNumber(downloaded)
  const safeTotal = normalizeNumber(total)
  if (!safeDownloaded || !safeTotal) return 0
  return Math.max(0, Math.min(100, Math.round((safeDownloaded / safeTotal) * 100)))
}

function ensureDirectory(targetPath = '') {
  const safeTargetPath = normalizeString(targetPath)
  if (!safeTargetPath) return
  fs.mkdirSync(safeTargetPath, { recursive: true })
}

function removeDirectory(targetPath = '') {
  const safeTargetPath = normalizeString(targetPath)
  if (!safeTargetPath) return
  try {
    fs.rmSync(safeTargetPath, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup only.
  }
}

function readJsonFile(filePath = '') {
  const safeFilePath = normalizeString(filePath)
  if (!safeFilePath || !fs.existsSync(safeFilePath)) return null
  try {
    return JSON.parse(fs.readFileSync(safeFilePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJsonFile(filePath = '', value = {}) {
  const safeFilePath = normalizeString(filePath)
  if (!safeFilePath) return
  ensureDirectory(path.dirname(safeFilePath))
  fs.writeFileSync(safeFilePath, JSON.stringify(value, null, 2), 'utf8')
}

function sha256File(targetPath = '') {
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(targetPath)
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolve(`sha256:${hash.digest('hex')}`))
  })
}

function defaultFetchJson(url = '') {
  const safeUrl = normalizeString(url)
  if (!safeUrl) {
    return Promise.reject(new Error('Runtime metadata URL is required.'))
  }
  return new Promise((resolve, reject) => {
    const request = https.request(safeUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ADDOM-Desktop',
      },
    }, (response) => {
      const statusCode = Number(response.statusCode || 0)
      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume()
        resolve(defaultFetchJson(String(response.headers.location || '')))
        return
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`Runtime metadata request failed with status ${statusCode || 0}.`))
        return
      }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += String(chunk || '')
      })
      response.once('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error('Runtime metadata response was not valid JSON.'))
        }
      })
    })
    request.once('error', reject)
    request.end()
  })
}

function defaultDownloadFile({ url = '', destinationPath = '', onProgress = null } = {}) {
  const safeUrl = normalizeString(url)
  const safeDestinationPath = normalizeString(destinationPath)
  if (!safeUrl || !safeDestinationPath) {
    return Promise.reject(new Error('Runtime download URL and destination path are required.'))
  }
  ensureDirectory(path.dirname(safeDestinationPath))
  return new Promise((resolve, reject) => {
    const request = https.request(safeUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': 'ADDOM-Desktop',
      },
    }, (response) => {
      const statusCode = Number(response.statusCode || 0)
      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume()
        resolve(defaultDownloadFile({
          url: String(response.headers.location || ''),
          destinationPath: safeDestinationPath,
          onProgress,
        }))
        return
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`Runtime download failed with status ${statusCode || 0}.`))
        return
      }
      const totalBytes = normalizeNumber(response.headers['content-length'])
      let downloadedBytes = 0
      const fileStream = fs.createWriteStream(safeDestinationPath, { mode: 0o755 })
      response.on('data', (chunk) => {
        downloadedBytes += Buffer.byteLength(chunk)
        if (typeof onProgress === 'function') {
          onProgress({
            bytesDownloaded: downloadedBytes,
            totalBytes,
          })
        }
      })
      response.pipe(fileStream)
      fileStream.once('error', reject)
      fileStream.once('finish', () => {
        fileStream.close(() => {
          resolve({
            bytesDownloaded: downloadedBytes,
            totalBytes,
          })
        })
      })
    })
    request.once('error', reject)
    request.end()
  })
}

async function defaultExtractArchive({ archivePath = '', destinationPath = '' } = {}) {
  const safeArchivePath = normalizeString(archivePath)
  const safeDestinationPath = normalizeString(destinationPath)
  if (!safeArchivePath || !safeDestinationPath) {
    throw new Error('Runtime archive extraction requires archive and destination paths.')
  }
  ensureDirectory(safeDestinationPath)
  await execFileAsync('tar', ['-xzf', safeArchivePath, '-C', safeDestinationPath], {
    timeout: 60_000,
    windowsHide: true,
  })
}

function buildDefaultState({
  status = 'runtime_missing',
  reason = '',
  message = '',
  executablePath = '',
  bytesDownloaded = 0,
  totalBytes = 0,
  version = DEFAULT_CODEX_RELEASE_TAG,
  latestVersion = '',
  updateStatus = 'idle',
  updateAvailable = false,
  updateMessage = '',
  updateCheckedAt = 0,
  assetName = '',
  source = '',
} = {}) {
  return {
    status,
    reason: normalizeString(reason),
    message: normalizeString(message),
    version: normalizeString(version) || DEFAULT_CODEX_RELEASE_TAG,
    latestVersion: normalizeString(latestVersion),
    updateStatus: normalizeString(updateStatus) || 'idle',
    updateAvailable: updateAvailable === true,
    updateMessage: normalizeString(updateMessage),
    updateCheckedAt: normalizeNumber(updateCheckedAt),
    assetName: normalizeString(assetName),
    executablePath: normalizeString(executablePath),
    source: normalizeString(source),
    bytesDownloaded: normalizeNumber(bytesDownloaded),
    totalBytes: normalizeNumber(totalBytes),
    percent: emitPercent(bytesDownloaded, totalBytes),
    checkedAt: Date.now(),
  }
}

function formatRuntimeDownloadMessage({ bytesDownloaded = 0, totalBytes = 0 } = {}) {
  const safeDownloaded = normalizeNumber(bytesDownloaded)
  const safeTotal = normalizeNumber(totalBytes)
  const percent = emitPercent(safeDownloaded, safeTotal)
  if (safeDownloaded && safeTotal) {
    return `Downloading pinned Codex runtime ${percent}%.`
  }
  return 'Downloading pinned Codex runtime.'
}

export class OpenAIAccountRuntimeManager extends EventEmitter {
  constructor({
    userDataPath = '',
    platform = process.platform,
    arch = process.arch,
    env = process.env,
    now = () => Date.now(),
    fetchJsonImpl = defaultFetchJson,
    downloadFileImpl = defaultDownloadFile,
    extractArchiveImpl = defaultExtractArchive,
  } = {}) {
    super()
    this.userDataPath = normalizeString(userDataPath)
    this.platform = normalizeString(platform) || process.platform
    this.arch = normalizeString(arch) || process.arch
    this.env = env && typeof env === 'object' ? env : process.env
    this.now = typeof now === 'function' ? now : () => Date.now()
    this.fetchJsonImpl = typeof fetchJsonImpl === 'function' ? fetchJsonImpl : defaultFetchJson
    this.downloadFileImpl = typeof downloadFileImpl === 'function' ? downloadFileImpl : defaultDownloadFile
    this.extractArchiveImpl = typeof extractArchiveImpl === 'function' ? extractArchiveImpl : defaultExtractArchive
    this.state = buildDefaultState({
      message: 'Managed Codex runtime has not been prepared yet.',
    })
    this.preparePromise = null
    this.prepareRuntimeVersion = ''
    this.releaseMetadataPromises = new Map()
    this.latestReleaseMetadataPromise = null
  }

  getActiveRuntimeManifestPath() {
    const storagePaths = resolveOpenAIAccountStoragePaths(this.userDataPath)
    return path.join(storagePaths.runtimeRootPath, ACTIVE_RUNTIME_MANIFEST_FILE_NAME)
  }

  resolveActiveRuntimeVersion() {
    const manifest = readJsonFile(this.getActiveRuntimeManifestPath())
    return normalizeString(manifest?.version) || DEFAULT_CODEX_RELEASE_TAG
  }

  writeActiveRuntimeVersion(version = DEFAULT_CODEX_RELEASE_TAG) {
    const safeVersion = normalizeString(version) || DEFAULT_CODEX_RELEASE_TAG
    writeJsonFile(this.getActiveRuntimeManifestPath(), {
      version: safeVersion,
      updatedAt: this.now(),
    })
    return safeVersion
  }

  getPaths({ version = '' } = {}) {
    const runtimeVersion = normalizeString(version) || this.resolveActiveRuntimeVersion()
    const storagePaths = resolveOpenAIAccountStoragePaths(this.userDataPath)
    const runtimeVersionPath = path.join(storagePaths.runtimeRootPath, runtimeDirectoryName(runtimeVersion))
    const executableName = this.platform === 'win32' ? 'codex.exe' : 'codex'
    const codeModeHostName = this.platform === 'win32' ? 'codex-code-mode-host.exe' : 'codex-code-mode-host'
    return {
      ...storagePaths,
      runtimeVersionPath,
      runtimeExecutablePath: path.join(runtimeVersionPath, 'bin', executableName),
      legacyRuntimeExecutablePath: path.join(runtimeVersionPath, executableName),
      runtimeCodeModeHostPath: path.join(runtimeVersionPath, 'bin', codeModeHostName),
      runtimeMetadataFilePath: path.join(runtimeVersionPath, 'runtime.json'),
      runtimeTempPath: path.join(storagePaths.runtimeRootPath, `.tmp-${runtimeVersion}`),
    }
  }

  getState() {
    return cloneJson(this.state)
  }

  setState(nextState = {}) {
    const normalized = buildDefaultState({
      ...this.state,
      ...nextState,
      checkedAt: this.now(),
    })
    const previous = JSON.stringify(this.state)
    this.state = normalized
    if (JSON.stringify(this.state) !== previous) {
      this.emit('state-updated', this.getState())
    }
    return this.getState()
  }

  getPinnedAssetSpec() {
    return resolvePinnedAssetSpec({
      platform: this.platform,
      arch: this.arch,
    })
  }

  async getReleaseMetadata(version = DEFAULT_CODEX_RELEASE_TAG) {
    const releaseTag = normalizeString(version) || DEFAULT_CODEX_RELEASE_TAG
    if (this.releaseMetadataPromises.has(releaseTag)) {
      return await this.releaseMetadataPromises.get(releaseTag)
    }
    const releaseMetadataPromise = this.fetchJsonImpl(
      `${GITHUB_API_BASE_URL}/repos/${OPENAI_CODEX_REPOSITORY}/releases/tags/${encodeURIComponent(releaseTag)}`,
    )
    this.releaseMetadataPromises.set(releaseTag, releaseMetadataPromise)
    try {
      return await releaseMetadataPromise
    } finally {
      this.releaseMetadataPromises.delete(releaseTag)
    }
  }

  async getLatestReleaseMetadata() {
    if (this.latestReleaseMetadataPromise) return await this.latestReleaseMetadataPromise
    this.latestReleaseMetadataPromise = this.fetchJsonImpl(
      `${GITHUB_API_BASE_URL}/repos/${OPENAI_CODEX_REPOSITORY}/releases/latest`,
    )
    try {
      return await this.latestReleaseMetadataPromise
    } finally {
      this.latestReleaseMetadataPromise = null
    }
  }

  findReleaseAsset(release = null, spec = null) {
    if (!spec || !Array.isArray(release?.assets)) return null
    for (const assetName of [spec.packageAssetName, spec.legacyAssetName]) {
      const asset = release.assets.find((entry) => normalizeString(entry?.name) === assetName)
      if (asset) return asset
    }
    return null
  }

  refreshState() {
    const explicitExecutablePath = normalizeString(this.env?.ADDOM_CODEX_EXECUTABLE)
    if (explicitExecutablePath) {
      if (fs.existsSync(explicitExecutablePath)) {
        return this.setState({
          status: 'runtime_ready',
          reason: '',
          message: 'Using explicit Codex runtime override.',
          executablePath: explicitExecutablePath,
          assetName: '',
          source: 'explicit',
          bytesDownloaded: 0,
          totalBytes: 0,
          updateStatus: 'disabled',
          updateAvailable: false,
          updateMessage: 'Runtime updates are disabled while ADDOM_CODEX_EXECUTABLE is set.',
        })
      }
      return this.setState({
        status: 'runtime_failed',
        reason: 'runtime_override_missing',
        message: 'Configured Codex runtime override path does not exist.',
        executablePath: '',
        assetName: '',
        source: 'explicit',
        bytesDownloaded: 0,
        totalBytes: 0,
        updateStatus: 'disabled',
        updateAvailable: false,
        updateMessage: 'Runtime updates are disabled while ADDOM_CODEX_EXECUTABLE is set.',
      })
    }

    const spec = this.getPinnedAssetSpec()
    if (!spec) {
      return this.setState({
        status: 'runtime_failed',
        reason: 'runtime_platform_not_supported',
        message: `Pinned Codex runtime download is not implemented for ${this.platform}/${this.arch}.`,
        executablePath: '',
        assetName: '',
        source: 'managed',
        bytesDownloaded: 0,
        totalBytes: 0,
      })
    }

    if (this.preparePromise && ['runtime_downloading', 'runtime_verifying'].includes(this.state.status)) {
      return this.getState()
    }

    const activeVersion = this.resolveActiveRuntimeVersion()
    const paths = this.getPaths({ version: activeVersion })
    const metadata = readJsonFile(paths.runtimeMetadataFilePath)
    const metadataExecutablePath = normalizeString(metadata?.executablePath)
    const runtimeExecutablePath = metadataExecutablePath && fs.existsSync(metadataExecutablePath)
      ? metadataExecutablePath
      : (fs.existsSync(paths.runtimeExecutablePath) ? paths.runtimeExecutablePath : paths.legacyRuntimeExecutablePath)
    const codeModeHostPath = normalizeString(metadata?.codeModeHostPath) || paths.runtimeCodeModeHostPath
    const executableExists = fs.existsSync(runtimeExecutablePath)
    const hostRequired = requiresCodeModeHost(normalizeString(metadata?.version) || activeVersion)
    const hostExists = fs.existsSync(codeModeHostPath)
    if (executableExists && (!hostRequired || hostExists)) {
      return this.setState({
        status: 'runtime_ready',
        reason: '',
        message: 'Managed Codex runtime is ready.',
        executablePath: runtimeExecutablePath,
        assetName: normalizeString(metadata?.assetName) || spec.legacyAssetName,
        source: 'managed',
        bytesDownloaded: 0,
        totalBytes: 0,
        version: normalizeString(metadata?.version) || activeVersion,
      })
    }

    if (executableExists || hostExists) {
      return this.setState({
        status: 'runtime_missing',
        reason: 'runtime_package_incomplete',
        message: 'The managed Codex runtime is incomplete and needs repair before tools can run.',
        executablePath: '',
        assetName: spec.packageAssetName,
        source: 'managed',
        bytesDownloaded: 0,
        totalBytes: 0,
        version: normalizeString(metadata?.version) || activeVersion,
      })
    }

    return this.setState({
      status: 'runtime_missing',
      reason: 'runtime_missing',
      message: 'OpenAI account login needs the managed Codex runtime. It will be downloaded when sign-in starts.',
      executablePath: '',
      assetName: spec.packageAssetName,
      source: 'managed',
      bytesDownloaded: 0,
      totalBytes: 0,
      version: activeVersion,
    })
  }

  async ensureRuntimeReady({ version = '', force = false } = {}) {
    const targetVersion = normalizeString(version) || this.resolveActiveRuntimeVersion()
    const currentState = this.refreshState()
    if (
      currentState.status === 'runtime_ready'
      && currentState.version === targetVersion
      && force !== true
    ) {
      return currentState
    }
    if (this.preparePromise) {
      if (this.prepareRuntimeVersion === targetVersion && force !== true) {
        return await this.preparePromise
      }
      await this.preparePromise
      return await this.ensureRuntimeReady({ version: targetVersion, force })
    }

    this.prepareRuntimeVersion = targetVersion
    this.preparePromise = (async () => {
      const spec = this.getPinnedAssetSpec()
      if (!spec) {
        return this.refreshState()
      }
      const paths = this.getPaths({ version: targetVersion })
      const release = await this.getReleaseMetadata(targetVersion)
      const asset = this.findReleaseAsset(release, spec)
      if (!asset?.browser_download_url) {
        return this.setState({
          status: 'runtime_failed',
          reason: 'runtime_asset_not_found',
          message: `Codex release ${targetVersion} does not publish a supported runtime package.`,
          executablePath: '',
          assetName: spec.packageAssetName,
          source: 'managed',
          version: targetVersion,
        })
      }

      removeDirectory(paths.runtimeTempPath)
      ensureDirectory(paths.runtimeTempPath)
      const assetName = normalizeString(asset.name)
      const layout = resolveAssetLayout(spec, assetName)
      const downloadPath = path.join(paths.runtimeTempPath, assetName)
      const expectedDigest = normalizeString(asset.digest)
      const totalBytes = normalizeNumber(asset.size)
      this.setState({
        status: 'runtime_downloading',
        reason: '',
        message: formatRuntimeDownloadMessage({ bytesDownloaded: 0, totalBytes }),
        executablePath: '',
        assetName,
        source: 'managed',
        bytesDownloaded: 0,
        totalBytes,
        version: targetVersion,
      })

      try {
        await this.downloadFileImpl({
          url: String(asset.browser_download_url || ''),
          destinationPath: downloadPath,
          onProgress: ({ bytesDownloaded = 0, totalBytes: progressTotalBytes = totalBytes } = {}) => {
            this.setState({
              status: 'runtime_downloading',
              reason: '',
              message: formatRuntimeDownloadMessage({
                bytesDownloaded,
                totalBytes: progressTotalBytes || totalBytes,
              }),
              executablePath: '',
              assetName,
              source: 'managed',
              bytesDownloaded,
              totalBytes: progressTotalBytes || totalBytes,
              version: targetVersion,
            })
          },
        })
        this.setState({
          status: 'runtime_verifying',
          reason: '',
          message: 'Verifying pinned Codex runtime.',
          executablePath: '',
          assetName,
          source: 'managed',
          bytesDownloaded: totalBytes,
          totalBytes,
          version: targetVersion,
        })
        const actualDigest = await sha256File(downloadPath)
        if (expectedDigest && actualDigest !== expectedDigest) {
          throw new Error(`Runtime checksum mismatch for ${assetName}.`)
        }

        const runtimeVersionPath = paths.runtimeVersionPath
        removeDirectory(runtimeVersionPath)
        ensureDirectory(runtimeVersionPath)
        if (layout.isArchive) {
          await this.extractArchiveImpl({
            archivePath: downloadPath,
            destinationPath: runtimeVersionPath,
          })
        } else {
          fs.copyFileSync(downloadPath, paths.legacyRuntimeExecutablePath)
        }
        const installedExecutablePath = path.join(runtimeVersionPath, ...layout.executablePath)
        const installedCodeModeHostPath = layout.codeModeHostPath.length > 0
          ? path.join(runtimeVersionPath, ...layout.codeModeHostPath)
          : ''
        if (!fs.existsSync(installedExecutablePath)) {
          throw new Error(`Codex runtime package did not contain ${layout.executablePath.join('/')}.`)
        }
        if (requiresCodeModeHost(targetVersion) && !fs.existsSync(installedCodeModeHostPath)) {
          throw new Error('Codex runtime package did not contain codex-code-mode-host.')
        }
        if (this.platform !== 'win32') {
          fs.chmodSync(installedExecutablePath, 0o755)
          if (installedCodeModeHostPath) fs.chmodSync(installedCodeModeHostPath, 0o755)
        }
        fs.writeFileSync(paths.runtimeMetadataFilePath, JSON.stringify({
          version: targetVersion,
          assetName,
          executablePath: installedExecutablePath,
          codeModeHostPath: installedCodeModeHostPath,
          digest: expectedDigest || actualDigest,
          downloadedAt: this.now(),
          hostPlatform: `${this.platform}/${this.arch}`,
        }, null, 2), 'utf8')
        this.writeActiveRuntimeVersion(targetVersion)
        removeDirectory(paths.runtimeTempPath)
        return this.setState({
          status: 'runtime_ready',
          reason: '',
          message: 'Managed Codex runtime is ready.',
          executablePath: installedExecutablePath,
          assetName,
          source: 'managed',
          bytesDownloaded: 0,
          totalBytes: 0,
          version: targetVersion,
        })
      } catch (error) {
        removeDirectory(paths.runtimeTempPath)
        return this.setState({
          status: 'runtime_failed',
          reason: 'runtime_download_failed',
          message: normalizeString(error?.message) || 'Pinned Codex runtime download failed.',
          executablePath: '',
          assetName,
          source: 'managed',
          bytesDownloaded: 0,
          totalBytes,
          version: targetVersion,
        })
      }
    })()

    try {
      return await this.preparePromise
    } finally {
      this.preparePromise = null
      this.prepareRuntimeVersion = ''
    }
  }

  async checkForUpdates() {
    const currentState = this.refreshState()
    if (currentState.source === 'explicit') {
      return this.setState({
        updateStatus: 'disabled',
        updateAvailable: false,
        updateMessage: 'Runtime updates are disabled while ADDOM_CODEX_EXECUTABLE is set.',
        updateCheckedAt: this.now(),
      })
    }
    const spec = this.getPinnedAssetSpec()
    if (!spec) {
      return this.setState({
        updateStatus: 'failed',
        updateAvailable: false,
        updateMessage: `Codex runtime update checks are not implemented for ${this.platform}/${this.arch}.`,
        updateCheckedAt: this.now(),
      })
    }
    this.setState({
      updateStatus: 'checking',
      updateAvailable: false,
      updateMessage: 'Checking for Codex runtime updates.',
    })
    try {
      const latestRelease = await this.getLatestReleaseMetadata()
      const latestVersion = normalizeString(latestRelease?.tag_name)
      if (!latestVersion) {
        return this.setState({
          updateStatus: 'failed',
          updateAvailable: false,
          latestVersion: '',
          updateMessage: 'Latest Codex release metadata did not include a version.',
          updateCheckedAt: this.now(),
        })
      }
      const asset = this.findReleaseAsset(latestRelease, spec)
      if (!asset?.browser_download_url) {
        return this.setState({
          updateStatus: 'failed',
          updateAvailable: false,
          latestVersion,
          updateMessage: `Latest Codex release ${latestVersion} does not publish a supported runtime package.`,
          updateCheckedAt: this.now(),
        })
      }
      const currentVersion = normalizeString(currentState.version) || DEFAULT_CODEX_RELEASE_TAG
      const repairRequired = currentState.reason === 'runtime_package_incomplete'
      const updateAvailable = repairRequired || latestVersion !== currentVersion
      return this.setState({
        updateStatus: updateAvailable ? 'available' : 'current',
        updateAvailable,
        latestVersion,
        updateMessage: updateAvailable
          ? (repairRequired && latestVersion === currentVersion
              ? `Codex runtime ${latestVersion} repair is available.`
              : `Codex runtime ${latestVersion} is available.`)
          : 'Codex runtime is current.',
        updateCheckedAt: this.now(),
      })
    } catch (error) {
      return this.setState({
        updateStatus: 'failed',
        updateAvailable: false,
        updateMessage: normalizeString(error?.message) || 'Codex runtime update check failed.',
        updateCheckedAt: this.now(),
      })
    }
  }

  async installLatestRuntime() {
    const checkedState = await this.checkForUpdates()
    const latestVersion = normalizeString(checkedState.latestVersion)
    if (checkedState.updateAvailable !== true || !latestVersion) return checkedState
    const installedState = await this.ensureRuntimeReady({
      version: latestVersion,
      force: true,
    })
    if (installedState.status !== 'runtime_ready') return installedState
    return this.setState({
      updateStatus: 'current',
      updateAvailable: false,
      latestVersion,
      updateMessage: 'Codex runtime updated.',
      updateCheckedAt: this.now(),
    })
  }
}

export function createOpenAIAccountRuntimeManager(options = {}) {
  return new OpenAIAccountRuntimeManager(options)
}

export const __testOpenAIAccountRuntimeManagerInternals = Object.freeze({
  resolvePinnedAssetSpec,
  formatRuntimeDownloadMessage,
  DEFAULT_CODEX_RELEASE_TAG,
})
