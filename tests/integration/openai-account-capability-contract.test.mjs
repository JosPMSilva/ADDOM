import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getOpenAIAccountCapabilityExceptionRegistry,
  listOpenAIAccountCapabilityExceptions,
  OPENAI_ACCOUNT_CAPABILITY_EXCEPTION_IDS,
  OPENAI_ACCOUNT_CAPABILITY_STATUSES,
  resolveOpenAIAuthCapabilitySupport,
  resolveOpenAIAccountCapabilityContract,
} from '../../src/main/api-clients/openai-account-capability-contract.mjs'
import { resolveOpenAIModelRuntimeSupport } from '../../src/main/api-clients/openai-model-runtime-support.mjs'
import {
  OPENAI_ACCOUNT_ITEM_QUALIFICATION_REGISTRY,
  buildOpenAIAccountProtocolCapabilitySnapshot,
} from '../../src/main/api-clients/ai-provider-openai-account-protocol-registry.mjs'

function resolveCapabilityUnsupportedClass(args = {}) {
  return resolveOpenAIAuthCapabilitySupport(args) ? '' : 'capability_unsupported'
}

test('openai account capability contract is parity-by-default with explicit narrow exceptions', () => {
  const contract = resolveOpenAIAccountCapabilityContract({
    supportsAddomMoaDelegation: true,
    supportsBackgroundMode: true,
    hostedToolSupport: {
      web_search: true,
      file_search: true,
      code_interpreter: true,
      image_generation: true,
      mcp: true,
      shell: true,
      apply_patch: true,
    },
  })

  assert.equal(contract.runtimeStatus, 'parity')
  assert.equal(contract.providerNativeRuntime.family, 'openai_codex_app_server')
  assert.equal(contract.providerNativeRuntime.mode, 'provider_owned_runtime')
  assert.equal(contract.hostedTools.web_search.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.EQUIVALENT_NATIVE)
  assert.equal(contract.hostedTools.web_search.nativeSurface, 'webSearch')
  assert.equal(contract.hostedTools.file_search.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY)
  assert.equal(contract.hostedTools.shell.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.EQUIVALENT_NATIVE)
  assert.equal(contract.hostedTools.apply_patch.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.EQUIVALENT_NATIVE)
  assert.equal(contract.capabilities.approvals.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY)
  assert.equal(contract.capabilities.background_mode.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY)
  assert.equal(contract.capabilities.compaction.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY)
  assert.equal(contract.capabilities.question_user.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY)
  assert.equal(contract.capabilities.question_user.supported, true)
  assert.equal(contract.delegationPolicy.canonicalDelegationBackend, 'addom_moa')
  assert.equal(contract.delegationPolicy.nativeCollaborationBackend, 'openai_native')
  assert.equal(contract.delegationPolicy.visibleEntryPointPolicy, 'canonical_addom_delegation_entry_points')
  assert.equal(contract.delegationPolicy.backendSelectionSeparatedFromVisibility, true)

  const exceptions = listOpenAIAccountCapabilityExceptions(contract)
  assert.deepEqual(exceptions, [])
})

test('openai account capability exception registry is empty once question_user parity lands', () => {
  const exceptions = getOpenAIAccountCapabilityExceptionRegistry()
  assert.deepEqual(exceptions, [])
  assert.deepEqual(OPENAI_ACCOUNT_CAPABILITY_EXCEPTION_IDS, {})
})

test('openai account capability contract keeps shell runtime support parity-only and leaves policy parity to dedicated suites', () => {
  const contract = resolveOpenAIAccountCapabilityContract({
    supportsAddomMoaDelegation: true,
    supportsBackgroundMode: true,
    hostedToolSupport: {
      shell: true,
      apply_patch: true,
    },
  })

  assert.equal(contract.hostedTools.shell.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.EQUIVALENT_NATIVE)
  assert.equal(contract.hostedTools.shell.nativeSurface, 'commandExecution')
  assert.deepEqual(listOpenAIAccountCapabilityExceptions(contract), [])
})

test('image generation is not supported when handler registration and qualification disagree', () => {
  const protocolCapabilities = buildOpenAIAccountProtocolCapabilitySnapshot({
    itemQualificationRegistry: {
      ...OPENAI_ACCOUNT_ITEM_QUALIFICATION_REGISTRY,
      imageGeneration: {
        status: 'unqualified',
        fixtureId: 'openai-account-image-generation-v1',
      },
    },
  })
  const contract = resolveOpenAIAccountCapabilityContract({
    hostedToolSupport: { image_generation: true },
  }, { protocolCapabilities })

  assert.equal(contract.hostedTools.image_generation.supported, false)
  assert.equal(
    contract.hostedTools.image_generation.status,
    OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARTIALLY_SUPPORTED,
  )
  assert.equal(contract.hostedTools.image_generation.handlerId, 'account_native_activity')
  assert.equal(contract.hostedTools.image_generation.qualificationStatus, 'unqualified')
})

test('openai account capability contract keeps file-mutation runtime support parity-only and leaves policy parity to dedicated suites', () => {
  const contract = resolveOpenAIAccountCapabilityContract({
    supportsAddomMoaDelegation: true,
    supportsBackgroundMode: true,
    hostedToolSupport: {
      shell: true,
      apply_patch: true,
    },
  })

  assert.equal(contract.hostedTools.apply_patch.status, OPENAI_ACCOUNT_CAPABILITY_STATUSES.EQUIVALENT_NATIVE)
  assert.equal(contract.hostedTools.apply_patch.nativeSurface, 'fileChange')
  assert.deepEqual(listOpenAIAccountCapabilityExceptions(contract), [])
})

test('openai account capability contract classifies unsupported shell and file-mutation lanes as capability_unsupported', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex', { authMethod: 'account' })

  const shellApiKeyClass = resolveCapabilityUnsupportedClass({
    capabilityId: 'shell',
    authMethod: 'api_key',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })
  const shellAccountClass = resolveCapabilityUnsupportedClass({
    capabilityId: 'shell',
    authMethod: 'account',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })
  const patchApiKeyClass = resolveCapabilityUnsupportedClass({
    capabilityId: 'apply_patch',
    authMethod: 'api_key',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })
  const patchAccountClass = resolveCapabilityUnsupportedClass({
    capabilityId: 'apply_patch',
    authMethod: 'account',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })

  assert.equal(resolveOpenAIAuthCapabilitySupport({
    capabilityId: 'shell',
    authMethod: 'api_key',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  }), false)
  assert.equal(shellApiKeyClass, 'capability_unsupported')
  assert.equal(shellAccountClass, 'capability_unsupported')
  assert.equal(patchApiKeyClass, 'capability_unsupported')
  assert.equal(patchAccountClass, 'capability_unsupported')
})

test('openai account capability contract keeps account-only native collaboration capability separate from the canonical delegation floor', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'account' })

  const apiKeySupported = resolveOpenAIAuthCapabilitySupport({
    capabilityId: 'collab_agent_activities',
    authMethod: 'api_key',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })
  const accountSupported = resolveOpenAIAuthCapabilitySupport({
    capabilityId: 'collab_agent_activities',
    authMethod: 'account',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })

  assert.equal(apiKeySupported, false)
  assert.equal(resolveCapabilityUnsupportedClass({
    capabilityId: 'collab_agent_activities',
    authMethod: 'api_key',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  }), 'capability_unsupported')
  assert.equal(accountSupported, true)
  assert.equal(resolveCapabilityUnsupportedClass({
    capabilityId: 'collab_agent_activities',
    authMethod: 'account',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  }), '')
})
