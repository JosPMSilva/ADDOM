import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('vault:getProviders lists configured providers without decrypting every remote API key', () => {
  const helperSource = readSource('src/main/ipc-handlers/vault-handler-helpers.mjs')
  const handlerSource = readSource('src/main/ipc-handlers/vault.mjs')
  const getProvidersHelper = helperSource.match(/export async function resolveVaultGetProvidersResponse[\s\S]*?return insertCursorAgentProvider\(manifest\)\.map/)
  const getProvidersHandler = handlerSource.match(/handleVersioned\(ipcMain,\s*'vault:getProviders'[\s\S]*?resolveVaultGetProvidersResponse\(\{ forceRefresh \}\)/)

  assert.ok(getProvidersHelper, 'vault:getProviders helper block should exist')
  assert.ok(getProvidersHandler, 'vault:getProviders handler should delegate to the helper')
  assert.match(getProvidersHelper[0], /const configured = listConfiguredProviders\(\)/)
  assert.match(getProvidersHelper[0], /const manifest = await getManifest\(\{ forceRefresh: !!forceRefresh \}\)/)
  assert.doesNotMatch(getProvidersHelper[0], /vault\.getKey\(/)
})

test('Cursor is inserted as an agent runtime outside the generated direct-provider registry', () => {
  const helperSource = readSource('src/main/ipc-handlers/vault-handler-helpers.mjs')
  const registrySource = readSource('src/common/api-clients/model-registry-data.mjs')

  assert.match(helperSource, /insertCursorAgentProvider\(manifest\)/)
  assert.match(helperSource, /providerClass:\s*'agent_runtime'|getCursorAgentProviderManifestEntry/)
  assert.doesNotMatch(registrySource, /providerId:\s*'cursor'/)
})

test('provider manifest no longer accepts unused apiKeys input', () => {
  const source = readSource('src/main/api-clients/ai-provider.mjs')

  assert.match(source, /export async function getProviderManifest\(\{ forceRefresh = false \} = \{\}\)/)
  assert.doesNotMatch(source, /getProviderManifest\(\{ apiKeys/)
})

test('vault:getProviderModels is exposed as a dedicated on-demand IPC path', () => {
  const preloadSource = readSource('src/preload/index.mjs')
  const handlerSource = readSource('src/main/ipc-handlers/vault.mjs')

  assert.match(preloadSource, /getProviderModels: \(providerId, forceRefresh = false\) =>/)
  assert.match(preloadSource, /invokeVersioned\('vault:getProviderModels'/)
  assert.match(handlerSource, /handleVersioned\(ipcMain,\s*'vault:getProviderModels'/)
  assert.match(handlerSource, /resolveVaultGetProviderModelsResponse/)
})
