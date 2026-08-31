import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-mcp-runtime-'))
const originalUserDataPath = process.env.ADDOM_USER_DATA_PATH
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  __resetVaultStateForTests,
  __setSafeStorageForTests,
} = await import('../../src/main/vault.mjs')
const { setOpenAIMcpServerSecret } = await import('../../src/main/api-clients/openai-mcp-config.mjs')
const { buildOpenAIHostedToolBundle } = await import('../../src/main/api-clients/openai-hosted-tools-runtime.mjs')

function createMockSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (raw = '') => Buffer.from('enc:' + String(raw || ''), 'utf8'),
    decryptString: (buffer) => {
      const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '')
      if (!text.startsWith('enc:')) {
        throw new Error('decrypt_failed')
      }
      return text.slice(4)
    },
  }
}

test.beforeEach(() => {
  __resetVaultStateForTests()
  __setSafeStorageForTests(createMockSafeStorage())
  try { fs.rmSync(path.join(userDataPath, 'vault.json'), { force: true }) } catch { /* best-effort test cleanup */ }
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

test('openai mcp runtime exposes bearer-auth server with explicit allowlist', async () => {
  await setOpenAIMcpServerSecret('docs_server', {
    type: 'bearer',
    bearerToken: 'token-123',
  })

  const bundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.4',
    runtimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['mcp'],
      hostedToolConfig: {
        mcp: {
          servers: [{
            id: 'docs_server',
            label: 'Docs MCP',
            enabled: true,
            serverUrl: 'https://example.com/mcp',
            allowedTools: ['search_docs', 'search_docs'],
            requireApproval: 'always',
            authSecretRef: 'openai:mcp:docs_server',
          }],
        },
      },
    },
  })

  assert.deepEqual(
    Object.keys(bundle.tools).sort(),
    ['mcp_docs_server'],
  )
  const mcpTool = bundle.tools.mcp_docs_server
  assert.equal(mcpTool?.id, 'openai.mcp')
  assert.equal(mcpTool?.args?.serverLabel, 'Docs MCP')
  assert.equal(mcpTool?.args?.serverUrl, 'https://example.com/mcp')
  assert.deepEqual(mcpTool?.args?.allowedTools, ['search_docs'])
  assert.equal(mcpTool?.args?.requireApproval, 'always')
  assert.equal(mcpTool?.args?.authorization, 'Bearer token-123')
})

test('openai mcp runtime maps header-auth server and never-approval mode', async () => {
  await setOpenAIMcpServerSecret('ops_server', {
    type: 'headers',
    headers: [
      { name: 'x-api-key', value: 'secret' },
      { name: 'x-api-key', value: 'secret-ignored-duplicate' },
      { name: 'x-tenant', value: 'acme' },
    ],
  })

  const bundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.4',
    runtimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['mcp'],
      hostedToolConfig: {
        mcp: {
          servers: [{
            id: 'ops_server',
            label: 'Ops MCP',
            enabled: true,
            serverUrl: 'https://example.com/ops-mcp',
            allowedTools: ['restart_service'],
            requireApproval: 'never',
            authSecretRef: 'openai:mcp:ops_server',
          }],
        },
      },
    },
  })

  assert.deepEqual(
    Object.keys(bundle.tools).sort(),
    ['mcp_ops_server'],
  )
  const mcpTool = bundle.tools.mcp_ops_server
  assert.equal(mcpTool?.id, 'openai.mcp')
  assert.equal(mcpTool?.args?.requireApproval, 'never')
  assert.equal(mcpTool?.args?.authorization, undefined)
  assert.deepEqual(mcpTool?.args?.headers, {
    'x-api-key': 'secret-ignored-duplicate',
    'x-tenant': 'acme',
  })
})
