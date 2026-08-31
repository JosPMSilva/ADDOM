import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../../src/renderer/components/settings/OpenRouterCatalogVisibilitySection.jsx', import.meta.url),
  'utf8',
)
const hookSource = readFileSync(
  new URL('../../src/renderer/components/settings/useOpenRouterVisibility.js', import.meta.url),
  'utf8',
)
const namespaceSource = readFileSync(
  new URL('../../src/renderer/components/settings/OpenRouterNamespaceRow.jsx', import.meta.url),
  'utf8',
)
const modelRowSource = readFileSync(
  new URL('../../src/renderer/components/settings/OpenRouterModelRow.jsx', import.meta.url),
  'utf8',
)
const helperUrl = new URL('../../src/renderer/components/settings/openrouter-catalog-manager-model.mjs', import.meta.url)
const helperMod = existsSync(helperUrl) ? await import(helperUrl) : {}
const buildOpenRouterSearchGroups = helperMod?.buildOpenRouterSearchGroups || null

test('openrouter search groups expose matching models directly', () => {
  assert.equal(typeof buildOpenRouterSearchGroups, 'function')
  const groups = buildOpenRouterSearchGroups({
    namespaceRows: [
      { namespace: 'openai', label: 'OpenAI', models: [{ id: 'openai/gpt-5' }] },
      { namespace: 'anthropic', label: 'Anthropic', models: [] },
    ],
  })

  assert.deepEqual(groups, [
    { namespace: 'openai', label: 'OpenAI', models: [{ id: 'openai/gpt-5' }] },
  ])
})

test('openrouter catalog uses focused flat manager controls', () => {
  assert.match(source, /SettingsDetailView/)
  assert.match(source, /buildOpenRouterSearchGroups/)
  assert.match(source, /defaultValue: 'OpenRouter catalog'/)
  assert.match(source, /defaultValue: 'Rules'/)
  assert.match(source, /MenuSurface/)
  assert.doesNotMatch(source, /ToggleChip|expandedNamespaces|toggleNamespaceExpanded/)
  assert.doesNotMatch(namespaceSource, /grid-rows-\[1fr\]|rounded-xl|sticky top-0/)
  assert.match(namespaceSource, /role="switch"/)
  assert.match(modelRowSource, /role="switch"/)
  assert.doesNotMatch(source, /type="checkbox" checked=\{selectedNamespaceRow\.effectiveVisible\}/)
})

test('openrouter hide all quick action uses compact hidden-default visibility state', () => {
  assert.match(hookSource, /case 'hide_all':[\s\S]*defaultVisible:\s*false/)
  assert.doesNotMatch(hookSource, /case 'hide_all':[\s\S]*Object\.fromEntries/)
})
