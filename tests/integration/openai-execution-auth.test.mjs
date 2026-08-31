import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-execution-auth-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { setSettingsPatch } = await import('../../src/main/settings.mjs')
const {
  clearOpenAIAccountStorage,
} = await import('../../src/main/openai-account/openai-account-storage.mjs')
const {
  __testOpenAIAccountInternals,
  getOpenAIAccountAuthService,
} = await import('../../src/main/openai-account/openai-account-auth-service.mjs')
const {
  resolveOpenAIExecutionAuth,
} = await import('../../src/main/openai-account/openai-execution-auth.mjs')
const {
  __resetOpenAIBackgroundClientFactoryForTests,
  __resetOpenAIBackgroundTimingForTests,
  createOpenAIBackgroundResponse,
} = await import('../../src/main/api-clients/openai-background-runtime.mjs')
const { EventEmitter } = await import('node:events')

test.beforeEach(async () => {
  clearOpenAIAccountStorage(userDataPath)
  __testOpenAIAccountInternals.resetSingleton()
  __resetOpenAIBackgroundClientFactoryForTests()
  __resetOpenAIBackgroundTimingForTests()
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'api_key',
      },
    },
    inlineCompletionEnabled: true,
  })
})

test.after(() => {
  __resetOpenAIBackgroundClientFactoryForTests()
  __resetOpenAIBackgroundTimingForTests()
  __testOpenAIAccountInternals.resetSingleton()
  clearOpenAIAccountStorage(userDataPath)
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('openai execution auth resolves stored API-key mode via injected key lookup', () => {
  const auth = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'api_key' } },
    }),
    getKey: () => 'sk-test-openai',
  })

  assert.equal(auth.ok, true)
  assert.equal(auth.authMethod, 'api_key')
  assert.equal(auth.apiKey, 'sk-test-openai')
  assert.equal(auth.blockedReason, '')
  assert.equal(auth.canonicalErrorClass, '')
})

test('openai execution auth fails closed when account mode is selected', () => {
  const auth = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        hasSession: true,
        status: 'connected',
        availability: {
          supported: false,
          reason: 'bridge_unavailable',
          message: 'Bridge unavailable.',
        },
      },
      activeLogin: null,
      storage: {
        availability: {
          supported: false,
          reason: 'bridge_unavailable',
          message: 'Bridge unavailable.',
        },
      },
    }),
  })

  assert.equal(auth.ok, false)
  assert.equal(auth.authMethod, 'account')
  assert.equal(auth.blockedReason, 'bridge_unavailable')
  assert.equal(auth.blockedMessage, 'Bridge unavailable.')
  assert.equal(auth.canonicalErrorClass, 'provider_transport_error')
  assert.equal(auth.userFacingBlockedReason, 'provider_transport_error')
  assert.equal(
    auth.userFacingBlockedMessage,
    'OpenAI authentication is currently unavailable. Retry or reconnect in Settings.',
  )
})

test('openai execution auth classifies bridge-not-checked availability as a provider transport error', () => {
  const auth = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        hasSession: false,
        status: 'disconnected',
        availability: {
          supported: false,
          reason: 'bridge_not_checked',
          message: 'OpenAI account bridge has not been checked yet.',
        },
      },
      activeLogin: null,
      storage: {
        availability: {
          supported: false,
          reason: 'bridge_not_checked',
          message: 'OpenAI account bridge has not been checked yet.',
        },
      },
    }),
  })

  assert.equal(auth.ok, false)
  assert.equal(auth.blockedReason, 'bridge_not_checked')
  assert.equal(auth.canonicalErrorClass, 'provider_transport_error')
  assert.equal(auth.userFacingBlockedReason, 'provider_transport_error')
  assert.equal(
    auth.userFacingBlockedMessage,
    'OpenAI authentication is currently unavailable. Retry or reconnect in Settings.',
  )
})

test('openai execution auth allows connected account sessions when the runtime path supports them', () => {
  const auth = resolveOpenAIExecutionAuth({
    allowAccountRuntime: true,
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
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
    }),
  })

  assert.equal(auth.ok, true)
  assert.equal(auth.authMethod, 'account')
  assert.equal(auth.blockedReason, '')
  assert.equal(auth.apiKey, '')
  assert.equal(auth.canonicalErrorClass, '')
})

test('openai execution auth reports login-required state before runtime-unsupported when account mode is selected without a session', () => {
  const auth = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        hasSession: false,
        status: 'disconnected',
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
    }),
  })

  assert.equal(auth.ok, false)
  assert.equal(auth.authMethod, 'account')
  assert.equal(auth.blockedReason, 'account_login_required')
  assert.equal(auth.canonicalErrorClass, 'missing_prerequisite')
  assert.equal(auth.userFacingBlockedReason, 'missing_prerequisite')
  assert.equal(
    auth.userFacingBlockedMessage,
    'OpenAI authentication is not ready yet. Update OpenAI in Settings and try again.',
  )
})

test('openai execution auth reports unsupported bridge auth modes explicitly', () => {
  const auth = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        hasSession: false,
        status: 'unsupported_auth_mode',
        bridgeAuthMode: 'chatgptauthtokens',
        lastErrorMessage: 'OpenAI account bridge reported unsupported auth mode "chatgptauthtokens".',
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
    }),
  })

  assert.equal(auth.ok, false)
  assert.equal(auth.authMethod, 'account')
  assert.equal(auth.blockedReason, 'unsupported_auth_mode')
  assert.match(String(auth.blockedMessage || ''), /unsupported auth mode/i)
  assert.equal(auth.canonicalErrorClass, 'provider_transport_error')
  assert.equal(auth.userFacingBlockedReason, 'provider_transport_error')
  assert.doesNotMatch(String(auth.userFacingBlockedMessage || ''), /unsupported auth mode/i)
})

test('openai execution auth reports runtime-unsupported only after account mode is connected', () => {
  const auth = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
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
    }),
  })

  assert.equal(auth.ok, false)
  assert.equal(auth.authMethod, 'account')
  assert.equal(auth.blockedReason, 'account_runtime_unsupported')
  assert.equal(auth.canonicalErrorClass, 'capability_unsupported')
  assert.equal(auth.userFacingBlockedReason, 'capability_unsupported')
  assert.equal(
    auth.userFacingBlockedMessage,
    'This OpenAI capability is not available in the current runtime path.',
  )
})

test('openai execution auth collapses equivalent user-facing readiness across the OpenAI auth pair while preserving diagnostics', () => {
  const apiKeyAuth = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'api_key' } },
    }),
    getKey: () => '',
  })
  const accountAuth = resolveOpenAIExecutionAuth({
    getSettingsFn: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        hasSession: false,
        status: 'disconnected',
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
    }),
  })

  assert.equal(apiKeyAuth.blockedReason, 'missing_api_key')
  assert.equal(accountAuth.blockedReason, 'account_login_required')
  assert.equal(apiKeyAuth.userFacingBlockedReason, accountAuth.userFacingBlockedReason)
  assert.equal(apiKeyAuth.userFacingBlockedMessage, accountAuth.userFacingBlockedMessage)
})

test('openai background runtime supports connected account mode without falling back to API-key auth', async () => {
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'account',
      },
    },
  })

  class FakeBridge extends EventEmitter {
    async startThread() {
      return { thread: { id: 'thr_account_bg_exec' } }
    }

    async resumeThread(params = {}) {
      return { thread: { id: params.threadId || 'thr_account_bg_exec' } }
    }

    async startTurn(params = {}) {
      queueMicrotask(() => {
        this.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: 'turn_account_bg_exec',
            item: {
              type: 'agentMessage',
              text: 'Hello from account background mode.',
            },
          },
        })
        this.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: 'turn_account_bg_exec',
              status: 'completed',
              error: null,
            },
          },
        })
      })
      return {
        turn: {
          id: 'turn_account_bg_exec',
          status: 'inProgress',
          items: [],
          error: null,
        },
      }
    }

    async interruptTurn() {
      return {}
    }
  }

  const service = getOpenAIAccountAuthService()
  service.getState = () => ({
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
  })
  service.getBridge = () => new FakeBridge()

  const result = await createOpenAIBackgroundResponse({
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'Hello' }],
    runtimeSettings: {
      enableBackgroundMode: true,
    },
    openaiOptions: {
      store: true,
    },
  })

  assert.equal(result.text, 'Hello from account background mode.')
  assert.equal(result.providerResponseMeta?.authMethod, 'account')
  assert.equal(result.providerResponseMeta?.transportMode, 'codex_app_server_chatgpt_background')
})
