import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  createInterruptedTurnContinuation,
} from '../../src/renderer/components/chat/interrupted-turn-action.mjs'

test('interrupted continuation targets its owning thread and requests focus', () => {
  assert.deepEqual(createInterruptedTurnContinuation({
    threadId: ' thread-1 ',
    providerId: 'openai',
    model: 'gpt-5.4',
  }), {
    threadId: 'thread-1',
    text: 'Continue from the saved context.',
    focusComposer: true,
  })
  assert.equal(createInterruptedTurnContinuation({ threadId: '' }), null)
})

test('ChatPanel queues a targeted replacement draft without submitting it', () => {
  const source = fs.readFileSync('src/renderer/components/ChatPanel.jsx', 'utf8')
  const controllerSource = fs.readFileSync(
    'src/renderer/components/chat/use-interrupted-turn-continuation.js',
    'utf8',
  )
  assert.match(controllerSource, /createInterruptedTurnContinuation/)
  assert.match(controllerSource, /queueChatDraftInjection\(\{[\s\S]*threadId:\s*continuation\.threadId[\s\S]*mode:\s*'replace'[\s\S]*focusComposer:\s*continuation\.focusComposer/)
  assert.match(source, /handleContinueInterruptedTurn/)
  assert.doesNotMatch(controllerSource, /handleSend\(/)
})

test('composer draft injection waits for its target thread before consumption', () => {
  const storeSource = fs.readFileSync('src/renderer/store/useAppStore.js', 'utf8')
  const draftSource = fs.readFileSync('src/renderer/components/chat/use-chat-panel-composer-draft-state.mjs', 'utf8')
  assert.match(storeSource, /threadId:\s*String\(payload\.threadId/)
  assert.match(draftSource, /pending\.threadId/)
  assert.match(draftSource, /targetThreadId !== activeThreadId/)
})
