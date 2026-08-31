import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveOpenAIModelRuntimeSupport } from '../../src/main/api-clients/openai-model-runtime-support.mjs'
import {
  resolveOpenAIAuthCapabilitySupport,
  resolveOpenAIAuthParityReport,
} from '../../src/main/api-clients/openai-account-capability-contract.mjs'
import { resolveOpenAIExecutionAuth } from '../../src/main/openai-account/openai-execution-auth.mjs'

function resolveCapabilityUnsupportedClass(args = {}) {
  return resolveOpenAIAuthCapabilitySupport(args) ? '' : 'capability_unsupported'
}

const CURATED_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.3-codex',
]

const CORE_CAPABILITIES = [
  'web_search',
  'shell',
  'apply_patch',
  'mcp',
  'delegated_tool_surface',
  'addom_moa_delegation',
  'approvals',
  'background_mode',
  'compaction',
]

test('openai account auth parity matrix keeps the core capability set aligned for curated models', () => {
  for (const modelId of CURATED_MODELS) {
    const apiKeySupport = resolveOpenAIModelRuntimeSupport(modelId, { authMethod: 'api_key' })
    const accountSupport = resolveOpenAIModelRuntimeSupport(modelId, { authMethod: 'account' })
    const report = resolveOpenAIAuthParityReport({
      modelId,
      apiKeySupport,
      accountSupport,
      contract: accountSupport.accountCapabilityContract,
    })

    assert.equal(report.status, 'parity', `${modelId}: ${JSON.stringify(report.mismatches)}`)
    assert.deepEqual(report.registeredExceptions, [], `${modelId}: registered exceptions`)
    assert.deepEqual(
      report.mismatches.filter((row) => CORE_CAPABILITIES.includes(row.capabilityId)),
      [],
      `${modelId}: mismatches`,
    )

    for (const capabilityId of CORE_CAPABILITIES) {
      assert.ok(report.capabilities[capabilityId], `${modelId}: missing ${capabilityId}`)
      assert.equal(
        report.capabilities[capabilityId].apiKeySupported,
        report.capabilities[capabilityId].accountSupported,
        `${modelId}:${capabilityId}`,
      )
    }
  }
})

test('openai auth parity matrix keeps equivalent-native lanes explicit without inventing exceptions', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'account' })
  const report = resolveOpenAIAuthParityReport({
    modelId: 'gpt-5.4',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })

  assert.equal(report.capabilities.web_search.accountStatus, 'equivalent_native')
  assert.equal(report.capabilities.web_search.nativeSurface, 'webSearch')
  assert.equal(report.capabilities.mcp.accountStatus, 'equivalent_native')
  assert.equal(report.capabilities.mcp.nativeSurface, 'mcpToolCall')
  assert.equal(report.capabilities.shell.accountStatus, 'equivalent_native')
  assert.equal(report.capabilities.shell.nativeSurface, 'commandExecution')
  assert.equal(report.capabilities.apply_patch.accountStatus, 'equivalent_native')
  assert.equal(report.capabilities.apply_patch.nativeSurface, 'fileChange')
  assert.equal(report.capabilities.approvals.accountStatus, 'parity')
  assert.equal(report.capabilities.background_mode.accountStatus, 'parity')
  assert.equal(report.capabilities.compaction.accountStatus, 'parity')
  assert.equal(report.capabilities.question_user.accountStatus, 'parity')
  assert.equal(report.capabilities.question_user.accountSupported, true)
  assert.deepEqual(report.registeredExceptions, [])
  assert.deepEqual(report.exceptions, [])
})

test('openai auth parity capability matrix keeps shell support parity separate from shell policy follow-up', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'account' })
  const report = resolveOpenAIAuthParityReport({
    modelId: 'gpt-5.4',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })

  assert.equal(report.capabilities.shell.apiKeySupported, true)
  assert.equal(report.capabilities.shell.accountSupported, true)
  assert.equal(report.capabilities.shell.accountStatus, 'equivalent_native')
  assert.equal(report.mismatches.some((row) => row.capabilityId === 'shell'), false)
})

test('openai auth parity matrix keeps canonical delegation parity separate from account-only native collaboration capability', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'account' })
  const report = resolveOpenAIAuthParityReport({
    modelId: 'gpt-5.4',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })

  assert.equal(apiKeySupport.preferredDelegationBackend, 'addom_moa')
  assert.equal(accountSupport.preferredDelegationBackend, 'addom_moa')
  assert.equal(apiKeySupport.delegationPolicy?.canonicalDelegationBackend, 'addom_moa')
  assert.equal(accountSupport.delegationPolicy?.canonicalDelegationBackend, 'addom_moa')
  assert.equal(apiKeySupport.delegationPolicy?.nativeCollaborationBackend, 'none')
  assert.equal(accountSupport.delegationPolicy?.nativeCollaborationBackend, 'openai_native')
  assert.equal(accountSupport.accountCapabilityContract?.delegationPolicy?.canonicalDelegationBackend, 'addom_moa')
  assert.equal(accountSupport.accountCapabilityContract?.delegationPolicy?.nativeCollaborationBackend, 'openai_native')
  assert.equal(report.capabilities.delegated_tool_surface.apiKeySupported, true)
  assert.equal(report.capabilities.delegated_tool_surface.accountSupported, true)
  assert.equal(report.capabilities.addom_moa_delegation.apiKeySupported, true)
  assert.equal(report.capabilities.addom_moa_delegation.accountSupported, true)
  assert.equal(report.capabilities.collab_agent_activities.apiKeySupported, false)
  assert.equal(report.capabilities.collab_agent_activities.accountSupported, true)
  assert.equal(report.mismatches.some((row) => row.capabilityId === 'collab_agent_activities'), false)
})

test('openai auth parity matrix flags uncovered drift directly when account support falls below api-key support', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'account' })
  const driftedContract = {
    ...accountSupport.accountCapabilityContract,
    hostedTools: {
      ...accountSupport.accountCapabilityContract.hostedTools,
      shell: {
        ...accountSupport.accountCapabilityContract.hostedTools.shell,
        supported: false,
      },
    },
    exceptions: accountSupport.accountCapabilityContract.exceptions,
  }
  const report = resolveOpenAIAuthParityReport({
    modelId: 'gpt-5.4',
    apiKeySupport,
    accountSupport,
    contract: driftedContract,
  })

  assert.equal(report.status, 'mismatch')
  assert.deepEqual(
    report.mismatches.map((row) => row.capabilityId),
    ['shell'],
  )
})

test('openai auth parity matrix emits the same canonical capability class for equivalent unsupported shell and file-mutation lanes', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex', { authMethod: 'account' })

  for (const capabilityId of ['shell', 'apply_patch']) {
    const apiKeyClass = resolveCapabilityUnsupportedClass({
      capabilityId,
      authMethod: 'api_key',
      apiKeySupport,
      accountSupport,
      contract: accountSupport.accountCapabilityContract,
    })
    const accountClass = resolveCapabilityUnsupportedClass({
      capabilityId,
      authMethod: 'account',
      apiKeySupport,
      accountSupport,
      contract: accountSupport.accountCapabilityContract,
    })

    assert.equal(apiKeyClass, 'capability_unsupported', capabilityId)
    assert.equal(accountClass, apiKeyClass, capabilityId)
  }
})

test('openai auth parity matrix collapses equivalent user-facing readiness across missing API-key and missing account-session states', () => {
  const apiKeyBlocked = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'api_key' } },
    }),
    getKey: () => '',
  })
  const accountBlocked = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        hasSession: false,
        status: 'disconnected',
        availability: {
          supported: true,
          reason: '',
          message: '',
        },
      },
      storage: {
        availability: {
          supported: true,
          reason: '',
          message: '',
        },
      },
    }),
  })

  assert.equal(apiKeyBlocked.userFacingBlockedReason, 'missing_prerequisite')
  assert.equal(accountBlocked.userFacingBlockedReason, apiKeyBlocked.userFacingBlockedReason)
  assert.equal(accountBlocked.userFacingBlockedMessage, apiKeyBlocked.userFacingBlockedMessage)
  assert.equal(accountBlocked.blockedReason, 'account_login_required')
})
