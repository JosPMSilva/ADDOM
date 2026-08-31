import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildProviderTruncationEffectivePromptBudget,
  buildProviderTruncationBudget,
  buildSafeProviderTruncationOccupancyEstimate,
  normalizeProviderTruncationSoftTriggerPercent,
  resolveProviderTruncationTriggerTokens,
} from '../../src/common/chat/provider-truncation-budget-policy.mjs'

test('provider truncation budget defaults to 85 percent soft trigger and 100 percent forced ceiling', () => {
  const budget = buildProviderTruncationBudget({
    modelContextLimitTokens: 200_000,
  })

  assert.equal(budget.softTriggerPercent, 85)
  assert.equal(budget.softTriggerTokens, 170_000)
  assert.equal(budget.criticalTaskTriggerFloorPercent, 100)
  assert.equal(budget.criticalTaskTriggerCeilingPercent, 100)
  assert.equal(budget.forcedTriggerPercent, 100)
  assert.equal(budget.forcedTriggerTokens, 200_000)
})

test('provider truncation budget leaves a wider critical-task allowance band when the user lowers the soft trigger', () => {
  const budget = buildProviderTruncationBudget({
    modelContextLimitTokens: 200_000,
    softTriggerPercent: 50,
  })

  assert.equal(budget.softTriggerPercent, 50)
  assert.equal(budget.softTriggerTokens, 100_000)
  assert.equal(budget.criticalTaskAllowanceFloorPercent, 15)
  assert.equal(budget.criticalTaskAllowanceCeilingPercent, 30)
  assert.equal(budget.criticalTaskTriggerFloorPercent, 65)
  assert.equal(budget.criticalTaskTriggerCeilingPercent, 80)
})

test('provider truncation soft trigger percent normalization falls back to the shared default', () => {
  assert.equal(normalizeProviderTruncationSoftTriggerPercent(0), 85)
  assert.equal(normalizeProviderTruncationSoftTriggerPercent('abc'), 85)
  assert.equal(normalizeProviderTruncationSoftTriggerPercent(140), 100)
})

test('provider truncation effective prompt budget reserves output and safety headroom', () => {
  const budget = buildProviderTruncationEffectivePromptBudget({
    modelContextLimitTokens: 200_000,
    maxOutputTokens: 32_000,
  })

  assert.equal(budget.outputReserveTokens, 32_000)
  assert.equal(budget.safetyReserveTokens, 6_000)
  assert.equal(budget.effectivePromptBudgetTokens, 162_000)
})

test('provider truncation safe occupancy estimate applies margin and fixed overhead', () => {
  assert.equal(buildSafeProviderTruncationOccupancyEstimate(100_000), 115_512)
})

test('provider truncation trigger tokens lift into the allowance band only for active critical tasks', () => {
  const budget = buildProviderTruncationBudget({
    modelContextLimitTokens: 200_000,
    softTriggerPercent: 50,
  })

  assert.equal(resolveProviderTruncationTriggerTokens({ budget }), 100_000)
  assert.equal(resolveProviderTruncationTriggerTokens({
    budget,
    criticalTaskState: {
      active: true,
      allowanceLevel: 'floor',
    },
  }), 130_000)
  assert.equal(resolveProviderTruncationTriggerTokens({
    budget,
    criticalTaskState: {
      active: true,
      allowanceLevel: 'ceiling',
    },
  }), 160_000)
})
