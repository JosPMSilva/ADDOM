import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronApp = (() => {
  try {
    const electronModule = require('electron')
    if (
      electronModule
      && typeof electronModule === 'object'
      && electronModule.app
      && typeof electronModule.app.getPath === 'function'
    ) {
      return electronModule.app
    }
  } catch {
    // Non-Electron runtime.
  }
  return null
})()

const TEST_USER_DATA_DIR = path.join(os.tmpdir(), 'addom-node-test-userdata')

function hasElectronAppPathApi() {
  return !!(electronApp && typeof electronApp.getPath === 'function')
}

export function getUserDataPath() {
  if (hasElectronAppPathApi()) {
    return electronApp.getPath('userData')
  }
  const override = String(process.env.ADDOM_USER_DATA_PATH || '').trim()
  const fallback = override || TEST_USER_DATA_DIR
  try {
    fs.mkdirSync(fallback, { recursive: true })
  } catch {
    // Best effort fallback for non-Electron test/runtime environments.
  }
  return fallback
}

export function getElectronApp() {
  return hasElectronAppPathApi() ? electronApp : null
}
