import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hasExplicitDelegationRequest,
  hasVisibleDelegationTool,
  hasVisibleRawDelegationTool,
  isDelegationToolName,
} from '../../src/main/chat/delegation-tool-surface.mjs'

test('delegate_tasks is model-facing while the canonical executor name remains recognizable internally', () => {
  assert.equal(isDelegationToolName('delegate_tasks'), true)
  assert.equal(isDelegationToolName('delegate_to_agents'), true)
  assert.equal(hasVisibleDelegationTool({ delegate_tasks: {} }), true)
  assert.equal(hasVisibleRawDelegationTool({ delegate_tasks: {} }), false)
})

test('explicit delegation intent survives terse retry turns without a raw-schema wording gate', () => {
  assert.equal(hasExplicitDelegationRequest({
    userMessage: 'retry',
    history: [{ role: 'user', content: 'Run all configured agents in parallel.' }],
  }), true)
  assert.equal(hasExplicitDelegationRequest({ userMessage: 'Continue with the implementation.' }), false)
})
