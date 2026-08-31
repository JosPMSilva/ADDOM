import test from 'node:test'
import assert from 'node:assert/strict'

import { createCursorAgentChatExecutor } from '../../src/main/cursor-agent/cursor-agent-chat-execution.mjs'

test('parallel Cursor threads keep workspace, session, output, and cancellation isolated', async () => {
  const starts = []
  const cancelledCwds = []
  const sessions = []
  const processRunner = {
    start(options) {
      starts.push({ cwd: options.cwd, sessionId: options.sessionId })
      let settle
      const completed = new Promise((resolve) => { settle = resolve })
      const finish = () => {
        options.onEvent({ kind: 'init', sessionId: `session:${options.cwd}`, cwd: options.cwd, model: 'Composer 2.5' })
        options.onEvent({ kind: 'result', sessionId: `session:${options.cwd}`, status: 'success', result: `done:${options.cwd}` })
        settle({ status: 'completed', code: 0, events: [], stderr: '', error: null })
      }
      if (options.cwd.endsWith('two')) setImmediate(finish)
      return {
        completed,
        cancel: async () => {
          cancelledCwds.push(options.cwd)
          settle({ status: 'cancelled', code: null, events: [], stderr: '', error: null })
          return true
        },
      }
    },
  }
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: {
      getState: async () => ({
        runtime: { status: 'runtime_ready', commandPath: 'cursor-agent.cmd' },
        account: { status: 'authenticated' },
      }),
    },
    processRunner,
    sessionRegistry: {
      get: () => null,
      set: (value) => sessions.push(value),
      deleteThread: () => 0,
    },
    touchUsage: () => {},
  })
  const firstAbort = new AbortController()
  const secondAbort = new AbortController()
  const input = (suffix, abortController) => ({
    mode: 'execute', permissionMode: 'full_access', model: 'composer-2.5',
    projectId: `p-${suffix}`, threadId: `t-${suffix}`,
    activeProjectPath: `C:\\${suffix}`, requestedProjectPath: `C:\\${suffix}`,
    prompt: `work ${suffix}`, loop: { abortController, cancelled: false, cancelReason: 'Stopped.' },
    send: () => {}, persistTimelineEvent: () => {}, sendTurnState: () => {}, sendCancelled: () => {},
  })

  const firstInput = input('one', firstAbort)
  const first = execute(firstInput)
  const second = execute(input('two', secondAbort))
  await new Promise((resolve) => setImmediate(resolve))
  firstInput.loop.cancelled = true
  firstAbort.abort()
  const [firstResult, secondResult] = await Promise.all([first, second])

  assert.equal(firstResult.status, 'cancelled')
  assert.equal(secondResult.status, 'completed')
  assert.deepEqual(cancelledCwds, ['C:\\one'])
  assert.deepEqual(starts.map((row) => row.cwd).sort(), ['C:\\one', 'C:\\two'])
  assert.deepEqual(sessions.map((row) => row.threadId), ['t-two'])
})
