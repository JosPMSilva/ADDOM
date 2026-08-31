import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAgentCatalogSnapshot } from '../../src/main/moa/agent-catalog-service.mjs'

const ROLES = [{
  id: 'role_security',
  roleKey: 'security_reviewer',
  name: 'Security Reviewer',
  providerId: 'openrouter',
  model: 'anthropic/claude-sonnet',
  systemPrompt: 'SECRET SECURITY PROMPT',
  canWriteFiles: false,
}, {
  id: 'role_docs',
  roleKey: 'docs_writer',
  name: 'Docs Writer',
  providerId: 'openai',
  model: 'gpt-5.4',
  systemPrompt: 'SECRET DOCS PROMPT',
  canWriteFiles: true,
}, {
  id: 'role_architecture',
  roleKey: 'architecture_reviewer',
  name: 'Architecture Reviewer',
  providerId: 'cursor',
  model: 'cursor-agent',
  systemPrompt: 'SECRET ARCHITECTURE PROMPT',
  canWriteFiles: false,
}]

function readiness(role) {
  return role.roleKey === 'architecture_reviewer'
    ? {
        ready: false,
        code: 'delegated_runtime_unavailable',
        message: 'Delegated runtime is unavailable.',
        toolSupportMode: 'provider_owned_runtime_only',
      }
    : {
        ready: true,
        code: '',
        message: '',
        toolSupportMode: 'native_tools',
      }
}

test('agent catalog snapshots are stable, sanitized, and keep unavailable roles visible', () => {
  const options = {
    moaPolicy: {
      agentWriteAccessEnabled: true,
      agentWriteMode: 'staged',
    },
    resolveReadiness: readiness,
  }
  const first = buildAgentCatalogSnapshot({
    moaRoles: ROLES,
    ...options,
  })
  const second = buildAgentCatalogSnapshot({
    moaRoles: [...ROLES].reverse(),
    ...options,
  })

  assert.equal(first.version, 1)
  assert.equal(first.hash, second.hash)
  assert.deepEqual(
    first.roles.map((role) => role.key),
    ['architecture_reviewer', 'docs_writer', 'security_reviewer'],
  )
  assert.equal(first.roles[0].status, 'unavailable')
  assert.equal(first.roles[0].readiness_reason, 'delegated_runtime_unavailable')
  assert.equal(first.roles[1].effective_access, 'staged_write')
  assert.equal(first.roles[2].effective_access, 'read_only')
  assert.equal(first.ready_role_count, 2)
  assert.equal(first.unavailable_role_count, 1)

  const serialized = JSON.stringify(first)
  assert.equal(serialized.includes('SECRET'), false)
  assert.equal(serialized.includes('systemPrompt'), false)
  assert.equal(serialized.includes('apiKey'), false)
})

test('catalog policy, not a role declaration alone, controls effective write access', () => {
  const snapshot = buildAgentCatalogSnapshot({
    moaRoles: [ROLES[1]],
    moaPolicy: {
      agentWriteAccessEnabled: false,
      agentWriteMode: 'staged',
    },
    resolveReadiness: readiness,
  })

  assert.equal(snapshot.roles[0].effective_access, 'read_only')
})
