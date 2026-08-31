import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getProviderRetryAfterSeconds,
  isProviderQuotaExceededError,
  isRetryableProviderError,
} from '../../src/main/api-clients/provider-policy.mjs'

test('quota exhaustion errors are detected and treated as non-retryable', () => {
  const err = new Error('You exceeded your current quota. Please retry in 22.997s.')
  err.statusCode = 429
  err.responseBody = JSON.stringify({
    error: {
      status: 'RESOURCE_EXHAUSTED',
      message: 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '22s' },
      ],
    },
  })

  assert.equal(isProviderQuotaExceededError(err), true)
  assert.equal(isRetryableProviderError(err), false)
  assert.equal(getProviderRetryAfterSeconds(err), 23)
})

test('transient 429 rate-limit errors remain retryable', () => {
  const err = new Error('Rate limit exceeded. Please retry later.')
  err.statusCode = 429
  assert.equal(isProviderQuotaExceededError(err), false)
  assert.equal(isRetryableProviderError(err), true)
})
