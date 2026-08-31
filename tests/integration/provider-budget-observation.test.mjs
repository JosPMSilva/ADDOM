import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-provider-budget-observation-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  normalizeProviderBudgetObservation,
} = await import('../../src/main/api-clients/provider-budget-observation.mjs')
const {
  createSharedStreamWithTools,
  __resetSharedStreamTextForTests,
  __setSharedStreamTextForTests,
} = await import('../../src/main/api-clients/ai-provider-adapter-core.mjs')
const { createProviderCredentialFingerprint } = await import('../../src/main/api-clients/provider-credential-fingerprint.mjs')
const {
  clearAllProviderBudgetProfiles,
  getProviderBudgetProfile,
} = await import('../../src/main/api-clients/provider-budget-store.mjs')
const { closeDb } = await import('../../src/main/memory/db.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

function createTestAdapter() {
  return {
    buildModel() {
      return { id: 'fake-model' }
    },
    buildProviderOptions() {
      return undefined
    },
    normalizeMessages({ messages }) {
      return Array.isArray(messages) ? messages : []
    },
    prepareContinuationMessages({ messages }) {
      return { messages: Array.isArray(messages) ? messages : [] }
    },
    prepareBackgroundTurn({ messages, modelId }) {
      return {
        eligible: false,
        reason: 'not_openai',
        messages: Array.isArray(messages) ? messages : [],
        modelId: String(modelId || '').trim(),
        openaiOptions: null,
      }
    },
  }
}

function createStreamResult({
  text = 'Done.',
  finishReason = 'stop',
  responseHeaders = null,
} = {}) {
  return {
    text: Promise.resolve(text),
    reasoningText: Promise.resolve(''),
    reasoning: Promise.resolve([]),
    toolCalls: Promise.resolve([]),
    finishReason: Promise.resolve(finishReason),
    usage: Promise.resolve(null),
    providerMetadata: Promise.resolve(null),
    response: Promise.resolve(
      responseHeaders
        ? { headers: responseHeaders, timestamp: new Date('2026-04-15T00:00:00.000Z') }
        : null
    ),
    warnings: Promise.resolve([]),
  }
}

test.afterEach(() => {
  __resetSharedStreamTextForTests()
  try { clearAllProviderBudgetProfiles() } catch { /* best-effort cleanup */ }
})

test.after(() => {
  try { closeDb() } catch { /* best-effort cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('provider budget observation normalizes Anthropic success headers into a stable record', () => {
  const observation = normalizeProviderBudgetObservation({
    providerId: 'anthropic',
    apiKey: 'sk-ant-success',
    modelId: 'claude-sonnet-4-6',
    observationSource: 'success_response',
    headers: new Headers({
      'anthropic-organization-id': 'org_success',
      'anthropic-ratelimit-input-tokens-limit': '30000',
      'anthropic-ratelimit-input-tokens-remaining': '1200',
      'anthropic-ratelimit-output-tokens-limit': '8000',
      'anthropic-ratelimit-output-tokens-remaining': '4000',
      'anthropic-ratelimit-requests-limit': '50',
      'anthropic-ratelimit-requests-remaining': '12',
    }),
    observedAt: 1_234,
  })

  assert.deepEqual(observation, {
    providerId: 'anthropic',
    organizationId: 'org_success',
    workspaceId: '',
    credentialFingerprint: createProviderCredentialFingerprint('anthropic', 'sk-ant-success'),
    observationSource: 'success_response',
    modelId: 'claude-sonnet-4-6',
    observedAt: 1_234,
    inputTpmLimit: 30_000,
    inputTpmRemaining: 1_200,
    outputTpmLimit: 8_000,
    outputTpmRemaining: 4_000,
    requestsPerMinuteLimit: 50,
    requestsRemaining: 12,
    retryAfterSeconds: 0,
    rawHeaders: {
      'anthropic-organization-id': 'org_success',
      'anthropic-ratelimit-input-tokens-limit': '30000',
      'anthropic-ratelimit-input-tokens-remaining': '1200',
      'anthropic-ratelimit-output-tokens-limit': '8000',
      'anthropic-ratelimit-output-tokens-remaining': '4000',
      'anthropic-ratelimit-requests-limit': '50',
      'anthropic-ratelimit-requests-remaining': '12',
    },
  })
})

test('provider budget observation normalizes retryable Anthropic 429 headers from error responses', () => {
  const error = new Error('Rate limit exceeded.')
  error.statusCode = 429
  error.responseHeaders = {
    'anthropic-organization-id': 'org_retry',
    'anthropic-ratelimit-input-tokens-limit': '30000',
    'retry-after': '7',
  }

  const observation = normalizeProviderBudgetObservation({
    providerId: 'anthropic',
    apiKey: 'sk-ant-retry',
    modelId: 'claude-sonnet-4-6',
    observationSource: 'rate_limit_error',
    error,
    observedAt: 2_468,
  })

  assert.equal(observation?.organizationId, 'org_retry')
  assert.equal(observation?.inputTpmLimit, 30_000)
  assert.equal(observation?.retryAfterSeconds, 7)
  assert.equal(observation?.observationSource, 'rate_limit_error')
})

test('shared anthropic stream persists success observations from response headers', async (t) => {
  try {
    __setSharedStreamTextForTests(async () => createStreamResult({
      text: 'Observed success.',
      responseHeaders: {
        'anthropic-organization-id': 'org_stream_success',
        'anthropic-ratelimit-input-tokens-limit': '30000',
        'anthropic-ratelimit-output-tokens-limit': '8000',
        'anthropic-ratelimit-requests-limit': '50',
      },
    }))

    const payload = await createSharedStreamWithTools({
      adapter: createTestAdapter(),
      providerId: 'anthropic',
      apiKey: 'sk-ant-stream-success',
      messages: [{ role: 'user', content: 'Hi' }],
      options: {
        model: 'claude-sonnet-4-6',
      },
    })

    assert.equal(payload.text, 'Observed success.')

    const stored = getProviderBudgetProfile({
      providerId: 'anthropic',
      organizationId: 'org_stream_success',
      credentialFingerprint: createProviderCredentialFingerprint('anthropic', 'sk-ant-stream-success'),
    })

    assert.equal(stored?.profileSource, 'observed_headers')
    assert.equal(stored?.confidence, 'observed_once')
    assert.equal(stored?.inputTpmLimit, 30_000)
    assert.equal(stored?.outputTpmLimit, 8_000)
    assert.equal(stored?.requestsPerMinuteLimit, 50)
    assert.equal(stored?.lastSuccessObservedAt > 0, true)
    assert.equal(stored?.lastRateLimitObservedAt, 0)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('shared anthropic stream persists retryable 429 observations before retry succeeds', async (t) => {
  try {
    let attempts = 0
    __setSharedStreamTextForTests(async () => {
      attempts += 1
      if (attempts === 1) {
        const error = new Error('Rate limit exceeded.')
        error.statusCode = 429
        error.responseHeaders = {
          'anthropic-organization-id': 'org_stream_retry',
          'anthropic-ratelimit-input-tokens-limit': '30000',
          'retry-after': '9',
        }
        throw error
      }
      return createStreamResult({ text: 'Recovered after retry.' })
    })

    const payload = await createSharedStreamWithTools({
      adapter: createTestAdapter(),
      providerId: 'anthropic',
      apiKey: 'sk-ant-stream-retry',
      messages: [{ role: 'user', content: 'Hi' }],
      options: {
        model: 'claude-sonnet-4-6',
      },
    })

    assert.equal(payload.text, 'Recovered after retry.')

    const stored = getProviderBudgetProfile({
      providerId: 'anthropic',
      organizationId: 'org_stream_retry',
      credentialFingerprint: createProviderCredentialFingerprint('anthropic', 'sk-ant-stream-retry'),
    })

    assert.equal(stored?.observationCount, 1)
    assert.equal(stored?.inputTpmLimit, 30_000)
    assert.equal(stored?.retryAfterSeconds, 9)
    assert.equal(stored?.lastSuccessObservedAt, 0)
    assert.equal(stored?.lastRateLimitObservedAt > 0, true)
    assert.equal(stored?.lastObservationSource, 'rate_limit_error')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
