import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildOpenAIAccountAttestationUnavailableError,
  buildOpenAIAccountCurrentTimeResponse,
} from '../../src/main/api-clients/ai-provider-openai-account-utility-requests.mjs'

test('current-time utility returns only whole Unix seconds for a scoped request', () => {
  assert.deepEqual(buildOpenAIAccountCurrentTimeResponse({
    threadId: 'thread_1',
  }, {
    now: () => 1_785_289_876_543,
  }), {
    valid: true,
    response: {
      currentTimeAt: 1_785_289_876,
    },
  })
})

test('current-time utility rejects malformed or expanded request shapes', () => {
  assert.deepEqual(buildOpenAIAccountCurrentTimeResponse({}), {
    valid: false,
    reason: 'missing_thread_id',
    response: null,
  })
  assert.deepEqual(buildOpenAIAccountCurrentTimeResponse({
    threadId: 'thread_1',
    locale: 'pt-PT',
  }), {
    valid: false,
    reason: 'unsupported_request_shape',
    response: null,
  })
})

test('attestation utility returns an explicit JSON-RPC capability error without a token', () => {
  assert.deepEqual(buildOpenAIAccountAttestationUnavailableError(), {
    code: -32601,
    message: 'Client attestation is not supported by ADDOM.',
  })
})
