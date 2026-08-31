import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-bg-recovery-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  __resetOpenAIBackgroundClientFactoryForTests,
  __resetOpenAIBackgroundTimingForTests,
  __setOpenAIBackgroundClientFactoryForTests,
  __setOpenAIBackgroundTimingForTests,
} = await import('../../src/main/api-clients/openai-background-runtime.mjs')
const {
  __resetOpenAIBackgroundJobsForTests,
  recoverPersistedOpenAIBackgroundJobs,
} = await import('../../src/main/api-clients/openai-background-jobs.mjs')
const {
  getOpenAIBackgroundJob,
  upsertOpenAIBackgroundJob,
} = await import('../../src/main/api-clients/openai-background-job-store.mjs')
const {
  finalizeRecoveredOpenAIBackgroundJobFailure,
  finalizeRecoveredOpenAIBackgroundJobSuccess,
} = await import('../../src/main/api-clients/openai-background-job-recovery.mjs')
const {
  getOpenAIThreadState,
  upsertOpenAIThreadState,
} = await import('../../src/main/api-clients/openai-thread-state-service.mjs')
const {
  appendEvent,
  listTimeline,
  registerProject,
} = await import('../../src/main/workspace/workspace-store.mjs')
const { getDb } = await import('../../src/main/memory/db.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

function resetDb() {
  const db = getDb()
  db.prepare('DELETE FROM openai_background_jobs').run()
  db.prepare('DELETE FROM openai_thread_state').run()
  db.prepare('DELETE FROM chat_events').run()
  db.prepare('DELETE FROM chat_threads').run()
  db.prepare('DELETE FROM workspace_projects').run()
}

function createProjectFixture(label = 'fixture') {
  const projectPath = path.join(userDataPath, label)
  const { project, activeThread } = registerProject(projectPath)
  return {
    projectId: project.id,
    threadId: activeThread.id,
    turnId: `turn-${label}`,
    messageId: `assistant-${label}`,
  }
}

test.beforeEach(() => {
  try {
    resetDb()
  } catch (err) {
    if (!isNativeDbLoadError(err)) throw err
  }
  __resetOpenAIBackgroundJobsForTests()
  __resetOpenAIBackgroundClientFactoryForTests()
  __resetOpenAIBackgroundTimingForTests()
})

test.after(() => {
  __resetOpenAIBackgroundJobsForTests()
  __resetOpenAIBackgroundClientFactoryForTests()
  __resetOpenAIBackgroundTimingForTests()
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('recovered openai background jobs finalize into the original thread and restore continuity state', async (t) => {
  try {
    const fixture = createProjectFixture('recovered-success')
    upsertOpenAIThreadState({
    threadId: fixture.threadId,
    projectId: fixture.projectId,
    providerId: 'openai',
    model: 'gpt-5.2',
    toolsetHash: 'tool-hash',
    systemPromptHash: 'prompt-hash',
    continuitySignature: 'sig-1',
    chainValid: false,
    chainInvalidReason: 'background_pending',
  })
  upsertOpenAIBackgroundJob({
    id: 'oaibg-recover-1',
    providerId: 'openai',
    projectId: fixture.projectId,
    threadId: fixture.threadId,
    assistantMessageId: fixture.messageId,
    model: 'gpt-5.2',
    status: 'queued',
    remoteResponseId: 'resp_recover_1',
    conversationId: 'conv_recover_1',
    toolsetHash: 'tool-hash',
    systemPromptHash: 'prompt-hash',
    continuitySignature: 'sig-1',
    storeEnabled: true,
    backgroundModeEnabled: true,
    queuedEventPersisted: true,
    resultSummary: {
      turnId: fixture.turnId,
      promptPreview: 'Summarize the workspace.',
      requestContextUsed: {
        previousResponseId: 'resp_prev_recover_1',
        compaction: {
          requestedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
          selectedMode: COMPACTION_MODES.LOCAL_SUMMARY,
          candidateModes: [COMPACTION_MODES.PROVIDER_TRUNCATION, COMPACTION_MODES.LOCAL_SUMMARY],
          failureReason: 'below_threshold',
          fallbackMode: COMPACTION_MODES.LOCAL_SUMMARY,
          fallbackReason: 'provider_truncation_unavailable',
          providerTruncationThresholdTokens: 180_000,
        },
      },
    },
  })
  appendEvent(fixture.threadId, {
    turnId: fixture.turnId,
    kind: 'background_response_queued',
    role: 'system',
    content: 'OpenAI background response queued.',
    meta: {
      jobId: 'oaibg-recover-1',
      responseId: 'resp_recover_1',
    },
  })

  __setOpenAIBackgroundTimingForTests({ pollIntervalMs: 0, maxWaitMs: 1_000 })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      retrieve: async () => ({
        id: 'resp_recover_1',
        status: 'completed',
        model: 'gpt-5.2',
        background: true,
        conversation: { id: 'conv_recover_1' },
        output_text: 'Recovered OpenAI completion.',
        output: [
          {
            id: 'cmp_recover_auto_1',
            type: 'compaction',
            encrypted_content: 'enc_recover_1',
          },
          {
            type: 'reasoning',
            summary: [{ text: 'Recovered reasoning summary.' }],
          },
        ],
        usage: {
          input_tokens: 9,
          output_tokens: 6,
          output_tokens_details: { reasoning_tokens: 3 },
          total_tokens: 18,
        },
      }),
      cancel: async () => ({}),
    },
  }))

  const broadcasts = []
  const recovered = await recoverPersistedOpenAIBackgroundJobs({
    onCompleted: async ({ job, payload }) => {
      finalizeRecoveredOpenAIBackgroundJobSuccess({
        job,
        payload,
        broadcast: (channel, body) => {
          broadcasts.push({ channel, body })
        },
      })
    },
    onFailed: async ({ job, cancelled, message }) => {
      finalizeRecoveredOpenAIBackgroundJobFailure({
        job,
        cancelled,
        message,
        broadcast: (channel, body) => {
          broadcasts.push({ channel, body })
        },
      })
    },
  })
  await Promise.allSettled(recovered.map((row) => row.promise))

  const job = getOpenAIBackgroundJob('oaibg-recover-1')
  assert.equal(job?.status, 'completed')
  assert.equal(job?.completionEventPersisted, true)

  const timeline = listTimeline(fixture.threadId)
  assert.equal(timeline.some((row) => row.kind === 'background_response_completed'), true)
  assert.equal(timeline.some((row) => row.kind === 'assistant_message' && /Recovered OpenAI completion/.test(String(row.content || ''))), true)
  assert.equal(timeline.some((row) => row.kind === 'reasoning_done'), true)
  assert.equal(timeline.some((row) => row.kind === 'openai_continuity_status'), true)
  const continuityStatusEvent = timeline.find((row) => row.kind === 'openai_continuity_status')
  assert.equal(continuityStatusEvent?.meta?.compactionStrategy, COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.equal(continuityStatusEvent?.meta?.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.deepEqual(continuityStatusEvent?.meta?.candidateCompactionModes, [
    COMPACTION_MODES.PROVIDER_TRUNCATION,
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
  assert.equal(continuityStatusEvent?.meta?.compactionFailureReason, 'below_threshold')
  assert.equal(continuityStatusEvent?.meta?.fallbackReason, 'provider_truncation_unavailable')
  assert.equal(continuityStatusEvent?.meta?.serverSideCompactionThresholdTokens, 180_000)
  assert.equal(continuityStatusEvent?.meta?.autoCompactionApplied, true)
  assert.deepEqual(continuityStatusEvent?.meta?.autoCompactionIds, ['cmp_recover_auto_1'])

  const state = getOpenAIThreadState(fixture.threadId)
  assert.equal(state?.chainValid, true)
  assert.equal(state?.lastResponseId, 'resp_recover_1')
  assert.equal(state?.conversationId, 'conv_recover_1')
  assert.equal(state?.chainInvalidReason, '')

    assert.equal(broadcasts.some((row) => row.channel === 'chat:background-response-completed'), true)
    const continuityBroadcast = broadcasts.find((row) => row.channel === 'chat:openai-continuity-status')
    assert.equal(continuityBroadcast?.body?.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
    assert.equal(continuityBroadcast?.body?.compactionStrategy, COMPACTION_MODES.PROVIDER_TRUNCATION)
    assert.equal(continuityBroadcast?.body?.previousResponseIdUsed, 'resp_prev_recover_1')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('account-auth background jobs fail explicitly during startup recovery until bridge resume support exists', async (t) => {
  try {
    const fixture = createProjectFixture('account-recovery-unsupported')
    upsertOpenAIBackgroundJob({
      id: 'oaibg-account-recover-1',
      providerId: 'openai',
      projectId: fixture.projectId,
      threadId: fixture.threadId,
      assistantMessageId: fixture.messageId,
      model: 'gpt-5.2',
      status: 'queued',
      remoteResponseId: 'turn_account_bg_1',
      conversationId: 'thr_account_bg_1',
      backgroundModeEnabled: true,
      resultSummary: {
        turnId: fixture.turnId,
        promptPreview: 'Resume me later.',
        runtimeAuthMethod: 'account',
        transportMode: 'codex_app_server_chatgpt_background',
      },
    })

    const recovered = await recoverPersistedOpenAIBackgroundJobs({
      onCompleted: async () => {},
      onFailed: async () => {},
    })

    assert.deepEqual(recovered, [])
    const job = getOpenAIBackgroundJob('oaibg-account-recover-1')
    assert.equal(job?.status, 'failed')
    assert.equal(job?.errorCode, 'account_background_recovery_unsupported')
    assert.match(String(job?.errorMessage || ''), /cannot be resumed after app restart yet/i)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
