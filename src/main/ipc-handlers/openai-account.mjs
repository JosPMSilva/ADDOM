import { BrowserWindow, ipcMain } from 'electron'
import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import { getOpenAIAccountAuthService } from '../openai-account/openai-account-auth-service.mjs'

function broadcastVersioned(channel, payload = {}) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window?.webContents || window.webContents.isDestroyed()) continue
    sendVersioned(window.webContents, channel, payload)
  }
}

let openAIAccountEventBridgeRegistered = false

function getEnabledOpenAIAccountService() {
  const service = getOpenAIAccountAuthService()
  if (!openAIAccountEventBridgeRegistered) {
    service.on('session-updated', (payload = {}) => {
      broadcastVersioned('openai-account:session-updated', payload)
    })
    service.on('login-updated', (payload = null) => {
      broadcastVersioned('openai-account:login-updated', payload)
    })
    service.on('storage-updated', (payload = {}) => {
      broadcastVersioned('openai-account:storage-updated', payload)
    })
    openAIAccountEventBridgeRegistered = true
  }
  return service
}

export function registerOpenAIAccountHandlers() {
  handleVersioned(ipcMain, 'openai-account:get-state', () => {
    return getEnabledOpenAIAccountService().getState()
  })
  handleVersioned(ipcMain, 'openai-account:refresh-state', () => {
    return getEnabledOpenAIAccountService().refreshState()
  })
  handleVersioned(ipcMain, 'openai-account:prepare-runtime', (_event, payload = {}) => {
    return getEnabledOpenAIAccountService().prepareRuntime(payload)
  })
  handleVersioned(ipcMain, 'openai-account:check-runtime-update', () => {
    return getEnabledOpenAIAccountService().checkRuntimeUpdate()
  })
  handleVersioned(ipcMain, 'openai-account:install-runtime-update', () => {
    return getEnabledOpenAIAccountService().installRuntimeUpdate()
  })
  handleVersioned(ipcMain, 'openai-account:start-login', () => {
    return getEnabledOpenAIAccountService().startLogin()
  })
  handleVersioned(ipcMain, 'openai-account:reopen-login-browser', (_event, { loginId } = {}) => {
    return getEnabledOpenAIAccountService().reopenLoginBrowser(loginId)
  })
  handleVersioned(ipcMain, 'openai-account:cancel-login', (_event, { loginId } = {}) => {
    return getEnabledOpenAIAccountService().cancelLogin(loginId)
  })
  handleVersioned(ipcMain, 'openai-account:disconnect', () => {
    return getEnabledOpenAIAccountService().disconnect()
  })
}
