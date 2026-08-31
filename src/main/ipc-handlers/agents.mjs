import { ipcMain } from 'electron'

import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { listRoleTemplates } from '../moa/role-templates.mjs'

export function registerAgentHandlers() {
  handleVersioned(ipcMain, 'agents:list-role-templates', () => listRoleTemplates())
}
