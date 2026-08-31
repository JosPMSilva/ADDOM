import { ipcMain } from '../electron-api.mjs'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { getCursorAgentAuthService } from '../cursor-agent/cursor-agent-auth-service.mjs'

export function registerCursorAgentHandlers({
  service = getCursorAgentAuthService(),
  handle = (channel, handler) => handleVersioned(ipcMain, channel, handler),
} = {}) {
  handle('cursor-agent:get-state', (_event, options = {}) => service.getState({
    forceRefresh: options?.forceRefresh !== false,
  }))
  handle('cursor-agent:prepare-runtime', () => service.prepareRuntime())
  handle('cursor-agent:check-runtime-update', () => service.checkRuntimeUpdate())
  handle('cursor-agent:install-runtime-update', () => service.installRuntimeUpdate())
  handle('cursor-agent:start-login', () => service.startLogin())
  handle('cursor-agent:cancel-login', () => service.cancelLogin())
  handle('cursor-agent:logout', () => service.logout())
}
