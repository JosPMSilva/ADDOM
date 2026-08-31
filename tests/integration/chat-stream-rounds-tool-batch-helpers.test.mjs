import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDeniedToolCallResult,
  updateToolBatchFailureState,
} from '../../src/main/chat/chat-stream-rounds-tool-batch-helpers.mjs'

test('user-denied approvals stay non-fatal', () => {
  const denied = buildDeniedToolCallResult({
    toolName: 'git_status',
    denyReason: 'user_denied',
  })

  assert.equal(denied.isError, false)
  assert.equal(denied.result, 'Tool call denied by user: git_status')
})

test('user-denied rounds do not count as consecutive error rounds', () => {
  const history = []
  const loop = {}

  const nextRounds = updateToolBatchFailureState({
    roundResults: [{
      decision: 'denied',
      isError: false,
      toolName: 'git_status',
    }],
    loop,
    consecutiveErrorRounds: 0,
    maxConsecutiveErrorRounds: 3,
    history,
    buildToolRecoveryPrompt: () => 'retry',
  })

  assert.equal(nextRounds, 0)
  assert.deepEqual(history, [])
})

test('policy-denied rounds still count as tool-error rounds', () => {
  const history = []
  const loop = {}

  const nextRounds = updateToolBatchFailureState({
    roundResults: [{
      decision: 'denied',
      isError: true,
      failureClass: 'PERMISSION_DENIED',
      toolName: 'git_checkout_file',
    }],
    loop,
    consecutiveErrorRounds: 0,
    maxConsecutiveErrorRounds: 3,
    history,
    buildToolRecoveryPrompt: () => 'retry',
  })

  assert.equal(nextRounds, 1)
  assert.equal(history.length, 1)
})
