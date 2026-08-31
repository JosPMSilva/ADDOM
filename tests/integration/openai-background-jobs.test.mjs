import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-background-jobs-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

import { setSettingsPatch } from '../../src/main/settings.mjs'
import {
  __testOpenAIAccountInternals,
  getOpenAIAccountAuthService,
} from '../../src/main/openai-account/openai-account-auth-service.mjs'
import {
  __resetOpenAIBackgroundClientFactoryForTests,
  __resetOpenAIBackgroundTimingForTests,
  __setOpenAIBackgroundClientFactoryForTests,
  __setOpenAIBackgroundTimingForTests,
} from '../../src/main/api-clients/openai-background-runtime.mjs'
import {
  createOpenAIBackgroundJob,
  listOpenAIBackgroundJobs,
  stopAllOpenAIBackgroundJobs,
  stopOpenAIBackgroundJob,
} from '../../src/main/api-clients/openai-background-jobs.mjs'
import { getOpenAIBackgroundJob } from '../../src/main/api-clients/openai-background-job-store.mjs'

class FakeAccountBridge extends EventEmitter {
  constructor({ threadId = 'thr_bg_job_account_1', turnId = 'turn_bg_job_account_1', onStartTurn = null } = {}) {
    super()
    this.threadId = threadId
    this.turnId = turnId
    this.onStartTurn = onStartTurn
    this.startThreadCalls = []
    this.startTurnCalls = []
    this.interruptTurnCalls = []
  }

  async startThread(params = {}) {
    this.startThreadCalls.push(params)
    return { thread: { id: this.threadId } }
  }

  async resumeThread(params = {}) {
    return { thread: { id: params.threadId || this.threadId } }
  }

  async startTurn(params = {}) {
    this.startTurnCalls.push(params)
    this.onStartTurn?.(params, this)
    return { turn: { id: this.turnId, status: 'inProgress', items: [], error: null } }
  }

  async interruptTurn(threadId = '', turnId = '') {
    this.interruptTurnCalls.push({ threadId, turnId })
    return {}
  }
}

function installAccountRuntimeBridge(bridge) {
  __testOpenAIAccountInternals.resetSingleton()
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
  service.getBridge = () => bridge
}

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.afterEach(async () => {
  await stopAllOpenAIBackgroundJobs({ reason: 'test cleanup' })
  __resetOpenAIBackgroundClientFactoryForTests()
  __resetOpenAIBackgroundTimingForTests()
  __testOpenAIAccountInternals.resetSingleton()
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'api_key',
      },
    },
  })
})

test('openai background jobs register queued responses and finalize on completion', async (t) => {
  try {
    let releaseRetrieve = null
    let completedPayload = null

  __setOpenAIBackgroundTimingForTests({ pollIntervalMs: 0, maxWaitMs: 1_000 })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      create: async () => ({
        id: 'resp_bg_job_1',
        status: 'queued',
        model: 'gpt-5.4',
        background: true,
        conversation: { id: 'conv_bg_job_1' },
      }),
      retrieve: async () => {
        await new Promise((resolve) => {
          releaseRetrieve = resolve
        })
        return {
          id: 'resp_bg_job_1',
          status: 'completed',
          model: 'gpt-5.4',
          background: true,
          conversation: { id: 'conv_bg_job_1' },
          output_text: 'Detached OpenAI completion.',
          usage: {
            input_tokens: 7,
            output_tokens: 5,
            total_tokens: 12,
          },
        }
      },
      cancel: async () => {},
    },
  }))

    const backgroundJob = await createOpenAIBackgroundJob({
      apiKey: 'sk-test',
      modelId: 'gpt-5.4',
      messages: [{ role: 'user', content: 'Summarize this repo.' }],
      runtimeSettings: { enableBackgroundMode: true },
      openaiOptions: { store: true },
      projectRoot: 'C:\\repo',
      projectId: 'project-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      messageId: 'assistant-1',
      onCompleted: async ({ payload }) => {
        completedPayload = payload
      },
    })

  const listed = listOpenAIBackgroundJobs()
  const listedJob = listed.find((job) => job.id === backgroundJob.job.id)
  assert.ok(listedJob)
  assert.equal(listedJob.kind, 'openai_response')
  assert.equal(listedJob.messageId, 'assistant-1')
  assert.equal(listedJob.responseId, 'resp_bg_job_1')

  releaseRetrieve?.()
  await backgroundJob.promise

  assert.equal(completedPayload?.text, 'Detached OpenAI completion.')
  const persisted = getOpenAIBackgroundJob(backgroundJob.job.id)
  assert.equal(persisted?.status, 'completed')
    assert.equal(listOpenAIBackgroundJobs().some((job) => job.id === backgroundJob.job.id), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('stopping an openai background job aborts polling and cancels the remote response', async (t) => {
  try {
    let cancelCalls = 0
    let failureMeta = null

  __setOpenAIBackgroundTimingForTests({ pollIntervalMs: 10_000, maxWaitMs: 60_000 })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      create: async () => ({
        id: 'resp_bg_job_stop',
        status: 'queued',
        model: 'gpt-5.4',
        background: true,
      }),
      retrieve: async () => ({
        id: 'resp_bg_job_stop',
        status: 'in_progress',
        model: 'gpt-5.4',
        background: true,
      }),
      cancel: async () => {
        cancelCalls += 1
      },
    },
  }))

    const backgroundJob = await createOpenAIBackgroundJob({
      apiKey: 'sk-test',
      modelId: 'gpt-5.4',
      messages: [{ role: 'user', content: 'Keep running.' }],
      runtimeSettings: { enableBackgroundMode: true },
      openaiOptions: { store: true },
      threadId: 'thread-stop',
      turnId: 'turn-stop',
      messageId: 'assistant-stop',
      onFailed: async ({ cancelled, message }) => {
        failureMeta = { cancelled, message }
      },
    })

  const stopResult = await stopOpenAIBackgroundJob(backgroundJob.job.id, { reason: 'Stopped from test.' })
  assert.equal(stopResult.stopped, true)

  await assert.rejects(() => backgroundJob.promise)
  assert.equal(failureMeta?.cancelled, true)
  assert.match(String(failureMeta?.message || ''), /(abort|cancel)/i)
    assert.equal(cancelCalls >= 1, true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('openai account background jobs register bridge-backed work and can be stopped in-session', async (t) => {
  try {
    await setSettingsPatch({
      providerAuthSettings: {
        openai: {
          authMethod: 'account',
        },
      },
    })

    let failureMeta = null
    const bridge = new FakeAccountBridge({
      onStartTurn(params, target) {
        queueMicrotask(() => {
          target.emit('notification', {
            method: 'item/agentMessage/delta',
            params: { threadId: params.threadId, turnId: target.turnId, delta: 'Queued ' },
          })
        })
      },
    })
    installAccountRuntimeBridge(bridge)

    const backgroundJob = await createOpenAIBackgroundJob({
      modelId: 'gpt-5.4',
      messages: [{ role: 'user', content: 'Run in background.' }],
      runtimeSettings: { enableBackgroundMode: true },
      openaiOptions: { store: true },
      projectId: 'project-account-bg',
      threadId: 'thread-account-bg',
      turnId: 'turn-account-bg',
      messageId: 'assistant-account-bg',
      onFailed: async ({ cancelled, message }) => {
        failureMeta = { cancelled, message }
      },
    })

    assert.equal(backgroundJob.providerResponseMeta?.authMethod, 'account')
    assert.equal(backgroundJob.providerResponseMeta?.transportMode, 'codex_app_server_chatgpt_background')

    const stopResult = await stopOpenAIBackgroundJob(backgroundJob.job.id, { reason: 'Stopped from account test.' })
    assert.equal(stopResult.stopped, true)

    await assert.rejects(() => backgroundJob.promise)
    assert.equal(failureMeta?.cancelled, true)
    assert.equal(bridge.interruptTurnCalls.length, 1)

    const persisted = getOpenAIBackgroundJob(backgroundJob.job.id)
    assert.equal(persisted?.resultSummary?.runtimeAuthMethod, 'account')
    assert.equal(persisted?.resultSummary?.transportMode, 'codex_app_server_chatgpt_background')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
