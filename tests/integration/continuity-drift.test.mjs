import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateContinuityDrift } from '../../src/main/chat/continuity/drift-guard.mjs'

test('evaluateContinuityDrift flags contradiction when fact negates invariant', () => {
  const result = evaluateContinuityDrift({
    invariants: [
      { id: 'inv_1', invariantText: 'Do not write files without approval.' },
    ],
    facts: [
      { id: 'fact_1', factText: 'The agent wrote files without approval during delegation.' },
    ],
    contradictionChecksEnabled: true,
  })

  assert.equal(result.driftRisk, 'medium')
  assert.equal(result.violationCount, 1)
  assert.equal(result.violations[0].invariantId, 'inv_1')
})

test('evaluateContinuityDrift stays low when contradiction checks are disabled', () => {
  const result = evaluateContinuityDrift({
    invariants: [{ id: 'inv_1', invariantText: 'Never disable approval.' }],
    facts: [{ id: 'fact_1', factText: 'Approval was not disabled.' }],
    contradictionChecksEnabled: false,
  })
  assert.equal(result.driftRisk, 'low')
  assert.equal(result.violationCount, 0)
})
