import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildToolIdentityMap,
  getToolMetaFromIdentity,
  resolveToolIdentity,
} from '../../src/main/tools/tool-identity-registry.mjs'

test('tool identity registry maps hosted shell to the canonical run_command identity', () => {
  const identity = resolveToolIdentity('shell')

  assert.equal(identity.canonicalToolName, 'run_command')
  assert.equal(identity.family, 'shell')
  assert.equal(identity.label, 'Run Command')
  assert.equal(identity.risk, 'critical')
  assert.equal(identity.executionRuntime, 'provider_hosted')
})

test('tool identity registry maps hosted web_search to the canonical fetch_page identity', () => {
  const identity = resolveToolIdentity('web_search')

  assert.equal(identity.canonicalToolName, 'fetch_page')
  assert.equal(identity.family, 'web_fetch')
  assert.equal(identity.label, 'Fetch Web Page')
  assert.equal(identity.risk, 'medium')
})

test('tool identity registry resolves provider-native moonshot search tools to fetch_page semantics', () => {
  const identity = resolveToolIdentity('moonshot_formula__web_search__search', {
    providerToolExecutionContext: {
      family: 'moonshot_formula',
      toolMap: new Map([
        ['moonshot_formula__web_search__search', {
          formulaUri: 'moonshot/web-search:latest',
          originalToolName: 'search',
        }],
      ]),
    },
  })

  assert.equal(identity.canonicalToolName, 'fetch_page')
  assert.equal(identity.family, 'web_fetch')
  assert.equal(identity.executionRuntime, 'provider_native')
  assert.equal(identity.backendFamily, 'moonshot_formula')
})

test('tool identity registry builds a stable identity map for visible tool names', () => {
  const identities = buildToolIdentityMap(['run_command', 'shell', 'web_search'])

  assert.equal(identities.run_command.canonicalToolName, 'run_command')
  assert.equal(identities.shell.canonicalToolName, 'run_command')
  assert.equal(identities.web_search.canonicalToolName, 'fetch_page')
})

test('tool identity registry preserves hosted shell backend metadata when run_command is aliased to shell', () => {
  const identities = buildToolIdentityMap(['run_command'], {
    toolBackendNameMap: {
      run_command: 'shell',
    },
  })

  assert.equal(identities.run_command.canonicalToolName, 'run_command')
  assert.equal(identities.run_command.executionRuntime, 'provider_hosted')
  assert.equal(identities.run_command.backendToolName, 'shell')
  assert.equal(identities.run_command.backendFamily, 'openai_hosted')
})

test('tool metadata fallback uses canonical identity metadata for alias-style tool names', () => {
  assert.deepEqual(getToolMetaFromIdentity('shell'), {
    label: 'Run Command',
    risk: 'critical',
  })
  assert.deepEqual(getToolMetaFromIdentity('web_search'), {
    label: 'Fetch Web Page',
    risk: 'medium',
  })
})

test('tool identity registry treats create_directory as a write-risk tool', () => {
  const identity = resolveToolIdentity('create_directory')

  assert.equal(identity.canonicalToolName, 'create_directory')
  assert.equal(identity.family, 'file_write')
  assert.equal(identity.label, 'Create Directory')
  assert.equal(identity.risk, 'high')

  assert.deepEqual(getToolMetaFromIdentity('create_directory'), {
    label: 'Create Directory',
    risk: 'high',
  })
})

test('tool identity registry maps compact delegation to the canonical delegation identity', () => {
  const identity = resolveToolIdentity('delegate_tasks', {
    backendToolNameOverride: 'delegate_to_agents',
  })

  assert.equal(identity.canonicalToolName, 'delegate_to_agents')
  assert.equal(identity.family, 'delegation')
  assert.equal(identity.label, 'Delegate Tasks')
  assert.equal(identity.backendToolName, 'delegate_to_agents')
})
