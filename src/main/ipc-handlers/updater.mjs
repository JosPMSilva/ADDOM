import { ipcMain, app } from 'electron'
import { createRequire } from 'module'
import fs from 'node:fs'
import path from 'node:path'
import { sendVersioned } from '../ipc/ipc-versioning.mjs'
import { createApplicationUpdateController } from '../updater/application-update-controller.mjs'
import { createElectronUpdateAdapter } from '../updater/electron-update-adapter.mjs'
import { registerUpdaterIpcHandlers } from '../updater/application-updater-ipc.mjs'
import { createUnavailableUpdateSnapshot } from '../updater/application-update-state.mjs'
import { createApplicationUpdateInstallCoordinator } from '../updater/application-update-install-coordinator.mjs'
import { createProductionApplicationUpdateActivityMonitor } from '../updater/application-update-production-activity.mjs'
import { beginApplicationWorkQuiescence } from '../application-work-quiescence.mjs'

const require = createRequire(import.meta.url)

const IS_DEV = process.env.ADDOM_DEV === '1' || (!app.isPackaged && process.env.ADDOM_DEV !== '0')
const DISABLED_STATUS = Object.freeze({ status: 'disabled' })

let autoUpdater = null

const ALLOWED_PACKAGED_UPDATE_PROVIDER = 'github'
const ALLOWED_GITHUB_OWNER = 'JosPMSilva'
const ALLOWED_GITHUB_REPOSITORY = 'ADDOM'

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
  } catch {
    if (IS_DEV) console.warn('[updater] electron-updater is unavailable')
  }
  return autoUpdater
}

function createDisabledController() {
  const snapshot = createUnavailableUpdateSnapshot()
  return {
    start() {},
    stop() {},
    getSnapshot: () => snapshot,
    checkForUpdates: async () => DISABLED_STATUS,
    downloadUpdate: async () => DISABLED_STATUS,
    refreshInstallBlockers: async () => DISABLED_STATUS,
    installUpdate: async () => DISABLED_STATUS,
  }
}

export function registerUpdaterHandlers({
  getMainWindow,
  isDev = IS_DEV,
  isPackaged = app.isPackaged,
  chatRunRegistry,
  terminalSessionManager,
  prepareForExit,
} = {}) {
  const mode = !isDev && isPackaged && hasSupportedPackagedUpdateConfig()
    ? 'production'
    : 'disabled'
  const sendSnapshot = (snapshot) => {
    const win = getMainWindow?.()
    if (win && !win.isDestroyed()) sendVersioned(win.webContents, 'updater:state-changed', snapshot)
  }

  let controller
  if (mode === 'production') {
    const updater = getUpdater()
    const activityMonitor = updater
      ? createProductionApplicationUpdateActivityMonitor({
          chatRunRegistry,
          terminalSessionManager,
        })
      : null
    const installCoordinator = activityMonitor
      ? createApplicationUpdateInstallCoordinator({
          collectBlockers: activityMonitor.collectBlockers,
          beginQuiescence: beginApplicationWorkQuiescence,
          prepareForExit,
        })
      : null
    controller = updater
      ? createApplicationUpdateController({
          adapter: createElectronUpdateAdapter(updater, {
            allowPrerelease: String(app.getVersion() || '').includes('-'),
          }),
          installCoordinator,
          installBlockerCollector: activityMonitor.collectBlockers,
          onStateChanged: sendSnapshot,
        })
      : createDisabledController()
  } else {
    controller = createDisabledController()
  }

  registerUpdaterIpcHandlers({ ipcMain, controller })
  if (mode !== 'disabled') app.whenReady().then(() => controller.start())
  return () => controller.stop()
}
