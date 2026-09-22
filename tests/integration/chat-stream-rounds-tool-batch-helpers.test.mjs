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

test('mixed batches retain malformed patch failure accounting without extending the all-error streak', () => {
  const loop = {}
  const errorDiagnostics = {}
  const mixedRound = [
    { toolName: 'read_file', decision: 'approved', isError: false, failureClass: '' },
    { toolName: 'apply_patch', decision: 'approved', isError: true, failureClass: 'MALFORMED_PATCH_SYNTAX' },
  ]

  const first = updateToolBatchFailureState({
    roundResults: mixedRound,
    loop,
    consecutiveErrorRounds: 2,
    errorDiagnostics,
  })
  const second = updateToolBatchFailureState({
    roundResults: mixedRound,
    loop,
    consecutiveErrorRounds: first,
    errorDiagnostics,
  })

  assert.equal(first, 0)
  assert.equal(second, 0)
  assert.equal(loop.malformedPatchFailureCount, 2)
  assert.equal(loop.blockedToolNames.has('apply_patch'), true)
  assert.equal(errorDiagnostics.toolWorkflowApplyPatchRetryAllowedCount, 1)
  assert.equal(errorDiagnostics.toolWorkflowApplyPatchHardBlockCount, 1)
})

test('mixed batches block exact-edit retries unless a later successful inspection changes the precondition', () => {
  const mismatch = {
    toolName: 'edit_file',
    decision: 'approved',
    isError: true,
    failureClass: 'EXACT_TEXT_NO_MATCH',
  }
  const unrelatedSuccess = {
    toolName: 'git_status',
    decision: 'approved',
    isError: false,
    failureClass: '',
  }
  const successfulInspection = {
    toolName: 'read_file',
    decision: 'approved',
    isError: false,
    failureClass: '',
  }

  const unrelatedLoop = {}
  updateToolBatchFailureState({
    roundResults: [mismatch, unrelatedSuccess],
    loop: unrelatedLoop,
  })
  assert.equal(unrelatedLoop.blockedToolNames.has('edit_file'), true)

  const recoveredLoop = {}
  updateToolBatchFailureState({
    roundResults: [mismatch, successfulInspection],
    loop: recoveredLoop,
  })
  assert.equal(recoveredLoop.blockedToolNames.has('edit_file'), false)

  const laterFailureLoop = {}
  updateToolBatchFailureState({
    roundResults: [successfulInspection, mismatch],
    loop: laterFailureLoop,
  })
  assert.equal(laterFailureLoop.blockedToolNames.has('edit_file'), true)
})

test('only a successful apply_patch resets malformed patch recovery state', () => {
  const loop = { malformedPatchFailureCount: 1 }
  updateToolBatchFailureState({
    roundResults: [{
      toolName: 'read_file',
      decision: 'approved',
      isError: false,
      failureClass: '',
    }],
    loop,
  })
  assert.equal(loop.malformedPatchFailureCount, 1)

  updateToolBatchFailureState({
    roundResults: [{
      toolName: 'apply_patch',
      decision: 'approved',
      isError: false,
      failureClass: '',
    }],
    loop,
  })
  assert.equal(loop.malformedPatchFailureCount, 0)
})
