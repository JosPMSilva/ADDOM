import test from 'node:test'
import assert from 'node:assert/strict'

import { __resetCreateStreamWithToolsForTests, __setCreateStreamWithToolsForTests } from '../../src/main/api-clients/ai-provider.mjs'
import { createProviderStreamStaleError } from '../../src/main/api-clients/provider-policy.mjs'
import { runSingleAgent } from '../../src/main/moa/agent-runtime.mjs'

test.afterEach(() => {
  __resetCreateStreamWithToolsForTests()
})

test('runSingleAgent returns stale when provider stream goes silent', async () => {
  __setCreateStreamWithToolsForTests(async () => {
    throw createProviderStreamStaleError({
      providerId: 'openai',
      timeoutMs: 30_000,
    })
  })

  const result = await runSingleAgent(
    {
      task_id: 'task_1',
      instruction: 'Inspect the auth flow.',
      injected_context: 'src/auth/session.ts',
      expected_output_format: 'summary',
    },
    {
      id: 'role_1',
      name: 'Security Reviewer',
      providerId: 'openai',
      model: 'gpt-5',
      systemPrompt: 'Review security.',
    },
    'sk-test',
    'C:/Users/example/Documents/ADDOM',
    () => {},
    new AbortController().signal,
    {
      policy: {
        maxAgentRounds: 1,
        maxAgentOutputChars: 10_000,
        agentStreamIdleTimeoutMs: 30_000,
        localAgentStreamIdleTimeoutMs: 90_000,
      },
      providerRuntimeSettings: {},
    },
  )

  assert.equal(result.status, 'stale')
  assert.match(String(result.error || ''), /stale/i)
})
