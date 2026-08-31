import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-inline-account-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  createOpenAIAccountInlineCompletion,
  __resetOpenAIAccountRuntimeServiceGetterForTests,
  __resetOpenAIAccountRuntimeThreadStateGetterForTests,
  __setOpenAIAccountRuntimeServiceGetterForTests,
  __setOpenAIAccountRuntimeThreadStateGetterForTests,
} = await import('../../src/main/api-clients/ai-provider-openai-account.mjs')

class FakeInlineAccountBridge extends EventEmitter {
  constructor() {
    super()
    this.startThreadCalls = []
    this.startTurnCalls = []
    this.turnId = 'turn_inline_1'
    this.threadId = 'thr_inline_1'
  }

  async startThread(params = {}) {
    this.startThreadCalls.push(params)
    return { thread: { id: this.threadId } }
  }

  async startTurn(params = {}) {
    this.startTurnCalls.push(params)
    queueMicrotask(() => {
      this.emit('notification', {
        method: 'item/completed',
        params: {
          threadId: params.threadId,
          turnId: this.turnId,
          item: {
            type: 'agentMessage',
            text: '  result = value + 1',
          },
        },
      })
      this.emit('notification', {
        method: 'turn/completed',
        params: {
          threadId: params.threadId,
          turn: {
            id: this.turnId,
            status: 'completed',
            error: null,
          },
        },
      })
    })
    return {
      turn: {
        id: this.turnId,
        status: 'inProgress',
        items: [],
        error: null,
      },
    }
  }
}

test.beforeEach(() => {
  __resetOpenAIAccountRuntimeServiceGetterForTests()
  __resetOpenAIAccountRuntimeThreadStateGetterForTests()
})

test.after(() => {
  __resetOpenAIAccountRuntimeServiceGetterForTests()
  __resetOpenAIAccountRuntimeThreadStateGetterForTests()
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('editor completion routes OpenAI account auth through the account inline runtime path', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/main/ipc-handlers/editor-completion.mjs'),
    'utf8',
  )
  assert.match(source, /createOpenAIAccountInlineCompletion/)
  assert.match(source, /resolveOpenAIExecutionAuth\(\{ allowAccountRuntime: true \}\)/)
  assert.match(source, /usesOpenAIAccountRuntime/)
})

test('OpenAI account inline completion uses the bridge-backed account runtime', async () => {
  const bridge = new FakeInlineAccountBridge()
  __setOpenAIAccountRuntimeThreadStateGetterForTests(() => null)
  __setOpenAIAccountRuntimeServiceGetterForTests(() => ({
    getState() {
      return {
        sessionSummary: {
          hasSession: true,
          status: 'connected',
          availability: {
            supported: true,
            reason: '',
            message: '',
          },
        },
        activeLogin: null,
        storage: {
          availability: {
            supported: true,
            reason: '',
            message: '',
          },
        },
      }
    },
    getBridge() {
      return bridge
    },
  }))

  const result = await createOpenAIAccountInlineCompletion({
    messages: [
      {
        role: 'system',
        content: 'Return only the exact text to insert at the cursor.',
      },
      {
        role: 'user',
        content: [
          'File: C:\\repo\\math.js',
          'Language: javascript',
          'Cursor: line 2, column 1',
          '',
          '<before_cursor>',
          'const value = 1',
          '</before_cursor>',
          '<after_cursor>',
          'return value',
          '</after_cursor>',
        ].join('\n'),
      },
    ],
    options: {
      model: 'gpt-5.4',
    },
  })

  assert.equal(result.providerId, 'openai')
  assert.equal(result.model, 'gpt-5.4')
  assert.equal(result.text, '  result = value + 1')
  assert.equal(bridge.startThreadCalls.length, 1)
  assert.equal(bridge.startTurnCalls.length, 1)
  assert.match(String(bridge.startTurnCalls[0]?.input?.[0]?.text || ''), /before_cursor/i)
})

