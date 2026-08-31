import { ipcMain } from 'electron'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import {
  cleanupToolResultSpilloverData,
  cleanupProviderBudgetProfileData,
  deleteAllApiKeys,
  resetToolResultSpilloverData,
  resetProviderBudgetProfileData,
  resolveProviderBudgetSummary,
  resolveLocalDataSummary,
  resolveToolResultSpilloverSummary,
  resetCurrentProfileAndRestart,
} from '../local-data/local-data-service.mjs'

export function registerLocalDataHandlers({
  getElectronSession = null,
  getTempAttachmentPath = null,
  beforeReset = null,
} = {}) {
  const resolveTempAttachmentPath = () => (
    typeof getTempAttachmentPath === 'function' ? getTempAttachmentPath() : ''
  )
  const resolveElectronSession = () => (
    typeof getElectronSession === 'function' ? getElectronSession() : null
  )

  handleVersioned(ipcMain, 'local-data:get-summary', () => {
    return resolveLocalDataSummary({
      tempAttachmentPath: resolveTempAttachmentPath(),
    })
  })

  handleVersioned(ipcMain, 'local-data:get-provider-budget-summary', () => {
    return resolveProviderBudgetSummary()
  })

  handleVersioned(ipcMain, 'local-data:cleanup-provider-budget-profiles', () => {
    return cleanupProviderBudgetProfileData()
  })

  handleVersioned(ipcMain, 'local-data:reset-provider-budget-profiles', () => {
    return resetProviderBudgetProfileData()
  })

  handleVersioned(ipcMain, 'local-data:get-tool-result-spillover-summary', () => {
    return resolveToolResultSpilloverSummary()
  })

  handleVersioned(ipcMain, 'local-data:cleanup-tool-result-spillover', () => {
    return cleanupToolResultSpilloverData()
  })

  handleVersioned(ipcMain, 'local-data:reset-tool-result-spillover', () => {
    return resetToolResultSpilloverData()
  })

  handleVersioned(ipcMain, 'local-data:delete-api-keys', () => {
    return deleteAllApiKeys()
  })

  handleVersioned(ipcMain, 'local-data:reset-all-and-restart', async () => {
    await resetCurrentProfileAndRestart({
      electronSession: resolveElectronSession(),
      tempAttachmentPath: resolveTempAttachmentPath(),
      beforeReset,
    })
    return { ok: true }
  })
}
