import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveOpenAIModelRuntimeSupport } from '../../src/main/api-clients/openai-model-runtime-support.mjs'
import { resolveOpenAIAuthParityReport } from '../../src/main/api-clients/openai-account-capability-contract.mjs'

const POLICY_PARITY_ROWS = Object.freeze([
  Object.freeze({
    providerPair: 'openai_account_vs_api_key',
    family: 'shell_command',
    classification: 'policy_gap',
    status: 'confirmed',
  }),
  Object.freeze({
    providerPair: 'non_openai_curated',
    family: 'shell_command',
    classification: 'capability_gap',
    status: 'inferred',
  }),
  Object.freeze({
    providerPair: 'non_openai_disputed',
    family: 'mcp_call',
    classification: 'deferred',
    status: 'disputed',
  }),
  Object.freeze({
    providerPair: 'perplexity',
    family: 'web_fetch',
    classification: 'deferred',
    status: 'disputed',
  }),
])

test('provider policy parity matrix keeps OpenAI shell policy drift separate from capability parity', () => {
  const apiKeySupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'api_key' })
  const accountSupport = resolveOpenAIModelRuntimeSupport('gpt-5.4', { authMethod: 'account' })
  const parityReport = resolveOpenAIAuthParityReport({
    modelId: 'gpt-5.4',
    apiKeySupport,
    accountSupport,
    contract: accountSupport.accountCapabilityContract,
  })
  const shellPolicyRow = POLICY_PARITY_ROWS.find((row) => (
    row.providerPair === 'openai_account_vs_api_key' && row.family === 'shell_command'
  ))

  assert.ok(shellPolicyRow)
  assert.equal(shellPolicyRow.classification, 'policy_gap')
  assert.equal(parityReport.capabilities.shell.apiKeySupported, true)
  assert.equal(parityReport.capabilities.shell.accountSupported, true)
  assert.equal(parityReport.capabilities.shell.accountStatus, 'equivalent_native')
  assert.equal(parityReport.mismatches.some((row) => row.capabilityId === 'shell'), false)
})

test('provider policy parity matrix leaves disputed non-OpenAI rows deferred instead of reclassifying them', () => {
  const deferredRows = POLICY_PARITY_ROWS.filter((row) => row.classification === 'deferred')

  assert.deepEqual(
    deferredRows.map((row) => `${row.providerPair}:${row.family}`).sort(),
    [
      'non_openai_disputed:mcp_call',
      'perplexity:web_fetch',
    ],
  )
  for (const row of deferredRows) {
    assert.equal(row.status, 'disputed')
  }
})

test('provider policy parity matrix does not treat non-OpenAI shell absence as OpenAI policy drift', () => {
  const nonOpenAIShellRow = POLICY_PARITY_ROWS.find((row) => (
    row.providerPair === 'non_openai_curated' && row.family === 'shell_command'
  ))
  const openAIShellRow = POLICY_PARITY_ROWS.find((row) => (
    row.providerPair === 'openai_account_vs_api_key' && row.family === 'shell_command'
  ))

  assert.ok(nonOpenAIShellRow)
  assert.ok(openAIShellRow)
  assert.equal(nonOpenAIShellRow.classification, 'capability_gap')
  assert.equal(openAIShellRow.classification, 'policy_gap')
})
