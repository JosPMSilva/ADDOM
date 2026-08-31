import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPreCallContinuityInput } from '../../src/main/chat/precall-continuity-input.mjs'
import { estimateHistoryTokens } from '../../src/main/chat/context-compaction.mjs'

test('buildPreCallContinuityInput uses estimated prompt occupancy instead of rolling spend for continuity pre-call input', () => {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'Refactor the auth flow.' },
    { role: 'assistant', content: 'I will inspect the files.' },
    { role: 'tool', content: 'tool output' },
  ]
  const expectedOccupancy = estimateHistoryTokens(history)

  const built = buildPreCallContinuityInput({
    history,
    round: 3,
    rollingUsage: { totalTokens: 77777 },
    userMessage: 'Refactor auth flow',
  })

  assert.equal(built.preCallOccupancyEstimateTokens, expectedOccupancy)
  assert.equal(built.continuityInput.contextOccupancyTokens, expectedOccupancy)
  assert.equal(built.continuityInput.rollingTotalTokens, 77777)
  assert.notEqual(built.continuityInput.contextOccupancyTokens, built.continuityInput.rollingTotalTokens)
  assert.equal(built.continuityInput.round, 3)
  assert.equal(built.continuityInput.userMessage, 'Refactor auth flow')
  assert.equal(built.continuityInput.history, history)
})

test('buildPreCallContinuityInput normalizes invalid inputs safely', () => {
  const built = buildPreCallContinuityInput({
    history: null,
    round: 0,
    rollingUsage: { totalTokens: 'nan' },
    userMessage: null,
  })

  assert.ok(Number.isFinite(built.preCallOccupancyEstimateTokens))
  assert.equal(built.continuityInput.round, 1)
  assert.equal(built.continuityInput.rollingTotalTokens, 0)
  assert.equal(built.continuityInput.userMessage, '')
  assert.deepEqual(built.continuityInput.history, [])
})
