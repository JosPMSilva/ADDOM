import test from 'node:test'
import assert from 'node:assert/strict'

import { executeApprovedToolStep } from '../../src/main/chat/chat-stream-tool-execution.mjs'

test('agent_catalog returns sanitized runtime JSON without asking the provider to infer roles', async () => {
  const outcome = await executeApprovedToolStep({
    tc: { id: 'tc_catalog', name: 'agent_catalog' },
    toolInput: { include_unavailable: true },
    providerId: 'openrouter',
    mode: 'execute',
    loop: { abortController: new AbortController(), cancelled: false },
    moaRoles: [{
      id: 'role_security',
      roleKey: 'security_reviewer',
      name: 'Security Reviewer',
      providerId: 'openrouter',
      model: 'agent-model',
      systemPrompt: 'SECRET ROLE PROMPT',
    }],
    moaPolicy: { requireConfiguredApiKey: true },
    getApiKey: () => 'SECRET API KEY',
    getCachedCapabilities: () => ({ supportsTools: true, toolSupportMode: 'native_tools' }),
    helpers: {
      isAbortError: () => false,
    },
  })

  assert.equal(outcome.isError, false)
  const payload = JSON.parse(outcome.result)
  assert.equal(payload.roles[0].key, 'security_reviewer')
  assert.equal(payload.roles[0].status, 'ready')
  assert.equal(outcome.result.includes('SECRET'), false)
})
