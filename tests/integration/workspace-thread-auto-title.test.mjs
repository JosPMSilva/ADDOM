import test from 'node:test'
import assert from 'node:assert/strict'

import { deriveThreadTitleFromPrompt } from '../../src/main/workspace/thread-auto-title.mjs'
import { executeSendMessage } from '../../src/renderer/components/chat/chat-panel-helpers.mjs'

test('derives a concise thread title from the beginning of a meaningful first prompt', () => {
  assert.equal(
    deriveThreadTitleFromPrompt('Please inspect hardware_info.py and create a focused plan for reliability improvements.'),
    'Inspect hardware_info.py and create a focused plan for reliability improvements.',
  )
})

test('keeps titles bounded at a word boundary instead of storing a full long prompt', () => {
  const title = deriveThreadTitleFromPrompt(
    'Investigate the renderer state synchronization issue that causes long document annotations to disappear after navigation and propose the smallest safe fix without changing existing behavior.',
  )

  assert.equal(title.endsWith('…'), true)
  assert.equal(title.length <= 80, true)
  assert.match(title, /^Investigate the renderer state synchronization issue/)
})

test('leaves generic greetings and slash commands as the default thread title', () => {
  assert.equal(deriveThreadTitleFromPrompt('hello!'), '')
  assert.equal(deriveThreadTitleFromPrompt('/compact'), '')
})

test('queues an auto-title update only for visible user prompts', async () => {
  let captured = null
  const sent = executeSendMessage({
    rawContent: 'Please inspect the renderer state.',
    selectedProvider: 'openai',
    activeThreadId: 'thread_1',
    activeProjectId: 'project_1',
    addUserMessage: () => 'turn_1',
    addAssistantPlaceholder: () => 'assistant_1',
    chatStream: () => {},
    autoTitleThread: async (payload) => { captured = payload },
  })

  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(sent, true)
  assert.deepEqual(captured, {
    projectId: 'project_1',
    threadId: 'thread_1',
    prompt: 'Please inspect the renderer state.',
  })
})
