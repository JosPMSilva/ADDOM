import { ipcMain } from '../electron-api.mjs'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import {
  getAdvancedConfigDiagnostics,
  reloadAdvancedConfig,
} from '../advanced-config.mjs'
import { consumePendingAdvancedConfigSecurityWarning } from '../advanced-config-security-audit.mjs'

export function registerAdvancedConfigHandlers() {
  handleVersioned(ipcMain, 'advanced-config:get-diagnostics', () => getAdvancedConfigDiagnostics())
  handleVersioned(ipcMain, 'advanced-config:reload', () => reloadAdvancedConfig().diagnostics)
  handleVersioned(ipcMain, 'advanced-config:security-warning', () => consumePendingAdvancedConfigSecurityWarning())
}
