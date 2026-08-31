import test from 'node:test'
import assert from 'node:assert/strict'

import { createCursorAgentChatExecutor } from '../../src/main/cursor-agent/cursor-agent-chat-execution.mjs'

test('aborting a Cursor chat run cancels its exact child once and preserves partial output', async () => {
  const abortController = new AbortController()
  const sent = []
  let cancelCount = 0
  let settle
  const completed = new Promise((resolve) => { settle = resolve })
  const processRunner = {
    start(options) {
      queueMicrotask(() => options.onEvent({ kind: 'assistant_delta', text: 'Partial work' }))
      return {
        completed,
        cancel: async () => {
          cancelCount += 1
          settle({ status: 'cancelled', code: null, events: [], stderr: '', error: null })
          return true
        },
      }
    },
  }
  let cancelled = 0
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: {
      getState: async () => ({
        runtime: { status: 'runtime_ready', commandPath: 'cursor-agent.cmd' },
        account: { status: 'authenticated' },
      }),
    },
    processRunner,
    sessionRegistry: { get: () => null, set: () => {}, deleteThread: () => 0 },
  })
  const promise = execute({
    mode: 'execute', permissionMode: 'full_access', model: 'composer-2.5',
    projectId: 'p1', threadId: 't1', activeProjectPath: 'C:\\repo', requestedProjectPath: 'C:\\repo',
    prompt: 'work', loop: { abortController, cancelled: true, cancelReason: 'Stopped.' },
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: () => {}, sendTurnState: () => {},
    sendCancelled: () => { cancelled += 1 },
  })

  await new Promise((resolve) => setImmediate(resolve))
  abortController.abort()
  const result = await promise

  assert.equal(result.status, 'cancelled')
  assert.equal(cancelCount, 1)
  assert.equal(cancelled, 1)
  assert.equal(sent.find((entry) => entry.channel === 'chat:chunk')?.payload.chunk, 'Partial work')
  assert.equal(sent.some((entry) => entry.channel === 'chat:done'), false)
})
