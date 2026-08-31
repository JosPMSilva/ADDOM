import test from 'node:test'
import assert from 'node:assert/strict'

import { chooseOrchestrationPattern, maxTasksForPattern } from '../../src/main/moa/orchestration-patterns.mjs'

function makeTask(overrides = {}) {
  return {
    task_id: 'task_1',
    specialty: '',
    task_type: '',
    goal: '',
    instruction: '',
    ...overrides,
  }
}

test('chooseOrchestrationPattern prefers single specialist for a single task', () => {
  const result = chooseOrchestrationPattern([
    makeTask({ instruction: 'Review this auth flow for bugs.' }),
  ])

  assert.equal(result.pattern, 'single_specialist')
  assert.deepEqual(result.rationale, ['single_task'])
})

test('chooseOrchestrationPattern detects sequential research to implementation flows', () => {
  const result = chooseOrchestrationPattern([
    makeTask({ task_id: 'task_1', specialty: 'research', instruction: 'Research the current module boundaries.' }),
    makeTask({ task_id: 'task_2', specialty: 'implementation', instruction: 'Implement the chosen refactor.' }),
  ], { riskTier: 'medium' })

  assert.equal(result.pattern, 'sequential_pipeline')
  assert.match(result.rationale.join(','), /research_then_implementation_shape/)
})

test('chooseOrchestrationPattern uses review gate for high-risk implementation plus validation work', () => {
  const result = chooseOrchestrationPattern([
    makeTask({ task_id: 'task_1', specialty: 'implementation', instruction: 'Implement the auth migration.' }),
    makeTask({ task_id: 'task_2', specialty: 'testing', instruction: 'Validate the permission checks.' }),
  ], { riskTier: 'high' })

  assert.equal(result.pattern, 'review_gate')
  assert.match(result.rationale.join(','), /high_risk_review_gate/)
})

test('chooseOrchestrationPattern detects council requests explicitly', () => {
  const result = chooseOrchestrationPattern([
    makeTask({ task_id: 'task_1', instruction: 'Run a council debate on the best architecture.' }),
    makeTask({ task_id: 'task_2', instruction: 'Vote on the best implementation path.' }),
  ])

  assert.equal(result.pattern, 'council')
  assert.match(result.rationale.join(','), /council_keywords_detected/)
})

test('maxTasksForPattern applies bounded caps by pattern', () => {
  assert.equal(maxTasksForPattern('single_specialist', { policyMax: 6, riskTier: 'medium' }), 1)
  assert.equal(maxTasksForPattern('council', { policyMax: 6, riskTier: 'medium' }), 3)
  assert.equal(maxTasksForPattern('review_gate', { policyMax: 6, riskTier: 'high' }), 3)
  assert.equal(maxTasksForPattern('parallel_independent', { policyMax: 6, riskTier: 'low' }), 1)
})
