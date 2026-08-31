import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hasExactFileAccessGrantForTurn,
  recordExactFileAccessGrantForTurn,
} from '../../src/main/chat/file-access-turn-state.mjs'

test('external file approval reuse is exact-path and turn scoped', () => {
  const firstPolicy = {
    type: 'file_tool_policy_v1',
    externalPaths: ['C:\\outside\\one.txt'],
  }
  const secondPolicy = {
    type: 'file_tool_policy_v1',
    externalPaths: ['C:\\outside\\two.txt'],
  }
  assert.equal(recordExactFileAccessGrantForTurn({
    threadId: 'thread-1', turnId: 'turn-1', approvalPolicy: firstPolicy,
  }), true)
  assert.equal(hasExactFileAccessGrantForTurn({
    threadId: 'thread-1', turnId: 'turn-1', approvalPolicy: firstPolicy,
  }), true)
  assert.equal(hasExactFileAccessGrantForTurn({
    threadId: 'thread-1', turnId: 'turn-1', approvalPolicy: secondPolicy,
  }), false)
  assert.equal(hasExactFileAccessGrantForTurn({
    threadId: 'thread-1', turnId: 'turn-2', approvalPolicy: firstPolicy,
  }), false)
})
