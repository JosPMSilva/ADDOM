import test from 'node:test'
import assert from 'node:assert/strict'

import { createCursorAgentChatExecutor } from '../../src/main/cursor-agent/cursor-agent-chat-execution.mjs'

function readyAccountState(commandPath = 'C:\\runtime\\cursor-agent.cmd') {
  return {
    runtime: { status: 'runtime_ready', commandPath },
    account: { status: 'authenticated', accountLabel: 'Cursor user' },
  }
}

function baseInput(overrides = {}) {
  return {
    mode: 'execute',
    permissionMode: 'full_access',
    projectId: 'project-1',
    threadId: 'thread-1',
    activeProjectPath: 'C:\\repo',
    requestedProjectPath: 'C:\\repo',
    prompt: 'Fix the test',
    model: 'composer-2.5',
    loop: { abortController: new AbortController(), cancelled: false },
    send: () => {},
    persistTimelineEvent: () => {},
    sendTurnState: () => {},
    sendCancelled: () => {},
    ...overrides,
  }
}

test('Cursor chat execution enforces Execute, Full Access, and an authoritative workspace before spawn', async () => {
  let starts = 0
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: { getState: async () => readyAccountState() },
    processRunner: { start: () => { starts += 1 } },
  })

  await assert.rejects(() => execute(baseInput({ mode: 'plan' })), /execute mode/i)
  await assert.rejects(() => execute(baseInput({ permissionMode: 'ask' })), /full access/i)
  await assert.rejects(() => execute(baseInput({ activeProjectPath: '' })), /active project/i)
  await assert.rejects(() => execute(baseInput({ requestedProjectPath: 'C:\\other' })), /active project/i)
  assert.equal(starts, 0)
})

test('Cursor chat execution streams a successful run and persists its exact thread session', async () => {
  const sent = []
  const states = []
  const sessionWrites = []
  const starts = []
  const processRunner = {
    start(options) {
      starts.push(options)
      const completed = (async () => {
        options.onEvent({ kind: 'init', sessionId: 'session-new', cwd: 'C:\\repo', model: 'Composer 2.5' })
        options.onEvent({ kind: 'assistant_delta', text: 'Done.' })
        options.onEvent({ kind: 'result', sessionId: 'session-new', status: 'success', result: 'Done.' })
        return { status: 'completed', code: 0, events: [], stderr: '', error: null }
      })()
      return { completed, cancel: async () => true }
    },
  }
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: { getState: async () => readyAccountState() },
    processRunner,
    touchUsage: () => {},
    sessionRegistry: {
      get: () => null,
      set: (value) => sessionWrites.push(value),
      deleteThread: () => 0,
    },
  })

  const result = await execute(baseInput({
    send: (channel, payload) => sent.push({ channel, payload }),
    sendTurnState: (state, payload) => states.push({ state, payload }),
  }))

  assert.equal(result.status, 'completed')
  assert.equal(starts[0].cwd, 'C:\\repo')
  assert.equal(starts[0].sessionId, '')
  assert.equal(sessionWrites[0].sessionId, 'session-new')
  assert.equal(sent.some((entry) => entry.channel === 'chat:done'), true)
  assert.deepEqual(states.map((entry) => entry.state), ['started', 'completed'])
})

test('Cursor chat execution accepts Grok 4.5 High Fast and passes that model to the CLI', async () => {
  const starts = []
  const states = []
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: { getState: async () => readyAccountState() },
    processRunner: {
      start(options) {
        starts.push(options)
        return {
          completed: (async () => {
            options.onEvent({
              kind: 'init',
              sessionId: 'session-grok',
              cwd: 'C:\\repo',
              model: 'Grok 4.5 High Fast',
            })
            options.onEvent({ kind: 'assistant_delta', text: 'Done.' })
            options.onEvent({
              kind: 'result',
              sessionId: 'session-grok',
              status: 'success',
              result: 'Done.',
            })
            return { status: 'completed', code: 0, events: [], stderr: '', error: null }
          })(),
          cancel: async () => true,
        }
      },
    },
    touchUsage: () => {},
    sessionRegistry: { get: () => null, set: () => {}, deleteThread: () => 0 },
  })

  const result = await execute(baseInput({
    model: 'cursor-grok-4.5-high-fast',
    sendTurnState: (state, payload) => states.push({ state, payload }),
  }))

  assert.equal(result.status, 'completed')
  assert.equal(starts[0].model, 'cursor-grok-4.5-high-fast')
  assert.equal(states[0].payload.model, 'cursor-grok-4.5-high-fast')
  assert.equal(states[1].payload.model, 'cursor-grok-4.5-high-fast')
})

test('Cursor chat execution rejects unsupported Cursor models', async () => {
  let starts = 0
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: { getState: async () => readyAccountState() },
    processRunner: { start: () => { starts += 1 } },
  })

  await assert.rejects(
    () => execute(baseInput({ model: 'gpt-5.4' })),
    /unsupported cursor model/i,
  )
  assert.equal(starts, 0)
})

test('Cursor chat execution returns normalized mutation results from the mapper', async () => {
  const recorded = []
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: { getState: async () => readyAccountState() },
    recordFileChange: (change) => {
      recorded.push(change)
      return { newRevId: 'revision-1', prevRevId: '', rev: 1 }
    },
    processRunner: {
      start(options) {
        return {
          completed: (async () => {
            options.onEvent({ kind: 'init', sessionId: 'session-new', cwd: 'C:\\repo', model: 'Composer 2.5' })
            options.onEvent({
              kind: 'tool_completed',
              callId: 'write-1',
              toolCall: { writeToolCall: {
                args: { path: 'src/new.js', fileText: 'created\n' },
                result: { success: { path: 'C:\\repo\\src\\new.js' } },
              } },
            })
            options.onEvent({ kind: 'result', sessionId: 'session-new', status: 'success', result: 'Created it.' })
            return { status: 'completed', code: 0, events: [], stderr: '', error: null }
          })(),
          cancel: async () => true,
        }
      },
    },
    touchUsage: () => {},
    sessionRegistry: { get: () => null, set: () => {}, deleteThread: () => 0 },
  })

  const result = await execute(baseInput())

  assert.equal(recorded.length, 1)
  assert.equal(result.toolResults.length, 1)
  assert.equal(result.toolResults[0].fileChange.newRevId, 'revision-1')
})

test('Cursor chat execution retries once without a stale persisted session', async () => {
  const starts = []
  let removed = 0
  const processRunner = {
    start(options) {
      starts.push(options)
      if (starts.length === 1) {
        return {
          completed: Promise.resolve({ status: 'failed', code: 1, events: [], stderr: 'Session not found', error: null }),
          cancel: async () => true,
        }
      }
      return {
        completed: (async () => {
          options.onEvent({ kind: 'init', sessionId: 'replacement', cwd: 'C:\\repo', model: 'Composer 2.5' })
          options.onEvent({ kind: 'result', sessionId: 'replacement', status: 'success', result: 'Recovered.' })
          return { status: 'completed', code: 0, events: [], stderr: '', error: null }
        })(),
        cancel: async () => true,
      }
    },
  }
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: { getState: async () => readyAccountState() },
    processRunner,
    touchUsage: () => {},
    sessionRegistry: {
      get: () => ({ sessionId: 'stale-session' }),
      set: () => {},
      deleteThread: () => { removed += 1 },
    },
  })

  const result = await execute(baseInput())

  assert.equal(result.status, 'completed')
  assert.deepEqual(starts.map((row) => row.sessionId), ['stale-session', ''])
  assert.equal(removed, 1)
})
