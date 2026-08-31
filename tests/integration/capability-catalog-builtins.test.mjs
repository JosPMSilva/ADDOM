import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CAPABILITY_CATALOG_INDEX_PATH,
  buildCapabilityCatalogPath,
} from '../../src/main/tools/capability-catalog-builder.mjs'
import {
  buildBuiltInCapabilityCatalog,
  buildBuiltInCapabilityEntries,
  listBuiltInCapabilityToolSummaries,
} from '../../src/main/tools/capability-catalog-builtins.mjs'
import { BASE_TOOLS } from '../../src/main/tools/tool-definitions-base.mjs'
import { TERMINAL_SESSION_TOOLS } from '../../src/main/tools/tool-definitions-terminal.mjs'

const REQUIRED_PAGE_SLUGS = [
  'files',
  'shell',
  'git',
  'browser',
  'terminal-sessions',
  'skills',
  'delegation',
  'planning',
  'question',
  'web-fetch',
  'terminal-memory',
]

function toolNamesFromDefinitions() {
  return [...BASE_TOOLS, ...TERMINAL_SESSION_TOOLS]
    .map((tool) => tool.name)
    .sort()
}

test('built-in catalog exposes index and required family pages', () => {
  const { entries, pages } = buildBuiltInCapabilityCatalog()

  assert.deepEqual(entries.map((entry) => entry.slug), REQUIRED_PAGE_SLUGS)
  assert.equal(pages.has(CAPABILITY_CATALOG_INDEX_PATH), true)
  for (const slug of REQUIRED_PAGE_SLUGS) {
    assert.equal(pages.has(buildCapabilityCatalogPath(slug)), true)
  }

  const index = pages.get(CAPABILITY_CATALOG_INDEX_PATH)
  assert.match(index, /# ADDOM Capability Catalog/)
  assert.match(index, /\[Files\]\(addom:\/\/capabilities\/files\.md\)/)
  assert.match(index, /\[Terminal Sessions\]\(addom:\/\/capabilities\/terminal-sessions\.md\)/)
})

test('built-in catalog derives every ADDOM tool from definitions and identity metadata', () => {
  const summaries = listBuiltInCapabilityToolSummaries()
  const catalogToolNames = summaries.map((tool) => tool.name).sort()

  assert.deepEqual(catalogToolNames, toolNamesFromDefinitions())
  assert.equal(summaries.every((tool) => tool.identityFamily && tool.riskClass && tool.summary), true)
})

test('git status stays default visible while heavier git tools are activated later', () => {
  const gitEntry = buildBuiltInCapabilityEntries().find((entry) => entry.slug === 'git')
  assert.ok(gitEntry)

  const exposures = Object.fromEntries(
    gitEntry.toolSummaries.map((tool) => [tool.name, tool.defaultExposure]),
  )
  assert.equal(exposures.git_status, 'default_visible')
  assert.equal(exposures.git_diff, 'intent_activated')
  assert.equal(exposures.git_log, 'intent_activated')
  assert.equal(exposures.git_commit, 'intent_activated')
  assert.equal(exposures.git_checkout_file, 'intent_activated')
})

test('built-in catalog pages stay compact and do not dump schemas', () => {
  const { pages } = buildBuiltInCapabilityCatalog()

  for (const [path, markdown] of pages.entries()) {
    assert.equal(markdown.length <= 6000, true, `${path} exceeded catalog page cap`)
    assert.doesNotMatch(markdown, /inputSchema/)
    assert.doesNotMatch(markdown, /\| properties \|/)
    assert.doesNotMatch(markdown, /"type":\s*"object"/)
  }
})

test('browser catalog summarizes diagnostics without dumping action schemas', () => {
  const { pages } = buildBuiltInCapabilityCatalog()
  const browserPage = pages.get(buildCapabilityCatalogPath('browser'))

  assert.match(browserPage, /diagnostics/i)
  assert.match(browserPage, /console messages|failed requests/i)
  assert.match(browserPage, /inspect or find\\?_elements before choosing selectors/i)
  assert.match(browserPage, /list\\?_options before select\\?_option/i)
  assert.doesNotMatch(browserPage, /console_messages.*network_errors.*properties/s)
})

test('built-in family entries validate against the Phase 1 schema', () => {
  const entries = buildBuiltInCapabilityEntries()

  assert.equal(entries.every((entry) => entry.source === 'built_in'), true)
  assert.equal(entries.every((entry) => entry.status === 'available'), true)
  assert.equal(entries.every((entry) => entry.toolsAfterActivation.length > 0), true)
  assert.equal(entries.every((entry) => entry.activation.state), true)
})
