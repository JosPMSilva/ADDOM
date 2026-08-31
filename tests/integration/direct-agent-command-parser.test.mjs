import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isDirectAgentCommandText,
  parseDirectAgentCommand,
} from '../../src/renderer/components/chat/direct-agent-command-parser.mjs'

const ROLES = [
  { id: 'role_sec_1', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
  { id: 'role_perf_1', name: 'Performance Analyst', providerId: 'openai', model: 'gpt-5-mini' },
]

test('detects direct agent command prefixes', () => {
  assert.equal(isDirectAgentCommandText('/agent Security Reviewer :: audit auth'), true)
  assert.equal(isDirectAgentCommandText('/agents Security Reviewer, Performance Analyst :: review'), true)
  assert.equal(isDirectAgentCommandText('@role_sec_1 audit auth'), true)
  assert.equal(isDirectAgentCommandText('normal chat message'), false)
})

test('parses /agent command using role name and routes orchestrated_single', () => {
  const parsed = parseDirectAgentCommand('/agent Security Reviewer :: audit auth flow', ROLES)
  assert.ok(parsed?.ok)
  assert.equal(parsed.route, 'orchestrated_single')
  assert.equal(parsed.roles.length, 1)
  assert.equal(parsed.roles[0].id, 'role_sec_1')
  assert.equal(parsed.tasks[0].agentRoleId, 'role_sec_1')
  assert.equal(parsed.tasks[0].instruction, 'audit auth flow')
})

test('parses /agents command using ids and routes orchestrated_fanout', () => {
  const parsed = parseDirectAgentCommand('/agents role_sec_1, role_perf_1 :: review this module', ROLES)
  assert.ok(parsed?.ok)
  assert.equal(parsed.route, 'orchestrated_fanout')
  assert.equal(parsed.tasks.length, 2)
  assert.deepEqual(parsed.tasks.map((t) => t.agentRoleId), ['role_sec_1', 'role_perf_1'])
})

test('parses @role mention syntax (single and fanout) for root agent orchestration', () => {
  const single = parseDirectAgentCommand('@role_sec_1 audit auth flow', ROLES)
  assert.equal(single?.ok, true)
  assert.equal(single?.route, 'orchestrated_single')
  assert.equal(single?.tasks?.[0]?.agentRoleId, 'role_sec_1')
  assert.equal(single?.instruction, 'audit auth flow')

  const fanout = parseDirectAgentCommand('@{Security Reviewer} @{Performance Analyst} review this file', ROLES)
  assert.equal(fanout?.ok, true)
  assert.equal(fanout?.route, 'orchestrated_fanout')
  assert.equal(fanout?.tasks?.length, 2)
  assert.equal(fanout?.tasks?.[0]?.agentRoleId, 'role_sec_1')
  assert.equal(fanout?.tasks?.[1]?.agentRoleId, 'role_perf_1')
})

test('returns actionable error for unknown roles', () => {
  const parsed = parseDirectAgentCommand('/agent Unknown Role :: do work', ROLES)
  assert.equal(parsed?.ok, false)
  assert.equal(parsed?.error, 'role_not_found')
  assert.match(String(parsed?.message || ''), /Available roles/i)
})

test('returns syntax error without :: separator', () => {
  const parsed = parseDirectAgentCommand('/agent Security Reviewer audit auth', ROLES)
  assert.equal(parsed?.ok, false)
  assert.equal(parsed?.error, 'invalid_syntax')
})

