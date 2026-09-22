import { handleVersioned } from '../ipc/ipc-versioning.mjs'

export function registerUpdaterIpcHandlers({ ipcMain, controller }) {
  handleVersioned(ipcMain, 'updater:getState', () => controller.getSnapshot())
  handleVersioned(ipcMain, 'updater:checkForUpdates', () => controller.checkForUpdates())
  handleVersioned(ipcMain, 'updater:downloadUpdate', () => controller.downloadUpdate())
  handleVersioned(ipcMain, 'updater:refreshInstallReadiness', (_event, payload) => (
    controller.refreshInstallBlockers(payload)
  ))
  handleVersioned(ipcMain, 'updater:installUpdate', (_event, payload) => controller.installUpdate(payload))
}
