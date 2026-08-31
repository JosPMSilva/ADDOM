import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hasSemanticRoutingHints,
  resolveRoleForTask,
  scoreRoleForTask,
} from '../../src/main/moa/role-fit-scoring.mjs'

test('hasSemanticRoutingHints detects semantic routing fields', () => {
  assert.equal(hasSemanticRoutingHints({}), false)
  assert.equal(hasSemanticRoutingHints({ specialty: 'security' }), true)
  assert.equal(hasSemanticRoutingHints({ constraints: ['read_only'] }), true)
  assert.equal(hasSemanticRoutingHints({ instruction: 'Investigate Electron focus regressions in the desktop shell.' }), true)
})

test('scoreRoleForTask prefers roles whose metadata matches task semantics', () => {
  const score = scoreRoleForTask(
    {
      specialty: 'security',
      task_type: 'review',
      goal: 'Audit auth for injection and access control flaws.',
      instruction: 'Review the auth flow for exploitable issues.',
    },
    {
      id: 'role_sec',
      name: 'Security Reviewer',
      templateLabel: 'Security Analyst',
      systemPrompt: 'Focus on auth, injection, broken access control, and exploitability.',
      canWriteFiles: false,
    },
  )

  assert.ok(score.score >= 8)
  assert.ok(score.matchedTerms.includes('security'))
})

test('resolveRoleForTask only accepts strong semantic matches', () => {
  const resolved = resolveRoleForTask(
    {
      specialty: 'accessibility',
      task_type: 'review',
      goal: 'Audit keyboard navigation and screen reader labeling.',
      instruction: 'Check the dialog interactions for a11y issues.',
    },
    [
      { id: 'role_a11y', name: 'Accessibility Reviewer', providerId: 'openai', model: 'gpt-5-mini' },
      { id: 'role_perf', name: 'Performance Analyst', providerId: 'openai', model: 'gpt-5-mini' },
    ],
  )

  assert.equal(resolved.role?.id, 'role_a11y')
  assert.equal(resolved.strategy, 'semantic')
  assert.equal(resolved.confidence, 'high')
})
