import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeRunCommandPolicyDecisionResult } from '../../src/main/chat/run-command-policy-contract.mjs'

test('normalizeRunCommandPolicyDecisionResult normalizes valid decision shape and dedupes lists', () => {
  const out = normalizeRunCommandPolicyDecisionResult({
    decision: 'require_elevation',
    executionTarget: 'host',
    elevationRequired: true,
    reasons: ['external_path_access', 'external_path_access', ''],
    hints: ['Use host_full_access', 'Use host_full_access'],
  })

  assert.deepEqual(out, {
    decision: 'require_elevation',
    executionTarget: 'host',
    elevationRequired: true,
    reasons: ['external_path_access'],
    hints: ['Use host_full_access'],
  })
})

test('normalizeRunCommandPolicyDecisionResult applies safe fallbacks and route_to_sandbox target default', () => {
  const out = normalizeRunCommandPolicyDecisionResult({
    policyDecision: 'route_to_sandbox',
    executionTarget: '',
    policyReasons: ['dependency_install_project'],
    hints: ['Use install sandbox'],
  })

  assert.equal(out.decision, 'route_to_sandbox')
  assert.equal(out.executionTarget, 'install_sandbox')
  assert.equal(out.elevationRequired, false)
  assert.deepEqual(out.reasons, ['dependency_install_project'])
  assert.deepEqual(out.hints, ['Use install sandbox'])
})

test('normalizeRunCommandPolicyDecisionResult fails closed for unknown decisions', () => {
  const out = normalizeRunCommandPolicyDecisionResult({
    decision: 'something_new',
    executionTarget: 'weird',
    reasons: 'nope',
    hints: null,
  })

  assert.deepEqual(out, {
    decision: 'deny',
    executionTarget: 'host',
    elevationRequired: false,
    reasons: [],
    hints: [],
  })
})
