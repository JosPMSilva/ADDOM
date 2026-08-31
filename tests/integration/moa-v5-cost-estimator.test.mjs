import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateDelegationCost } from '../../src/main/moa/cost-estimator.mjs'
import { evaluateDelegationCostGate } from '../../src/main/moa/delegation-cost-gate.mjs'
import { resolveEffectivePricingProfiles } from '../../src/main/moa/moa-budget-policy.mjs'

function pickPricedOpenAIModel(pricingProfiles = []) {
  return (Array.isArray(pricingProfiles) ? pricingProfiles : []).find((row) => (
    String(row?.providerId || '').trim().toLowerCase() === 'openai'
  ))?.model || 'gpt-5-mini'
}

function makeTask(taskId, agentRoleId, instruction = 'Review implementation', expected = 'Bullet list') {
  return {
    task_id: taskId,
    agent_role_id: agentRoleId,
    instruction,
    injected_context: 'src/main/ipc-handlers/chat.mjs\nFocus on cost and reliability.',
    expected_output_format: expected,
  }
}

test('estimateDelegationCost returns partial request-fee confidence for Perplexity models', () => {
  const pricingProfiles = resolveEffectivePricingProfiles([])
  const packet = estimateDelegationCost({
    tasks: [makeTask('t1', 'pplx')],
    roles: [{ id: 'pplx', name: 'research', providerId: 'perplexity', model: 'sonar-pro' }],
    strategy: 'balanced',
    pricingProfiles,
  })

  assert.equal(packet.usdAvailable, true)
  assert.equal(packet.estimateConfidence, 'partial_request_fee')
  assert.match(String(packet.pricingWarning || ''), /request-fee|partial/i)
  assert.equal(packet.perTask.length, 1)
  assert.equal(packet.perTask[0].estimateConfidence, 'partial_request_fee')
})

test('estimateDelegationCost returns token_plus_pricing for registry-priced non-request-fee models', () => {
  const pricingProfiles = resolveEffectivePricingProfiles([])
  const model = pickPricedOpenAIModel(pricingProfiles)
  const packet = estimateDelegationCost({
    tasks: [makeTask('t1', 'oa')],
    roles: [{ id: 'oa', name: 'coder', providerId: 'openai', model }],
    strategy: 'balanced',
    pricingProfiles,
  })

  assert.equal(packet.usdAvailable, true)
  assert.equal(packet.estimateConfidence, 'token_plus_pricing')
  assert.equal(packet.perTask[0].usdAvailable, true)
  assert.equal(packet.perTask[0].estimateConfidence, 'token_plus_pricing')
  assert.ok(Number(packet.estimatedUsd) > 0)
})

test('estimateDelegationCost falls back to token_only when no pricing profile is available', () => {
  const packet = estimateDelegationCost({
    tasks: [makeTask('t1', 'oa')],
    roles: [{ id: 'oa', name: 'coder', providerId: 'openai', model: 'gpt-4o-mini' }],
    strategy: 'balanced',
    pricingProfiles: [],
  })

  assert.equal(packet.usdAvailable, false)
  assert.equal(packet.estimatedUsd, null)
  assert.equal(packet.estimateConfidence, 'token_only')
})

test('evaluateDelegationCostGate keeps partial request-fee estimates as silent warnings', () => {
  const gate = evaluateDelegationCostGate(
    {
      estimatedTokens: 45_000,
      estimatedUsd: 1.2,
      usdAvailable: true,
      estimateConfidence: 'partial_request_fee',
    },
    {
      softTokenWarnThreshold: 40_000,
      softUsdWarnThreshold: 0,
      highCostConfirmEnabled: true,
      highCostConfirmTokenThreshold: 120_000,
      highCostConfirmUsdThreshold: 100,
      showLeanAlternative: true,
    },
  )

  assert.equal(gate.shouldWarn, true)
  assert.equal(gate.partialRequestFee, true)
  assert.equal('shouldConfirm' in gate, false)
})

