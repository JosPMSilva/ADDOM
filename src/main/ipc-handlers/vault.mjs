import { ipcMain } from 'electron'
import * as vault from '../vault.mjs'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import {
  resolveVaultGetModelCapabilitiesResponse,
  resolveVaultGetProviderModelsResponse,
  resolveVaultGetProvidersResponse,
} from './vault-handler-helpers.mjs'

/**
 * Register all vault-related IPC handlers.
 * Called once from main/index.mjs during app startup.
 */
export function registerVaultHandlers() {
  // Return provider list + which providers have keys configured.
  handleVersioned(ipcMain, 'vault:getProviders', async (_event, { forceRefresh = false } = {}) => {
    return resolveVaultGetProvidersResponse({ forceRefresh })
  })

  handleVersioned(ipcMain, 'vault:getProviderModels', async (_event, {
    providerId,
    forceRefresh = false,
  } = {}) => {
    return resolveVaultGetProviderModelsResponse({
      providerId,
      forceRefresh,
    })
  })

  handleVersioned(ipcMain, 'vault:getModelCapabilities', async (_event, {
    providerId,
    modelId,
    forceRefresh = false,
  } = {}) => {
    return resolveVaultGetModelCapabilitiesResponse({
      providerId,
      modelId,
      forceRefresh,
    })
  })

  // Save an API key (encrypted).
  handleVersioned(ipcMain, 'vault:setKey', async (_event, { providerId, apiKey }) => {
    if (!providerId || !apiKey) throw new Error('providerId and apiKey are required')
    await vault.setKey(providerId, apiKey.trim())
    return { ok: true }
  })

  // Delete a stored key.
  handleVersioned(ipcMain, 'vault:deleteKey', async (_event, { providerId }) => {
    await vault.deleteKey(providerId)
    return { ok: true }
  })
}
