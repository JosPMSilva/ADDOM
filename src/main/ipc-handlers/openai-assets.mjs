import { ipcMain } from 'electron'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import {
  attachFilesToOpenAIProjectVectorStore,
  deleteOpenAIProjectVectorStore,
  ensureOpenAIProjectVectorStore,
  listOpenAIProjectAssets,
  removeOpenAIProjectAsset,
  syncOpenAIProjectAssets,
  uploadOpenAIFiles,
} from '../api-clients/openai-asset-service.mjs'

function sanitizeOpenAIAssetPayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const sanitized = { ...source }
  delete sanitized.apiKey
  return sanitized
}

export function registerOpenAIAssetHandlers() {
  handleVersioned(ipcMain, 'openai-assets:list-project-assets', async (_event, payload = {}) => {
    return listOpenAIProjectAssets(String(payload?.projectId || payload || ''))
  })

  handleVersioned(ipcMain, 'openai-assets:ensure-project-vector-store', async (_event, payload = {}) => {
    return ensureOpenAIProjectVectorStore(String(payload?.projectId || payload || ''))
  })

  handleVersioned(ipcMain, 'openai-assets:upload-files', async (_event, payload = {}) => {
    return uploadOpenAIFiles(sanitizeOpenAIAssetPayload(payload))
  })

  handleVersioned(ipcMain, 'openai-assets:attach-files-to-project-vector-store', async (_event, payload = {}) => {
    return attachFilesToOpenAIProjectVectorStore(sanitizeOpenAIAssetPayload(payload))
  })

  handleVersioned(ipcMain, 'openai-assets:remove-project-asset', async (_event, payload = {}) => {
    return { ok: await removeOpenAIProjectAsset(String(payload?.assetId || payload || '')) }
  })

  handleVersioned(ipcMain, 'openai-assets:delete-project-vector-store', async (_event, payload = {}) => {
    return { ok: await deleteOpenAIProjectVectorStore(String(payload?.projectId || payload || '')) }
  })

  handleVersioned(ipcMain, 'openai-assets:sync-project-assets', async (_event, payload = {}) => {
    return syncOpenAIProjectAssets(String(payload?.projectId || payload || ''))
  })
}
