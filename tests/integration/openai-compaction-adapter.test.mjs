import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __resetOpenAICompactionClientFactoryForTests,
  __setOpenAICompactionClientFactoryForTests,
  applyOpenAIProviderNativeCompaction,
} from '../../src/main/chat/continuity/provider-native/openai-compaction-adapter.mjs'

test.beforeEach(() => {
  __resetOpenAICompactionClientFactoryForTests()
})

test.after(() => {
  __resetOpenAICompactionClientFactoryForTests()
})

test('openai compaction adapter compacts response chains and returns provider metadata', async () => {
  let capturedBody = null
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact(body) {
        capturedBody = body
        return {
          id: 'resp_cmp_1',
          output: [
            { type: 'message', id: 'msg_1' },
            { type: 'compaction', id: 'cmp_1', encrypted_content: 'enc_123' },
          ],
          usage: {
            input_tokens: 120,
            output_tokens: 5,
            output_tokens_details: { reasoning_tokens: 9 },
            total_tokens: 134,
          },
        }
      },
    },
  }))

  const result = await applyOpenAIProviderNativeCompaction({
    model: 'gpt-5.2',
    previousResponseId: 'resp_prev_1',
  })

  assert.deepEqual(capturedBody, {
    model: 'gpt-5.2',
    previous_response_id: 'resp_prev_1',
  })
  assert.equal(result.used, true)
  assert.equal(result.reason, 'compacted')
  assert.equal(result.compactionId, 'cmp_1')
  assert.deepEqual(result.compactionIds, ['cmp_1'])
  assert.deepEqual(result.compactedWindow, [
    { type: 'message', id: 'msg_1' },
    { type: 'compaction', id: 'cmp_1', encrypted_content: 'enc_123' },
  ])
  assert.equal(result.reference?.responseId, 'resp_cmp_1')
  assert.deepEqual(result.reference?.usage, {
    inputTokens: 120,
    outputTokens: 5,
    reasoningTokens: 9,
    totalTokens: 134,
  })
})

test('openai compaction adapter sanitizes oversized prompt cache keys before compact calls', async () => {
  let capturedBody = null
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact(body) {
        capturedBody = body
        return {
          id: 'resp_cmp_oversized_key',
          output: [
            { type: 'compaction', id: 'cmp_key_1', encrypted_content: 'enc_abc' },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 2,
            total_tokens: 12,
          },
        }
      },
    },
  }))

  const oversizedPromptCacheKey = 'addom:openai:project_1772487519187_766cfb14:thread_1772487519187_9201f0a3:gpt-5.1:3103e019f7f0a7ab'
  const result = await applyOpenAIProviderNativeCompaction({
    model: 'gpt-5.2',
    previousResponseId: 'resp_prev_key',
    promptCacheKey: oversizedPromptCacheKey,
  })

  assert.equal(result.used, true)
  assert.equal(typeof capturedBody?.prompt_cache_key, 'string')
  assert.equal(capturedBody.prompt_cache_key.length <= 64, true)
  assert.match(capturedBody.prompt_cache_key, /^addom:openai:ck:[0-9a-f]{40}$/)
})

test('openai compaction adapter reports missing compaction items from provider responses', async () => {
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        return {
          id: 'resp_cmp_missing_item',
          output: [{ type: 'message', id: 'msg_only_1' }],
          usage: {
            input_tokens: 10,
            output_tokens: 1,
            total_tokens: 11,
          },
        }
      },
    },
  }))

  const result = await applyOpenAIProviderNativeCompaction({
    model: 'gpt-5.2',
    previousResponseId: 'resp_prev_missing_item',
  })

  assert.equal(result.used, false)
  assert.equal(result.reason, 'missing_compaction_item')
  assert.deepEqual(result.compactedWindow, [{ type: 'message', id: 'msg_only_1' }])
})

test('openai compaction adapter returns provider_error metadata when compact calls fail', async () => {
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        const error = new Error('compaction unavailable')
        error.status = 429
        throw error
      },
    },
  }))

  const result = await applyOpenAIProviderNativeCompaction({
    model: 'gpt-5.2',
    previousResponseId: 'resp_prev_error',
  })

  assert.equal(result.used, false)
  assert.equal(result.reason, 'provider_error')
  assert.equal(result.reference?.stage, 'error')
  assert.equal(result.reference?.status, 429)
  assert.equal(result.reference?.message, 'compaction unavailable')
})
