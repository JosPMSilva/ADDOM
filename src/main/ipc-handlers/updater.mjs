import { ipcMain, app } from 'electron'
import { createRequire } from 'module'
import fs from 'node:fs'
import path from 'node:path'
import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'

const require = createRequire(import.meta.url)

const IS_DEV = process.env.ADDOM_DEV === '1' || (!app.isPackaged && process.env.ADDOM_DEV !== '0')
const DISABLED_STATUS = Object.freeze({ status: 'disabled' })
const ALLOWED_PACKAGED_UPDATE_PROVIDER = 'generic'

let autoUpdater = null

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
    && String(config.url || '').trim().length > 0
}

function getUpdater() {
  if (autoUpdater) return autoUpdater
  if (!hasSupportedPackagedUpdateConfig()) return null
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload         = false
    autoUpdater.autoInstallOnAppQuit = true
  } catch (err) {
    if (IS_DEV) {
      console.warn('[updater] electron-updater not available:', err.message)
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
  updater.on('error',                (err)  => send('updater:error',         { message: err.message }))
  updater.on('download-progress',    (p)    => send('updater:progress',      { percent: Math.round(p.percent) }))
  updater.on('update-downloaded',    (info) => send('updater:downloaded',    { version: info.version }))

  handleVersioned(ipcMain, 'updater:checkForUpdates', async () => {
    try {
      await updater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  handleVersioned(ipcMain, 'updater:downloadUpdate', async () => {
    try {
      await updater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
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
