import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertCapabilityCatalogPageCaps,
  buildCapabilityCatalogPages,
} from '../../src/main/tools/capability-catalog-builder.mjs'
import { buildBuiltInCapabilityEntries } from '../../src/main/tools/capability-catalog-builtins.mjs'
import { buildMcpCapabilityEntries } from '../../src/main/tools/capability-catalog-mcp.mjs'
import { buildSkillCapabilityEntries } from '../../src/main/tools/capability-catalog-skills.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

test('final capability catalog pages stay capped after built-in MCP and skill composition', () => {
  const entries = [
    ...buildBuiltInCapabilityEntries(),
    ...buildMcpCapabilityEntries(),
    ...buildSkillCapabilityEntries({ projectFolder: process.cwd() }),
  ]
  const pages = buildCapabilityCatalogPages(entries)

  assertCapabilityCatalogPageCaps(pages)
  assert.equal(pages.size > 12, true)
  for (const [path, markdown] of pages.entries()) {
    assert.equal(markdown.length <= 6000, true, `${path} exceeded catalog page cap`)
    assert.doesNotMatch(markdown, /authorization:\s*bearer/i)
    assert.doesNotMatch(markdown, /api[_-]?key/i)
    assert.doesNotMatch(markdown, /inputSchema/)
  }
})

test('final fresh generic runtime surfaces remain inside the catalog-first budget target', async () => {
  const addomTools = toAISDKTools('ask', true)
  const rows = [
    ['openai', 'gpt-5.4'],
    ['openrouter', 'openai/gpt-5.1-codex-max'],
    ['ollama', 'qwen2.5-coder:latest'],
    ['groq', 'llama-4-maverick'],
  ]

  for (const [providerId, modelId] of rows) {
    const surface = await resolveRuntimeToolSurface({
      providerId,
      modelId,
      mode: 'execute',
      userMessage: 'Inspect this codebase.',
      addomTools,
      adapterProfile: resolveProviderModelAdapter(providerId, modelId),
    })
    const schemaChars = JSON.stringify(surface.resolvedToolSurface.tools).length
    const roughSchemaTokens = Math.ceil(schemaChars / 4)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.read_file), true, `${providerId} keeps read_file`)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.search_code), true, `${providerId} keeps search_code`)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.browser_action), false, `${providerId} hides browser schema`)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false, `${providerId} hides raw delegation schema`)
    assert.ok(roughSchemaTokens <= 5_000, `${providerId}/${modelId} rough schema tokens ${roughSchemaTokens}`)
  }
})
