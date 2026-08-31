import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-continuity-e2e-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { __testAiProviderInternals } = await import('../../src/main/api-clients/ai-provider.mjs')
const {
  getOpenAIThreadState,
  resolveOpenAIThreadContinuation,
  upsertOpenAIThreadState,
} = await import('../../src/main/api-clients/openai-thread-state-service.mjs')
const { upsertOpenAIBackgroundJob } = await import('../../src/main/api-clients/openai-background-job-store.mjs')
const {
  finalizeRecoveredOpenAIBackgroundJobFailure,
  finalizeRecoveredOpenAIBackgroundJobSuccess,
} = await import('../../src/main/api-clients/openai-background-job-recovery.mjs')
const {
  appendEvent,
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

function createFixture(label = 'fixture') {
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
})

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('recovered background completion enables next-turn previous_response_id and keeps system instructions', (t) => {
  try {
    const fixture = createFixture('recovered-previous-response')
    const toolsetHash = 'tool-hash-1'
    const systemPromptHash = 'prompt-hash-1'
    const continuitySignature = 'sig-1'

  upsertOpenAIThreadState({
    threadId: fixture.threadId,
    projectId: fixture.projectId,
    providerId: 'openai',
    model: 'gpt-5.2',
    toolsetHash,
    systemPromptHash,
    continuitySignature,
    chainValid: false,
    chainInvalidReason: 'background_pending',
  })

  upsertOpenAIBackgroundJob({
    id: 'oaibg-continuity-success',
    providerId: 'openai',
    projectId: fixture.projectId,
    threadId: fixture.threadId,
    assistantMessageId: fixture.messageId,
    model: 'gpt-5.2',
    status: 'polling',
    remoteResponseId: 'resp_prev_1',
    conversationId: 'conv_prev_1',
    toolsetHash,
    systemPromptHash,
    continuitySignature,
    storeEnabled: true,
    backgroundModeEnabled: true,
    queuedEventPersisted: true,
    resultSummary: {
      turnId: fixture.turnId,
      promptPreview: 'Continue this thread after recovery.',
    },
  })

  appendEvent(fixture.threadId, {
    turnId: fixture.turnId,
    kind: 'background_response_queued',
    role: 'system',
    content: 'OpenAI background response queued.',
    meta: {
      jobId: 'oaibg-continuity-success',
      responseId: 'resp_prev_1',
    },
  })

  finalizeRecoveredOpenAIBackgroundJobSuccess({
    job: { id: 'oaibg-continuity-success' },
    payload: {
      text: 'Recovered answer content.',
      stopReason: 'stop',
      providerResponseMeta: {
        responseId: 'resp_prev_1',
        conversationId: 'conv_prev_1',
        status: 'completed',
      },
    },
  })

  const continuation = resolveOpenAIThreadContinuation({
    threadId: fixture.threadId,
    model: 'gpt-5.2',
    toolsetHash,
    systemPromptHash,
    continuitySignature,
    usePreviousResponseId: true,
    useConversationState: false,
  })

  assert.equal(continuation.chainValid, true)
  assert.equal(continuation.previousResponseId, 'resp_prev_1')
  assert.equal(continuation.conversationId, '')

  const providerOptions = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.2', {
    promptCachingEnabled: true,
  }, {
    projectId: fixture.projectId,
    threadId: fixture.threadId,
    toolNames: ['web_search'],
    openai: {
      store: true,
      previousResponseId: continuation.previousResponseId,
      conversationId: continuation.conversationId,
    },
  })

  assert.equal(providerOptions?.openai?.previousResponseId, 'resp_prev_1')
  assert.equal(Object.prototype.hasOwnProperty.call(providerOptions?.openai || {}, 'conversation'), false)

  const reduced = __testAiProviderInternals.prepareOpenAIContinuationMessages([
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'assistant', content: 'Recovered answer content.' },
    { role: 'user', content: 'What changed since last turn?' },
  ], {
    openai: {
      previousResponseId: continuation.previousResponseId,
    },
  })

  assert.deepEqual(reduced.messages, [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'What changed since last turn?' },
  ])
    assert.equal(reduced.openAIContext.previousResponseId, 'resp_prev_1')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('model or system-prompt divergence invalidates chain and blocks previous_response_id reuse', (t) => {
  try {
    const fixture = createFixture('continuity-divergence')

  upsertOpenAIThreadState({
    threadId: fixture.threadId,
    projectId: fixture.projectId,
    providerId: 'openai',
    model: 'gpt-5.2',
    lastResponseId: 'resp_prev_2',
    conversationId: 'conv_prev_2',
    toolsetHash: 'tool-hash-2',
    systemPromptHash: 'prompt-hash-2',
    continuitySignature: 'sig-2',
    chainValid: true,
    chainInvalidReason: '',
  })

  const modelChanged = resolveOpenAIThreadContinuation({
    threadId: fixture.threadId,
    model: 'gpt-5.2-pro',
    toolsetHash: 'tool-hash-2',
    systemPromptHash: 'prompt-hash-2',
    continuitySignature: 'sig-2',
    usePreviousResponseId: true,
    useConversationState: false,
  })

  assert.equal(modelChanged.chainValid, false)
  assert.equal(modelChanged.invalidReason, 'model_changed')
  assert.equal(modelChanged.previousResponseId, '')

  const persisted = getOpenAIThreadState(fixture.threadId)
  assert.equal(persisted?.chainValid, false)
    assert.equal(persisted?.chainInvalidReason, 'model_changed')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('conversation-state mode is exclusive and suppresses previous_response_id in provider options', (t) => {
  try {
    const fixture = createFixture('conversation-exclusive')

  upsertOpenAIThreadState({
    threadId: fixture.threadId,
    projectId: fixture.projectId,
    providerId: 'openai',
    model: 'gpt-5.2',
    lastResponseId: 'resp_prev_3',
    conversationId: 'conv_prev_3',
    toolsetHash: 'tool-hash-3',
    systemPromptHash: 'prompt-hash-3',
    continuitySignature: 'sig-3',
    chainValid: true,
    chainInvalidReason: '',
  })

  const continuation = resolveOpenAIThreadContinuation({
    threadId: fixture.threadId,
    model: 'gpt-5.2',
    toolsetHash: 'tool-hash-3',
    systemPromptHash: 'prompt-hash-3',
    continuitySignature: 'sig-3',
    usePreviousResponseId: true,
    useConversationState: true,
  })

  assert.equal(continuation.chainValid, true)
  assert.equal(continuation.previousResponseId, 'resp_prev_3')
  assert.equal(continuation.conversationId, 'conv_prev_3')

  const providerOptions = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.2', {
    promptCachingEnabled: true,
  }, {
    projectId: fixture.projectId,
    threadId: fixture.threadId,
    openai: {
      store: true,
      previousResponseId: continuation.previousResponseId,
      conversationId: continuation.conversationId,
    },
  })

  assert.equal(providerOptions?.openai?.conversation, 'conv_prev_3')
    assert.equal(Object.prototype.hasOwnProperty.call(providerOptions?.openai || {}, 'previousResponseId'), false)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('cancelled recovery invalidates continuity and prevents continuation reuse', (t) => {
  try {
    const fixture = createFixture('cancelled-recovery')

  upsertOpenAIThreadState({
    threadId: fixture.threadId,
    projectId: fixture.projectId,
    providerId: 'openai',
    model: 'gpt-5.2',
    lastResponseId: 'resp_prev_4',
    conversationId: 'conv_prev_4',
    toolsetHash: 'tool-hash-4',
    systemPromptHash: 'prompt-hash-4',
    continuitySignature: 'sig-4',
    chainValid: false,
    chainInvalidReason: 'background_pending',
  })

  upsertOpenAIBackgroundJob({
    id: 'oaibg-continuity-cancelled',
    providerId: 'openai',
    projectId: fixture.projectId,
    threadId: fixture.threadId,
    assistantMessageId: fixture.messageId,
    model: 'gpt-5.2',
    status: 'cancel_requested',
    remoteResponseId: 'resp_cancelled_1',
    conversationId: 'conv_cancelled_1',
    toolsetHash: 'tool-hash-4',
    systemPromptHash: 'prompt-hash-4',
    continuitySignature: 'sig-4',
    storeEnabled: true,
    backgroundModeEnabled: true,
    queuedEventPersisted: true,
    resultSummary: {
      turnId: fixture.turnId,
      promptPreview: 'Cancel this background turn.',
    },
  })

  finalizeRecoveredOpenAIBackgroundJobFailure({
    job: {
      id: 'oaibg-continuity-cancelled',
      responseId: 'resp_cancelled_1',
    },
    cancelled: true,
    message: 'Cancelled after restart.',
  })

  const persisted = getOpenAIThreadState(fixture.threadId)
  assert.equal(persisted?.chainValid, false)
  assert.equal(persisted?.chainInvalidReason, 'background_cancelled')

  const continuation = resolveOpenAIThreadContinuation({
    threadId: fixture.threadId,
    model: 'gpt-5.2',
    toolsetHash: 'tool-hash-4',
    systemPromptHash: 'prompt-hash-4',
    continuitySignature: 'sig-4',
    usePreviousResponseId: true,
    useConversationState: false,
  })

  assert.equal(continuation.chainValid, false)
  assert.equal(continuation.invalidReason, 'background_cancelled')
    assert.equal(continuation.previousResponseId, '')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
