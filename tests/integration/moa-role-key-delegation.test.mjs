import test from 'node:test'
import assert from 'node:assert/strict'

import { deriveMoaRoleKey, resolveMoaRoleKey } from '../../src/common/moa/moa-role-keys.mjs'
import { preflightDelegation } from '../../src/main/moa/moa-policy.mjs'
import { buildDelegationErrorEnvelope } from '../../src/main/moa/delegation-summary.mjs'

test('deriveMoaRoleKey slugifies readable keys from names', () => {
  assert.equal(deriveMoaRoleKey({ name: 'Architecture Reviewer' }), 'architecture_reviewer')
  assert.equal(deriveMoaRoleKey({ name: 'Security Reviewer++' }), 'security_reviewer')
})

test('resolveMoaRoleKey prefers persisted roleKey when present', () => {
  assert.equal(resolveMoaRoleKey({
    id: 'role_1773759518725_39a48834',
    name: 'Architecture Reviewer',
    roleKey: 'arch_reviewer',
  }), 'arch_reviewer')
})

test('preflightDelegation resolves explicit agent_role_key against configured roles', () => {
  const roles = [{
    id: 'role_1',
    roleKey: 'architecture_reviewer',
    name: 'Architecture Reviewer',
    providerId: 'ollama',
    model: 'qwen',
  }]
  const preflight = preflightDelegation([{
    task_id: 'task_1',
    agent_role_key: 'architecture_reviewer',
    instruction: 'Review the architecture.',
    injected_context: 'File: src/app.ts',
    expected_output_format: 'Plain text',
  }], roles, () => '', {
    requireConfiguredApiKey: false,
  })

  assert.equal(preflight.ok, true)
  assert.equal(preflight.tasks[0].agent_role_key, 'architecture_reviewer')
  assert.equal(preflight.tasks[0].agent_role_id, 'role_1')
  assert.equal(preflight.tasks[0].agent_role, 'Architecture Reviewer')
})

test('preflightDelegation rejects invalid explicit role keys instead of falling back to semantic routing', () => {
  const roles = [{
    id: 'role_1',
    roleKey: 'architecture_reviewer',
    name: 'Architecture Reviewer',
    providerId: 'ollama',
    model: 'qwen',
  }]
  const preflight = preflightDelegation([{
    task_id: 'task_1',
    agent_role_key: 'database_designer',
    specialty: 'architecture',
    task_type: 'review',
    goal: 'Review the system design',
    instruction: 'Review the architecture.',
    injected_context: 'File: src/app.ts',
    expected_output_format: 'Plain text',
  }], roles, () => '', {
    requireConfiguredApiKey: false,
  })

  assert.equal(preflight.ok, false)
  assert.equal(preflight.errors[0]?.code, 'role_not_found')
  assert.match(String(preflight.errors[0]?.message || ''), /Role key "database_designer" is not configured/i)
})

test('preflight failure envelope preserves requested role identity and its task-specific reason', () => {
  const envelope = buildDelegationErrorEnvelope({
    tasks: [{
      task_id: 'task_1',
      agent_role_key: 'database_designer',
      agent_role: 'Database Designer',
    }],
    errors: [{
      code: 'role_not_found',
      taskId: 'task_1',
      message: 'Role "Database Designer" is not configured in Settings > Subagents.',
    }],
  })

  assert.equal(envelope.agents[0]?.role, '')
  assert.equal(envelope.agents[0]?.roleKey, '')
  assert.equal(envelope.agents[0]?.requestedRoleKey, 'database_designer')
  assert.equal(envelope.agents[0]?.requestedRole, 'Database Designer')
  assert.match(String(envelope.agents[0]?.error || ''), /not configured in Settings > Subagents/i)
  assert.match(String(envelope.text || ''), /<delegation state="preflight_failed">/)
  assert.match(String(envelope.text || ''), /Database Designer|database_designer/)
  assert.doesNotMatch(String(envelope.text || ''), /AGENT DELEGATION RESULTS/)
  assert.match(String(envelope.debugText || ''), /Database Designer/i)
  assert.match(String(envelope.debugText || ''), /not configured in Settings > Subagents/i)
})
