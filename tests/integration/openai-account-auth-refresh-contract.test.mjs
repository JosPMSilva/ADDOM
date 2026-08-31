import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildOpenAIAccountExternalAuthRefreshError,
  normalizeOpenAIAccountAuthRefreshRequest,
} from '../../src/main/api-clients/ai-provider-openai-account-auth-refresh.mjs'

test('auth refresh contract accepts only the current unauthorized request shape', () => {
  assert.deepEqual(normalizeOpenAIAccountAuthRefreshRequest({
    reason: 'unauthorized',
    previousAccountId: 'account_1',
  }), {
    valid: true,
    reason: 'unauthorized',
    previousAccountId: 'account_1',
  })
  assert.deepEqual(normalizeOpenAIAccountAuthRefreshRequest({
    reason: 'unauthorized',
    previousAccountId: null,
  }), {
    valid: true,
    reason: 'unauthorized',
    previousAccountId: '',
  })
})

test('auth refresh contract rejects future reasons and expanded payloads', () => {
  assert.deepEqual(normalizeOpenAIAccountAuthRefreshRequest({
    reason: 'expired',
  }), {
    valid: false,
    failureReason: 'unsupported_refresh_reason',
  })
  assert.deepEqual(normalizeOpenAIAccountAuthRefreshRequest({
    reason: 'unauthorized',
    accessToken: 'must-not-cross',
  }), {
    valid: false,
    failureReason: 'unsupported_request_shape',
  })
})

test('managed account auth returns one explicit external-refresh capability error', () => {
  const error = buildOpenAIAccountExternalAuthRefreshError()
  assert.deepEqual(error, {
    code: -32001,
    message: 'OpenAI account authorization needs to be renewed in ADDOM.',
  })
  assert.equal(JSON.stringify(error).toLowerCase().includes('token'), false)
})
