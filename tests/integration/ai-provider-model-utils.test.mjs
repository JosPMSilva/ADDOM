import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canonicalizeRequestedModel,
  inferModelGroup,
  inferReasoning,
} from '../../src/main/api-clients/ai-provider-model-utils.mjs'

test('new curated families retain useful fallback grouping and reasoning signals', () => {
  assert.equal(inferModelGroup('gpt-6-astra'), 'GPT-6')
  assert.equal(inferModelGroup('claude-fable-5-1'), 'Claude 5')
  assert.equal(inferModelGroup('kimi-k3'), 'Kimi K3')
  assert.equal(inferReasoning('openai', 'gpt-6-astra'), true)
  assert.equal(inferReasoning('anthropic', 'claude-fable-5-1'), true)
  assert.equal(inferReasoning('grok', 'grok-4.6'), true)
})

test('request canonicalization migrates refreshed provider aliases before dispatch', () => {
  assert.deepEqual(canonicalizeRequestedModel('anthropic', 'claude-fable-5'), {
    providerId: 'anthropic',
    requestedModelId: 'claude-fable-5',
    effectiveModelId: 'claude-fable-5-1',
    changed: true,
    reason: 'alias',
  })
  assert.deepEqual(canonicalizeRequestedModel('deepseek', 'deepseek-v4-flash'), {
    providerId: 'deepseek',
    requestedModelId: 'deepseek-v4-flash',
    effectiveModelId: 'deepseek-flash',
    changed: true,
    reason: 'alias',
  })
})
