import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateDelegationCostGate,
} from '../../src/main/moa/delegation-cost-gate.mjs'

test('evaluateDelegationCostGate keeps cost estimates silent and emits internal warnings only', () => {
  const gate = evaluateDelegationCostGate(
    {
      estimatedTokens: 50_000,
      estimatedUsd: 2.0,
      usdAvailable: true,
    },
    {
      softTokenWarnThreshold: 20_000,
      softUsdWarnThreshold: 1.0,
      highCostConfirmEnabled: true,
      highCostConfirmTokenThreshold: 40_000,
      highCostConfirmUsdThreshold: 1.5,
      showLeanAlternative: true,
    },
  )

  assert.equal(gate.shouldWarn, true)
  assert.equal('shouldConfirm' in gate, false)
  assert.equal(gate.estimatedTokens, 50_000)
  assert.equal(gate.estimatedUsd, 2.0)
  assert.equal(gate.usdAvailable, true)
})

