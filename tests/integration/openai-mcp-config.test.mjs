import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-mcp-'))
const originalUserDataPath = process.env.ADDOM_USER_DATA_PATH
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  __resetVaultStateForTests,
  __setSafeStorageForTests,
} = await import('../../src/main/vault.mjs')
const {
  getPersistedSettings,
  getSettings,
  setSettingsPatch,
} = await import('../../src/main/settings.mjs')
const {
  deleteOpenAIMcpServer,
  listOpenAIMcpServers,
  hasOpenAIMcpServerSecret,
  resolveOpenAIMcpRuntimeServers,
  saveOpenAIMcpServer,
  setOpenAIMcpServerSecret,
} = await import('../../src/main/api-clients/openai-mcp-config.mjs')

function createMockSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (raw = '') => Buffer.from(`enc:${String(raw || '')}`, 'utf8'),
    decryptString: (buffer) => {
      const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '')
      if (!text.startsWith('enc:')) {
        throw new Error('decrypt_failed')
      }
      return text.slice(4)
    },
  }
}

test.beforeEach(async () => {
  __resetVaultStateForTests()
  __setSafeStorageForTests(createMockSafeStorage())
  try { fs.rmSync(path.join(userDataPath, 'settings.json'), { force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(path.join(userDataPath, 'vault.json'), { force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(path.join(userDataPath, 'advanced.toml'), { force: true }) } catch { /* best-effort test cleanup */ }
  await setSettingsPatch({
    providerRuntimeSettings: {
      openai: {
        hostedToolConfig: {
          mcp: {
            servers: [],
          },
        },
      },
    },
  })
})

test.after(() => {
  __setSafeStorageForTests(null)
  __resetVaultStateForTests()
  if (typeof originalUserDataPath === 'string') {
    process.env.ADDOM_USER_DATA_PATH = originalUserDataPath
  } else {
    delete process.env.ADDOM_USER_DATA_PATH
  }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('openai mcp config requires a vault secret before runtime exposure', async () => {
  const server = await saveOpenAIMcpServer({
    id: 'docs_server',
    label: 'Docs Server',
    enabled: true,
    serverUrl: 'https://example.com/mcp',
    serverDescription: 'Project docs MCP endpoint',
    allowedTools: ['search_docs', 'search_docs'],
    requireApproval: 'always',
  })

  assert.equal(server.id, 'docs_server')
  assert.equal(server.requireApproval, 'always')
  assert.deepEqual(server.allowedTools, ['search_docs'])

  const listed = listOpenAIMcpServers()
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, 'docs_server')

  const beforeSecret = resolveOpenAIMcpRuntimeServers({
    hostedToolConfig: {
      mcp: {
        servers: listed,
      },
    },
  })
  assert.deepEqual(beforeSecret, [])
  assert.equal(hasOpenAIMcpServerSecret(listed[0]), false)

  await setOpenAIMcpServerSecret('docs_server', {
    type: 'bearer',
    bearerToken: 'token-123',
  })
  assert.equal(hasOpenAIMcpServerSecret(listed[0]), true)

  const afterSecret = resolveOpenAIMcpRuntimeServers({
    hostedToolConfig: {
      mcp: {
        servers: listed,
      },
    },
  })
  assert.equal(afterSecret.length, 1)
  assert.equal(afterSecret[0].id, 'docs_server')
  assert.equal(afterSecret[0].authorization, 'Bearer token-123')
  assert.equal(afterSecret[0].hasSecret, true)
})

test('deleting an openai mcp server removes its runtime presence', async () => {
  await saveOpenAIMcpServer({
    id: 'ops_server',
    label: 'Ops Server',
    enabled: true,
    serverUrl: 'https://example.com/ops-mcp',
    requireApproval: 'never',
  })
  await setOpenAIMcpServerSecret('ops_server', {
    type: 'bearer',
    bearerToken: 'ops-token',
  })

  assert.equal(resolveOpenAIMcpRuntimeServers().length, 1)

  await deleteOpenAIMcpServer('ops_server')

  assert.equal(listOpenAIMcpServers().length, 0)
  assert.equal(resolveOpenAIMcpRuntimeServers().length, 0)
})

test('saving an openai mcp server preserves advanced overlay values outside settings.json', async () => {
  fs.writeFileSync(path.join(userDataPath, 'advanced.toml'), `
[providers.openai.runtime]
use_server_side_compaction = true
`, 'utf8')

  assert.equal(getSettings().providerRuntimeSettings.openai.useServerSideCompaction, true)

  await saveOpenAIMcpServer({
    id: 'overlay_docs',
    label: 'Overlay Docs',
    enabled: true,
    serverUrl: 'https://example.com/overlay-docs',
    requireApproval: 'always',
  })

  const effective = getSettings()
  const persisted = getPersistedSettings()

  assert.equal(effective.providerRuntimeSettings.openai.useServerSideCompaction, true)
  assert.equal(persisted.providerRuntimeSettings.openai.useServerSideCompaction, false)
  assert.equal(persisted.providerRuntimeSettings.openai.hostedToolConfig.mcp.servers.length, 1)
  assert.equal(
    persisted.providerRuntimeSettings.openai.hostedToolConfig.mcp.servers[0].authSecretRef,
    'openai:mcp:overlay_docs',
  )
})
