import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import { ASSISTANT_PHASE_COMMENTARY } from '../../src/common/chat/assistant-phase.mjs'
import { clearRiskyActionSessionState } from '../../src/main/chat/risky-action-session-state.mjs'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-account-runtime-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  createOpenAIAccountStreamPayload,
  startOpenAIAccountBackgroundOperation,
  getOpenAIAccountPendingQuestionUserRequest,
  respondToOpenAIAccountQuestionUserRequest,
  __resetOpenAIAccountPendingQuestionUserRequestsForTests,
  __resetOpenAIAccountRuntimeServiceGetterForTests,
  __resetOpenAIAccountRuntimeThreadStateGetterForTests,
  __setOpenAIAccountRuntimeServiceGetterForTests,
  __setOpenAIAccountRuntimeThreadStateGetterForTests,
} = await import('../../src/main/api-clients/ai-provider-openai-account.mjs')
const {
  respondToOpenAIAccountPendingMcpElicitation,
  __resetOpenAIAccountPendingMcpElicitationsForTests,
} = await import('../../src/main/api-clients/ai-provider-openai-account-elicitation-pending.mjs')

function signatureFor(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function buildDynamicToolSignature(tools = []) {
  return signatureFor(JSON.stringify(tools))
}

function buildModeSignature({
  delegationBackend = 'none',
  collaborationModeId = '',
  permissionMode = 'ask',
} = {}) {
  return signatureFor(JSON.stringify({
    delegationBackend,
    collaborationModeId,
    permissionMode,
  }))
}

function buildModelSignature(model = '') {
  return signatureFor(String(model || '').trim())
}

class FakeBridge extends EventEmitter {
  constructor({
    startThreadId = 'thr_account_1',
    turnId = 'turn_account_1',
    onStartTurn = null,
    onResumeThread = null,
    onRespond = null,
    runtimeIdentity = null,
  } = {}) {
    super()
    this.startThreadId = startThreadId
    this.turnId = turnId
    this.onStartTurn = onStartTurn
    this.onResumeThread = onResumeThread
    this.onRespond = onRespond
    this.runtimeIdentity = runtimeIdentity
    this.startThreadCalls = []
    this.resumeThreadCalls = []
    this.startTurnCalls = []
    this.interruptTurnCalls = []
    this.responses = []
  }

  async startThread(params = {}) {
    this.startThreadCalls.push(params)
    return { thread: { id: this.startThreadId } }
  }

  async resumeThread(params = {}) {
    this.resumeThreadCalls.push(params)
    if (typeof this.onResumeThread === 'function') {
      return this.onResumeThread(params)
    }
    return { thread: { id: params.threadId || this.startThreadId } }
  }

  async startTurn(params = {}) {
    this.startTurnCalls.push(params)
    if (typeof this.onStartTurn === 'function') {
      this.onStartTurn(params, this)
    }
    return {
      turn: {
        id: this.turnId,
        status: 'inProgress',
        items: [],
        error: null,
      },
    }
  }

  async listCollaborationModes() {
    return []
  }

  async interruptTurn(threadId = '', turnId = '') {
    this.interruptTurnCalls.push({ threadId, turnId })
    return {}
  }

  async respond(id = 0, result = null, error = null) {
    this.responses.push({
      id,
      result,
      ...(error ? { error } : {}),
    })
    if (typeof this.onRespond === 'function') {
      this.onRespond({ id, result, error }, this)
    }
    return {}
  }

  getRuntimeIdentity() {
    return this.runtimeIdentity ? { ...this.runtimeIdentity } : null
  }
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve))
}

function installServiceWithBridge(bridge, {
  refreshState = async () => ({}),
} = {}) {
  __setOpenAIAccountRuntimeThreadStateGetterForTests(() => null)
  __setOpenAIAccountRuntimeServiceGetterForTests(() => ({
    getState() {
      return {
        sessionSummary: {
          hasSession: true,
          status: 'connected',
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
    refreshState,
  }))
}

test.beforeEach(() => {
  __resetOpenAIAccountRuntimeServiceGetterForTests()
  __resetOpenAIAccountRuntimeThreadStateGetterForTests()
  __resetOpenAIAccountPendingQuestionUserRequestsForTests()
  __resetOpenAIAccountPendingMcpElicitationsForTests()
})

test.after(() => {
  __resetOpenAIAccountRuntimeServiceGetterForTests()
  __resetOpenAIAccountRuntimeThreadStateGetterForTests()
  __resetOpenAIAccountPendingQuestionUserRequestsForTests()
  __resetOpenAIAccountPendingMcpElicitationsForTests()
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('OpenAI account runtime uses a 10 minute default idle timeout for provider-owned Codex sessions', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/main/api-clients/ai-provider-openai-account.mjs'),
    'utf8',
  )
  assert.match(source, /const DEFAULT_OPENAI_ACCOUNT_STREAM_IDLE_TIMEOUT_MS = 600_000/)
  assert.match(source, /DEFAULT_OPENAI_ACCOUNT_STREAM_IDLE_TIMEOUT_MS/)
})

test('openai adapter routes account auth to the bridge-backed runtime and the runtime streams agent output', async () => {
  const adapterSource = fs.readFileSync(
    path.join(process.cwd(), 'src/main/api-clients/ai-provider-openai.mjs'),
    'utf8',
  )
  assert.match(adapterSource, /createOpenAIAccountStreamPayload/)
  assert.match(adapterSource, /authMethod[\s\S]*account/)
  assert.match(adapterSource, /onProviderWarning:\s*args\?\.options\?\.onProviderWarning/)

  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: { threadId: params.threadId, turnId: target.turnId, delta: 'Hello ' },
        })
        target.emit('notification', {
          method: 'item/reasoning/delta',
          params: { threadId: params.threadId, turnId: target.turnId, delta: 'Reasoning chunk.' },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Hello world.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const chunks = []
  const reasoningChunks = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Say hello.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountAttachmentMirrorRoot: 'C:/Users/example/AppData/Local/ADDOM/attachment-agent-mirrors/thread/files',
      providerRuntimeSettings: {
        reasoningEffort: 'xhigh',
      },
      requestContext: {
        projectFolder: 'C:/Users/example/Desktop/test/P21',
        threadId: 'thread_account_1',
        processingMode: 'fast',
      },
    },
    onChunk: (chunk) => chunks.push(chunk),
    onReasoning: (chunk) => reasoningChunks.push(chunk),
  })

  assert.equal(bridge.startThreadCalls.length, 1)
  assert.equal(bridge.startTurnCalls.length, 1)
  assert.equal(bridge.startThreadCalls[0].cwd, path.resolve('C:/Users/example/Desktop/test/P21'))
  assert.equal(bridge.startThreadCalls[0].approvalPolicy, 'on-request')
  assert.equal(bridge.startThreadCalls[0].permissions, ':workspace')
  assert.equal('sandbox' in bridge.startThreadCalls[0], false)
  assert.equal(bridge.startTurnCalls[0].approvalPolicy, 'on-request')
  assert.equal(bridge.startTurnCalls[0].effort, 'xhigh')
  assert.equal(bridge.startTurnCalls[0].serviceTier, 'fast')
  assert.equal(bridge.startTurnCalls[0].permissions, ':workspace')
  assert.equal('sandboxPolicy' in bridge.startTurnCalls[0], false)
  assert.match(bridge.startTurnCalls[0].input[0].text, /Conversation transcript:/)
  assert.deepEqual(chunks, [
    { chunk: 'Hello ', phase: ASSISTANT_PHASE_COMMENTARY },
    { chunk: 'world.', phase: ASSISTANT_PHASE_COMMENTARY },
  ])
  assert.equal(reasoningChunks.join(''), 'Reasoning chunk.')
  assert.equal(payload.text, 'Hello world.')
  assert.equal(payload.reasoning, 'Reasoning chunk.')
  assert.equal(payload.providerResponseMeta?.transportMode, 'codex_app_server_chatgpt')
  assert.equal(payload.providerResponseMeta?.accountBridgeThreadId, 'thr_account_1')
  assert.equal(payload.providerResponseMeta?.accountBridgeProjectFolder, path.resolve('C:/Users/example/Desktop/test/P21'))
})

test('openai account runtime bridges tool/requestUserInput into pending question_user state and responds through the bridge', async () => {
  const requested = []
  const resolved = []
  const bridge = new FakeBridge({
    turnId: 'turn_account_question_user',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 77,
          method: 'item/tool/requestUserInput',
          params: {
            requestId: 'req_question_user_1',
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'item_question_user_1',
            header: 'Clarification needed',
            question: 'Which path should I edit?',
            options: [
              {
                id: 'opt_src',
                label: 'src/main',
                description: 'Update the main implementation.',
                recommended: true,
              },
              {
                id: 'opt_renderer',
                label: 'src/renderer',
                description: 'Only touch renderer code.',
              },
            ],
          },
        })
      })
    },
    onRespond({ id }, target) {
      if (id !== 77) return
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'serverRequest/resolved',
          params: {
            threadId: target.startThreadId,
            requestId: 'req_question_user_1',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: target.startThreadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Thanks, continuing with src/main.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: target.startThreadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payloadPromise = createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Continue after clarifying the file path.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_question_user',
      },
      openAIAccountQuestionUserBridgeContext: {
        onQuestionUserRequest: (questionUser) => requested.push(questionUser),
        onQuestionUserResolved: (payload) => resolved.push(payload),
      },
    },
  })

  await flushMicrotasks()

  const pending = getOpenAIAccountPendingQuestionUserRequest({
    threadId: 'thr_account_1',
    requestId: 'req_question_user_1',
  })
  const pendingByAppThread = getOpenAIAccountPendingQuestionUserRequest({
    threadId: 'thread_account_question_user',
  })
  assert.ok(pending)
  assert.ok(pendingByAppThread)
  assert.equal(pending.source, 'openai_account_bridge')
  assert.equal(pending.answerMode, 'bridge_response')
  assert.equal(pending.threadId, 'thr_account_1')
  assert.equal(pending.turnId, 'turn_account_question_user')
  assert.equal(pending.requestId, 'req_question_user_1')
  assert.equal(pending.itemId, 'item_question_user_1')
  assert.equal(pending.options[0]?.id, 'opt_src')
  assert.equal(pendingByAppThread.requestId, 'req_question_user_1')
  assert.equal(pendingByAppThread.threadId, 'thr_account_1')
  assert.equal(requested.length, 1)
  assert.equal(requested[0]?.requestId, 'req_question_user_1')

  const response = await respondToOpenAIAccountQuestionUserRequest({
    threadId: 'thr_account_1',
    requestId: 'req_question_user_1',
    answer: 'src/main',
    selectedOptionId: 'opt_src',
  })
  assert.equal(response.ok, true)
  assert.deepEqual(bridge.responses, [{
    id: 77,
    result: {
      text: 'src/main',
      selectedOptionId: 'opt_src',
    },
  }])

  const payload = await payloadPromise
  assert.equal(payload.text, 'Thanks, continuing with src/main.')
  assert.equal(getOpenAIAccountPendingQuestionUserRequest({
    threadId: 'thr_account_1',
    requestId: 'req_question_user_1',
  }), null)
  assert.deepEqual(resolved, [{
    threadId: 'thr_account_1',
    turnId: 'turn_account_question_user',
    requestId: 'req_question_user_1',
    itemId: 'item_question_user_1',
    reason: 'server_request_resolved',
  }])
})

test('openai account runtime clears stale tool/requestUserInput requests and rejects later responses', async () => {
  const resolved = []
  const bridge = new FakeBridge({
    turnId: 'turn_account_question_user_stale',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 88,
          method: 'item/tool/requestUserInput',
          params: {
            requestId: 'req_question_user_stale',
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'item_question_user_stale',
            question: 'Need one more detail.',
            options: [{ id: 'opt_one', label: 'Use the current thread' }],
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'serverRequest/resolved',
            params: {
              threadId: params.threadId,
              requestId: 'req_question_user_stale',
            },
          })
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payloadPromise = createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Ask then clear the clarification.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_question_user_stale',
      },
      openAIAccountQuestionUserBridgeContext: {
        onQuestionUserResolved: (payload) => resolved.push(payload),
      },
    },
  })

  await flushMicrotasks()
  await payloadPromise

  assert.equal(getOpenAIAccountPendingQuestionUserRequest({
    threadId: 'thr_account_1',
    requestId: 'req_question_user_stale',
  }), null)
  assert.deepEqual(resolved, [{
    threadId: 'thr_account_1',
    turnId: 'turn_account_question_user_stale',
    requestId: 'req_question_user_stale',
    itemId: 'item_question_user_stale',
    reason: 'server_request_resolved',
  }])
  await assert.rejects(
    respondToOpenAIAccountQuestionUserRequest({
      threadId: 'thr_account_1',
      requestId: 'req_question_user_stale',
      answer: 'Use the current thread',
    }),
    /no longer pending/i,
  )
})

test('OpenAI account runtime classifies unphased mid-turn agent text as commentary even when tool activity interleaves', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_mid_turn_commentary',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'message_mid_turn_1',
            delta: 'Inspecting the workspace. ',
          },
        })
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'dyn_mid_turn_1',
              type: 'dynamicToolCall',
              tool: 'read_file',
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'dyn_mid_turn_1',
              type: 'dynamicToolCall',
              tool: 'read_file',
              status: 'completed',
              success: true,
            },
          },
        })
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'message_mid_turn_2',
            delta: 'Now drafting the final answer. ',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'message_mid_turn_2',
              type: 'agentMessage',
              text: 'Inspecting the workspace. Now drafting the final answer. Final answer only.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const chunks = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Inspect then answer.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_mid_turn_commentary',
      },
    },
    onChunk: (chunk) => chunks.push(chunk),
  })

  assert.deepEqual(chunks, [
    { chunk: 'Inspecting the workspace. ', phase: ASSISTANT_PHASE_COMMENTARY },
    { chunk: 'Now drafting the final answer. ', phase: ASSISTANT_PHASE_COMMENTARY, boundaryBefore: true },
    { chunk: 'Final answer only.', phase: ASSISTANT_PHASE_COMMENTARY },
  ])
  assert.equal(payload.text, 'Inspecting the workspace. Now drafting the final answer. Final answer only.')
  assert.equal(payload.providerResponseMeta?.transportMode, 'codex_app_server_chatgpt')
})

test('OpenAI account runtime preserves final-only reasoning when the bridge emits a completed reasoning item', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_reasoning_completed',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'reasoning',
              text: 'Foreground reasoning summary.',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Foreground answer.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const reasoningChunks = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Summarize the reasoning.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_reasoning_completed',
      },
    },
    onReasoning: (chunk) => reasoningChunks.push(chunk),
  })

  assert.equal(reasoningChunks.join(''), 'Foreground reasoning summary.')
  assert.equal(payload.text, 'Foreground answer.')
  assert.equal(payload.reasoning, 'Foreground reasoning summary.')
  assert.equal(payload.providerResponseMeta?.transportMode, 'codex_app_server_chatgpt')
})

test('OpenAI account runtime starts a fresh bridge thread when stored state does not prove the same project root', async () => {
  const bridge = new FakeBridge({
    startThreadId: 'thr_account_project_reset',
    turnId: 'turn_account_project_reset',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  __setOpenAIAccountRuntimeThreadStateGetterForTests((threadId) => (
    threadId === 'thread_account_project_reset'
      ? {
          threadId,
          providerId: 'openai',
          model: 'gpt-5.4',
          metadata: {
            accountBridgeThreadId: 'thr_stale_root',
          },
        }
      : null
  ))

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'List the project root.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        projectFolder: 'C:/Users/example/Desktop/test/P21',
        threadId: 'thread_account_project_reset',
      },
    },
  })

  assert.equal(bridge.resumeThreadCalls.length, 0)
  assert.equal(bridge.startThreadCalls.length, 1)
  assert.equal(bridge.startThreadCalls[0].cwd, path.resolve('C:/Users/example/Desktop/test/P21'))
})

test('OpenAI account runtime resumes a stored bridge thread for later turns', async () => {
  const dynamicToolSignature = buildDynamicToolSignature([])
  const modeSignature = buildModeSignature({})
  const modelSignature = buildModelSignature('gpt-5.4')
  const bridge = new FakeBridge({
    turnId: 'turn_account_resume',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  __setOpenAIAccountRuntimeThreadStateGetterForTests((threadId) => (
    threadId === 'thread_account_resume'
      ? {
          threadId,
          providerId: 'openai',
          model: 'gpt-5.4',
          continuityEpoch: 1,
          continuityReducerVersion: 'thread_local_v1',
          modeSignature,
          modelSignature,
          metadata: {
            accountBridgeThreadId: 'thr_saved',
            accountDynamicToolSignature: dynamicToolSignature,
            accountDelegationBackend: 'none',
          },
        }
      : null
  ))

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Second message.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_resume',
      },
    },
  })

  assert.equal(bridge.resumeThreadCalls.length, 1)
  assert.equal(bridge.resumeThreadCalls[0].threadId, 'thr_saved')
  assert.equal(bridge.startThreadCalls.length, 0)
  assert.equal(bridge.startTurnCalls[0].threadId, 'thr_saved')
  assert.equal(bridge.startTurnCalls[0].input[0].text, 'Second message.')
  assert.equal(payload.providerResponseMeta?.accountBridgeThreadId, 'thr_saved')
})

test('OpenAI account runtime sends a transcript-quiet lifecycle instruction instead of stale user history', async () => {
  const dynamicToolSignature = buildDynamicToolSignature([])
  const modeSignature = buildModeSignature({})
  const modelSignature = buildModelSignature('gpt-5.4')
  const bridge = new FakeBridge({
    turnId: 'turn_account_plan_lifecycle',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  __setOpenAIAccountRuntimeThreadStateGetterForTests((threadId) => (
    threadId === 'thread_account_plan_lifecycle'
      ? {
          threadId,
          providerId: 'openai',
          model: 'gpt-5.4',
          continuityEpoch: 1,
          continuityReducerVersion: 'thread_local_v1',
          modeSignature,
          modelSignature,
          metadata: {
            accountBridgeThreadId: 'thr_plan_lifecycle',
            accountDynamicToolSignature: dynamicToolSignature,
            accountDelegationBackend: 'none',
          },
        }
      : null
  ))

  await createOpenAIAccountStreamPayload({
    messages: [
      { role: 'user', content: 'Ask questions' },
      { role: 'assistant', content: 'Please answer the direction questions.' },
    ],
    options: {
      model: 'gpt-5.4',
      openAIAccountCurrentTurnInput: [{
        type: 'text',
        text: '[ADDOM Internal Plan Direction Synthesis]\nSynthesis request ID: request-1',
      }],
      requestContext: {
        threadId: 'thread_account_plan_lifecycle',
      },
    },
  })

  assert.equal(bridge.startTurnCalls.length, 1)
  assert.deepEqual(bridge.startTurnCalls[0].input, [{
    type: 'text',
    text: '[ADDOM Internal Plan Direction Synthesis]\nSynthesis request ID: request-1',
  }])
})

test('OpenAI account runtime fails closed when a stored bridge thread cannot be resumed', async () => {
  const dynamicToolSignature = buildDynamicToolSignature([])
  const modeSignature = buildModeSignature({})
  const modelSignature = buildModelSignature('gpt-5.4')
  const bridge = new FakeBridge({
    startThreadId: 'thr_account_resume_failed_fresh',
    turnId: 'turn_account_resume_failed_fresh',
    onResumeThread() {
      throw new Error('resume failed')
    },
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  __setOpenAIAccountRuntimeThreadStateGetterForTests((threadId) => (
    threadId === 'thread_account_resume_failed'
      ? {
          threadId,
          providerId: 'openai',
          model: 'gpt-5.4',
          continuityEpoch: 1,
          continuityReducerVersion: 'thread_local_v1',
          modeSignature,
          modelSignature,
          metadata: {
            accountBridgeThreadId: 'thr_saved_but_broken',
            accountDynamicToolSignature: dynamicToolSignature,
            accountDelegationBackend: 'none',
          },
        }
      : null
  ))

  await assert.rejects(
    createOpenAIAccountStreamPayload({
      messages: [
        { role: 'system', content: 'System rule.' },
        { role: 'assistant', content: 'Earlier reply.' },
        { role: 'user', content: 'Try again with full context.' },
      ],
      options: {
        model: 'gpt-5.4',
        requestContext: {
          threadId: 'thread_account_resume_failed',
        },
      },
    }),
    (error) => {
      assert.equal(error?.reason || error?.code, 'account_thread_resume_failed')
      assert.match(String(error?.message || ''), /could not resume/i)
      return true
    },
  )

  assert.equal(bridge.resumeThreadCalls.length, 1)
  assert.equal(bridge.startThreadCalls.length, 0)
  assert.equal(bridge.startTurnCalls.length, 0)
})

test('OpenAI account runtime can resume an explicit bridge thread id without stored thread state', async () => {
  const dynamicToolSignature = buildDynamicToolSignature([])
  const modeSignature = buildModeSignature({})
  const modelSignature = buildModelSignature('gpt-5.4')
  const bridge = new FakeBridge({
    turnId: 'turn_account_explicit_resume',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Continue.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'moa:thread:task_1',
        openai: {
          accountBridgeThreadId: 'thr_explicit',
          accountDynamicToolSignature: dynamicToolSignature,
          accountDelegationBackend: 'none',
          continuityEpoch: 1,
          continuityReducerVersion: 'thread_local_v1',
          modeSignature,
          modelSignature,
        },
      },
    },
  })

  assert.equal(bridge.resumeThreadCalls.length, 1)
  assert.equal(bridge.resumeThreadCalls[0].threadId, 'thr_explicit')
  assert.equal(bridge.startThreadCalls.length, 0)
  assert.equal(bridge.startTurnCalls[0].threadId, 'thr_explicit')
  assert.equal(payload.providerResponseMeta?.accountBridgeThreadId, 'thr_explicit')
})

test('OpenAI account runtime keeps a stored bridge thread when permission mode changes', async () => {
  const dynamicToolSignature = buildDynamicToolSignature([])
  const askModeSignature = buildModeSignature({ permissionMode: 'ask' })
  const modelSignature = buildModelSignature('gpt-5.4')
  const bridge = new FakeBridge({
    startThreadId: 'thr_account_full_access_reset',
    turnId: 'turn_account_full_access_reset',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  __setOpenAIAccountRuntimeThreadStateGetterForTests((threadId) => (
    threadId === 'thread_account_full_access_reset'
      ? {
          threadId,
          providerId: 'openai',
          model: 'gpt-5.4',
          continuityEpoch: 1,
          continuityReducerVersion: 'thread_local_v1',
          modeSignature: askModeSignature,
          modelSignature,
          metadata: {
            accountBridgeThreadId: 'thr_saved_ask_mode',
            accountDynamicToolSignature: dynamicToolSignature,
            accountDelegationBackend: 'none',
            accountBridgeProjectFolder: 'C:/Users/example/Desktop/test/P21',
          },
        }
      : null
  ))

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Continue with full access.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'full_access',
        commandSafety: {},
      },
      requestContext: {
        threadId: 'thread_account_full_access_reset',
        projectFolder: 'C:/Users/example/Desktop/test/P21',
      },
    },
  })

  assert.equal(bridge.resumeThreadCalls.length, 1)
  assert.equal(bridge.resumeThreadCalls[0].threadId, 'thr_saved_ask_mode')
  assert.equal(bridge.startThreadCalls.length, 0)
  assert.equal(bridge.startTurnCalls[0].threadId, 'thr_saved_ask_mode')
  assert.equal(bridge.startTurnCalls[0].approvalPolicy, 'never')
  assert.equal(bridge.startTurnCalls[0].permissions, ':danger-full-access')
  assert.equal('sandboxPolicy' in bridge.startTurnCalls[0], false)
  assert.equal(payload.providerResponseMeta?.accountBridgeThreadId, 'thr_saved_ask_mode')
})

test('OpenAI account runtime keeps an explicit bridge thread when permission mode changes and project identity matches', async () => {
  const dynamicToolSignature = buildDynamicToolSignature([])
  const askModeSignature = buildModeSignature({ permissionMode: 'ask' })
  const modelSignature = buildModelSignature('gpt-5.4')
  const bridge = new FakeBridge({
    startThreadId: 'thr_account_explicit_full_access_reset',
    turnId: 'turn_account_explicit_full_access_reset',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Continue with full access.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'full_access',
        commandSafety: {},
      },
      requestContext: {
        threadId: 'thread_account_explicit_full_access_reset',
        projectFolder: 'C:/Users/example/Desktop/test/P21',
        openai: {
          accountBridgeThreadId: 'thr_explicit_ask_mode',
          accountBridgeProjectFolder: 'C:/Users/example/Desktop/test/P21',
          accountDynamicToolSignature: dynamicToolSignature,
          accountDelegationBackend: 'none',
          continuityEpoch: 1,
          continuityReducerVersion: 'thread_local_v1',
          modeSignature: askModeSignature,
          modelSignature,
        },
      },
    },
  })

  assert.equal(bridge.resumeThreadCalls.length, 1)
  assert.equal(bridge.resumeThreadCalls[0].threadId, 'thr_explicit_ask_mode')
  assert.equal(bridge.startThreadCalls.length, 0)
  assert.equal(bridge.startTurnCalls[0].threadId, 'thr_explicit_ask_mode')
  assert.equal(bridge.startTurnCalls[0].approvalPolicy, 'never')
  assert.equal(bridge.startTurnCalls[0].permissions, ':danger-full-access')
  assert.equal('sandboxPolicy' in bridge.startTurnCalls[0], false)
  assert.equal(payload.providerResponseMeta?.accountBridgeThreadId, 'thr_explicit_ask_mode')
})

test('OpenAI account runtime rotates a stored bridge thread when its dynamic tool contract changes', async () => {
  const bridge = new FakeBridge({
    startThreadId: 'thr_account_tool_reset',
    turnId: 'turn_account_tool_reset',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  __setOpenAIAccountRuntimeThreadStateGetterForTests((threadId) => (
    threadId === 'thread_account_tool_reset'
      ? {
          threadId,
          providerId: 'openai',
          model: 'gpt-5.4',
          metadata: {
            accountBridgeThreadId: 'thr_stale_tools',
            accountBridgeProjectFolder: 'C:/Users/example/Desktop/test/P21',
            accountDynamicToolSignature: 'stale_signature',
            accountDelegationBackend: 'addom_moa',
          },
        }
      : null
  ))

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Continue with current tools only.' }],
    options: {
      model: 'gpt-5.4',
      tools: {
        read_file: {
          description: 'Read a file.',
          inputSchema: {
            jsonSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
        },
      },
      openAIAccountDynamicToolCatalog: {
        read_file: {
          description: 'Read a file.',
          inputSchema: {
            jsonSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
        },
        delegate_tasks: {
          description: 'Delegate a focused review.',
          inputSchema: {
            jsonSchema: {
              type: 'object',
              properties: {
                task: { type: 'string' },
              },
              required: ['task'],
            },
          },
        },
      },
      openAIAccountDelegationBackend: 'openai_native',
      requestContext: {
        threadId: 'thread_account_tool_reset',
        projectFolder: 'C:/Users/example/Desktop/test/P21',
      },
    },
  })

  assert.equal(bridge.resumeThreadCalls.length, 0)
  assert.equal(bridge.startThreadCalls.length, 1)
  assert.equal(bridge.startTurnCalls[0].threadId, 'thr_account_tool_reset')
  assert.equal(payload.providerResponseMeta?.accountBridgeThreadId, 'thr_account_tool_reset')
  assert.equal(payload.providerResponseMeta?.accountDelegationBackend, 'none')
  assert.match(String(payload.providerResponseMeta?.accountDynamicToolSignature || ''), /^[a-f0-9]{16}$/i)
})

test('OpenAI account runtime applies a discovered default collaboration mode for native delegation', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_native_mode',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  bridge.listCollaborationModes = async () => ([
    { id: 'default', name: 'Default', settings: { developer_instructions: 'ignored' } },
    { id: 'plan', name: 'Plan' },
  ])
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Use native collaboration if available.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountDelegationBackend: 'openai_native',
      requestContext: {
        threadId: 'thread_account_native_mode',
      },
    },
  })

  assert.equal(bridge.startTurnCalls.length, 1)
  assert.deepEqual(bridge.startTurnCalls[0].collaborationMode, {
    id: 'default',
    name: 'Default',
    settings: {
      developer_instructions: null,
    },
  })
  assert.equal(payload.providerResponseMeta?.accountDelegationBackend, 'openai_native')
  assert.equal(payload.providerResponseMeta?.accountCollaborationModeId, 'default')
})

test('OpenAI account runtime honors an explicit native collaboration mode id when the bridge reports it', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_requested_mode',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  bridge.listCollaborationModes = async () => ([
    { id: 'default', name: 'Default', settings: { developer_instructions: 'ignored' } },
    { id: 'plan', name: 'Plan' },
  ])
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Use the plan collaboration mode.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountDelegationBackend: 'openai_native',
      openAIAccountCollaborationModeId: 'plan',
      requestContext: {
        threadId: 'thread_account_requested_mode',
      },
    },
  })

  assert.equal(bridge.startTurnCalls.length, 1)
  assert.deepEqual(bridge.startTurnCalls[0].collaborationMode, {
    id: 'plan',
    name: 'Plan',
    settings: {
      developer_instructions: null,
    },
  })
  assert.equal(payload.providerResponseMeta?.accountCollaborationModeId, 'plan')
})

test('OpenAI account runtime registers dynamic tools and executes item/tool/call through the client callback', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_dynamic_tool',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'dyn_1',
              type: 'dynamicToolCall',
              tool: 'read_file',
              arguments: { path: 'src/app.js' },
              status: 'inProgress',
            },
          },
        })
        target.emit('server-request', {
          id: 88,
          method: 'item/tool/call',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'dyn_1',
            tool: 'read_file',
            arguments: { path: 'src/app.js' },
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                id: 'dyn_1',
                type: 'dynamicToolCall',
                tool: 'read_file',
                arguments: { path: 'src/app.js' },
                status: 'completed',
                success: true,
                contentItems: [{ type: 'inputText', text: 'file contents' }],
              },
            },
          })
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                type: 'agentMessage',
                text: 'Used the requested tool and finished.',
              },
            },
          })
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const observedToolCalls = []
  const observedExecutionOrder = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Inspect the file and summarize it.' }],
    options: {
      model: 'gpt-5.4',
      tools: {
        read_file: {
          description: 'Read a file.',
          inputSchema: {
            jsonSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
        },
      },
      openAIAccountDynamicToolCatalog: {
        read_file: {
          description: 'Read a file.',
          inputSchema: {
            jsonSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
        },
        delegate_tasks: {
          description: 'Delegate a focused review.',
          inputSchema: {
            jsonSchema: {
              type: 'object',
              properties: {
                task: { type: 'string' },
              },
              required: ['task'],
            },
          },
        },
      },
      openAIAccountDynamicToolExecutor: async ({ toolName, input }) => {
        observedExecutionOrder.push(`execute:${toolName}`)
        observedToolCalls.push({ toolName, input })
        return {
          contentItems: [{ type: 'text', text: 'file contents' }],
          success: true,
        }
      },
      openAIAccountApprovalContext: {
        permissionProfile: ':read-only',
      },
      requestContext: {
        threadId: 'thread_account_dynamic',
        projectFolder: 'C:/Users/example/Desktop/test/P21',
      },
    },
    onProviderToolBoundary: ({ toolCallId, toolName }) => {
      observedExecutionOrder.push(`boundary:${toolCallId}:${toolName}`)
    },
  })

  assert.equal(bridge.startThreadCalls.length, 1)
  assert.deepEqual(bridge.startThreadCalls[0].dynamicTools, [
    {
      name: 'read_file',
      description: 'Read a file.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
    {
      name: 'delegate_tasks',
      description: 'Delegate a focused review.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
        },
        required: ['task'],
      },
    },
  ])
  assert.equal(bridge.startThreadCalls[0].cwd, path.resolve('C:/Users/example/Desktop/test/P21'))
  assert.equal(bridge.startThreadCalls[0].permissions, ':read-only')
  assert.equal('sandbox' in bridge.startThreadCalls[0], false)
  assert.equal(bridge.startThreadCalls[0].approvalPolicy, 'on-request')
  assert.equal(bridge.startTurnCalls[0].approvalPolicy, 'on-request')
  assert.equal(bridge.startTurnCalls[0].permissions, ':read-only')
  assert.equal('sandboxPolicy' in bridge.startTurnCalls[0], false)
  assert.deepEqual(observedToolCalls, [{
    toolName: 'read_file',
    input: { path: 'src/app.js' },
  }])
  assert.deepEqual(observedExecutionOrder, [
    'boundary:dyn_1:read_file',
    'execute:read_file',
  ])
  assert.deepEqual(bridge.responses, [{
    id: 88,
    result: {
      contentItems: [{ type: 'inputText', text: 'file contents' }],
      success: true,
    },
  }])
  assert.equal(payload.text, 'Used the requested tool and finished.')
  assert.match(String(payload.providerResponseMeta?.accountDynamicToolSignature || ''), /^[a-f0-9]{16}$/i)
  assert.equal(payload.providerResponseMeta?.accountDelegationBackend, 'none')
})

test('OpenAI account Plan turns advertise only the canonical Plan tool ceiling', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_plan_catalog',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: { type: 'agentMessage', text: 'Plan research complete.' },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: { id: target.turnId, status: 'completed', error: null },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Research and prepare a plan.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountDynamicToolCatalog: {
        read_file: { description: 'Read.', inputSchema: { jsonSchema: { type: 'object', properties: {} } } },
        plan_direction_update: { description: 'Direction.', inputSchema: { jsonSchema: { type: 'object', properties: {} } } },
        plan_document_write: { description: 'Plan document.', inputSchema: { jsonSchema: { type: 'object', properties: {} } } },
        write_file: { description: 'Write.', inputSchema: { jsonSchema: { type: 'object', properties: {} } } },
        run_command: { description: 'Run.', inputSchema: { jsonSchema: { type: 'object', properties: {} } } },
      },
      requestContext: {
        mode: 'plan',
        threadId: 'thread_account_plan_catalog',
      },
    },
  })

  assert.deepEqual(
    bridge.startThreadCalls[0].dynamicTools.map((tool) => tool.name),
    ['read_file', 'plan_direction_update', 'plan_document_write'],
  )
})

test('OpenAI account runtime aliases apply_patch on the transport and restores the canonical tool name before execution', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-account-apply-patch-'))
  const bridge = new FakeBridge({
    turnId: 'turn_account_dynamic_apply_patch',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'dyn_patch_1',
              type: 'dynamicToolCall',
              tool: 'workspace_apply_patch',
              arguments: {
                patch: [
                  '*** Begin Patch',
                  '*** Add File: calculator.py',
                  '+print("ok")',
                  '*** End Patch',
                ].join('\n'),
              },
              status: 'inProgress',
            },
          },
        })
        target.emit('server-request', {
          id: 188,
          method: 'item/tool/call',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'dyn_patch_1',
            tool: 'workspace_apply_patch',
            arguments: {
              patch: [
                '*** Begin Patch',
                '*** Add File: calculator.py',
                '+print("ok")',
                '*** End Patch',
              ].join('\n'),
            },
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                id: 'dyn_patch_1',
                type: 'dynamicToolCall',
                tool: 'workspace_apply_patch',
                arguments: {
                  patch: [
                    '*** Begin Patch',
                    '*** Add File: calculator.py',
                    '+print("ok")',
                    '*** End Patch',
                  ].join('\n'),
                },
                status: 'completed',
                success: true,
                contentItems: [{ type: 'inputText', text: 'apply_patch succeeded' }],
              },
            },
          })
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                type: 'agentMessage',
                text: 'Patch applied.',
              },
            },
          })
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const observedToolCalls = []
  const seenOutputs = []
  const patchText = [
    '*** Begin Patch',
    '*** Add File: calculator.py',
    '+print("ok")',
    '*** End Patch',
  ].join('\n')
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Create calculator.py.' }],
    options: {
      model: 'gpt-5.4',
      tools: {
        apply_patch: {
          description: 'Apply a targeted patch to workspace files.',
          inputSchema: {
            jsonSchema: {
              type: 'object',
              properties: {
                patch: { type: 'string' },
              },
            },
          },
        },
      },
      openAIAccountDynamicToolExecutor: async ({ toolName, input }) => {
        observedToolCalls.push({ toolName, input })
        return {
          contentItems: [{ type: 'text', text: 'apply_patch succeeded' }],
          success: true,
        }
      },
      requestContext: {
        threadId: 'thread_account_dynamic_apply_patch',
        projectFolder,
      },
    },
    onProviderToolOutput: (output) => {
      seenOutputs.push(output)
    },
  })

  assert.deepEqual(bridge.startThreadCalls[0].dynamicTools, [{
    name: 'workspace_apply_patch',
    description: 'Apply a targeted patch to workspace files.',
    inputSchema: {
      type: 'object',
      properties: {
        patch: { type: 'string' },
      },
    },
  }])
  assert.deepEqual(observedToolCalls, [{
    toolName: 'apply_patch',
    input: { patch: patchText },
  }])
  assert.deepEqual(bridge.responses, [{
    id: 188,
    result: {
      contentItems: [{ type: 'inputText', text: 'apply_patch succeeded' }],
      success: true,
    },
  }])
  assert.equal(payload.text, 'Patch applied.')
  assert.equal(
    seenOutputs.some((entry) => (
      entry.toolName === 'file_change'
      && Array.isArray(entry.output?.changes)
      && entry.output.changes.some((change) => (
        change.path === 'calculator.py'
        && change.kind?.type === 'create'
        && String(change.diff || '').includes('+print("ok")')
      ))
    )),
    true,
  )
  assert.deepEqual(payload.providerResponseMeta?.accountNativeActivity?.fileChange, {
    started: false,
    completed: true,
    itemIds: ['dyn_patch_1'],
    statuses: ['completed'],
    changes: [{
      path: 'calculator.py',
      kind: { type: 'create' },
      diff: '@@ -1,0 +1,1 @@\n+print("ok")',
      addedLines: 1,
      removedLines: 0,
    }],
    paths: ['calculator.py'],
    changeKinds: ['create'],
    outputPreview: '',
  })
})

test('OpenAI account runtime routes command approvals through ADDOM approval handling and accepts them', async () => {
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_approval_accept',
              type: 'commandExecution',
              command: 'npm install left-pad',
              cwd: 'C:/repo',
              status: 'inProgress',
              commandActions: [{ type: 'run' }],
            },
          },
        })
        target.emit('server-request', {
          id: 77,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'cmd_account_approval_accept',
            command: 'npm install left-pad',
            cwd: 'C:/repo',
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                type: 'agentMessage',
                text: 'Command approved.',
              },
            },
          })
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalRequest = null

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Run something.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async (request) => {
        approvalRequest = request
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_approval_accept',
        projectFolder: 'C:/repo',
      },
    },
  })

  assert.equal(payload.text, 'Command approved.')
  assert.equal(approvalRequest?.toolName, 'run_command')
  assert.equal(approvalRequest?.threadId, 'thread_account_approval_accept')
  assert.equal(approvalRequest?.providerThreadId, bridge.startThreadId)
  assert.equal(approvalRequest?.turnId, 'turn_account_1')
  assert.deepEqual(bridge.responses, [{ id: 77, result: 'accept' }])
})

test('OpenAI account runtime translates qualified legacy exec approvals through the canonical command approval path', async () => {
  clearRiskyActionSessionState()
  const bridge = new FakeBridge({
    runtimeIdentity: { executable: 'codex.exe', version: '0.145.0' },
    onStartTurn(params, target) {
      setImmediate(() => {
        target.emit('server-request', {
          id: 770,
          method: 'execCommandApproval',
          params: {
            conversationId: params.threadId,
            callId: 'legacy-exec-1',
            approvalId: 'legacy-approval-1',
            command: ['npm', 'install', 'left-pad'],
            cwd: 'C:/repo',
            parsedCmd: [{ type: 'unknown', cmd: 'npm install left-pad' }],
            reason: 'Install a dependency.',
          },
        })
      })
    },
    onRespond(_response, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: target.startThreadId,
            turnId: target.turnId,
            item: { type: 'agentMessage', text: 'Legacy command approval completed.' },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: target.startThreadId,
            turn: { id: target.turnId, status: 'completed', error: null },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalRequest = null

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Run the command.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async (request) => {
        approvalRequest = request
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_legacy_exec_approval',
        projectFolder: 'C:/repo',
      },
    },
  })
  clearRiskyActionSessionState()

  assert.equal(payload.text, 'Legacy command approval completed.')
  assert.equal(approvalRequest?.toolName, 'run_command')
  assert.equal(approvalRequest?.itemId, 'legacy-exec-1')
  assert.deepEqual(bridge.responses, [{
    id: 770,
    result: { decision: 'approved' },
  }])
})

test('OpenAI account runtime translates qualified legacy patch approvals through the canonical file approval path', async () => {
  const bridge = new FakeBridge({
    runtimeIdentity: { executable: 'codex.exe', version: '0.116.0' },
    onStartTurn(params, target) {
      setImmediate(() => {
        target.emit('server-request', {
          id: 771,
          method: 'applyPatchApproval',
          params: {
            conversationId: params.threadId,
            callId: 'legacy-patch-1',
            fileChanges: {
              'src/new.mjs': {
                type: 'add',
                content: 'export const value = 1\n',
              },
            },
            reason: 'Apply the file change.',
          },
        })
      })
    },
    onRespond(_response, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: target.startThreadId,
            turnId: target.turnId,
            item: { type: 'agentMessage', text: 'Legacy patch approval completed.' },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: target.startThreadId,
            turn: { id: target.turnId, status: 'completed', error: null },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalRequest = null

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Apply the patch.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async (request) => {
        approvalRequest = request
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_legacy_patch_approval',
        projectFolder: 'C:/repo',
      },
    },
  })

  assert.equal(payload.text, 'Legacy patch approval completed.')
  assert.equal(approvalRequest?.toolName, 'file_change')
  assert.deepEqual(approvalRequest?.changes, [{
    path: 'src/new.mjs',
    kind: { type: 'create' },
    content: 'export const value = 1\n',
  }])
  assert.deepEqual(bridge.responses, [{
    id: 771,
    result: { decision: 'approved' },
  }])
})

test('OpenAI account runtime maps session approvals to acceptForSession when the bridge supports it', async () => {
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_approval_session',
              type: 'commandExecution',
              command: 'npm install left-pad',
              cwd: 'C:/repo',
              status: 'inProgress',
              commandActions: [{ type: 'run' }],
            },
          },
        })
        target.emit('server-request', {
          id: 78,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'cmd_account_approval_session',
            command: 'npm install left-pad',
            cwd: 'C:/repo',
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Install dependencies.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => ({
        decision: 'approved',
        approvalMeta: {
          remoteApproval: {
            decision: 'acceptForSession',
          },
        },
      }),
      requestContext: {
        threadId: 'thread_account_approval_session',
        projectFolder: 'C:/repo',
      },
    },
  })

  assert.deepEqual(bridge.responses, [{ id: 78, result: 'acceptForSession' }])
})

test('OpenAI account runtime maps cancelled command approvals to cancel without aborting the turn', async () => {
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_approval_cancel',
              type: 'commandExecution',
              command: 'rm -rf build',
              cwd: 'C:/repo',
              status: 'inProgress',
              commandActions: [{ type: 'run' }],
            },
          },
        })
        target.emit('server-request', {
          id: 79,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'cmd_account_approval_cancel',
            command: 'rm -rf build',
            cwd: 'C:/repo',
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                type: 'agentMessage',
                text: 'Approval cancelled cleanly.',
              },
            },
          })
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Run the cleanup.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => ({
        decision: 'denied',
        denyReason: 'cancelled',
      }),
      requestContext: {
        threadId: 'thread_account_approval_cancel',
        projectFolder: 'C:/repo',
      },
    },
  })

  assert.equal(payload.text, 'Approval cancelled cleanly.')
  assert.deepEqual(bridge.responses, [{ id: 79, result: 'cancel' }])
})

test('OpenAI account runtime declines shell env overrides without prompting', async () => {
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_env_decline',
              type: 'commandExecution',
              command: 'git status',
              cwd: 'C:/repo',
              env: { FOO: 'bar' },
              status: 'inProgress',
              commandActions: [{ type: 'run' }],
            },
          },
        })
        target.emit('server-request', {
          id: 790,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'cmd_account_env_decline',
            command: 'git status',
            cwd: 'C:/repo',
            env: { FOO: 'bar' },
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalCalls = 0

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Run with env overrides.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => {
        approvalCalls += 1
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_env_decline',
        projectFolder: 'C:/repo',
      },
    },
  })

  assert.equal(approvalCalls, 0)
  assert.deepEqual(bridge.responses, [{ id: 790, result: 'decline' }])
})

test('OpenAI account runtime prompts for out-of-workspace cwd in ask mode and auto-accepts it in full_access mode', async () => {
  const projectFolder = path.join(userDataPath, 'account-command-cwd-workspace')
  const outsideRoot = path.join(path.dirname(projectFolder), 'account-command-cwd-outside')
  fs.mkdirSync(projectFolder, { recursive: true })
  fs.mkdirSync(outsideRoot, { recursive: true })

  const createBridge = () => new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_outside_cwd',
              type: 'commandExecution',
              command: 'git status',
              cwd: outsideRoot,
              status: 'inProgress',
              commandActions: [{ type: 'run' }],
            },
          },
        })
        target.emit('server-request', {
          id: 791,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'cmd_account_outside_cwd',
            command: 'git status',
            cwd: outsideRoot,
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })

  let askApprovalCalls = 0
  const askBridge = createBridge()
  installServiceWithBridge(askBridge)
  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Prompt for outside cwd.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => {
        askApprovalCalls += 1
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_outside_cwd_ask',
        projectFolder,
      },
    },
  })

  assert.equal(askApprovalCalls, 1)
  assert.deepEqual(askBridge.responses, [{ id: 791, result: 'accept' }])

  const fullAccessBridge = createBridge()
  installServiceWithBridge(fullAccessBridge)
  let fullAccessApprovalCalls = 0
  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Auto-approve outside cwd.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'full_access',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => {
        fullAccessApprovalCalls += 1
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_outside_cwd_full_access',
        projectFolder,
      },
    },
  })

  assert.equal(fullAccessApprovalCalls, 0)
  assert.deepEqual(fullAccessBridge.responses, [{ id: 791, result: 'acceptForSession' }])
})

test('OpenAI account runtime routes out-of-workspace file changes through ADDOM approval handling in ask mode', async () => {
  const projectFolder = path.join(userDataPath, 'workspace-scope')
  const outsidePath = path.join(path.dirname(projectFolder), 'outside-scope.txt')
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_account_approval_decline',
              type: 'fileChange',
              status: 'inProgress',
              changes: [{ path: outsidePath, kind: 'modify' }],
            },
          },
        })
        target.emit('server-request', {
          id: 80,
          method: 'item/fileChange/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'file_account_approval_decline',
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalCalls = 0
  let approvalRequest = null

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Change the file.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {
          allowOutsideWorkspaceMutation: false,
        },
      },
      openAIAccountRequestApproval: async (request) => {
        approvalCalls += 1
        approvalRequest = request
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_file_decline',
        projectFolder,
      },
    },
  })

  assert.equal(approvalCalls, 1)
  assert.equal(approvalRequest?.toolName, 'file_change')
  assert.equal(approvalRequest?.approvalKind, 'file_change')
  assert.equal(approvalRequest?.projectFolder, path.resolve(projectFolder))
  assert.equal(approvalRequest?.approvalPolicy?.type, 'file_tool_policy_v1')
  assert.equal(approvalRequest?.approvalPolicy?.hostAccessRequired, true)
  assert.equal(approvalRequest?.approvalPolicy?.pathScope, 'external_requested')
  assert.ok(Array.isArray(approvalRequest?.approvalPolicy?.externalPaths))
  assert.ok(approvalRequest?.approvalPolicy?.externalPaths.includes(path.resolve(outsidePath)))
  assert.deepEqual(bridge.responses, [{ id: 80, result: 'accept' }])
})

test('OpenAI account runtime routes diffable file change approvals through ADDOM with grant root context', async () => {
  const projectFolder = path.join(userDataPath, 'workspace-file-approval')
  const changedPath = path.join(projectFolder, 'src', 'main.mjs')
  const grantRoot = projectFolder
  const diff = '@@ -1 +1 @@\n-console.log("old")\n+console.log("new")'
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_account_approval_accept',
              type: 'fileChange',
              status: 'inProgress',
              grantRoot,
              changes: [{ path: changedPath, kind: 'modify', diff }],
            },
          },
        })
        target.emit('server-request', {
          id: 82,
          method: 'item/fileChange/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'file_account_approval_accept',
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
            grantRoot,
            reason: 'Review the proposed patch.',
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalRequest = null

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Patch the file.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async (request) => {
        approvalRequest = request
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_file_accept',
        projectFolder,
      },
    },
  })

  assert.equal(approvalRequest?.toolName, 'file_change')
  assert.equal(approvalRequest?.approvalKind, 'file_change')
  assert.equal(approvalRequest?.projectFolder, path.resolve(projectFolder))
  assert.equal(approvalRequest?.grantRoot, path.resolve(grantRoot))
  assert.equal(approvalRequest?.approvalPolicy?.type, 'file_tool_policy_v1')
  assert.equal(approvalRequest?.approvalPolicy?.hostAccessRequired, true)
  assert.ok(Array.isArray(approvalRequest?.approvalPolicy?.changeKinds))
  assert.ok(approvalRequest?.approvalPolicy?.changeKinds.includes('modify'))
  assert.equal(approvalRequest?.threadId, 'thread_account_file_accept')
  assert.equal(approvalRequest?.providerThreadId, bridge.startThreadId)
  assert.equal(approvalRequest?.turnId, 'turn_account_1')
  assert.deepEqual(approvalRequest?.changes, [{ path: 'src/main.mjs', kind: 'modify', diff }])
  assert.deepEqual(bridge.responses, [{ id: 82, result: 'accept' }])
})

test('OpenAI account runtime auto-accepts outside-workspace file changes in full_access mode without prompting', async () => {
  const projectFolder = path.join(userDataPath, 'workspace-file-full-access')
  const outsidePath = path.join(path.dirname(projectFolder), 'outside-full-access.txt')
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_account_full_access_accept',
              type: 'fileChange',
              status: 'inProgress',
              changes: [{ path: outsidePath, kind: 'modify', diff: '@@ -1 +1 @@\n-old\n+new' }],
            },
          },
        })
        target.emit('server-request', {
          id: 81,
          method: 'item/fileChange/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'file_account_full_access_accept',
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalCalls = 0

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Change the file with full access.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'full_access',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => {
        approvalCalls += 1
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_file_full_access',
        projectFolder,
      },
    },
  })

  assert.equal(approvalCalls, 0)
  assert.deepEqual(bridge.responses, [{ id: 81, result: 'acceptForSession' }])
})

test('OpenAI account runtime honors grantRoot-only file approvals when launch projectFolder is absent', async () => {
  const grantRoot = path.join(userDataPath, 'grant-root-only')
  const changedPath = path.join(grantRoot, 'src', 'feature.mjs')
  const diff = '@@ -0,0 +1 @@\n+export const enabled = true'
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_account_grant_root_only',
              type: 'fileChange',
              status: 'inProgress',
              grantRoot,
              changes: [{ path: changedPath, kind: 'create', diff }],
            },
          },
        })
        target.emit('server-request', {
          id: 83,
          method: 'item/fileChange/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'file_account_grant_root_only',
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
            grantRoot,
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalRequest = null

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Create the feature file.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async (request) => {
        approvalRequest = request
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_grant_root_only',
      },
    },
  })

  assert.equal(approvalRequest?.projectFolder, path.resolve(grantRoot))
  assert.equal(approvalRequest?.grantRoot, path.resolve(grantRoot))
  assert.deepEqual(bridge.responses, [{ id: 83, result: 'accept' }])
})

test('OpenAI account runtime routes escaped grantRoot file approvals through ADDOM handling in ask mode', async () => {
  const grantRoot = path.join(userDataPath, 'grant-root-scope')
  const escapedPath = path.join(path.dirname(grantRoot), 'escaped.txt')
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_account_escape_decline',
              type: 'fileChange',
              status: 'inProgress',
              grantRoot,
              changes: [{ path: escapedPath, kind: 'modify', diff: '@@ -1 +1 @@' }],
            },
          },
        })
        target.emit('server-request', {
          id: 84,
          method: 'item/fileChange/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'file_account_escape_decline',
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
            grantRoot,
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalCalls = 0
  let approvalRequest = null

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Edit the escaped file.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async (request) => {
        approvalCalls += 1
        approvalRequest = request
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_escape_decline',
      },
    },
  })

  assert.equal(approvalCalls, 1)
  assert.equal(approvalRequest?.toolName, 'file_change')
  assert.equal(approvalRequest?.approvalPolicy?.type, 'file_tool_policy_v1')
  assert.equal(approvalRequest?.approvalPolicy?.hostAccessRequired, true)
  assert.ok(approvalRequest?.approvalPolicy?.externalPaths.includes(path.resolve(escapedPath)))
  assert.deepEqual(bridge.responses, [{ id: 84, result: 'accept' }])
})

test('OpenAI account runtime maps file change session approvals to acceptForSession when supported', async () => {
  const grantRoot = path.join(userDataPath, 'grant-root-session')
  const changedPath = path.join(grantRoot, 'src', 'session.mjs')
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_account_session_accept',
              type: 'fileChange',
              status: 'inProgress',
              grantRoot,
              changes: [{ path: changedPath, kind: 'modify', diff: '@@ -1 +1 @@' }],
            },
          },
        })
        target.emit('server-request', {
          id: 85,
          method: 'item/fileChange/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'file_account_session_accept',
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
            grantRoot,
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Patch the file for this session.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => ({
        decision: 'approved',
        approvalMeta: {
          remoteApproval: {
            decision: 'acceptForSession',
          },
        },
      }),
      requestContext: {
        threadId: 'thread_account_file_session_accept',
      },
    },
  })

  assert.deepEqual(bridge.responses, [{ id: 85, result: 'acceptForSession' }])
})

test('OpenAI account runtime returns acceptWithExecpolicyAmendment for safe request-scoped command downgrades', async () => {
  const scopedRoot = path.join(userDataPath, 'command-scope')
  const outsideRoot = path.join(path.dirname(scopedRoot), 'outside-command-scope')
  const amendment = ['execpolicy-amend', '--workspace-write', path.resolve(scopedRoot)]
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_amendment_accept',
              type: 'commandExecution',
              command: 'npm install left-pad',
              cwd: scopedRoot,
              status: 'inProgress',
              commandActions: [{ type: 'run' }],
            },
          },
        })
        target.emit('server-request', {
          id: 86,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'cmd_account_amendment_accept',
            command: 'npm install left-pad',
            cwd: scopedRoot,
            availableDecisions: ['accept', 'acceptForSession', 'acceptWithExecpolicyAmendment', 'decline', 'cancel'],
            proposedExecpolicyAmendment: amendment,
            additionalPermissions: {
              writableRoots: [scopedRoot, outsideRoot],
            },
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalRequest = null

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Install with scoped write access.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async (request) => {
        approvalRequest = request
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_amendment_accept',
      },
    },
  })

  assert.equal(approvalRequest?.toolName, 'run_command')
  assert.equal(approvalRequest?.projectFolder, path.resolve(scopedRoot))
  assert.deepEqual(bridge.responses, [{
    id: 86,
    result: {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: amendment,
      },
    },
  }])
})

test('OpenAI account runtime fails closed when a command amendment is required but unsupported', async () => {
  const scopedRoot = path.join(userDataPath, 'command-scope-fail-closed')
  const outsideRoot = path.join(path.dirname(scopedRoot), 'outside-command-scope-fail-closed')
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_amendment_decline',
              type: 'commandExecution',
              command: 'npm test',
              cwd: scopedRoot,
              status: 'inProgress',
              commandActions: [{ type: 'run' }],
            },
          },
        })
        target.emit('server-request', {
          id: 87,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'cmd_account_amendment_decline',
            command: 'npm test',
            cwd: scopedRoot,
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
            proposedExecpolicyAmendment: ['execpolicy-amend', '--workspace-write', path.resolve(scopedRoot)],
            additionalPermissions: {
              writableRoots: [scopedRoot, outsideRoot],
            },
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalCalls = 0

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Run tests with unsupported scoped writes.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => {
        approvalCalls += 1
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_amendment_decline',
      },
    },
  })

  assert.equal(approvalCalls, 0)
  assert.deepEqual(bridge.responses, [{ id: 87, result: 'decline' }])
})

test('OpenAI account runtime ignores mismatched approval scopes', async () => {
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_approval_scope',
              type: 'commandExecution',
              command: 'git status',
              cwd: 'C:/repo',
              status: 'inProgress',
              commandActions: [{ type: 'run' }],
            },
          },
        })
        target.emit('server-request', {
          id: 81,
          method: 'item/commandExecution/requestApproval',
          params: {
            threadId: 'thr_other_thread',
            turnId: target.turnId,
            itemId: 'cmd_account_approval_scope',
            command: 'git status',
            cwd: 'C:/repo',
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalCalls = 0

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Run the command.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => {
        approvalCalls += 1
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_scope_guard',
      },
    },
  })

  assert.equal(approvalCalls, 0)
  assert.deepEqual(bridge.responses, [])
})

test('OpenAI account runtime grants only the approved requested permission subset', async () => {
  const readRoot = path.join(userDataPath, 'permission-read')
  const writeRoot = path.join(userDataPath, 'permission-write')
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 811,
          method: 'item/permissions/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'permission_request_1',
            reason: 'Read shared inputs and write generated output.',
            permissions: {
              network: { enabled: true },
              fileSystem: {
                read: [readRoot],
                write: [writeRoot],
              },
            },
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalRequest = null

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Use the requested permission.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async (request) => {
        approvalRequest = request
        return {
          decision: 'approved',
          approvalMeta: {
            remoteApproval: {
              decision: 'acceptForSession',
            },
          },
        }
      },
      requestContext: {
        threadId: 'thread_account_permission_request',
        projectFolder: userDataPath,
      },
    },
  })

  assert.equal(approvalRequest?.itemId, 'permission_request_1')
  assert.equal(approvalRequest?.toolName, 'permission_request')
  assert.equal(approvalRequest?.approvalKind, 'permission_request')
  assert.equal(approvalRequest?.threadId, 'thread_account_permission_request')
  assert.equal(approvalRequest?.providerThreadId, bridge.startThreadId)
  assert.equal(approvalRequest?.turnId, bridge.turnId)
  assert.deepEqual(approvalRequest?.toolInput, {
    reason: 'Read shared inputs and write generated output.',
    permissions: {
      network: { enabled: true },
      fileSystem: {
        read: [path.resolve(readRoot)],
        write: [path.resolve(writeRoot)],
      },
    },
  })
  assert.deepEqual(bridge.responses, [{
    id: 811,
    result: {
      scope: 'session',
      permissions: {
        network: { enabled: true },
        fileSystem: {
          read: [path.resolve(readRoot)],
          write: [path.resolve(writeRoot)],
        },
      },
    },
  }])
})

test('OpenAI account runtime fails closed for unsupported permission shapes', async () => {
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 813,
          method: 'item/permissions/requestApproval',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'permission_request_unknown',
            reason: 'Request an unsupported capability.',
            permissions: {
              network: { enabled: true },
              process: { execute: true },
            },
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  installServiceWithBridge(bridge)
  let approvalCalls = 0

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Do not widen permissions.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'ask',
        commandSafety: {},
      },
      openAIAccountRequestApproval: async () => {
        approvalCalls += 1
        return { decision: 'approved' }
      },
      requestContext: {
        threadId: 'thread_account_permission_unknown',
        projectFolder: userDataPath,
      },
    },
  })

  assert.equal(approvalCalls, 0)
  assert.deepEqual(bridge.responses, [{
    id: 813,
    result: {
      scope: 'turn',
      permissions: {},
    },
  }])
})

test('OpenAI account runtime bridges constrained MCP elicitation and resumes after a typed response', async () => {
  const requested = []
  const resolved = []
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 812,
          method: 'mcpServer/elicitation/request',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            serverName: 'example-mcp',
            mode: 'form',
            message: 'Choose a target.',
            requestedSchema: {
              type: 'object',
              properties: {
                target: {
                  type: 'string',
                  enum: ['staging', 'production'],
                },
              },
              required: ['target'],
            },
          },
        })
      })
    },
    onRespond({ result }, target) {
      if (result?.action !== 'accept') return
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: target.startThreadId,
            turnId: target.turnId,
            item: {
              id: 'msg_after_elicitation',
              type: 'agentMessage',
              text: 'Continuing with production.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: target.startThreadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payloadPromise = createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Request MCP input.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_mcp_elicitation',
      },
      openAIAccountMcpElicitationBridgeContext: {
        onRequest: (payload) => requested.push(payload),
        onResolved: (payload) => resolved.push(payload),
      },
    },
  })

  await flushMicrotasks()
  assert.equal(requested.length, 1)
  assert.equal(requested[0]?.threadId, 'thread_account_mcp_elicitation')
  await respondToOpenAIAccountPendingMcpElicitation({
    threadId: 'thread_account_mcp_elicitation',
    action: 'accept',
    content: { target: 'production' },
  })

  const payload = await payloadPromise
  assert.equal(payload.text, 'Continuing with production.')
  assert.equal(resolved.length, 1)
  assert.equal(resolved[0]?.action, 'accept')
  assert.equal(JSON.stringify(resolved).includes('production'), false)
})

test('OpenAI account runtime returns only whole Unix seconds for currentTime/read', async () => {
  const startedAt = Math.floor(Date.now() / 1_000)
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 814,
          method: 'currentTime/read',
          params: {
            threadId: params.threadId,
          },
        })
      })
    },
    onRespond({ result }, target) {
      if (!Number.isSafeInteger(result?.currentTimeAt)) return
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: target.startThreadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'What time is it?' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_current_time',
      },
    },
  })

  assert.equal(bridge.responses.length, 1)
  assert.deepEqual(Object.keys(bridge.responses[0].result), ['currentTimeAt'])
  assert.ok(bridge.responses[0].result.currentTimeAt >= startedAt)
  assert.ok(bridge.responses[0].result.currentTimeAt <= Math.floor(Date.now() / 1_000))
})

test('OpenAI account runtime rejects unexpected attestation requests without returning a token', async () => {
  const bridge = new FakeBridge({
    onStartTurn(_params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 815,
          method: 'attestation/generate',
          params: {},
        })
      })
    },
    onRespond({ error }, target) {
      if (!error) return
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: target.startThreadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Continue.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_attestation',
      },
    },
  })

  assert.deepEqual(bridge.responses, [{
    id: 815,
    result: null,
    error: {
      code: -32601,
      message: 'Client attestation is not supported by ADDOM.',
    },
  }])
})

test('OpenAI account runtime refreshes managed account state once and rejects external token refresh', async () => {
  let refreshStateCalls = 0
  const bridge = new FakeBridge({
    onStartTurn(_params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 816,
          method: 'account/chatgptAuthTokens/refresh',
          params: {
            reason: 'unauthorized',
            previousAccountId: 'account_1',
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge, {
    refreshState: async () => {
      refreshStateCalls += 1
      return {}
    },
  })

  await assert.rejects(
    createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'Continue.' }],
      options: {
        model: 'gpt-5.4',
        requestContext: {
          threadId: 'thread_account_auth_refresh',
        },
      },
    }),
    (error) => (
      error?.reason === 'account_runtime_auth_refresh_required'
      && /renewed in ADDOM/i.test(String(error?.message || ''))
    ),
  )

  assert.equal(refreshStateCalls, 1)
  assert.deepEqual(bridge.responses, [{
    id: 816,
    result: null,
    error: {
      code: -32001,
      message: 'OpenAI account authorization needs to be renewed in ADDOM.',
    },
  }])
  assert.equal(JSON.stringify(bridge.responses).toLowerCase().includes('token'), false)
})

test('OpenAI account runtime cancels unknown server requests and fails closed', async () => {
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 812,
          method: 'future/serverRequest',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await assert.rejects(
    createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'Request unsupported input.' }],
      options: {
        model: 'gpt-5.4',
        requestContext: {
          threadId: 'thread_account_unknown_server_request',
        },
      },
    }),
    (error) => (
      error?.reason === 'account_runtime_unsupported_server_request'
      && /future\/serverRequest/.test(String(error?.message || ''))
    ),
  )
  assert.deepEqual(bridge.responses, [{
    id: 812,
    result: { cancelled: true },
  }])
})

test('OpenAI account runtime aligns full-access launch policy with ADDOM settings', async () => {
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Continue.' }],
    options: {
      model: 'gpt-5.4',
      openAIAccountApprovalContext: {
        permissionMode: 'full_access',
        commandSafety: {},
      },
      requestContext: {
        threadId: 'thread_account_full_access_launch',
        projectFolder: 'C:/Users/example/Desktop/test/P21',
      },
    },
  })

  assert.equal(bridge.startThreadCalls[0].approvalPolicy, 'never')
  assert.equal(bridge.startThreadCalls[0].permissions, ':danger-full-access')
  assert.equal('sandbox' in bridge.startThreadCalls[0], false)
  assert.equal(bridge.startTurnCalls[0].approvalPolicy, 'never')
  assert.equal(bridge.startTurnCalls[0].permissions, ':danger-full-access')
  assert.equal('sandboxPolicy' in bridge.startTurnCalls[0], false)
})

test('OpenAI account runtime accepts webSearch lifecycle items and records native activity metadata', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_web_search',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'web_account_1',
              type: 'webSearch',
              query: 'Codex app-server item types',
              action: { type: 'search' },
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'web_account_1',
              type: 'webSearch',
              query: 'Codex app-server item types',
              action: { type: 'search' },
              status: 'completed',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Web search finished.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Search the docs.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_web_search',
      },
    },
  })

  assert.equal(payload.text, 'Web search finished.')
  assert.deepEqual(payload.providerResponseMeta?.accountNativeActivity?.webSearch, {
    started: true,
    completed: true,
    itemIds: ['web_account_1'],
    statuses: ['inProgress', 'completed'],
    queries: ['Codex app-server item types'],
    actionTypes: ['search'],
    urls: [],
    patterns: [],
  })
})

test('OpenAI account runtime accepts commandExecution lifecycle and output deltas without aborting the turn', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_command',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_1',
              type: 'commandExecution',
              command: 'git status',
              cwd: 'C:/repo',
              status: 'inProgress',
              commandActions: [{ type: 'run' }],
            },
          },
        })
        target.emit('notification', {
          method: 'item/commandExecution/outputDelta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'cmd_account_1',
            delta: 'On branch main',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_account_1',
              type: 'commandExecution',
              command: 'git status',
              cwd: 'C:/repo',
              status: 'completed',
              commandActions: [{ type: 'run' }],
              aggregatedOutput: 'On branch main',
              exitCode: 0,
              durationMs: 42,
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Command completed.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Run git status.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_command',
      },
    },
  })

  assert.equal(payload.text, 'Command completed.')
  assert.deepEqual(payload.providerResponseMeta?.accountNativeActivity?.commandExecution, {
    started: true,
    completed: true,
    itemIds: ['cmd_account_1'],
    statuses: ['inProgress', 'completed'],
    commands: ['git status'],
    cwds: ['C:/repo'],
    exitCodes: [0],
    durationsMs: [42],
    commandActionKinds: ['run'],
    aggregatedOutput: 'On branch main',
  })
})

for (const mode of ['plan', 'thinking']) {
  test(`OpenAI account runtime ignores the provider userMessage echo in ${mode} mode`, async () => {
    const bridge = new FakeBridge({
      turnId: `turn_account_${mode}_user_echo`,
      onStartTurn(params, target) {
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'item/started',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                id: `user_${mode}_echo`,
                type: 'userMessage',
                content: [{ type: 'text', text: 'Create a plan.' }],
              },
            },
          })
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                id: `assistant_${mode}_echo`,
                type: 'agentMessage',
                text: 'I can help with that plan.',
              },
            },
          })
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      },
    })
    installServiceWithBridge(bridge)

    const payload = await createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'Create a plan.' }],
      options: {
        model: 'gpt-5.4',
        requestContext: {
          threadId: `thread_account_${mode}_user_echo`,
          mode,
        },
        openAIAccountApprovalContext: {
          permissionMode: 'full_access',
        },
      },
    })

    assert.equal(payload.text, 'I can help with that plan.')
    assert.deepEqual(bridge.interruptTurnCalls, [])
  })

  test(`OpenAI account runtime interrupts native tools in ${mode} mode`, async () => {
    const bridge = new FakeBridge({
      turnId: `turn_account_${mode}_tool_guard`,
      onStartTurn(params, target) {
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'item/started',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                id: `cmd_${mode}_guard`,
                type: 'commandExecution',
                command: 'git status',
                cwd: 'C:/repo',
                status: 'inProgress',
              },
            },
          })
        })
      },
    })
    installServiceWithBridge(bridge)

    await assert.rejects(
      () => createOpenAIAccountStreamPayload({
        messages: [{ role: 'user', content: 'Describe a possible approach.' }],
        options: {
          model: 'gpt-5.4',
          requestContext: {
            threadId: `thread_account_${mode}_tool_guard`,
            mode,
          },
          openAIAccountApprovalContext: {
            permissionMode: 'full_access',
          },
        },
      }),
      (error) => error?.reason === 'turn_mode_capability_denied'
        && String(error?.message || '').includes(`${mode} mode`),
    )

    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(bridge.interruptTurnCalls, [{
      threadId: bridge.startThreadId,
      turnId: bridge.turnId,
    }])
    assert.equal(bridge.startTurnCalls[0].approvalPolicy, 'on-request')
    assert.equal(bridge.startTurnCalls[0].permissions, ':read-only')
    assert.equal('sandboxPolicy' in bridge.startTurnCalls[0], false)
  })
}

test('OpenAI account runtime treats Plan content lifecycle as non-executable activity', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_plan_content_lifecycle',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        for (const item of [
          { id: 'reasoning_plan_content', type: 'reasoning', summary: ['Inspecting the project.'] },
          { id: 'plan_plan_content', type: 'plan', text: 'Inspect, decide, then document.' },
        ]) {
          target.emit('notification', {
            method: 'item/started',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item,
            },
          })
        }
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'assistant_plan_content',
              type: 'agentMessage',
              text: 'The plan is ready for review.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Create a plan.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_plan_content_lifecycle',
        mode: 'plan',
      },
      openAIAccountApprovalContext: {
        permissionMode: 'full_access',
      },
    },
  })

  assert.equal(payload.text, 'The plan is ready for review.')
  assert.deepEqual(bridge.interruptTurnCalls, [])
})

test('OpenAI account runtime accepts fileChange lifecycle and output deltas without aborting the turn', async () => {
  const seenStatuses = []
  const seenOutputs = []
  const bridge = new FakeBridge({
    turnId: 'turn_account_file_change',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_account_1',
              type: 'fileChange',
              status: 'inProgress',
              changes: [{
                path: 'src/app.mjs',
                kind: { type: 'modify' },
                diff: [
                  '@@ -1,2 +1,3 @@',
                  ' export function run() {',
                  '-  return "old"',
                  '+  return "new"',
                  '+  return "extra"',
                  ' }',
                ].join('\n'),
              }],
            },
          },
        })
        target.emit('notification', {
          method: 'item/fileChange/outputDelta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'file_account_1',
            delta: 'apply_patch succeeded',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_account_1',
              type: 'fileChange',
              status: 'completed',
              changes: [
                {
                  path: 'src/app.mjs',
                  kind: { type: 'modify' },
                  diff: [
                    '@@ -1,2 +1,3 @@',
                    ' export function run() {',
                    '-  return "old"',
                    '+  return "new"',
                    '+  return "extra"',
                    ' }',
                  ].join('\n'),
                },
                {
                  path: 'src/new-file.mjs',
                  kind: { type: 'create' },
                  diff: [
                    'export const created = true',
                    'export const probe = true',
                  ].join('\n'),
                },
              ],
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Files updated.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Apply the patch.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_file_change',
      },
    },
    onProviderToolOutput: (output) => {
      seenOutputs.push(output)
    },
    onProviderToolStatus: (status) => {
      seenStatuses.push(status)
    },
  })

  assert.equal(payload.text, 'Files updated.')
  assert.equal(seenStatuses.filter((entry) => entry.toolCallId === 'file_account_1').length, 2)
  assert.deepEqual(
    [...new Set(
      seenStatuses
        .filter((entry) => entry.toolCallId === 'file_account_1')
        .map((entry) => entry.toolName),
    )],
    ['file_change'],
  )
  assert.equal(
    seenOutputs.filter((entry) => entry.toolCallId === 'file_account_1').length,
    1,
  )
  assert.equal(
    seenOutputs.some((entry) => (
      entry.toolName === 'file_change'
      && Array.isArray(entry.output?.changes)
      && entry.output.changes.some((change) => (
        change.path === 'src/new-file.mjs'
        && change.kind?.type === 'create'
        && change.addedLines === 2
        && change.removedLines === 0
        && String(change.diff || '').startsWith('@@ -1,0 +1,2 @@')
        && String(change.diff || '').includes('+export const created = true')
      ))
    )),
    true,
  )
  assert.deepEqual(payload.providerResponseMeta?.accountNativeActivity?.fileChange, {
    started: true,
    completed: true,
    itemIds: ['file_account_1'],
    statuses: ['inProgress', 'completed'],
    changes: [
      {
        path: 'src/app.mjs',
        kind: { type: 'modify' },
        diff: [
          '@@ -1,2 +1,3 @@',
          ' export function run() {',
          '-  return "old"',
          '+  return "new"',
          '+  return "extra"',
          ' }',
        ].join('\n'),
      },
      {
        path: 'src/new-file.mjs',
        kind: { type: 'create' },
        diff: [
          'export const created = true',
          'export const probe = true',
        ].join('\n'),
      },
    ],
    paths: ['src/app.mjs', 'src/new-file.mjs'],
    changeKinds: ['modify', 'create'],
    outputPreview: 'apply_patch succeeded',
  })
})

test('OpenAI account runtime accepts mcpToolCall lifecycle items and records provider metadata', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_mcp',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'mcp_account_1',
              type: 'mcpToolCall',
              server: 'filesystem',
              tool: 'read_file',
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'mcp_account_1',
              type: 'mcpToolCall',
              server: 'filesystem',
              tool: 'read_file',
              status: 'failed',
              error: { message: 'Permission denied' },
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'MCP call failed cleanly.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Use MCP if needed.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_mcp',
      },
    },
  })

  assert.equal(payload.text, 'MCP call failed cleanly.')
  assert.deepEqual(payload.providerResponseMeta?.accountNativeActivity?.mcpToolCall, {
    started: true,
    completed: true,
    itemIds: ['mcp_account_1'],
    statuses: ['inProgress', 'failed'],
    servers: ['filesystem'],
    tools: ['read_file'],
    errorMessages: ['Permission denied'],
  })
})

test('OpenAI account runtime emits ordered durable plan, diff, terminal, and MCP progress updates', async () => {
  const seenStatuses = []
  const bridge = new FakeBridge({
    turnId: 'turn_account_progress',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        const emit = (method, payload) => target.emit('notification', {
          method,
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            ...payload,
          },
        })
        emit('turn/plan/updated', {
          explanation: 'Review before editing.',
          plan: [
            { step: 'Inspect', status: 'inProgress' },
            { step: 'Fix', status: 'pending' },
          ],
        })
        emit('turn/diff/updated', {
          diff: '@@ -1 +1 @@\n-old\n+new',
        })
        emit('item/started', {
          item: {
            id: 'cmd_progress_1',
            type: 'commandExecution',
            command: 'node app.mjs',
            status: 'inProgress',
          },
        })
        emit('item/commandExecution/terminalInteraction', {
          itemId: 'cmd_progress_1',
          processId: 'process-private-id',
          stdin: 'super-secret\n',
        })
        emit('item/started', {
          item: {
            id: 'mcp_progress_1',
            type: 'mcpToolCall',
            server: 'filesystem',
            tool: 'read_file',
            status: 'inProgress',
          },
        })
        emit('item/mcpToolCall/progress', {
          itemId: 'mcp_progress_1',
          message: 'Reading src/app.mjs',
        })
        emit('item/mcpToolCall/progress', {
          itemId: 'mcp_progress_1',
          message: 'Reviewing exports',
        })
        emit('turn/plan/updated', {
          explanation: 'Review complete.',
          plan: [
            { step: 'Inspect', status: 'completed' },
            { step: 'Fix', status: 'inProgress' },
          ],
        })
        emit('turn/diff/updated', {
          diff: '@@ -1 +1,2 @@\n-old\n+new\n+extra',
        })
        emit('item/completed', {
          item: {
            id: 'cmd_progress_1',
            type: 'commandExecution',
            command: 'node app.mjs',
            status: 'completed',
            exitCode: 0,
          },
        })
        emit('item/completed', {
          item: {
            id: 'mcp_progress_1',
            type: 'mcpToolCall',
            server: 'filesystem',
            tool: 'read_file',
            status: 'completed',
          },
        })
        emit('item/completed', {
          item: {
            type: 'agentMessage',
            text: 'Progress captured.',
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Track progress.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_progress',
      },
    },
    onProviderToolStatus: (status) => seenStatuses.push(status),
  })

  const progressStatuses = seenStatuses.filter((entry) => entry.durable === true)
  assert.equal(payload.text, 'Progress captured.')
  assert.deepEqual(
    progressStatuses.map((entry) => entry.activityKind),
    [
      'openai_account_turn_plan',
      'openai_account_turn_diff',
      'openai_account_terminal_interaction',
      'openai_account_mcp_progress',
      'openai_account_mcp_progress',
      'openai_account_turn_plan',
      'openai_account_turn_diff',
    ],
  )
  assert.equal(progressStatuses[0].toolCallId, progressStatuses[5].toolCallId)
  assert.equal(progressStatuses[1].toolCallId, progressStatuses[6].toolCallId)
  assert.equal(progressStatuses[3].toolCallId, progressStatuses[4].toolCallId)
  assert.equal(progressStatuses[0].type, 'completed')
  assert.equal(progressStatuses[1].type, 'completed')
  assert.equal(progressStatuses[2].type, 'running')
  assert.match(progressStatuses[0].delta, /\[-\] Inspect/)
  assert.match(progressStatuses[5].delta, /\[x\] Inspect/)
  assert.match(progressStatuses[6].delta, /\+extra/)
  assert.equal(progressStatuses[2].delta, 'Terminal input sent (13 characters).')
  assert.doesNotMatch(JSON.stringify(progressStatuses), /super-secret|process-private-id/)
  assert.equal(payload.providerResponseMeta?.accountProtocol?.unknownActivities?.length || 0, 0)
})

test('OpenAI account runtime preserves one turn while persisting requested and rerouted model identity', async () => {
  const seenStatuses = []
  const bridge = new FakeBridge({
    turnId: 'turn_account_rerouted',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'model/rerouted',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            fromModel: 'gpt-5.3-codex',
            toModel: 'gpt-5.2',
            reason: 'highRiskCyberActivity',
          },
        })
        target.emit('notification', {
          method: 'model/rerouted',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            fromModel: 'gpt-5.3-codex',
            toModel: 'gpt-5.2',
            reason: 'highRiskCyberActivity',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Completed on the routed model.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Run the safety-sensitive task.' }],
    options: {
      model: 'gpt-5.3-codex',
      requestContext: {
        threadId: 'thread_account_rerouted',
      },
    },
    onProviderToolStatus: (status) => seenStatuses.push(status),
  })

  assert.equal(bridge.startTurnCalls.length, 1)
  assert.equal(payload.text, 'Completed on the routed model.')
  assert.deepEqual(seenStatuses.filter((entry) => entry.durable === true), [{
    type: 'completed',
    toolCallId: 'model_reroute:turn_account_rerouted',
    toolName: 'model_reroute',
    model: 'gpt-5.2',
    delta: 'gpt-5.3-codex → gpt-5.2 · highRiskCyberActivity',
    activityKind: 'openai_account_model_reroute',
    durable: true,
    providerExecuted: true,
  }])
  assert.equal(payload.providerResponseMeta?.requestedModelId, 'gpt-5.3-codex')
  assert.equal(payload.providerResponseMeta?.modelId, 'gpt-5.2')
  assert.deepEqual(payload.providerResponseMeta?.accountModelReroutes, [{
    fromModel: 'gpt-5.3-codex',
    toModel: 'gpt-5.2',
    reason: 'highRiskCyberActivity',
  }])
  assert.equal(payload.providerResponseMeta?.accountBridgeTurnId, 'turn_account_rerouted')
  assert.equal(payload.providerResponseMeta?.accountProtocol?.unknownActivities?.length || 0, 0)
})

test('OpenAI account runtime projects config warnings, hooks, and automatic approval review without hidden payloads', async () => {
  const seenStatuses = []
  const bridge = new FakeBridge({
    turnId: 'turn_account_safety_activity',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        const emit = (method, payload) => target.emit('notification', {
          method,
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            ...payload,
          },
        })
        emit('configWarning', {
          summary: 'Invalid project setting',
          details: 'Using the default value.',
          path: 'C:/private/config.toml',
        })
        emit('configWarning', {
          summary: 'Invalid project setting',
          details: 'Using the default value.',
          path: 'C:/private/config.toml',
        })
        emit('hook/started', {
          run: {
            id: 'private-hook-run-id',
            eventName: 'preToolUse',
            handlerType: 'prompt',
            executionMode: 'sync',
            scope: 'project',
            sourcePath: 'C:/private/hooks/secret.md',
            displayOrder: 3,
            status: 'running',
            statusMessage: 'hidden prompt content',
            entries: [{ text: 'private hook output' }],
          },
        })
        emit('hook/completed', {
          run: {
            id: 'private-hook-run-id',
            eventName: 'preToolUse',
            handlerType: 'prompt',
            executionMode: 'sync',
            scope: 'project',
            sourcePath: 'C:/private/hooks/secret.md',
            displayOrder: 3,
            status: 'completed',
            statusMessage: 'hidden prompt content',
            entries: [{ text: 'private hook output' }],
          },
        })
        emit('item/autoApprovalReview/started', {
          targetItemId: 'cmd_reviewed_1',
          review: {
            status: 'inProgress',
            riskScore: 0.8,
            riskLevel: 'high',
            rationale: 'private guardian rationale',
          },
          action: { command: 'private command' },
        })
        emit('item/autoApprovalReview/completed', {
          targetItemId: 'cmd_reviewed_1',
          review: {
            status: 'denied',
            riskScore: 0.8,
            riskLevel: 'high',
            rationale: 'private guardian rationale',
          },
          action: { command: 'private command' },
        })
        emit('item/completed', {
          item: {
            type: 'agentMessage',
            text: 'Safety activity handled.',
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Run the checked task.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: { threadId: 'thread_account_safety_activity' },
    },
    onProviderToolStatus: (status) => seenStatuses.push(status),
  })

  const durableStatuses = seenStatuses.filter((entry) => entry.durable === true)
  assert.equal(payload.text, 'Safety activity handled.')
  assert.deepEqual(
    durableStatuses.map((entry) => entry.activityKind),
    [
      'openai_account_config_warning',
      'openai_account_hook',
      'openai_account_hook',
      'openai_account_auto_approval_review',
      'openai_account_auto_approval_review',
    ],
  )
  assert.equal(durableStatuses[1].toolCallId, durableStatuses[2].toolCallId)
  assert.equal(durableStatuses[3].toolCallId, durableStatuses[4].toolCallId)
  assert.equal(durableStatuses[4].type, 'failed')
  assert.doesNotMatch(
    JSON.stringify({ durableStatuses, providerMeta: payload.providerResponseMeta }),
    /private-hook-run-id|secret\.md|hidden prompt content|private hook output|private guardian rationale|private command|config\.toml/,
  )
  assert.equal(payload.providerResponseMeta?.accountProtocol?.unknownActivities?.length || 0, 0)
})

test('OpenAI account runtime exposes retryable errors once and retains prior streamed output', async () => {
  const chunks = []
  const seenStatuses = []
  const bridge = new FakeBridge({
    turnId: 'turn_account_retryable_error',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            delta: 'Partial result. ',
          },
        })
        target.emit('notification', {
          method: 'error',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            willRetry: true,
            error: {
              message: 'Temporary provider failure.',
              additionalDetails: 'private upstream response',
              codexErrorInfo: null,
            },
          },
        })
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            delta: 'Recovered.',
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Recover if possible.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: { threadId: 'thread_account_retryable_error' },
    },
    onChunk: (chunk) => chunks.push(chunk),
    onProviderToolStatus: (status) => seenStatuses.push(status),
  })

  assert.deepEqual(chunks, [
    { chunk: 'Partial result. ', phase: ASSISTANT_PHASE_COMMENTARY },
    { chunk: 'Recovered.', phase: ASSISTANT_PHASE_COMMENTARY },
  ])
  assert.equal(payload.text, 'Partial result. Recovered.')
  assert.deepEqual(
    seenStatuses.filter((entry) => entry.activityKind === 'openai_account_turn_error'),
    [{
      type: 'warning',
      toolCallId: 'provider_error:turn_account_retryable_error',
      toolName: 'provider_error',
      delta: 'Temporary provider failure.\nretrying: true',
      activityKind: 'openai_account_turn_error',
      durable: true,
      providerExecuted: true,
    }],
  )
  assert.doesNotMatch(JSON.stringify(payload), /private upstream response/)
})

test('OpenAI account runtime fails a non-retryable error after exposing prior output and a sanitized failure row', async () => {
  const chunks = []
  const seenStatuses = []
  const bridge = new FakeBridge({
    turnId: 'turn_account_fatal_error',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            delta: 'Completed useful work before failure.',
          },
        })
        target.emit('notification', {
          method: 'error',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            willRetry: false,
            error: {
              message: 'Provider connection closed.',
              additionalDetails: 'private transport diagnostics',
              codexErrorInfo: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await assert.rejects(
    () => createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'Keep partial progress visible.' }],
      options: {
        model: 'gpt-5.4',
        requestContext: { threadId: 'thread_account_fatal_error' },
      },
      onChunk: (chunk) => chunks.push(chunk),
      onProviderToolStatus: (status) => seenStatuses.push(status),
    }),
    /Provider connection closed\./,
  )

  assert.deepEqual(chunks, [{
    chunk: 'Completed useful work before failure.',
    phase: ASSISTANT_PHASE_COMMENTARY,
  }])
  assert.deepEqual(
    seenStatuses.filter((entry) => entry.activityKind === 'openai_account_turn_error'),
    [{
      type: 'failed',
      toolCallId: 'provider_error:turn_account_fatal_error',
      toolName: 'provider_error',
      delta: 'Provider connection closed.',
      activityKind: 'openai_account_turn_error',
      durable: true,
      providerExecuted: true,
    }],
  )
  assert.doesNotMatch(JSON.stringify(seenStatuses), /private transport diagnostics/)
})

test('OpenAI account runtime accepts imageView lifecycle items and records viewed paths', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_image_view',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'img_account_1',
              type: 'imageView',
              path: 'C:/repo/screenshots/issue.png',
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'img_account_1',
              type: 'imageView',
              path: 'C:/repo/screenshots/issue.png',
              status: 'completed',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Reviewed the screenshot.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Inspect the screenshot.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_image_view',
      },
    },
  })

  assert.equal(payload.text, 'Reviewed the screenshot.')
  assert.deepEqual(payload.providerResponseMeta?.accountNativeActivity?.imageView, {
    started: true,
    completed: true,
    itemIds: ['img_account_1'],
    statuses: ['inProgress', 'completed'],
    paths: ['C:/repo/screenshots/issue.png'],
  })
})

test('OpenAI account runtime accepts imageGeneration without exposing image bytes and suspends stale timeout while it runs', async () => {
  const rawImageResult = `data:image/png;base64,${'a'.repeat(8_000)}`
  const bridge = new FakeBridge({
    turnId: 'turn_account_image_generation',
    onStartTurn(params, target) {
      setTimeout(() => {
        const startedNotification = {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'img_gen_account_1',
              type: 'imageGeneration',
              result: '',
              revisedPrompt: null,
              savedPath: null,
              status: 'inProgress',
            },
          },
        }
        target.emit('notification', startedNotification)
        target.emit('notification', startedNotification)
      }, 0)
      setTimeout(() => {
        const completedNotification = {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'img_gen_account_1',
              type: 'imageGeneration',
              result: rawImageResult,
              revisedPrompt: 'A refined architectural landing-page hero image.',
              savedPath: 'C:/repo/generated/hero.png',
              status: 'completed',
            },
          },
        }
        target.emit('notification', completedNotification)
        target.emit('notification', completedNotification)
      }, 85)
      setTimeout(() => {
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Generated the hero image and completed the page.',
            },
          },
        })
      }, 90)
      setTimeout(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      }, 95)
    },
  })
  installServiceWithBridge(bridge)

  const seenStatuses = []
  const seenOutputs = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Generate the landing-page imagery.' }],
    options: {
      model: 'gpt-5.6-luna',
      streamTimeoutMs: 180,
      streamIdleTimeoutMs: 25,
      requestContext: {
        threadId: 'thread_account_image_generation',
      },
    },
    onProviderToolStatus: (status) => seenStatuses.push(status),
    onProviderToolOutput: (output) => seenOutputs.push(output),
  })

  assert.equal(payload.text, 'Generated the hero image and completed the page.')
  assert.equal(bridge.interruptTurnCalls.length, 0)
  assert.deepEqual(payload.providerResponseMeta?.accountNativeActivity?.imageGeneration, {
    started: true,
    completed: true,
    itemIds: ['img_gen_account_1'],
    statuses: ['inProgress', 'completed'],
    revisedPrompts: ['A refined architectural landing-page hero image.'],
    savedPaths: ['C:/repo/generated/hero.png'],
    resultAvailable: true,
  })
  assert.equal(seenStatuses.filter((entry) => entry.toolName === 'image_generation').length, 1)
  assert.deepEqual(seenOutputs, [{
    type: 'tool-output-available',
    toolCallId: 'img_gen_account_1',
    toolName: 'image_generation',
    output: {
      type: 'imageGeneration',
      status: 'completed',
      revisedPrompt: 'A refined architectural landing-page hero image.',
      savedPath: 'C:/repo/generated/hero.png',
      resultAvailable: true,
    },
    providerExecuted: true,
  }])
  assert.equal(JSON.stringify(payload).includes(rawImageResult), false)
})

test('OpenAI account runtime accepts plan items and uses the final plan text as the turn output when no agent message arrives', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_plan',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/plan/delta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'plan_account_1',
            delta: 'Step 1: inspect\n',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'plan_account_1',
              type: 'plan',
              status: 'completed',
              text: 'Step 1: inspect\nStep 2: implement',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const chunks = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Make a plan.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_plan',
      },
    },
    onChunk: (chunk) => chunks.push(chunk),
  })

  assert.deepEqual(chunks, ['Step 1: inspect\n'])
  assert.equal(payload.text, 'Step 1: inspect\nStep 2: implement')
  assert.deepEqual(payload.providerResponseMeta?.accountNativeActivity?.plan, {
    started: true,
    completed: true,
    itemIds: ['plan_account_1'],
    statuses: ['completed'],
    text: 'Step 1: inspect\nStep 2: implement',
  })
})

test('OpenAI account runtime accepts review-mode lifecycle items and records entry and exit metadata', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_review_mode',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'review_enter_1',
              type: 'enteredReviewMode',
              review: { id: 'review_session_1' },
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'review_enter_1',
              type: 'enteredReviewMode',
              review: { id: 'review_session_1' },
            },
          },
        })
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'review_exit_1',
              type: 'exitedReviewMode',
              review: { id: 'review_session_1' },
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'review_exit_1',
              type: 'exitedReviewMode',
              review: { id: 'review_session_1' },
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Review finished.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Review the patch.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_review_mode',
      },
    },
  })

  assert.equal(payload.text, 'Review finished.')
  assert.deepEqual(payload.providerResponseMeta?.accountNativeActivity?.reviewMode, {
    itemIds: ['review_enter_1', 'review_exit_1'],
    reviewIds: ['review_session_1'],
    itemTypes: ['enteredReviewMode', 'exitedReviewMode'],
    entered: true,
    exited: true,
  })
})

test('OpenAI account runtime emits normalized provider-tool events for account-native activity', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_native_provider_events',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'web_evt_1',
              type: 'webSearch',
              query: 'Codex app-server',
              action: { type: 'search' },
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'web_evt_1',
              type: 'webSearch',
              query: 'Codex app-server',
              action: { type: 'search' },
              status: 'completed',
            },
          },
        })
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_evt_1',
              type: 'commandExecution',
              command: 'git status',
              cwd: 'C:/repo',
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/commandExecution/outputDelta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'cmd_evt_1',
            delta: 'On branch main',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmd_evt_1',
              type: 'commandExecution',
              command: 'git status',
              cwd: 'C:/repo',
              status: 'completed',
              aggregatedOutput: 'On branch main',
              exitCode: 0,
            },
          },
        })
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_evt_1',
              type: 'fileChange',
              status: 'inProgress',
              changes: [{ path: 'src/app.mjs', kind: 'modify' }],
            },
          },
        })
        target.emit('notification', {
          method: 'item/fileChange/outputDelta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'file_evt_1',
            delta: 'apply_patch succeeded',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'file_evt_1',
              type: 'fileChange',
              status: 'completed',
              changes: [{ path: 'src/app.mjs', kind: 'modify' }],
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'mcp_evt_1',
              type: 'mcpToolCall',
              server: 'filesystem',
              tool: 'read_file',
              status: 'completed',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'img_evt_1',
              type: 'imageView',
              path: 'C:/repo/image.png',
              status: 'completed',
            },
          },
        })
        target.emit('notification', {
          method: 'item/plan/delta',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'plan_evt_1',
            delta: 'Step 1: inspect',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'plan_evt_1',
              type: 'plan',
              status: 'completed',
              text: 'Step 1: inspect\nStep 2: implement',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'review_enter_evt_1',
              type: 'enteredReviewMode',
              review: { id: 'review_evt_1' },
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'review_exit_evt_1',
              type: 'exitedReviewMode',
              review: { id: 'review_evt_1' },
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Native activities emitted.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const seenStatuses = []
  const seenOutputs = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Do several native activities.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_native_provider_events',
      },
    },
    onProviderToolStatus: (status) => seenStatuses.push(status),
    onProviderToolOutput: (output) => seenOutputs.push(output),
  })

  assert.equal(payload.text, 'Native activities emitted.')
  assert.equal(seenStatuses.some((entry) => entry.toolName === 'web_search'), true)
  assert.equal(seenStatuses.some((entry) => entry.toolName === 'command_execution' && String(entry.delta || '').includes('On branch main')), true)
  assert.equal(seenStatuses.some((entry) => entry.toolName === 'file_change' && String(entry.delta || '').includes('apply_patch succeeded')), true)
  assert.equal(seenStatuses.some((entry) => entry.toolName === 'plan' && String(entry.delta || '').includes('Step 1: inspect')), true)
  assert.deepEqual(
    new Set(seenOutputs.map((entry) => entry.toolName)),
    new Set(['web_search', 'command_execution', 'mcp_tool_call', 'image_view', 'plan', 'review_mode']),
  )
  assert.deepEqual(
    new Set(payload.providerToolOutputs.map((entry) => entry.toolName)),
    new Set(['web_search', 'command_execution', 'mcp_tool_call', 'image_view', 'plan', 'review_mode']),
  )
})

test('OpenAI account runtime ignores hidden hookPrompt content without warning or persistence', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_unknown_activity',
    runtimeIdentity: {
      executable: 'codex.exe',
      version: '0.124.0',
      platformFamily: 'desktop',
      platformOs: 'windows',
    },
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'hook_prompt_1',
              type: 'hookPrompt',
              fragments: [{
                text: 'secret provider instruction',
                hookRunId: 'private-hook-run-1',
              }],
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'hook_prompt_1',
              type: 'hookPrompt',
              fragments: [{
                text: 'secret provider instruction',
                hookRunId: 'private-hook-run-1',
              }],
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Completed despite future provider activity.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const warnings = []
  const seenStatuses = []
  const seenOutputs = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Do something strange.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_unknown_activity',
      },
    },
    onProviderWarning: (warning) => warnings.push(warning),
    onProviderToolStatus: (status) => seenStatuses.push(status),
    onProviderToolOutput: (output) => seenOutputs.push(output),
  })

  assert.equal(payload.text, 'Completed despite future provider activity.')
  assert.deepEqual(warnings, [])
  assert.deepEqual(seenStatuses, [])
  assert.deepEqual(seenOutputs, [])
  assert.deepEqual(payload.providerResponseMeta?.accountProtocol?.runtime, {
    executable: 'codex.exe',
    version: '0.124.0',
    platformFamily: 'desktop',
    platformOs: 'windows',
  })
  assert.deepEqual(payload.providerResponseMeta?.accountProtocol?.unknownActivities, [])
  assert.equal(payload.providerResponseMeta?.accountNativeActivity, undefined)
  assert.equal(JSON.stringify(payload).includes('secret provider instruction'), false)
  assert.equal(JSON.stringify(payload).includes('private-hook-run-1'), false)
})

test('OpenAI account runtime retains scoped unknown notifications without persisting their payload', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_unknown_notification',
    runtimeIdentity: {
      executable: 'codex.exe',
      version: '0.124.0',
      platformFamily: 'desktop',
      platformOs: 'windows',
    },
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/futureSummary/updated',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            diff: 'private source diff',
          },
        })
        target.emit('notification', {
          method: 'turn/futureSummary/updated',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            diff: 'second private source diff',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Completed after an unknown notification.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const warnings = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Observe future notification behavior.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_unknown_notification',
      },
    },
    onProviderWarning: (warning) => warnings.push(warning),
  })

  assert.equal(payload.text, 'Completed after an unknown notification.')
  assert.equal(warnings.length, 1)
  assert.equal(
    warnings[0]?.meta?.dedupeKey,
    'openai_account_protocol_drift:0.124.0:notification:turn/futureSummary/updated',
  )
  assert.deepEqual(payload.providerResponseMeta?.accountProtocol?.unknownActivities, [{
    protocolMethod: 'turn/futureSummary/updated',
    itemType: '',
    itemId: '',
    lifecycle: 'notification',
    providerStatus: '',
    supportStatus: 'unknown',
    handlerId: 'sanitized_unknown_activity',
    reason: 'unregistered_protocol_notification',
    runtimeVersion: '0.124.0',
  }])
  assert.equal(JSON.stringify(payload).includes('private source diff'), false)
  assert.equal(JSON.stringify(payload).includes('second private source diff'), false)
})

test('OpenAI account runtime fails closed for malformed item notifications without a valid item type', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_malformed_activity',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'malformed_1',
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await assert.rejects(
    () => createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'Handle malformed activity.' }],
      options: {
        model: 'gpt-5.4',
        requestContext: {
          threadId: 'thread_account_malformed_activity',
        },
      },
    }),
    (error) => {
      assert.equal(error?.reason, 'account_runtime_malformed_activity')
      return true
    },
  )
})

test('OpenAI account runtime fails closed for malformed durable progress notifications', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_malformed_progress',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/mcpToolCall/progress',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            message: 'Missing the required item identity.',
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await assert.rejects(
    () => createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'Handle malformed progress.' }],
      options: {
        model: 'gpt-5.4',
        requestContext: {
          threadId: 'thread_account_malformed_progress',
        },
      },
    }),
    (error) => {
      assert.equal(error?.reason, 'account_runtime_malformed_activity')
      return true
    },
  )
})

test('OpenAI account runtime fails closed for malformed model reroute notifications', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_malformed_reroute',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'model/rerouted',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            fromModel: 'gpt-5.4',
            reason: 'highRiskCyberActivity',
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await assert.rejects(
    () => createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'Handle malformed routing.' }],
      options: {
        model: 'gpt-5.4',
        requestContext: {
          threadId: 'thread_account_malformed_reroute',
        },
      },
    }),
    (error) => {
      assert.equal(error?.reason, 'account_runtime_malformed_activity')
      return true
    },
  )
})

test('OpenAI account runtime accepts contextCompaction lifecycle items without aborting the turn', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_compaction',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmp_account_1',
              type: 'contextCompaction',
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmp_account_1',
              type: 'contextCompaction',
              status: 'completed',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Compaction finished and the answer continued.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const compactionEvents = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Continue after compaction.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_compaction',
      },
    },
    onCompactionEvent: (event) => compactionEvents.push(event),
  })

  assert.equal(payload.text, 'Compaction finished and the answer continued.')
  assert.deepEqual(payload.providerResponseMeta?.accountCompaction, {
    started: true,
    completed: true,
    itemIds: ['cmp_account_1'],
  })
  assert.deepEqual(compactionEvents.map((event) => event.status), ['running', 'applied'])
  assert.deepEqual(compactionEvents.map((event) => event.contextCompactionGeneration), [0, 1])
  assert.equal(compactionEvents[1]?.accountBridgeThreadId, bridge.startThreadId)
  assert.equal(compactionEvents[1]?.accountBridgeTurnId, bridge.turnId)
  assert.equal(compactionEvents[1]?.compactionEventOccurred, true)
  assert.equal(compactionEvents[1]?.usageRefreshState, 'recalculating')
  assert.equal(payload.providerResponseMeta?.contextCompactionGeneration, 1)
})

test('OpenAI account runtime accepts collaboration lifecycle items without aborting the turn', async () => {
  const collaborationEvents = []
  const bridge = new FakeBridge({
    turnId: 'turn_account_collab',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'collab_account_1',
              type: 'collabAgentToolCall',
              tool: 'spawn_agent',
              senderThreadId: params.threadId,
              receiverThreadId: 'thr_worker_1',
              agentStatus: 'inProgress',
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'collab_account_1',
              type: 'collabToolCall',
              tool: 'spawn_agent',
              senderThreadId: params.threadId,
              receiverThreadId: 'thr_worker_1',
              newThreadId: 'thr_worker_1',
              agentStatus: 'completed',
              status: 'completed',
            },
          },
        })
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'collab_account_2',
              type: 'collabAgentToolCall',
              tool: 'spawn_agent',
              senderThreadId: params.threadId,
              receiverThreadId: 'thr_worker_2',
              agentStatus: 'inProgress',
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'collab_account_2',
              type: 'collabToolCall',
              tool: 'spawn_agent',
              senderThreadId: params.threadId,
              receiverThreadId: 'thr_worker_2',
              newThreadId: 'thr_worker_2',
              agentStatus: 'completed',
              status: 'completed',
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Collaboration finished and the answer continued.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Use two agents if helpful.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_collab',
      },
    },
    onCollaborationEvent: (event) => collaborationEvents.push(event),
  })

  assert.equal(payload.text, 'Collaboration finished and the answer continued.')
  assert.deepEqual(payload.providerResponseMeta?.accountCollaboration, {
    started: true,
    completed: true,
    itemIds: ['collab_account_1', 'collab_account_2'],
    itemTypes: ['collabAgentToolCall', 'collabToolCall'],
    toolNames: ['spawn_agent'],
    agentStatuses: ['inProgress', 'completed'],
    receiverThreadIds: ['thr_worker_1', 'thr_worker_2'],
    newThreadIds: ['thr_worker_1', 'thr_worker_2'],
    events: [
      {
        providerEventId: 'collab_account_1:started:collabAgentToolCall',
        providerActivityId: 'collab_account_1',
        spawnRequestId: 'collab_account_1',
        parentProviderThreadId: 'thr_account_1',
        providerThreadId: 'thr_worker_1',
        toolName: 'spawn_agent',
        phase: 'started',
        status: 'running',
      },
      {
        providerEventId: 'collab_account_1:completed:collabToolCall',
        providerActivityId: 'collab_account_1',
        spawnRequestId: 'collab_account_1',
        parentProviderThreadId: 'thr_account_1',
        providerThreadId: 'thr_worker_1',
        toolName: 'spawn_agent',
        phase: 'completed',
        status: 'completed',
      },
      {
        providerEventId: 'collab_account_2:started:collabAgentToolCall',
        providerActivityId: 'collab_account_2',
        spawnRequestId: 'collab_account_2',
        parentProviderThreadId: 'thr_account_1',
        providerThreadId: 'thr_worker_2',
        toolName: 'spawn_agent',
        phase: 'started',
        status: 'running',
      },
      {
        providerEventId: 'collab_account_2:completed:collabToolCall',
        providerActivityId: 'collab_account_2',
        spawnRequestId: 'collab_account_2',
        parentProviderThreadId: 'thr_account_1',
        providerThreadId: 'thr_worker_2',
        toolName: 'spawn_agent',
        phase: 'completed',
        status: 'completed',
      },
    ],
  })
  assert.deepEqual(collaborationEvents, payload.providerResponseMeta.accountCollaboration.events)
})

test('OpenAI account runtime preserves mixed native collaboration and dynamic-tool activity in the same turn', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_mixed_collab',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'collab_mixed_1',
              type: 'collabAgentToolCall',
              tool: 'spawn_agent',
              senderThreadId: params.threadId,
              receiverThreadId: 'thr_worker_mixed_1',
              agentStatus: 'inProgress',
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'dyn_mixed_1',
              type: 'dynamicToolCall',
              tool: 'read_file',
              arguments: { path: 'src/main/app.mjs' },
              status: 'inProgress',
            },
          },
        })
        target.emit('server-request', {
          id: 144,
          method: 'item/tool/call',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'dyn_mixed_1',
            tool: 'read_file',
            arguments: { path: 'src/main/app.mjs' },
          },
        })
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                id: 'dyn_mixed_1',
                type: 'dynamicToolCall',
                tool: 'read_file',
                arguments: { path: 'src/main/app.mjs' },
                status: 'completed',
                success: true,
                contentItems: [{ type: 'inputText', text: 'mixed file contents' }],
              },
            },
          })
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                id: 'collab_mixed_1',
                type: 'collabToolCall',
                tool: 'spawn_agent',
                senderThreadId: params.threadId,
                receiverThreadId: 'thr_worker_mixed_1',
                newThreadId: 'thr_worker_mixed_1',
                agentStatus: 'completed',
                status: 'completed',
              },
            },
          })
          target.emit('notification', {
            method: 'item/completed',
            params: {
              threadId: params.threadId,
              turnId: target.turnId,
              item: {
                type: 'agentMessage',
                text: 'Native collaboration and local tool execution both completed.',
              },
            },
          })
          target.emit('notification', {
            method: 'turn/completed',
            params: {
              threadId: params.threadId,
              turn: {
                id: target.turnId,
                status: 'completed',
                error: null,
              },
            },
          })
        })
      })
    },
  })
  bridge.listCollaborationModes = async () => ([
    { id: 'default', name: 'Default' },
  ])
  installServiceWithBridge(bridge)

  const observedToolCalls = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Use native collaboration and read a file if needed.' }],
    options: {
      model: 'gpt-5.4',
      tools: {
        read_file: {
          description: 'Read a file.',
          inputSchema: {
            jsonSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
        },
      },
      openAIAccountDelegationBackend: 'openai_native',
      openAIAccountDynamicToolExecutor: async ({ toolName, input }) => {
        observedToolCalls.push({ toolName, input })
        return {
          contentItems: [{ type: 'text', text: 'mixed file contents' }],
          success: true,
        }
      },
      requestContext: {
        threadId: 'thread_account_mixed_collab',
      },
    },
  })

  assert.equal(bridge.startTurnCalls.length, 1)
  assert.deepEqual(bridge.startTurnCalls[0].collaborationMode, {
    id: 'default',
    name: 'Default',
    settings: {
      developer_instructions: null,
    },
  })
  assert.deepEqual(observedToolCalls, [{
    toolName: 'read_file',
    input: { path: 'src/main/app.mjs' },
  }])
  assert.deepEqual(bridge.responses, [{
    id: 144,
    result: {
      contentItems: [{ type: 'inputText', text: 'mixed file contents' }],
      success: true,
    },
  }])
  assert.equal(payload.text, 'Native collaboration and local tool execution both completed.')
  assert.equal(payload.providerResponseMeta?.accountDelegationBackend, 'openai_native')
  assert.equal(payload.providerResponseMeta?.accountCollaborationModeId, 'default')
  assert.deepEqual(payload.providerResponseMeta?.accountCollaboration, {
    started: true,
    completed: true,
    itemIds: ['collab_mixed_1'],
    itemTypes: ['collabAgentToolCall', 'collabToolCall'],
    toolNames: ['spawn_agent'],
    agentStatuses: ['inProgress', 'completed'],
    receiverThreadIds: ['thr_worker_mixed_1'],
    newThreadIds: ['thr_worker_mixed_1'],
    events: [
      {
        providerEventId: 'collab_mixed_1:started:collabAgentToolCall',
        providerActivityId: 'collab_mixed_1',
        spawnRequestId: 'collab_mixed_1',
        parentProviderThreadId: 'thr_account_1',
        providerThreadId: 'thr_worker_mixed_1',
        toolName: 'spawn_agent',
        phase: 'started',
        status: 'running',
      },
      {
        providerEventId: 'collab_mixed_1:completed:collabToolCall',
        providerActivityId: 'collab_mixed_1',
        spawnRequestId: 'collab_mixed_1',
        parentProviderThreadId: 'thr_account_1',
        providerThreadId: 'thr_worker_mixed_1',
        toolName: 'spawn_agent',
        phase: 'completed',
        status: 'completed',
      },
    ],
  })
})

test('OpenAI account runtime normalizes dynamic tool error payloads for app-server', async () => {
  const bridge = new FakeBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('server-request', {
          id: 91,
          method: 'item/tool/call',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            itemId: 'dyn_err_1',
            tool: 'read_file',
            arguments: { path: 'missing.txt' },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  await assert.rejects(
    () => createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'Read the missing file.' }],
      options: {
        model: 'gpt-5.4',
        tools: {
          read_file: {
            description: 'Read a file.',
            inputSchema: {
              jsonSchema: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                },
                required: ['path'],
              },
            },
          },
        },
        openAIAccountDynamicToolExecutor: async () => {
          throw new Error('File not found.')
        },
        requestContext: {
          threadId: 'thread_account_dynamic_error',
        },
      },
    }),
    /File not found\./,
  )

  assert.deepEqual(bridge.responses, [{
    id: 91,
    result: {
      contentItems: [{ type: 'inputText', text: 'Tool error: File not found.' }],
      success: false,
    },
  }])
})

test('OpenAI account runtime stale timeout resets while bridge activity keeps arriving', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_stale_reset',
    onStartTurn(params, target) {
      setTimeout(() => {
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: { threadId: params.threadId, turnId: target.turnId, delta: 'A' },
        })
      }, 0)
      setTimeout(() => {
        target.emit('notification', {
          method: 'item/reasoning/delta',
          params: { threadId: params.threadId, turnId: target.turnId, delta: 'B' },
        })
      }, 25)
      setTimeout(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      }, 50)
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Keep going.' }],
    options: {
      model: 'gpt-5.4',
      streamTimeoutMs: 150,
      streamIdleTimeoutMs: 60,
      requestContext: {
        threadId: 'thread_account_stale_reset',
      },
    },
  })

  assert.equal(payload.text, 'A')
  assert.equal(payload.reasoning, 'B')
})

test('OpenAI account background operation preserves reasoning in the awaited result payload', async () => {
  const bridge = new FakeBridge({
    startThreadId: 'thr_account_background_1',
    turnId: 'turn_account_background_1',
    runtimeIdentity: {
      executable: 'codex.exe',
      version: '0.124.0',
      platformFamily: 'desktop',
      platformOs: 'windows',
    },
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'model/rerouted',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            fromModel: 'gpt-5.4',
            toModel: 'gpt-5.2',
            reason: 'highRiskCyberActivity',
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'background_future_activity_1',
              type: 'futureActivity',
              status: 'completed',
              result: 'private-background-result',
            },
          },
        })
        target.emit('notification', {
          method: 'item/reasoning/delta',
          params: { threadId: params.threadId, turnId: target.turnId, delta: 'Background reasoning.' },
        })
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: { threadId: params.threadId, turnId: target.turnId, delta: 'Background answer.' },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const operation = await startOpenAIAccountBackgroundOperation({
    messages: [{ role: 'user', content: 'Continue in background.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_background_1',
      },
    },
  })

  assert.equal(operation.response.id, 'turn_account_background_1')
  assert.equal(operation.response.background, true)
  assert.equal(operation.providerResponseMeta?.background, true)
  assert.equal(operation.providerResponseMeta?.transportMode, 'codex_app_server_chatgpt_background')
  assert.equal(operation.providerResponseMeta?.accountProtocol?.runtime?.version, '0.124.0')

  const payload = await operation.awaitResult()
  assert.equal(payload.text, 'Background answer.')
  assert.equal(payload.reasoning, 'Background reasoning.')
  assert.equal(payload.providerResponseMeta?.background, true)
  assert.equal(payload.providerResponseMeta?.transportMode, 'codex_app_server_chatgpt_background')
  assert.equal(payload.providerResponseMeta?.requestedModelId, 'gpt-5.4')
  assert.equal(payload.providerResponseMeta?.modelId, 'gpt-5.2')
  assert.deepEqual(payload.providerResponseMeta?.accountModelReroutes, [{
    fromModel: 'gpt-5.4',
    toModel: 'gpt-5.2',
    reason: 'highRiskCyberActivity',
  }])
  assert.equal(payload.providerResponseMeta?.accountProtocol?.runtime?.version, '0.124.0')
  assert.equal(payload.providerResponseMeta?.accountProtocol?.unknownActivities?.[0]?.itemType, 'futureActivity')
  assert.equal(JSON.stringify(payload).includes('private-background-result'), false)
})

test('OpenAI account runtime forwards provider-backed usage and context telemetry from turn completion', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_usage_context',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
              usage: {
                inputTokens: 4096,
                outputTokens: 512,
                totalTokens: 4608,
                inputTokenDetails: {
                  cacheReadTokens: 128,
                },
              },
              contextUsage: {
                inputLimitTokens: 8192,
                remainingContextTokens: 3072,
              },
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Report usage.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_usage_context',
      },
    },
  })

  assert.deepEqual(payload.usage, {
    inputTokens: 4096,
    outputTokens: 512,
    totalTokens: 4608,
    inputTokenDetails: {
      cacheReadTokens: 128,
    },
  })
  assert.equal(payload.providerResponseMeta?.inputLimitTokens, 8192)
  assert.equal(payload.providerResponseMeta?.remainingContextTokens, 3072)
  assert.equal(payload.providerResponseMeta?.threadOccupancyTokens, 5120)
  assert.equal(payload.providerResponseMeta?.providerUsageSemantics, 'openai_account_provider_context')
})

test('OpenAI account runtime treats Codex last usage as current provider-thread occupancy', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_thread_usage_context',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'thread/tokenUsage/updated',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            tokenUsage: {
              total: {
                totalTokens: 5120,
                inputTokens: 4096,
                cachedInputTokens: 128,
                outputTokens: 896,
                reasoningOutputTokens: 96,
              },
              last: {
                totalTokens: 2304,
                inputTokens: 2048,
                cachedInputTokens: 256,
                outputTokens: 256,
                reasoningOutputTokens: 32,
              },
              modelContextWindow: 8192,
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
              items: [],
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const usageUpdates = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Report usage from thread totals.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_thread_usage_context',
        openai: { accountContextCompactionGeneration: 3 },
      },
    },
    onContextUsageUpdate: (event) => usageUpdates.push(event),
  })

  assert.deepEqual(payload.usage, {
    inputTokens: 2048,
    outputTokens: 256,
    reasoningTokens: 32,
    totalTokens: 2304,
    inputTokenDetails: {
      cacheReadTokens: 256,
    },
  })
  assert.equal(payload.providerResponseMeta?.inputLimitTokens, 8192)
  assert.equal(payload.providerResponseMeta?.remainingContextTokens, 5888)
  assert.equal(payload.providerResponseMeta?.threadOccupancyTokens, 2304)
  assert.equal(payload.providerResponseMeta?.threadCumulativeTotalTokens, 5120)
  assert.equal(payload.providerResponseMeta?.providerUsageSemantics, 'openai_account_provider_context')
  assert.equal(payload.providerResponseMeta?.contextCompactionGeneration, 3)
  assert.equal(usageUpdates.length, 1)
  assert.equal(usageUpdates[0]?.threadCumulativeTotalTokens, 5120)
  assert.equal(usageUpdates[0]?.inputLimitTokens, 8192)
  assert.equal(usageUpdates[0]?.threadOccupancyTokens, 2304)
  assert.equal(usageUpdates[0]?.remainingContextTokens, 5888)
  assert.equal(usageUpdates[0]?.contextCompactionGeneration, 3)
})

test('OpenAI account runtime accepts explicit current-context telemetry from thread token usage updates', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_thread_usage_explicit_context',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'thread/tokenUsage/updated',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            tokenUsage: {
              total: {
                totalTokens: 5120,
                inputTokens: 4096,
                cachedInputTokens: 128,
                outputTokens: 896,
                reasoningOutputTokens: 96,
              },
              last: {
                totalTokens: 2304,
                inputTokens: 2048,
                cachedInputTokens: 256,
                outputTokens: 256,
                reasoningOutputTokens: 32,
              },
              modelContextWindow: 8192,
              remainingContextTokens: 3072,
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
              items: [],
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Report usage from explicit thread context.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_thread_usage_explicit_context',
      },
    },
  })

  assert.deepEqual(payload.usage, {
    inputTokens: 2048,
    outputTokens: 256,
    reasoningTokens: 32,
    totalTokens: 2304,
    inputTokenDetails: {
      cacheReadTokens: 256,
    },
  })
  assert.equal(payload.providerResponseMeta?.inputLimitTokens, 8192)
  assert.equal(payload.providerResponseMeta?.remainingContextTokens, 3072)
  assert.equal(payload.providerResponseMeta?.threadOccupancyTokens, 5120)
  assert.equal(payload.providerResponseMeta?.providerUsageSemantics, 'openai_account_provider_context')
})

test('OpenAI account runtime leaves context recalculating when the latest usage predates completed compaction', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_compaction_verified_context',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmp_account_verified_context_1',
              type: 'contextCompaction',
              status: 'inProgress',
            },
          },
        })
        target.emit('notification', {
          method: 'thread/tokenUsage/updated',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            tokenUsage: {
              last: {
                totalTokens: 8000,
              },
              modelContextWindow: 400000,
              remainingContextTokens: 392000,
            },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'cmp_account_verified_context_1',
              type: 'contextCompaction',
              status: 'completed',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
              items: [],
            },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Compact the thread and continue.' }],
    options: {
      model: 'gpt-5.4',
      requestContext: {
        threadId: 'thread_account_compaction_verified_context',
      },
    },
  })

  assert.equal(payload.providerResponseMeta?.remainingContextTokens, undefined)
  assert.equal(payload.providerResponseMeta?.threadOccupancyTokens, undefined)
  assert.equal(payload.providerResponseMeta?.providerUsageSemantics, 'openai_account_provider_context_recalculating')
  assert.equal(payload.providerResponseMeta?.contextCompactionGeneration, 1)
  assert.deepEqual(payload.providerResponseMeta?.accountCompaction, {
    started: true,
    completed: true,
    itemIds: ['cmp_account_verified_context_1'],
  })
})

test('OpenAI account runtime accepts the next matching usage update as the post-compaction baseline', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_compaction_post_usage',
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'thread/tokenUsage/updated',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            tokenUsage: { last: { totalTokens: 90000 }, modelContextWindow: 200000 },
          },
        })
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: { id: 'cmp_account_post_usage_1', type: 'contextCompaction', status: 'inProgress' },
          },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: { id: 'cmp_account_post_usage_1', type: 'contextCompaction', status: 'completed' },
          },
        })
        target.emit('notification', {
          method: 'thread/tokenUsage/updated',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            tokenUsage: { last: { totalTokens: 8000 }, modelContextWindow: 200000 },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: { id: target.turnId, status: 'completed', error: null, items: [] },
          },
        })
      })
    },
  })
  installServiceWithBridge(bridge)

  const usageUpdates = []
  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Compact and report the new context.' }],
    options: { model: 'gpt-5.4', requestContext: { threadId: 'thread_account_compaction_post_usage' } },
    onContextUsageUpdate: (usage) => usageUpdates.push(usage),
  })

  assert.deepEqual(usageUpdates.map((usage) => usage.contextCompactionGeneration), [0, 1])
  assert.equal(payload.providerResponseMeta?.contextCompactionGeneration, 1)
  assert.equal(payload.providerResponseMeta?.threadOccupancyTokens, 8000)
  assert.equal(payload.providerResponseMeta?.remainingContextTokens, 192000)
  assert.equal(payload.providerResponseMeta?.providerUsageSemantics, 'openai_account_provider_context')
})

test('OpenAI account runtime throws stale when bridge activity goes silent', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_stale_fail',
    onStartTurn(params, target) {
      setTimeout(() => {
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: { threadId: params.threadId, turnId: target.turnId, delta: 'A' },
        })
      }, 0)
      setTimeout(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      }, 90)
    },
  })
  installServiceWithBridge(bridge)

  await assert.rejects(
    () => createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'Wait.' }],
      options: {
        model: 'gpt-5.4',
        streamTimeoutMs: 180,
        streamIdleTimeoutMs: 25,
        requestContext: {
          threadId: 'thread_account_stale_fail',
        },
      },
    }),
    (error) => {
      assert.equal(error?.streamStale, true)
      assert.equal(String(error?.code || ''), 'provider_stream_stale')
      return true
    },
  )

  assert.deepEqual(bridge.interruptTurnCalls, [{
    threadId: 'thr_account_1',
    turnId: 'turn_account_stale_fail',
  }])
})

test('OpenAI account runtime suspends stale timeout while collaboration is still in progress', async () => {
  const bridge = new FakeBridge({
    turnId: 'turn_account_collab_wait',
    onStartTurn(params, target) {
      setTimeout(() => {
        target.emit('notification', {
          method: 'item/started',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'collab_wait_1',
              type: 'collabAgentToolCall',
              tool: 'spawn_agent',
              status: 'inProgress',
              agentStatus: 'inProgress',
            },
          },
        })
      }, 0)
      setTimeout(() => {
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'collab_wait_1',
              type: 'collabToolCall',
              tool: 'spawn_agent',
              status: 'completed',
              agentStatus: 'completed',
              receiverThreadId: 'thr_worker_wait_1',
              newThreadId: 'thr_worker_wait_1',
            },
          },
        })
      }, 85)
      setTimeout(() => {
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      }, 95)
    },
  })
  installServiceWithBridge(bridge)

  const payload = await createOpenAIAccountStreamPayload({
    messages: [{ role: 'user', content: 'Use delegation if needed.' }],
    options: {
      model: 'gpt-5.4',
      streamTimeoutMs: 180,
      streamIdleTimeoutMs: 25,
      requestContext: {
        threadId: 'thread_account_collab_wait',
      },
    },
  })

  assert.equal(payload.providerResponseMeta?.accountCollaboration?.completed, true)
  assert.equal(bridge.interruptTurnCalls.length, 0)
})
