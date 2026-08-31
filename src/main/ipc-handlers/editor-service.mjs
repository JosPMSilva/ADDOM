import { ipcMain } from 'electron'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { getEditorLanguageServiceManager } from '../editor/editor-language-service-manager.mjs'

export function registerEditorServiceHandlers() {
  const manager = getEditorLanguageServiceManager()

  handleVersioned(ipcMain, 'editor:service:sync-document', async (_event, payload = {}) => {
    return manager.syncDocument(payload || {})
  })

  handleVersioned(ipcMain, 'editor:service:request', async (_event, payload = {}) => {
    return manager.request(payload || {})
  })

  handleVersioned(ipcMain, 'editor:service:refresh-runtime', async (_event, payload = {}) => {
    return manager.refreshRuntimeAvailability(payload || {})
  })
}
