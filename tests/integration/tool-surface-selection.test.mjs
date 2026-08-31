import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import {
  applyConservativeIntentNarrowing,
  applyDelegationEntryPointCollapse,
  applyProviderPromptBudgetToolSurface,
  applyReliabilityWeightedWriteGating,
  resolveProviderToolSurface,
} from '../../src/main/chat/tool-surface-selection.mjs'

function buildTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: name + ' tool', inputSchema: {} }]),
  )
}

test('openai Codex-local provider surface keeps ADDOM-native delegation tools available before runtime-context narrowing', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.3-codex'),
    addomTools: buildTools([
      'read_file',
      'search_code',
      'apply_patch',
      'write_file',
      'edit_file',
      'run_command',
      'delegate_tasks',
      'delegate_to_agents',
    ]),
    providerTools: buildTools([
      'local_shell',
      'web_search',
    ]),
  })

  assert.deepEqual(Object.keys(resolved.tools).sort(), [
    'apply_patch',
    'delegate_tasks',
    'delegate_to_agents',
    'edit_file',
    'read_file',
    'run_command',
    'search_code',
    'write_file',
  ])
  assert.equal(resolved.toolSurfaceKind, 'openai_codex_local')
  assert.equal(resolved.mixedToolSurfaceDetected, false)
  assert.deepEqual(resolved.removedAddomToolNames, [])
  assert.deepEqual(resolved.toolExecutionMap, {})
})

test('delegation entry-point collapse hides raw delegate_to_agents by default and preserves backend routing', () => {
  const addomTools = buildTools([
    'read_file',
    'delegate_tasks',
    'delegate_to_agents',
  ])
  const base = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.3-codex'),
    addomTools,
    providerTools: buildTools(['local_shell']),
  })

  const collapsed = applyDelegationEntryPointCollapse(base, {
    addomTools,
    shadowIntent: { intent: 'mixed' },
    userMessage: 'review the auth flow',
  })

  assert.deepEqual(Object.keys(collapsed.tools).sort(), [
    'delegate_tasks',
    'read_file',
  ])
  assert.deepEqual(collapsed.removedAddomToolNames, ['delegate_to_agents'])
  assert.deepEqual(collapsed.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
  assert.equal(
    collapsed.excludedToolsWithReasons.some((row) => row.toolName === 'delegate_to_agents' && row.reason === 'excluded_due_to_compact_delegation_entry_point'),
    true,
  )
})

test('openai hosted tool surface preserves ADDOM workspace tools when no local runtime tool is active', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
    addomTools: buildTools([
      'fetch_page',
      'read_file',
      'write_file',
      'run_command',
    ]),
    providerTools: buildTools([
      'web_search',
      'shell',
    ]),
  })

  assert.deepEqual(Object.keys(resolved.tools).sort(), [
    'fetch_page',
    'read_file',
    'run_command',
    'write_file',
  ])
  assert.equal(resolved.toolSurfaceKind, 'openai_hosted')
  assert.equal(resolved.mixedToolSurfaceDetected, false)
  assert.deepEqual(resolved.removedAddomToolNames, ['fetch_page', 'run_command'])
  assert.deepEqual(resolved.toolExecutionMap, { fetch_page: 'web_search', run_command: 'shell' })
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'run_command' && row.reason === 'excluded_due_to_provider_hosted_shell_alias'),
    true,
  )
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'fetch_page' && row.reason === 'excluded_due_to_provider_hosted_web_alias'),
    true,
  )
})

test('Moonshot Formula surface overlays provider-native tools onto the ADDOM tool set', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('moonshot', 'kimi-k2.6'),
    addomTools: buildTools([
      'fetch_page',
      'read_file',
      'run_command',
    ]),
    providerTools: buildTools([
      'moonshot_formula__web_search__search',
    ]),
  })

  assert.deepEqual(Object.keys(resolved.tools).sort(), [
    'fetch_page',
    'read_file',
    'run_command',
  ])
  assert.equal(resolved.toolSurfaceKind, 'moonshot_formula')
  assert.equal(resolved.mixedToolSurfaceDetected, false)
  assert.deepEqual(resolved.toolExecutionMap, { fetch_page: 'moonshot_formula__web_search__search' })
})

test('Perplexity provider-owned runtime keeps ADDOM tools while exposing explicit surface kind', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('perplexity', 'sonar-pro'),
    addomTools: buildTools([
      'read_file',
      'run_command',
    ]),
    providerTools: {},
  })

  assert.deepEqual(Object.keys(resolved.tools).sort(), [
    'read_file',
    'run_command',
  ])
  assert.equal(resolved.toolSurfaceKind, 'perplexity_search')
  assert.deepEqual(resolved.toolSurfaceComponents, ['perplexity_search'])
  assert.equal(resolved.mixedToolSurfaceDetected, false)
})

test('generic adapters ignore provider-native tools and stay on ADDOM-native surface', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'custom-openai-model'),
    addomTools: buildTools([
      'read_file',
      'run_command',
    ]),
    providerTools: buildTools([
      'web_search',
      'apply_patch',
    ]),
  })

  assert.deepEqual(Object.keys(resolved.tools).sort(), [
    'read_file',
    'run_command',
  ])
  assert.equal(resolved.toolSurfaceKind, 'addom_native')
  assert.deepEqual(resolved.removedAddomToolNames, [])
})

test('reliability-weighted write gating hides apply_patch for restricted targeted-edit turns when safer write tools exist', () => {
  const base = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
    addomTools: buildTools([
      'read_file',
      'apply_patch',
      'edit_file',
      'write_file',
    ]),
    providerTools: {},
  })

  const gated = applyReliabilityWeightedWriteGating(base, {
    reliabilityProfile: {
      patchExposure: 'restricted',
    },
    shadowIntent: {
      intent: 'targeted_edit',
    },
    addomTools: buildTools([
      'read_file',
      'apply_patch',
      'edit_file',
      'write_file',
    ]),
  })

  assert.equal(Boolean(gated.tools.apply_patch), false)
  assert.equal(Boolean(gated.tools.edit_file), true)
  assert.equal(Boolean(gated.tools.write_file), true)
  assert.equal(
    gated.excludedToolsWithReasons.some((row) => row.toolName === 'apply_patch' && row.reason === 'excluded_due_to_reliability_weighted_patch_gating'),
    true,
  )
})

test('reliability-weighted write gating keeps apply_patch for mixed turns', () => {
  const base = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
    addomTools: buildTools([
      'read_file',
      'apply_patch',
      'edit_file',
      'write_file',
    ]),
    providerTools: {},
  })

  const gated = applyReliabilityWeightedWriteGating(base, {
    reliabilityProfile: {
      patchExposure: 'restricted',
    },
    shadowIntent: {
      intent: 'mixed',
    },
    addomTools: buildTools([
      'read_file',
      'apply_patch',
      'edit_file',
      'write_file',
    ]),
  })

  assert.equal(Boolean(gated.tools.apply_patch), true)
})

test('delegation entry point collapse keeps the compact semantic dispatcher for ordinary turns', () => {
  const collapsed = applyDelegationEntryPointCollapse(buildBaseSelectionForDelegation(), {
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    shadowIntent: {
      intent: 'mixed',
    },
    userMessage: 'Review the touched auth files and report issues.',
    history: [],
  })

  assert.equal(Boolean(collapsed.tools.delegate_to_agents), false)
  assert.equal(Boolean(collapsed.tools.delegate_tasks), true)
  assert.deepEqual(collapsed.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
  assert.equal(
    collapsed.excludedToolsWithReasons.some((row) => row.toolName === 'delegate_to_agents' && row.reason === 'excluded_due_to_compact_delegation_entry_point'),
    true,
  )
})

test('delegation entry point collapse keeps canonical delegation visibility separate from backend metadata', () => {
  const collapsed = applyDelegationEntryPointCollapse({
    ...buildBaseSelectionForDelegation(),
    delegationBackend: 'openai_native',
    delegationBackendPreference: 'openai_native',
  }, {
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    shadowIntent: {
      intent: 'mixed',
    },
    userMessage: 'Review the touched auth files and report issues.',
    history: [],
  })

  assert.equal(Boolean(collapsed.tools.delegate_to_agents), false)
  assert.equal(Boolean(collapsed.tools.delegate_tasks), true)
  assert.deepEqual(collapsed.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
})

test('delegation entry point collapse keeps parallel semantic work on the compact dispatcher', () => {
  const collapsed = applyDelegationEntryPointCollapse(buildBaseSelectionForDelegation(), {
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    shadowIntent: {
      intent: 'delegation',
    },
    userMessage: 'Split this into parallel subagents and fan out the work.',
    history: [],
  })

  assert.equal(Boolean(collapsed.tools.delegate_to_agents), false)
  assert.equal(Boolean(collapsed.tools.delegate_tasks), true)
  assert.deepEqual(collapsed.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
})

test('delegation entry point collapse keeps broad continuation on the compact dispatcher', () => {
  const collapsed = applyDelegationEntryPointCollapse(buildBaseSelectionForDelegation(), {
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    shadowIntent: {
      intent: 'targeted_edit',
    },
    userMessage: 'Continue with the remaining implementation tasks.',
    history: [],
  })

  assert.equal(Boolean(collapsed.tools.delegate_to_agents), false)
  assert.equal(Boolean(collapsed.tools.delegate_tasks), true)
  assert.deepEqual(collapsed.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
})

test('delegation entry point collapse keeps raw execution internal for explicit configured-role requests', () => {
  const collapsed = applyDelegationEntryPointCollapse(buildBaseSelectionForDelegation(), {
    addomTools: buildTools(['read_file', 'delegate_to_agents', 'delegate_tasks']),
    shadowIntent: { intent: 'delegation' },
    userMessage: 'Use every configured agent role and pin each task to its role key.',
    history: [],
  })

  assert.equal(Boolean(collapsed.tools.delegate_to_agents), false)
  assert.equal(Boolean(collapsed.tools.delegate_tasks), true)
  assert.deepEqual(collapsed.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
})

test('conservative intent narrowing keeps core write and shell tools visible for exploration-only turns', () => {
  const narrowed = applyConservativeIntentNarrowing({
    tools: buildTools([
      'read_file',
      'search_code',
      'write_file',
      'edit_file',
      'run_command',
      'delegate_tasks',
    ]),
    toolSurfaceKind: 'addom_native',
    toolSurfaceComponents: ['addom_native'],
    mixedToolSurfaceDetected: false,
    removedAddomToolNames: [],
    excludedToolsWithReasons: [],
    toolExecutionMap: {
      delegate_tasks: 'delegate_to_agents',
    },
  }, {
    addomTools: buildTools([
      'read_file',
      'search_code',
      'write_file',
      'edit_file',
      'run_command',
      'delegate_tasks',
    ]),
    shadowIntent: {
      intent: 'exploration_only',
      confidence: 'medium',
    },
  })

  assert.equal(Boolean(narrowed.tools.read_file), true)
  assert.equal(Boolean(narrowed.tools.search_code), true)
  assert.equal(Boolean(narrowed.tools.write_file), true)
  assert.equal(Boolean(narrowed.tools.edit_file), true)
  assert.equal(Boolean(narrowed.tools.run_command), true)
  assert.equal(Boolean(narrowed.tools.delegate_tasks), true)
})

test('catalog-first budget policy keeps core tools and hides heavy families for fresh generic turns', () => {
  const addomTools = buildTools([
    'read_file',
    'search_code',
    'write_file',
    'edit_file',
    'run_command',
    'fetch_page',
    'git_status',
    'git_diff',
    'browser_action',
    'delegate_to_agents',
    'delegate_tasks',
    'apply_patch',
  ])
  const narrowed = applyProviderPromptBudgetToolSurface({
    tools: addomTools,
    toolSurfaceKind: 'addom_native',
    toolSurfaceComponents: ['addom_native'],
    mixedToolSurfaceDetected: false,
    removedAddomToolNames: [],
    excludedToolsWithReasons: [],
    toolExecutionMap: {},
  }, {
    providerId: 'openrouter',
    promptBudgetProfile: {
      id: 'generic_remote',
      family: 'remote',
      mode: 'execute',
    },
    addomTools,
    shadowIntent: {
      intent: 'exploration_only',
      confidence: 'medium',
    },
    userMessage: 'Inspect this codebase.',
  })

  assert.deepEqual(Object.keys(narrowed.tools).sort(), [
    'delegate_tasks',
    'edit_file',
    'fetch_page',
    'git_status',
    'read_file',
    'run_command',
    'search_code',
    'write_file',
  ])
  assert.deepEqual(narrowed.toolSurfaceHiddenFamilies, [
    'browser',
    'delegation',
    'file_mutation_extra',
    'git',
  ])
})

function buildBaseSelectionForDelegation() {
  return {
    tools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    toolSurfaceKind: 'addom_native',
    toolSurfaceComponents: ['addom_native'],
    mixedToolSurfaceDetected: false,
    removedAddomToolNames: [],
    excludedToolsWithReasons: [],
    toolExecutionMap: {},
  }
}
