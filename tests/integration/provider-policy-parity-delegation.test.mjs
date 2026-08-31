import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveOpenAIModelRuntimeSupport } from '../../src/main/api-clients/openai-model-runtime-support.mjs'
import { resolveOpenAIAuthParityReport } from '../../src/main/api-clients/openai-account-capability-contract.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'

function buildTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

async function resolveDelegationParitySnapshot(authMethod, {
  delegationBackendPreference = 'auto',
  nativeCollaborationModeId = 'default',
  userMessage = 'Use one agent if helpful.',
} = {}) {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage,
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod }),
    providerRuntimeSettings: {
      openai: {
        delegationBackendPreference,
        nativeCollaborationModeId,
      },
    },
  })

  return {
    delegationBackend: surface.resolvedToolSurface.delegationBackend,
    delegationBackendReason: surface.resolvedToolSurface.delegationBackendReason,
    delegationBackends: [...surface.resolvedToolSurface.delegationBackends],
    canonicalDelegationBackend: surface.resolvedToolSurface.canonicalDelegationBackend,
    nativeCollaborationBackend: surface.resolvedToolSurface.nativeCollaborationBackend,
    delegationEntryPointPolicy: surface.resolvedToolSurface.delegationEntryPointPolicy,
    delegationBackendSelectionSeparatedFromVisibility:
      surface.resolvedToolSurface.delegationBackendSelectionSeparatedFromVisibility,
    visibleDelegationTools: Object.keys(surface.resolvedToolSurface.tools)
      .filter((toolName) => toolName.startsWith('delegate_'))
      .sort(),
    excludedReasons: surface.resolvedToolSurface.excludedToolsWithReasons
      .filter((row) => String(row?.toolName || '').startsWith('delegate_'))
      .map((row) => ({ toolName: row.toolName, reason: row.reason })),
  }
}

test('OpenAI auth delegation parity normalizes auto default backend selection without changing canonical delegation visibility', async () => {
  const account = await resolveDelegationParitySnapshot('account', {
    delegationBackendPreference: 'auto',
    nativeCollaborationModeId: 'default',
  })
  const apiKey = await resolveDelegationParitySnapshot('api_key', {
    delegationBackendPreference: 'auto',
    nativeCollaborationModeId: 'default',
  })

  assert.equal(account.delegationBackend, 'addom_moa')
  assert.equal(account.delegationBackendReason, 'capability_default')
  assert.equal(apiKey.delegationBackend, account.delegationBackend)
  assert.equal(apiKey.delegationBackendReason, account.delegationBackendReason)
  assert.equal(account.canonicalDelegationBackend, 'addom_moa')
  assert.equal(apiKey.canonicalDelegationBackend, account.canonicalDelegationBackend)
  assert.equal(account.nativeCollaborationBackend, 'openai_native')
  assert.equal(apiKey.nativeCollaborationBackend, 'none')
  assert.equal(account.delegationEntryPointPolicy, 'canonical_addom_delegation_entry_points')
  assert.equal(apiKey.delegationEntryPointPolicy, account.delegationEntryPointPolicy)
  assert.equal(account.delegationBackendSelectionSeparatedFromVisibility, true)
  assert.equal(apiKey.delegationBackendSelectionSeparatedFromVisibility, true)
  assert.deepEqual(account.visibleDelegationTools, [
    'delegate_tasks',
  ])
  assert.deepEqual(apiKey.visibleDelegationTools, account.visibleDelegationTools)
  assert.equal(
    account.excludedReasons.some((row) => row.reason === 'excluded_due_to_openai_native_delegation_backend'),
    false,
  )
  assert.equal(
    apiKey.excludedReasons.some((row) => row.reason === 'excluded_due_to_openai_native_delegation_backend'),
    false,
  )
})

test('OpenAI auth delegation parity keeps canonical delegation entry points visible even when account auth explicitly selects native collaboration', async () => {
  const account = await resolveDelegationParitySnapshot('account', {
    delegationBackendPreference: 'openai_native',
    nativeCollaborationModeId: 'default',
  })
  const apiKey = await resolveDelegationParitySnapshot('api_key', {
    delegationBackendPreference: 'openai_native',
    nativeCollaborationModeId: 'default',
  })

  assert.equal(account.delegationBackend, 'openai_native')
  assert.equal(account.delegationBackendReason, 'runtime_preference')
  assert.equal(apiKey.delegationBackend, 'addom_moa')
  assert.equal(apiKey.delegationBackendReason, 'runtime_preference_unavailable')
  assert.equal(account.canonicalDelegationBackend, 'addom_moa')
  assert.equal(account.nativeCollaborationBackend, 'openai_native')
  assert.equal(account.delegationEntryPointPolicy, 'canonical_addom_delegation_entry_points')
  assert.equal(account.delegationBackendSelectionSeparatedFromVisibility, true)
  assert.deepEqual(apiKey.visibleDelegationTools, account.visibleDelegationTools)
  assert.equal(
    account.excludedReasons.some((row) => row.reason === 'excluded_due_to_openai_native_delegation_backend'),
    false,
  )
})

test('OpenAI auth delegation parity keeps account-only native collaboration capability separate from the canonical delegation policy floor', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'account' })
  const report = resolveOpenAIAuthParityReport({
    modelId: 'gpt-5.4',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })

  assert.equal(apiKeySupport.supportsAddomMoaDelegation, true)
  assert.equal(accountSupport.supportsAddomMoaDelegation, true)
  assert.equal(apiKeySupport.supportsCollabAgentActivities, false)
  assert.equal(accountSupport.supportsCollabAgentActivities, true)
  assert.equal(apiKeySupport.preferredDelegationBackend, 'addom_moa')
  assert.equal(accountSupport.preferredDelegationBackend, 'addom_moa')
  assert.equal(apiKeySupport.delegationPolicy?.canonicalDelegationBackend, 'addom_moa')
  assert.equal(accountSupport.delegationPolicy?.canonicalDelegationBackend, 'addom_moa')
  assert.equal(apiKeySupport.delegationPolicy?.nativeCollaborationBackend, 'none')
  assert.equal(accountSupport.delegationPolicy?.nativeCollaborationBackend, 'openai_native')
  assert.equal(report.capabilities.addom_moa_delegation.apiKeySupported, true)
  assert.equal(report.capabilities.addom_moa_delegation.accountSupported, true)
  assert.equal(report.capabilities.collab_agent_activities.apiKeySupported, false)
  assert.equal(report.capabilities.collab_agent_activities.accountSupported, true)
  assert.equal(report.mismatches.some((row) => row.capabilityId === 'collab_agent_activities'), false)
})
