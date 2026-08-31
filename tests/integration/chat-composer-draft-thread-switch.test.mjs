import test from 'node:test'
import assert from 'node:assert/strict'

import {
  flushComposerDraftBeforeThreadChange,
} from '../../src/renderer/components/chat/use-chat-panel-composer-draft-state.mjs'

test('thread changes flush the owning composer draft before loading the next thread', () => {
  const calls = []
  assert.equal(flushComposerDraftBeforeThreadChange({
    currentThreadId: 'thread-a',
    nextThreadId: 'thread-b',
    clearScheduledDraftPersist: () => calls.push('clear'),
    persistComposerDraftNow: () => calls.push('persist-a'),
  }), true)
  assert.deepEqual(calls, ['clear', 'persist-a'])
})
test('initialization clears stale timers without writing an empty same-thread draft', () => {
  const calls = []
  assert.equal(flushComposerDraftBeforeThreadChange({
    currentThreadId: 'thread-a',
    nextThreadId: 'thread-a',
    clearScheduledDraftPersist: () => calls.push('clear'),
    persistComposerDraftNow: () => calls.push('persist'),
  }), false)
  assert.deepEqual(calls, ['clear'])
})
