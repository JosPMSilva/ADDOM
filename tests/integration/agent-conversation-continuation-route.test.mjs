import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentConversationContinuationRouteResolver } from '../../src/main/agents/agent-conversation-continuation-route.mjs'

const conversation = Object.freeze({
  projectId: 'project_01',
  roleId: 'reviewer',
  providerRoute: { providerId: 'openai', modelId: 'gpt-5.6-luna' },
})

function createResolver({ roles, projectPath = 'C:/workspace/project-01', readiness } = {}) {
  const keys = []
  const resolver = createAgentConversationContinuationRouteResolver({
    db: {
      prepare() {
        return { get: () => (projectPath ? { path: projectPath } : null) }
      },
    },
    getSettings: () => ({
      moaRoles: roles || [{
        id: 'reviewer', name: 'Reviewer', providerId: 'openai', model: 'gpt-5.6-luna',
      }],
      moaPolicy: { requireConfiguredApiKey: true },
      agentSettings: { defaultProfile: 'high' },
      providerRuntimeSettings: { openai: { streamTimeoutMs: 1234 } },
    }),
    getKey(providerId) {
      keys.push(providerId)
      return 'vault-secret'
    },
    resolveCredentialReadiness: () => readiness || ({
      ready: true, authMethod: 'account', apiKey: '',
    }),
  })
  return { keys, resolver }
}

test('conversation continuation route rehydrates role, project, policy, and provider access in main', () => {
  const { resolver } = createResolver()
  const route = resolver(conversation)
  assert.equal(route.supported, true)
  assert.equal(route.role.id, 'reviewer')
  assert.equal(route.projectFolder, 'C:/workspace/project-01')
  assert.equal(route.policyProfileId, 'high')
  assert.equal(route.agentRuntime.openAIExecutionAuthSnapshot.authMethod, 'account')
  assert.equal(route.agentRuntime.providerRuntimeSettings.openai.streamTimeoutMs, 1234)
})

test('conversation continuation route fails closed when configured identity or access changed', () => {
  const missingRole = createResolver({ roles: [] }).resolver(conversation)
  assert.deepEqual(missingRole, {
    supported: false,
    reason: 'agent_role_unavailable',
    message: 'The agent role used by this conversation is no longer configured.',
  })

  const changedRoute = createResolver({
    roles: [{ id: 'reviewer', providerId: 'openai', model: 'gpt-5.4' }],
  }).resolver(conversation)
  assert.equal(changedRoute.supported, false)
  assert.equal(changedRoute.reason, 'agent_route_changed')

  const unavailable = createResolver({
    readiness: { ready: false, code: 'account_signed_out', message: 'Sign in again.' },
  }).resolver(conversation)
  assert.equal(unavailable.supported, false)
  assert.equal(unavailable.reason, 'account_signed_out')
})
