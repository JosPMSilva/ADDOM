import test from 'node:test'
import assert from 'node:assert/strict'

import { createChatRunRegistry } from '../../src/main/chat/chat-run-registry.mjs'
import { createLoopState } from '../../src/main/chat/chat-turn-state.mjs'
import {
  buildThreadSelectionState,
  createEmptyThreadSession,
  updateThreadSessionState,
} from '../../src/renderer/store/chat/thread-session-store-utils.mjs'

function createRun({ projectId, threadId, turnId, providerId, model }) {
  return createLoopState({
    activeProjectId: projectId,
    activeThreadId: threadId,
    activeTurnId: turnId,
    windowId: '1',
    loopKey: `1:${threadId}`,
    providerId,
    model,
    permissionMode: 'ask',
    abortController: new AbortController(),
  })
}

function applyOwnedPatch(state, threadId, patch) {
  return {
    ...state,
    ...updateThreadSessionState(state, threadId, (session) => ({
      ...session,
      ...patch(session),
    })),
  }
}

test('interleaved cross-project work keeps state ownership and targeted cancellation independent', async () => {
  const sessionA = createEmptyThreadSession({
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })
  const sessionB = createEmptyThreadSession({
    selectedProvider: 'anthropic',
    selectedModel: 'claude-sonnet-4-6',
  })
  let state = {
    activeThreadId: 'thread-a',
    threadStateById: { 'thread-a': sessionA, 'thread-b': sessionB },
    ...sessionA,
  }

  const registry = createChatRunRegistry({ settleTimeoutMs: 100 })
  const runA = createRun({
    projectId: 'project-a',
    threadId: 'thread-a',
    turnId: 'turn-a',
    providerId: 'openai',
    model: 'gpt-5.4',
  })
  const runB = createRun({
    projectId: 'project-b',
    threadId: 'thread-b',
    turnId: 'turn-b',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
  })
  registry.register(runA)
  registry.register(runB)

  state = applyOwnedPatch(state, 'thread-a', (session) => ({
    streamingId: 'assistant-a',
    messages: [...session.messages, { id: 'assistant-a', role: 'assistant', content: 'A partial' }],
    toolActivity: [...session.toolActivity, { id: 'approval-a', status: 'awaiting_approval' }],
  }))
  state = applyOwnedPatch(state, 'thread-b', (session) => ({
    streamingId: 'assistant-b',
    messages: [...session.messages, { id: 'assistant-b', role: 'assistant', content: 'B partial' }],
    pendingQuestionUser: { requestId: 'question-b', question: 'Choose a target.' },
    terminalDock: { ...session.terminalDock, collapsed: false, selectedTabId: 'terminal-b' },
  }))
  state = applyOwnedPatch(state, 'thread-a', (session) => ({
    writeConflicts: [...session.writeConflicts, { id: 'conflict-a', filePath: 'src/a.js' }],
  }))
  state = applyOwnedPatch(state, 'thread-b', (session) => ({
    timeline: [...session.timeline, { id: 'tool-b', kind: 'tool_result', status: 'completed' }],
  }))

  state = { ...state, ...buildThreadSelectionState(state, 'thread-b') }
  assert.equal(state.selectedProvider, 'anthropic')
  assert.equal(state.selectedModel, 'claude-sonnet-4-6')
  assert.equal(state.pendingQuestionUser.requestId, 'question-b')
  assert.equal(state.terminalDock.selectedTabId, 'terminal-b')
  assert.equal(state.threadStateById['thread-a'].selectedProvider, 'openai')
  assert.equal(state.threadStateById['thread-a'].selectedModel, 'gpt-5.4')
  assert.equal(state.threadStateById['thread-a'].toolActivity[0].id, 'approval-a')
  assert.equal(state.threadStateById['thread-a'].writeConflicts[0].filePath, 'src/a.js')

  const cancellation = registry.cancelAndWait({
    projectId: 'project-b',
    threadId: 'thread-b',
  })
  assert.equal(runA.abortController.signal.aborted, false)
  assert.equal(runB.abortController.signal.aborted, true)
  registry.settle(runB.loopKey, runB)
  const result = await cancellation

  assert.equal(result.ok, true)
  assert.deepEqual(registry.list().map((run) => ({
    projectId: run.projectId,
    threadId: run.threadId,
    providerId: run.providerId,
    model: run.model,
  })), [{
    projectId: 'project-a',
    threadId: 'thread-a',
    providerId: 'openai',
    model: 'gpt-5.4',
  }])
  assert.equal(state.threadStateById['thread-a'].messages[0].content, 'A partial')
  assert.equal(state.messages[0].content, 'B partial')
})
