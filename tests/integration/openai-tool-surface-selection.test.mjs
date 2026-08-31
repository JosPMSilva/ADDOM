import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderToolSurface } from '../../src/main/chat/tool-surface-selection.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'

test('openai local_shell excludes addom run_command overlap', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: { toolFamily: 'openai_hosted' },
    addomTools: {
      run_command: { id: 'run_command' },
      read_file: { id: 'read_file' },
    },
    providerTools: {
      local_shell: { id: 'openai.local_shell' },
    },
  })

  assert.equal(Boolean(resolved.tools.run_command), false)
  assert.equal(Boolean(resolved.tools.local_shell), true)
  assert.equal(Boolean(resolved.tools.read_file), true)
  assert.equal(resolved.toolSurfaceKind, 'openai_local_runtime')
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'run_command' && row.reason === 'excluded_due_to_openai_local_shell_overlap'),
    true,
  )
})

test('openai hosted shell collapses to visible run_command while preserving provider-backed execution metadata', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: { toolFamily: 'openai_hosted' },
    addomTools: {
      run_command: { id: 'run_command' },
      read_file: { id: 'read_file' },
    },
    providerTools: {
      shell: { id: 'openai.shell' },
    },
  })

  assert.equal(Boolean(resolved.tools.run_command), true)
  assert.equal(Boolean(resolved.tools.shell), false)
  assert.deepEqual(resolved.toolExecutionMap, { run_command: 'shell' })
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'run_command' && row.reason === 'excluded_due_to_provider_hosted_shell_alias'),
    true,
  )
})

test('openai hosted web_search collapses to visible fetch_page while preserving provider-backed execution metadata', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: { toolFamily: 'openai_hosted' },
    addomTools: {
      fetch_page: { id: 'fetch_page' },
      read_file: { id: 'read_file' },
    },
    providerTools: {
      web_search: { id: 'openai.web_search' },
    },
  })

  assert.equal(Boolean(resolved.tools.fetch_page), true)
  assert.equal(Boolean(resolved.tools.web_search), false)
  assert.deepEqual(resolved.toolExecutionMap, { fetch_page: 'web_search' })
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'fetch_page' && row.reason === 'excluded_due_to_provider_hosted_web_alias'),
    true,
  )
})

test('openai apply_patch does not exclude addom edit tools for trivial file work', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: { toolFamily: 'openai_hosted' },
    addomTools: {
      write_file: { id: 'write_file' },
      edit_file: { id: 'edit_file' },
      read_file: { id: 'read_file' },
    },
    providerTools: {
      apply_patch: { id: 'openai.apply_patch' },
    },
  })

  assert.equal(Boolean(resolved.tools.write_file), true)
  assert.equal(Boolean(resolved.tools.edit_file), true)
  assert.equal(Boolean(resolved.tools.read_file), true)
  assert.equal(Boolean(resolved.tools.apply_patch), true)
  assert.equal(resolved.toolSurfaceKind, 'openai_local_runtime')
  assert.deepEqual(resolved.excludedToolsWithReasons, [])
})

test('openai account auth keeps addom write and shell tools when no provider overlap is exposed for the turn', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
    addomTools: {
      read_file: { id: 'read_file' },
      fetch_page: { id: 'fetch_page' },
      run_command: { id: 'run_command' },
      write_file: { id: 'write_file' },
      edit_file: { id: 'edit_file' },
      apply_patch: { id: 'apply_patch' },
    },
    providerTools: {},
  })

  assert.equal(resolved.toolSurfaceKind, 'openai_codex_app_server')
  assert.deepEqual(resolved.toolSurfaceComponents, ['provider_owned_runtime'])
  assert.equal(Boolean(resolved.tools.read_file), true)
  assert.equal(Boolean(resolved.tools.fetch_page), true)
  assert.equal(Boolean(resolved.tools.run_command), true)
  assert.equal(Boolean(resolved.tools.write_file), true)
  assert.equal(Boolean(resolved.tools.edit_file), true)
  assert.equal(Boolean(resolved.tools.apply_patch), true)
  assert.deepEqual(resolved.excludedToolsWithReasons, [])
})

test('openai account auth still excludes overlapping addom tools when a provider replacement is explicitly exposed', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
    addomTools: {
      fetch_page: { id: 'fetch_page' },
      run_command: { id: 'run_command' },
      write_file: { id: 'write_file' },
      edit_file: { id: 'edit_file' },
      apply_patch: { id: 'apply_patch' },
    },
    providerTools: {
      web_search: { id: 'openai.web_search' },
      shell: { id: 'openai.shell' },
      apply_patch: { id: 'openai.apply_patch' },
    },
  })

  assert.equal(Boolean(resolved.tools.fetch_page), false)
  assert.equal(Boolean(resolved.tools.run_command), false)
  assert.equal(Boolean(resolved.tools.write_file), false)
  assert.equal(Boolean(resolved.tools.edit_file), false)
  assert.equal(Boolean(resolved.tools.apply_patch), false)
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'run_command' && row.reason === 'excluded_due_to_openai_account_native_command_execution'),
    true,
  )
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'fetch_page' && row.reason === 'excluded_due_to_openai_account_native_web_search'),
    true,
  )
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'write_file' && row.reason === 'excluded_due_to_openai_account_native_file_change'),
    true,
  )
})

test('openai api-key hosted surface keeps local curated-skill tools visible for the targeted workflow', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'api_key' }),
    addomTools: {
      list_curated_skills: { id: 'list_curated_skills' },
      install_curated_skill: { id: 'install_curated_skill' },
      read_file: { id: 'read_file' },
      fetch_page: { id: 'fetch_page' },
      run_command: { id: 'run_command' },
    },
    providerTools: {
      web_search: { id: 'openai.web_search' },
      shell: { id: 'openai.shell' },
    },
  })

  assert.equal(resolved.toolSurfaceKind, 'openai_hosted')
  assert.equal(Boolean(resolved.tools.list_curated_skills), true)
  assert.equal(Boolean(resolved.tools.install_curated_skill), true)
  assert.equal(Boolean(resolved.tools.fetch_page), true)
  assert.equal(Boolean(resolved.tools.run_command), true)
})

test('openai account auth hides local curated-skill tools so the managed account flow stays unchanged', () => {
  const resolved = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
    addomTools: {
      list_curated_skills: { id: 'list_curated_skills' },
      install_curated_skill: { id: 'install_curated_skill' },
      read_file: { id: 'read_file' },
      run_command: { id: 'run_command' },
    },
    providerTools: {},
  })

  assert.equal(Boolean(resolved.tools.list_curated_skills), false)
  assert.equal(Boolean(resolved.tools.install_curated_skill), false)
  assert.equal(Boolean(resolved.tools.read_file), true)
  assert.equal(Boolean(resolved.tools.run_command), true)
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'list_curated_skills' && row.reason === 'excluded_due_to_local_skill_parity_gate'),
    true,
  )
  assert.equal(
    resolved.excludedToolsWithReasons.some((row) => row.toolName === 'install_curated_skill' && row.reason === 'excluded_due_to_local_skill_parity_gate'),
    true,
  )
})
