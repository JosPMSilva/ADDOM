import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCapabilityCatalogPath,
} from '../../src/main/tools/capability-catalog-builder.mjs'
import {
  buildMcpCapabilityCatalog,
  buildMcpCapabilityEntries,
} from '../../src/main/tools/capability-catalog-mcp.mjs'

const BASE_SERVER = Object.freeze({
  id: 'docs_server',
  label: 'Docs Server',
  enabled: true,
  serverUrl: 'https://user:pass@example.com/mcp?token=secret-token',
  serverDescription: 'Bearer secret-token should not be rendered.',
  allowedTools: ['search_docs', 'read_docs', 'search_docs'],
  requireApproval: 'always',
  authSecretRef: 'openai:mcp:docs_server',
})

test('MCP catalog entries expose status without exposing secrets', () => {
  const { entries, pages } = buildMcpCapabilityCatalog({
    servers: [BASE_SERVER],
    secretStatusResolver: () => true,
  })

  assert.equal(entries.length, 1)
  assert.equal(entries[0].source, 'mcp')
  assert.equal(entries[0].status, 'available')
  assert.deepEqual(entries[0].toolsAfterActivation, ['mcp_docs_server'])
  assert.equal(entries[0].provenance.location, 'https://example.com')

  const markdown = pages.get(buildCapabilityCatalogPath('mcp-docs-server'))
  assert.match(markdown, /# MCP Server: Docs Server/)
  assert.match(markdown, /- Status: available/)
  assert.match(markdown, /`mcp_docs_server`/)
  assert.match(markdown, /search_docs/)
  assert.doesNotMatch(markdown, /secret-token/)
  assert.doesNotMatch(markdown, /authSecretRef/)
  assert.doesNotMatch(markdown, /openai:mcp:docs_server/)
  assert.doesNotMatch(markdown, /inputSchema/)
})

test('MCP catalog maps setup, disabled, and auth states to capability status', () => {
  const entries = buildMcpCapabilityEntries({
    servers: [
      { ...BASE_SERVER, id: 'disabled_server', label: 'Disabled Server', enabled: false },
      { ...BASE_SERVER, id: 'auth_server', label: 'Auth Server', enabled: true },
      { ...BASE_SERVER, id: 'setup_server', label: '', serverUrl: '', enabled: true },
    ],
    secretStatusResolver: (server) => server.id === 'disabled_server',
  })
  const statuses = Object.fromEntries(entries.map((entry) => [entry.id, entry.status]))

  assert.equal(statuses['mcp.disabled_server'], 'disabled_by_user')
  assert.equal(statuses['mcp.auth_server'], 'auth_required')
  assert.equal(statuses['mcp.setup_server'], 'setup_required')
  assert.equal(entries.every((entry) => entry.activation.state === 'blocked'), true)
})

test('MCP catalog caps per-server allowed tool summaries', () => {
  const allowedTools = Array.from({ length: 80 }, (_, index) => `tool_${index}`)
  const [entry] = buildMcpCapabilityEntries({
    servers: [{ ...BASE_SERVER, allowedTools }],
    secretStatusResolver: () => true,
  })

  assert.equal(entry.toolSummaries.length, 33)
  assert.equal(entry.provenance.allowedTools.length, 32)
  assert.equal(entry.provenance.omittedAllowedTools, 48)
})

test('MCP catalog emits setup page when no servers exist', () => {
  const { entries, pages } = buildMcpCapabilityCatalog({
    servers: [],
    secretStatusResolver: () => false,
  })

  assert.equal(entries.length, 1)
  assert.equal(entries[0].id, 'mcp.openai')
  assert.equal(entries[0].status, 'setup_required')
  assert.match(pages.get(buildCapabilityCatalogPath('mcp-openai')), /No OpenAI MCP servers are configured/)
})
