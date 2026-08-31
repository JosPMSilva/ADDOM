import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-thread-state-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  closeDb,
  getDb,
} = await import('../../src/main/memory/db.mjs')
const {
  getOpenAIThreadState,
  resolveOpenAIThreadContinuation,
  upsertOpenAIThreadState,
} = await import('../../src/main/api-clients/openai-thread-state-service.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try {
    closeDb()
  } catch {
    // Best-effort cleanup only.
  }
})

test('openai thread state persists pending manual compacted windows for later WebSocket turns', async (t) => {
  let db
  try {
    db = getDb()
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }

  db.prepare('DELETE FROM openai_thread_state').run()

  const saved = upsertOpenAIThreadState({
    threadId: 'thread_ws_compaction',
    projectId: 'project_ws_compaction',
    providerId: 'openai',
    model: 'gpt-5.2',
    lastResponseId: '',
    conversationId: '',
    storeEnabled: true,
    toolsetHash: 'tool_hash_1',
    systemPromptHash: 'prompt_hash_1',
    continuitySignature: 'sig_1',
    lastCompactionId: 'cmp_ws_saved_1',
    chainValid: true,
    chainInvalidReason: '',
    metadata: {
      pendingManualCompactedWindow: [
        { type: 'message', id: 'msg_saved_1' },
        { type: 'compaction', id: 'cmp_saved_1', encrypted_content: 'enc_saved_1' },
      ],
      resetChainFromCompaction: true,
    },
  })

  assert.equal(saved?.metadata?.resetChainFromCompaction, true)
  assert.deepEqual(saved?.metadata?.pendingManualCompactedWindow, [
    { type: 'message', id: 'msg_saved_1' },
    { type: 'compaction', id: 'cmp_saved_1', encrypted_content: 'enc_saved_1' },
  ])

  const stored = getOpenAIThreadState('thread_ws_compaction')
  assert.equal(stored?.metadata?.resetChainFromCompaction, true)
  assert.deepEqual(stored?.metadata?.pendingManualCompactedWindow, [
    { type: 'message', id: 'msg_saved_1' },
    { type: 'compaction', id: 'cmp_saved_1', encrypted_content: 'enc_saved_1' },
  ])

  const continuation = resolveOpenAIThreadContinuation({
    threadId: 'thread_ws_compaction',
    model: 'gpt-5.2',
    toolsetHash: 'tool_hash_1',
    systemPromptHash: 'prompt_hash_1',
    continuitySignature: 'sig_1',
    usePreviousResponseId: true,
    useConversationState: false,
  })

  assert.equal(continuation.previousResponseId, '')
  assert.equal(continuation.conversationId, '')
  assert.equal(continuation.resetChainFromCompactedWindow, true)
  assert.deepEqual(continuation.manualCompactedWindow, [
    { type: 'message', id: 'msg_saved_1' },
    { type: 'compaction', id: 'cmp_saved_1', encrypted_content: 'enc_saved_1' },
  ])
})

test('openai thread continuation exposes pending provider-truncation resume metadata', async (t) => {
  let db
  try {
    db = getDb()
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }

  db.prepare('DELETE FROM openai_thread_state').run()

  upsertOpenAIThreadState({
    threadId: 'thread_provider_truncation_resume',
    projectId: 'project_provider_truncation_resume',
    providerId: 'openai',
    model: 'gpt-5.2',
    lastResponseId: 'resp_auto_1',
    conversationId: '',
    storeEnabled: true,
    toolsetHash: 'tool_hash_2',
    systemPromptHash: 'prompt_hash_2',
    continuitySignature: 'sig_2',
    lastCompactionId: 'cmp_auto_1',
    chainValid: true,
    chainInvalidReason: '',
    metadata: {
      pendingProviderTruncationResume: {
        eventType: 'provider_truncation',
        eventPhase: 'resumed_after',
        source: 'provider',
        confidence: 'explicit',
        providerId: 'openai',
        turnId: 'turn_auto_1',
        responseId: 'resp_auto_1',
        compactionIds: ['cmp_auto_1'],
      },
    },
  })

  const continuation = resolveOpenAIThreadContinuation({
    threadId: 'thread_provider_truncation_resume',
    model: 'gpt-5.2',
    toolsetHash: 'tool_hash_2',
    systemPromptHash: 'prompt_hash_2',
    continuitySignature: 'sig_2',
    usePreviousResponseId: true,
    useConversationState: false,
  })

  assert.equal(continuation.previousResponseId, 'resp_auto_1')
  assert.equal(continuation.pendingProviderTruncationResume?.eventType, 'provider_truncation')
  assert.equal(continuation.pendingProviderTruncationResume?.eventPhase, 'resumed_after')
  assert.equal(continuation.pendingProviderTruncationResume?.providerId, 'openai')
  assert.equal(continuation.pendingProviderTruncationResume?.turnId, 'turn_auto_1')
  assert.equal(continuation.pendingProviderTruncationResume?.responseId, 'resp_auto_1')
  assert.deepEqual(continuation.pendingProviderTruncationResume?.compactionIds, ['cmp_auto_1'])
})

test('openai thread continuation exposes account bridge identity and latest Codex compaction metadata', async (t) => {
  let db
  try {
    db = getDb()
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }

  db.prepare('DELETE FROM openai_thread_state').run()

  upsertOpenAIThreadState({
    threadId: 'thread_account_bridge_state',
    projectId: 'project_account_bridge_state',
    providerId: 'openai',
    model: 'gpt-5.4',
    lastResponseId: 'turn_account_bridge_1',
    conversationId: 'thr_account_bridge_1',
    storeEnabled: true,
    toolsetHash: 'tool_hash_account',
    systemPromptHash: 'prompt_hash_account',
    continuitySignature: 'sig_account',
    lastCompactionId: 'cmp_account_bridge_1',
    chainValid: true,
    chainInvalidReason: '',
    metadata: {
      accountBridgeThreadId: 'thr_account_bridge_1',
      accountBridgeProjectFolder: 'C:/Users/example/Desktop/test/P21',
      accountDynamicToolSignature: 'sig_account_bridge_1',
      accountDelegationBackend: 'openai_native',
      accountCollaborationModeId: 'default',
      accountContextCompactionGeneration: 4,
      latestCodexThreadCompaction: {
        eventType: 'codex_thread_compaction',
        eventPhase: 'applied',
        providerId: 'openai',
        turnId: 'turn_account_bridge_1',
        responseId: 'turn_account_bridge_1',
        compactionIds: ['cmp_account_bridge_1'],
      },
    },
  })

  const continuation = resolveOpenAIThreadContinuation({
    threadId: 'thread_account_bridge_state',
    model: 'gpt-5.4',
    toolsetHash: 'tool_hash_account',
    systemPromptHash: 'prompt_hash_account',
    continuitySignature: 'sig_account',
    usePreviousResponseId: true,
    useConversationState: false,
  })

  assert.equal(continuation.previousResponseId, 'turn_account_bridge_1')
  assert.equal(continuation.accountBridgeThreadId, 'thr_account_bridge_1')
  assert.equal(continuation.accountBridgeProjectFolder, 'C:/Users/example/Desktop/test/P21')
  assert.equal(continuation.accountDynamicToolSignature, 'sig_account_bridge_1')
  assert.equal(continuation.accountDelegationBackend, 'openai_native')
  assert.equal(continuation.accountCollaborationModeId, 'default')
  assert.equal(continuation.accountContextCompactionGeneration, 4)
  assert.equal(continuation.latestCodexThreadCompaction?.eventType, 'codex_thread_compaction')
  assert.equal(continuation.latestCodexThreadCompaction?.eventPhase, 'applied')
  assert.deepEqual(continuation.latestCodexThreadCompaction?.compactionIds, ['cmp_account_bridge_1'])
})

test('openai thread state persists continuity compatibility markers and invalidates on mismatch', async (t) => {
  let db
  try {
    db = getDb()
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }

  db.prepare('DELETE FROM openai_thread_state').run()

  upsertOpenAIThreadState({
    threadId: 'thread_account_marker_state',
    projectId: 'project_account_marker_state',
    providerId: 'openai',
    model: 'gpt-5.4',
    lastResponseId: 'resp_marker_1',
    conversationId: 'thr_marker_1',
    storeEnabled: true,
    toolsetHash: 'tool_hash_marker',
    systemPromptHash: 'prompt_hash_marker',
    continuitySignature: 'sig_marker',
    continuityEpoch: 4,
    continuityReducerVersion: 'thread_local_v1',
    modeSignature: 'mode_sig_marker',
    modelSignature: 'model_sig_marker',
    chainValid: true,
    chainInvalidReason: '',
  })

  const stored = getOpenAIThreadState('thread_account_marker_state')
  assert.equal(stored?.continuityEpoch, 4)
  assert.equal(stored?.continuityReducerVersion, 'thread_local_v1')
  assert.equal(stored?.modeSignature, 'mode_sig_marker')
  assert.equal(stored?.modelSignature, 'model_sig_marker')

  const valid = resolveOpenAIThreadContinuation({
    threadId: 'thread_account_marker_state',
    model: 'gpt-5.4',
    toolsetHash: 'tool_hash_marker',
    systemPromptHash: 'prompt_hash_marker',
    continuitySignature: 'sig_marker',
    continuityEpoch: 4,
    continuityReducerVersion: 'thread_local_v1',
    modeSignature: 'mode_sig_marker',
    modelSignature: 'model_sig_marker',
    usePreviousResponseId: true,
    useConversationState: false,
  })

  assert.equal(valid.chainValid, true)
  assert.equal(valid.continuityEpoch, 4)
  assert.equal(valid.continuityReducerVersion, 'thread_local_v1')
  assert.equal(valid.modeSignature, 'mode_sig_marker')
  assert.equal(valid.modelSignature, 'model_sig_marker')

  const invalid = resolveOpenAIThreadContinuation({
    threadId: 'thread_account_marker_state',
    model: 'gpt-5.4',
    toolsetHash: 'tool_hash_marker',
    systemPromptHash: 'prompt_hash_marker',
    continuitySignature: 'sig_marker',
    continuityEpoch: 5,
    continuityReducerVersion: 'thread_local_v1',
    modeSignature: 'mode_sig_marker',
    modelSignature: 'model_sig_marker',
    usePreviousResponseId: true,
    useConversationState: false,
  })

  assert.equal(invalid.chainValid, false)
  assert.equal(invalid.invalidReason, 'continuity_epoch_changed')
})
