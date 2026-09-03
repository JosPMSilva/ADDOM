import { ipcMain, app } from 'electron'
import { createRequire } from 'module'
import fs from 'node:fs'
import path from 'node:path'
import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'

const require = createRequire(import.meta.url)

const IS_DEV = process.env.ADDOM_DEV === '1' || (!app.isPackaged && process.env.ADDOM_DEV !== '0')
const DISABLED_STATUS = Object.freeze({ status: 'disabled' })
const ALLOWED_PACKAGED_UPDATE_PROVIDER = 'github'
const ALLOWED_GITHUB_OWNER = 'JosPMSilva'
const ALLOWED_GITHUB_REPOSITORY = 'ADDOM'
const UNAVAILABLE_HTTP_STATUS_CODES = new Set([401, 403, 404])
const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NETWORK',
])

let autoUpdater = null

function readUpdaterHttpStatus(error) {
  const candidates = [error?.statusCode, error?.status, error?.response?.statusCode, error?.response?.status]
  for (const value of candidates) {
    const status = Number(value)
    if (Number.isInteger(status) && status >= 100 && status <= 599) return status
  }
  const match = String(error?.message || '').match(/(?:status(?:Code)?["']?\s*[:=]\s*|\bHTTP\s+)(\d{3})\b/i)
    || String(error?.message || '').match(/^\s*(\d{3})\b/)
  return match ? Number(match[1]) : null
}

function classifyUpdaterFailure(error) {
  const errorCode = String(error?.code || '').trim().toUpperCase()
  const statusCode = readUpdaterHttpStatus(error)
  if (UNAVAILABLE_HTTP_STATUS_CODES.has(statusCode)
    || errorCode === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS'
    || errorCode === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') {
    return { code: 'unavailable' }
  }
  if (NETWORK_ERROR_CODES.has(errorCode)) return { code: 'network' }
  return { code: 'generic' }
}

function getPackagedUpdateConfigPath() {
  if (!app.isPackaged) return ''
  const resourcesPath = String(process.resourcesPath || '').trim()
  if (!resourcesPath) return ''
  return path.join(resourcesPath, 'app-update.yml')
}

function readPackagedUpdateConfig() {
  const configPath = getPackagedUpdateConfigPath()
  if (!configPath || !fs.existsSync(configPath)) return null
  try {
    const source = fs.readFileSync(configPath, 'utf8')
    const config = {}
    for (const line of String(source || '').split(/\r?\n/)) {
      const trimmed = String(line || '').trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separatorIndex = trimmed.indexOf(':')
      if (separatorIndex <= 0) continue
      const key = trimmed.slice(0, separatorIndex).trim()
      const value = trimmed.slice(separatorIndex + 1).trim()
      if (!key) continue
      config[key] = value
    }
    return config
  } catch {
    return null
  }
}

function hasSupportedPackagedUpdateConfig() {
  const config = readPackagedUpdateConfig()
  if (!config) return false
  return String(config.provider || '').trim().toLowerCase() === ALLOWED_PACKAGED_UPDATE_PROVIDER
    && String(config.owner || '').trim().toLowerCase() === ALLOWED_GITHUB_OWNER.toLowerCase()
    && String(config.repo || '').trim().toLowerCase() === ALLOWED_GITHUB_REPOSITORY.toLowerCase()
}

function getUpdater() {
  if (autoUpdater) return autoUpdater
  if (!hasSupportedPackagedUpdateConfig()) return null
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload         = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease      = String(app.getVersion() || '').includes('-')
  } catch {
    if (IS_DEV) {
      console.warn('[updater] electron-updater is unavailable')
    }
  }
  return autoUpdater
}

export function registerUpdaterHandlers(getMainWindow) {
  if (IS_DEV || !hasSupportedPackagedUpdateConfig()) {
    handleVersioned(ipcMain, 'updater:checkForUpdates', () => (IS_DEV ? { status: 'dev-mode' } : DISABLED_STATUS))
    handleVersioned(ipcMain, 'updater:downloadUpdate',  () => (IS_DEV ? { status: 'dev-mode' } : DISABLED_STATUS))
    handleVersioned(ipcMain, 'updater:installUpdate',   () => { /* no-op */ })
    return
  }

  const updater = getUpdater()
  if (!updater) return

  function send(channel, data) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) sendVersioned(win.webContents, channel, data)
  }

  updater.on('checking-for-update',  ()     => send('updater:checking'))
  updater.on('update-available',     (info) => send('updater:available',    { version: info.version }))
  updater.on('update-not-available', ()     => send('updater:not-available'))
  updater.on('error', (err) => {
    const failure = classifyUpdaterFailure(err)
    console.warn('[updater] update operation failed', failure)
    send('updater:error', failure)
  })
  updater.on('download-progress',    (p)    => send('updater:progress',      { percent: Math.round(p.percent) }))
  updater.on('update-downloaded',    (info) => send('updater:downloaded',    { version: info.version }))

  handleVersioned(ipcMain, 'updater:checkForUpdates', async () => {
    try {
      await updater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      return { ok: false, ...classifyUpdaterFailure(err) }
    }
  })

  handleVersioned(ipcMain, 'updater:downloadUpdate', async () => {
    try {
      await updater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      return { ok: false, ...classifyUpdaterFailure(err) }
    }
  })

  handleVersioned(ipcMain, 'updater:installUpdate', () => {
    updater.quitAndInstall(false, true)
  })

  app.whenReady().then(() => {
    setTimeout(() => {
      updater.checkForUpdates().catch(() => {})
    }, 10_000)
  })
}
