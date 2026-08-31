import test from 'node:test'
import assert from 'node:assert/strict'

const {
  resolveVaultGetProvidersResponse,
  resolveVaultGetModelCapabilitiesResponse,
} = await import('../../src/main/ipc-handlers/vault-handler-helpers.mjs')

test('vault provider summary resolves OpenAI account session state from the account service', async () => {
  let accountReadOptions = null
  const rows = await resolveVaultGetProvidersResponse({ forceRefresh: false }, {
    listConfiguredProviders: () => ({ openai: true }),
    getProviderManifest: async () => ([{
      id: 'openai',
      name: 'OpenAI',
      noKeyRequired: false,
    }]),
    getSettings: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: (options) => {
      accountReadOptions = options
      return ({
      sessionSummary: {
        hasSession: true,
        status: 'connected',
        email: 'dev@example.com',
        label: 'dev@example.com',
        planType: 'pro',
        rateLimitSummary: { tier: 'pro' },
        availability: {
          supported: true,
          reason: '',
          message: '',
        },
      },
    })
    },
  })

  const openai = rows.find((row) => row.id === 'openai')
  assert.ok(openai)
  assert.equal(openai.authMethod, 'account')
  assert.equal(openai.hasApiKey, true)
  assert.equal(openai.hasAccountSession, true)
  assert.equal(openai.hasCredential, true)
  assert.equal(openai.accountStatus, 'connected')
  assert.equal(openai.accountEmail, 'dev@example.com')
  assert.equal(openai.accountPlanType, 'pro')
  assert.deepEqual(openai.rateLimitSummary, { tier: 'pro' })
  assert.equal(accountReadOptions?.refresh, true)
})

test('OpenAI API-key provider summary replaces static eligibility with live model-list evidence', async () => {
  const modelCalls = []
  const rows = await resolveVaultGetProvidersResponse({ forceRefresh: true }, {
    listConfiguredProviders: () => ({ openai: true }),
    getProviderManifest: async () => ([{
      id: 'openai',
      models: [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
    }]),
    getProviderModels: async (options) => {
      modelCalls.push(options)
      return [{
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        selectable: true,
        modelEligibility: {
          status: 'provider_listed',
          eligible: true,
          source: 'openai_models_api',
        },
      }]
    },
    getKey: () => 'sk-openai-test',
    getSettings: () => ({
      providerAuthSettings: {
        openai: { authMethod: 'api_key' },
      },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        availability: { supported: true },
        hasSession: false,
      },
    }),
    getCursorAgentState: () => ({
      runtime: { status: 'runtime_missing' },
      account: { status: 'unavailable' },
    }),
  })

  assert.deepEqual(modelCalls, [{
    providerId: 'openai',
    apiKey: 'sk-openai-test',
    forceRefresh: true,
  }])
  assert.equal(rows[0].models[0].modelEligibility.status, 'provider_listed')
})

test('vault model capabilities fail closed when account mode is selected without a session', async () => {
  const capabilities = await resolveVaultGetModelCapabilitiesResponse({
    providerId: 'openai',
    modelId: 'gpt-5',
    forceRefresh: false,
  }, {
    getSettings: () => ({
      providerAuthSettings: { openai: { authMethod: 'account' } },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: {
        hasSession: false,
        status: 'needs_login',
        availability: {
          supported: false,
          reason: 'bridge_unavailable',
          message: 'Bridge unavailable.',
        },
      },
    }),
  })

  assert.equal(capabilities.authMethod, 'account')
  assert.equal(capabilities.source, 'auth_blocked')
  assert.equal(capabilities.authBlockedReason, 'bridge_unavailable')
  assert.equal(capabilities.supportsTools, false)
  assert.match(capabilities.note, /Bridge unavailable/i)
})
