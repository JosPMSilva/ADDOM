import test from 'node:test'
import assert from 'node:assert/strict'
import { planDelegation } from '../../src/main/moa/delegation-planner.mjs'

function makeTask(id, roleId, instruction, context = '', format = 'json') {
  return {
    task_id: id,
    agent_role_id: roleId,
    instruction,
    injected_context: context,
    expected_output_format: format,
  }
}

const roles = [
  { id: 'role_1', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
  { id: 'role_2', name: 'Perf Reviewer', providerId: 'openai', model: 'gpt-5-mini' },
  { id: 'role_3', name: 'Tests Reviewer', providerId: 'openai', model: 'gpt-5-nano' },
]

test('planDelegation applies low/medium/high routing defaults', () => {
  const low = planDelegation({
    tasks: [
      makeTask('t1', 'role_1', 'Review naming conventions'),
      makeTask('t2', 'role_2', 'Review docs style'),
      makeTask('t3', 'role_3', 'Review comments quality'),
    ],
    roles,
    policy: { maxTasksPerDelegation: 6 },
  })
  assert.equal(low.riskTier, 'low')
  assert.equal(low.strategy, 'minimal')
  assert.equal(low.pattern, 'parallel_independent')
  assert.equal(low.plannedTasks.length, 3)

  const medium = planDelegation({
    tasks: [
      makeTask('t1', 'role_1', 'Security review for auth boundaries'),
      makeTask('t2', 'role_2', 'Review performance hotspots'),
      makeTask('t3', 'role_3', 'Add regression checks'),
    ],
    roles,
    policy: { maxTasksPerDelegation: 6 },
  })
  assert.equal(medium.riskTier, 'medium')
  assert.equal(medium.strategy, 'balanced')
  assert.equal(medium.pattern, 'parallel_independent')
  assert.equal(medium.plannedTasks.length, 3)

  const high = planDelegation({
    tasks: [
      makeTask('t1', 'role_1', 'Security review for auth and credential migration'),
      makeTask('t2', 'role_2', 'Refactor core routing'),
      makeTask('t3', 'role_3', 'Validate rollout safety'),
      makeTask('t4', 'role_1', 'Permission checks on delete flows'),
      makeTask('t5', 'role_2', 'Access control threat model'),
    ],
    roles,
    policy: { maxTasksPerDelegation: 6 },
    projectSignals: { estimatedChangedFiles: 20 },
    recentMoaStats: { recentFailureRate: 0.4 },
  })
  assert.equal(high.riskTier, 'high')
  assert.equal(high.strategy, 'deep_review')
  assert.equal(high.pattern, 'review_gate')
  assert.equal(high.plannedTasks.length, 5)
  assert.ok(Array.isArray(high.rationale))
})

test('planDelegation keeps valid tasks intact and returns a non-destructive lean recommendation', () => {
  const planned = planDelegation({
    tasks: [
      makeTask('t1', 'role_1', 'Security review'),
      makeTask('t2', 'role_2', 'Performance review'),
      makeTask('t3', 'role_3', 'Test review'),
    ],
    roles,
    policy: { maxTasksPerDelegation: 2 },
  })

  assert.equal(planned.plannedTasks.length, 3)
  assert.equal(planned.leanAlternative.strategy, 'minimal')
  assert.equal(planned.leanAlternative.pattern, 'single_specialist')
  assert.ok(Array.isArray(planned.leanAlternative.plannedTasks))
  assert.equal(planned.leanAlternative.plannedTasks.length, 1)
})

test('planDelegation only dedupes exact duplicate task semantics', () => {
  const planned = planDelegation({
    tasks: [
      makeTask('t1', 'role_1', 'Security review for auth boundaries', 'Landing page', 'json'),
      makeTask('t2', 'role_1', 'Security review for auth boundaries', 'Settings panel', 'json'),
      makeTask('t3', 'role_1', 'Security review for auth boundaries', 'Landing page', 'markdown'),
      makeTask('t1', 'role_1', 'Security review for auth boundaries', 'Landing page', 'json'),
    ],
    roles,
    policy: { maxTasksPerDelegation: 6 },
    projectSignals: { estimatedChangedFiles: 20 },
  })

  assert.equal(planned.rationale.includes('deduped_redundant_tasks=true'), true)
  assert.deepEqual(
    planned.plannedTasks.map((task) => task.task_id),
    ['t1', 't2', 't3'],
  )
  assert.match(planned.rationale.join(','), /pattern=parallel_independent/)
  assert.equal(planned.leanAlternative.plannedTasks.length, 1)
})

test('planDelegation selects sequential and review-gate patterns for coupled work', () => {
  const sequential = planDelegation({
    tasks: [
      makeTask('t1', 'role_1', 'Research the current routing architecture'),
      makeTask('t2', 'role_2', 'Implement the routing refactor'),
    ],
    roles,
    policy: { maxTasksPerDelegation: 6 },
  })
  assert.equal(sequential.pattern, 'sequential_pipeline')
  assert.equal(sequential.plannedTasks.length, 2)

  const reviewGate = planDelegation({
    tasks: [
      makeTask('t1', 'role_1', 'Implement the auth migration'),
      makeTask('t2', 'role_2', 'Review the auth migration for permission regressions'),
      makeTask('t3', 'role_3', 'Test the auth migration'),
    ],
    roles,
    policy: { maxTasksPerDelegation: 6 },
    projectSignals: { estimatedChangedFiles: 20 },
  })
  assert.equal(reviewGate.riskTier, 'high')
  assert.equal(reviewGate.pattern, 'review_gate')
  assert.equal(reviewGate.plannedTasks.length, 3)
})

